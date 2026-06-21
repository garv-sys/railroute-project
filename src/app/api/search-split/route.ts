import { checkDirectTrains, findMultiSplitRoutes, findSmartRoutes } from '@/services/trainService';
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

function dateTimeMs(date: string, time: string) {
  const [year, month, day] = String(date || '').slice(0, 10).split('-').map((part) => parseInt(part, 10));
  const [hour, minute] = String(time || '00:00').split(':').map((part) => parseInt(part, 10));
  if (![year, month, day, hour, minute].every(Number.isFinite)) return NaN;
  return new Date(year, month - 1, day, hour, minute).getTime();
}

function formatLayover(ms: number) {
  const totalMinutes = Math.max(0, Math.round(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}

function rescueRouteKey(route: any) {
  return [
    route.hubStation,
    route.leg1?.trainNo,
    route.leg1?.departureDate || route.leg1?.journeyDate,
    route.leg2?.trainNo,
    route.leg2?.departureDate || route.leg2?.journeyDate,
  ].map((item) => String(item || '').toUpperCase()).join('|');
}

function rescueDisplayKey(route: any) {
  return [
    route.hubStation,
    route.leg1?.trainNo,
    route.leg2?.trainNo,
    route.layoverDuration,
  ].map((item) => String(item || '').toUpperCase()).join('|');
}

async function ckpJaipurRescueRoutes(date: string, classType: string, existingRoutes: any[] = []) {
  const existing = new Set(existingRoutes.map(rescueRouteKey));
  const displaySeen = new Set(existingRoutes.map(rescueDisplayKey));
  const hubs = ['NGP', 'NDLS'];
  const rescued: any[] = [];

  for (const hub of hubs) {
    const leg1Options = await withTimeout(
      checkDirectTrains('CKP', hub, date, classType, {
        fetchLive: false,
        liveLookupLimit: 0,
        exactStationOnly: false,
        providerPairLimit: 4,
        plannerLegTimeoutMs: 4500,
      }),
      5_500,
      []
    );

    for (const leg1 of leg1Options.slice(0, 5)) {
      const leg2SearchDates = Array.from(new Set([
        leg1.arrivalDate || leg1.journeyDate || date,
        leg1.arrivalDate ? new Date(new Date(leg1.arrivalDate).getTime() + 86400000).toISOString().slice(0, 10) : '',
      ].filter(Boolean)));

      for (const leg2Date of leg2SearchDates) {
        const leg2Options = await withTimeout(
          checkDirectTrains(hub, 'JP', leg2Date, classType, {
            fetchLive: false,
            liveLookupLimit: 0,
            exactStationOnly: false,
            providerPairLimit: 6,
            plannerLegTimeoutMs: 4500,
          }),
          5_500,
          []
        );

        for (const leg2 of leg2Options.slice(0, 10)) {
          const arrivalMs = dateTimeMs(leg1.arrivalDate || leg1.journeyDate || date, leg1.arrivalTime);
          let departureMs = dateTimeMs(leg2.departureDate || leg2.journeyDate || leg2Date, leg2.departureTime);
          while (Number.isFinite(arrivalMs) && Number.isFinite(departureMs) && departureMs < arrivalMs) {
            departureMs += 86400000;
          }
          const layoverMs = departureMs - arrivalMs;
          const layoverHours = layoverMs / 3600000;
          if (!Number.isFinite(layoverHours) || layoverHours < 1.5 || layoverHours > 18) continue;

          const route = {
            hubStation: hub,
            hubStationName: hub === 'NDLS' ? 'New Delhi (NDLS)' : 'Nagpur Junction (NGP)',
            layoverDuration: formatLayover(layoverMs),
            layoverHours,
            leg1Date: leg1.journeyDate,
            leg2Date: leg2.journeyDate,
            leg1DepartureDate: leg1.departureDate,
            leg1ArrivalDate: leg1.arrivalDate,
            leg2DepartureDate: leg2.departureDate,
            leg1Fare: 0,
            leg2Fare: 0,
            totalFare: 0,
            score: Math.max(48, 82 - Math.round(Math.max(0, layoverHours - 3) * 2)),
            leg1: { ...leg1, dataSource: `${(leg1 as any).dataSource || 'provider-backed'}; CKP-JP rescue leg` },
            leg2: { ...leg2, dataSource: `${(leg2 as any).dataSource || 'provider-backed'}; CKP-JP rescue leg` },
            combinedConfirmationChance: null,
          };
          const key = rescueRouteKey(route);
          const displayKey = rescueDisplayKey(route);
          if (!existing.has(key) && !displaySeen.has(displayKey)) {
            existing.add(key);
            displaySeen.add(displayKey);
            rescued.push(route);
          }
        }
      }
    }
  }

  return rescued
    .sort((a, b) => b.score - a.score || a.layoverHours - b.layoverHours)
    .slice(0, 12);
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
      maxSplitHubs: ckpRajasthanRequest ? 26 : 32,
      maxSplitLegOptions: ckpRajasthanRequest ? 24 : 28,
      maxSplitCandidates: ckpRajasthanRequest ? 260 : 360,
      maxSplitResults: ckpRajasthanRequest ? 28 : 15,
      minSplitResults: 5,
      maxMultiPlans: 0,
      maxMultiLegOptions: 0,
      maxMultiCandidates: 0,
      maxMultiResults: 0,
      plannerLegTimeoutMs: ckpRajasthanRequest ? 3200 : 4400,
      globalTimeoutMs: ckpRajasthanRequest ? 11500 : 18000,
      allowMixedClassSplits: true,
    } as const;

    let splitRoutes = await findSmartRoutes(source, destination, date, classType, directTrains, preferredHub, plannerOptions);
    if (ckpRajasthanRequest && String(destination || '').toUpperCase().trim() === 'JP' && splitRoutes.length < 5) {
      const rescued = await ckpJaipurRescueRoutes(date, classType, splitRoutes);
      splitRoutes = [...splitRoutes, ...rescued].slice(0, plannerOptions.maxSplitResults);
    }
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
        ckpRajasthanRequest ? 4_500 : 5_500,
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
