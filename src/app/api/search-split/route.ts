import { findMultiSplitRoutes, findSmartRoutes, enrichWithLiveAvailability, getFallbackMockFare } from '@/services/trainService';
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

    const MAX_BOOKING_DAYS = 60;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const selectedDate = new Date(date);
    const daysFromToday = Math.round((selectedDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (daysFromToday < -2 || daysFromToday > MAX_BOOKING_DAYS + 2) {
      return validationFailure('Booking window is 60 days. Please select an earlier date.', requestId);
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
      const fareStr = String(fareStrOrNum || '');
      return Number(fareStr.replace(/[^\d.]/g, '')) || 0;
    };

    const cleanTrain = (no: string) => String(no || '').trim().replace(/\D/g, '');

    const getDiverseSplitRoutes = (routes: any[], limit = 50) => {
      const selected: any[] = [];
      const trainCounts = new Map<string, number>();
      const hubCounts = new Map<string, number>();

      let remaining = [...routes];

      while (selected.length < limit && remaining.length > 0) {
        const scoredRemaining = remaining.map((r) => {
          const t1 = cleanTrain(r.leg1?.trainNo);
          const t2 = cleanTrain(r.leg2?.trainNo);
          const t1Rep = trainCounts.get(t1) || 0;
          const t2Rep = trainCounts.get(t2) || 0;
          const penalty = (t1Rep + t2Rep) * 10;
          return { route: r, score: (r.score || 0) - penalty };
        });

        scoredRemaining.sort((a, b) => b.score - a.score);
        const bestItem = scoredRemaining[0];
        const r = bestItem.route;

        remaining = remaining.filter((x) => x !== r);

        const t1 = cleanTrain(r.leg1?.trainNo);
        const t2 = cleanTrain(r.leg2?.trainNo);
        if (!t1 || !t2) continue;

        const hub = r.hubStation;
        const hubCount = hubCounts.get(hub) || 0;
        if (hubCount >= 12) continue;

        const t1Count = trainCounts.get(t1) || 0;
        const t2Count = trainCounts.get(t2) || 0;
        if (t1Count >= 8 && t2Count >= 8) continue;

        selected.push(r);
        hubCounts.set(hub, hubCount + 1);
        trainCounts.set(t1, t1Count + 1);
        trainCounts.set(t2, t2Count + 1);
      }

      return selected;
    };

    const diverseRoutes = getDiverseSplitRoutes(splitRoutes, 20);
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

            if ((leg1HasResponse || isLeg1FarOut) && (leg2HasResponse || isLeg2FarOut)) {
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
          const match = String(durStr || '').match(/(\d+)\s*h\s*(\d+)?/i);
          if (match) {
            const h = Number(match[1]);
            const m = Number(match[2] || 0);
            return h * 60 + m;
          }
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

      // Score weightings: duration (-5 per minute), transfers (-250), availability (+2 per percent chance), fare (-0.05 per rupee)
      const blendedScore = (combinedChance * 2.0) - (durationMinutes * 5.0) - (transfers * 250) - (route.totalFare * 0.05);

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
    const filteredSplitRoutes = scoredRoutes.slice(0, 15);

    // Conditional 3-leg splits execution: only if 2-leg splits + direct combined is < 15
    const total2LegAndDirectCount = filteredSplitRoutes.length + directTrains.length;
    let filteredMultiSplitRoutes: any[] = [];

    if (total2LegAndDirectCount < 15 && multiSplitRoutes && multiSplitRoutes.length > 0) {
      console.log(`[search-split] 2-leg + direct count is ${total2LegAndDirectCount} (< 15). Running 3-leg split enrichment...`);
      const perRouteTimeoutMs = 6000;
      const LIVE_TOP_MULTI = Math.min(10, multiSplitRoutes.length);

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
            const match = String(durStr || '').match(/(\d+)\s*h\s*(\d+)?/i);
            if (match) {
              const h = Number(match[1]);
              const m = Number(match[2] || 0);
              return h * 60 + m;
            }
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
