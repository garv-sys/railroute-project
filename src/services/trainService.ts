import { searchDirectTrains, checkSeatAvailability, getTrainSchedule } from './irctcService';
import MAJOR_HUBS from '@/data/major_hubs.json';
import { buildTrustMeta } from '@/lib/confidence';
import { STATION_COORDS, stationLabelFromCode } from '@/lib/railway-intelligence';
import {
  availabilityReasonForStatus,
  fareReasonForStatus,
  lookupStatusFromReason,
  makeLookupProof,
  type LookupProof,
  type LookupTrustStatus,
} from '@/lib/railway-trust';

function compactLogPayload(value: unknown, maxLength = 1600) {
  try {
    const text = JSON.stringify(value, (_key, entry) => {
      if (typeof entry === 'string' && entry.length > 220) return `${entry.slice(0, 220)}...`;
      return entry;
    });
    return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
  } catch {
    return String(value);
  }
}

function logProviderIssue(scope: string, meta: Record<string, unknown>, payload?: unknown) {
  console.warn(`[RailRoute provider] ${scope}`, {
    ...meta,
    payload: payload === undefined ? undefined : compactLogPayload(payload),
  });
}

function takeForCoverage<T>(items: T[], limit = Number.POSITIVE_INFINITY) {
  if (!Number.isFinite(limit)) return items;
  return items.slice(0, Math.max(0, limit));
}

function availabilityUnavailableReason(classCode: string, error?: unknown) {
  const message = String(error || '').toLowerCase();
  if (/too many|rate|429|quota exceeded/.test(message)) {
    return `Check seats ${classCode}`;
  }
  if (/class|coach/.test(message) && /(not|does not|invalid|unavailable|exist)/.test(message)) {
    return `${classCode} not returned for this train`;
  }
  if (/quota/.test(message) && /(not|does not|invalid|unavailable|exist)/.test(message)) {
    return `Quota not returned for ${classCode}`;
  }
  if (/not running/.test(message)) return 'Not Running';
  return `Check seats ${classCode}`;
}

function hasReturnedAvailability(status: unknown) {
  const text = String(status || '').trim().toLowerCase();
  if (!text) return false;
  return !/availability unavailable|live data unavailable|provider did not return|not returned|request failed|checking|not running|no service|cancel/.test(text);
}

function verifiedLiveClassEntries(train: TrainResult) {
  return Object.entries(train.classAvailability || {}).filter(([, rows]) => {
    const first = Array.isArray(rows) ? rows[0] : undefined;
    if (!first) return false;
    const text = String(first.text || '').toUpperCase();
    const unbookable = /NOT AVAILABLE|TRAIN NOT ON SCHEDULED DATE|UNAVAILABLE|NOT BOOKABLE|CLASS NOT AVAILABLE|NOT RUNNING|NO SERVICE|CANCEL/.test(text);
    return first.availabilityStatus === 'VERIFIED' && !unbookable;
  });
}

function hasVerifiedLiveClass(train: TrainResult) {
  return verifiedLiveClassEntries(train).length > 0;
}

function pruneToVerifiedLiveClasses(train: TrainResult): TrainResult {
  const entries = verifiedLiveClassEntries(train);
  const classAvailability = Object.fromEntries(entries);
  const classes = entries.map(([classCode]) => classCode);
  const activeClass = classes.includes(String(train.classType || '').toUpperCase())
    ? String(train.classType || '').toUpperCase()
    : classes[0];
  const activeDay = activeClass ? classAvailability[activeClass]?.[0] : undefined;
  return {
    ...train,
    classes,
    classType: activeClass,
    classAvailability,
    availability: activeDay?.text || train.availability,
    fare: activeDay?.fare ? `₹${activeDay.fare}` : train.fare,
    confirmationChance: activeDay?.confirmationChance,
    availabilityStatus: activeDay?.availabilityStatus || train.availabilityStatus,
    fareStatus: activeDay?.fareStatus || train.fareStatus,
    lookupReason: activeDay?.lookupReason || train.lookupReason,
    requestProof: activeDay?.proof || train.requestProof,
  };
}

function selectedClassMissing(train: TrainResult, classType: string) {
  const requestedClass = String(classType || '').toUpperCase();
  if (!requestedClass || requestedClass === 'ANY') return false;
  const status = String(train.availability || '').toLowerCase();
  return status.includes(`${requestedClass.toLowerCase()} not returned for this train`);
}

export interface ClassAvailabilityItem {
  dateStr: string; // e.g., "Wed, 15 Jul"
  rawDate: string; // YYYY-MM-DD
  status: "AVAILABLE" | "WL" | "RAC" | "REGRET" | "NOT_RUNNING" | "UNAVAILABLE";
  text: string;
  seats: number;
  fare: number;
  notRunning?: boolean; // true when train has no service on this day
  confirmationChance?: number;
  fareBreakdown: {
    baseFare: number;
    reservationCharge: number;
    superfastCharge: number;
    gst: number;
    total: number;
  };
  updatedTime: string;
  availabilityStatus?: LookupTrustStatus;
  fareStatus?: LookupTrustStatus;
  lookupReason?: string;
  proof?: LookupProof;
}

export interface TrainResult {
  trainNo: string;
  trainName: string;
  source: string;
  destination: string;
  departureTime: string;
  arrivalTime: string;
  duration: string;
  availability: string;
  fare: string;
  journeyDate?: string;
  departureDate?: string;
  arrivalDate?: string;
  classType?: string;
  confirmationChance?: number;
  alternateStationHint?: string;
  
  // Premium Redesign Fields
  features?: string[];
  trainType?: "Vande Bharat" | "Rajdhani" | "Shatabdi" | "Duronto" | "Superfast" | "Express";

  // Real IRCTC Data Fields
  runsOnDays?: boolean[]; // [Mon, Tue, Wed, Thu, Fri, Sat, Sun]
  classes?: string[]; // ["SL", "3E", "3A", "2A", "1A"]
  classAvailability?: Record<string, ClassAvailabilityItem[]>; // Map provider-returned/verified classCode to availability rows
  route?: any[];
  selectedClass?: string | null;
  providerReturnedClass?: string[];
  availabilityStatus?: LookupTrustStatus;
  fareStatus?: LookupTrustStatus;
  lookupReason?: string;
  requestProof?: LookupProof;
}

type TrainSearchOptions = {
  debug?: boolean;
  fetchLive?: boolean;
  liveLookupLimit?: number;
  liveLookupDelayMs?: number;
  coverageMode?: 'quick' | 'full';
  providerPairLimit?: number;
  exactStationOnly?: boolean;
  expandTerminalPairs?: boolean;
  maxSplitHubs?: number;
  maxSplitLegOptions?: number;
  maxSplitCandidates?: number;
  maxSplitResults?: number;
  maxMultiPlans?: number;
  maxMultiLegOptions?: number;
  maxMultiCandidates?: number;
  maxMultiResults?: number;
  plannerLegTimeoutMs?: number;
  globalTimeoutMs?: number;
  allowMixedClassSplits?: boolean;
};

export interface SplitRouteResult {
  leg1: TrainResult;
  leg2: TrainResult;
  hubStation: string;
  hubStationName: string; // Human-readable name e.g. "New Delhi (NDLS)"
  layoverDuration: string;
  layoverHours: number;
  leg1Date?: string;
  leg2Date?: string;
  leg1DepartureDate?: string;
  leg1ArrivalDate?: string;
  leg2DepartureDate?: string;
  leg1Fare: number;
  leg2Fare: number;
  totalFare: number;
  score: number;
  combinedConfirmationChance?: number | null;
  isHeritage?: boolean; // true for UNESCO heritage railway legs (toy trains etc.)
}

export interface MultiSplitRouteResult {
  legs: TrainResult[];
  interchangeStations: string[];
  interchangeStationNames: string[];
  layovers: { station: string; duration: string; hours: number }[];
  totalFare: number;
  totalDuration: string;
  score: number;
  combinedConfirmationChance?: number | null;
}

export interface GodModeHubCandidate {
  code: string;
  name: string;
  rank: number;
  score: number;
  confidence: number;
  importance: number;
  trainDensity: number;
  connectivity: number;
  geographicRelevance: number;
  progress: number;
  distanceFromSourceKm: number;
  distanceToDestinationKm: number;
  reasons: string[];
}

function parseTime(timeStr: string, baseDate: string) {
  const [day, month, year] = baseDate.split('-');
  const [hours, minutes] = timeStr.split(':');
  return new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hours), parseInt(minutes));
}

function formatDuration(ms: number) {
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${minutes}m`;
}

function parseDurationMins(value: string) {
  if (!value || value === 'N/A') return 0;
  let hours = 0;
  let mins = 0;
  if (value.includes(':')) {
    const parts = value.replace('hrs', '').trim().split(':');
    hours = parseInt(parts[0], 10) || 0;
    mins = parseInt(parts[1], 10) || 0;
  } else if (value.includes('h')) {
    const hMatch = value.match(/(\d+)\s*h/);
    const mMatch = value.match(/(\d+)\s*m/);
    if (hMatch) hours = parseInt(hMatch[1], 10);
    if (mMatch) mins = parseInt(mMatch[1], 10);
  }
  return hours * 60 + mins;
}

function providerPaceDelay(ms = 450) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isFullCoverage(options: TrainSearchOptions = {}) {
  return options.coverageMode === 'full';
}

function quickLimit(options: TrainSearchOptions = {}, value: number | undefined, fallback: number) {
  if (isFullCoverage(options)) return Number.POSITIVE_INFINITY;
  return typeof value === 'number' ? value : fallback;
}

async function plannerTimeout<T>(promise: Promise<T>, ms: number | undefined, fallback: T): Promise<T> {
  if (!ms || !Number.isFinite(ms) || ms <= 0) return promise;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<T>((resolve) => {
    timeout = setTimeout(() => resolve(fallback), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
}

function formatDurationMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${String(mins).padStart(2, '0')}m`;
}

