import { generateSplitCandidates } from '@/services/trainService';
import { apiFailure, apiSuccess, validationFailure } from '@/lib/api-response';
import { getClientIp, isRateLimited } from '@/lib/rate-limiter';
import { buildTrustMeta } from '@/lib/confidence';

export const dynamic = 'force-dynamic';


export async function POST(request: Request) {
  const requestId = `ssc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const ip = getClientIp(request);
  if (isRateLimited(`ssc_${ip}`, 20, 60 * 1000)) {
    return apiFailure({ error: 'Too many requests. Please try again later.', requestId, status: 429, provider: 'Rate Limiter' });
  }

  try {
    const body = await request.json();
    const { source, destination, date, classType = 'Any', quota = 'GN' } = body;

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

    const candidates = await generateSplitCandidates(source, destination, date, {
      globalTimeoutMs: 22000,
      plannerLegTimeoutMs: 3500,
      providerPairLimit: 2,
      fetchLive: false,
    }, 15);

    console.log(`[search-split-candidates] ${source}→${destination} on ${date}: ${candidates.length} candidates`);

    const meta = buildTrustMeta({
      source: 'fallback',
      provider: 'RailRoute split candidates',
      isLive: false,
      fallback: true,
    });

    return apiSuccess({
      data: { candidates },
      meta,
      requestId,
      extra: { candidates, count: candidates.length },
    });
  } catch (error: any) {
    console.error('[search-split-candidates] Error:', error);
    return apiFailure({ error: 'Internal server error', requestId, provider: 'RailRoute split candidates', status: 500 });
  }
}
