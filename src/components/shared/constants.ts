"use client";

export const stationOverrides: Record<string, string> = {
  ALD: "Prayagraj Junction",
  CKP: "Chakradharpur",
  DDU: "Pt Deen Dayal Upadhyaya Junction",
  DLI: "Old Delhi",
  JP: "Jaipur Junction",
  NDLS: "New Delhi",
  NZM: "Hazrat Nizamuddin",
  PRYJ: "Prayagraj Junction",
  TATA: "Tatanagar Junction",
  PNBE: "Patna",
  BSB: "Banaras/Varanasi",
  YPR: "Yesvantpur Junction",
  HWH: "Howrah Junction",
  SDAH: "Sealdah",
  CSMT: "Mumbai CSMT",
  LTT: "Lokmanya Tilak Terminus",
  MAS: "MGR Chennai Central",
  SBC: "KSR Bengaluru City",
  SC: "Secunderabad Junction",
  HYB: "Hyderabad Deccan",
  ADI: "Ahmedabad Junction",
  PNVL: "Panvel",
  DNR: "Danapur",
  PPTA: "Patliputra Junction",
  BHL: "Bhilwara",
  KLK: "Kalka",
  SML: "Shimla",
  SWM: "Sawai Madhopur Junction",
};

export const classOptions = ["2S", "SL", "3E", "3A", "2A", "1A", "CC", "EC", "FC"];
export const fareClassOptions = ["ALL", ...classOptions];
export const fareQuotaOptions = [
  { code: "GN", label: "General" },
  { code: "TQ", label: "Tatkal" },
  { code: "PT", label: "Premium Tatkal" },
  { code: "LD", label: "Ladies" },
  { code: "SS", label: "Senior Citizen" },
  { code: "DF", label: "Defence" },
  { code: "HP", label: "Divyangjan" },
  { code: "YU", label: "Youth" },
];
export const classLabelMap: Record<string, string> = {
  "2S": "Second Sitting",
  SL: "Sleeper",
  "3E": "3AC Economy",
  "3A": "Third AC",
  "2A": "Second AC",
  "1A": "First AC",
  CC: "Chair Car",
  EC: "Executive Chair",
  FC: "First Class",
};
export const popularTrainQuickPicks = ["12395", "12309", "12951", "12002", "12916"];
export const NTES_URL = "https://enquiry.indianrail.gov.in/mntes/";
export const DEFAULT_SOURCE_CODE = "";
export const DEFAULT_DESTINATION_CODE = "";
export const DEFAULT_VIA_CODE = "";

export const AUTO_LIVE_DIRECT_LIMIT = 15;
export const SPLIT_AUTO_LIVE_ROUTE_COUNT = 15;
export const SPLIT_PREVIEW_ROUTE_COUNT = 15;
export const LONG_JOURNEY_DISTANCE_KM = 1000;
export const LONG_JOURNEY_MIN_VERIFIED_SPLITS = 15;
export const LONG_JOURNEY_SPLIT_AUTO_LIVE_ROUTE_COUNT = 15;
export const LONG_JOURNEY_SPLIT_TOP_UP_ROUTE_COUNT = 5;
export const EMPTY_ROUTE: any[] = [];

export const quotaOptions = fareQuotaOptions;

export type LiveHydrationState = {
  running: boolean;
  done: number;
  total: number;
  current: string;
  rateLimited: number;
  deferred: number;
};

export const emptyLiveHydration: LiveHydrationState = {
  running: false,
  done: 0,
  total: 0,
  current: "",
  rateLimited: 0,
  deferred: 0,
};

export const runningDayLabels = ["M", "T", "W", "T", "F", "S", "S"];
export const runningDayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export const acClassSet = new Set(["1A", "2A", "3A", "3E", "CC", "EC"]);

export type ToolKind = "trains" | "live" | "pnr" | "fare" | "route" | "coach" | "train-search" | "book" | "health";

export const toolNav: { href: string; label: string; tool: ToolKind }[] = [
  { href: "/trains", label: "Trains", tool: "trains" },
  { href: "/train-search", label: "Train No.", tool: "train-search" },
  { href: "/pnr", label: "PNR", tool: "pnr" },
  { href: "/fare", label: "Fare", tool: "fare" },
  { href: "/route", label: "Route", tool: "route" },
  { href: "/coach", label: "Coach", tool: "coach" },
];


