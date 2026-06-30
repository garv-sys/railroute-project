import Fuse from "fuse.js";

import OFFICIAL_STATION_STATES from "@/data/station_states.json";
import ALL_STATIONS_DATA from "@/data/all_stations.json";

export type Station = {
  code: string;
  name: string;
  state?: string;
  zone?: string;
  division?: string;
  lat?: number | null;
  lon?: number | null;
  type?: "junction" | "station" | "halt" | string;
  aliases?: string[];
};

export type RouteStop = {
  code: string;
  stationName?: string;
  arrival: string;
  departure: string;
  halt: string;
  distance: number;
  platform?: string;
  day?: number;
};

export type TrainDetails = {
  trainNo: string;
  trainName: string;
  type: string;
  source: string;
  destination: string;
  runningDays: string[];
  classes: string[];
  route: RouteStop[];
};

const OFFICIAL_STATE_BY_CODE = OFFICIAL_STATION_STATES as Record<string, string>;

function cleanStation(station: Station): Station {
  const code = String(station.code || "").trim().toUpperCase();
  const name = String(station.name || code).trim();
  return {
    ...station,
    code,
    name,
    state: String(station.state || OFFICIAL_STATE_BY_CODE[code] || "").trim(),
    zone: String(station.zone || "").trim(),
    division: String(station.division || "").trim(),
    type: station.type || inferStationType(name),
    aliases: Array.from(new Set((station.aliases || []).map((alias) => String(alias).trim()).filter(Boolean))),
  };
}

function inferStationType(name: string) {
  const upper = name.toUpperCase();
  if (/\bHALT\b|\bHLT\b/.test(upper)) return "halt";
  if (/\bJN\b|\bJUNCTION\b/.test(upper)) return "junction";
  return "station";
}

const MANUAL_STATIONS: Station[] = [
  { code: "NHLN", name: "Naharlagun", state: "Arunachal Pradesh", zone: "NFR", division: "Rangiya", lat: 27.104, lon: 93.695, type: "station", aliases: ["Itanagar railhead"] },
  { code: "NLP", name: "North Lakhimpur", state: "Assam", zone: "NFR", division: "Rangiya", lat: 27.235, lon: 94.105, type: "station" },
  { code: "AYC", name: "Ayodhya Cantt", state: "Uttar Pradesh", zone: "NR", division: "Lucknow", lat: 26.773, lon: 82.145, type: "station", aliases: ["Faizabad Junction", "Ayodhya Cantonment"] },
  { code: "SRNG", name: "Sairang", state: "Mizoram", zone: "NFR", division: "Lumding", lat: 23.81, lon: 92.66, type: "station", aliases: ["Aizawl future railhead"] },
  { code: "SBRM", name: "Sabroom", state: "Tripura", zone: "NFR", division: "Lumding", lat: 23.001, lon: 91.724, type: "station" },
  { code: "BSBS", name: "Banaras", state: "Uttar Pradesh", zone: "NER", division: "Varanasi", lat: 25.305, lon: 82.957, type: "station", aliases: ["Manduadih"] },
  { code: "RPO", name: "Rangpo", state: "Sikkim", zone: "NFR", division: "Alipurduar", lat: 27.176, lon: 88.533, type: "station", aliases: ["Gangtok future railhead"] },
];

let stationsCache: Station[] | null = null;
let stationByCodeMap: Map<string, Station> | null = null;
let stationCoordsMap: Record<string, { lat: number; lng: number }> | null = null;
let stationAliasMap: Map<string, string[]> | null = null;
let initialized = false;

