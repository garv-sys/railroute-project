import { findMultiSplitRoutes, findSmartRoutes } from '@/services/trainService';
import { buildTrustMeta } from '@/lib/confidence';
import { apiFailure, apiSuccess, validationFailure } from '@/lib/api-response';
import { getClientIp, isRateLimited } from '@/lib/rate-limiter';

function localRecommendation(directTrains: any[], splitRoutes: any[], multiSplitRoutes: any[] = [], budget?: string) {
  const budgetNote = budget ? ` Budget filter requested: ${budget}.` : "";
  return `Provider returned ${directTrains?.length || 0} direct train(s), ${splitRoutes?.length || 0} two-leg split option(s), and ${multiSplitRoutes?.length || 0} multi-leg split option(s).${budgetNote}`;
}

const CKP_RAJASTHAN_DESTINATIONS = new Set(['JP', 'GADJ', 'AWR', 'JU', 'UDZ', 'BHL', 'AII', 'KOTA', 'SWM']);

function isCkpRajasthanRequest(source: unknown, destination: unknown) {
  return String(source || '').toUpperCase().trim() === 'CKP' &&
    CKP_RAJASTHAN_DESTINATIONS.has(String(destination || '').toUpperCase().trim());
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

    const ckpRajasthanRequest = isCkpRajasthanRequest(source, destination);
    const coverageMode = "quick" as const;
    const plannerOptions = {
      debug: Boolean(debug),
      fetchLive: false,
      liveLookupLimit: 0,
      coverageMode,
      exactStationOnly: false,
      providerPairLimit: 1,
      maxSplitHubs: ckpRajasthanRequest ? 38 : 32,
      maxSplitLegOptions: ckpRajasthanRequest ? 36 : 28,
      maxSplitCandidates: ckpRajasthanRequest ? 420 : 360,
      maxSplitResults: ckpRajasthanRequest ? 28 : 15,
      minSplitResults: 5,
      maxMultiPlans: 0,
      maxMultiLegOptions: 0,
      maxMultiCandidates: 0,
      maxMultiResults: 0,
      plannerLegTimeoutMs: ckpRajasthanRequest ? 4200 : 3800,
      globalTimeoutMs: ckpRajasthanRequest ? 15000 : 12500,
      allowMixedClassSplits: true,
    } as const;

    const splitRoutes = await findSmartRoutes(source, destination, date, classType, directTrains, preferredHub, plannerOptions);
    const multiSplitRoutes = splitRoutes.length >= 15
      ? []
      : await withTimeout(
        findMultiSplitRoutes(source, destination, date, classType, preferredHub, {
          ...plannerOptions,
          maxMultiPlans: ckpRajasthanRequest ? 18 : 14,
          maxMultiLegOptions: 5,
          maxMultiCandidates: ckpRajasthanRequest ? 150 : 120,
          maxMultiResults: ckpRajasthanRequest ? 18 : 12,
        }),
        ckpRajasthanRequest ? 6_000 : 4_500,
        []
      );
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
      extra: { splitRoutes, multiSplitRoutes, routeRecommendation, coverageMode, canExpand: splitRoutes.length >= plannerOptions.maxSplitResults },
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