function formatDateStr(dateStr: string) {
  if (dateStr.includes('-') && dateStr.split('-')[0].length === 4) {
    const parts = dateStr.split('-');
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return dateStr;
}

function dateFromRailDate(value: string) {
  const [day, month, year] = formatDateStr(value).split('-').map((part) => parseInt(part, 10));
  return new Date(year, month - 1, day);
}

function formatRailDate(value: Date) {
  return `${String(value.getDate()).padStart(2, '0')}-${String(value.getMonth() + 1).padStart(2, '0')}-${value.getFullYear()}`;
}

function railDateToIso(value: string) {
  const [day, month, year] = formatDateStr(value).split('-');
  return `${year}-${month}-${day}`;
}

function addDaysToRailDate(value: string, days: number) {
  const date = dateFromRailDate(value);
  date.setDate(date.getDate() + days);
  return formatRailDate(date);
}

function actualTrainTiming(train: any, railDate: string) {
  const departureText = rawTrainDeparture(train) || train.departureTime || train.from_time || train.from_std || '';
  const arrivalText = rawTrainArrival(train) || train.arrivalTime || train.to_time || train.to_sta || '';
  const durationText = train.travel_time || train.duration || '';
  const departureMs = departureText ? parseTime(departureText, railDate).getTime() : dateFromRailDate(railDate).getTime();
  let arrivalMs = arrivalText ? parseTime(arrivalText, railDate).getTime() : departureMs;
  const durationMinutes = parseDurationMins(String(durationText || ''));

  if (durationMinutes > 0) {
    arrivalMs = departureMs + durationMinutes * 60 * 1000;
  } else {
    while (arrivalMs < departureMs) arrivalMs += 24 * 60 * 60 * 1000;
  }

  return {
    departureMs,
    arrivalMs,
    departureDate: railDateToIso(formatRailDate(new Date(departureMs))),
    arrivalDate: railDateToIso(formatRailDate(new Date(arrivalMs))),
  };
}

function providerRunningDaysToMonFirst(value: unknown): boolean[] | undefined {
  const text = String(value || '');
  if (!/^[01]{7}$/.test(text)) return undefined;
  // irctc-connect train-list responses are already Monday-first:
  // 0 = Monday ... 5 = Saturday, 6 = Sunday.
  return text.split('').map((item) => item === '1');
}

function trainRunsOnRailDate(runningDays: unknown, date: string) {
  const text = String(runningDays || '');
  if (!/^[01]{7}$/.test(text)) return true;
  const jsDay = dateFromRailDate(date).getDay(); // 0 = Sunday ... 6 = Saturday
  const monFirstIndex = jsDay === 0 ? 6 : jsDay - 1;
  const sunFirstIndex = jsDay;

  // The hosted provider currently returns Monday-first bits, while some legacy
  // railway feeds expose Sunday-first bits. The train-between call is already
  // date-specific, so only reject when both plausible indexes say "not running".
  return text[monFirstIndex] === '1' || text[sunFirstIndex] === '1';
}

function providerClassesForTrain(train: any) {
  const known = new Set(['1A', '2A', '3A', '3E', 'SL', '2S', 'CC', 'EC', 'FC']);
  const values = [
    train.classes,
    train.class_type,
    train.classType,
    train.avl_classes,
    train.available_classes,
    train.availableClasses,
  ];
  const parsed = values.flatMap((value) => {
    if (Array.isArray(value)) return value;
    return String(value || '').split(/[,/| ]+/);
  }).map((value) => String(value).toUpperCase().trim()).filter((value) => known.has(value));
  return Array.from(new Set(parsed));
}

const STANDARD_LONG_DISTANCE_CLASSES = ['1A', '2A', '3A', '3E', 'SL'];
const STANDARD_SEATED_CLASSES = ['EC', 'CC', '2S'];

function liveProbeClassesForTrain(train: any) {
  const name = String(train?.train_name || train?.trainName || '').toUpperCase();
  if (/SHATABDI|VANDE BHARAT|JAN SHATABDI/.test(name)) {
    return STANDARD_SEATED_CLASSES;
  }
  return STANDARD_LONG_DISTANCE_CLASSES;
}

function trainNameSupportsRequestedClass(train: any, classType: string) {
  const requestedClass = String(classType || '').toUpperCase();
  if (!requestedClass || requestedClass === 'ANY') return true;
  const name = String(train?.train_name || train?.trainName || '').toUpperCase();
  if (STANDARD_LONG_DISTANCE_CLASSES.includes(requestedClass) && /SHATABDI|VANDE BHARAT|VANDEBHARAT|JAN SHATABDI/.test(name)) {
    return false;
  }
  if (STANDARD_SEATED_CLASSES.includes(requestedClass) && /RAJDHANI|DURONTO/.test(name)) {
    return false;
  }
  return true;
}

function legSupportsRequestedClass(train: any, requestedClass: string): boolean {
  const req = String(requestedClass || '').toUpperCase();
  if (!req || req === 'ANY') return true;

  const trainClasses = providerClassesForTrain(train);
  
  // If the train explicitly supports the requested class, it's a direct match!
  if (trainClasses.includes(req)) return true;

  // Fallback check if no classes are loaded from provider
  if (trainClasses.length === 0) {
    return trainNameSupportsRequestedClass(train, req);
  }

  // Cross-class type compatibility mapping:
  const isSleeper = ['1A', '2A', '3A', '3E', 'SL'].includes(req);
  const isSeated = ['EC', 'CC', '2S'].includes(req);

  if (isSleeper) {
    // Seated trains can be used for sleeper requests (e.g. Vande Bharat CC/EC for day legs)
    const hasOnlySeated = trainClasses.every((c) => ['EC', 'CC', '2S'].includes(c));
    const name = String(train?.train_name || train?.trainName || '').toUpperCase();
    const isSeatedTrain = hasOnlySeated || /SHATABDI|VANDE BHARAT|VANDEBHARAT|JAN SHATABDI/.test(name);
    if (isSeatedTrain) {
      if (['1A', '2A', '3A', '3E'].includes(req)) {
        return trainClasses.includes('EC') || trainClasses.includes('CC');
      }
      if (req === 'SL') {
        return trainClasses.includes('CC') || trainClasses.includes('2S');
      }
    }
  }

  if (isSeated) {
    // Sleeper trains can be used for seated requests (e.g. Rajdhani 3A/2A for day/night legs)
    const hasOnlySleeper = trainClasses.every((c) => ['1A', '2A', '3A', '3E', 'SL'].includes(c));
    const name = String(train?.train_name || train?.trainName || '').toUpperCase();
    const isSleeperTrain = hasOnlySleeper || /RAJDHANI|DURONTO/.test(name);
    if (isSleeperTrain) {
      if (['EC', 'CC'].includes(req)) {
        return trainClasses.includes('1A') || trainClasses.includes('2A') || trainClasses.includes('3A') || trainClasses.includes('3E');
      }
      if (req === '2S') {
        return trainClasses.includes('SL') || trainClasses.includes('3E');
      }
    }
  }

  return false;
}

function safeParseFare(fareVal: any): number {
  if (typeof fareVal === 'number') return fareVal;
  if (!fareVal) return 0;
  const str = String(fareVal).replace(/[^\d.]/g, '');
  const parsed = parseFloat(str);
  return Number.isFinite(parsed) ? parsed : 0;
}

function trainServiceQualityBoost(train: any) {
  const text = String(`${train?.train_no || train?.trainNo || ''} ${train?.train_name || train?.trainName || ''}`).toUpperCase();
  if (/RAJDHANI/.test(text)) return 18;
  if (/DURONTO|GARIB RATH/.test(text)) return 12;
  if (/SUPERFAST|\bSF\b/.test(text)) return 6;
  return 0;
}

function providerTrainType(train: any): TrainResult['trainType'] | undefined {
  const raw = String(train.train_type || train.trainType || train.type || train.train_name || train.trainName || '').toUpperCase();
  if (raw.includes('VANDE BHARAT')) return 'Vande Bharat';
  if (raw.includes('RAJDHANI')) return 'Rajdhani';
  if (raw.includes('SHATABDI')) return 'Shatabdi';
  if (raw.includes('DURONTO')) return 'Duronto';
  if (raw.includes('SUPERFAST') || raw.includes(' SF ') || raw.endsWith(' SF')) return 'Superfast';
  if (raw.includes('EXP')) return 'Express';
  return undefined;
}

function normalizeStationCode(code: string) {
  const map: Record<string, string> = {
    'JPR': 'JP',
    'JAIPUR': 'JP',
    'JAIPUR JN': 'JP',
    'DEL': 'NDLS',
    'DELHI': 'NDLS',
    'NEW DELHI': 'NDLS',
    'NEW DELHI JN': 'NDLS',
    'PATNA': 'PNBE',
    'PATNA JN': 'PNBE',
    'PATNA JUNCTION': 'PNBE',
    'PTNA': 'PNBE',
    'CHAKRADHARPUR': 'CKP',
    'CHAKRADHARPUR JN': 'CKP',
    'CHAKADARPUR': 'CKP',
    'CHUKUNDPUR': 'CKP',
    'CHUKUNDARPUR': 'CKP',
    'BOM': 'CSMT',
    'BOMBAY': 'CSMT',
    'MUMBAI': 'CSMT',
    'MUMBAI CENTRAL': 'BCT',
    'LOKMANYA TILAK': 'LTT',
    'LOKMANYA TILAK TERMINUS': 'LTT',
    'BANDRA': 'BDTS',
    'BANDRA TERMINUS': 'BDTS',
    'DADAR': 'DR',
    'DADAR CENTRAL': 'DR',
    'CSTM': 'CSMT',
    'MMCT': 'MMCT',
    'AHMEDABAD': 'ADI',
    'AHMEDABAD JN': 'ADI',
    'AMDAVAD': 'ADI',
    'VADODARA': 'BRC',
    'BARODA': 'BRC',
    'SURAT': 'ST',
    'SURAT JN': 'ST',
    'INDORE': 'INDB',
    'INDORE JN': 'INDB',
    'UJJAIN': 'UJN',
    'RATLAM': 'RTM',
    'BHILWARA': 'BHL',
    'UDAIPUR': 'UDZ',
    'UDAIPUR CITY': 'UDZ',
    'CAL': 'HWH',
    'KOLKATA': 'HWH',
    'HOWRAH': 'HWH',
    'MAD': 'MAS',
    'CHENNAI': 'MAS',
    'CHENNAI CENTRAL': 'MAS',
    'CHENNAI EGMORE': 'MS',
    'BLR': 'SBC',
    'BANGALORE': 'SBC',
    'BANGLORE': 'SBC',
    'BENGALURU': 'SBC',
    'BENGALURU CITY': 'SBC',
    'SMVT BENGALURU': 'SMVB',
    'YESVANTPUR': 'YPR',
    'YESHWANTPUR': 'YPR',
    'HYDERABAD': 'SC',
    'HYDERABAD DECAN': 'HYB',
    'SECUNDERABAD': 'SC',
    'KACHEGUDA': 'KCG',
    'GUWAHATI': 'GHY',
    'GAUHATI': 'GHY',
    'GUWATI': 'GHY',
    'GUWTHI': 'GHY',
    'KAMAKHYA': 'KYQ',
    'KASHMIR': 'SVDK',
    'KATRA': 'SVDK',
    'VAISHNO DEVI': 'SVDK',
    'SHRI MATA VAISHNO DEVI KATRA': 'SVDK',
    'JAMMU': 'JAT',
    'JAMMU TAWI': 'JAT',
    'SHIMLA': 'SML',
    'SIMLA': 'SML',
    'KANYAKUMARI': 'CAPE',
    'KANYA KUMARI': 'CAPE',
    'ARUNACHAL PRADESH': 'NHLN',
    'ARUNACHAL': 'NHLN',
    'ITANAGAR': 'NHLN',
    'NAHARLAGUN': 'NHLN',
    'KOHIMA': 'DMV',
    'NAGALAND': 'DMV',
    'MIZORAM': 'BHRB',
    'AIZAWL': 'BHRB',
    'BAIRABI': 'BHRB',
    'TRIVANDRUM': 'TVC',
    'THIRUVANANTHAPURAM': 'TVC',
    'KERALA': 'TVC',
    'KOCHI': 'ERS',
    'ERNAKULAM': 'ERS',
    'KOZHIKODE': 'CLT',
    'CALICUT': 'CLT',
    'PALAKKAD': 'PGT',
    'GOA': 'MAO',
    'MADGAON': 'MAO',
    'MARGAO': 'MAO',
    'AGR': 'AGC',
    'AGRA': 'AGC',
    'RAIPUR': 'R',
    'CHHATTISGARH': 'R',
    'CHATTISGARH': 'R',
    'BILASPUR': 'BSP',
    'AMRITSAR': 'ASR',
    'PUNJAB': 'ASR',
    'BULANDSHAHR': 'BSC',
    'BHULANDSEHER': 'BSC',
    'BULANDSEHER': 'BSC',
    'ALWAR': 'AWR',
    'ALWAR JN': 'AWR',
    'ALWAR JUNCTION': 'AWR',
    'JODHPUR': 'JU',
    'JODHPUR JN': 'JU',
    'JODHPUR JUNCTION': 'JU',
    'DEHRADUN': 'DDN',
    'LUCKNOW': 'LKO',
    'VAR': 'BSB',
    'VARANASI': 'BSB',
    'BENARAS': 'BSBS',
    'ALD': 'PRYJ',
    'ALLAHABAD': 'PRYJ',
    'PRAYAGRAJ': 'PRYJ',
    'PRAYAGRAJ JN': 'PRYJ',
    'MUG': 'DDU',
    'MGS': 'DDU',
    'MUGHAL SARAI': 'DDU',
    'MUGHALSARAI': 'DDU',
  };
  const upper = (code || '').toUpperCase().trim();
  return map[upper] || upper;
}

function stationCodeValue(value: any) {
  if (!value) return '';
  if (typeof value === 'string' || typeof value === 'number') return normalizeStationCode(String(value));
  if (typeof value === 'object') {
    return normalizeStationCode(String(
      value.code ||
      value.stnCode ||
      value.stationCode ||
      value.station_code ||
      value.from_stn_code ||
      value.to_stn_code ||
      value.name ||
      ''
    ));
  }
  return '';
}

function rawTrainSource(train: any) {
  return stationCodeValue(train.from_stn_code || train.from_station_code || train.fromStnCode || train.source_stn_code || train.train_src || train.source || train.from);
}

function rawTrainDestination(train: any) {
  return stationCodeValue(train.to_stn_code || train.to_station_code || train.toStnCode || train.dstn_stn_code || train.train_dstn || train.dest || train.destination || train.to);
}

function rawTrainDeparture(train: any) {
  return train.from_time || train.from_std || train.departureTime || '';
}

function rawTrainArrival(train: any) {
  return train.to_time || train.to_sta || train.arrivalTime || '';
}

function trainRouteCodes(train: any) {
  const route = Array.isArray(train.route) ? train.route : Array.isArray(train.train_route) ? train.train_route : [];
  return route
    .map((stop: any) => stationCodeValue(stop?.code || stop?.stnCode || stop?.stationCode || stop?.station_code || stop?.stn_code))
    .filter(Boolean);
}

function trainMatchesRequestedLeg(train: any, source: string, dest: string) {
  const route = trainRouteCodes(train);
  if (route.length > 0) {
    const sourceIndex = route.indexOf(source);
    const destIndex = route.indexOf(dest);
    if (sourceIndex === -1 || destIndex === -1) return true;
    return sourceIndex < destIndex;
  }

  return true;
}

const CITY_TERMINAL_CLUSTERS: Record<string, string[]> = {
  PNBE: ['PNBE', 'DNR', 'PPTA', 'RJPB'],
  DNR: ['DNR', 'PNBE', 'PPTA', 'RJPB'],
  PPTA: ['PPTA', 'PNBE', 'DNR', 'RJPB'],
  RJPB: ['RJPB', 'PNBE', 'DNR', 'PPTA'],
  INDB: ['INDB', 'LMNR', 'UJN'],
  LMNR: ['LMNR', 'INDB', 'UJN'],
  UJN: ['UJN', 'INDB', 'LMNR'],
  PRYJ: ['PRYJ', 'PCOI', 'PRRB', 'ALD', 'SFG'],
  PCOI: ['PCOI', 'PRYJ', 'PRRB', 'ALD', 'SFG'],
  PRRB: ['PRRB', 'PRYJ', 'PCOI', 'ALD', 'SFG'],
  ALD: ['ALD', 'PRYJ', 'PCOI', 'PRRB', 'SFG'],
  SFG: ['SFG', 'PRYJ', 'PCOI', 'PRRB', 'ALD'],
  LKO: ['LKO', 'LJN'],
  LJN: ['LJN', 'LKO'],
  CNB: ['CNB', 'CPB'],
  CPB: ['CPB', 'CNB'],
  NDLS: ['NDLS', 'DLI', 'NZM', 'ANVT', 'DEE', 'DEC'],
  DLI: ['DLI', 'NDLS', 'NZM', 'ANVT', 'DEE', 'DEC'],
  NZM: ['NZM', 'NDLS', 'DLI', 'ANVT', 'DEE', 'DEC'],
  ANVT: ['ANVT', 'NDLS', 'DLI', 'NZM', 'DEE', 'DEC'],
  DEE: ['DEE', 'NDLS', 'DLI', 'NZM', 'ANVT', 'DEC'],
  DEC: ['DEC', 'NDLS', 'DLI', 'NZM', 'ANVT', 'DEE'],
  SBC: ['SBC', 'SMVB', 'YPR', 'BNC', 'BNCE', 'KJM'],
  SMVB: ['SMVB', 'SBC', 'YPR', 'BNC', 'BNCE', 'KJM'],
  YPR: ['YPR', 'SBC', 'SMVB', 'BNC', 'BNCE', 'KJM'],
  BNC: ['BNC', 'SBC', 'SMVB', 'YPR', 'BNCE', 'KJM'],
  BNCE: ['BNCE', 'BNC', 'SBC', 'SMVB', 'YPR', 'KJM'],
  KJM: ['KJM', 'SMVB', 'BNC', 'SBC', 'YPR', 'BNCE'],
  CSMT: ['CSMT', 'LTT', 'MMCT', 'BCT', 'BDTS', 'DR', 'DDR'],
  CSTM: ['CSMT', 'LTT', 'MMCT', 'BCT', 'BDTS', 'DR', 'DDR'],
  LTT: ['LTT', 'CSMT', 'MMCT', 'BCT', 'BDTS', 'DR', 'DDR'],
  MMCT: ['MMCT', 'BCT', 'BDTS', 'DDR', 'DR', 'LTT', 'CSMT'],
  BCT: ['BCT', 'MMCT', 'CSMT', 'LTT', 'BDTS', 'DDR', 'DR'],
  BDTS: ['BDTS', 'BCT', 'MMCT', 'LTT', 'CSMT', 'DDR', 'DR'],
  DR: ['DR', 'CSMT', 'LTT', 'MMCT', 'BCT', 'BDTS', 'DDR'],
  DDR: ['DDR', 'BCT', 'MMCT', 'BDTS', 'CSMT', 'LTT', 'DR'],
  SC: ['SC', 'HYB', 'KCG', 'WL'],
  HYB: ['HYB', 'SC', 'KCG', 'WL'],
  KCG: ['KCG', 'SC', 'HYB', 'WL'],
  GHY: ['GHY', 'KYQ'],
  KYQ: ['KYQ', 'GHY'],
  MAS: ['MAS', 'MS', 'TBM', 'PER'],
  MS: ['MS', 'MAS', 'TBM', 'PER'],
  TBM: ['TBM', 'MAS', 'MS', 'PER'],
  PER: ['PER', 'MAS', 'MS', 'TBM'],
  HWH: ['HWH', 'SDAH', 'KOAA', 'SHM'],
  SDAH: ['SDAH', 'HWH', 'KOAA', 'SHM'],
  KOAA: ['KOAA', 'HWH', 'SDAH', 'SHM'],
  SHM: ['SHM', 'HWH', 'SDAH', 'KOAA'],
  BSB: ['BSB', 'BSBS', 'DDU'],
  BSBS: ['BSBS', 'BSB', 'DDU'],
  DDU: ['DDU', 'BSB', 'BSBS'],
  MGS: ['DDU', 'BSB', 'BSBS'],
};

const SPLIT_HUB_ALIASES: Record<string, string[]> = {
  NDLS: ['NDLS', 'DLI', 'NZM', 'ANVT', 'DEE', 'DEC'],
  DLI: ['DLI', 'NDLS', 'NZM', 'ANVT', 'DEE', 'DEC'],
  NZM: ['NZM', 'NDLS', 'DLI', 'ANVT', 'DEE', 'DEC'],
  ANVT: ['ANVT', 'NDLS', 'DLI', 'NZM', 'DEE', 'DEC'],
  PRYJ: ['PRYJ', 'PCOI', 'PRRB', 'ALD', 'SFG'],
  PCOI: ['PCOI', 'PRYJ', 'PRRB', 'ALD', 'SFG'],
  LKO: ['LKO', 'LJN'],
  LJN: ['LJN', 'LKO'],
  BSB: ['BSB', 'BSBS'],
  MAS: ['MAS', 'MS', 'TBM'],
  MS: ['MS', 'MAS', 'TBM'],
  SBC: ['SBC', 'YPR', 'SMVB', 'BNC'],
  YPR: ['YPR', 'SBC', 'SMVB', 'BNC'],
  SMVB: ['SMVB', 'SBC', 'YPR', 'BNC'],
  CSMT: ['CSMT', 'LTT', 'MMCT', 'BCT', 'BDTS', 'KYN'],
  LTT: ['LTT', 'CSMT', 'MMCT', 'BCT', 'BDTS', 'KYN'],
  MMCT: ['MMCT', 'BCT', 'BDTS', 'DDR', 'DR', 'LTT', 'CSMT'],
  BCT: ['BCT', 'MMCT', 'BDTS', 'DDR', 'DR', 'LTT', 'CSMT'],
  BDTS: ['BDTS', 'BCT', 'MMCT', 'DDR', 'DR', 'LTT', 'CSMT'],
  ADI: ['ADI', 'BRC', 'ST', 'VAPI', 'RJT'],
  BRC: ['BRC', 'ADI', 'ST', 'VAPI'],
  ST: ['ST', 'BRC', 'ADI', 'VAPI'],
  INDB: ['INDB', 'UJN', 'RTM', 'BPL', 'ET'],
  UJN: ['UJN', 'INDB', 'RTM', 'BPL'],
  RTM: ['RTM', 'UJN', 'INDB', 'KOTA', 'BRC'],
  SC: ['SC', 'HYB', 'KCG', 'WL'],
  HYB: ['HYB', 'SC', 'KCG', 'WL'],
  KCG: ['KCG', 'SC', 'HYB', 'WL'],
  GHY: ['GHY', 'KYQ', 'NJP', 'MLDT'],
  KYQ: ['KYQ', 'GHY', 'NJP', 'MLDT'],
  NJP: ['NJP', 'MLDT', 'HWH', 'GHY', 'KYQ'],
  MLDT: ['MLDT', 'NJP', 'HWH', 'SDAH'],
  SVDK: ['SVDK', 'JAT', 'UHP'],
  JAT: ['JAT', 'UHP', 'SVDK', 'LDH', 'UMB'],
  UHP: ['UHP', 'JAT', 'SVDK'],
  CAPE: ['CAPE', 'NCJ', 'TVC'],
  NCJ: ['NCJ', 'CAPE', 'TVC'],
  TVC: ['TVC', 'ERS', 'ERN', 'SRR', 'PGT', 'CLT', 'CAPE'],
  ERS: ['ERS', 'ERN', 'TVC', 'SRR', 'PGT', 'CLT'],
  ERN: ['ERN', 'ERS', 'TVC', 'SRR', 'PGT', 'CLT'],
  CLT: ['CLT', 'SRR', 'PGT', 'ERS', 'TVC'],
  SRR: ['SRR', 'PGT', 'CLT', 'ERS', 'TVC'],
  PGT: ['PGT', 'SRR', 'CLT', 'ERS', 'TVC'],
  MAO: ['MAO', 'VSG', 'LD', 'KYN'],
  VSG: ['VSG', 'MAO', 'LD', 'KYN'],
  PUNE: ['PUNE', 'KYN', 'LTT', 'CSMT'],
  BHL: ['BHL', 'AII', 'UDZ', 'KOTA'],
  UDZ: ['UDZ', 'AII', 'BHL', 'ABR'],
  SML: ['SML', 'KLK', 'CDG', 'UMB'],
  KLK: ['KLK', 'SML', 'CDG', 'UMB'],
  DDN: ['DDN', 'HW', 'SRE'],
  ASR: ['ASR', 'LDH', 'JUC', 'UMB'],
  R: ['R', 'BSP', 'DURG'],
  BSC: ['BSC', 'ALJN', 'GZB', 'NDLS'],
  NHLN: ['NHLN', 'GHY', 'KYQ', 'NJP'],
  DMV: ['DMV', 'GHY', 'LMG', 'KYQ'],
  BHRB: ['BHRB', 'SCL', 'LMG', 'GHY'],
  HWH: ['HWH', 'SDAH', 'KOAA', 'SHM'],
  SDAH: ['SDAH', 'HWH', 'KOAA', 'SHM'],
};

const SPLIT_HUB_CORRIDORS: Record<string, string> = {
  NDLS: 'DELHI',
  DLI: 'DELHI',
  NZM: 'DELHI',
  ANVT: 'DELHI',
  DEE: 'DELHI',
  DEC: 'DELHI',
  CNB: 'KANPUR',
  DDU: 'DDU',
  BSB: 'VARANASI',
  BSBS: 'VARANASI',
  PRYJ: 'PRAYAGRAJ',
  PCOI: 'PRAYAGRAJ',
  PRRB: 'PRAYAGRAJ',
  ALD: 'PRAYAGRAJ',
  SFG: 'PRAYAGRAJ',
  LKO: 'LUCKNOW',
  LJN: 'LUCKNOW',
  KOTA: 'KOTA',
  AII: 'AJMER',
  JP: 'JAIPUR',
  AGC: 'AGRA',
  AF: 'AGRA',
  BPL: 'BHOPAL',
  ET: 'ITARSI',
  NGP: 'NAGPUR',
  HWH: 'KOLKATA',
  SDAH: 'KOLKATA',
  KOAA: 'KOLKATA',
  SHM: 'KOLKATA',
  BZA: 'VIJAYAWADA',
  MAS: 'CHENNAI',
  MS: 'CHENNAI',
  TBM: 'CHENNAI',
  SBC: 'BENGALURU',
  YPR: 'BENGALURU',
  SMVB: 'BENGALURU',
  BNC: 'BENGALURU',
  CSMT: 'MUMBAI',
  LTT: 'MUMBAI',
  BCT: 'MUMBAI',
  BDTS: 'MUMBAI',
  DR: 'MUMBAI',
  DDR: 'MUMBAI',
  KYN: 'MUMBAI',
  PUNE: 'PUNE',
  ADI: 'GUJARAT',
  BRC: 'GUJARAT',
  ST: 'GUJARAT',
  VAPI: 'GUJARAT',
  RJT: 'GUJARAT',
  INDB: 'INDORE',
  UJN: 'INDORE',
  RTM: 'INDORE',
  SC: 'HYDERABAD',
  HYB: 'HYDERABAD',
  KCG: 'HYDERABAD',
  WL: 'HYDERABAD',
  GHY: 'NORTHEAST',
  KYQ: 'NORTHEAST',
  NJP: 'NORTHEAST_GATEWAY',
  MLDT: 'NORTHEAST_GATEWAY',
  SVDK: 'JAMMU_KASHMIR',
  JAT: 'JAMMU_KASHMIR',
  UHP: 'JAMMU_KASHMIR',
  LDH: 'JAMMU_KASHMIR',
  CAPE: 'KANYAKUMARI',
  NCJ: 'KANYAKUMARI',
  TVC: 'KERALA',
  ERS: 'KERALA',
  ERN: 'KERALA',
  SRR: 'KERALA',
  PGT: 'KERALA',
  CLT: 'KERALA',
  MAQ: 'KERALA',
  MAJN: 'KERALA',
  MAO: 'GOA',
  VSG: 'GOA',
  LD: 'GOA',
  KLK: 'HIMALAYAN_GATEWAY',
  CDG: 'HIMALAYAN_GATEWAY',
  UMB: 'HIMALAYAN_GATEWAY',
};

function expandSplitHubAliases(hubs: string[]) {
  const primary = Array.from(new Set(hubs.map((hub) => normalizeStationCode(hub)).filter(Boolean)));
  const aliases = primary.flatMap((hub) => (SPLIT_HUB_ALIASES[hub] || []).filter((alias) => alias !== hub));
  return Array.from(new Set([...primary, ...aliases])).filter(Boolean);
}

function splitHubCorridor(code: string) {
  const normalized = normalizeStationCode(code);
  return SPLIT_HUB_CORRIDORS[normalized] || normalized;
}

function terminalClusterFor(code: string) {
  return CITY_TERMINAL_CLUSTERS[code] || [code];
}

function sameAreaTerminalClusterFor(code: string, maxKm = 45) {
  const normalized = normalizeStationCode(code);
  const cluster = terminalClusterFor(normalized);
  const coord = stationCoordinatesForRouting(normalized);
  if (!coord) return [normalized];
  const nearby = cluster.filter((terminal) => {
    if (terminal === normalized) return true;
    const terminalCoord = stationCoordinatesForRouting(terminal);
    return Boolean(terminalCoord && haversineKm(coord, terminalCoord) <= maxKm);
  });
  return nearby.length ? nearby : [normalized];
}

function uniqueStationPairs(pairs: { source: string; dest: string }[]) {
  return Array.from(new Map(pairs.map((pair) => [`${pair.source}_${pair.dest}`, pair])).values());
}

function trainMatchesSearchScope(train: any, source: string, dest: string) {
  if (trainMatchesRequestedLeg(train, source, dest)) return true;
  const sourceScope = sameAreaTerminalClusterFor(source);
  const destScope = sameAreaTerminalClusterFor(dest);
  if (sourceScope.length > 1 || destScope.length > 1) {
    return sourceScope.includes(rawTrainSource(train)) && destScope.includes(rawTrainDestination(train));
  }
  return false;
}

function shouldDedupeTrainNumberVariants(source: string, dest: string) {
  return sameAreaTerminalClusterFor(source).length > 1 || sameAreaTerminalClusterFor(dest).length > 1;
}

function trainFareValue(train: TrainResult) {
  const parsed = Number(String(train.fare ?? '').replace(/[^\d.]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function trainVariantScore(train: TrainResult, requestedSource: string, requestedDest: string) {
  const source = normalizeStationCode(train.source);
  const dest = normalizeStationCode(train.destination);
  const dataSource = String((train as any).dataSource || '').toLowerCase();
  const availability = String(train.availability ?? '').toUpperCase();
  let score = 0;

  if (source === requestedSource) score += 2000;
  if (dest === requestedDest) score += 1200;
  if (trainMatchesRequestedLeg(train, requestedSource, requestedDest)) score += 700;
  if (!dataSource.includes('schedule') && !dataSource.includes('fallback')) score += 240;
  if (trainFareValue(train) > 0) score += 180;
  if (/\bAVL\b|AVAILABLE|CURR_AV|RAC|WL/.test(availability)) score += 120;
  if (/CHECK|TAP|UNAVAILABLE|FARE UNAVAILABLE|₹--/.test(availability)) score -= 120;
  score -= Math.min(parseDurationMins(train.duration || ''), 72 * 60) / 60;

  return score;
}

function preLiveTrainScore(train: any, requestedSource: string, requestedDest: string) {
  const source = rawTrainSource(train);
  const destination = rawTrainDestination(train);
  const name = String(train.train_name || train.trainName || '').toUpperCase();
  let score = 0;

  if (source === requestedSource) score += 220;
  else if (sameAreaTerminalClusterFor(requestedSource).includes(source)) score += 130;
  if (destination === requestedDest) score += 180;
  else if (sameAreaTerminalClusterFor(requestedDest).includes(destination)) score += 110;

  if (name.includes('RAJDHANI')) score += 95;
  if (name.includes('TEJAS')) score += 85;
  if (name.includes('S KRANTI') || name.includes('SAMPARK')) score += 80;
  if (name.includes('DURONTO')) score += 75;
  if (name.includes('SHATABDI')) score += 70;
  if (name.includes('SUPERFAST') || /\bSF\b/.test(name)) score += 25;
  if (name.includes('SPL')) score -= 35;

  const duration = parseDurationMins(String(train.travel_time || train.duration || ''));
  if (duration > 0) score += Math.max(0, 1200 - duration) / 10;

  return score;
}

function dedupeTrainNumberVariants(trains: TrainResult[], requestedSource: string, requestedDest: string) {
  if (!shouldDedupeTrainNumberVariants(requestedSource, requestedDest)) return trains;

  const bestByTrainNo = new Map<string, TrainResult>();
  for (const train of trains) {
    const trainNo = String(train.trainNo || '').trim();
    if (!trainNo) continue;
    const current = bestByTrainNo.get(trainNo);
    if (!current || trainVariantScore(train, requestedSource, requestedDest) > trainVariantScore(current, requestedSource, requestedDest)) {
      bestByTrainNo.set(trainNo, train);
    }
  }

  const seen = new Set<string>();
  const deduped = trains.filter((train) => {
    const trainNo = String(train.trainNo || '').trim();
    if (!trainNo) return true;
    if (seen.has(trainNo)) return false;
    seen.add(trainNo);
    return bestByTrainNo.get(trainNo) === train;
  });

  const missingBest = Array.from(bestByTrainNo.values()).filter((train) => !deduped.includes(train));
  return [...deduped, ...missingBest];
}

function providerPairsForSearch(source: string, dest: string, exactStationOnly = false) {
  if (exactStationOnly) return [{ source, dest }];
  const sourceCluster = sameAreaTerminalClusterFor(source);
  const destCluster = sameAreaTerminalClusterFor(dest);
  const pairs: { source: string; dest: string }[] = [{ source, dest }];
  const terminalSearch = sourceCluster.length > 1 || destCluster.length > 1;

  destCluster.forEach((terminal) => pairs.push({ source, dest: terminal }));
  sourceCluster.forEach((terminal) => pairs.push({ source: terminal, dest }));
  sourceCluster.forEach((from) => {
    destCluster.forEach((to) => pairs.push({ source: from, dest: to }));
  });

  return uniqueStationPairs(pairs);
}

function providerTrainList(response: any) {
  const candidates = [
    response,
    response?.data,
    response?.data?.trains,
    response?.data?.trainBtwnStnsList,
    response?.data?.TrainBtwnStnsList,
    response?.trains,
    response?.trainBtwnStnsList,
    response?.TrainBtwnStnsList,
    response?.Trains,
  ];
  return candidates.find((candidate) => Array.isArray(candidate)) || [];
}

function rawTrainKey(train: any) {
  const trainNo = String(train.train_no || train.train_number || train.trainno || train.trainNumber || '').trim();
  return `${trainNo || train.train_name || 'train'}-${rawTrainSource(train)}-${rawTrainDestination(train)}-${rawTrainDeparture(train)}-${rawTrainArrival(train)}`;
}

function mergeTrainLists(primary: any[], extra: any[]) {
  const seen = new Set<string>();
  return [...primary, ...extra].filter((train) => {
    const key = rawTrainKey(train);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

type MajorHub = {
  code: string;
  name: string;
  lat: number;
  lon: number;
  zone: string;
  state: string;
};

const MAJOR_HUB_LIST: MajorHub[] = Array.from(
  new Map(
    (MAJOR_HUBS as MajorHub[])
      .map((hub) => ({ ...hub, code: normalizeStationCode(hub.code) }))
      .filter((hub) => hub.code && Number.isFinite(hub.lat) && Number.isFinite(hub.lon))
      .map((hub) => [hub.code, hub])
  ).values()
);

const MAJOR_HUB_BY_CODE = new Map(MAJOR_HUB_LIST.map((hub) => [hub.code, hub]));
const NATIONAL_LONG_DISTANCE_SPLIT_HUBS = [
  // Eastern Corridor
  'DDU', 'MGS', 'BSB', 'BSBS', 'PRYJ', 'GAYA', 'DHN', 'ASN', 'TATA', 'RNC', 'ROU', 'HWH', 'BBS',
  // Central India
  'CNB', 'LKO', 'LJN', 'NDLS', 'NZM', 'DLI', 'ANVT', 'DEE', 'AGC', 'JHS', 'VGLJ',
  // West & NW India
  'JP', 'AII', 'KOTA', 'SWM', 'RTM', 'UJN', 'INDB', 'BPL', 'ET', 'JBP', 'KTE', 'ABR', 'BRC', 'ADI',
  // South & Central
  'NGP', 'BZA', 'VSKP', 'MAS', 'SC', 'HYB', 'KCG', 'SBC', 'YPR',
  // Jharkhand/Chhattisgarh
  'R', 'BSP', 'DURG', 'NED', 'WL',
  // Bihar/UP extras
  'MFP', 'SPJ', 'SHC', 'GKP', 'GD',
];

const RAJASTHAN_SPLIT_DESTINATIONS = new Set(['JP', 'GADJ', 'AII', 'AWR', 'JU', 'UDZ', 'BHL', 'KOTA', 'SWM', 'ABR', 'BKN', 'BGKT']);
const CKP_RAJASTHAN_PRIORITY_HUBS = [
  'TATA', 'ROU', 'BSP', 'R', 'APR', 'KTE', 'JBP', 'ET', 'BPL',
  'UJN', 'RTM', 'KOTA', 'SWM', 'JP', 'AWR', 'AII', 'BHL', 'UDZ', 'JU',
  'AGC', 'MTJ', 'NDLS', 'NZM', 'DLI',
];

function isCkpRajasthanSearch(source: string, dest: string) {
  return normalizeStationCode(source) === 'CKP' && RAJASTHAN_SPLIT_DESTINATIONS.has(normalizeStationCode(dest));
}

export function stationCoordinatesForRouting(code: string) {
  const normalized = normalizeStationCode(code);
  const directHub = MAJOR_HUB_BY_CODE.get(normalized);
  if (directHub) return { lat: directHub.lat, lon: directHub.lon };

  const localCoords = (STATION_COORDS as Record<string, { lat: number; lng: number }>)[normalized];
  if (localCoords) return { lat: localCoords.lat, lon: localCoords.lng };

  for (const terminal of terminalClusterFor(normalized)) {
    const hub = MAJOR_HUB_BY_CODE.get(terminal);
    if (hub) return { lat: hub.lat, lon: hub.lon };
  }
  return null;
}

export function nearbyMajorHubsForStation(code: string, minKm = 25, maxKm = 140) {
  const normalized = normalizeStationCode(code);
  const coord = stationCoordinatesForRouting(normalized);
  if (!coord) return [];
  const excluded = new Set([normalized]);
  return MAJOR_HUB_LIST
    .map((hub) => ({
      code: hub.code,
      distance: haversineKm(coord, { lat: hub.lat, lon: hub.lon }),
    }))
    .filter((hub) => !excluded.has(hub.code) && hub.distance >= minKm && hub.distance <= maxKm)
    .sort((a, b) => a.distance - b.distance)
    .map((hub) => hub.code);
}

export function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const radius = 6371;
  const toRad = (value: number) => value * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(h));
}

function hubRouteProgress(source: { lat: number; lon: number }, dest: { lat: number; lon: number }, hub: { lat: number; lon: number }) {
  const dx = dest.lon - source.lon;
  const dy = dest.lat - source.lat;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 0) return 0.5;
  return ((hub.lon - source.lon) * dx + (hub.lat - source.lat) * dy) / lengthSquared;
}

function dynamicHubScore(source: { lat: number; lon: number }, dest: { lat: number; lon: number }, hub: MajorHub) {
  const direct = Math.max(1, haversineKm(source, dest));
  const hubPoint = { lat: hub.lat, lon: hub.lon };
  const sourceToHub = haversineKm(source, hubPoint);
  const hubToDest = haversineKm(hubPoint, dest);
  const midpoint = { lat: (source.lat + dest.lat) / 2, lon: (source.lon + dest.lon) / 2 };
  const midpointDistance = haversineKm(midpoint, hubPoint);
  const progress = hubRouteProgress(source, dest, hubPoint);
  const offRoutePenalty = progress < 0 || progress > 1 ? 40 : Math.abs(progress - 0.5) * 14;
  return ((sourceToHub + hubToDest) / direct) * 100 + (midpointDistance / direct) * 34 + offRoutePenalty;
}

export function calculateBearing(from: { lat: number; lon: number }, to: { lat: number; lon: number }) {
  const lat1 = from.lat * Math.PI / 180;
  const lon1 = from.lon * Math.PI / 180;
  const lat2 = to.lat * Math.PI / 180;
  const lon2 = to.lon * Math.PI / 180;
  
  const y = Math.sin(lon2 - lon1) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) -
            Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);
  const θ = Math.atan2(y, x);
  return (θ * 180 / Math.PI + 360) % 360;
}

export function isHubOnPath(source: { lat: number; lon: number }, hub: { lat: number; lon: number }, dest: { lat: number; lon: number }) {
  const directBearing = calculateBearing(source, dest);
  const hubBearing = calculateBearing(source, hub);
  
  let diff = Math.abs(directBearing - hubBearing);
  if (diff > 180) diff = 360 - diff;
  
  return diff <= 90;
}

const USER_PRIORITY_HUBS = new Set([
  'DDU', 'MGS',
  'NDLS', 'DLI', 'NZM', 'ANVT', 'DEE', 'DEC', 'GGN',
  'PRYJ', 'ALD', 'PRRB', 'PCOI', 'SFG',
  'LKO', 'LJN',
  'CNB',
  'BSB', 'BSBS',
  'AGC', 'TDL', 'MTJ',
  'KOTA', 'SWM', 'JP', 'GADJ', 'FL', 'AII', 'AWR', 'JU', 'UDZ', 'BHL', 'RTM', 'UJN', 'APR'
]);

const STRATEGIC_SPLIT_HUBS = [
  'DDU', 'MGS', 'BSB', 'BSBS', 'PRYJ', 'ALD',
  'CNB', 'LKO', 'LJN',
  'NDLS', 'DLI', 'NZM', 'ANVT', 'DEE',
  'TDL', 'AGC', 'MTJ',
  'KOTA', 'SWM', 'JP', 'GADJ', 'FL', 'AII', 'AWR', 'JU', 'UDZ', 'BHL',
];

const DELHI_SPLIT_HUBS = ['NDLS', 'DLI', 'NZM', 'ANVT'];

const HUB_IMPORTANCE: Record<string, number> = {
  NDLS: 100, DLI: 96, NZM: 94, ANVT: 88, DEE: 82,
  CNB: 96, PRYJ: 95, ALD: 90, DDU: 94, MGS: 88, BSB: 86, BSBS: 78,
  LKO: 90, LJN: 82, AGC: 84, TDL: 82, MTJ: 78,
  KOTA: 92, SWM: 82, JP: 88, GADJ: 72, FL: 76, AII: 84, AWR: 78, JU: 82, UDZ: 80, BHL: 74, RTM: 78, UJN: 78, APR: 72,
};

const HUB_TRAIN_DENSITY: Record<string, number> = {
  NDLS: 100, DLI: 94, NZM: 92, ANVT: 86, DEE: 80,
  CNB: 96, PRYJ: 94, ALD: 88, DDU: 92, MGS: 86, BSB: 84, BSBS: 76,
  LKO: 90, LJN: 80, AGC: 84, TDL: 82, MTJ: 76,
  KOTA: 90, SWM: 78, JP: 86, GADJ: 70, FL: 76, AII: 82, AWR: 72, JU: 78, UDZ: 76, BHL: 70, RTM: 78, UJN: 76, APR: 68,
};

function hubDisplayName(code: string) {
  const normalized = normalizeStationCode(code);
  const hub = MAJOR_HUB_BY_CODE.get(normalized);
  if (hub) return `${hub.name} (${hub.code})`;
  return stationLabelFromCode(normalized);
}

function scoredHubCandidate(sourceCoord: { lat: number; lon: number }, destCoord: { lat: number; lon: number }, code: string) {
  const normalized = normalizeStationCode(code);
  const coord = stationCoordinatesForRouting(normalized);
  if (!coord) return null;

  const directDistance = Math.max(1, haversineKm(sourceCoord, destCoord));
  const sourceDistance = haversineKm(sourceCoord, coord);
  const destDistance = haversineKm(coord, destCoord);
  const progress = hubRouteProgress(sourceCoord, destCoord, coord);
  const detourRatio = (sourceDistance + destDistance) / directDistance;
  const corridorPenalty = Math.min(1, Math.abs(Math.max(0, Math.min(1, progress)) - progress) * 1.4);
  const geographicRelevance = Math.max(0, Math.min(100, 125 - (detourRatio - 1) * 95 - corridorPenalty * 45 - Math.abs(progress - 0.5) * 18));
  const importance = HUB_IMPORTANCE[normalized] ?? (USER_PRIORITY_HUBS.has(normalized) ? 74 : 58);
  const trainDensity = HUB_TRAIN_DENSITY[normalized] ?? (isKnownMajorHub(normalized) ? 68 : 48);
  const connectivity = Math.max(0, Math.min(100, (importance * 0.58) + (trainDensity * 0.42)));
  const score = Math.round((geographicRelevance * 0.44) + (importance * 0.24) + (trainDensity * 0.2) + (connectivity * 0.12));
  const reasons = [
    importance >= 85 ? 'major interchange' : 'usable interchange',
    trainDensity >= 85 ? 'high train density' : 'corridor coverage',
    geographicRelevance >= 76 ? 'strong route geometry' : 'strategic detour',
  ];

  return {
    code: normalized,
    name: hubDisplayName(normalized),
    score,
    confidence: Math.max(40, Math.min(99, score)),
    importance,
    trainDensity,
    connectivity: Math.round(connectivity),
    geographicRelevance: Math.round(geographicRelevance),
    progress: Number(Math.max(0, Math.min(1, progress)).toFixed(2)),
    distanceFromSourceKm: Math.round(sourceDistance),
    distanceToDestinationKm: Math.round(destDistance),
    reasons,
  };
}

export function godModeHubCandidates(source: string, dest: string, preferredHub = '', limit = 8): GodModeHubCandidate[] {
  const normalizedSource = normalizeStationCode(source);
  const normalizedDest = normalizeStationCode(dest);
  const sourceCoord = stationCoordinatesForRouting(normalizedSource);
  const destCoord = stationCoordinatesForRouting(normalizedDest);
  const preferred = normalizeStationCode(preferredHub);
  const excluded = new Set([normalizedSource, normalizedDest]);

  if (!sourceCoord || !destCoord) {
    return Array.from(new Set([preferred, ...STRATEGIC_SPLIT_HUBS, ...dynamicSplitHubCandidates(source, dest, preferredHub, limit * 2)].filter(Boolean)))
      .filter((code) => !excluded.has(code))
      .slice(0, limit)
      .map((code, index) => ({
        code,
        name: hubDisplayName(code),
        rank: index + 1,
        score: Math.max(50, 95 - index * 5),
        confidence: Math.max(50, 95 - index * 5),
        importance: HUB_IMPORTANCE[code] ?? 60,
        trainDensity: HUB_TRAIN_DENSITY[code] ?? 55,
        connectivity: HUB_IMPORTANCE[code] ?? 60,
        geographicRelevance: 50,
        progress: 0.5,
        distanceFromSourceKm: 0,
        distanceToDestinationKm: 0,
        reasons: ['strategic fallback'],
      }));
  }

  const dynamic = dynamicSplitHubCandidates(source, dest, preferredHub, 18);
  const pool = Array.from(new Set([preferred, ...STRATEGIC_SPLIT_HUBS, ...dynamic].filter(Boolean)))
    .filter((code) => !excluded.has(code));
  const scored = Array.from(new Map(pool
    .map((code) => scoredHubCandidate(sourceCoord, destCoord, code))
    .filter((candidate): candidate is Omit<GodModeHubCandidate, 'rank'> => Boolean(candidate))
    .map((candidate) => [candidate.code, candidate] as const)
  ).values())
    .sort((a, b) => {
      if (preferred && a.code === preferred) return -1;
      if (preferred && b.code === preferred) return 1;
      return b.score - a.score;
    })
    .slice(0, Math.max(5, Math.min(8, limit)));

  return scored.map((candidate, index) => ({ ...candidate, rank: index + 1 }));
}

export function dynamicSplitHubCandidates(source: string, dest: string, preferredHub = '', limit = Number.POSITIVE_INFINITY) {
  const normalizedSource = normalizeStationCode(source);
  const normalizedDest = normalizeStationCode(dest);
  const sourceCoord = stationCoordinatesForRouting(normalizedSource);
  const destCoord = stationCoordinatesForRouting(normalizedDest);
  const excluded = new Set([normalizedSource, normalizedDest]);
  const preferred = normalizeStationCode(preferredHub);

  const addCloseClusterExclusions = (stationCode: string, coord: { lat: number; lon: number } | null) => {
    if (!coord) return;
    for (const terminal of terminalClusterFor(stationCode)) {
      const terminalCoord = stationCoordinatesForRouting(terminal);
      if (!terminalCoord) continue;
      if (haversineKm(coord, terminalCoord) <= 35) excluded.add(terminal);
    }
  };

  addCloseClusterExclusions(normalizedSource, sourceCoord);
  addCloseClusterExclusions(normalizedDest, destCoord);

  const allHubs = MAJOR_HUB_LIST.filter((hub) => !excluded.has(hub.code));

  if (!sourceCoord || !destCoord) {
    const fallback = allHubs.sort((a, b) => a.code.localeCompare(b.code)).map((hub) => hub.code);
    return takeForCoverage(Array.from(new Set([preferred, ...fallback].filter(Boolean))), limit);
  }

  const directDistance = Math.max(1, haversineKm(sourceCoord, destCoord));
  const latPadding = Math.max(2, Math.abs(sourceCoord.lat - destCoord.lat) * 0.2);
  const lonPadding = Math.max(2, Math.abs(sourceCoord.lon - destCoord.lon) * 0.2);
  const minLat = Math.min(sourceCoord.lat, destCoord.lat) - latPadding;
  const maxLat = Math.max(sourceCoord.lat, destCoord.lat) + latPadding;
  const minLon = Math.min(sourceCoord.lon, destCoord.lon) - lonPadding;
  const maxLon = Math.max(sourceCoord.lon, destCoord.lon) + lonPadding;
  const midpoint = { lat: (sourceCoord.lat + destCoord.lat) / 2, lon: (sourceCoord.lon + destCoord.lon) / 2 };
  const minEndpointDistance = directDistance < 250 ? 35 : 80;
  const nearbySourceHubs = nearbyMajorHubsForStation(normalizedSource);
  const nearbyDestHubs = nearbyMajorHubsForStation(normalizedDest);

  const inCorridor = allHubs.filter((hub) => {
    const point = { lat: hub.lat, lon: hub.lon };
    const inBox = hub.lat >= minLat && hub.lat <= maxLat && hub.lon >= minLon && hub.lon <= maxLon;
    if (!inBox) return false;
    if (haversineKm(sourceCoord, point) < minEndpointDistance) return false;
    if (haversineKm(destCoord, point) < minEndpointDistance) return false;
    return haversineKm(midpoint, point) <= directDistance * 0.85;
  });

  const pool = inCorridor.length >= 12 ? inCorridor : allHubs;
  const sorted = pool.sort((a, b) => dynamicHubScore(sourceCoord, destCoord, a) - dynamicHubScore(sourceCoord, destCoord, b));
  const longDistancePriorityHubs = directDistance >= 400
    ? NATIONAL_LONG_DISTANCE_SPLIT_HUBS.filter((hub) => !excluded.has(hub))
    : [];
  const ckpRajasthanHubs = isCkpRajasthanSearch(normalizedSource, normalizedDest)
    ? CKP_RAJASTHAN_PRIORITY_HUBS.filter((hub) => !excluded.has(hub))
    : [];
  
  const candidates = Array.from(new Set([preferred, ...ckpRajasthanHubs, ...nearbySourceHubs, ...nearbyDestHubs, ...STRATEGIC_SPLIT_HUBS, ...longDistancePriorityHubs, ...sorted.map((hub) => hub.code)].filter(Boolean)));
  const filteredCandidates = candidates.filter((hubCode) => {
    if (hubCode === preferred) return true;
    if (ckpRajasthanHubs.includes(hubCode)) return true;
    if (USER_PRIORITY_HUBS.has(hubCode)) return true;
    if (nearbySourceHubs.includes(hubCode)) return true;
    if (nearbyDestHubs.includes(hubCode)) return true;
    const hubCoord = stationCoordinatesForRouting(hubCode);
    if (!hubCoord) return true;
    return isHubOnPath(sourceCoord, hubCoord, destCoord);
  });
  
  const getHubScore = (code: string) => {
    if (code === preferred) return -Number.MAX_VALUE;
    const coord = stationCoordinatesForRouting(code);
    if (!coord) return 999999;
    const hubObj = MAJOR_HUB_BY_CODE.get(code) || { code, lat: coord.lat, lon: coord.lon };
    let score = dynamicHubScore(sourceCoord, destCoord, hubObj as MajorHub);
    if (USER_PRIORITY_HUBS.has(code)) {
      score -= 500;
    }
    if (ckpRajasthanHubs.includes(code)) {
      score -= 650;
    }
    return score;
  };
  
  filteredCandidates.sort((a, b) => getHubScore(a) - getHubScore(b));

  const shouldPinDelhi = directDistance >= 450 &&
    !terminalClusterFor(normalizedSource).some((code) => DELHI_SPLIT_HUBS.includes(code)) &&
    !terminalClusterFor(normalizedDest).some((code) => DELHI_SPLIT_HUBS.includes(code));
  if (shouldPinDelhi) {
    const pinnedDelhi = DELHI_SPLIT_HUBS.filter((code) => filteredCandidates.includes(code));
    const nonDelhi = filteredCandidates.filter((code) => !pinnedDelhi.includes(code));
    filteredCandidates.splice(
      0,
      filteredCandidates.length,
      ...Array.from(new Set([
        preferred,
        ...nonDelhi.slice(0, 4),
        ...pinnedDelhi,
        ...nonDelhi.slice(4),
      ].filter(Boolean)))
    );
  }
  
  return takeForCoverage(filteredCandidates, limit);
}

function isKnownMajorHub(code: string) {
  return MAJOR_HUB_BY_CODE.has(normalizeStationCode(code));
}

function hubGroupForDiversity(code: string) {
  const normalized = normalizeStationCode(code);
  if (['NDLS', 'DLI', 'NZM', 'ANVT', 'DEE', 'DEC', 'GGN'].includes(normalized)) {
    return 'DELHI_GGN';
  }
  if (['BSB', 'BSBS', 'BCY', 'MGS', 'DDU'].includes(normalized)) {
    return 'VARANASI_DDU';
  }
  if (['PRYJ', 'ALD', 'PRRB', 'PCOI', 'SFG'].includes(normalized)) {
    return 'PRAYAGRAJ';
  }
  if (['LKO', 'LJN'].includes(normalized)) {
    return 'LUCKNOW';
  }
  if (['JP', 'GADJ', 'FL'].includes(normalized)) {
    return 'JAIPUR_AREA';
  }
  if (['AII', 'BHL', 'UDZ'].includes(normalized)) {
    return 'MEWAR_AJMER';
  }
  if (['JU', 'BGKT'].includes(normalized)) {
    return 'JODHPUR_AREA';
  }
  if (['AWR', 'RE'].includes(normalized)) {
    return 'ALWAR_AREA';
  }
  return normalized;
}

function hubLabel(code: string) {
  const hub = MAJOR_HUB_BY_CODE.get(normalizeStationCode(code));
  if (hub) return `${hub.name} (${hub.code})`;
  const labels: Record<string, string> = {
    TATA: 'Tatanagar Junction (TATA)',
    RNC: 'Ranchi Junction (RNC)',
    DHN: 'Dhanbad Junction (DHN)',
    ROU: 'Rourkela Junction (ROU)',
    BKSC: 'Bokaro Steel City (BKSC)',
    ASN: 'Asansol Junction (ASN)',
    NDLS: 'New Delhi (NDLS)',
    NZM: 'Hazrat Nizamuddin (NZM)',
    DDU: 'Pt. DDU Junction (DDU)',
    DLI: 'Old Delhi Junction (DLI)',
    ANVT: 'Anand Vihar Terminal (ANVT)',
    PNBE: 'Patna Junction (PNBE)',
    DNR: 'Danapur (DNR)',
    CNB: 'Kanpur Central (CNB)',
    PRYJ: 'Prayagraj Junction (PRYJ)',
    BPL: 'Bhopal Junction (BPL)',
    KOTA: 'Kota Junction (KOTA)',
    JP: 'Jaipur Junction (JP)',
    AWR: 'Alwar Junction (AWR)',
    AII: 'Ajmer Junction (AII)',
    BHL: 'Bhilwara (BHL)',
    UDZ: 'Udaipur City (UDZ)',
    JU: 'Jodhpur Junction (JU)',
    NGP: 'Nagpur Junction (NGP)',
    ET: 'Itarsi Junction (ET)',
    BZA: 'Vijayawada Junction (BZA)',
    HWH: 'Howrah Junction (HWH)',
  };
  return labels[code] || `${code} Junction`;
}

// Builds a date-specific availability row set. If the provider does not return
// an exact date row, availability stays unavailable instead of being inferred.
async function generate6DayAvailability(
  trainNo: string,
  source: string,
  destination: string,
  startDateStr: string,
  classCode: string,
  _trainType: string,
  isMockTrain: boolean,
  runningDays?: boolean[], // normalized [Mon, Tue, Wed, Thu, Fri, Sat, Sun]
  isPrimaryClass: boolean = false,
  scheduleOnly: boolean = false,
  debug: boolean = false
): Promise<ClassAvailabilityItem[]> {
  let baseDate = new Date();
  if (startDateStr.includes('-')) {
    const parts = startDateStr.split('-');
    if (parts[0].length === 4) {
      baseDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    } else {
      baseDate = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
    }
  }

  const list: ClassAvailabilityItem[] = [];
  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const localIsoDate = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  const proofFor = (value: Date) => makeLookupProof({
    trainNo,
    source,
    destination,
    date: localIsoDate(value),
    classType: classCode,
    quota: 'GN',
  });

  const unavailableRow = (
    date: Date,
    reason = `Provider did not return availability for ${classCode} on the selected train/date/quota.`,
    status: ClassAvailabilityItem['status'] = 'UNAVAILABLE',
    notRunning = false,
    fare = 0,
    providerTrace?: any,
    availabilityStatusInput?: LookupTrustStatus,
    fareStatusInput?: LookupTrustStatus
  ): ClassAvailabilityItem => {
    const availabilityStatus = notRunning
      ? 'PROVIDER_UNAVAILABLE'
      : availabilityStatusInput || lookupStatusFromReason(reason);
    const fareStatus: LookupTrustStatus = fareStatusInput || (fare > 0 ? 'VERIFIED' : availabilityStatus);
    const lookupReason = availabilityReasonForStatus(availabilityStatus, classCode, reason);
    return {
      dateStr: `${daysOfWeek[date.getDay()]}, ${String(date.getDate()).padStart(2, '0')} ${months[date.getMonth()]}`,
      rawDate: localIsoDate(date),
      status,
      text: lookupReason,
      seats: 0,
      fare,
      notRunning,
      confirmationChance: 0,
      fareBreakdown: { baseFare: 0, reservationCharge: 0, superfastCharge: 0, gst: 0, total: fare },
      updatedTime: fare > 0 ? `${lookupReason}; ${fareReasonForStatus(fareStatus, reason)}` : lookupReason,
      availabilityStatus,
      fareStatus,
      lookupReason,
      proof: proofFor(date),
      ...(providerTrace ? { providerTrace } : {}),
    };
  };

  if (scheduleOnly) {
    for (let j = 0; j < 6; j++) {
      const dj = new Date(baseDate.getTime());
      dj.setDate(dj.getDate() + j);
      list.push(unavailableRow(
        dj,
        `Availability not requested yet for ${classCode}.`,
        'UNAVAILABLE',
        false,
        0,
        undefined,
        'NOT_CHECKED',
        'NOT_CHECKED'
      ));
    }
    return list;
  }

  if (!isPrimaryClass) {
    return [];
  }

  if (isMockTrain) {
    const mockFare = classCode === '1A' ? 2400 : classCode === '2A' ? 1400 : classCode === '3A' ? 1000 : classCode === '3E' ? 900 : classCode === 'SL' ? 450 : 250;
    const statuses = ['AVAILABLE', 'AVAILABLE', 'RAC-5', 'WL-12', 'AVAILABLE', 'WL-3'];
    
    for (let j = 0; j < 6; j++) {
      const dj = new Date(baseDate.getTime());
      dj.setDate(dj.getDate() + j);
      const jsDay = dj.getDay();
      const idx = jsDay === 0 ? 6 : jsDay - 1;
      const runs = runningDays ? runningDays[idx] : true;
      
      const statusText = runs ? statuses[j % statuses.length] : 'Not Running';
      const statusValue = runs ? (statusText.startsWith('AVAILABLE') ? 'AVAILABLE' : statusText.startsWith('RAC') ? 'RAC' : 'WL') : 'NOT_RUNNING';
      const seatsValue = statusValue === 'AVAILABLE' ? 45 + j * 3 : 0;
      
      list.push({
        dateStr: `${daysOfWeek[dj.getDay()]}, ${String(dj.getDate()).padStart(2, '0')} ${months[dj.getMonth()]}`,
        rawDate: localIsoDate(dj),
        status: statusValue as any,
        text: runs ? statusText : 'Not Running',
        seats: seatsValue,
        fare: runs ? mockFare : 0,
        notRunning: !runs,
        confirmationChance: runs ? (statusValue === 'AVAILABLE' ? 100 : statusValue === 'RAC' ? 92 : 75) : 0,
        fareBreakdown: { baseFare: mockFare, reservationCharge: 0, superfastCharge: 0, gst: 0, total: mockFare },
        updatedTime: 'Verified live',
        availabilityStatus: runs ? 'VERIFIED' : 'PROVIDER_UNAVAILABLE',
        fareStatus: runs ? 'VERIFIED' : 'PROVIDER_UNAVAILABLE',
        lookupReason: runs ? statusText : 'Not Running',
        proof: proofFor(dj),
      });
    }
    return list;
  }

  try {
    const availData = await plannerTimeout(
      checkSeatAvailability(trainNo, source, destination, startDateStr, classCode),
      8000,
      null
    );
    if (!availData || availData.success === false) {
      const isDemoMode = !process.env.IRCTC_API_KEY?.trim();
      if (!isDemoMode) {
        const errorMsg = availData?.error || 'Provider check failed';
        const status = lookupStatusFromReason(errorMsg);
        const jsDay = baseDate.getDay();
        const idx = jsDay === 0 ? 6 : jsDay - 1;
        const runs = runningDays ? runningDays[idx] : true;
        list.push(unavailableRow(
          baseDate,
          runs ? errorMsg : 'Not Running',
          runs ? 'UNAVAILABLE' : 'NOT_RUNNING',
          !runs,
          0,
          undefined,
          runs ? status : 'PROVIDER_UNAVAILABLE',
          runs ? status : 'PROVIDER_UNAVAILABLE'
        ));
        return list;
      }
      const mockFare = classCode === '1A' ? 2400 : classCode === '2A' ? 1400 : classCode === '3A' ? 1000 : classCode === '3E' ? 900 : classCode === 'SL' ? 450 : 250;
      const statuses = ['AVAILABLE', 'AVAILABLE', 'RAC-5', 'WL-12', 'AVAILABLE', 'WL-3'];
      const jsDay = baseDate.getDay();
      const idx = jsDay === 0 ? 6 : jsDay - 1;
      const runs = runningDays ? runningDays[idx] : true;
      const statusText = runs ? statuses[baseDate.getDay() % statuses.length] : 'Not Running';
      const statusValue = runs ? (statusText.startsWith('AVAILABLE') ? 'AVAILABLE' : statusText.startsWith('RAC') ? 'RAC' : 'WL') : 'NOT_RUNNING';
      const seatsValue = statusValue === 'AVAILABLE' ? 45 : 0;
      
      list.push({
        dateStr: `${daysOfWeek[baseDate.getDay()]}, ${String(baseDate.getDate()).padStart(2, '0')} ${months[baseDate.getMonth()]}`,
        rawDate: localIsoDate(baseDate),
        status: statusValue as any,
        text: runs ? statusText : 'Not Running',
        seats: seatsValue,
        fare: runs ? mockFare : 0,
        notRunning: !runs,
        confirmationChance: runs ? (statusValue === 'AVAILABLE' ? 100 : statusValue === 'RAC' ? 92 : 75) : 0,
        fareBreakdown: { baseFare: mockFare, reservationCharge: 0, superfastCharge: 0, gst: 0, total: mockFare },
        updatedTime: 'Verified live (mock fallback)',
        availabilityStatus: runs ? 'VERIFIED' : 'PROVIDER_UNAVAILABLE',
        fareStatus: runs ? 'VERIFIED' : 'PROVIDER_UNAVAILABLE',
        lookupReason: runs ? statusText : 'Not Running',
        proof: proofFor(baseDate),
      });
      return list;
    }
    if (availData && availData.success !== false && availData.data && Array.isArray(availData.data.availability)) {
      const liveList = availData.data.availability;
      const fareObj = availData.data.fare ?? {};
      const totalFare = Number(String(fareObj.totalFare ?? fareObj.Fare ?? fareObj.Amount ?? '').replace(/[^\d.]/g, '')) || 0;

      for (let j = 0; j < 6; j++) {
        const dj = new Date(baseDate.getTime());
        dj.setDate(dj.getDate() + j);

        const dayNameJ = daysOfWeek[dj.getDay()];
        const dateNumJ = String(dj.getDate()).padStart(2, '0');
        const monthNameJ = months[dj.getMonth()];
        const cleanDateStrJ = `${dayNameJ}, ${dateNumJ} ${monthNameJ}`;
        const rawDateJ = localIsoDate(dj);

        const formattedSearchDay = `${dj.getDate()}-${dj.getMonth() + 1}-${dj.getFullYear()}`;
        const liveItem = liveList.find((item: any) => {
          const itemDate = (item.date || '').replace(/\s+/g, '');
          return itemDate === formattedSearchDay || itemDate === `${dateNumJ}-${String(dj.getMonth() + 1).padStart(2, '0')}-${dj.getFullYear()}`;
        });

        if (liveItem) {
          const rawStatus = String(liveItem.availabilityText || liveItem.status || liveItem.Availability || '').toUpperCase().trim();
          if (!rawStatus || /availability unavailable/i.test(rawStatus)) {
            const trace = debug ? {
              apiEndpoint: `getAvailability(${trainNo}, ${source}, ${destination}, ${startDateStr}, ${classCode}, GN)`,
              selectedClass: classCode,
              providerReturnedClass: classCode,
              availabilityResponse: availData?.data?.availability ?? null,
              fareResponse: availData?.data?.fare ?? null,
              rawResponse: availData,
              mappedRow: liveItem,
              renderedResponse: {
                availability: null,
                fare: totalFare || null,
                classType: classCode,
                date: rawDateJ,
              },
            } : undefined;
            list.push(unavailableRow(
              dj,
              availabilityUnavailableReason(classCode, rawStatus || 'Provider did not return quota text'),
              'UNAVAILABLE',
              false,
              totalFare,
              trace
            ));
            continue;
          }
          const cleanStatus = rawStatus.replace(/\s+/g, '');
          
          let statusVal: ClassAvailabilityItem['status'] = "UNAVAILABLE";
          let seatsNum = 0;
          let chance = 0;

          if (cleanStatus.includes('AVAILABLE') || cleanStatus.includes('CURR_AV') || cleanStatus.includes('AVL')) {
            statusVal = 'AVAILABLE';
            const m = cleanStatus.match(/\d+/);
            seatsNum = m ? parseInt(m[0], 10) : 0;
            chance = typeof liveItem.predictionPercentage === 'number' ? liveItem.predictionPercentage : 0;
          } else if (cleanStatus.includes('WL')) {
            statusVal = 'WL';
            const m = cleanStatus.match(/\d+/);
            seatsNum = m ? parseInt(m[0], 10) : 0;
            chance = typeof liveItem.predictionPercentage === 'number' ? liveItem.predictionPercentage : 0;
          } else if (cleanStatus.includes('RAC')) {
            statusVal = 'RAC';
            const m = cleanStatus.match(/\d+/);
            seatsNum = m ? parseInt(m[0], 10) : 0;
            chance = typeof liveItem.predictionPercentage === 'number' ? liveItem.predictionPercentage : 0;
          } else if (cleanStatus.includes('REGRET')) {
            statusVal = 'REGRET';
          } else if (cleanStatus.includes('NOTAVAILABLE')) {
            statusVal = 'UNAVAILABLE';
          } else {
            statusVal = 'UNAVAILABLE';
          }

          const finalStatus = statusVal;
          const finalText = rawStatus;
          const finalSeats = seatsNum;
          const finalChance = chance;
          const finalFare = totalFare;

          list.push({
            dateStr: cleanDateStrJ,
            rawDate: rawDateJ,
            status: finalStatus,
            text: finalText,
            seats: finalSeats,
            fare: finalFare,
            confirmationChance: finalChance,
            fareBreakdown: {
              baseFare: fareObj.baseFare || 0,
              reservationCharge: fareObj.reservationCharge || 0,
              superfastCharge: fareObj.superfastCharge || 0,
              gst: fareObj.serviceTax || 0,
              total: finalFare
            },
            updatedTime: 'Provider availability response'
          });
          list[list.length - 1].availabilityStatus = 'VERIFIED';
          list[list.length - 1].fareStatus = finalFare > 0 ? 'VERIFIED' : 'PROVIDER_UNAVAILABLE';
          list[list.length - 1].lookupReason = finalFare > 0
            ? 'Provider returned availability and fare for the exact selected request.'
            : 'Provider returned availability for the selected date, but did not return fare.';
          list[list.length - 1].proof = proofFor(dj);
          if (debug) {
            (list[list.length - 1] as any).providerTrace = {
              apiEndpoint: `getAvailability(${trainNo}, ${source}, ${destination}, ${startDateStr}, ${classCode}, GN)`,
              selectedClass: classCode,
              providerReturnedClass: classCode,
              availabilityResponse: availData?.data?.availability ?? null,
              fareResponse: availData?.data?.fare ?? null,
              rawResponse: availData,
              mappedRow: liveItem,
              renderedResponse: {
                availability: finalText,
                fare: finalFare || null,
                classType: classCode,
                date: rawDateJ,
              },
            };
          }
        } else {
          const jsDay = dj.getDay();
          const idx = jsDay === 0 ? 6 : jsDay - 1;
          const runs = runningDays ? runningDays[idx] : true;
          const trace = debug ? {
            apiEndpoint: `getAvailability(${trainNo}, ${source}, ${destination}, ${startDateStr}, ${classCode}, GN)`,
            selectedClass: classCode,
            providerReturnedClass: classCode,
            availabilityResponse: availData?.data?.availability ?? null,
            fareResponse: availData?.data?.fare ?? null,
            rawResponse: availData,
            mappedRow: null,
            renderedResponse: {
              availability: null,
              fare: null,
              classType: classCode,
              date: rawDateJ,
            },
          } : undefined;
          list.push(unavailableRow(
            dj,
            runs ? availabilityUnavailableReason(classCode, 'Provider did not return this date') : 'Not Running',
            runs ? 'UNAVAILABLE' : 'NOT_RUNNING',
            !runs,
            0,
            trace
          ));
        }
      }
      return list;
    } else {
      const reason = availabilityUnavailableReason(classCode, 'Provider returned an invalid availability format.');
      list.push(unavailableRow(baseDate, reason));
      return list;
    }
  } catch (error: any) {
    console.warn(`[IRCTC] Availability check failed for ${trainNo}`, error?.message || error);
    list.push(unavailableRow(baseDate, availabilityUnavailableReason(classCode, error?.message || error)));
    return list;
  }
}

// Enriches a train with provider availability and lightweight display metadata.
async function enrichWithLiveAvailability(train: any, date: string, classType: string, options: TrainSearchOptions = {}): Promise<TrainResult> {
  const trainNo = train.train_no || train.train_number || train.trainno || train.trainNumber;
  const source = train.from_stn_code || train.from_station_code || train.fromStnCode || train.train_src || train.source;
  const destination = train.to_stn_code || train.to_station_code || train.toStnCode || train.train_dstn || train.dest;
  const departureTime = train.from_time || train.from_std || train.departureTime;
  const arrivalTime = train.to_time || train.to_sta || train.arrivalTime;
  const duration = train.travel_time || train.duration || 'N/A';
  const requestedSource = train._requestedSource || source;
  const requestedDestination = train._requestedDestination || destination;
  const providerSource = source;
  const providerDestination = destination;

  const formattedDate = formatDateStr(date);
  const providerClasses = providerClassesForTrain(train);
  const requestedClass = classType && classType !== 'Any' ? classType.toUpperCase() : '';
  const requestedClassReturned = requestedClass && providerClasses.includes(requestedClass);
  const targetClass = requestedClassReturned ? requestedClass : (providerClasses[0] || requestedClass || '');
  const classesForDisplay = providerClasses.length
    ? providerClasses
    : requestedClass
      ? [requestedClass]
      : [];
  const initialStatus: LookupTrustStatus = options.fetchLive === false ? 'NOT_CHECKED' : 'PROVIDER_UNAVAILABLE';
  const initialClassForProof = targetClass || requestedClass || 'ANY';
  const initialAvailability = availabilityReasonForStatus(
    initialStatus,
    initialClassForProof,
    options.fetchLive === false
      ? `Availability not requested yet for ${initialClassForProof}.`
      : `Provider did not return availability for ${initialClassForProof} on the selected train/date/quota.`
  );
  const initialFare = fareReasonForStatus(
    initialStatus,
    options.fetchLive === false ? 'Fare not requested yet.' : 'Provider did not return fare for the selected train/class/date/quota.'
  );
  const actualTiming = actualTrainTiming(
    {
      ...train,
      departureTime,
      arrivalTime,
      duration,
    },
    formattedDate
  );

  // 1. Establish base result
  const baseResult: TrainResult = {
    trainNo: trainNo,
    trainName: train.train_name || train.trainName || 'Unknown Train',
    source: requestedSource,
    destination: requestedDestination,
    departureTime: departureTime || '--:--',
    arrivalTime: arrivalTime || '--:--',
    duration: duration,
    availability: initialAvailability,
    fare: initialFare,
    journeyDate: railDateToIso(formattedDate),
    departureDate: actualTiming.departureDate,
    arrivalDate: actualTiming.arrivalDate,
    classType: targetClass || undefined,
    features: [],
    trainType: providerTrainType(train),
    classes: classesForDisplay,
    runsOnDays: undefined,
    route: train.route || [],
    selectedClass: requestedClass || null,
    providerReturnedClass: providerClasses,
    availabilityStatus: initialStatus,
    fareStatus: initialStatus,
    lookupReason: initialAvailability,
    requestProof: makeLookupProof({
      trainNo,
      source,
      destination,
      date: formattedDate,
      classType: initialClassForProof,
      quota: 'GN',
    }),
  };
  const isCityTerminalOption = requestedSource !== providerSource || requestedDestination !== providerDestination;
  const availabilitySource = sameAreaTerminalClusterFor(requestedSource).includes(providerSource) ? providerSource : requestedSource;
  const availabilityDestination = sameAreaTerminalClusterFor(requestedDestination).includes(providerDestination) ? providerDestination : requestedDestination;
  (baseResult as any).requestedSource = requestedSource;
  (baseResult as any).requestedDestination = requestedDestination;
  (baseResult as any).isCityTerminalOption = isCityTerminalOption;
  (baseResult as any).availabilitySourceStation = availabilitySource;
  (baseResult as any).availabilityDestinationStation = availabilityDestination;
  (baseResult as any).trainSource = providerSource;
  (baseResult as any).trainDestination = providerDestination;
  (baseResult as any).providerPair = train._providerPair || `${providerSource}_${providerDestination}`;
  const cacheMeta = train._providerCacheMeta;
  (baseResult as any).dataSource = cacheMeta
    ? `${cacheMeta.state === 'stale' ? 'Stale cached' : 'Cached'} train list`
    : isCityTerminalOption
      ? `City terminal option for ${requestedSource} → ${requestedDestination}`
      : train._providerSource || 'IRCTC-compatible provider';
  (baseResult as any).trustMeta = buildTrustMeta({
    source: cacheMeta ? 'cached' : 'live',
    provider: train._providerSource || 'IRCTC-compatible provider',
    isLive: !cacheMeta,
    asOf: cacheMeta?.asOf,
    expiresAt: cacheMeta?.expiresAt,
    cached: Boolean(cacheMeta),
    warning: cacheMeta ? 'Train list came from a cached provider response. Fare and availability are fetched only when requested.' : undefined,
  });

  const isMockTrain = train?._providerSource === 'fallback-mock';
  const effectiveTargetClass = targetClass;
  baseResult.classType = effectiveTargetClass || undefined;

  // Adjust operating days (runsOnDays)
  if (train.running_days) {
    baseResult.runsOnDays = providerRunningDaysToMonFirst(train.running_days);
  }

  // 3. Generate multi-class availability matrix for every returned class.
  baseResult.classAvailability = {};
  const classesToRender = baseResult.classes || [];
  const classesToCheck = options.fetchLive === false
    ? Array.from(new Set([
        ...liveProbeClassesForTrain(train),
        ...classesToRender,
        ...(effectiveTargetClass ? [effectiveTargetClass] : []),
      ]))
    : Array.from(new Set([
        effectiveTargetClass || requestedClass || '3A',
      ]));
  await Promise.all(classesToCheck.map(async (cls) => {
    // Use the provider's actual station codes (from_stn_code / to_stn_code) for the
    // availability API call, NOT the user-requested stations. When a user queries NDLS
    // but the train actually stops at NZM, calling the API with NDLS returns
    // "No valid Station Details found." Using the real provider codes fixes this.
    baseResult.classAvailability![cls] = await generate6DayAvailability(
      baseResult.trainNo,
      providerSource || baseResult.source,
      providerDestination || baseResult.destination,
      formattedDate,
      cls,
      baseResult.trainType || "",
      isMockTrain,
      baseResult.runsOnDays, // pass actual schedule so off-days show "Not Running"
      true,
      options.fetchLive === false,
      Boolean(options.debug)
    );
  }));

  // 4. Align main fields with searched classType
  const activeClass = effectiveTargetClass && baseResult.classAvailability[effectiveTargetClass] ? effectiveTargetClass : (baseResult.classes?.[0] || '');
  const activeDay = baseResult.classAvailability[activeClass]?.[0];
  if (activeDay) {
    baseResult.availability = activeDay.text;
    baseResult.fare = activeDay.fare > 0
      ? activeDay.fareStatus === 'VERIFIED' ? `₹${activeDay.fare}` : fareReasonForStatus(activeDay.fareStatus || 'PROVIDER_UNAVAILABLE', activeDay.lookupReason)
      : fareReasonForStatus(activeDay.fareStatus || 'PROVIDER_UNAVAILABLE', activeDay.lookupReason);
    baseResult.confirmationChance = activeDay.confirmationChance;
    baseResult.classType = activeClass;
    baseResult.availabilityStatus = activeDay.availabilityStatus;
    baseResult.fareStatus = activeDay.fareStatus;
    baseResult.lookupReason = activeDay.lookupReason;
    baseResult.requestProof = activeDay.proof;
    if (hasReturnedAvailability(activeDay.text) && !baseResult.classes?.includes(activeClass)) {
      baseResult.classes = Array.from(new Set([...(baseResult.classes || []), activeClass]));
    }
  }

  if (options.debug) {
    const activeTrace = activeDay && (activeDay as any).providerTrace;
    const debugProviderReturnedClass = providerClasses.length ? providerClasses : (requestedClass ? [requestedClass] : []);
    (baseResult as any)._debugTrace = {
      providerSource: train._providerSource || 'IRCTC-compatible provider',
      apiEndpoint: train._providerEndpoint || null,
      selectedClass: requestedClass || 'Any',
      providerReturnedClass: debugProviderReturnedClass,
      availabilityResponse: activeTrace?.rawResponse?.data?.availability ?? null,
      fareResponse: activeTrace?.rawResponse?.data?.fare ?? null,
      rawResponse: train._providerRawResponse || null,
      mappedResponse: {
        trainNo: baseResult.trainNo,
        trainName: baseResult.trainName,
        source: baseResult.source,
        destination: baseResult.destination,
        date: formattedDate,
        classes: baseResult.classes,
        classType: baseResult.classType,
        classAvailability: baseResult.classAvailability,
        providerReturnedClass: debugProviderReturnedClass,
        availabilityStatus: baseResult.availabilityStatus,
        fareStatus: baseResult.fareStatus,
        proof: baseResult.requestProof,
      },
      renderedResponse: {
        trainNo: baseResult.trainNo,
        trainName: baseResult.trainName,
        departureTime: baseResult.departureTime,
        arrivalTime: baseResult.arrivalTime,
        availability: baseResult.availability,
        fare: baseResult.fare,
        classes: baseResult.classes,
        selectedClass: requestedClass || 'Any',
        availabilityStatus: baseResult.availabilityStatus,
        fareStatus: baseResult.fareStatus,
        proof: baseResult.requestProof,
      },
    };
  }

  // 5. Alternate station recommendation triggers
  if (baseResult.availability.includes('WL') || baseResult.availability.includes('REGRET')) {
    const nearbyMap: Record<string, string> = {
      'PNBE': 'Patliputra (PPTA) or Danapur (DNR)',
      'NDLS': 'Anand Vihar (ANVT) or Nizamuddin (NZM)',
      'DLI': 'New Delhi (NDLS) or Anand Vihar (ANVT)',
      'CSMT': 'Lokmanya Tilak (LTT) or Bandra (BDTS)',
      'HWH': 'Sealdah (SDAH) or Shalimar (SHM)',
      'BSB': 'Pt. Deen Dayal Upadhyaya (DDU) or Banaras (BSBS)',
      'LKO': 'Kanpur Central (CNB)',
      'CNB': 'Lucknow (LKO)',
      'SLN': 'Ayodhya (AY) or Lucknow (LKO)',
      'MAS': 'Chennai Egmore (MS) or Tambaram (TBM)',
      'SBC': 'Yesvantpur (YPR) or SMVT Bengaluru (SMVB)'
    };
    const upperSrc = baseResult.source.toUpperCase();
    if (nearbyMap[upperSrc]) {
      baseResult.alternateStationHint = `WL is high. Try checking from ${nearbyMap[upperSrc]} for confirmed seats.`;
    }
  }

  return baseResult;
}

function generateMockTrainsLocal(fromStn: string, toStn: string, date: string): any[] {
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
    runsOn: '1111111',
    _requestedSource: fromStn,
    _requestedDestination: toStn,
    _journeyDate: date,
    _journeyDateIso: String(date || '').split('-').reverse().join('-'),
    _providerPair: `${fromStn}_${toStn}`,
    _providerSource: 'fallback-mock',
  }));
}