function ensureStationsInitialized() {
  if (initialized) return;
  initialized = true;

  // Previously this only loaded the full station list on the server
  // (`typeof window === "undefined"`) and used an empty array in the browser, to keep
  // the client bundle small. That meant any station not in MANUAL_STATIONS or
  // MAJOR_HUBS — i.e. most of the ~9,000 smaller stations and halts — couldn't be
  // resolved to a name/state/label by client components at all. Now statically
  // imported above, so both server and client get the full list.
  const STATIONS = ALL_STATIONS_DATA;
  stationsCache = Array.from(
    new Map(
      ([...(STATIONS as Station[]), ...MANUAL_STATIONS])
        .map(cleanStation)
        .filter((station) => station.code && station.name)
        .map((station) => [station.code, station])
    ).values()
  );

  stationByCodeMap = new Map(stationsCache.map((station) => [station.code, station]));

  stationCoordsMap = Object.fromEntries(
    stationsCache
      .filter((station) => Number.isFinite(station.lat) && Number.isFinite(station.lon))
      .map((station) => [station.code, { lat: Number(station.lat), lng: Number(station.lon) }])
  );

  try {
    const MAJOR_HUBS = require("@/data/major_hubs.json");
    for (const hub of MAJOR_HUBS) {
      const code = String(hub.code || "").toUpperCase();
      if (!stationCoordsMap[code] && Number.isFinite(hub.lat) && Number.isFinite(hub.lon)) {
        stationCoordsMap[code] = { lat: Number(hub.lat), lng: Number(hub.lon) };
      }
      if (!stationByCodeMap.has(code)) {
        stationByCodeMap.set(code, {
          code,
          name: hub.name,
          state: hub.state,
          zone: hub.zone,
          lat: hub.lat,
          lon: hub.lon,
          type: "junction"
        });
      }
    }
  } catch (e) {
    console.error("Failed to load major hubs fallback coordinates:", e);
  }

  stationAliasMap = new Map<string, string[]>();

  for (const [alias, codes] of Object.entries(COMMON_CITY_ALIASES)) {
    for (const code of codes) {
      addAliasToMap(stationAliasMap, alias, code);
    }
  }

  for (const station of stationsCache) {
    addAliasToMap(stationAliasMap, station.name, station.code);
    addAliasToMap(stationAliasMap, stationCityName(station), station.code);
    for (const alias of station.aliases || []) {
      addAliasToMap(stationAliasMap, alias, station.code);
    }
  }
}

function addAliasToMap(map: Map<string, string[]>, alias: string, code: string) {
  const key = normalizeText(alias);
  if (!key || !code) return;
  const current = map.get(key) || [];
  if (!current.includes(code)) current.push(code);
  map.set(key, current);
}

export const stations: Station[] = new Proxy([] as Station[], {
  get(target, prop) {
    ensureStationsInitialized();
    if (prop === "length") return stationsCache!.length;
    const value = (stationsCache as any)[prop];
    return typeof value === "function" ? value.bind(stationsCache) : value;
  },
  ownKeys() {
    ensureStationsInitialized();
    return Reflect.ownKeys(stationsCache!);
  },
  getOwnPropertyDescriptor(target, prop) {
    ensureStationsInitialized();
    return Reflect.getOwnPropertyDescriptor(stationsCache!, prop);
  }
});

export const STATION_COORDS: Record<string, { lat: number; lng: number }> = new Proxy({} as Record<string, { lat: number; lng: number }>, {
  get(target, prop) {
    ensureStationsInitialized();
    if (typeof prop !== "string") return undefined;
    return stationCoordsMap![prop];
  },
  ownKeys() {
    ensureStationsInitialized();
    return Reflect.ownKeys(stationCoordsMap!);
  },
  getOwnPropertyDescriptor(target, prop) {
    ensureStationsInitialized();
    if (typeof prop !== "string") return undefined;
    return Reflect.getOwnPropertyDescriptor(stationCoordsMap!, prop);
  }
});

