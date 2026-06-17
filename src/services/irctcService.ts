import {
  configure,
  searchTrainBetweenStations,
  getAvailability,
  checkPNRStatus,
  trackTrain,
  liveAtStation,
  getTrainInfo,
} from 'irctc-connect';
import { ProviderCache } from '@/lib/provider-cache';
import { getProviderUsageStats, trackProviderCall } from '@/lib/provider-usage';

let configuredApiKey = '';

function ensureIrctcConfigured() {
  const apiKey = process.env.IRCTC_API_KEY?.trim() || '';
  if (!apiKey) {
    throw new Error('IRCTC_API_KEY is not configured on the server.');
  }
  if (configuredApiKey !== apiKey) {
    configure(apiKey);
    configuredApiKey = apiKey;
  }
}

function compactProviderPayload(value: unknown, maxLength = 1600) {
  try {
    const text = JSON.stringify(value);
    return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
  } catch {
    return String(value);
  }
}

const CACHE_TTL_MS = 5 * 60 * 1000;
export const AVAILABILITY_CACHE_TTL_MS = 20 * 1000;
export const TRAIN_BETWEEN_CACHE_TTL_MS = 5 * 60 * 1000;
export const ROUTE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const providerCache = new ProviderCache({
  maxConcurrency: 3,
  retryCount: 1,
  retryDelayMs: 1500,
  failureTtlMs: 30_000,
  staleWhileRevalidateMultiplier: 4,
  timeoutMs: 20_000,
  loggerPrefix: 'irctc-connect',
});

const availabilityCache = new ProviderCache({
  maxConcurrency: 5,
  retryCount: 2,
  retryDelayMs: 600,
  failureTtlMs: 0,
  staleWhileRevalidateMultiplier: 1,
  timeoutMs: 12_000,
  loggerPrefix: 'irctc-connect-availability',
});

const trainListCache = new ProviderCache({
  maxConcurrency: 6,
  retryCount: 0,
  retryDelayMs: 750,
  failureTtlMs: 10_000,
  staleWhileRevalidateMultiplier: 1,
  timeoutMs: 25_000,
  loggerPrefix: 'irctc-connect-train-list',
});

class APIQueue {
  private queue: Array<{
    fn: () => Promise<unknown>;
    resolve: (value: unknown) => void;
    reject: (reason?: unknown) => void;
  }> = [];
  private running = 0;

  constructor(private readonly maxConcurrent = 3, private readonly minDelay = 300) {}

  get stats() {
    return {
      running: this.running,
      queued: this.queue.length,
      maxConcurrent: this.maxConcurrent,
      minDelayMs: this.minDelay,
    };
  }

  async add<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        fn,
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      void this.process();
    });
  }

  private async process() {
    if (this.running >= this.maxConcurrent) return;
    const item = this.queue.shift();
    if (!item) return;

    this.running += 1;
    await new Promise((resolve) => setTimeout(resolve, this.minDelay));
    try {
      item.resolve(await item.fn());
    } catch (error) {
      item.reject(error);
    } finally {
      this.running -= 1;
      void this.process();
    }
  }
}

const irctcQueue = new APIQueue(5, 120);
const trainListQueue = new APIQueue(8, 60);
let availabilityCooldownUntil = 0;
let trainListCooldownUntil = 0;

function isRateLimitedResult(value: unknown) {
  const text = typeof value === 'string' ? value : JSON.stringify(value || '');
  return /rate|429|limited|too many requests|usage limit exceeded|billing cycle/i.test(text);
}

type CooldownScope = 'availability' | 'train-list';

function getCooldownUntil(scope: CooldownScope) {
  return scope === 'train-list' ? trainListCooldownUntil : availabilityCooldownUntil;
}

function setCooldownUntil(scope: CooldownScope, value: number) {
  if (scope === 'train-list') {
    trainListCooldownUntil = Math.max(trainListCooldownUntil, value);
  } else {
    availabilityCooldownUntil = Math.max(availabilityCooldownUntil, value);
  }
}

async function callWithRetry<T>(fn: () => Promise<T>, maxRetries = 5, scope: CooldownScope = 'availability'): Promise<T> {
  let lastResult: T | undefined;
  let lastError: unknown;

  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    const cooldownWait = Math.max(0, getCooldownUntil(scope) - Date.now());
    if (cooldownWait > 0) {
      await new Promise((resolve) => setTimeout(resolve, cooldownWait));
    }
    try {
      const result = await fn();
      lastResult = result;
      if (!isRateLimitedResult(result)) return result;
      const wait = Math.min(20_000, Math.pow(2, attempt) * 2000);
      setCooldownUntil(scope, Date.now() + wait);
    } catch (error) {
      lastError = error;
      if (isRateLimitedResult(error)) {
        const wait = Math.min(20_000, Math.pow(2, attempt) * 2000);
        setCooldownUntil(scope, Date.now() + wait);
      }
      if (attempt === maxRetries - 1) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, Math.min(20_000, Math.pow(2, attempt) * 2000)));
  }

  if (lastResult !== undefined && !isRateLimitedResult(lastResult)) return lastResult;
  throw lastError || new Error('IRCTC request rate limited after retries.');
}

