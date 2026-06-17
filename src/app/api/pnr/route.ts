import { getPNR } from '@/services/irctcService';
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

async function handlePnrLookup(pnrValue: unknown, request: Request) {
  const requestId = `pnr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const ip = getClientIp(request);
  if (isRateLimited(`pnr_${ip}`, 10, 60 * 1000)) {
    return apiFailure({
      error: "Too many requests. Please try again later.",
      requestId,
      status: 429,
      provider: "Rate Limiter",
    });
  }
  try {
    const cleanPnr = String(pnrValue || '').replace(/\D/g, '');

    if (!cleanPnr || cleanPnr.length !== 10) {
      return validationFailure('Enter a valid 10-digit PNR.', requestId);
    }

    const pnrData = await getPNR(cleanPnr);
    if (!pnrData || pnrData.success === false) {
      console.warn('[api/pnr] Provider did not return usable PNR data', { requestId, pnr: cleanPnr, response: compact(pnrData) });
      const warning = pnrData?.error || 'PNR provider returned an empty response.';
      return apiFailure({
        error: warning,
        requestId,
        status: 200,
        provider: pnrData?.provider || 'IRCTC-compatible PNR provider',
        warning: pnrData?.error || 'PNR provider returned an empty response. No passenger status is shown without provider data.',
        trust: {
          source: 'fallback',
          isLive: false,
          fallback: true,
        },
        extra: { source: 'fallback', warning },
      });
    }

    console.info('[api/pnr] Provider response received', { requestId, pnr: cleanPnr, response: compact(pnrData) });
    return apiSuccess({
      requestId,
      data: pnrData.data || pnrData,
      meta: buildTrustMeta({ source: 'live', provider: pnrData.provider || 'IRCTC-compatible PNR provider', isLive: true }),
      extra: { source: pnrData.provider || 'provider' },
    });
  } catch (error: any) {
    console.error('[api/pnr] Error', { requestId, error });
    return apiFailure({ error: 'Internal server error', requestId, provider: 'RailRoute PNR API' });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    return handlePnrLookup(body?.pnr, request);
  } catch {
    return validationFailure('Enter a valid 10-digit PNR.');
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  return handlePnrLookup(searchParams.get('pnr'), request);
}