const COMMON_CITY_ALIASES: Record<string, string[]> = {
  ADILABAD: ["ADB"],
  AGARTALA: ["AGTL", "SBRM"],
  AHMEDABAD: ["ADI", "ADIJ", "SBIB", "GNC"],
  AIZAWL: ["BHRB", "SCL"],
  AMARAVATI: ["BZA", "GNT", "TEL"],
  AMRITSAR: ["ASR"],
  ANDAMAN: ["HWH", "MAS", "VSKP"],
  "ANDAMAN AND NICOBAR": ["HWH", "MAS", "VSKP"],
  ARUNACHAL: ["NHLN", "NLP", "DKGN", "GHY"],
  AYODHYA: ["AY", "AYC"],
  "AYODHYA CANT": ["AYC", "AY"],
  "AYODHYA CANTT": ["AYC", "AY"],
  AZARA: ["AZA"],
  BANARAS: ["BSB", "BSBS"],
  BANGALORE: ["SBC", "YPR", "SMVB", "BNC", "WFD"],
  BANGLORE: ["SBC", "YPR", "SMVB", "BNC", "WFD"],
  BARODA: ["BRC"],
  BENGALURU: ["SBC", "YPR", "SMVB", "BNC", "WFD"],
  "BENGALURU CITY": ["SBC", "YPR", "SMVB", "BNC", "WFD"],
  BENARAS: ["BSB", "BSBS"],
  BHOPAL: ["BPL", "HBJ"],
  "BHOPAL NEW": ["HBJ"],
  BNDE: ["HBJ"],
  BHUBANESWAR: ["BBS", "KUR", "LGTR"],
  BHILAI: ["BPHB", "DURG", "R"],
  "BHILAI POWER HOUSE": ["BPHB"],
  BHPH: ["BPHB"],
  BLR: ["SBC", "YPR", "SMVB", "BNC", "WFD"],
  BOMBAY: ["CSMT", "MMCT", "LTT", "BDTS", "DR", "TNA", "KYN"],
  BARG: ["BRGA"],
  "BARGARH ROAD": ["BRGA"],
  BAYTU: ["BUT"],
  BODH_GAYA: ["GAYA"],
  "BODH GAYA": ["GAYA"],
  CALCUTTA: ["HWH", "SDAH", "KOAA", "SHM", "SRC"],
  CHANDIGARH: ["CDG", "SASN", "UMB", "UBC"],
  CHENNAI: ["MAS", "MS", "TBM", "MSB", "PER", "VLK"],
  CHERRAPUNJI: ["GHY"],
  CHHATTISGARH: ["R", "DURG", "BPHB"],
  COCHIN: ["ERS"],
  COORG: ["MYS"],
  DAMAN: ["VAPI", "ST"],
  DAMA: ["DMO"],
  DAMOH: ["DMO"],
  DARJEELING: ["NJP"],
  DUMRAON: ["DURE"],
  BHILWARA: ["BHL"],
  RANCHI: ["RNC", "HTE"],
  JHARSUGUDA: ["JSG"],
  MURI: ["MURI"],
  DAWKI: ["GHY"],
  DEHRADUN: ["DDN", "HW", "RK"],
  DELHI: ["NDLS", "DLI", "NZM", "ANVT", "DEE", "DSJ", "DEC", "SSB"],
  "NEW DELHI": ["NDLS", "DLI", "NZM", "ANVT", "DEE", "DSJ", "DEC", "SSB"],
  "OLD DELHI": ["DLI", "NDLS", "NZM", "ANVT", "DEE", "DSJ", "DEC", "SSB"],
  DHARAMSHALA: ["KGRA", "KGMR", "PTKC"],
  DISPUR: ["GHY", "KYQ", "AZA"],
  DWARKA: ["DWK"],
  DWKA: ["DWK"],
  DZUKOU: ["DMV"],
  GANDHINAGAR: ["GNC", "ADI"],
  GANDHINAGAR_GUJARAT: ["GNC", "ADI"],
  "GANDHINAGAR GUJARAT": ["GNC", "ADI"],
  GANGTOK: ["NJP", "RPO"],
  GMOH: ["GMO"],
  GOMOH: ["GMO"],
  GOA: ["KRMI", "MAO", "VSG", "THVM"],
  GUWAHATI: ["GHY", "KYQ"],
  HARIDWAR: ["HW"],
  HYDERABAD: ["SC", "HYB", "KCG", "BMT", "LPI", "NMP"],
  IMPHAL: ["JRBM", "GHY"],
  ITANAGAR: ["NHLN", "NLP", "DKGN", "GHY"],
  JAIPUR: ["JP", "GADJ", "DPA", "GTJT"],
  JAGATPURA: ["GTJT"],
  JATP: ["GTJT"],
  JEYPORE: ["JYP"],
  JIRIBAM: ["JRBM"],
  JORHAT: ["JTTN"],
  KANYAKUMARI: ["CAPE"],
  "CAPE CAMORIN": ["CAPE"],
  KASOL: ["UHL", "UNA", "CDG"],
  KANGRA: ["KGRA", "KGMR"],
  KATRA: ["SVDK"],
  KAVARATTI: ["ERS"],
  KERALA_CAPITAL: ["TVC", "KCVL", "TVP"],
  "KERALA CAPITAL": ["TVC", "KCVL", "TVP"],
  KOHIMA: ["DMV"],
  KODERMA: ["KQR"],
  KOLKATA: ["HWH", "SDAH", "KOAA", "SHM", "SRC", "KGP"],
  KSRB: ["SBC"],
  LADAKH: ["JAT", "UHP", "SVDK"],
  LAKSHADWEEP: ["ERS"],
  LEH: ["JAT", "UHP", "SVDK"],
  LGR: ["LGTR"],
  LUCKNOW: ["LKO", "LJN", "ASH", "LC", "GNR"],
  MADRAS: ["MAS", "MS", "TBM"],
  MAJULI: ["JTTN"],
  MANALI: ["CDG", "UMB"],
  MANDUADIH: ["BSBS", "BSB"],
  MAIHAR: ["MYR"],
  MATHURA: ["MTJ"],
  MCLEODGANJ: ["PTKC", "KGRA"],
  MEGHALAYA: ["GHY"],
  MIZORAM: ["BHRB", "SCL"],
  MNDM: ["BSBS", "BSB"],
  MOHALI: ["SASN"],
  MOLI: ["SASN"],
  MUMBAI: ["CSMT", "MMCT", "LTT", "BDTS", "DR", "TNA", "KYN"],
  MUSSOORIE: ["DDN"],
  MYSORE: ["MYS"],
  NAGALAND: ["DMV"],
  NAINITAL: ["KGM"],
  NARSINGHPUR: ["NU"],
  NASHIK: ["NK"],
  "NASHIK ROAD": ["NK"],
  NAUPADA: ["NWP"],
  "NAUPADA JN": ["NWP"],
  NIMBAHERA: ["NBH"],
  NLPR: ["NLP"],
  "NORTH LAKHIMPUR": ["NLP"],
  OOTY: ["UAM"],
  OBRA: ["OBR"],
  "OBRA DAM": ["OBR"],
  PANAJI: ["KRMI", "MAO", "VSG", "THVM"],
  PANJIM: ["KRMI", "MAO", "VSG", "THVM"],
  PATNA: ["PNBE", "RJPB", "PNEC", "PPTA", "DNR"],
  PONDICHERRY: ["PDY", "VM"],
  PHALODI: ["PLCJ", "PLC"],
  FLN: ["PLCJ", "PLC"],
  PHULERA: ["FL"],
  POOONA: ["PUNE"],
  POONA: ["PUNE"],
  PORT_BLAIR: ["HWH", "MAS", "VSKP"],
  "PORT BLAIR": ["HWH", "MAS", "VSKP"],
  PUDUCHERRY: ["PDY", "VM"],
  PURI: ["PURI"],
  RAIPUR: ["R", "DURG", "BPHB"],
  RAJGIR: ["RGD"],
  RANI_KAMLAPATI: ["HBJ"],
  "RANI KAMLAPATI": ["HBJ"],
  RAMESWARAM: ["RMM"],
  RANGPO: ["RPO", "NJP"],
  RGR: ["RGD"],
  RISHIKESH: ["RKSH", "YNRK", "HW"],
  RNC_CAPITAL: ["RNC", "HTE"],
  "RNC CAPITAL": ["RNC", "HTE"],
  SHILLONG: ["GHY"],
  SHAHJAHANPUR: ["SPN", "SZP"],
  SHIMLA: ["SML", "KLK"],
  SHIRDI: ["SNSI"],
  SIMLA: ["SML", "KLK"],
  SIKKIM: ["NJP", "RPO"],
  SILCHAR: ["SCL"],
  SOMNATH: ["SMNH", "VRL"],
  SPITI: ["SML", "KLK"],
  SRINAGAR: ["JAT", "UHP", "SVDK"],
  SWAY: ["SWM"],
  "SAWAI MADHOPUR": ["SWM"],
  TAWANG: ["GHY"],
  THIRUVANANTHAPURAM: ["TVC", "KCVL", "TVP"],
  TITLAGARH: ["TIG"],
  TIRUPATI: ["TPTY", "RU"],
  TRIVANDRUM: ["TVC", "KCVL", "TVP"],
  UJJAIN: ["UJN"],
  VARANASI: ["BSB", "BSBS"],
  ZIRO: ["NHLN"],
};


