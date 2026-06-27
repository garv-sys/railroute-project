import { checkDirectTrains } from '@/services/trainService';
import { trustMetaForTrainList } from '@/lib/confidence';
import { apiFailure, apiSuccess, validationFailure } from '@/lib/api-response';

export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { source, destination, date, classType = "Any", quota = "GN", debug = false } = body;

    if (!source || !destination || !date) {
      return validationFailure('Missing required parameters');
    }

    const directTrains = await checkDirectTrains(source, destination, date, classType, { debug: Boolean(debug) }, quota);
    return apiSuccess({
      data: { directTrains },
      meta: trustMetaForTrainList(directTrains),
      extra: { directTrains },
    });
  } catch (error: any) {
    console.error('Search Direct API Error:', error);
    return apiFailure({ error: 'Internal server error', provider: 'RailRoute direct search API' });
  }
}