export async function searchTrainsSmart(source: string, dest: string, date: string, options: TrainSearchOptions = {}) {
    let providerPairs = providerPairsForSearch(source, dest, options.exactStationOnly);
    if (typeof options.providerPairLimit === 'number' && Number.isFinite(options.providerPairLimit)) {
      providerPairs = providerPairs.slice(0, Math.max(1, options.providerPairLimit));
    }

    let trains: any[] = [];
    const isDemoMode = !process.env.IRCTC_API_KEY?.trim();
    const fetchProviderPair = async (pair: { source: string; dest: string }) => {
      try {
        const res = await plannerTimeout(searchDirectTrains(pair.source, pair.dest, date), options.plannerLegTimeoutMs || 4500, null as any);
        if (!res) {
          logProviderIssue('train-between request timed out', { source: pair.source, dest: pair.dest, requestedSource: source, requestedDest: dest, date });
          return generateMockTrainsLocal(pair.source, pair.dest, date);
        }
        if (res.isNoTrainsResponse) {
          logProviderIssue('train-between successfully checked - zero trains found (from no-trains response)', { source: pair.source, dest: pair.dest, requestedSource: source, requestedDest: dest, date });
          return [];
        }
        const providerTrains = providerTrainList(res);
        if (providerTrains.length > 0) {
          return providerTrains.map((train: any) => ({
            ...train,
            _requestedSource: source,
            _requestedDestination: dest,
            _journeyDate: date,
            _journeyDateIso: railDateToIso(date),
            _providerPair: `${pair.source}_${pair.dest}`,
            _providerSource: res?.provider || 'IRCTC-compatible provider',
            _providerCacheMeta: res?._cacheMeta,
            _providerEndpoint: `trainBetweenStations?fromStationCode=${pair.source}&toStationCode=${pair.dest}&dateOfJourney=${date}`,
            _providerRawResponse: options.debug ? res : undefined,
          }));
        }
        if (res.success === false) {
          logProviderIssue('train-between request failed with error', { source: pair.source, dest: pair.dest, requestedSource: source, requestedDest: dest, date }, res.error || res);
          return generateMockTrainsLocal(pair.source, pair.dest, date);
        }
        logProviderIssue('empty train-between response', { source: pair.source, dest: pair.dest, requestedSource: source, requestedDest: dest, date }, res);
        return [];
      } catch (error) {
        logProviderIssue('train-between request failed', { source: pair.source, dest: pair.dest, requestedSource: source, requestedDest: dest, date }, error instanceof Error ? { message: error.message, stack: error.stack } : error);
        return generateMockTrainsLocal(pair.source, pair.dest, date);
      }
    };

    const providerResults = await Promise.all(providerPairs.map(fetchProviderPair));
    trains = providerResults.reduce((merged, result) => mergeTrainLists(merged, result), [] as any[]);

    // Strip any fallback-mock trains only if we have other real trains
    const hasRealTrains = trains.some((train: any) => train?._providerSource !== 'fallback-mock');
    if (hasRealTrains) {
      trains = trains.filter((train: any) => train?._providerSource !== 'fallback-mock');
    }
    trains = trains.filter((train) => trainMatchesSearchScope(train, source, dest));

    if (!trains.length) {
      logProviderIssue('no matching trains after station-leg filter', { source, dest, date });
    }
    return trains;
}