export type RailAccessAdvisory = {
  title: string;
  message: string;
  nearestCodes: string[];
};

const RAIL_ACCESS_ADVISORIES: Record<string, RailAccessAdvisory> = {
  andaman: {
    title: "No railway to Andaman & Nicobar",
    message: "Take a flight to Port Blair or a ship from Kolkata, Chennai or Visakhapatnam.",
    nearestCodes: ["HWH", "MAS", "VSKP"],
  },
  andamanandnicobar: {
    title: "No railway to Andaman & Nicobar",
    message: "Take a flight to Port Blair or a ship from Kolkata, Chennai or Visakhapatnam.",
    nearestCodes: ["HWH", "MAS", "VSKP"],
  },
  andamannicobar: {
    title: "No railway to Andaman & Nicobar",
    message: "Take a flight to Port Blair or a ship from Kolkata, Chennai or Visakhapatnam.",
    nearestCodes: ["HWH", "MAS", "VSKP"],
  },
  portblair: {
    title: "No railway to Port Blair",
    message: "Use Kolkata, Chennai or Visakhapatnam for ship connections, or fly directly.",
    nearestCodes: ["HWH", "MAS", "VSKP"],
  },
  lakshadweep: {
    title: "No railway to Lakshadweep",
    message: "Take a ship or flight from Kochi. Railhead: Ernakulam Junction.",
    nearestCodes: ["ERS"],
  },
  kavaratti: {
    title: "No railway to Kavaratti",
    message: "Take a ship or flight from Kochi. Railhead: Ernakulam Junction.",
    nearestCodes: ["ERS"],
  },
  ladakh: {
    title: "No railway to Ladakh",
    message: "Nearest major railhead is Jammu Tawi; continue by road or flight to Leh.",
    nearestCodes: ["JAT", "UHP", "SVDK"],
  },
  leh: {
    title: "No railway to Leh",
    message: "Nearest major railhead is Jammu Tawi, roughly 700 km away.",
    nearestCodes: ["JAT", "UHP", "SVDK"],
  },
  srinagar: {
    title: "Rail to Srinagar is still limited",
    message: "Use Jammu Tawi, Udhampur or Shri Vaishno Devi Katra, then continue by road.",
    nearestCodes: ["JAT", "UHP", "SVDK"],
  },
  kashmir: {
    title: "Use Jammu/Katra for Kashmir rail access",
    message: "For Srinagar and Kashmir valley searches, use Jammu Tawi, Udhampur or Shri Vaishno Devi Katra, then continue by road.",
    nearestCodes: ["JAT", "UHP", "SVDK"],
  },
  jammuandkashmir: {
    title: "Use Jammu/Katra for Kashmir rail access",
    message: "For Srinagar and Kashmir valley searches, use Jammu Tawi, Udhampur or Shri Vaishno Devi Katra, then continue by road.",
    nearestCodes: ["JAT", "UHP", "SVDK"],
  },
  shillong: {
    title: "No railway in Shillong",
    message: "Use Guwahati, about 100 km away, then continue by road.",
    nearestCodes: ["GHY"],
  },
  meghalaya: {
    title: "No railway in Shillong",
    message: "Use Guwahati, about 100 km away, then continue by road.",
    nearestCodes: ["GHY"],
  },
  gangtok: {
    title: "No active railway in Gangtok",
    message: "Use New Jalpaiguri, then shared jeep or taxi to Gangtok. Rangpo is under development.",
    nearestCodes: ["NJP", "RPO"],
  },
  sikkim: {
    title: "No active passenger rail inside Sikkim",
    message: "Use New Jalpaiguri, then shared jeep or taxi toward Gangtok.",
    nearestCodes: ["NJP"],
  },
  itanagar: {
    title: "Use Naharlagun for Itanagar",
    message: "Naharlagun is the closest railhead for Itanagar; connectivity is limited.",
    nearestCodes: ["NHLN", "NLP", "DKGN"],
  },
  arunachal: {
    title: "Limited rail access in Arunachal Pradesh",
    message: "Use Naharlagun for Itanagar or Guwahati for wider onward options.",
    nearestCodes: ["NHLN", "NLP", "GHY"],
  },
  imphal: {
    title: "No direct railway to Imphal",
    message: "Use Jiribam, then road transfer to Imphal.",
    nearestCodes: ["JRBM", "GHY"],
  },
  manipur: {
    title: "No direct railway to Imphal",
    message: "Use Jiribam, then road transfer to Imphal.",
    nearestCodes: ["JRBM", "GHY"],
  },
  aizawl: {
    title: "Limited rail near Aizawl",
    message: "Use Bairabi or Silchar, then road transfer.",
    nearestCodes: ["BHRB", "SCL"],
  },
  mizoram: {
    title: "Limited rail near Aizawl",
    message: "Use Bairabi or Silchar, then road transfer.",
    nearestCodes: ["BHRB", "SCL"],
  },
  kohima: {
    title: "No railway to Kohima",
    message: "Use Dimapur, then road transfer to Kohima.",
    nearestCodes: ["DMV"],
  },
  nagaland: {
    title: "No railway to Kohima",
    message: "Use Dimapur, then road transfer to Kohima.",
    nearestCodes: ["DMV"],
  },
  panaji: {
    title: "No station inside Panaji",
    message: "Use Karmali for Panaji, or Madgaon for wider Goa train connectivity.",
    nearestCodes: ["KRMI", "MAO"],
  },
  panjim: {
    title: "No station inside Panaji",
    message: "Use Karmali for Panaji, or Madgaon for wider Goa train connectivity.",
    nearestCodes: ["KRMI", "MAO"],
  },
  dharamshala: {
    title: "No mainline station in Dharamshala",
    message: "Use Kangra for the closest railhead or Pathankot Cantt for stronger mainline connectivity.",
    nearestCodes: ["KGRA", "PTKC"],
  },
  manali: {
    title: "No railway to Manali",
    message: "Use Chandigarh or Ambala, then road transfer.",
    nearestCodes: ["CDG", "UMB"],
  },
  tawang: {
    title: "No railway to Tawang",
    message: "Use Guwahati, then road transfer through Arunachal Pradesh.",
    nearestCodes: ["GHY"],
  },
  cherrapunji: {
    title: "No railway to Cherrapunji",
    message: "Use Guwahati, then road transfer via Shillong.",
    nearestCodes: ["GHY"],
  },
  dawki: {
    title: "No railway to Dawki",
    message: "Use Guwahati, then road transfer via Shillong.",
    nearestCodes: ["GHY"],
  },
};

