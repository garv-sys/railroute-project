import { getLiveStatus } from '@/services/irctcService';
import { buildTrustMeta } from '@/lib/confidence';
import { apiFailure, apiSuccess, validationFailure } from '@/lib/api-response';
import { getClientIp, isRateLimited } from '@/lib/rate-limiter';

function compact(value: unknown) {
  try {
    const text = JSON.stringify(value);
    return text.length > 1400 ? `${text.slice(0, 1400)}...` : text;
  } catch {
    return String(value);
  }
}

export async function POST(request: Request) {
  const requestId = `live_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const ip = getClientIp(request);
  if (isRateLimited(`live_${ip}`, 10, 60 * 1000)) {
    return apiFailure({
      error: "Too many requests. Please try again later.",
      requestId,
      status: 429,
      provider: "Rate Limiter",
    });
  }
  try {
    const body = await request.json();
    const { trainNo, date } = body;

    if (!trainNo || !/^\d{4,5}$/.test(String(trainNo))) {
      return validationFailure('Enter a valid 4 to 5 digit train number.', requestId);
    }

    const liveData = await getLiveStatus(trainNo, date);
    if (!liveData || liveData.success === false) {
      console.warn('[api/live] Provider unavailable', { requestId, trainNo, date, response: compact(liveData) });
      const message = liveData?.error || 'Live train tracking provider is unavailable for this train/date right now.';
      return apiFailure({
        error: message,
        requestId,
        status: 200,
        provider: liveData?.provider || 'IRCTC-compatible live tracking provider',
        warning: message,
        trust: {
          source: 'fallback',
          isLive: false,
          fallback: true,
        },
        extra: { status: 'COMING_SOON', message },
      });
    }
    console.info('[api/live] Provider response received', { requestId, trainNo, date, response: compact(liveData) });
    return apiSuccess({
      requestId,
      data: liveData.data || liveData,
      meta: buildTrustMeta({ source: 'live', provider: liveData.provider || 'IRCTC-compatible live tracking provider', isLive: true }),
    });
  } catch (error: any) {
    console.error('[api/live] Error', { requestId, error });
    return apiFailure({
      error: 'Live train tracking provider unavailable.',
      requestId,
      provider: 'RailRoute live tracking API',
      extra: {
        status: 'COMING_SOON',
        message: 'Live train tracking is coming soon for this provider. Train search, PNR and fare tools still work.',
      },
    });
  }
}