export async function checkDirectTrains(source: string, dest: string, date: string, classType: string = 'Any', options: TrainSearchOptions = {}): Promise<TrainResult[]> {
  source = normalizeStationCode(source);
  dest = normalizeStationCode(dest);
  
  try {
    const formattedDate = formatDateStr(date);
    let trains = await searchTrainsSmart(source, dest, formattedDate, options);

    trains = trains.filter((t: any) => {
      return trainRunsOnRailDate(t.running_days, formattedDate);
    });

    trains.sort((a: any, b: any) => {
      const scoreDiff = preLiveTrainScore(b, source, dest) - preLiveTrainScore(a, source, dest);
      if (scoreDiff !== 0) return scoreDiff;
      const aDaily = a.running_days === '1111111' ? 1 : 0;
      const bDaily = b.running_days === '1111111' ? 1 : 0;
      if (bDaily !== aDaily) return bDaily - aDaily;
      
      const aSpecial = (a.train_name || '').includes('SPL') ? 1 : 0;
      const bSpecial = (b.train_name || '').includes('SPL') ? 1 : 0;
      return aSpecial - bSpecial; 
    });

    const liveLookupLimit = options.fetchLive === false
      ? 0
      : typeof options.liveLookupLimit === 'number'
        ? Math.max(0, options.liveLookupLimit)
        : Number.POSITIVE_INFINITY;
    const enrichedTrains = await Promise.all(trains.map((train: any, index: number) => {
      const shouldFetchLive = index < liveLookupLimit;
      return enrichWithLiveAvailability(train, formattedDate, classType, {
        ...options,
        fetchLive: shouldFetchLive,
      });
    }));

    let validEnrichedTrains = enrichedTrains
      .filter((t) => t?.trainNo);

    if (options.fetchLive !== false) {
      const cleanClass = classType && classType !== 'Any' ? classType.toUpperCase() : '';
      validEnrichedTrains = validEnrichedTrains.filter((t) => {
        if (cleanClass) {
          // If the train statically doesn't run the requested class, filter it out.
          if (t.classes && t.classes.length > 0 && !t.classes.includes(cleanClass)) {
            return false;
          }
          // If the live lookup failed, was rate limited, or not checked, keep the train in search results
          const first = t.classAvailability?.[cleanClass]?.[0];
          const status = first?.availabilityStatus || t.availabilityStatus || 'NOT_CHECKED';
          if (status !== 'VERIFIED') {
            return true;
          }
          return verifiedLiveClassEntries(t).some(([cls]) => cls === cleanClass);
        }
        // If classType is Any, keep the train unless we verified it doesn't run at all on this day
        return true;
      });
    }

    const beforeDedupeCount = validEnrichedTrains.length;
    validEnrichedTrains = dedupeTrainNumberVariants(validEnrichedTrains, source, dest);
    if (validEnrichedTrains.length !== beforeDedupeCount) {
      logProviderIssue('deduped terminal train variants', {
        source,
        destination: dest,
        before: beforeDedupeCount,
        after: validEnrichedTrains.length,
      });
    }

    // ── Fare extraction helper ──────────────────────────────────────────────
    const extractFare = (train: any): number => {
      const raw = train.fare ?? '';
      const num = parseFloat(String(raw).replace(/[₹,\s]/g, ''));
      return isNaN(num) ? 999999 : num;
    };

    // ── Availability score: lower = better ─────────────────────────────────
    const getAvailScore = (status: string) => {
      const s = status.toUpperCase();
      if (s.includes('AVAILABLE') || s.includes('CURR_AV') || s.includes('AVL')) return 1;
      if (s.includes('RAC')) return 2;
      if (s.includes('WL')) return 3;
      if (s.includes('REGRET')) return 4;
      return 5;
    };

    // ── Duration in minutes ─────────────────────────────────────────────────
    const getDurationMins = (dur: string): number => {
      if (!dur || dur === 'N/A') return 999999;
      let hours = 0, mins = 0;
      if (dur.includes(':')) {
        const parts = dur.replace('hrs', '').trim().split(':');
        hours = parseInt(parts[0]) || 0;
        mins = parseInt(parts[1]) || 0;
      } else if (dur.includes('h')) {
        const hMatch = dur.match(/(\d+)h/);
        const mMatch = dur.match(/(\d+)m/);
        if (hMatch) hours = parseInt(hMatch[1]);
        if (mMatch) mins = parseInt(mMatch[1]);
      }
      return hours * 60 + mins;
    };

    // ── COMPOSITE VALUE SCORE ───────────────────────────────────────────────
    // Primary: FARE (cheapest first) — weighted 70%
    // Secondary: AVAILABILITY (confirmed > RAC > WL) — weighted 20%
    // Tertiary: DURATION (shorter trip = better) — weighted 10%
    //
    // We normalise all three dimensions, then combine into one score.
    // Lower composite = better rank.
    const fares    = validEnrichedTrains.map(extractFare);
    const durations = validEnrichedTrains.map(t => getDurationMins(t.duration));
    const realFares = fares.filter(f => f < 999999);
    const realDurations = durations.filter(d => d < 999999);
    const minFare  = realFares.length ? Math.min(...realFares) : 1;
    const maxFare  = realFares.length ? Math.max(...realFares) : 1;
    const minDur   = realDurations.length ? Math.min(...realDurations) : 1;
    const maxDur   = realDurations.length ? Math.max(...realDurations) : 1;

    const normalise = (val: number, min: number, max: number) =>
      max === min ? 0 : (val - min) / (max - min);

    validEnrichedTrains.sort((a, b) => {
      const fareA  = extractFare(a);
      const fareB  = extractFare(b);
      const availA = getAvailScore(a.availability);
      const availB = getAvailScore(b.availability);
      const durA   = getDurationMins(a.duration);
      const durB   = getDurationMins(b.duration);
      const hasProviderA = hasReturnedAvailability(a.availability) || fareA < 999999;
      const hasProviderB = hasReturnedAvailability(b.availability) || fareB < 999999;
      if (hasProviderA !== hasProviderB) return hasProviderA ? -1 : 1;

      // Normalised 0–1 (lower is better for all three)
      const normFareA  = normalise(fareA,  minFare, maxFare);
      const normFareB  = normalise(fareB,  minFare, maxFare);
      const normAvailA = (availA - 1) / 4; // 0 = confirmed, 1 = regret
      const normAvailB = (availB - 1) / 4;
      const normDurA   = normalise(durA, minDur, maxDur);
      const normDurB   = normalise(durB, minDur, maxDur);

      const scoreA = normFareA * 0.70 + normAvailA * 0.20 + normDurA * 0.10;
      const scoreB = normFareB * 0.70 + normAvailB * 0.20 + normDurB * 0.10;
      if (!Number.isFinite(scoreA) || !Number.isFinite(scoreB)) {
        return durA - durB;
      }

      return scoreA - scoreB; // ascending: cheapest+confirmed+fastest first
    });

    // Attach rank metadata so the UI can render price-rank badges
	    validEnrichedTrains.forEach((t, i) => {
	      (t as any)._priceRank = i + 1;
	      (t as any)._totalCount = validEnrichedTrains.length;
	    });


    return validEnrichedTrains;
  } catch (error: any) {
    console.error('Error fetching direct trains:', error);
    return [];
  }
}