export function railAccessAdvisory(query: string) {
  const normalized = normalizeText(query);
  if (!normalized || normalized.length < 3) return undefined;
  return RAIL_ACCESS_ADVISORIES[normalized];
}

type StationSearchDocument = {
  station: Station;
  code: string;
  name: string;
  state: string;
  zone: string;
  aliases: string[];
  normalizedCode: string;
  normalizedName: string;
  normalizedCity: string;
  normalizedState: string;
  normalizedZone: string;
  normalizedAliases: string[];
};

let stationSearchDocumentsCache: StationSearchDocument[] | null = null;
let stationFuseCache: Fuse<StationSearchDocument> | null = null;

function ensureFuseInitialized() {
  if (stationFuseCache) return;
  ensureStationsInitialized();

  stationSearchDocumentsCache = stationsCache!.map((station) => {
    const city = stationCityName(station);
    const aliases = station.aliases || [];
    return {
      station,
      code: station.code,
      name: station.name,
      state: station.state || "",
      zone: station.zone || "",
      aliases,
      normalizedCode: normalizeText(station.code),
      normalizedName: normalizeText(station.name),
      normalizedCity: normalizeText(city),
      normalizedState: normalizeText(station.state || ""),
      normalizedZone: normalizeText(station.zone || ""),
      normalizedAliases: aliases.map(normalizeText),
    };
  });

  stationFuseCache = new Fuse(stationSearchDocumentsCache, {
    keys: [
      { name: "name", weight: 0.58 },
      { name: "code", weight: 0.3 },
      { name: "state", weight: 0.08 },
      { name: "zone", weight: 0.04 },
      { name: "aliases", weight: 0.46 },
    ],
    threshold: 0.35,
    includeScore: true,
    minMatchCharLength: 2,
    ignoreLocation: true,
  });
}

