import { checkDirectTrains } from '@/services/trainService';
import { trustMetaForTrainList } from '@/lib/confidence';
import { apiFailure, apiSuccess, validationFailure } from '@/lib/api-response';
import { getClientIp, isRateLimited } from '@/lib/rate-limiter';

export async function POST(request: Request) {
  const requestId = `tb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const ip = getClientIp(request);
  if (isRateLimited(`tb_${ip}`, 30, 60 * 1000)) {
    return apiFailure({
      error: "Too many requests. Please try again later.",
      requestId,
      status: 429,
      provider: "Rate Limiter",
    });
  }
  try {
    const { source, destination, date, classType = 'Any', debug = false } = await request.json();

    if (!source || !destination || !date) {
      return validationFailure('Missing source, destination, or date', requestId);
    }

    const query = {
      source: String(source).toUpperCase().trim(),
      destination: String(destination).toUpperCase().trim(),
      date: String(date),
      classType: String(classType),
    };
    const trains = await checkDirectTrains(
      query.source,
      query.destination,
      query.date,
      query.classType,
      { debug: true, fetchLive: false, liveLookupLimit: 0, exactStationOnly: false, providerPairLimit: 20, plannerLegTimeoutMs: 2500 }
    );

    if (!trains.length) {
      console.warn('[api/train-between] Empty provider result', { requestId, ...query });
      // Return a diagnostic payload to help trace the empty result
      return apiSuccess({
        requestId,
        data: { trains: [] },
        meta: trustMetaForTrainList(trains),
        extra: {
          note: "Diagnostics: empty trains list returned.",
          query,
          envApiKeyLength: process.env.IRCTC_API_KEY?.trim()?.length || 0,
        }
      });
    }

    const meta = trustMetaForTrainList(trains);
    return apiSuccess({ requestId, data: { trains }, meta, extra: { trains } });
  } catch (error: any) {
    console.error('[api/train-between] Error', { requestId, error });
    return apiFailure({ error: error?.message || 'Internal server error', requestId, provider: 'RailRoute train search API' });
  }
}