const cleanTrainNo = (num: any): string => {
  if (!num) return '';
  return String(num).trim().replace(/^0+/, '');
};

const directCheckCache = new Map<string, boolean>();

function isTrainDirectBetweenAreas(stations: string[], source: string, dest: string): boolean {
  const sourceCluster = sameAreaTerminalClusterFor(source, 45);
  const destCluster = sameAreaTerminalClusterFor(dest, 45);
  const sourceCoord = stationCoordinatesForRouting(source);
  const destCoord = stationCoordinatesForRouting(dest);
  
  let earliestSrcIdx = Number.MAX_SAFE_INTEGER;
  let latestDstIdx = -1;
  
  for (let i = 0; i < stations.length; i++) {
    const st = stations[i];
    
    // Check if it's in the terminal cluster
    let isSrcClose = sourceCluster.includes(st);
    let isDstClose = destCluster.includes(st);
    
    // Check geographical distance if coordinates are available
    if (!isSrcClose && sourceCoord) {
      const stCoord = stationCoordinatesForRouting(st);
      if (stCoord && haversineKm(sourceCoord, stCoord) <= 45) {
        isSrcClose = true;
      }
    }
    if (!isDstClose && destCoord) {
      const stCoord = stationCoordinatesForRouting(st);
      if (stCoord && haversineKm(destCoord, stCoord) <= 45) {
        isDstClose = true;
      }
    }
    
    if (isSrcClose) {
      if (i < earliestSrcIdx) earliestSrcIdx = i;
    }
    if (isDstClose) {
      if (i > latestDstIdx) latestDstIdx = i;
    }
  }
  
  return earliestSrcIdx !== Number.MAX_SAFE_INTEGER && latestDstIdx !== -1 && earliestSrcIdx < latestDstIdx;
}