const STATION_MATCH_CACHE = new Map<string, Station[]>();

export function titleCase(value: string) {
  return value
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace(/\bJn\b/g, "Junction")
    .replace(/\bT\b/g, "T");
}

export function normalizeText(value: string) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function stationByCode(code: string) {
  ensureStationsInitialized();
  return stationByCodeMap!.get(String(code || "").trim().toUpperCase());
}

export function stationState(code: string) {
  const upperCode = String(code || "").toUpperCase();
  const station = stationByCode(upperCode);
  return station?.state || OFFICIAL_STATE_BY_CODE[upperCode] || "India";
}

export function stationCityName(station: Station) {
  return titleCase(
    String(station.name || station.code)
      .replace(/\bJN\b|\bJUNCTION\b|\bRAILWAY STATION\b|\bHALT\b/gi, "")
      .replace(/\s+/g, " ")
      .trim()
  );
}

export function stationLabel(station: Station, withCode = true) {
  const city = stationCityName(station);
  const state = station.state || stationState(station.code);
  const label = state && state !== "India" ? `${city} (${state})` : city;
  return withCode ? `${label} — ${station.code}` : label;
}

export function stationLabelFromCode(code: string, withCode = true) {
  if (!code) return "";
  const station = stationByCode(code);
  if (!station) return code;
  return stationLabel(station, withCode);
}

