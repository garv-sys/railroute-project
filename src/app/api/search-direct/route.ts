import { checkDirectTrains, enrichWithLiveAvailability } from '@/services/trainService';
import { trustMetaForTrainList } from '@/lib/confidence';
import { apiFailure, apiSuccess, validationFailure } from '@/lib/api-response';
import { getClientIp, isRateLimited } from '@/lib/rate-limiter';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(request: Request) {
  const requestId = `sd_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const ip = getClientIp(request);
  if (isRateLimited(`sd_${ip}`, 30, 60 * 1000)) {
    return apiFailure({
      error: "Too many requests. Please try again later.",
      requestId,
      status: 429,
      provider: "Rate Limiter",
    });
  }

  try {
    const body = await request.json();
    const { source, destination, date, classType = "Any", quota = "GN", debug = false } = body;

    if (!source || !destination || !date) {
      return validationFailure('Missing required parameters', requestId);
    }

    const candidateTrains = await checkDirectTrains(source, destination, date, classType, { debug: Boolean(debug) }, quota);

    // Parallel live enrichment
    const verifiedTrains: any[] = [];
    const unverifiedTrains: any[] = [];

    await Promise.all(candidateTrains.map(async (train) => {
      try {
        const enriched = await enrichWithLiveAvailability(
          train,
          date,
          classType,
          { fetchLive: true, fetchAllClasses: false, debug: Boolean(debug) },
          quota
        );
        const t = enriched || train;
        const isVerified = t.availabilityStatus === 'VERIFIED' || t.fareStatus === 'VERIFIED';
        if (isVerified) {
          verifiedTrains.push(t);
        } else {
          unverifiedTrains.push(t);
        }
      } catch (e) {
        unverifiedTrains.push(train);
      }
    }));

    // Composite ranking: verified status first, then seat confirmation chance, duration, fare
    const rankTrain = (t: any) => {
      const isVerified = t.availabilityStatus === 'VERIFIED' ? 1 : 0;
      const chance = typeof t.confirmationChance === 'number' ? t.confirmationChance : 50;
      const fareNum = parseFloat(String(t.fare || '').replace(/[^\d.]/g, '')) || 99999;
      return (isVerified * 10000) + (chance * 10) - (fareNum * 0.01);
    };

    const sortedVerified = verifiedTrains.sort((a, b) => rankTrain(b) - rankTrain(a));
    const sortedUnverified = unverifiedTrains.sort((a, b) => rankTrain(b) - rankTrain(a));

    const finalDirectTrains = [...sortedVerified, ...sortedUnverified].slice(0, 15);

    return apiSuccess({
      requestId,
      data: { directTrains: finalDirectTrains, trains: finalDirectTrains },
      meta: trustMetaForTrainList(finalDirectTrains),
      extra: { directTrains: finalDirectTrains, trains: finalDirectTrains },
    });
  } catch (error: any) {
    console.error('Search Direct API Error:', error);
    return apiFailure({ error: error?.message || 'Internal server error', requestId, provider: 'RailRoute direct search API' });
  }
}