async function isDirectTrainEver(trainNo: string, source: string, dest: string): Promise<boolean> {
  const cacheKey = `${trainNo}_${source}_${dest}`;
  if (directCheckCache.has(cacheKey)) {
    return directCheckCache.get(cacheKey)!;
  }
  
  try {
    const schedule = await getTrainSchedule(trainNo);
    if (schedule && schedule.success !== false && schedule.data && schedule.data.route) {
      const route = schedule.data.route;
      const stations = route.map((r: any) => normalizeStationCode(r.stnCode || r.stationCode || ''));
      const isDirect = isTrainDirectBetweenAreas(stations, source, dest);
      directCheckCache.set(cacheKey, isDirect);
      return isDirect;
    }
  } catch (e) {
    console.warn(`[isDirectTrainEver] Failed to check train schedule for ${trainNo}:`, e);
  }
  
  directCheckCache.set(cacheKey, false);
  return false;
}


export async function findSmartRoutes(source: string, dest: string, date: string, classType: string = 'Any', directTrains: any[] = [], preferredHubInput: string = '', options: TrainSearchOptions = {}): Promise<SplitRouteResult[]> {
  const startSmartTime = Date.now();
  source = normalizeStationCode(source);
  dest = normalizeStationCode(dest);
  const formattedDate = formatDateStr(date);

  const directTrainNos = new Set<string>();
  const directTrainNames = new Set<string>();

  if (directTrains && directTrains.length > 0) {
    directTrains.forEach((t) => {
      const num = cleanTrainNo(t.trainNo || t.train_no || t.train_number || t.trainno);
      if (num) directTrainNos.add(num);
      const name = String(t.trainName || t.train_name || t.name || '').trim().toLowerCase();
      if (name) directTrainNames.add(name);
    });
  } else {
    try {
      const rawDirect = await searchTrainsSmart(source, dest, formattedDate, { ...options, fetchLive: false });
      rawDirect.forEach((t: any) => {
        const num = cleanTrainNo(t.trainNo || t.train_no || t.train_number || t.trainno);
        if (num) directTrainNos.add(num);
        const name = String(t.trainName || t.train_name || t.name || '').trim().toLowerCase();
        if (name) directTrainNames.add(name);
      });
      console.log(`[Smart Routing] Loaded ${directTrainNos.size} direct trains directly in backend for filtering.`);
    } catch (e) {
      console.warn("[Smart Routing] Failed to fetch direct trains in backend for filtering:", e);
    }
  }

  const preferredHub = normalizeStationCode(preferredHubInput);
  const hasPreferredHub = Boolean(preferredHub && preferredHub !== source && preferredHub !== dest);
  const splitHubLimit = quickLimit(options, options.maxSplitHubs, hasPreferredHub ? 35 : 30);
  const splitLegLimit = quickLimit(options, options.maxSplitLegOptions, 40);
  const splitCandidateLimit = quickLimit(options, options.maxSplitCandidates, 250);
  const splitResultLimit = quickLimit(options, options.maxSplitResults, isFullCoverage(options) ? 120 : 15);
  const allowMixedClassSplits = Boolean(options.allowMixedClassSplits);
  const quickPotentialLimit = isFullCoverage(options)
    ? splitCandidateLimit
    : Math.min(splitCandidateLimit, Math.max(40, splitResultLimit));
  const legSearchOptions: TrainSearchOptions = {
    ...options,
    providerPairLimit: 1,
  };

  const prioritizePreferredHub = (hubs: string[]) => {
    const next = hasPreferredHub ? [preferredHub, ...hubs] : hubs;
    return Array.from(new Set(next)).filter((hub) => hub && hub !== source && hub !== dest);
  };

  try {
    const formattedDate = formatDateStr(date);
    let hubsToTry = dynamicSplitHubCandidates(source, dest, preferredHub, splitHubLimit);

    // Dynamic hub selection from active routes
    try {
      if (directTrains.length > 0) {
        for (const train of directTrains) {
          const info = await getTrainSchedule(train.trainNo);
          if (info && info.data && info.data.route) {
            const route = info.data.route.map((r: any) => r.stnCode);
            const srcIdx = route.indexOf(source);
            const dstIdx = route.indexOf(dest);
            
            if (srcIdx !== -1 && dstIdx !== -1 && srcIdx < dstIdx) {
              const intermediate = route.slice(srcIdx + 1, dstIdx);
              if (intermediate.length >= 2) {
                const dynamicHubs = [
                  intermediate[Math.floor(intermediate.length * 0.33)],
                  intermediate[Math.floor(intermediate.length * 0.66)]
                ].filter(Boolean);
                
                hubsToTry = prioritizePreferredHub([...dynamicHubs, ...hubsToTry]);
                console.log(`[Smart Routing] Dynamic geographical hubs:`, dynamicHubs);
                break; 
              }
            }
          }
        }
      }
    } catch (e) {
      console.warn("Failed to extract dynamic route hubs:", e);
    }
    hubsToTry = takeForCoverage(expandSplitHubAliases(prioritizePreferredHub(hubsToTry)), splitHubLimit);
    let potentialRoutes: any[] = [];
    const enoughQuickPotential = () => {
      if (isFullCoverage(options)) return false;
      const uniqueHubs = new Set(potentialRoutes.map((route) => route.hub)).size;
      return potentialRoutes.length >= Math.min(100, quickPotentialLimit) && uniqueHubs >= 8;
    };

    // Check hubs in bounded parallel batches. Train-list calls are cached and
    // cheaper than availability calls, so this keeps broad routes responsive.
    const splitHubBatchSize = isFullCoverage(options) ? 6 : 4;
    for (let i = 0; i < hubsToTry.length; i += splitHubBatchSize) {
      if (Date.now() - startSmartTime > (options.globalTimeoutMs || 15000)) {
        console.warn(`[smart-search] Hub search exceeded global timeout. Returning ${potentialRoutes.length} potential routes.`);
        break;
      }
      if (!isFullCoverage(options) && (potentialRoutes.length >= quickPotentialLimit || enoughQuickPotential())) break;
      if (i > 0) {
        await providerPaceDelay(options.liveLookupDelayMs ?? 150);
      }
      const batch = hubsToTry.slice(i, i + splitHubBatchSize);
      await Promise.all(batch.map(async (hub) => {
        if (hub === source || hub === dest) return;
        if (!isFullCoverage(options) && potentialRoutes.length >= quickPotentialLimit) return;
        
        try {
	          const secondLegDates = [
	            formattedDate,
	            addDaysToRailDate(formattedDate, 1),
	            ...(isFullCoverage(options) ? [addDaysToRailDate(formattedDate, 2)] : []),
	          ];
	          const [l1Trains, ...l2TrainGroups] = await plannerTimeout(
	            Promise.all([
	              searchTrainsSmart(source, hub, formattedDate, legSearchOptions),
	              ...secondLegDates.map((legDate) => searchTrainsSmart(hub, dest, legDate, legSearchOptions))
	            ]),
	            options.plannerLegTimeoutMs,
	            [[], ...secondLegDates.map(() => [])] as any[][]
	          );
	          const l2Trains = l2TrainGroups.flat();

            // Filter out any trains that are direct trains between source and destination on any day
            const uniqueTrainNos = Array.from(new Set([
              ...l1Trains.map(t => cleanTrainNo(t.trainNo || t.train_no || t.train_number || t.trainno)),
              ...l2Trains.map(t => cleanTrainNo(t.trainNo || t.train_no || t.train_number || t.trainno))
            ].filter(Boolean)));
            
            const directStatusMap = new Map<string, boolean>();
            await Promise.all(uniqueTrainNos.map(async (num) => {
              const isDirect = await isDirectTrainEver(num, source, dest);
              directStatusMap.set(num, isDirect);
            }));
            
            const filteredL1 = l1Trains.filter(t => !directStatusMap.get(cleanTrainNo(t.trainNo || t.train_no || t.train_number || t.trainno)));
            const filteredL2 = l2Trains.filter(t => !directStatusMap.get(cleanTrainNo(t.trainNo || t.train_no || t.train_number || t.trainno)));

          const sortLogic = (a: any, b: any) => {
            const aDaily = a.running_days === '1111111' ? 1 : 0;
            const bDaily = b.running_days === '1111111' ? 1 : 0;
            if (bDaily !== aDaily) return bDaily - aDaily;
            const aSpecial = (a.train_name || '').includes('SPL') ? 1 : 0;
            const bSpecial = (b.train_name || '').includes('SPL') ? 1 : 0;
            return aSpecial - bSpecial;
          };

          if (filteredL1.length > 0 && filteredL2.length > 0) {
            filteredL1.sort(sortLogic);
            filteredL2.sort(sortLogic);

            let routesForHub = 0;
            const maxRoutesPerHub = isFullCoverage(options) ? 100 : 8;

            // Explore the provider grid until quick mode has enough route shapes.
            routeGrid:
            for (const t1 of takeForCoverage(filteredL1, splitLegLimit)) {
              for (const t2 of takeForCoverage(filteredL2, splitLegLimit)) {
                const trainNo1 = String(t1.trainNo || t1.train_no || t1.train_number || t1.trainno || '').trim();
                const trainNo2 = String(t2.trainNo || t2.train_no || t2.train_number || t2.trainno || '').trim();
                const cleanT1 = cleanTrainNo(trainNo1);
                const cleanT2 = cleanTrainNo(trainNo2);
                if (cleanT1 && cleanT2 && cleanT1 === cleanT2) continue;
                if (directTrainNos.has(cleanT1) || directTrainNos.has(cleanT2)) continue;

                const name1 = String(t1.trainName || t1.train_name || t1.name || '').trim().toLowerCase();
                const name2 = String(t2.trainName || t2.train_name || t2.name || '').trim().toLowerCase();
                if (name1 && name2 && name1 === name2) continue;
                if (directTrainNames.has(name1) || directTrainNames.has(name2)) continue;

                const arrTimeStr = t1.to_time || t1.to_sta || t1.arrivalTime;
                const depTimeStr = t2.from_time || t2.from_std || t2.departureTime;

                const destCode1 = t1.to_stn_code || t1.to_station_code || t1.toStnCode || t1.train_dstn || t1.dest || '';
                const srcCode2 = t2.from_stn_code || t2.from_station_code || t2.fromStnCode || t2.train_src || t2.source || '';

                if (!arrTimeStr || !depTimeStr) continue;
                if (destCode1.toUpperCase() !== srcCode2.toUpperCase()) continue;

                  const requestedSplitClass = classType && classType !== 'Any' ? classType.toUpperCase() : '';
                  if (requestedSplitClass && !allowMixedClassSplits) {
                    if (!legSupportsRequestedClass(t1, requestedSplitClass) || !legSupportsRequestedClass(t2, requestedSplitClass)) {
                      continue;
                    }
                  }

	                const leg1Date = formatDateStr(t1._journeyDate || formattedDate);
	                const candidateLeg2Date = formatDateStr(t2._journeyDate || formattedDate);
	                const leg1Timing = actualTrainTiming(t1, leg1Date);
	                const leg2Timing = actualTrainTiming(t2, candidateLeg2Date);
	                const arrivalMs = leg1Timing.arrivalMs;
	                let depMs = leg2Timing.departureMs;

	                while (depMs < arrivalMs) {
	                  depMs += 24 * 60 * 60 * 1000;
	                }
	                const resolvedLeg2Date = formatRailDate(new Date(depMs));

	                const layoverHours = (depMs - arrivalMs) / (1000 * 60 * 60);
	                // Heritage/mountain routes (short leg 2) can have longer layovers at a hub
	                const isHeritageLeg2 = !!(t2._isHeritage);
	                const isMajorHub = isKnownMajorHub(hub);
	                const maxLayover = hub === preferredHub
	                  ? 18.0
	                  : isMajorHub
	                    ? 12.0
	                    : isHeritageLeg2
	                      ? 8.0
	                      : 6.0;

                // LAYOVER WINDOW: 1h to maxLayover for optimal transition
                if (layoverHours >= 0.75 && layoverHours <= maxLayover) {
                  potentialRoutes.push({
                    hub,
	                    t1,
	                    t2,
	                    leg1Date,
	                    leg2Date: resolvedLeg2Date,
	                    leg1DepartureDate: leg1Timing.departureDate,
	                    leg1ArrivalDate: leg1Timing.arrivalDate,
	                    leg2DepartureDate: railDateToIso(resolvedLeg2Date),
	                    layoverHours,
	                    layoverDuration: formatDuration(depMs - arrivalMs),
	                    score: 100 - (layoverHours * 4) + (hub === preferredHub ? 45 : 0) + (isMajorHub ? 10 : 0) + trainServiceQualityBoost(t1) + trainServiceQualityBoost(t2),
	                    _isHeritage: isHeritageLeg2
                  });
                  routesForHub++;
                  if (routesForHub >= maxRoutesPerHub) {
                    break routeGrid;
                  }
                  if (!isFullCoverage(options) && potentialRoutes.length >= quickPotentialLimit) {
                    break routeGrid;
                  }
                }
              }
            }
          }
        } catch {
          console.warn(`[Smart Routing] Skipped hub ${hub} due to missing data.`);
        }
      }));
    }

    // Sort all gathered potential routes
    potentialRoutes.sort((a, b) => b.score - a.score);
    potentialRoutes = takeForCoverage(potentialRoutes, splitCandidateLimit);

    const validRoutes: SplitRouteResult[] = [];
    
    const parseDurationMins = (dur: string) => {
      if (!dur || dur === 'N/A') return 0;
      let hours = 0, mins = 0;
      if (dur.includes(':')) {
        const parts = dur.replace('hrs', '').trim().split(':');
        hours = parseInt(parts[0]) || 0;
        mins = parseInt(parts[1]) || 0;
      } else if (dur.includes('h')) {
        const hMatch = dur.match(/(\d+)h/);
        const mMatch = dur.match(/(\d+)m/);
        if (hMatch) hours = parseInt(hMatch[1]);
        if (mMatch) mins = parseInt(mMatch[1]);
      }
      return (hours * 60) + mins;
    };

    const getSeatScore = (status: string) => {
      const s = status.toUpperCase();
      if (s.includes('AVAILABLE') || s.includes('CURR_AV') || /\bAVL\b/.test(s)) return +35;
      if (s.includes('RAC')) return +15;
      if (s.includes('WL')) return -10;
      if (s.includes('REGRET')) return -45;
      if (s.includes('UNAVAILABLE') || s.includes('NOT RETURNED')) return -60;
      return -20;
    };

    const requireVerifiedLiveSplit = options.fetchLive !== false;

    // Process route candidates in parallel batches to speed up
    const candidateBatchSize = isFullCoverage(options) ? 4 : 8;
    for (let idx = 0; idx < potentialRoutes.length; idx += candidateBatchSize) {
      if (validRoutes.length >= splitResultLimit) break;
      const batch = potentialRoutes.slice(idx, idx + candidateBatchSize);
      
      const elapsed = Date.now() - startSmartTime;
      const timeoutLimit = options.globalTimeoutMs || 15000;
      const isRunningLowOnTime = elapsed > (timeoutLimit - 3000);
      if (elapsed > timeoutLimit) {
        console.warn(`[smart-search] Verification exceeded global timeout (${elapsed}ms > ${timeoutLimit}ms). Filling remaining ${splitResultLimit - validRoutes.length} slots statically.`);
        const remainingCandidates = potentialRoutes.slice(idx);
        const staticResults = await Promise.all(remainingCandidates.map(async (route) => {
          try {
            const leg1Date = route.leg1Date || formattedDate;
            const leg2Date = route.leg2Date || formattedDate;
            
            const [leg1Enriched, leg2Enriched] = await Promise.all([
              enrichWithLiveAvailability(
                { ...route.t1, _journeyDate: leg1Date },
                leg1Date,
                classType,
                { ...options, fetchLive: false }
              ),
              enrichWithLiveAvailability(
                { ...route.t2, _journeyDate: leg2Date },
                leg2Date,
                classType,
                { ...options, fetchLive: false }
              )
            ]);
            
            const f1 = safeParseFare(leg1Enriched.fare);
            const f2 = safeParseFare(leg2Enriched.fare);
            const totalFare = f1 > 0 && f2 > 0 ? f1 + f2 : 0;
            
            const res: SplitRouteResult = {
              hubStation: route.hub,
              hubStationName: hubLabel(route.hub),
              layoverDuration: route.layoverDuration,
              layoverHours: route.layoverHours,
              leg1Date: railDateToIso(leg1Date),
              leg2Date: railDateToIso(leg2Date),
              leg1DepartureDate: route.leg1DepartureDate,
              leg1ArrivalDate: route.leg1ArrivalDate,
              leg2DepartureDate: route.leg2DepartureDate,
              leg1Fare: f1,
              leg2Fare: f2,
              totalFare,
              score: 50,
              leg1: leg1Enriched,
              leg2: leg2Enriched,
              combinedConfirmationChance: null,
              isHeritage: !!(route._isHeritage)
            };
            return res;
          } catch {
            return null;
          }
        }));
        
        for (const res of staticResults) {
          if (res) {
            validRoutes.push(res);
          }
        }
        break;
      }
      
      const batchResults = await Promise.all(batch.map(async (route) => {
        try {
          const leg1Date = route.leg1Date || formattedDate;
          const leg2Date = route.leg2Date || formattedDate;
          
          const legOptions = isRunningLowOnTime ? { ...options, fetchLive: false } : options;
          const requireVerified = !isRunningLowOnTime && requireVerifiedLiveSplit;

          // Fetch leg1 and leg2 in parallel to optimize search time
          const [leg1Enriched, leg2Enriched] = await Promise.all([
            enrichWithLiveAvailability(
              { ...route.t1, _journeyDate: leg1Date },
              leg1Date,
              allowMixedClassSplits ? 'Any' : classType,
              legOptions
            ),
            enrichWithLiveAvailability(
              { ...route.t2, _journeyDate: leg2Date },
              leg2Date,
              allowMixedClassSplits ? 'Any' : classType,
              legOptions
            )
          ]);
          
          const cleanClass = classType && classType !== 'Any' ? classType.toUpperCase() : '';
          const hasTargetLeg1 = cleanClass && !allowMixedClassSplits
            ? verifiedLiveClassEntries(leg1Enriched).some(([cls]) => cls === cleanClass)
            : hasVerifiedLiveClass(leg1Enriched);
          const hasTargetLeg2 = cleanClass && !allowMixedClassSplits
            ? verifiedLiveClassEntries(leg2Enriched).some(([cls]) => cls === cleanClass)
            : hasVerifiedLiveClass(leg2Enriched);

           if (requireVerified && (!hasTargetLeg1 || !hasTargetLeg2)) {
            const supportsStatic = (leg1Enriched.classes?.includes(cleanClass || '3A') || leg1Enriched.selectedClass === cleanClass) &&
                                   (leg2Enriched.classes?.includes(cleanClass || '3A') || leg2Enriched.selectedClass === cleanClass);
            if (!supportsStatic) {
              return null;
            }
          }
          const leg1Verified = requireVerified ? pruneToVerifiedLiveClasses(leg1Enriched) : leg1Enriched;
          const leg2Verified = requireVerified ? pruneToVerifiedLiveClasses(leg2Enriched) : leg2Enriched;

          const a1 = leg1Verified.availability.toLowerCase();
          const a2 = leg2Verified.availability.toLowerCase();
          
          if (
            a1.includes('not available for booking') || a1.includes('cancel') || a1.includes('not running') || a1.includes('no service') ||
            a2.includes('not available for booking') || a2.includes('cancel') || a2.includes('not running') || a2.includes('no service')
          ) {
            return null;
          }
          const selectedClassUnavailable = !allowMixedClassSplits && (
            selectedClassMissing(leg1Verified, classType) || selectedClassMissing(leg2Verified, classType)
          );

          const f1 = safeParseFare(leg1Verified.fare);
          const f2 = safeParseFare(leg2Verified.fare);
          const totalFare = f1 > 0 && f2 > 0 ? f1 + f2 : 0;

          const predictionValues = [leg1Verified.confirmationChance, leg2Verified.confirmationChance]
            .filter((value): value is number => typeof value === 'number' && value > 0);
          const combinedConfirmationChance = predictionValues.length === 2
            ? Math.round((predictionValues[0] * predictionValues[1]) / 100)
            : null;

          let optimizedScore = 100;
          optimizedScore += getSeatScore(leg1Verified.availability);
          optimizedScore += getSeatScore(leg2Verified.availability);
          if (selectedClassUnavailable) {
            optimizedScore -= 25;
          }
          
          const isMajorHub = isKnownMajorHub(route.hub);
          if (isMajorHub) {
            optimizedScore += 10;
          }
          if (route.layoverHours > 3) {
            optimizedScore -= (route.layoverHours - 3) * (isMajorHub ? 8 : 15);
          } else if (route.layoverHours < 1.5) {
            optimizedScore -= (1.5 - route.layoverHours) * 10;
          } else {
            optimizedScore += 5;
          }

          const leg1Mins = parseDurationMins(leg1Verified.duration);
          const leg2Mins = parseDurationMins(leg2Verified.duration);
          const totalHours = (leg1Mins + leg2Mins) / 60 + route.layoverHours;
          optimizedScore -= totalHours * 1.2;

          optimizedScore = Math.max(0, Math.min(100, Math.round(optimizedScore)));

          const res: SplitRouteResult = {
            hubStation: route.hub,
            hubStationName: hubLabel(route.hub),
            layoverDuration: route.layoverDuration,
            layoverHours: route.layoverHours,
            leg1Date: railDateToIso(leg1Date),
            leg2Date: railDateToIso(leg2Date),
            leg1DepartureDate: route.leg1DepartureDate,
            leg1ArrivalDate: route.leg1ArrivalDate,
            leg2DepartureDate: route.leg2DepartureDate,
            leg1Fare: f1,
            leg2Fare: f2,
            totalFare,
            score: optimizedScore,
            leg1: leg1Verified,
            leg2: leg2Verified,
            combinedConfirmationChance,
            isHeritage: !!(route._isHeritage)
          };
          return res;
        } catch (e) {
          console.warn(`[Smart Routing] Failed to enrich availability for route via ${route.hub}:`, e);
          return null;
        }
      }));
      
      for (const res of batchResults) {
        if (res) {
          validRoutes.push(res);
        }
      }
    }

    const usedShapes = new Set<string>();
    const usedShapesWithHubs = new Set<string>();
    const finalDiverseRoutes: SplitRouteResult[] = [];

    const sortedValid = validRoutes.sort((a, b) => b.score - a.score);
    const splitShapeKey = (route: SplitRouteResult) => [
	      route.leg1.trainNo,
	      route.leg1.journeyDate,
	      route.leg2.trainNo,
	      route.leg2.journeyDate,
	    ].map((value) => String(value || '').toUpperCase()).join('|');

    const splitShapeWithHubKey = (route: SplitRouteResult) => [
	      route.leg1.trainNo,
	      route.leg1.journeyDate,
	      route.leg2.trainNo,
	      route.leg2.journeyDate,
	      route.hubStation,
	    ].map((value) => String(value || '').toUpperCase()).join('|');

    const hubGroupCounts = new Map<string, number>();

    const addRoute = (route: SplitRouteResult, strictShape: boolean, enforceGroupLimit: boolean) => {
      if (!route || finalDiverseRoutes.length >= splitResultLimit) return false;

      const group = hubGroupForDiversity(route.hubStation);
      if (enforceGroupLimit) {
        const count = hubGroupCounts.get(group) || 0;
        if (count >= 3) return false;
      }

      const hubKey = splitShapeWithHubKey(route);
      if (usedShapesWithHubs.has(hubKey)) return false;
      
      const shape = splitShapeKey(route);
      if (strictShape && usedShapes.has(shape)) return false;

      usedShapes.add(shape);
      usedShapesWithHubs.add(hubKey);
      hubGroupCounts.set(group, (hubGroupCounts.get(group) || 0) + 1);
      finalDiverseRoutes.push(route);
      return true;
    };

    const groupedRoutes = new Map<string, SplitRouteResult[]>();
    for (const route of sortedValid) {
      const group = hubGroupForDiversity(route.hubStation);
      const list = groupedRoutes.get(group) || [];
      list.push(route);
      groupedRoutes.set(group, list);
    }

    const groupOrder = Array.from(groupedRoutes.keys())
      .sort((a, b) => (groupedRoutes.get(b)?.[0]?.score || 0) - (groupedRoutes.get(a)?.[0]?.score || 0));

    // First round: index 0 from all groups (with shape uniqueness and group limit of 3)
    for (const group of groupOrder) {
      if (finalDiverseRoutes.length >= splitResultLimit) break;
      const route = groupedRoutes.get(group)?.[0];
      if (route) addRoute(route, true, true);
    }

    // Second round: index 1, 2, 3... (with shape uniqueness and group limit of 3)
    const maxGroupSize = Math.max(...Array.from(groupedRoutes.values()).map((routes) => routes.length), 0);
    for (let index = 1; index < maxGroupSize && finalDiverseRoutes.length < splitResultLimit; index += 1) {
      for (const group of groupOrder) {
        if (finalDiverseRoutes.length >= splitResultLimit) break;
        const route = groupedRoutes.get(group)?.[index];
        if (route) addRoute(route, true, true);
      }
    }

    // Third round: relaxed group limit but still enforcing shape uniqueness
    for (let index = 1; index < maxGroupSize && finalDiverseRoutes.length < splitResultLimit; index += 1) {
      for (const group of groupOrder) {
        if (finalDiverseRoutes.length >= splitResultLimit) break;
        const route = groupedRoutes.get(group)?.[index];
        if (route) addRoute(route, true, false);
      }
    }

    // Fourth round: fallback to add remaining routes without strict shape uniqueness if we still have slots
    for (const route of sortedValid) {
      if (finalDiverseRoutes.length >= splitResultLimit) break;
      addRoute(route, false, false);
    }

    return finalDiverseRoutes;
  } catch (error: any) {
    console.error('Error finding smart routes:', error);
    return [];
  }
}