export function stationAliasCodes(query: string) {
  ensureStationsInitialized();
  const normalized = normalizeText(query);
  if (!normalized) return [];
  return (stationAliasMap!.get(normalized) || []).filter((code) => stationByCodeMap!.has(code));
}

export function stationRelatedCodes(query: string, limit = 8) {
  const rawQuery = String(query || "").trim();
  const exactStation = stationByCode(rawQuery.toUpperCase());
  const related = [
    ...(exactStation ? [exactStation.code] : []),
    ...stationAliasCodes(rawQuery),
    ...(exactStation ? stationAliasCodes(stationCityName(exactStation)) : []),
  ];
  ensureStationsInitialized();
  return Array.from(new Set(related)).filter((code) => stationByCodeMap!.has(code)).slice(0, limit);
}

function stationSearchPriority(station: Station, normalized: string, query: string, codeLikeQuery = false) {
  const code = normalizeText(station.code);
  const name = normalizeText(station.name);
  const city = normalizeText(stationCityName(station));
  const aliases = (station.aliases || []).map(normalizeText);
  let score = 0;
  if (codeLikeQuery && code === normalized) score += 1000;
  if (aliases.includes(normalized)) score += 820;
  if (codeLikeQuery && code.startsWith(normalized)) score += 460;
  if (city.startsWith(normalized)) score += 360;
  if (name.startsWith(normalized)) score += 320;
  if (aliases.some((alias) => alias.startsWith(normalized))) score += 300;
  if (name.includes(normalized) || city.includes(normalized)) score += 160;
  if (station.name.toLowerCase() === query.toLowerCase()) score += 120;
  if (score > 0 && station.type === "junction") score += 12;
  return score;
}

