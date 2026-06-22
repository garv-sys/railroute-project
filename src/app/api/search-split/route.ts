import { findMultiSplitRoutes, findSmartRoutes, enrichWithLiveAvailability } from '@/services/trainService';
import { buildTrustMeta } from '@/lib/confidence';
import { apiFailure, apiSuccess, validationFailure } from '@/lib/api-response';
import { getClientIp, isRateLimited } from '@/lib/rate-limiter';

function localRecommendation(directTrains: any[], splitRoutes: any[], multiSplitRoutes: any[] = [], budget?: string) {
  const budgetNote = budget ? ` Budget filter requested: ${budget}.` : "";
  return `[LIVE_SPLIT_v2] Provider returned ${directTrains?.length || 0} direct train(s), ${splitRoutes?.length || 0} two-leg split option(s), and ${multiSplitRoutes?.length || 0} multi-leg split option(s).${budgetNote}`;
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

    const LIVE_TOP_SPLIT = Math.min(2, splitRoutes.length);
    if (LIVE_TOP_SPLIT > 0) {
      const liveEnrichPromises = splitRoutes.slice(0, LIVE_TOP_SPLIT).flatMap((route) => {
        const legDate = route.leg1Date || route.leg2Date || date;
        return [
          enrichWithLiveAvailability(route.leg1, legDate, classType, { fetchLive: false, liveLookupLimit: 2, debug: false }),
          enrichWithLiveAvailability(route.leg2, legDate, classType, { fetchLive: false, liveLookupLimit: 2, debug: false }),
        ];
      });

      const liveEnrichResults = await Promise.allSettled(liveEnrichPromises);
      for (let i = 0; i < LIVE_TOP_SPLIT; i++) {
        const leg1Result = liveEnrichResults[i * 2];
        const leg2Result = liveEnrichResults[i * 2 + 1];
        if (leg1Result.status === 'fulfilled' && leg1Result.value?.trainNo) {
          splitRoutes[i].leg1 = leg1Result.value;
        }
        if (leg2Result.status === 'fulfilled' && leg2Result.value?.trainNo) {
          splitRoutes[i].leg2 = leg2Result.value;
        }
        const leg1Avail = String(splitRoutes[i].leg1?.availability || splitRoutes[i].leg1?.classAvailability?.[classType]?.[0]?.text || '');
        const leg2Avail = String(splitRoutes[i].leg2?.availability || splitRoutes[i].leg2?.classAvailability?.[classType]?.[0]?.text || '');
        if (leg1Avail.includes('Not Running') || leg2Avail.includes('Not Running') || leg1Avail.includes('not running')) {
          splitRoutes.splice(i, 1);
          i--;
        }
      }
    }

    const LIVE_TOP_MULTI = Math.min(2, multiSplitRoutes.length);
    if (LIVE_TOP_MULTI > 0) {
      const multiLivePromises = multiSplitRoutes.slice(0, LIVE_TOP_MULTI).flatMap((route) => {
        const legs = route.legs || [];
        return legs.map((leg: any) => enrichWithLiveAvailability(leg, date, classType, { fetchLive: false, liveLookupLimit: 2, debug: false }));
      });

      const multiLiveResults = await Promise.allSettled(multiLivePromises);
      for (let i = 0; i < LIVE_TOP_MULTI; i++) {
        const legs = multiSplitRoutes[i].legs || [];
        for (let j = 0; j < legs.length; j++) {
          const result = multiLiveResults[i * legs.length + j];
          if (result.status === 'fulfilled' && result.value?.trainNo) {
            legs[j] = result.value;
          }
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
