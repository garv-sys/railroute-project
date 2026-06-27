import { enrichSplitCandidates } from '@/services/trainService';
import { buildTrustMeta } from '@/lib/confidence';
import { apiFailure, apiSuccess, validationFailure } from '@/lib/api-response';
import { getClientIp, isRateLimited } from '@/lib/rate-limiter';

export const dynamic = 'force-dynamic';


export async function POST(request: Request) {
  const requestId = `sse_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const ip = getClientIp(request);
  // Allow more frequent calls since each search triggers multiple batches
  if (isRateLimited(`sse_${ip}`, 40, 60 * 1000)) {
    return apiFailure({ error: 'Too many requests. Please try again later.', requestId, status: 429, provider: 'Rate Limiter' });
  }

  try {
    const body = await request.json();
    const { candidates, date, classType = 'Any', quota = 'GN' } = body;

    if (!candidates || !Array.isArray(candidates) || candidates.length === 0) {
      return validationFailure('Missing or empty candidates array', requestId);
    }
    if (!date) {
      return validationFailure('Missing required parameter: date', requestId);
    }

    const MAX_BOOKING_DAYS = 60;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const selectedDate = new Date(date);
    const daysFromToday = Math.round((selectedDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (daysFromToday < 0 || daysFromToday > MAX_BOOKING_DAYS) {
      return validationFailure('Booking window is 60 days. Please select an earlier date.', requestId);
    }

    // Safety: never process more than 10 at a time from one call
    const batchToProcess = candidates.slice(0, 10);

    const enriched = await enrichSplitCandidates(
      batchToProcess,
      date,
      classType,
      quota,
      { fetchLive: true, fetchAllClasses: false, debug: false },
    );

    const meta = buildTrustMeta({
      source: 'fallback',
      provider: 'RailRoute split enrich',
      isLive: true,
      splitRoute: true,
      fallback: false,
      warning: 'Split journeys are inferred from separate provider-backed train-leg searches.',
    });

    console.log(`[search-split-enrich] processed ${batchToProcess.length} candidates → ${enriched.length} valid routes`);

    return apiSuccess({
      data: { routes: enriched },
      meta,
      requestId,
      extra: { routes: enriched, processed: batchToProcess.length, valid: enriched.length },
    });
  } catch (error: any) {
    console.error('[search-split-enrich] Error:', error);
    return apiFailure({ error: 'Internal server error', requestId, provider: 'RailRoute split enrich', status: 500 });
  }
}