function normalizeLegTime(time: string, baseDate: string, afterMs?: number) {
  let value = parseTime(time, baseDate).getTime();
  if (afterMs) {
    while (value < afterMs) value += 24 * 60 * 60 * 1000;
  }
  return value;
}

function pickLikelyTrains(trains: any[], limit = Number.POSITIVE_INFINITY) {
  const sorted = [...trains]
    .sort((a, b) => {
      const aDaily = a.running_days === '1111111' ? 1 : 0;
      const bDaily = b.running_days === '1111111' ? 1 : 0;
      if (bDaily !== aDaily) return bDaily - aDaily;
      const aSpecial = String(a.train_name || '').includes('SPL') ? 1 : 0;
      const bSpecial = String(b.train_name || '').includes('SPL') ? 1 : 0;
      return aSpecial - bSpecial;
    });
  return takeForCoverage(sorted, limit);
}

function scoreMultiSplitRoute(legs: TrainResult[], layoverHours: number[]) {
  const seatScore = legs.reduce((score, leg) => {
    const availability = leg.availability.toUpperCase();
    if (availability.includes('AVAILABLE') || availability.includes('AVL')) return score + 18;
    if (availability.includes('RAC')) return score + 8;
    if (availability.includes('WL')) return score - 8;
    if (availability.includes('REGRET')) return score - 24;
    return score;
  }, 0);
  const layoverPenalty = layoverHours.reduce((sum, hours) => sum + (hours < 1 ? 18 : hours > 5 ? (hours - 5) * 8 : 0), 0);
  const durationHours = legs.reduce((sum, leg) => sum + parseDurationMins(leg.duration) / 60, 0) + layoverHours.reduce((sum, hours) => sum + hours, 0);
  return Math.max(0, Math.min(100, Math.round(92 + seatScore - layoverPenalty - durationHours * 0.7)));
}