function fetchWithCache<T>(key: string, fetchFn: () => Promise<T>, ttl: number = CACHE_TTL_MS) {
  return providerCache.fetch(key, fetchFn, ttl);
}

export function getRailProviderCacheStats() {
  return {
    general: providerCache.stats(),
    availability: availabilityCache.stats(),
    trainList: trainListCache.stats(),
    queues: {
      availability: irctcQueue.stats,
      trainList: trainListQueue.stats,
    },
    cooldowns: {
      availabilityUntil: availabilityCooldownUntil ? new Date(availabilityCooldownUntil).toISOString() : null,
      trainListUntil: trainListCooldownUntil ? new Date(trainListCooldownUntil).toISOString() : null,
      availabilityMsRemaining: Math.max(0, availabilityCooldownUntil - Date.now()),
      trainListMsRemaining: Math.max(0, trainListCooldownUntil - Date.now()),
    },
    usage: getProviderUsageStats(),
  };
}

// Helper to ensure date is always DD-MM-YYYY
function normalizeDate(d?: string) {
  if (!d) return new Date().toISOString().split('T')[0].split('-').reverse().join('-');
  
  const cleanDate = d.replace(/\//g, '-');
  if (cleanDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return cleanDate.split('-').reverse().join('-');
  }
  return cleanDate;
}

function generateMockTrains(fromStn: string, toStn: string): any[] {
  const trainSpecs = [
    { no: '90001', name: 'SF EXPRESS', dep: '08:00', arr: '16:00', dur: '08:00' },
    { no: '90002', name: 'RAJDHANI EXP', dep: '14:30', arr: '22:30', dur: '08:00' },
    { no: '90003', name: 'MAIL EXPRESS', dep: '20:15', arr: '04:15', dur: '08:00' },
    { no: '90004', name: 'SUPERFAST', dep: '23:45', arr: '07:45', dur: '08:00' }
  ];
  return trainSpecs.map((spec) => ({
    train_no: spec.no,
    train_name: `${fromStn}-${toStn} ${spec.name}`,
    from_stn_code: fromStn,
    to_stn_code: toStn,
    from_time: spec.dep,
    to_time: spec.arr,
    duration: spec.dur,
    running_days: '1111111',
    train_src: fromStn,
    train_dstn: toStn,
    runsOn: '1111111'
  }));
}

export async function searchDirectTrains(fromStn: string, toStn: string, date?: string) {
  const dateStr = normalizeDate(date);
  const key = `search_${fromStn}_${toStn}_${dateStr}`;
  return trainListCache.fetch(key, async () => {
    try {
      ensureIrctcConfigured();
      const primary = await trainListQueue.add(() => callWithRetry(
        () => trackProviderCall('train-list', `${fromStn}->${toStn}:${dateStr}`, () => searchTrainBetweenStations(fromStn, toStn, dateStr)),
        4,
        'train-list'
      ));
      if (isRateLimitedResult(primary)) {
        throw new Error('IRCTC train-list request rate limited after retries.');
      }
      const primaryList = Array.isArray(primary?.data) ? primary.data : Array.isArray(primary) ? primary : [];
      let isNoTrainsResponse = false;
      if (primary?.success === false && typeof primary?.data === 'string') {
        const msg = primary.data.toLowerCase();
        if (msg.includes('no direct trains') || msg.includes('no trains found') || msg.includes('no schedule found')) {
          isNoTrainsResponse = true;
        }
      }
      if (primary?.success === false && typeof primary?.error === 'string') {
        const msg = primary.error.toLowerCase();
        if (msg.includes('no trains found') || msg.includes('no direct trains') || msg.includes('no schedule found')) {
          isNoTrainsResponse = true;
        }
      }

      if (!primaryList.length || primary?.success === false) {
        console.warn('[irctc-connect] TrainBetween provider returned empty/non-success response', {
          fromStn,
          toStn,
          dateStr,
          response: compactProviderPayload(primary),
        });
      }
      return {
        ...(primary && typeof primary === 'object' && !Array.isArray(primary) ? primary : {}),
        success: isNoTrainsResponse ? true : primary?.success !== false,
        provider: primary?.provider || 'irctc-connect',
        data: primaryList,
        isNoTrainsResponse,
      };
    } catch (primaryError: any) {
      console.warn('[irctc-connect] TrainBetween primary failed', {
        fromStn,
        toStn,
        dateStr,
        error: primaryError?.message || primaryError,
      });
      // Never return fake trains — return empty so only real data shows
      return {
        success: false,
        provider: 'irctc-connect',
        data: [],
        error: primaryError?.message || 'Provider request failed',
        isNoTrainsResponse: false,
      };
    }
  }, TRAIN_BETWEEN_CACHE_TTL_MS);
}

export async function checkSeatAvailability(trainNo: string, fromStn: string, toStn: string, date: string, classType: string, quota = 'GN') {
  const dateStr = normalizeDate(date);
  const key = `avail_${trainNo}_${fromStn}_${toStn}_${dateStr}_${classType}_${quota}`;
  return availabilityCache.fetch(key, async () => {
    ensureIrctcConfigured();
    const response: any = await irctcQueue.add(() => callWithRetry(
      () => trackProviderCall('availability', `${trainNo}:${fromStn}->${toStn}:${dateStr}:${classType}:${quota}`, () => getAvailability(trainNo, fromStn, toStn, dateStr, classType, quota)),
      8
    ));
    const rows = Array.isArray(response?.data?.availability) ? response.data.availability : [];
    const fare = response?.data?.fare;
    if (!fare || rows.length === 0) {
      console.log('[avail-debug]', { trainNo, fromStn, toStn, dateStr, classType, rowCount: rows?.length, fare: response?.data?.fare });
    }
    return {
      ...(response && typeof response === 'object' && !Array.isArray(response) ? response : {}),
      provider: response?.provider || 'irctc-connect',
    };
  }, AVAILABILITY_CACHE_TTL_MS);
}



export async function getPNR(pnr: string) {
  const cleanPnr = pnr.trim().replace(/\D/g, '');
  if (cleanPnr.length !== 10) {
    return { success: false, error: 'Invalid PNR number. Must be a 10-digit number.' };
  }

  try {
    ensureIrctcConfigured();
    const res = await providerCache.fetchFresh(`pnr_${cleanPnr}`, () => trackProviderCall('pnr', `pnr:${cleanPnr}`, () => checkPNRStatus(cleanPnr)));
    if (res && res.success !== false && hasMeaningfulPnrPayload(res.data)) {
      return res;
    }
    console.warn('[irctc-connect] PNR provider returned an empty shell response', {
      pnr: cleanPnr,
      response: compactProviderPayload(res),
    });
    return { success: false, error: 'IRCTC returned an invalid or empty PNR status.' };
  } catch (e: any) {
    console.warn(`[irctc-connect] Live PNR lookup failed:`, e.message);
    return { success: false, error: 'Failed to connect to IRCTC proxy server.' };
  }
}

function hasMeaningfulPnrPayload(data: any) {
  if (!data || typeof data !== 'object') return false;
  const train = data.train || data.Train || data.trainInfo || data.train_info || {};
  const journey = data.journey || data.Journey || {};
  const passengers =
    data.passengers ||
    data.Passengers ||
    data.PassengerStatus ||
    data.passengerStatus ||
    data.passengerList ||
    data.PassengerList ||
    [];

  const hasPassengers = Array.isArray(passengers) && passengers.length > 0;
  const hasTrain =
    hasPnrValue(train.number || train.trainNo || train.TrainNo || data.trainNo || data.TrainNo) ||
    hasPnrValue(train.name || train.trainName || train.TrainName || data.trainName || data.TrainName);
  const hasJourney =
    hasPnrValue(journey.from || journey.From || data.from || data.Source || data.From) ||
    hasPnrValue(journey.to || journey.To || data.to || data.Destination || data.To);

  return hasPassengers || hasTrain || hasJourney;
}

function hasPnrValue(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return Boolean(normalized && normalized !== '--' && normalized !== 'null' && normalized !== 'undefined');
  }
  if (typeof value === 'number' || typeof value === 'boolean') return true;
  if (Array.isArray(value)) return value.some(hasPnrValue);
  if (typeof value === 'object') return Object.values(value).some(hasPnrValue);
  return Boolean(value);
}

export async function getLiveStatus(trainNo: string, date?: string) {
  const dateStr = normalizeDate(date);
  const key = `live_${trainNo}_${dateStr}`;
  ensureIrctcConfigured();
  return providerCache.fetchFresh(key, () => trackProviderCall('live', `${trainNo}:${dateStr}`, () => trackTrain(trainNo, dateStr)));
}

export async function getLiveStation(stationCode: string) {
  const key = `station_${stationCode}`;
  ensureIrctcConfigured();
  return providerCache.fetchFresh(key, () => trackProviderCall('station-live', stationCode, () => liveAtStation(stationCode)));
}

export async function getTrainSchedule(trainNo: string) {
  const key = `schedule_${trainNo}`;
  return fetchWithCache(key, () => {
    ensureIrctcConfigured();
    return trackProviderCall('schedule', trainNo, () => getTrainInfo(trainNo));
  }, ROUTE_CACHE_TTL_MS);
}
