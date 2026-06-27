import { checkDirectTrains } from '@/services/trainService';
import { trustMetaForTrainList } from '@/lib/confidence';
import { apiFailure, apiSuccess, validationFailure } from '@/lib/api-response';
import { getClientIp, isRateLimited } from '@/lib/rate-limiter';

export const maxDuration = 30;

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
    const { source, destination, date, classType = 'Any', quota = 'GN' } = await request.json();

    if (!source || !destination || !date) {
      return validationFailure('Missing source, destination, or date', requestId);
    }

    const query = {
      source: String(source).toUpperCase().trim(),
      destination: String(destination).toUpperCase().trim(),
      date: String(date),
      classType: String(classType),
      quota: String(quota).toUpperCase().trim(),
    };
    const trains = await checkDirectTrains(
      query.source,
      query.destination,
      query.date,
      query.classType,
      {
        debug: true,
        fetchLive: true,
        liveLookupLimit: 15,
        fetchAllClasses: true,
        exactStationOnly: false,
        providerPairLimit: 20,
        plannerLegTimeoutMs: 4000
      },
      query.quota
    );

    const meta = trustMetaForTrainList(trains);
    return apiSuccess({ requestId, data: { trains }, meta, extra: { trains } });
  } catch (error: any) {
    console.error('[api/train-between] Error', { requestId, error });
    return apiFailure({ error: error?.message || 'Internal server error', requestId, provider: 'RailRoute train search API' });
  }
}
