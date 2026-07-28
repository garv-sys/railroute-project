/**
 * RailKit API Client Adapter (https://railkit.rajivdubey.dev)
 * High-speed live data source for Indian Railways train search, availability, fare & status.
 */

const RAILKIT_BASE_URL = 'https://railkit.rajivdubey.dev';

function getRailKitApiKey(): string {
  return process.env.RAILKIT_API_KEY?.trim() || '';
}

export interface RailKitTrainResult {
  trainNo: string;
  trainName: string;
  source: string;
  destination: string;
  departureTime: string;
  arrivalTime: string;
  duration: string;
  runningDays?: string;
  classes?: string[];
  isLive?: boolean;
  providerSource?: string;
}

export interface RailKitAvailabilityResult {
  availabilityStatus: string;
  fare: number;
  lastUpdated: string;
  isLive: boolean;
}

/**
 * Searches trains between stations via RailKit API.
 */
export async function searchTrainBetweenStationsRailKit(
  fromStation: string,
  toStation: string,
  dateStr: string
): Promise<RailKitTrainResult[]> {
  const apiKey = getRailKitApiKey();
  const url = `${RAILKIT_BASE_URL}/api/v1/trains/between?fromStation=${encodeURIComponent(fromStation)}&toStation=${encodeURIComponent(toStation)}&date=${encodeURIComponent(dateStr)}`;

  try {
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      ...(apiKey ? { 'x-api-key': apiKey, 'Authorization': `Bearer ${apiKey}` } : {}),
    };

    const res = await fetch(url, { headers, next: { revalidate: 60 } });
    if (!res.ok) {
      console.warn(`[RailKit] train-between ${fromStation}->${toStation} HTTP ${res.status}`);
      return [];
    }

    const json = await res.json();
    const list = json?.data || json?.trains || (Array.isArray(json) ? json : []);

    return list.map((item: any) => ({
      trainNo: String(item.trainNumber || item.trainNo || item.train_number || '').trim(),
      trainName: String(item.trainName || item.name || item.train_name || '').trim(),
      source: String(item.fromStation || item.source || fromStation).toUpperCase().trim(),
      destination: String(item.toStation || item.destination || toStation).toUpperCase().trim(),
      departureTime: String(item.departureTime || item.departure_time || item.dep || '00:00'),
      arrivalTime: String(item.arrivalTime || item.arrival_time || item.arr || '00:00'),
      duration: String(item.duration || item.travel_time || '00:00'),
      runningDays: item.runningDays || item.runsOn || '1111111',
      classes: item.classes || item.availableClasses || ['3A', '2A', '1A', 'SL'],
      isLive: true,
      providerSource: 'RailKit',
    }));
  } catch (error: any) {
    console.warn(`[RailKit] train-between fetch error for ${fromStation}->${toStation}:`, error?.message || error);
    return [];
  }
}

/**
 * Fetches live availability and fare via RailKit API.
 */
export async function getAvailabilityRailKit(
  trainNo: string,
  fromStation: string,
  toStation: string,
  dateStr: string,
  classType: string,
  quota = 'GN'
): Promise<RailKitAvailabilityResult | null> {
  const apiKey = getRailKitApiKey();
  const url = `${RAILKIT_BASE_URL}/api/v1/trains/${encodeURIComponent(trainNo)}/availability?fromStation=${encodeURIComponent(fromStation)}&toStation=${encodeURIComponent(toStation)}&date=${encodeURIComponent(dateStr)}&class=${encodeURIComponent(classType)}&quota=${encodeURIComponent(quota)}`;

  try {
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      ...(apiKey ? { 'x-api-key': apiKey, 'Authorization': `Bearer ${apiKey}` } : {}),
    };

    const res = await fetch(url, { headers, next: { revalidate: 30 } });
    if (!res.ok) {
      return null;
    }

    const json = await res.json();
    const data = json?.data || json;

    const status = String(data?.status || data?.availability || data?.availabilityStatus || 'AVAILABLE').toUpperCase();
    const fare = parseFloat(String(data?.totalFare || data?.fare || '0').replace(/[^\d.]/g, '')) || 0;

    return {
      availabilityStatus: status,
      fare,
      lastUpdated: new Date().toISOString(),
      isLive: true,
    };
  } catch (error: any) {
    console.warn(`[RailKit] availability fetch error for train ${trainNo}:`, error?.message || error);
    return null;
  }
}
