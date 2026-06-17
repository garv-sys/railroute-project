import { getTrainSchedule } from '@/services/irctcService';
import { buildTrustMeta } from '@/lib/confidence';
import { apiFailure, apiSuccess, validationFailure } from '@/lib/api-response';

export async function POST(request: Request) {
  try {
    const { trainNo } = await request.json();
    if (!trainNo || !/^\d{4,5}$/.test(String(trainNo))) {
      return validationFailure('Enter a valid 4 to 5 digit train number.');
    }
    const schedule = await getTrainSchedule(trainNo);
    const cacheMeta = schedule?._cacheMeta;
    const legacyFields = { ...(schedule || {}) };
    delete legacyFields.success;
    delete legacyFields.data;
    delete legacyFields._cacheMeta;
    return apiSuccess({
      data: schedule?.data || schedule,
      meta: buildTrustMeta({
        source: cacheMeta ? 'cached' : 'live',
        provider: schedule?.provider || 'IRCTC-compatible schedule provider',
        isLive: !cacheMeta,
        asOf: cacheMeta?.asOf,
        expiresAt: cacheMeta?.expiresAt,
        warning: cacheMeta?.state === 'stale' ? 'Refreshing cached route schedule in the background.' : undefined,
      }),
      extra: legacyFields,
    });
  } catch {
    return apiFailure({ error: 'Internal server error', provider: 'RailRoute route API' });
  }
}
