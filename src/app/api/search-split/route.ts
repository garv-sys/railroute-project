import { findMultiSplitRoutes, findSmartRoutes, enrichWithLiveAvailability, getFallbackMockFare, SPLIT_HUB_CORRIDORS } from '@/services/trainService';
import { validateBookingDate } from '@/lib/date-validation';
import { buildTrustMeta } from '@/lib/confidence';
import { apiFailure, apiSuccess, validationFailure } from '@/lib/api-response';
import { getClientIp, isRateLimited } from '@/lib/rate-limiter';

export const dynamic = 'force-dynamic';


function localRecommendation(directTrains: any[], splitRoutes: any[], multiSplitRoutes: any[] = [], budget?: string) {
  const budgetNote = budget ? ` Budget filter requested: ${budget}.` : "";
  return `Provider returned ${directTrains?.length || 0} direct train(s), ${splitRoutes?.length || 0} two-leg split option(s), and ${multiSplitRoutes?.length || 0} multi-leg split option(s).${budgetNote}`;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function POST(request: Request) {
  const apiStartTime = Date.now();
  const requestId = `ss_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const ip = getClientIp(request);
  if (isRateLimited(`ss_${ip}`, 15, 60 * 1000)) {
    return apiFailure({
      error: "Too many requests. Please try again later.",
      requestId,
      status: 429,
      provider: "Rate Limiter",
    });
  }
  try {
    const body = await request.json();
    const { source, destination, date, classType = "Any", directTrains = [], budget, preferredHub = "", debug = false, quota = "GN", mode = "" } = body;

    if (!source || !destination || !date) {
      return validationFailure('Missing required parameters', requestId);
    }

    const dateValidation = validateBookingDate(date);
    if (!dateValidation.valid) {
      return validationFailure(dateValidation.error || 'Invalid date', requestId);
    }

    const coverageMode = (mode === 'full' ? 'full' : 'quick') as 'quick' | 'full';
    const plannerOptions = {
      debug: Boolean(debug),
      fetchLive: false,
      liveLookupLimit: 0,
      coverageMode,
      exactStationOnly: false,
      providerPairLimit: 8,
      maxSplitHubs: 500,
      maxSplitLegOptions: 80,
      maxSplitCandidates: 8000,
      maxSplitResults: 120,
      maxMultiPlans: 30,
      maxMultiLegOptions: 8,
      maxMultiCandidates: 150,
      maxMultiResults: 20,
      plannerLegTimeoutMs: 8000,
      globalTimeoutMs: 40000,
    } as const;

    const [splitRoutes, multiSplitRoutes] = await Promise.all([
      findSmartRoutes(source, destination, date, classType, directTrains, preferredHub, plannerOptions, quota),
      withTimeout(
        findMultiSplitRoutes(source, destination, date, classType, preferredHub, {
          ...plannerOptions,
          maxMultiPlans: 30,
          maxMultiLegOptions: 8,
          maxMultiCandidates: 150,
          maxMultiResults: 20,
        }, quota),
        7500,
        []
      )
    ]);

    console.log('[search-split] source=', source, 'dest=', destination, 'date=', date, 'classType=', classType, 'quota=', quota);
    console.log('[search-split] splitRoutes from planner:', splitRoutes.length);
    console.log('[search-split] multiSplitRoutes from planner:', multiSplitRoutes.length);

    const isProviderBookingBlocked = (value: unknown) => {
      return /not available for booking|not bookable|train not on scheduled date|not scheduled|not running|class does not exist|class not available|class not returned|does not exist in this train|cancelled/i.test(String(value || ""));
    };

    const isLegBlocked = (leg: any) => {
      if (!leg) return true;
      const availText = String(leg.availability || "").toUpperCase();
      const reason = String(leg.lookupReason || "").toUpperCase();
      return isProviderBookingBlocked(availText) || isProviderBookingBlocked(reason);
    };

    const parseFareVal = (fareStrOrNum: any) => {
      if (typeof fareStrOrNum === 'number') return fareStrOrNum;
      const fareStr = String(fareStrOrNum || '').trim();
      if (/fail|error|unavailable|booking|between|cooldown|not|reason|exception/i.test(fareStr)) {
        return 0;
      }
      const match = fareStr.match(/(?:₹\s*)?(\d+(?:[.,]\d+)?)/);
      if (match) {
        return Math.round(Number(match[1].replace(/,/g, ''))) || 0;
      }
      return 0;
    };

    const cleanTrain = (no: string) => String(no || '').trim().replace(/\D/g, '');
    const directTrainNos = new Set((directTrains || []).map((t: any) => cleanTrain(t.trainNo || t.train_no)).filter(Boolean));

    const getDiverseSplitRoutes = (routes: any[], limit = 40) => {
      // 1. Exclude direct train numbers from split legs
      const validCandidates = routes.filter((r) => {
        const t1 = cleanTrain(r.leg1?.trainNo);
        const t2 = cleanTrain(r.leg2?.trainNo);
        if (!t1 || !t2) return false;
        if (t1 === t2) return false;
        if (directTrainNos.has(t1) || directTrainNos.has(t2)) return false;
        return true;
      });

      // 2. Group candidates by city/terminal cluster
      const routesByCluster = new Map<string, any[]>();
      for (const r of validCandidates) {
        const hubCode = String(r.hubStation || "").toUpperCase();
        const cluster = SPLIT_HUB_CORRIDORS[hubCode] || hubCode;
        if (!routesByCluster.has(cluster)) {
          routesByCluster.set(cluster, []);
        }
        routesByCluster.get(cluster)!.push(r);
      }

      for (const list of routesByCluster.values()) {
        list.sort((a, b) => (b.score || 0) - (a.score || 0));
      }

      // 3. Dynamically select top 5 distinct hub clusters by best candidate score
      const clusterRankings = Array.from(routesByCluster.entries()).map(([cluster, list]) => ({
        cluster,
        bestScore: list[0]?.score || 0,
        list,
      }));
      clusterRankings.sort((a, b) => b.bestScore - a.bestScore);
      const topClusters = clusterRankings.slice(0, 5).map((c) => c.cluster);

      const selected: any[] = [];
      const selectedKeys = new Set<string>();
      const stationCounts = new Map<string, number>();
      const clusterCounts = new Map<string, number>();
      const trainCounts = new Map<string, number>();

      // Pass 1: Soft target distribution (~3 results per top-5 hub cluster)
      const targetPerCluster = 3;
      let addedInPass = true;
      let round = 0;

      while (selected.length < limit && addedInPass && round < targetPerCluster) {
        addedInPass = false;
        for (const cluster of topClusters) {
          if (selected.length >= limit) break;
          const list = routesByCluster.get(cluster) || [];
          const currentClusterCount = clusterCounts.get(cluster) || 0;
          if (currentClusterCount >= targetPerCluster) continue;

          const cand = list.find((r) => {
            const t1 = cleanTrain(r.leg1?.trainNo);
            const t2 = cleanTrain(r.leg2?.trainNo);
            const key = `${t1}_${r.hubStation}_${t2}`;
            if (selectedKeys.has(key)) return false;

            const stCount = stationCounts.get(r.hubStation) || 0;
            if (stCount >= 2) return false;

            const t1Count = trainCounts.get(t1) || 0;
            const t2Count = trainCounts.get(t2) || 0;
            if (t1Count >= 3 || t2Count >= 3) return false;

            return true;
          });

          if (cand) {
            const t1 = cleanTrain(cand.leg1?.trainNo);
            const t2 = cleanTrain(cand.leg2?.trainNo);
            const key = `${t1}_${cand.hubStation}_${t2}`;

            selected.push(cand);
            selectedKeys.add(key);
            stationCounts.set(cand.hubStation, (stationCounts.get(cand.hubStation) || 0) + 1);
            clusterCounts.set(cluster, (clusterCounts.get(cluster) || 0) + 1);
            trainCounts.set(t1, (trainCounts.get(t1) || 0) + 1);
            trainCounts.set(t2, (trainCounts.get(t2) || 0) + 1);
            addedInPass = true;
          }
        }
        round++;
      }

      // Pass 2: Spillover to reach limit (up to 15) if some top hub clusters had fewer than 3 options
      if (selected.length < limit) {
        let spilloverAdded = true;
        let spilloverRound = 0;
        while (selected.length < limit && spilloverAdded && spilloverRound < 5) {
          spilloverAdded = false;
          for (const cluster of topClusters) {
            if (selected.length >= limit) break;
            const list = routesByCluster.get(cluster) || [];
            const currentClusterCount = clusterCounts.get(cluster) || 0;
            if (currentClusterCount >= 5) continue; // max 5 per cluster in spillover

            const cand = list.find((r) => {
              const t1 = cleanTrain(r.leg1?.trainNo);
              const t2 = cleanTrain(r.leg2?.trainNo);
              const key = `${t1}_${r.hubStation}_${t2}`;
              if (selectedKeys.has(key)) return false;
              return true;
            });

            if (cand) {
              const t1 = cleanTrain(cand.leg1?.trainNo);
              const t2 = cleanTrain(cand.leg2?.trainNo);
              const key = `${t1}_${cand.hubStation}_${t2}`;

              selected.push(cand);
              selectedKeys.add(key);
              stationCounts.set(cand.hubStation, (stationCounts.get(cand.hubStation) || 0) + 1);
              clusterCounts.set(cluster, (clusterCounts.get(cluster) || 0) + 1);
              trainCounts.set(t1, (trainCounts.get(t1) || 0) + 1);
              trainCounts.set(t2, (trainCounts.get(t2) || 0) + 1);
              spilloverAdded = true;
            }
          }
          spilloverRound++;
        }
      }

      return selected;
    };

    const diverseRoutes = getDiverseSplitRoutes(splitRoutes, 40);
    console.log('[search-split] diverseRoutes after diversity filter:', diverseRoutes.length);

    const verifiedRoutes: any[] = [];
    const unverifiedRoutes: any[] = [];

    if (diverseRoutes.length > 0) {
      console.log(`[search-split] Starting parallel enrichment of ${diverseRoutes.length} candidates...`);
      const perRouteTimeoutMs = 6000;

      await Promise.all(diverseRoutes.map(async (route) => {
        if (isLegBlocked(route.leg1) || isLegBlocked(route.leg2)) return;

        const leg1Date = route.leg1Date || date;
        const leg2Date = route.leg2Date || route.leg1Date || date;
        try {
          const [leg1Enriched, leg2Enriched] = await Promise.all([
            withTimeout(
              enrichWithLiveAvailability(route.leg1, leg1Date, classType, { fetchLive: true, fetchAllClasses: false, debug: false }, quota),
              perRouteTimeoutMs,
              route.leg1
            ),
            withTimeout(
              enrichWithLiveAvailability(route.leg2, leg2Date, classType, { fetchLive: true, fetchAllClasses: false, debug: false }, quota),
              perRouteTimeoutMs,
              route.leg2
            ),
          ]);
          if (leg1Enriched?.trainNo) route.leg1 = leg1Enriched;
          if (leg2Enriched?.trainNo) route.leg2 = leg2Enriched;

          const isLeg1Blocked = isLegBlocked(route.leg1);
          const isLeg2Blocked = isLegBlocked(route.leg2);
          if (isLeg1Blocked || isLeg2Blocked) {
            console.log(`[search-split] Dropping blocked split: ${route.leg1?.trainNo}-${route.hubStation}-${route.leg2?.trainNo} (leg1blocked=${isLeg1Blocked}, leg2blocked=${isLeg2Blocked})`);
            return;
          }

          let f1 = parseFareVal(route.leg1?.fare);
          let f2 = parseFareVal(route.leg2?.fare);
          if (f1 === 0) f1 = getFallbackMockFare(route.leg1?.trainNo, route.leg1?.source, route.leg1?.destination, classType || '3A');
          if (f2 === 0) f2 = getFallbackMockFare(route.leg2?.trainNo, route.leg2?.source, route.leg2?.destination, classType || '3A');
          route.totalFare = f1 + f2;
          if (route.leg1) route.leg1.fare = `₹${f1}`;
          if (route.leg2) route.leg2.fare = `₹${f2}`;

          const isLeg1Verified = route.leg1?.availabilityStatus === 'VERIFIED';
          const isLeg2Verified = route.leg2?.availabilityStatus === 'VERIFIED';

          if (isLeg1Verified && isLeg2Verified) {
            verifiedRoutes.push(route);
          } else {
            const leg1HasResponse = route.leg1?.availabilityStatus && route.leg1.availabilityStatus !== 'PROVIDER_UNAVAILABLE';
            const leg2HasResponse = route.leg2?.availabilityStatus && route.leg2.availabilityStatus !== 'PROVIDER_UNAVAILABLE';
            const isLeg1FarOut = String(route.leg1?.lookupReason).includes("opens closer to travel");
            const isLeg2FarOut = String(route.leg2?.lookupReason).includes("opens closer to travel");
            // Include PROVIDER_UNAVAILABLE routes too — for sparse routes (small stations, thin corridors)
            // the provider simply can't confirm seats, but the trains exist and should be shown
            const leg1Acceptable = leg1HasResponse || isLeg1FarOut || route.leg1?.availabilityStatus === 'PROVIDER_UNAVAILABLE';
            const leg2Acceptable = leg2HasResponse || isLeg2FarOut || route.leg2?.availabilityStatus === 'PROVIDER_UNAVAILABLE';
            if (leg1Acceptable && leg2Acceptable) {
              unverifiedRoutes.push(route);
            }
          }
        } catch (e) {
          console.warn(`[search-split] Enrichment failed for ${route.leg1?.trainNo}-${route.hubStation}-${route.leg2?.trainNo}:`, e);
        }
      }));
    }

    const finalRoutes = [...verifiedRoutes, ...unverifiedRoutes].map(route => {
      let f1 = parseFareVal(route.leg1?.fare);
      let f2 = parseFareVal(route.leg2?.fare);
      if (f1 === 0) {
        f1 = getFallbackMockFare(route.leg1?.trainNo, route.leg1?.source, route.leg1?.destination, classType || '3A');
        if (route.leg1) {
          route.leg1.fare = `₹${f1}`;
          route.leg1.fareStatus = 'estimated';
        }
      }
      if (f2 === 0) {
        f2 = getFallbackMockFare(route.leg2?.trainNo, route.leg2?.source, route.leg2?.destination, classType || '3A');
        if (route.leg2) {
          route.leg2.fare = `₹${f2}`;
          route.leg2.fareStatus = 'estimated';
        }
      }
      route.totalFare = f1 + f2;
      return route;
    });

    // Score and Rank 2-leg splits
    const scoredRoutes = finalRoutes.map((route: any) => {
      const isLeg1Verified = route.leg1?.availabilityStatus === 'VERIFIED';
      const isLeg2Verified = route.leg2?.availabilityStatus === 'VERIFIED';
      const isVerified = isLeg1Verified && isLeg2Verified;

      let durationMinutes = Number(route.totalDurationMinutes || route.durationMinutes || 0);
      if (!durationMinutes && route.leg1 && route.leg2) {
        const getMinutes = (durStr: string) => {
          const str = String(durStr || '').trim();
          if (str.includes(':')) {
            const cleanStr = str.split(/\s+/)[0];
            const parts = cleanStr.split(':').map(Number);
            if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
              return parts[0] * 60 + parts[1];
            }
          }
          const match = str.match(/(\d+)\s*h\s*(\d+)?/i);
          if (match) {
            const h = Number(match[1]);
            const m = Number(match[2] || 0);
            return h * 60 + m;
          }
          const minsMatch = str.match(/(\d+)\s*(?:m|min|minutes)/i);
          if (minsMatch) {
            return Number(minsMatch[1]);
          }
          const rawNum = Number(str);
          if (!isNaN(rawNum)) return rawNum;
          return 0;
        };
        const d1 = getMinutes(route.leg1.duration);
        const d2 = getMinutes(route.leg2.duration);
        const layover = Number(route.layoverMinutes || 0);
        durationMinutes = d1 + d2 + layover;
      }

      const transfers = 1;

      const getChance = (leg: any) => {
        if (!leg) return 0;
        if (typeof leg.confirmationChance === 'number') return leg.confirmationChance;
        const text = String(leg.availability || '').toUpperCase();
        if (text.includes('AVAILABLE') || text.includes('AVL') || text.includes('CNF') || text.includes('CONFIRM')) return 100;
        if (text.includes('RAC')) return 80;
        if (text.includes('WL') || text.includes('WAIT')) {
          const match = text.match(/(?:WL|WAITLIST)\s*(\d+)/i);
          if (match) {
            const num = Number(match[1]);
            return Math.max(10, 80 - num * 2);
          }
          return 40;
        }
        return 30;
      };

      const c1 = getChance(route.leg1);
      const c2 = getChance(route.leg2);
      const combinedChance = Math.round((c1 * c2) / 100);

      // Score weightings:
      // durationHours (-8 per hour), availability (+1.5 per percent chance), layover quality bonus (+25 for 45m-3.5h layover)
      const durationHours = durationMinutes / 60;
      const layoverMins = Number(route.layoverMinutes || 0);
      let layoverBonus = 0;
      if (layoverMins >= 45 && layoverMins <= 210) {
        layoverBonus = 25; // Sweet spot layover
      } else if (layoverMins < 30) {
        layoverBonus = -30; // Too tight / risky
      } else if (layoverMins > 480) {
        layoverBonus = -Math.round((layoverMins - 480) / 30) * 5; // Long wait
      }

      const blendedScore = (combinedChance * 1.5) - (durationHours * 8.0) + layoverBonus - (route.totalFare * 0.02);

      route.score = blendedScore;
      route.rankingFactors = {
        durationMinutes,
        transfers,
        fare: route.totalFare,
        availabilityStatus: isVerified ? 'VERIFIED' : 'UNVERIFIED',
        combinedConfirmationChance: combinedChance,
        blendedScore: Number(blendedScore.toFixed(2))
      };

      return route;
    });

    scoredRoutes.sort((a: any, b: any) => b.rankingFactors.blendedScore - a.rankingFactors.blendedScore);
    const filteredSplitRoutes = getDiverseSplitRoutes(scoredRoutes, 15);

    // Conditional 3-leg splits execution: only if 2-leg splits + direct combined is < 15
    const total2LegAndDirectCount = filteredSplitRoutes.length + directTrains.length;
    let filteredMultiSplitRoutes: any[] = [];

    if (total2LegAndDirectCount < 15 && multiSplitRoutes && multiSplitRoutes.length > 0) {
      console.log(`[search-split] 2-leg + direct count is ${total2LegAndDirectCount} (< 15). Running 3-leg split enrichment...`);
      const perRouteTimeoutMs = 6000;
      const LIVE_TOP_MULTI = Math.min(15, multiSplitRoutes.length);

      await Promise.all(multiSplitRoutes.slice(0, LIVE_TOP_MULTI).map(async (route, index) => {
        const legs = route.legs || [];
        if (legs.length === 0) return;
        try {
          const enrichedLegs = await Promise.all(
            legs.map((leg: any) =>
              withTimeout(
                enrichWithLiveAvailability(leg, date, classType, { fetchLive: true, fetchAllClasses: false, debug: false }, quota),
                perRouteTimeoutMs,
                leg
              )
            )
          );
          if (enrichedLegs.every(el => el?.trainNo)) {
            multiSplitRoutes[index].legs = enrichedLegs;
          }

          let totalFare = 0;
          for (let i = 0; i < route.legs.length; i++) {
            let f = parseFareVal(route.legs[i].fare);
            if (f === 0) f = getFallbackMockFare(route.legs[i].trainNo, route.legs[i].source, route.legs[i].destination, classType || '3A');
            route.legs[i].fare = `₹${f}`;
            totalFare += f;
          }
          route.totalFare = totalFare;
        } catch (e) {
          console.warn(`[search-split] Multi-leg enrichment failed for index ${index}:`, e);
        }
      }));

      const validMulti = multiSplitRoutes.filter(route => {
        const legs = route.legs || [];
        return legs.length > 0 && legs.every((leg: any) => {
          const isFarOut = String(leg.lookupReason).includes("opens closer to travel");
          return isFarOut || (leg.availabilityStatus && leg.availabilityStatus !== 'PROVIDER_UNAVAILABLE');
        });
      });

      const scoredMulti = validMulti.map((route: any) => {
        let durationMinutes = Number(route.totalDurationMinutes || route.durationMinutes || 0);
        if (!durationMinutes && route.legs) {
          const getMinutes = (durStr: string) => {
            const str = String(durStr || '').trim();
            if (str.includes(':')) {
              const cleanStr = str.split(/\s+/)[0];
              const parts = cleanStr.split(':').map(Number);
              if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
                return parts[0] * 60 + parts[1];
              }
            }
            const match = str.match(/(\d+)\s*h\s*(\d+)?/i);
            if (match) {
              const h = Number(match[1]);
              const m = Number(match[2] || 0);
              return h * 60 + m;
            }
            const minsMatch = str.match(/(\d+)\s*(?:m|min|minutes)/i);
            if (minsMatch) {
              return Number(minsMatch[1]);
            }
            const rawNum = Number(str);
            if (!isNaN(rawNum)) return rawNum;
            return 0;
          };
          durationMinutes = route.legs.reduce((sum: number, leg: any) => sum + getMinutes(leg.duration), 0) + Number(route.layoverMinutes || 0);
        }

        const transfers = route.legs.length - 1;

        const getChance = (leg: any) => {
          if (!leg) return 0;
          if (typeof leg.confirmationChance === 'number') return leg.confirmationChance;
          const text = String(leg.availability || '').toUpperCase();
          if (text.includes('AVAILABLE') || text.includes('AVL') || text.includes('CNF') || text.includes('CONFIRM')) return 100;
          if (text.includes('RAC')) return 80;
          if (text.includes('WL') || text.includes('WAIT')) {
            const match = text.match(/(?:WL|WAITLIST)\s*(\d+)/i);
            if (match) {
              const num = Number(match[1]);
              return Math.max(10, 80 - num * 2);
            }
            return 40;
          }
          return 30;
        };

        const chances = route.legs.map(getChance);
        const combinedChance = Math.round(chances.reduce((acc: number, c: number) => acc * c, 1) / Math.pow(100, chances.length - 1));

        const blendedScore = (combinedChance * 2.0) - (durationMinutes * 5.0) - (transfers * 250) - (route.totalFare * 0.05);

        route.rankingFactors = {
          durationMinutes,
          transfers,
          fare: route.totalFare,
          availabilityStatus: route.legs.every((l: any) => l.availabilityStatus === 'VERIFIED') ? 'VERIFIED' : 'UNVERIFIED',
          combinedConfirmationChance: combinedChance,
          blendedScore: Number(blendedScore.toFixed(2))
        };
        return route;
      });

      scoredMulti.sort((a: any, b: any) => b.rankingFactors.blendedScore - a.rankingFactors.blendedScore);
      filteredMultiSplitRoutes = scoredMulti.slice(0, 15);
    }

    const routeRecommendation = localRecommendation(directTrains, filteredSplitRoutes, filteredMultiSplitRoutes, budget);
    const meta = buildTrustMeta({
      source: 'live',
      provider: 'IRCTC-compatible provider',
      isLive: true,
      splitRoute: true,
      warning: 'Split journeys are inferred from separate provider-backed train-leg searches.',
    });

    return apiSuccess({
      data: { splitRoutes: filteredSplitRoutes, multiSplitRoutes: filteredMultiSplitRoutes, routeRecommendation },
      meta,
      requestId,
      extra: {
        splitRoutes: filteredSplitRoutes,
        multiSplitRoutes: filteredMultiSplitRoutes,
        routeRecommendation,
        coverageMode,
        canExpand: filteredSplitRoutes.length >= 15,
      },
    });
  } catch (error: any) {
    console.error('Search Split API Error:', error);
    return apiFailure({
      error: 'Internal server error',
      requestId,
      provider: 'RailRoute split planner',
      status: 500,
      trust: { splitRoute: true },
    });
  }
}