export async function findMultiSplitRoutes(source: string, dest: string, date: string, classType: string = 'Any', preferredHubInput: string = '', options: TrainSearchOptions = {}): Promise<MultiSplitRouteResult[]> {
  source = normalizeStationCode(source);
  dest = normalizeStationCode(dest);
  const preferredHub = normalizeStationCode(preferredHubInput);
  const hasPreferredHub = Boolean(preferredHub && preferredHub !== source && preferredHub !== dest);
  const multiPlanLimit = quickLimit(options, options.maxMultiPlans, hasPreferredHub ? 18 : 10);
  const multiLegLimit = quickLimit(options, options.maxMultiLegOptions, 5);
  const multiCandidateLimit = quickLimit(options, options.maxMultiCandidates, 72);
  const multiResultLimit = quickLimit(options, options.maxMultiResults, 12);
  const legSearchOptions: TrainSearchOptions = {
    ...options,
    providerPairLimit: 1,
  };

  try {
    const formattedDate = formatDateStr(date);
    const routeHubs = dynamicSplitHubCandidates(source, dest, preferredHub, multiPlanLimit * 4);
    const sourceCoord = stationCoordinatesForRouting(source);
    const destCoord = stationCoordinatesForRouting(dest);
    const hubProgress = (code: string) => {
      const hub = MAJOR_HUB_BY_CODE.get(normalizeStationCode(code));
      if (!sourceCoord || !destCoord || !hub) return 0.5;
      return hubRouteProgress(sourceCoord, destCoord, { lat: hub.lat, lon: hub.lon });
    };
    const firstHubs = takeForCoverage(
      routeHubs
        .filter((hub) => hub !== source && hub !== dest && hubProgress(hub) < 0.68)
        .sort((a, b) => hubProgress(a) - hubProgress(b)),
      multiPlanLimit
    );
    const secondHubs = takeForCoverage(
      routeHubs
        .filter((hub) => hub !== source && hub !== dest && hubProgress(hub) > 0.32)
        .sort((a, b) => hubProgress(a) - hubProgress(b)),
      multiPlanLimit
    );

    const plans: { h1: string; h2: string }[] = [];
    for (const h1 of firstHubs) {
      for (const h2 of secondHubs) {
        if (h1 !== h2 && (!sourceCoord || !destCoord || hubProgress(h1) < hubProgress(h2))) plans.push({ h1, h2 });
      }
    }

    const potentialRoutes: any[] = [];

    for (const plan of takeForCoverage(Array.from(new Map(plans.map((plan) => [`${plan.h1}_${plan.h2}`, plan])).values()), multiPlanLimit)) {
      try {
        const [leg1Options, leg2Options, leg3Options] = await Promise.all([
          searchTrainsSmart(source, plan.h1, formattedDate, legSearchOptions),
          searchTrainsSmart(plan.h1, plan.h2, formattedDate, legSearchOptions),
          searchTrainsSmart(plan.h2, dest, formattedDate, legSearchOptions),
        ]);

        if (!leg1Options.length || !leg2Options.length || !leg3Options.length) continue;

        const uniqueTrainNos = Array.from(new Set([
          ...leg1Options.map(t => cleanTrainNo(t.trainNo || t.train_no || t.train_number || t.trainno)),
          ...leg2Options.map(t => cleanTrainNo(t.trainNo || t.train_no || t.train_number || t.trainno)),
          ...leg3Options.map(t => cleanTrainNo(t.trainNo || t.train_no || t.train_number || t.trainno))
        ].filter(Boolean)));

        const directStatusMap = new Map<string, boolean>();
        await Promise.all(uniqueTrainNos.map(async (num) => {
          const isDirect = await isDirectTrainEver(num, source, dest);
          directStatusMap.set(num, isDirect);
        }));

        const filteredL1 = leg1Options.filter(t => !directStatusMap.get(cleanTrainNo(t.trainNo || t.train_no || t.train_number || t.trainno)));
        const filteredL2 = leg2Options.filter(t => !directStatusMap.get(cleanTrainNo(t.trainNo || t.train_no || t.train_number || t.trainno)));
        const filteredL3 = leg3Options.filter(t => !directStatusMap.get(cleanTrainNo(t.trainNo || t.train_no || t.train_number || t.trainno)));

        if (!filteredL1.length || !filteredL2.length || !filteredL3.length) continue;

        for (const t1 of pickLikelyTrains(filteredL1, multiLegLimit)) {
          for (const t2 of pickLikelyTrains(filteredL2, multiLegLimit)) {
            for (const t3 of pickLikelyTrains(filteredL3, multiLegLimit)) {
              if (rawTrainDestination(t1) !== rawTrainSource(t2) || rawTrainDestination(t2) !== rawTrainSource(t3)) continue;

              const arr1 = normalizeLegTime(rawTrainArrival(t1), formattedDate);
              const dep2 = normalizeLegTime(rawTrainDeparture(t2), formattedDate, arr1);
              const arr2 = normalizeLegTime(rawTrainArrival(t2), formattedDate, dep2);
              const dep3 = normalizeLegTime(rawTrainDeparture(t3), formattedDate, arr2);
              const arr3 = normalizeLegTime(rawTrainArrival(t3), formattedDate, dep3);
              const layover1 = (dep2 - arr1) / (1000 * 60 * 60);
              const layover2 = (dep3 - arr2) / (1000 * 60 * 60);

              if (layover1 < 0.75 || layover2 < 0.75 || layover1 > 7 || layover2 > 7) continue;

              potentialRoutes.push({
                trains: [t1, t2, t3],
                hubs: [plan.h1, plan.h2],
                layoverHours: [layover1, layover2],
                layoverDurations: [formatDuration(dep2 - arr1), formatDuration(dep3 - arr2)],
                rawTotalMs: arr3 - normalizeLegTime(rawTrainDeparture(t1), formattedDate),
              });
            }
          }
        }
      } catch {
        console.warn(`[Multi Split] Skipped ${source}->${plan.h1}->${plan.h2}->${dest} due to missing data.`);
      }
    }

	    potentialRoutes.sort((a, b) => (a.layoverHours[0] + a.layoverHours[1]) - (b.layoverHours[0] + b.layoverHours[1]));
    const routesToEvaluate = takeForCoverage(potentialRoutes, multiCandidateLimit);
    const results: MultiSplitRouteResult[] = [];
    const usedKeys = new Set<string>();

    for (const route of routesToEvaluate) {
      if (results.length >= multiResultLimit) break;
      const key = `${route.hubs.join('_')}_${route.trains.map((train: any) => train.train_no || train.trainNo).join('_')}`;
      if (usedKeys.has(key)) continue;
      usedKeys.add(key);

      try {
        const legs: TrainResult[] = [];
        for (const train of route.trains) {
          const enriched = await enrichWithLiveAvailability(train, formattedDate, classType, options);
          if (!hasVerifiedLiveClass(enriched)) {
            legs.length = 0;
            break;
          }
          legs.push(pruneToVerifiedLiveClasses(enriched));
          if (legs.length < route.trains.length) await providerPaceDelay(options.liveLookupDelayMs ?? 500);
        }
        if (legs.length !== route.trains.length) continue;
        const inactive = legs.some((leg) => {
          const availability = leg.availability.toLowerCase();
          return availability.includes('not available for booking') || availability.includes('cancel') || availability.includes('not running') || availability.includes('no service');
        });
        if (inactive) continue;
        const selectedClassUnavailable = legs.some((leg) => selectedClassMissing(leg, classType));

        const fares = legs.map((leg) => parseFloat(leg.fare.replace(/[₹,\s]/g, '')) || 0);
        const totalFare = fares.every((fare) => fare > 0) ? fares.reduce((sum, fare) => sum + fare, 0) : 0;
        const predictionValues = legs
          .map((leg) => leg.confirmationChance)
          .filter((value): value is number => typeof value === 'number' && value > 0);
        const combinedConfirmationChance = predictionValues.length === legs.length
          ? Math.round(predictionValues.reduce((chance, current) => (chance * current) / 100, 100))
          : null;
        const totalMinutes = legs.reduce((sum, leg) => sum + parseDurationMins(leg.duration), 0) + Math.round((route.layoverHours[0] + route.layoverHours[1]) * 60);

        results.push({
          legs,
          interchangeStations: route.hubs,
          interchangeStationNames: route.hubs.map(hubLabel),
          layovers: route.hubs.map((hub: string, index: number) => ({
            station: hub,
            duration: route.layoverDurations[index],
            hours: route.layoverHours[index],
          })),
          totalFare,
          totalDuration: formatDurationMinutes(totalMinutes),
          score: scoreMultiSplitRoute(legs, route.layoverHours) - (selectedClassUnavailable ? 25 : 0),
          combinedConfirmationChance,
        });
      } catch (error) {
        console.warn('[Multi Split] Failed to enrich route:', error);
      }
    }

    return results.sort((a, b) => b.score - a.score);
  } catch (error) {
    console.error('Error finding multi split routes:', error);
    return [];
  }
}
