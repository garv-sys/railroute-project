import { findMultiSplitRoutes, findSmartRoutes, enrichWithLiveAvailability } from '@/services/trainService';
import { buildTrustMeta } from '@/lib/confidence';
import { apiFailure, apiSuccess, validationFailure } from '@/lib/api-response';
import { getClientIp, isRateLimited } from '@/lib/rate-limiter';

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
    const { source, destination, date, classType = "Any", directTrains = [], budget, preferredHub = "", debug = false, quota = "GN" } = body;

    if (!source || !destination || !date) {
      return validationFailure('Missing required parameters', requestId);
    }

    const MAX_BOOKING_DAYS = 60;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const selectedDate = new Date(date);
    const daysFromToday = Math.round((selectedDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (daysFromToday < 0 || daysFromToday > MAX_BOOKING_DAYS) {
      return validationFailure('Booking window is 60 days. Please select an earlier date.', requestId);
    }

    const coverageMode = "quick" as const;
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
      maxSplitResults: 80,
      maxMultiPlans: 30,
      maxMultiLegOptions: 8,
      maxMultiCandidates: 150,
      maxMultiResults: 20,
      plannerLegTimeoutMs: 3500,
      globalTimeoutMs: 25000,
    } as const;

    const splitRoutes = await findSmartRoutes(source, destination, date, classType, directTrains, preferredHub, plannerOptions, quota);
    const multiSplitRoutes = splitRoutes.length >= 60
      ? []
      : await withTimeout(
          findMultiSplitRoutes(source, destination, date, classType, preferredHub, {
            ...plannerOptions,
            maxMultiPlans: 30,
            maxMultiLegOptions: 8,
            maxMultiCandidates: 150,
            maxMultiResults: 20,
          }, quota),
          1500,
          []
        );

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

    const LIVE_TOP_SPLIT = Math.min(diverseRoutes.length, 60);
    if (LIVE_TOP_SPLIT > 0) {
      const enrichDeadlineMs = 20000;
      const perRouteTimeoutMs = 15000;

      const enrichRoute = async (route: any) => {
        const legDate = route.leg1Date || route.leg2Date || date;
        try {
          const [leg1Enriched, leg2Enriched] = await Promise.all([
            withTimeout(
              enrichWithLiveAvailability(route.leg1, legDate, classType, { fetchLive: true, fetchAllClasses: false, debug: false }, quota),
              perRouteTimeoutMs,
              route.leg1
            ),
            withTimeout(
              enrichWithLiveAvailability(route.leg2, legDate, classType, { fetchLive: true, fetchAllClasses: false, debug: false }, quota),
              perRouteTimeoutMs,
              route.leg2
            ),
          ]);
          if (leg1Enriched?.trainNo) route.leg1 = leg1Enriched;
          if (leg2Enriched?.trainNo) route.leg2 = leg2Enriched;
        } catch (e) {
          console.warn(`[search-split] Enrichment failed for ${route.leg1?.trainNo}-${route.hubStation}-${route.leg2?.trainNo}:`, e);
        }
      };

      const timeRemaining = Math.max(2000, enrichDeadlineMs - (Date.now() - apiStartTime));
      await Promise.race([
        Promise.all(diverseRoutes.slice(0, LIVE_TOP_SPLIT).map(enrichRoute)),
        new Promise((resolve) => setTimeout(resolve, timeRemaining))
      ]);
    }

    const finalRoutes = diverseRoutes.filter(route => {
      const f1 = parseFareVal(route.leg1?.fare);
      const f2 = parseFareVal(route.leg2?.fare);
      if (f1 === 0 && f2 === 0) {
        console.log('[search-split] DROPPED both fares zero');
        return false;
      }
      return true;
    });

    console.log('[search-split] finalRoutes after filter:', finalRoutes.length);
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

    if (filteredSplitRoutes.length < 15) {
      console.log('[search-split] Need more routes, trying expanded search on original date only');
      const retryOptions = {
        ...plannerOptions,
        maxSplitHubs: Math.min(plannerOptions.maxSplitHubs + 100, 1000),
        maxSplitLegOptions: Math.min(plannerOptions.maxSplitLegOptions + 10, 120),
        maxSplitCandidates: Math.min(plannerOptions.maxSplitCandidates + 1000, 15000),
      };
      const retryRoutes = await findSmartRoutes(source, destination, date, classType, directTrains, preferredHub, retryOptions, quota);
      console.log('[search-split] retryRoutes from planner:', retryRoutes.length);
      const retryDiverse = getDiverseSplitRoutes(retryRoutes, 60);
      console.log('[search-split] retryDiverse after diversity filter:', retryDiverse.length);
      const existingKeys = new Set(filteredSplitRoutes.map(r => `${r.leg1?.trainNo}_${r.hubStation}_${r.leg2?.trainNo}`));

      for (const route of retryDiverse) {
        if (filteredSplitRoutes.length >= 15) break;
        const key = `${route.leg1?.trainNo}_${route.hubStation}_${route.leg2?.trainNo}`;
        if (existingKeys.has(key)) continue;
        
        if (isLegBlocked(route.leg1)) continue;
        if (isLegBlocked(route.leg2)) continue;
        
        const f1 = parseFareVal(route.leg1?.fare);
        const f2 = parseFareVal(route.leg2?.fare);
        if (f1 === 0 && f2 === 0) continue;

        filteredSplitRoutes.push(route);
        existingKeys.add(key);
      }
    }

    filteredSplitRoutes = filteredSplitRoutes.slice(0, 15);
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
