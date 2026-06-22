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
    const { source, destination, date, classType = "Any", directTrains = [], budget, preferredHub = "", debug = false } = body;

    if (!source || !destination || !date) {
      return validationFailure('Missing required parameters', requestId);
    }

    const coverageMode = "quick" as const;
    const plannerOptions = {
      debug: Boolean(debug),
      fetchLive: false,
      liveLookupLimit: 0,
      coverageMode,
      exactStationOnly: false,
      providerPairLimit: 8,
      maxSplitHubs: 140,
      maxSplitLegOptions: 24,
      maxSplitCandidates: 1200,
      maxSplitResults: 25,
      maxMultiPlans: 0,
      maxMultiLegOptions: 0,
      maxMultiCandidates: 0,
      maxMultiResults: 0,
      plannerLegTimeoutMs: 2200,
      globalTimeoutMs: 9000,
    } as const;

    const splitRoutes = await findSmartRoutes(source, destination, date, classType, directTrains, preferredHub, plannerOptions);
    const multiSplitRoutes = splitRoutes.length >= 20
      ? []
      : await withTimeout(
          findMultiSplitRoutes(source, destination, date, classType, preferredHub, {
            ...plannerOptions,
            maxMultiPlans: 10,
            maxMultiLegOptions: 4,
            maxMultiCandidates: 80,
            maxMultiResults: 16,
          }),
          1500,
          []
        );

    const LIVE_TOP_N = Math.min(3, splitRoutes.length);
    console.log('[search-split] LIVE_TOP_N=', LIVE_TOP_N, 'splitRoutes.length=', splitRoutes.length);
    if (LIVE_TOP_N > 0) {
      const liveEnrichPromises = splitRoutes.slice(0, LIVE_TOP_N).flatMap((route) => {
        const legDate = route.leg1Date || route.leg2Date || date;
        return [
          enrichWithLiveAvailability(route.leg1, legDate, classType, { fetchLive: true, liveLookupLimit: 2, debug: false }),
          enrichWithLiveAvailability(route.leg2, legDate, classType, { fetchLive: true, liveLookupLimit: 2, debug: false }),
        ];
      });

      const liveEnrichResults = await Promise.allSettled(liveEnrichPromises);
      console.log('[search-split] liveEnrichResults count=', liveEnrichResults.length, 'fulfilled=', liveEnrichResults.filter(r => r.status === 'fulfilled').length);
      let liveFulfilled = 0;
      let liveRejected = 0;
      let liveRejectReasons: string[] = [];
      for (let i = 0; i < LIVE_TOP_N; i++) {
      const leg1Result = liveEnrichResults[i * 2];
      const leg2Result = liveEnrichResults[i * 2 + 1];
      if (leg1Result.status === 'fulfilled' && leg1Result.value?.trainNo) {
        liveFulfilled++;
        splitRoutes[i].leg1 = leg1Result.value;
      } else {
        liveRejected++;
        if (leg1Result.status === 'rejected') liveRejectReasons.push(String(leg1Result.reason || '').slice(0, 100));
      }
      if (leg2Result.status === 'fulfilled' && leg2Result.value?.trainNo) {
        liveFulfilled++;
        splitRoutes[i].leg2 = leg2Result.value;
      } else {
        liveRejected++;
        if (leg2Result.status === 'rejected') liveRejectReasons.push(String(leg2Result.reason || '').slice(0, 100));
      }
      const leg1Avail = String(splitRoutes[i].leg1?.availability || splitRoutes[i].leg1?.classAvailability?.[classType]?.[0]?.text || '');
      const leg2Avail = String(splitRoutes[i].leg2?.availability || splitRoutes[i].leg2?.classAvailability?.[classType]?.[0]?.text || '');
      if (leg1Avail.includes('Not Running') || leg2Avail.includes('Not Running') || leg1Avail.includes('not running')) {
        splitRoutes.splice(i, 1);
        i--;
      }
    }

    const LIVE_MULTI_N = Math.min(2, multiSplitRoutes.length);
    const multiLivePromises = multiSplitRoutes.slice(0, LIVE_MULTI_N).flatMap((route) => {
      const legs = route.legs || [];
      return legs.map((leg: any) => enrichWithLiveAvailability(leg, date, classType, { fetchLive: true, liveLookupLimit: 2, debug: false }));
    });

    const multiLiveResults = await Promise.allSettled(multiLivePromises);
    for (let i = 0; i < LIVE_MULTI_N; i++) {
      const legs = multiSplitRoutes[i].legs || [];
      for (let j = 0; j < legs.length; j++) {
        const result = multiLiveResults[i * legs.length + j];
        if (result.status === 'fulfilled' && result.value?.trainNo) {
          legs[j] = result.value;
        }
      }
    }

    const routeRecommendation = localRecommendation(directTrains, splitRoutes, multiSplitRoutes, budget);
    const meta = buildTrustMeta({
      source: 'fallback',
      provider: 'RailRoute split planner',
      isLive: false,
      splitRoute: true,
      fallback: true,
      warning: 'Split journeys are inferred from separate provider-backed train-leg searches.',
    });

    return apiSuccess({
      data: { splitRoutes, multiSplitRoutes, routeRecommendation },
      meta,
      requestId,
      extra: { 
        splitRoutes, 
        multiSplitRoutes, 
        routeRecommendation, 
        coverageMode, 
        canExpand: splitRoutes.length >= plannerOptions.maxSplitResults,
        debugLive: { liveFulfilled, liveRejected, liveRejectReasons: liveRejectReasons.slice(0, 5) }
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
