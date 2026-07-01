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

    const diverseRoutes = getDiverseSplitRoutes(splitRoutes, 50);
    console.log('[search-split] diverseRoutes after diversity filter:', diverseRoutes.length);

    const verifiedRoutes: any[] = [];
    const unverifiedRoutes: any[] = [];

    if (diverseRoutes.length > 0) {
      const enrichDeadlineMs = 38000;
      const perRouteTimeoutMs = 12000;
      const batchSize = 10;

      for (let i = 0; i < diverseRoutes.length && verifiedRoutes.length < 15; i += batchSize) {
        const elapsed = Date.now() - apiStartTime;
        if (elapsed > enrichDeadlineMs) {
          console.log(`[search-split] Stopping enrichment early to prevent timeout. Elapsed: ${elapsed}ms`);
          break;
        }

        const batch = diverseRoutes.slice(i, i + batchSize);
        await Promise.all(batch.map(async (route) => {
          // CRITICAL: Use the correct date for each leg.
          // Leg1 always departs on the search date.
          // Leg2 may depart the next day (overnight connection) — use leg2Date.
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

            const isLeg1Verified = route.leg1?.availabilityStatus === 'VERIFIED';
            const isLeg2Verified = route.leg2?.availabilityStatus === 'VERIFIED';
            const isLeg1Blocked = isLegBlocked(route.leg1);
            const isLeg2Blocked = isLegBlocked(route.leg2);

            if (isLeg1Blocked || isLeg2Blocked) {
              // Train doesn't run on this date or class not available — drop it entirely
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

            if (isLeg1Verified && isLeg2Verified) {
              verifiedRoutes.push(route);
            } else {
              // Only keep unverified if IRCTC actually responded (not "no data")
              const leg1HasResponse = route.leg1?.availabilityStatus && route.leg1.availabilityStatus !== 'PROVIDER_UNAVAILABLE';
              const leg2HasResponse = route.leg2?.availabilityStatus && route.leg2.availabilityStatus !== 'PROVIDER_UNAVAILABLE';
              if (leg1HasResponse && leg2HasResponse) {
                unverifiedRoutes.push(route);
              }
            }
          } catch (e) {
            console.warn(`[search-split] Enrichment failed for ${route.leg1?.trainNo}-${route.hubStation}-${route.leg2?.trainNo}:`, e);
          }
        }));
      }
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

    console.log('[search-split] finalRoutes after fallback: ', finalRoutes.length);
    if (finalRoutes.length > 0) {
      console.log('[search-split] sample route:', {
        hub: finalRoutes[0].hubStation,
        t1: finalRoutes[0].leg1?.trainNo,
        t1fare: finalRoutes[0].leg1?.fare,
        t1avail: finalRoutes[0].leg1?.availability,
        t2: finalRoutes[0].leg2?.trainNo,
        t2fare: finalRoutes[0].leg2?.fare,
        t2avail: finalRoutes[0].leg2?.availability,
      });
    }

    let filteredSplitRoutes = finalRoutes.slice(0, 15);

    // If we don't have 15 verified results, do an expanded retry
    if (filteredSplitRoutes.length < 15) {
      console.log(`[search-split] Only ${filteredSplitRoutes.length} routes found, trying expanded search`);
      const retryOptions = {
        ...plannerOptions,
        maxSplitHubs: 1200,
        maxSplitLegOptions: 120,
        maxSplitCandidates: 15000,
      };
      const retryRoutes = await findSmartRoutes(source, destination, date, classType, directTrains, preferredHub, retryOptions, quota);
      console.log('[search-split] retryRoutes from planner:', retryRoutes.length);
      const retryDiverse = getDiverseSplitRoutes(retryRoutes, 80);
      console.log('[search-split] retryDiverse after diversity filter:', retryDiverse.length);
      const existingKeys = new Set(filteredSplitRoutes.map(r => `${r.leg1?.trainNo}_${r.hubStation}_${r.leg2?.trainNo}`));

      // Enrich retry routes to find verified ones
      const retryBatchSize = 8;
      for (let i = 0; i < retryDiverse.length && filteredSplitRoutes.length < 15; i += retryBatchSize) {
        const elapsed = Date.now() - apiStartTime;
        if (elapsed > 45000) break;
        const batch = retryDiverse.slice(i, i + retryBatchSize);
        await Promise.all(batch.map(async (route) => {
          if (filteredSplitRoutes.length >= 15) return;
          const key = `${route.leg1?.trainNo}_${route.hubStation}_${route.leg2?.trainNo}`;
          if (existingKeys.has(key)) return;
          if (isLegBlocked(route.leg1) || isLegBlocked(route.leg2)) return;

          const leg1Date = route.leg1Date || date;
          const leg2Date = route.leg2Date || route.leg1Date || date;
          try {
            const [l1e, l2e] = await Promise.all([
              withTimeout(enrichWithLiveAvailability(route.leg1, leg1Date, classType, { fetchLive: true, fetchAllClasses: false, debug: false }, quota), 10000, route.leg1),
              withTimeout(enrichWithLiveAvailability(route.leg2, leg2Date, classType, { fetchLive: true, fetchAllClasses: false, debug: false }, quota), 10000, route.leg2),
            ]);
            if (l1e?.trainNo) route.leg1 = l1e;
            if (l2e?.trainNo) route.leg2 = l2e;

            if (isLegBlocked(route.leg1) || isLegBlocked(route.leg2)) return;
            const leg1Verified = route.leg1?.availabilityStatus === 'VERIFIED';
            const leg2Verified = route.leg2?.availabilityStatus === 'VERIFIED';
            // Only add verified routes from retry — strict quality gate
            if (!leg1Verified || !leg2Verified) return;

            let f1 = parseFareVal(route.leg1?.fare);
            let f2 = parseFareVal(route.leg2?.fare);
            if (f1 === 0) f1 = getFallbackMockFare(route.leg1?.trainNo, route.leg1?.source, route.leg1?.destination, classType || '3A');
            if (f2 === 0) f2 = getFallbackMockFare(route.leg2?.trainNo, route.leg2?.source, route.leg2?.destination, classType || '3A');
            route.totalFare = f1 + f2;
            if (route.leg1) route.leg1.fare = `₹${f1}`;
            if (route.leg2) route.leg2.fare = `₹${f2}`;

            filteredSplitRoutes.push(route);
            existingKeys.add(key);
          } catch (e) {
            // skip
          }
        }));
      }
    }

    filteredSplitRoutes = filteredSplitRoutes.slice(0, 15);
    // Final ranking: highest confirmation chance first, then score, then lowest fare
    filteredSplitRoutes.sort((a: any, b: any) => {
      const aVerified = a.leg1?.availabilityStatus === 'VERIFIED' && a.leg2?.availabilityStatus === 'VERIFIED';
      const bVerified = b.leg1?.availabilityStatus === 'VERIFIED' && b.leg2?.availabilityStatus === 'VERIFIED';
      if (aVerified && !bVerified) return -1;
      if (!aVerified && bVerified) return 1;

      const chanceDiff = (b.combinedConfirmationChance ?? 0) - (a.combinedConfirmationChance ?? 0);
      if (chanceDiff !== 0) return chanceDiff;
      const scoreDiff = (b.score ?? 0) - (a.score ?? 0);
      if (scoreDiff !== 0) return scoreDiff;
      return (a.totalFare ?? 0) - (b.totalFare ?? 0);
    });
    console.log('[search-split] FINAL filteredSplitRoutes:', filteredSplitRoutes.length);

    const LIVE_TOP_MULTI = Math.min(15, multiSplitRoutes.length);
    if (LIVE_TOP_MULTI > 0) {
      const promises = multiSplitRoutes.slice(0, LIVE_TOP_MULTI).map(async (route, index) => {
        const legs = route.legs || [];
        try {
          const enrichedLegs = await Promise.all(
            legs.map((leg: any) => enrichWithLiveAvailability(leg, date, classType, { fetchLive: true, fetchAllClasses: false, debug: false }, quota))
          );
          if (enrichedLegs.every(el => el?.trainNo)) {
            multiSplitRoutes[index].legs = enrichedLegs;
          }
        } catch (e) {
          console.warn(`[search-split] Multi-leg enrichment failed for index ${index}`, e);
        }
      });

      const timeRemainingMulti = Math.max(500, Math.min(20000, 25000 - (Date.now() - apiStartTime)));
      await Promise.race([
        Promise.all(promises),
        new Promise((resolve) => setTimeout(resolve, timeRemainingMulti))
      ]);
    }

    const verifiedMulti = multiSplitRoutes.filter(route => {
      const legs = route.legs || [];
      return legs.length > 0 && legs.every((leg: any) => {
        const f = parseFareVal(leg.fare);
        const a = String(leg.availability || '').toUpperCase();
        const r = String(leg.lookupReason || '').toUpperCase();
        return f > 0 && !isProviderBookingBlocked(a) && !isProviderBookingBlocked(r);
      });
    });
    const unverifiedMulti = multiSplitRoutes.filter(route => {
      const legs = route.legs || [];
      return legs.length > 0 && !legs.every((leg: any) => {
        const f = parseFareVal(leg.fare);
        const a = String(leg.availability || '').toUpperCase();
        const r = String(leg.lookupReason || '').toUpperCase();
        return f > 0 && !isProviderBookingBlocked(a) && !isProviderBookingBlocked(r);
      });
    });
    const filteredMultiSplitRoutes = [...verifiedMulti, ...unverifiedMulti].slice(0, 20);

    const routeRecommendation = localRecommendation(directTrains, filteredSplitRoutes, filteredMultiSplitRoutes, budget);
    const meta = buildTrustMeta({
      source: 'fallback',
      provider: 'RailRoute split planner',
      isLive: false,
      splitRoute: true,
      fallback: true,
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
        canExpand: filteredSplitRoutes.length >= plannerOptions.maxSplitResults,
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