function mergeStationMatches(items: Station[], limit: number) {
  const seen = new Set<string>();
  const merged: Station[] = [];
  for (const station of items) {
    if (!station?.code || seen.has(station.code)) continue;
    seen.add(station.code);
    merged.push(station);
    if (merged.length >= limit) break;
  }
  return merged;
}

export function stationMatches(query: string, limit = 8) {
  const rawQuery = String(query || "").trim();
  const normalized = normalizeText(rawQuery);
  if (!normalized || normalized.length < 2) return [];
  const cacheKey = `${normalized}:${limit}`;
  const cached = STATION_MATCH_CACHE.get(cacheKey);
  if (cached) return cached;

  const codeLikeQuery = /^[A-Z0-9]{2,6}$/.test(rawQuery);
  const aliasMatches = stationAliasCodes(rawQuery)
    .map((code) => stationByCode(code))
    .filter((station): station is Station => Boolean(station));
  const exactCode = codeLikeQuery ? stationByCode(rawQuery.toUpperCase()) : undefined;
  
  ensureFuseInitialized();

  const prefixMatches = stationSearchDocumentsCache!
    .map((document) => ({
      station: document.station,
      score: stationSearchPriority(document.station, normalized, rawQuery, codeLikeQuery),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || stationCityName(a.station).localeCompare(stationCityName(b.station)))
    .map((item) => item.station);
  const fuseMatches = aliasMatches.length > 0
    ? []
    : stationFuseCache!.search(rawQuery, { limit: Math.max(limit * 4, 16) })
      .map((result) => result.item.station);

  const matches = mergeStationMatches([
    ...aliasMatches,
    ...(exactCode ? [exactCode] : []),
    ...prefixMatches,
    ...fuseMatches,
  ], limit);
  STATION_MATCH_CACHE.set(cacheKey, matches);
  return matches;
}

export function buildCoachSeats(classType: string, coach = "B1") {
  const isChair = ["CC", "EC"].includes(classType);
  const normalizedClass = classType === "3E" ? "3A" : classType;
  const capacityByClass: Record<string, number> = {
    "1A": 24,
    "2A": 54,
    "3A": 72,
    "3E": 83,
    SL: 72,
    "2S": 108,
    CC: 78,
    EC: 56,
    FC: 24,
  };
  const count = capacityByClass[classType] || (isChair ? 78 : normalizedClass === "1A" ? 24 : normalizedClass === "2A" ? 54 : normalizedClass === "3A" ? 72 : 72);

  return Array.from({ length: count }, (_, index) => {
    const number = index + 1;
    const state = "layout";
    let berth = isChair ? ["W", "MW", "M", "ME", "E"][index % 5] : `${number}`;
    let cabin = "";
    if (!isChair && normalizedClass === "1A") {
      const cabinIndex = Math.floor(index / 4);
      cabin = `Cabin ${String.fromCharCode(65 + cabinIndex)}`;
      berth = index % 2 === 0 ? "LB" : "UB";
    } else if (!isChair && normalizedClass === "2A") {
      berth = ["LB", "UB", "LB", "UB", "SL", "SU"][index % 6];
    } else if (!isChair) {
      berth = ["LB", "MB", "UB", "LB", "MB", "UB", "SL", "SU"][index % 8];
    }
    return {
      id: `${coach}-${number}`,
      number,
      berth,
      cabin,
      state,
    };
  });
}
