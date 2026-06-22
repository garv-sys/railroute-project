"use client";

import React, { useState, useEffect, useMemo, useRef, FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  ArrowDownUp,
  ArrowRight,
  Circle,
  Compass,
  IndianRupee,
  Loader2,
  MapPin,
  Route,
  Search,
  ShieldCheck,
  Sparkles,
  Train,
  WalletCards,
  X,
} from "lucide-react";

import { ThemeToggle } from "@/components/theme-toggle";
import { DataBadge, badgeTypeFromSource } from "@/components/trust/DataBadge";
import { formatTrustUpdated, trustMetaForTrainList, trustMetaFromTrain, type TrustMeta } from "@/lib/confidence";
import type { LookupTrustStatus } from "@/lib/railway-trust";
import {
  buildCoachSeats,
  normalizeText,
  railAccessAdvisory,
  stationByCode,
  stationAliasCodes,
  stationCityName,
  stationLabel,
  stationLabelFromCode,
  stationMatches,
  stationRelatedCodes,
  stationState,
  STATION_COORDS,
  titleCase,
  type Station,
} from "@/lib/railway-intelligence";

import { softPanel, productBg } from "./styles";
import {
  stationOverrides,
  classOptions,
  fareClassOptions,
  fareQuotaOptions,
  classLabelMap,
  popularTrainQuickPicks,
  NTES_URL,
  DEFAULT_SOURCE_CODE,
  DEFAULT_DESTINATION_CODE,
  DEFAULT_VIA_CODE,
  AUTO_LIVE_DIRECT_LIMIT,
  SPLIT_AUTO_LIVE_ROUTE_COUNT,
  SPLIT_PREVIEW_ROUTE_COUNT,
  LONG_JOURNEY_DISTANCE_KM,
  LONG_JOURNEY_MIN_VERIFIED_SPLITS,
  LONG_JOURNEY_SPLIT_AUTO_LIVE_ROUTE_COUNT,
  LONG_JOURNEY_SPLIT_TOP_UP_ROUTE_COUNT,
  EMPTY_ROUTE,
  quotaOptions,
  runningDayLabels,
  runningDayNames,
  acClassSet,
  emptyLiveHydration,
  type LiveHydrationState,
} from "./constants";
import { postJson } from "./api";
import {
  todayIso,
  prettyDateLabel,
  addIsoDays,
  shortDateLabel,
  formatIstDateTime,
  formatCountdown,
  tatkalQuotaInfo,
  journeyWeekdayIndex,
  journeyWeekdayName,
  normalizeRunsOnDays,
  timeAmPm,
  useDebouncedValue,
  stationCompactLabel,
  stationNameFromCode,
} from "./utils";
import { LoadingBlock } from "./LoadingBlock";
import { StationAutocomplete, RelatedStationChips, QuickSearch } from "./StationAutocomplete";
import { ProductShell } from "../layout/ProductShell";
import { ToolHeader } from "../layout/ToolHeader";
import { CoachExplorer } from "../tools/CoachExplorer";
import { BookingWorkspace } from "../tools/BookingWorkspace";


export function QuotaTimingNotice({ date, classType, quota }: { date: string; classType: string; quota: string }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const cleanQuota = String(quota || "").toUpperCase();
    if (cleanQuota !== "TQ" && cleanQuota !== "PT") return;
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, [quota]);
  const info = tatkalQuotaInfo(date, classType, quota, now);
  if (!info) return null;
  return (
    <div className="mt-3 rounded-2xl border border-amber-300/40 bg-amber-50 px-4 py-3 text-sm font-bold leading-6 text-amber-950 dark:border-amber-300/25 dark:bg-amber-300/10 dark:text-amber-50">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-black">{info.title}</span>
        <span className="rounded-md border border-amber-300/45 bg-white/70 px-2.5 py-1 text-xs font-black text-amber-900 dark:bg-black/20 dark:text-amber-100">
          {info.opened ? "Booking window open" : `Opens in ${info.countdown}`}
        </span>
      </div>
      <div className="mt-1">
        {info.copy} Opens {formatIstDateTime(info.opensAt)} IST. {info.premiumCopy}
      </div>
    </div>
  );
}

export function RunningDaysStrip({ train, journeyDate, compact = false }: { train: any; journeyDate: string; compact?: boolean }) {
  const days = normalizeRunsOnDays(train);
  const selectedIndex = journeyWeekdayIndex(journeyDate);
  if (!days) {
    return (
      <div className="mt-3 inline-flex rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-semibold text-slate-500 dark:border-white/10 dark:bg-white/6 dark:text-slate-300">
        Running days not returned
      </div>
    );
  }
  const selectedRuns = selectedIndex >= 0 ? days[selectedIndex] : null;
  return (
    <div className={`mt-3 flex flex-wrap items-center gap-1.5 ${compact ? "mt-0" : ""}`}>
      {!compact && <span className="mr-1 text-[11px] font-black uppercase text-slate-400">Runs on</span>}
      {days.map((runs, index) => {
        const selected = index === selectedIndex;
        return (
          <span
            key={`${runningDayNames[index]}-${index}`}
            title={`${runningDayNames[index]}${selected ? " selected journey day" : ""}`}
            className={`inline-flex h-7 min-w-7 items-center justify-center rounded-md border px-2 text-[11px] font-black ${
              runs
                ? "border-slate-950 bg-slate-950 text-white dark:border-white dark:bg-white dark:text-slate-950"
                : "border-slate-200 bg-slate-100 text-slate-400 dark:border-white/10 dark:bg-white/6 dark:text-slate-500"
            } ${selected ? "ring-2 ring-cyan-400/70 ring-offset-1 ring-offset-white dark:ring-offset-[#101827]" : ""}`}
          >
            {runningDayLabels[index]}
          </span>
        );
      })}
      {selectedRuns === false && (
        <span className="ml-1 rounded-md border border-rose-300/40 bg-rose-50 px-2 py-1 text-[10px] font-black uppercase text-rose-700 dark:bg-rose-400/10 dark:text-rose-100">
          Not this day
        </span>
      )}
    </div>
  );
}

export function TrustSummary({ meta }: { meta: TrustMeta }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
      <DataBadge type={badgeTypeFromSource(meta.source)} />
      <span>{formatTrustUpdated(meta)}</span>
    </div>
  );
}

export function ResultSectionHeader({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="mt-8 mb-3 flex flex-wrap items-end justify-between gap-2">
      <div>
        <div className="text-[11px] font-black uppercase text-slate-400">RailRoute results</div>
        <h3 className="mt-1 text-xl font-black">{title}</h3>
      </div>
      <p className="max-w-xl text-xs font-semibold leading-5 text-slate-500 dark:text-slate-400">{detail}</p>
    </div>
  );
}

export function SearchResultSummary({
  trains,
  splitCount,
  multiSplitCount,
  scheduleOnlyDirectCount = 0,
  loading = false,
  splitLoading = false,
  date,
  classType,
  quota = "GN",
}: {
  trains: any[];
  splitCount: number;
  multiSplitCount: number;
  scheduleOnlyDirectCount?: number;
  loading?: boolean;
  splitLoading?: boolean;
  date: string;
  classType: string;
  quota?: string;
}) {
  const meta = trustMetaForTrainList(trains);
  const directCount = trains.length;
  const optionCount = directCount + splitCount + multiSplitCount;
  const showFindingOptions = (loading && directCount === 0) || (splitLoading && splitCount + multiSplitCount === 0);
  const exactClass = classType && classType !== "Any" ? classType : "Provider-returned classes";
  const scheduleOnlyCopy = scheduleOnlyDirectCount > 0
    ? `${scheduleOnlyDirectCount} schedule-only direct`
    : "No schedule-only direct rows";

  return (
    <div className={softPanel("mt-6 rounded-2xl p-4")}>
      <div className="grid gap-3 md:grid-cols-4">
        <div>
          <div className="text-[10px] font-black uppercase text-slate-400">Showing</div>
          <div className="mt-1 text-2xl font-black">
            {showFindingOptions ? "Finding..." : `${optionCount} option${optionCount === 1 ? "" : "s"}`}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-black uppercase text-slate-400">Live direct trains</div>
          <div className="mt-1 text-2xl font-black">{loading && directCount === 0 ? "Scanning..." : directCount}</div>
          {!loading && scheduleOnlyDirectCount > 0 && (
            <div className="mt-1 text-[11px] font-bold text-amber-700 dark:text-amber-200">{scheduleOnlyCopy}</div>
          )}
        </div>
        <div>
          <div className="text-[10px] font-black uppercase text-slate-400">Search date</div>
          <div className="mt-1 text-lg font-black">{prettyDateLabel(date)}</div>
        </div>
        <div>
          <div className="text-[10px] font-black uppercase text-slate-400">Journey weekday</div>
          <div className="mt-1 text-lg font-black">{journeyWeekdayName(date)}</div>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
        <DataBadge type={badgeTypeFromSource(meta.source)} label={meta.source === "cached" ? "Cached train list; fare/seat per row" : "Provider train search"} />
        <span className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 dark:border-white/10 dark:bg-white/6">{formatTrustUpdated(meta)}</span>
        <span className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 dark:border-white/10 dark:bg-white/6">Class queried: {exactClass}</span>
        <span className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 dark:border-white/10 dark:bg-white/6">Quota queried: {quota}</span>
        <span className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 dark:border-white/10 dark:bg-white/6">Journey date queried: {date}</span>
        {scheduleOnlyDirectCount > 0 && (
          <span className="rounded-md border border-amber-300/35 bg-amber-50 px-2.5 py-1 text-amber-900 dark:border-amber-300/20 dark:bg-amber-300/10 dark:text-amber-100">
            {scheduleOnlyCopy} did not return selected-class live fare + seats
          </span>
        )}
      </div>
    </div>
  );
}

export function inferLookupStatus(value: unknown): LookupTrustStatus {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return "PROVIDER_UNAVAILABLE";
  if (/rate.?limit|too many requests|429|delayed this exact request|quota exceeded/.test(text)) return "RATE_LIMITED";
  if (/not requested|tap class|check availability|check fare/.test(text)) return "NOT_CHECKED";
  if (/cached|schedule only|schedule-only|reference route/.test(text)) return "CACHE_ONLY";
  if (/available|curr_av|avl|rac|wl|waitlist|regret|cnf|confirm/.test(text) && !/unavailable|not returned|not requested/.test(text)) return "VERIFIED";
  return "PROVIDER_UNAVAILABLE";
}

export function lookupStatusLabel(status: LookupTrustStatus | undefined, kind: "availability" | "fare", classCode?: string, reason?: unknown) {
  const code = classCode ? ` for ${classCode}` : "";
  const detail = String(reason || "").trim();
  if (status === "VERIFIED") return kind === "fare" ? "Provider returned fare for this exact request" : `Provider returned availability${code} for this exact request`;
  if (status === "NOT_CHECKED") return kind === "fare" ? "Estimated fare shown" : `Tap to check seats${code}`;
  if (status === "RATE_LIMITED") return kind === "fare" ? "Estimated fare shown" : `Check seats${code}`;
  if (status === "CACHE_ONLY") return kind === "fare" ? "Estimated fare shown" : `Tap to check seats${code}`;
  if (detail && !/live data unavailable|live fare unavailable|rate.?limit|too many requests|429|provider did not return/i.test(detail)) return detail;
  return kind === "fare" ? "Estimated fare shown" : `Tap to check seats${code}`;
}

export function trainAvailabilityStatus(train: any, classCode?: string): LookupTrustStatus {
  const code = String(classCode || train?.classType || "").toUpperCase();
  const first = code ? train?.classAvailability?.[code]?.[0] : undefined;
  return first?.availabilityStatus || train?.availabilityStatus || inferLookupStatus(first?.text || train?.availability);
}

export function trainFareStatus(train: any, classCode?: string): LookupTrustStatus {
  const code = String(classCode || train?.classType || "").toUpperCase();
  const first = code ? train?.classAvailability?.[code]?.[0] : undefined;
  if (first?.fareStatus) return first.fareStatus;
  if (train?.fareStatus) return train.fareStatus;
  if (fareToNumber(first?.fare || train?.fare) > 0) return "CACHE_ONLY";
  return inferLookupStatus(first?.updatedTime || train?.fare);
}

export function readableRailStatus(value: unknown) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/booking\/cancellation not allowed for given pair of stations/i.test(text)) return "Not bookable for station pair";
  if (/not available for booking for this date/i.test(text)) return "Not bookable on this date";
  if (/not available for booking/i.test(text)) return "Not bookable";
  if (/not requested|check availability/i.test(text)) return "Tap to check seats";
  if (/rate.?limit|too many requests|429|delayed this exact request/i.test(text)) return "Check seats";
  if (/failed to fetch|fetch failed|live fetch failed|check seats on irctc|provider request failed|invalid availability format|provider did not return|provider returned no quota|request failed|availability unavailable/i.test(text)) return "Check seats";
  if (/class .*does not exist|class .*not.*returned|coach .*not.*available/i.test(text)) return "Class not available";
  if (/checking/i.test(text)) return "Tap to check seats";
  return text;
}

export function providerUnavailableCopy(reason: unknown, classCode: string) {
  const text = String(reason || "").trim();
  if (/booking\/cancellation not allowed for given pair of stations/i.test(text)) {
    return "Not bookable for station pair";
  }
  if (/not available for booking for this date/i.test(text)) {
    return "Not bookable on this date";
  }
  if (/not available for booking/i.test(text)) {
    return "Not bookable";
  }
  if (/rate.?limit|too many requests|429|delayed this exact request/i.test(text)) return `Check seats ${classCode}`;
  if (/not requested|check availability/i.test(text)) return `Tap to check seats ${classCode}`;
  if (/failed to fetch|fetch failed|live fetch failed|provider request failed|invalid availability format|provider did not return|provider returned no quota|request failed|availability unavailable|quota unavailable|not returned/i.test(text)) {
    return `Check seats ${classCode}`;
  }
  if (text && !/live data unavailable/i.test(text)) return text;
  return `Check seats ${classCode}`;
}

export function providerDelayCopy(classCode: string) {
  return `Check seats ${classCode}`;
}

export function isProviderDelay(value: unknown) {
  return /rate limited|rate.?limit|too many requests|429|delayed this exact request|quota exceeded|usage limit exceeded|billing cycle/i.test(String(value || ""));
}

export function providerIssueCopy(value: unknown, classCode: string) {
  if (isProviderDelay(value)) return providerDelayCopy(classCode);
  return providerUnavailableCopy(value, classCode);
}

export function isUnavailableRailStatus(value: unknown) {
  const status = readableRailStatus(value).toUpperCase();
  return !status || /UNAVAILABLE|NOT RETURNED|NOT AVAILABLE|NOT BOOKABLE|CLASS NOT AVAILABLE|PROVIDER UNAVAILABLE|LIVE DATA UNAVAILABLE|TAP CLASS TO FETCH|CHECK AVAILABILITY|CHECK FARE|CHECK SEATS|TAP TO CHECK SEATS|RATE LIMITED/.test(status);
}

export function ticketDecision(value: unknown) {
  const status = readableRailStatus(value).toUpperCase();
  if (/CHECK AVAILABILITY|TAP CLASS TO FETCH/.test(status)) {
    return { label: "Check live availability", tone: "bg-cyan-100 text-cyan-800 dark:bg-cyan-300/12 dark:text-cyan-100" };
  }
  if (/RATE LIMITED|TOO MANY REQUESTS|429/.test(status)) {
    return { label: "Live check queued", tone: "bg-amber-100 text-amber-800 dark:bg-amber-300/12 dark:text-amber-100" };
  }
  if (/UNAVAILABLE|NOT RUNNING|NOT BOOKABLE/.test(status)) {
    return { label: "Provider did not return availability", tone: "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200" };
  }
  if (/REGRET/.test(status)) {
    return { label: "Provider returned REGRET", tone: "bg-rose-100 text-rose-800 dark:bg-rose-300/12 dark:text-rose-100" };
  }
  if (/\bAVAILABLE\b|\bAVL\b|CNF|CONFIRM/.test(status)) {
    return { label: "Provider returned availability", tone: "bg-emerald-100 text-emerald-800 dark:bg-emerald-300/12 dark:text-emerald-100" };
  }
  if (/RAC/.test(status)) {
    return { label: "RAC, not fully confirmed", tone: "bg-amber-100 text-amber-800 dark:bg-amber-300/12 dark:text-amber-100" };
  }
  if (/WL|WAIT|UNAVAILABLE/.test(status)) {
    return { label: "Not confirmed yet", tone: "bg-rose-100 text-rose-800 dark:bg-rose-300/12 dark:text-rose-100" };
  }
  return { label: "Provider did not return availability", tone: "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200" };
}

export function availabilityTone(value: unknown) {
  const status = readableRailStatus(value).toUpperCase();
  if (/\bAVAILABLE\b|\bAVL\b|CNF|CONFIRM/.test(status)) {
    return "border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-300/25 dark:bg-emerald-300/12 dark:text-emerald-100";
  }
  if (/RAC/.test(status)) {
    return "border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-300/25 dark:bg-amber-300/12 dark:text-amber-100";
  }
  if (/WL|WAIT|REGRET|UNAVAILABLE|NOT RUNNING|NOT BOOKABLE/.test(status)) {
    return "border-rose-300 bg-rose-100 text-rose-800 dark:border-rose-300/25 dark:bg-rose-300/12 dark:text-rose-100";
  }
  return "border-slate-200 bg-slate-100 text-slate-700 dark:border-white/10 dark:bg-white/10 dark:text-slate-200";
}

export function availabilityCardTone(value: unknown) {
  const status = readableRailStatus(value).toUpperCase();
  if (/\bAVAILABLE\b|\bAVL\b|CNF|CONFIRM/.test(status)) {
    return "border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-300/30 dark:bg-emerald-300/14 dark:text-emerald-50";
  }
  if (/RAC/.test(status)) {
    return "border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-300/30 dark:bg-amber-300/14 dark:text-amber-50";
  }
  if (/WL|WAIT|REGRET|UNAVAILABLE|NOT RUNNING|NOT BOOKABLE/.test(status)) {
    return "border-rose-300 bg-rose-100 text-rose-900 dark:border-rose-300/30 dark:bg-rose-300/14 dark:text-rose-50";
  }
  return "border-slate-200 bg-white text-slate-800 dark:border-white/10 dark:bg-white/6 dark:text-slate-100";
}

export function fareTone(value: unknown) {
  const text = String(value || "").toLowerCase();
  if (!text || /unavailable|not return|provider did not|suspect|rate limited|not requested|request failed/.test(text)) {
    return "border-slate-200 bg-slate-100 text-slate-700 dark:border-white/10 dark:bg-white/10 dark:text-slate-200";
  }
  if (/est\.|estimate/.test(text)) {
    return "border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-300/25 dark:bg-amber-300/12 dark:text-amber-100";
  }
  return "border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-300/25 dark:bg-emerald-300/12 dark:text-emerald-100";
}

export function journeyAccentTone(value: unknown) {
  const status = readableRailStatus(value).toUpperCase();
  if (/\bAVAILABLE\b|\bAVL\b|CNF|CONFIRM/.test(status)) {
    return { text: "text-emerald-600 dark:text-emerald-200", line: "bg-emerald-300 dark:bg-emerald-300/60", dot: "bg-emerald-400" };
  }
  if (/RAC/.test(status)) {
    return { text: "text-amber-600 dark:text-amber-200", line: "bg-amber-300 dark:bg-amber-300/60", dot: "bg-amber-400" };
  }
  if (/WL|WAIT|REGRET|UNAVAILABLE|NOT RUNNING|NOT BOOKABLE/.test(status)) {
    return { text: "text-rose-600 dark:text-rose-200", line: "bg-rose-300 dark:bg-rose-300/60", dot: "bg-rose-400" };
  }
  return { text: "text-slate-400", line: "bg-slate-300 dark:bg-white/20", dot: "bg-slate-300" };
}

export function formatFare(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return `₹${value.toLocaleString("en-IN")}`;
  }
  const text = String(value || "").trim();
  if (/^~?₹[\d,]+\s*est\./i.test(text)) return text;
  if (!text || text === "₹--" || text === "0") return "Provider did not return fare";
  if (/unavailable|check live|not return|provider did not|quota|rate limited|not requested|request failed|tap to retry/i.test(text)) return text;
  const amount = Number(text.replace(/[₹,\s]/g, ""));
  if (Number.isFinite(amount) && amount > 0) return `₹${amount.toLocaleString("en-IN")}`;
  return text.startsWith("₹") ? text : `₹${text}`;
}

export const estimatedFareRules: Record<string, { perKm: number; reservation: number }> = {
  SL: { perKm: 0.37, reservation: 20 },
  "3A": { perKm: 1.0, reservation: 40 },
  "2A": { perKm: 1.55, reservation: 50 },
  "1A": { perKm: 3.1, reservation: 60 },
  "3E": { perKm: 0.9, reservation: 40 },
  "2S": { perKm: 0.25, reservation: 15 },
  CC: { perKm: 0.75, reservation: 40 },
  EC: { perKm: 1.5, reservation: 60 },
  FC: { perKm: 0.85, reservation: 40 },
};

export function haversineKm(from: { lat: number; lng: number }, to: { lat: number; lng: number }) {
  const earthKm = 6371;
  const dLat = ((to.lat - from.lat) * Math.PI) / 180;
  const dLng = ((to.lng - from.lng) * Math.PI) / 180;
  const lat1 = (from.lat * Math.PI) / 180;
  const lat2 = (to.lat * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return earthKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function estimatedStationPairDistanceKm(sourceCode: string, destinationCode: string) {
  const sourceCoord = STATION_COORDS[String(sourceCode || "").toUpperCase()];
  const destinationCoord = STATION_COORDS[String(destinationCode || "").toUpperCase()];
  if (!sourceCoord || !destinationCoord) return 0;
  return Math.round(haversineKm(sourceCoord, destinationCoord) * 1.25);
}

export function stationDistanceKm(fromCode: string, toCode: string) {
  const from = STATION_COORDS[String(fromCode || "").toUpperCase()];
  const to = STATION_COORDS[String(toCode || "").toUpperCase()];
  if (!from || !to) return 0;
  return Math.max(1, Math.round(haversineKm(from, to)));
}

export function nearbyTerminalDistanceCopy(actualCode: string, requestedCode: string) {
  const actual = String(actualCode || "").toUpperCase();
  const requested = String(requestedCode || "").toUpperCase();
  if (!actual || !requested || actual === requested) return "";
  const distance = stationDistanceKm(actual, requested);
  if (!distance) return "";
  return `${stationCompactLabel(actual)} is about ${distance} km from ${stationCompactLabel(requested)}.`;
}

export function nearbyTerminalDistanceSummary(actualSource: string, requestedSource: string, actualDestination: string, requestedDestination: string) {
  return [
    nearbyTerminalDistanceCopy(actualSource, requestedSource),
    nearbyTerminalDistanceCopy(actualDestination, requestedDestination),
  ].filter(Boolean).join(" ");
}

export function isLongJourneyStationPair(sourceCode: string, destinationCode: string) {
  const distance = estimatedStationPairDistanceKm(sourceCode, destinationCode);
  return distance === 0 || distance >= LONG_JOURNEY_DISTANCE_KM;
}

export function splitAutoLiveRouteCountForJourney(sourceCode: string, destinationCode: string) {
  return isLongJourneyStationPair(sourceCode, destinationCode)
    ? LONG_JOURNEY_SPLIT_AUTO_LIVE_ROUTE_COUNT
    : SPLIT_AUTO_LIVE_ROUTE_COUNT;
}

export function estimatedDistanceKm(train: any) {
  const directDistance = Number(String(train?.distance ?? train?.distanceKm ?? train?.Distance ?? "").replace(/[^\d.]/g, ""));
  if (Number.isFinite(directDistance) && directDistance > 0) return directDistance;
  const sourceCode = String(train?.source || train?.requestedSource || "").toUpperCase();
  const destinationCode = String(train?.destination || train?.requestedDestination || "").toUpperCase();
  return estimatedStationPairDistanceKm(sourceCode, destinationCode);
}

export function estimatedFareAmount(train: any, classCode: string) {
  const code = String(classCode || train?.classType || "").toUpperCase();
  const rule = estimatedFareRules[code];
  const distance = estimatedDistanceKm(train);
  if (!rule || !distance) return 0;
  return Math.max(10, Math.round((distance * rule.perKm + rule.reservation) / 5) * 5);
}

export function estimatedFareText(train: any, classCode: string) {
  return "Fare unavailable";
}

export function liveSeatText(train: any) {
  const status = trainAvailabilityStatus(train);
  if (status !== "VERIFIED") return lookupStatusLabel(status, "availability", train?.classType, train?.lookupReason || train?.availability);
  return readableRailStatus(train?.availability) || lookupStatusLabel(status, "availability", train?.classType);
}

export function liveFareText(train: any) {
  const fare = fareToNumber(train?.fare);
  const status = trainFareStatus(train);
  if (fare > 0 && status === "VERIFIED") return formatFare(fare);
  return "Fare unavailable";
}

export function providerBookingBlockedText(value: unknown) {
  return /not available for booking|not bookable|train not on scheduled date|not scheduled|not running|class does not exist|class not available|class not returned|does not exist in this train/i.test(String(value || ""));
}


export function classFareAmount(train: any, classCode: string) {
  const code = String(classCode || "").toUpperCase();
  const row = code ? train?.classAvailability?.[code]?.[0] : undefined;
  const rowFare = fareToNumber(row?.fare);
  if (rowFare > 0) return rowFare;
  if (String(train?.classType || "").toUpperCase() === code) return trainFareAmount(train);
  return 0;
}

export function classFareBreakdown(train: any, classCode: string) {
  const code = String(classCode || "").toUpperCase();
  const row = code ? train?.classAvailability?.[code]?.[0] : undefined;
  if (row?.fareBreakdown && typeof row.fareBreakdown === "object") return row.fareBreakdown;
  if (String(train?.classType || "").toUpperCase() === code && train?.fareBreakdown && typeof train.fareBreakdown === "object") return train.fareBreakdown;
  return null;
}

export function fareBreakdownValue(breakdown: any, keys: string[]) {
  for (const key of keys) {
    const value = Number(String(breakdown?.[key] ?? "").replace(/[^\d.]/g, ""));
    if (Number.isFinite(value) && value > 0) return Math.round(value);
  }
  return 0;
}

export function fareBreakdownRows(breakdown: any, fallbackTotal: number) {
  if (!breakdown || typeof breakdown !== "object") return [];
  const rows = [
    ["Base fare", fareBreakdownValue(breakdown, ["baseFare", "base", "basicFare"])],
    ["Reservation", fareBreakdownValue(breakdown, ["reservationCharge", "reservation"])],
    ["Superfast charge", fareBreakdownValue(breakdown, ["superfastCharge", "superFastCharge", "sfCharge"])],
    ["Tatkal charge", fareBreakdownValue(breakdown, ["tatkalCharge", "premiumTatkalCharge"])],
    ["Dynamic charge", fareBreakdownValue(breakdown, ["dynamicFare", "dynamicCharge"])],
    ["GST / service tax", fareBreakdownValue(breakdown, ["gst", "serviceTax", "serviceCharge"])],
    ["Catering", fareBreakdownValue(breakdown, ["cateringCharge", "catering"])],
    ["IRCTC convenience", fareBreakdownValue(breakdown, ["irctcConvenienceFee", "convenienceFee", "convenienceCharge"])],
    ["Other charges", fareBreakdownValue(breakdown, ["otherCharges", "miscCharge", "insuranceCharge"])],
  ].filter(([, amount]) => Number(amount) > 0) as Array<[string, number]>;
  const total = fareBreakdownValue(breakdown, ["total", "totalFare", "finalFare"]) || fallbackTotal;
  return total > 0 ? [...rows, ["Total", total] as [string, number]] : rows;
}

export function FareBreakdownPanel({ train, classCode, fare }: { train: any; classCode: string; fare: string }) {
  const total = fareToNumber(fare) || classFareAmount(train, classCode);
  const breakdown = classFareBreakdown(train, classCode);
  const rows = fareBreakdownRows(breakdown, total);
  const hasItemizedRows = rows.length > 1;
  const estimated = /est\.|estimated|provider did not return fare|fare unavailable/i.test(String(fare || ""));
  return (
    <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[11px] font-black uppercase text-slate-400">Fare breakdown</div>
          <div className="mt-1 text-sm font-bold text-slate-500 dark:text-slate-400">
            {estimated ? "Estimated fare only; live itemized fare was not returned." : hasItemizedRows ? "Provider itemized this fare." : "Provider returned the total fare only."}
          </div>
        </div>
        {total > 0 && <span className="rounded-md border border-emerald-300/40 bg-emerald-50 px-3 py-1.5 text-sm font-black text-emerald-800 dark:bg-emerald-300/10 dark:text-emerald-100">{estimated ? fare : formatFare(total)}</span>}
      </div>
      {rows.length > 0 ? (
        <div className="mt-3 divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:divide-white/10 dark:border-white/10 dark:bg-black/20">
          {rows.map(([label, amount], index) => (
            <div key={label} className={`flex items-center justify-between gap-3 px-3 py-2 text-sm ${index === rows.length - 1 ? "font-black" : "font-bold"}`}>
              <span className="text-slate-500 dark:text-slate-300">{label}</span>
              <span>{formatFare(amount)}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-3 rounded-2xl border border-amber-300/35 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-900 dark:bg-amber-300/10 dark:text-amber-100">
          Fare is visible, but the provider did not return itemized charges for this train/class/quota.
        </div>
      )}
      {total > 0 && !estimated && (
        <div className="mt-3 grid gap-2 text-xs font-bold text-slate-500 dark:text-slate-400 sm:grid-cols-3">
          <span>Child fare guide: ~{formatFare(Math.round(total * 0.5))}</span>
          <span>Senior concessions apply only if IRCTC accepts eligibility.</span>
          <span>Final booking charges can change at IRCTC payment.</span>
        </div>
      )}
    </div>
  );
}

export function classAvailabilityText(train: any, classCode: string) {
  const code = String(classCode || "").toUpperCase();
  return code ? classAvailabilityStatus(train, code) : liveSeatText(train);
}

export function liveDataUnavailableWarning(train: any, classCode?: string) {
  const availabilityStatus = trainAvailabilityStatus(train, classCode);
  const fareStatus = trainFareStatus(train, classCode);
  const reason = String(train?.lookupReason || train?.availability || train?.fare || "").toLowerCase();
  const fallbackStatus = [availabilityStatus, fareStatus].some((status) => ["PROVIDER_UNAVAILABLE", "RATE_LIMITED", "CACHE_ONLY"].includes(String(status)));
  return fallbackStatus || /provider did not return|request failed|unavailable|cached schedule/.test(reason);
}

export function compactFareText(value: unknown) {
  const text = String(value || "").trim();
  // Never show estimated guesses or "Fare unavailable" text in badges
  if (/^~?₹[\d,]+\s*est\./i.test(text)) return "";
  if (/fare unavailable/i.test(text)) return "";
  if (/not requested|check fare|tap class/i.test(text)) return "Check Fare";
  return formatFare(value);
}

export function compactSeatText(train: any) {
  const text = liveSeatText(train);
  if (/not requested|check availability|tap class|tap to check seats/i.test(text)) return "Tap to check seats";
  if (/tap to retry|failed to fetch|fetch failed|provider request failed|request failed|provider did not return|availability unavailable/i.test(text)) return "Check seats";
  return text;
}

export function normalizedClassList(...values: unknown[]) {
  const known = new Set(["1A", "2A", "3A", "3E", "SL", "2S", "CC", "EC", "FC"]);
  return Array.from(new Set(values.flatMap((value) => {
    if (Array.isArray(value)) return value;
    return String(value || "").split(/[,/| ]+/);
  }).map((item) => String(item).toUpperCase().trim()).filter((item) => known.has(item))));
}

export function returnedClassesForTrain(train: any) {
  const verifiedMatrixClasses = Object.entries(train?.classAvailability || {})
    .filter(([, rows]) => {
      const first = Array.isArray(rows) ? rows[0] : null;
      return first && !isUnavailableRailStatus(first.availabilityText || first.text || first.status);
    })
    .map(([classCode]) => classCode);
  return normalizedClassList(train?.providerReturnedClass, train?.classes, verifiedMatrixClasses);
}

export function providerRejectedClass(train: any, requestedClass: string) {
  const classCode = String(requestedClass || "").toUpperCase().trim();
  if (!classCode || classCode === "ANY") return false;
  const first = train?.classAvailability?.[classCode]?.[0];
  const text = `${first?.availabilityText || ""} ${first?.text || ""} ${first?.status || ""} ${first?.updatedTime || ""} ${first?.lookupReason || ""}`.toLowerCase();
  return /class does not exist|class not available|class not returned|not available in this train|does not exist in this train/.test(text);
}

export function providerMarkedSelectedClassUnavailable(train: any, requestedClass: string) {
  const classCode = String(requestedClass || "").toUpperCase().trim();
  if (!classCode || classCode === "ANY") return false;
  const first = train?.classAvailability?.[classCode]?.[0];
  if (!first) return false;
  const text = `${first.availabilityText || ""} ${first.text || ""} ${first.status || ""} ${first.updatedTime || ""} ${first.lookupReason || ""}`.toLowerCase();
  const status = String(first.availabilityStatus || "").toUpperCase();
  return status === "PROVIDER_UNAVAILABLE" && /not available for booking|train not on scheduled date|not scheduled|not bookable|class does not exist|class not available|class not returned/.test(text);
}

export function selectedClassCanBeChecked(train: any, requestedClass: string) {
  const classCode = String(requestedClass || "").toUpperCase().trim();
  if (!classCode || classCode === "ANY") return true;
  if (providerRejectedClass(train, classCode)) return false;
  const classes = returnedClassesForTrain(train);
  return !classes.length || classes.includes(classCode);
}

export function primaryClassCode(train: any, fallback = "") {
  const classes = returnedClassesForTrain(train);
  const activeClass = String(train?.classType || "").toUpperCase().trim();
  const selectedClass = String(train?.selectedClass || "").toUpperCase().trim();
  if (activeClass && (!classes.length || classes.includes(activeClass))) return activeClass;
  if (selectedClass && classes.includes(selectedClass)) return selectedClass;
  return String(classes[0] || activeClass || selectedClass || fallback).toUpperCase();
}

export function classAvailabilityStatus(train: any, classCode: string) {
  const first = train?.classAvailability?.[classCode]?.[0];
  const status = first?.availabilityText || first?.text || first?.status || "";
  const readable = readableRailStatus(status);
  if (readable && /not bookable|not running|class not available/i.test(readable)) return readable;
  if (first?.availabilityStatus && first.availabilityStatus !== "VERIFIED") {
    return lookupStatusLabel(first.availabilityStatus, "availability", classCode, first.lookupReason || status);
  }
  if (readable && !/tap for quota|quota unavailable|check seats/i.test(readable)) return readable;
  return lookupStatusLabel(first?.availabilityStatus || "PROVIDER_UNAVAILABLE", "availability", classCode, first?.lookupReason);
}

export function classFareText(train: any, classCode: string) {
  const first = train?.classAvailability?.[classCode]?.[0];
  const fare = fareToNumber(first?.fare);
  const status = first?.fareStatus || "PROVIDER_UNAVAILABLE";
  if (fare > 0 && status === "VERIFIED") return formatFare(fare);
  return "Fare unavailable";
}


export function hasVerifiedFareAndSeat(train: any, requestedClass = "") {
  const requested = String(requestedClass || "").toUpperCase().trim();
  const classCode = requested && requested !== "ANY" ? requested : primaryClassCode(train);
  const first = classCode ? train?.classAvailability?.[classCode]?.[0] : undefined;
  const availabilityStatus = first?.availabilityStatus || train?.availabilityStatus;
  const fareStatus = first?.fareStatus || train?.fareStatus;
  const fare = fareToNumber(first?.fare ?? train?.fare);
  const availability = readableRailStatus(first?.availabilityText || first?.text || first?.status || train?.availability);
  const upperAvailability = availability.toUpperCase();
  const visibleSeatStatus = /\bAVAILABLE\b|\bAVL\b|RAC|WL|WAIT|REGRET|CNF|CONFIRM/.test(upperAvailability) &&
    !/NOT AVAILABLE|TRAIN NOT ON SCHEDULED DATE|NOT RUNNING|CLASS NOT AVAILABLE|CHECK SEATS|TAP TO CHECK|UNAVAILABLE/.test(upperAvailability);
  return availabilityStatus === "VERIFIED" && fareStatus === "VERIFIED" && fare > 0 && visibleSeatStatus;
}

export function splitHasVerifiedFareAndSeats(split: any, requestedClass = "") {
  return hasVerifiedFareAndSeat(split?.leg1, requestedClass) && hasVerifiedFareAndSeat(split?.leg2, requestedClass);
}

export function multiSplitHasVerifiedFareAndSeats(split: any, requestedClass = "") {
  const legs = split?.legs || [];
  return legs.length > 0 && legs.every((leg: any) => hasVerifiedFareAndSeat(leg, requestedClass));
}

export function classDataSourceLabel(train: any, classCode: string) {
  const first = train?.classAvailability?.[classCode]?.[0];
  if (first?.availabilityStatus === "VERIFIED" || first?.fareStatus === "VERIFIED") return "Provider-backed";
  if (first?.availabilityStatus === "NOT_CHECKED" || first?.fareStatus === "NOT_CHECKED") return "Not checked yet";
  if (first?.availabilityStatus === "RATE_LIMITED" || first?.fareStatus === "RATE_LIMITED") return "Live check queued";
  if (first?.availabilityStatus === "CACHE_ONLY" || first?.fareStatus === "CACHE_ONLY") return "Cached schedule";
  const updated = String(first?.updatedTime || "").toLowerCase();
  const displayStatus = `${first?.availabilityText || ""} ${first?.text || ""} ${first?.status || ""} ${updated}`;
  if (/availability unavailable|live data unavailable|provider did not return|not returned|request failed|class not available|not available for this train|not bookable/i.test(displayStatus)) {
    return fareToNumber(first?.fare) > 0 ? "Provider fare only" : "Not returned";
  }
  if (updated.includes("reference")) return "Reference";
  if (updated.includes("cached")) return "Recently cached";
  if (updated.includes("generic")) return "Not returned";
  if (updated.includes("provider-backed") || updated.includes("live")) return "Provider-backed";
  if (updated.includes("schedule-only")) return "Schedule check";
  if (updated.includes("estimate")) return "Not returned";
  if (first && !isUnavailableRailStatus(first.availabilityText || first.text || first.status)) return "Provider-backed";
  return "Not returned";
}

export function displayClassesForTrain(train: any) {
  const selectedClass = String(train?.selectedClass || "").toUpperCase().trim();
  const providerClasses = returnedClassesForTrain(train);
  const matrixClasses = Object.keys(train?.classAvailability || {});
  const classes = normalizedClassList(providerClasses, matrixClasses);
  if (selectedClass && selectedClass !== "ANY" && !classes.length) return [selectedClass];
  if (classes.length) return classes;
  return selectedClass ? [selectedClass] : [];
}

export type LiveClassQuote = {
  availability: string;
  fare: number;
  source: string;
  updatedTime: string;
  availabilityStatus?: LookupTrustStatus;
  fareStatus?: LookupTrustStatus;
  lookupReason?: string;
  proof?: any;
  warning?: string;
  error?: string;
  providerTrace?: any;
};

export function isClassNotReturnedQuote(classCode: string, quote?: LiveClassQuote) {
  const text = `${quote?.availability || ""} ${quote?.source || ""} ${quote?.warning || ""} ${quote?.error || ""}`.toLowerCase();
  const code = String(classCode || "").toLowerCase();
  return Boolean(code && (
    text.includes(`${code} not returned for this train`) ||
    /class does not exist|class not available|class not returned|not available in this train|does not exist in this train/.test(text)
  ));
}

export function isProviderConfirmedQuote(quote?: LiveClassQuote) {
  if (!quote) return false;
  if (quote.availabilityStatus === "VERIFIED" || quote.fareStatus === "VERIFIED") return true;
  if (quote.fare > 0) return true;
  return !isUnavailableRailStatus(quote.availability) && !/provider unavailable|not returned|temporarily unavailable/i.test(quote.source || "");
}

export function quoteStatusCode(text: string): "AVAILABLE" | "WL" | "RAC" | "REGRET" {
  const status = text.toUpperCase();
  if (/\bAVAILABLE\b|\bAVL\b|CNF|CONFIRM|CURR_AV/.test(status)) return "AVAILABLE";
  if (/RAC/.test(status)) return "RAC";
  if (/WL|WAIT/.test(status)) return "WL";
  return "REGRET";
}

export function availabilityDateMatches(itemDate: unknown, journeyDate: string) {
  const raw = String(itemDate || "").trim();
  if (!raw || !journeyDate) return false;
  const [year, month, day] = journeyDate.split("-");
  const variants = new Set([
    journeyDate,
    `${day}-${month}-${year}`,
    `${Number(day)}-${Number(month)}-${year}`,
    `${day}/${month}/${year}`,
  ]);
  return variants.has(raw.replace(/\s+/g, ""));
}

export function liveQuoteFromResponse(response: any, classCode: string, journeyDate: string): LiveClassQuote {
  const providerFare = response?.data?.fare ?? response?.fare;
  const providerFareIsExact = response?.data?.fareStatus === "VERIFIED" &&
    (response?.data?.fareSource === "date-specific-provider" || response?.data?.fareExactRequest === true);
  const fare = providerFare && providerFareIsExact
    ? fareToNumber(providerFare.totalFare ?? providerFare.Fare ?? providerFare.Amount ?? providerFare)
    : 0;
  const providerWarning = response?.warning || response?.extra?.warning || response?.meta?.warning || "";
  const responseAvailabilityStatus = response?.data?.availabilityStatus as LookupTrustStatus | undefined;
  const responseFareStatus = response?.data?.fareStatus as LookupTrustStatus | undefined;
  const responseLookupReason = response?.data?.lookupReason || response?.data?.reason || providerWarning;
  const responseProof = response?.data?.proof;
  if (!response || response.success === false) {
    const message = response?.error || providerWarning || `Provider did not return availability for ${classCode} on the selected train/date/quota`;
    const rateLimited = isProviderDelay(message);
    const availability = providerIssueCopy(message, classCode);
    return {
      availability,
      fare,
      source: rateLimited ? "Live check queued" : fare > 0 ? "Provider fare; availability unavailable" : "Provider unavailable",
      updatedTime: availability,
      availabilityStatus: rateLimited ? "RATE_LIMITED" : "PROVIDER_UNAVAILABLE",
      fareStatus: fare > 0 ? "VERIFIED" : rateLimited ? "RATE_LIMITED" : "PROVIDER_UNAVAILABLE",
      lookupReason: availability,
      proof: responseProof,
      error: availability || "Provider did not return quota.",
      providerTrace: response?.debugTrace || response?.extra?.debugTrace,
    };
  }

  const availabilityRows = Array.isArray(response?.data?.availability) ? response.data.availability : [];
  const row = availabilityRows.find((item: any) => availabilityDateMatches(item.date || item.JourneyDate, journeyDate));
  if (!row) {
    const rateLimited = isProviderDelay(providerWarning);
    const availability = providerIssueCopy(providerWarning, classCode);
    return {
      availability,
      fare,
      source: rateLimited ? "Live check queued" : fare > 0 ? "Provider fare; availability not returned" : "Provider did not return this date",
      updatedTime: availability || "Provider did not return this date",
      availabilityStatus: responseAvailabilityStatus || (rateLimited ? "RATE_LIMITED" : "PROVIDER_UNAVAILABLE"),
      fareStatus: responseFareStatus || (fare > 0 ? "VERIFIED" : rateLimited ? "RATE_LIMITED" : "PROVIDER_UNAVAILABLE"),
      lookupReason: providerIssueCopy(responseLookupReason || providerWarning || "Provider did not return availability for the selected journey date.", classCode),
      proof: responseProof,
      warning: availability,
      error: availability || "Provider did not return availability for the selected journey date.",
      providerTrace: response?.debugTrace || response?.extra?.debugTrace,
    };
  }
  const availability = readableRailStatus(row.availabilityText ?? row.status ?? row.text ?? row.Availability ?? row.availability ?? "Quota unavailable");
  const rowReason = row.reason || providerWarning;
  const rateLimited = isProviderDelay(rowReason);
  const providerUnavailable = providerIssueCopy(rowReason, classCode);
  const provider = String(response.provider || "").toLowerCase();
  const rowSource = String(row.source || "").toLowerCase();
  const unavailable = rowSource === "unavailable" || isUnavailableRailStatus(availability);
  const source = rateLimited
    ? "Live check queued"
    : unavailable
    ? (fare > 0 ? "Provider fare only" : "Not returned")
    : provider.includes("reference")
      ? "Reference"
      : provider.includes("cached")
        ? "Recently cached"
        : provider
          ? "Provider-backed"
          : "Railway availability";

  return {
    availability: rateLimited ? `Check seats ${classCode}` : unavailable ? providerUnavailable : availability,
    fare,
    source,
    updatedTime: source,
    availabilityStatus: row.availabilityStatus || responseAvailabilityStatus || (rateLimited ? "RATE_LIMITED" : unavailable ? "PROVIDER_UNAVAILABLE" : "VERIFIED"),
    fareStatus: row.fareStatus || responseFareStatus || (fare > 0 ? "VERIFIED" : rateLimited ? "RATE_LIMITED" : "PROVIDER_UNAVAILABLE"),
    lookupReason: providerIssueCopy(row.lookupReason || responseLookupReason || rowReason, classCode),
    proof: row.proof || responseProof,
    warning: rateLimited || unavailable ? providerUnavailable : providerWarning,
    error: rateLimited || unavailable ? providerUnavailable || "Provider did not return availability for this class/date." : undefined,
    providerTrace: response?.debugTrace || response?.extra?.debugTrace,
  };
}

export function applyLiveQuoteToTrain(train: any, classCode: string, quote?: LiveClassQuote) {
  if (!quote) return train;
  const code = String(classCode).toUpperCase();
  const classRejected = isClassNotReturnedQuote(code, quote);
  const existingRows = train?.classAvailability?.[code] || [];
  const existingFirst = existingRows[0] || {};
  const quoteFare = quote.fare ?? 0;
  const existingFare = fareToNumber(existingFirst.fare);
  const fare = quoteFare > 0 ? quoteFare : existingFare;
  const fareStatus = quoteFare > 0 ? quote.fareStatus : (existingFirst.fareStatus || quote.fareStatus);
  const nextRows = [
    {
      ...existingFirst,
      availabilityText: quote.availability,
      text: quote.availability,
      status: quoteStatusCode(quote.availability),
      fare,
      updatedTime: quote.updatedTime,
      providerTrace: quote.providerTrace,
      availabilityStatus: quote.availabilityStatus,
      fareStatus,
      lookupReason: quote.lookupReason,
      proof: quote.proof,
    },
    ...existingRows.slice(1),
  ];
  const existingClasses = normalizedClassList(train.classes);
  const nextClasses = classRejected
    ? existingClasses.filter((item) => item !== code)
    : Array.from(new Set([...existingClasses, code]));
  const currentPrimary = primaryClassCode(train);
  const currentPrimaryInvalid = Boolean(currentPrimary && nextClasses.length && !nextClasses.includes(currentPrimary));
  const isPrimary = !classRejected && (currentPrimary === code || currentPrimaryInvalid || !currentPrimary);
  const nextClassType = classRejected && String(train.classType || "").toUpperCase() === code
    ? undefined
    : isPrimary
      ? code
      : currentPrimaryInvalid
        ? nextClasses[0]
        : train.classType;
  return {
    ...train,
    availability: isPrimary ? quote.availability : train.availability,
    fare: isPrimary ? (fare && fareStatus === "VERIFIED" ? `₹${fare}` : lookupStatusLabel(quote.fareStatus || "PROVIDER_UNAVAILABLE", "fare", code, quote.lookupReason || quote.error)) : train.fare,
    classType: nextClassType,
    classes: nextClasses,
    availabilityStatus: isPrimary ? quote.availabilityStatus : train.availabilityStatus,
    fareStatus: isPrimary ? fareStatus : train.fareStatus,
    lookupReason: isPrimary ? quote.lookupReason || quote.error : train.lookupReason,
    requestProof: isPrimary ? quote.proof : train.requestProof,
    classAvailability: {
      ...(train.classAvailability || {}),
      [code]: nextRows,
    },
  };
}

export function needsLiveQuotaRefresh(train: any, classCode: string) {
  const code = String(classCode || "").toUpperCase();
  const first = train?.classAvailability?.[code]?.[0];
  if (first?.availabilityStatus === "NOT_CHECKED" || first?.fareStatus === "NOT_CHECKED") return true;
  if (first?.availabilityStatus === "RATE_LIMITED" || first?.fareStatus === "RATE_LIMITED") return true;
  const status = classAvailabilityStatus(train, classCode);
  const source = classDataSourceLabel(train, classCode);
  return /availability unavailable|provider did not return|fare unavailable|live fare unavailable|quota unavailable|not returned|not requested|rate limited/i.test(`${status} ${source}`);
}

export function fareToNumber(value: unknown) {
  const amount = Number(String(value || "").replace(/[^\d.]/g, ""));
  return Number.isFinite(amount) ? amount : 0;
}

export function trainFareAmount(train: any) {
  const exact = fareToNumber(train?.fare ?? train?.totalFare);
  if (exact > 0) return exact;
  return 0;
}

export function hasProviderLegData(leg: any) {
  const availability = readableRailStatus(leg?.availability);
  return trainFareAmount(leg) > 0 || (!!availability && !isUnavailableRailStatus(availability));
}

export function legDataTrustCopy(legs: any[], meta: TrustMeta) {
  const hasProviderData = legs.some(hasProviderLegData);
  return {
    badgeType: hasProviderData ? "LIVE" as const : badgeTypeFromSource(meta.source),
    badgeLabel: hasProviderData ? "Provider leg checks" : undefined,
    text: hasProviderData
      ? "Only legs with provider-backed fare and visible seat status are shown for the selected class/date/quota."
      : formatTrustUpdated(meta),
  };
}

export function debugModeEnabled() {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("debug") === "true";
}

export function compactDebugJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function isSeatAvailable(value: unknown) {
  const status = readableRailStatus(value).toUpperCase();
  return /\bAVAILABLE\b|\bAVL\b|CNF|CONFIRM/.test(status) && !/WL|WAIT|REGRET|UNAVAILABLE|NOT RUNNING/.test(status);
}

export function availabilityNumber(value: unknown) {
  const status = readableRailStatus(value).toUpperCase();
  if (/WL|WAIT/.test(status)) {
    const numbers = [...status.matchAll(/\d+/g)].map((match) => Number(match[0])).filter((item) => Number.isFinite(item));
    return numbers.length ? numbers[numbers.length - 1] : 0;
  }
  const match = status.match(/\d+/);
  return match ? Number(match[0]) : 0;
}

export function blendProviderPrediction(baseChance: number, explicitChance: number) {
  if (!Number.isFinite(explicitChance) || explicitChance <= 0) return baseChance;
  const boundedExplicit = Math.max(0, Math.min(100, Math.round(explicitChance)));
  return Math.max(0, Math.min(100, Math.round(baseChance * 0.85 + boundedExplicit * 0.15)));
}

export function waitlistConfirmationChance(waitlistNumber: number, explicitChance: number) {
  if (!waitlistNumber || waitlistNumber < 1) return blendProviderPrediction(55, explicitChance);
  if (waitlistNumber <= 10) return blendProviderPrediction(Math.max(90, 99 - waitlistNumber), explicitChance);
  if (waitlistNumber <= 25) return blendProviderPrediction(Math.max(60, 80 - Math.round((waitlistNumber - 10) * 1.25)), explicitChance);
  if (waitlistNumber <= 50) return blendProviderPrediction(Math.max(30, 56 - Math.round((waitlistNumber - 25) * 1.05)), explicitChance);
  return blendProviderPrediction(Math.max(5, 24 - Math.floor((waitlistNumber - 51) / 4)), explicitChance);
}

export function racConfirmationChance(racNumber: number, explicitChance: number) {
  if (!racNumber || racNumber < 1) return blendProviderPrediction(88, explicitChance);
  if (racNumber <= 5) return blendProviderPrediction(Math.max(92, 99 - racNumber), explicitChance);
  return blendProviderPrediction(Math.max(58, 88 - Math.round((racNumber - 5) * 2.4)), explicitChance);
}

export function confirmationChanceFromStatus(value: unknown, train?: any) {
  const explicit = Number(train?.confirmationChance);
  const status = readableRailStatus(value).toUpperCase();
  const number = availabilityNumber(status);
  if (/\bAVAILABLE\b|\bAVL\b|CNF|CONFIRM/.test(status) && !/WL|WAIT|REGRET/.test(status)) return 100;
  if (/RAC/.test(status)) return racConfirmationChance(number, explicit);
  if (/WL|WAIT/.test(status)) return waitlistConfirmationChance(number, explicit);
  if (/REGRET|NOT AVAILABLE/.test(status)) return 0;
  if (Number.isFinite(explicit) && explicit > 0) return Math.max(0, Math.min(100, Math.round(explicit)));
  return null;
}

export function confirmationChanceLabel(value: unknown, train?: any) {
  const chance = confirmationChanceFromStatus(value, train);
  if (chance == null) return "";
  if (chance === 100) return "CNF-like";
  if (chance === 0) return "0% confirm";
  return `~${chance}% confirm`;
}

export function confirmationChanceTone(value: unknown, train?: any) {
  const chance = confirmationChanceFromStatus(value, train);
  if (chance == null) return "border-slate-200 bg-slate-50 text-slate-600 dark:border-white/10 dark:bg-white/8 dark:text-slate-300";
  if (chance > 70) return "border-emerald-300/40 bg-emerald-50 text-emerald-800 dark:bg-emerald-300/12 dark:text-emerald-100";
  if (chance >= 40) return "border-amber-300/45 bg-amber-50 text-amber-900 dark:bg-amber-300/10 dark:text-amber-100";
  return "border-rose-300/45 bg-rose-50 text-rose-800 dark:bg-rose-300/12 dark:text-rose-100";
}

export function timeToMinutes(value: unknown) {
  const match = String(value || "").match(/(\d{1,2}):(\d{2})/);
  if (!match) return 24 * 60 + 1;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function durationToMinutes(value: unknown) {
  const text = String(value || "").toLowerCase();
  if (!text || text === "n/a") return 0;
  const colon = text.match(/(\d{1,2}):(\d{2})/);
  if (colon) return Number(colon[1]) * 60 + Number(colon[2]);
  const hour = text.match(/(\d+)\s*h/);
  const minute = text.match(/(\d+)\s*m/);
  return (hour ? Number(hour[1]) * 60 : 0) + (minute ? Number(minute[1]) : 0);
}

export function formatDurationLong(minutes: number) {
  if (!minutes) return "--";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${String(mins).padStart(2, "0")}m`;
}

export function trainJourneyDate(train: any, fallbackDate: string) {
  return String(train?.journeyDate || train?.selectedJourneyDate || train?.date || fallbackDate || "").slice(0, 10);
}

export function liveSourceStation(train: any) {
  return String(train?.availabilitySourceStation || train?.source || "").toUpperCase();
}

export function liveDestinationStation(train: any) {
  return String(train?.availabilityDestinationStation || train?.destination || "").toUpperCase();
}

export function requestedSourceStation(train: any, fallback = "") {
  return String(train?.requestedSource || train?.source || fallback || "").toUpperCase();
}

export function requestedDestinationStation(train: any, fallback = "") {
  return String(train?.requestedDestination || train?.destination || fallback || "").toUpperCase();
}

export function actualLegSourceStation(train: any) {
  return String(train?.availabilitySourceStation || train?.source || train?.trainSource || "").toUpperCase();
}

export function actualLegDestinationStation(train: any) {
  return String(train?.availabilityDestinationStation || train?.destination || train?.trainDestination || "").toUpperCase();
}

export function legUsesAlternateTerminal(train: any, fallbackSource = "", fallbackDestination = "") {
  const requestedSource = requestedSourceStation(train, fallbackSource);
  const requestedDestination = requestedDestinationStation(train, fallbackDestination);
  const actualSource = actualLegSourceStation(train);
  const actualDestination = actualLegDestinationStation(train);
  return Boolean((requestedSource && actualSource && requestedSource !== actualSource) ||
    (requestedDestination && actualDestination && requestedDestination !== actualDestination));
}

export function splitTotalDuration(split: any) {
  const leg1 = durationToMinutes(split.leg1?.duration);
  const leg2 = durationToMinutes(split.leg2?.duration);
  const layover = Math.round(Number(split.layoverHours || 0) * 60) || durationToMinutes(split.layoverDuration);
  return split.totalDuration || formatDurationLong(leg1 + layover + leg2);
}

export function splitLayoverMinutes(split: any) {
  const fromHours = Number(split?.layoverHours);
  if (Number.isFinite(fromHours) && fromHours > 0) return Math.round(fromHours * 60);
  const fromDuration = durationToMinutes(split?.layoverDuration);
  return fromDuration || Infinity;
}

export function multiSplitLayoverMinutes(split: any) {
  if (Array.isArray(split?.layoverHours)) {
    const total = split.layoverHours.reduce((sum: number, hours: unknown) => {
      const value = Number(hours);
      return sum + (Number.isFinite(value) && value > 0 ? Math.round(value * 60) : 0);
    }, 0);
    if (total > 0) return total;
  }
  if (Array.isArray(split?.layovers)) {
    const total = split.layovers.reduce((sum: number, layover: any) => {
      const fromHours = Number(layover?.hours);
      const minutes = Number.isFinite(fromHours) && fromHours > 0
        ? Math.round(fromHours * 60)
        : durationToMinutes(layover?.duration);
      return sum + (minutes || 0);
    }, 0);
    if (total > 0) return total;
  }
  return Infinity;
}

export function splitRouteStableKey(split: any) {
  const leg1 = split.leg1 || {};
  const leg2 = split.leg2 || {};
  return [
    leg1.trainNo,
    leg1.departureDate || leg1.journeyDate,
    leg2.trainNo,
    leg2.departureDate || leg2.journeyDate,
  ].map((value) => String(value || "").toUpperCase()).join("|");
}

export function dedupeSplitRoutes(splits: any[]) {
  const seen = new Set<string>();
  return (splits || []).filter((split) => {
    const key = splitRouteStableKey(split);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function classCalendarFor(train: any, classType = "3A") {
  const activeClass = train?.classAvailability?.[classType] ? classType : train?.classType || "3A";
  const existing = train?.classAvailability?.[activeClass] || [];
  return existing.slice(0, 60);
}

export function fullStationLabelFromCode(code: unknown, withCode = true) {
  const cleanCode = String(code || "").toUpperCase();
  const name = stationNameFromCode(cleanCode);
  if (!name) return cleanCode || "--";
  const state = stationState(cleanCode);
  const label = state === "India" ? name : `${name} (${state})`;
  return withCode ? `${label} — ${cleanCode}` : label;
}



export function platformText(stop: any) {
  const rawPlatform = String(
    stop?.platform ||
      stop?.PlatformNo ||
      stop?.platformNo ||
      stop?.platform_number ||
      stop?.platformNumber ||
      stop?.pf ||
      stop?.PF ||
      "",
  ).trim();
  if (rawPlatform && rawPlatform !== "--" && rawPlatform.toUpperCase() !== "TBA") {
    return { label: "Platform returned by provider", value: rawPlatform };
  }
  return null;
}

export function platformValue(stop: any) {
  return platformText(stop)?.value || "";
}

export function platformDisplay(stop: any) {
  const platform = platformText(stop);
  return platform ? `Platform: ${platform.value}` : "Platform: --";
}

export function routeStopCode(stop: any) {
  return String(stop?.code || stop?.stnCode || stop?.station_code || stop?.stationCode || stop?.StationCode || "").toUpperCase();
}

export function routeStopForStation(route: any[], code: unknown) {
  const cleanCode = String(code || "").toUpperCase();
  if (!cleanCode) return null;
  return (route || []).find((stop) => routeStopCode(stop) === cleanCode) || null;
}

export function PlatformPairSummary({
  route,
  source,
  destination,
  loading = false,
  compact = false,
}: {
  route: any[];
  source: string;
  destination: string;
  loading?: boolean;
  compact?: boolean;
}) {
  const sourceStop = routeStopForStation(route, source);
  const destinationStop = routeStopForStation(route, destination);
  const sourcePlatform = platformValue(sourceStop);
  const destinationPlatform = platformValue(destinationStop);

  const showSource = loading || Boolean(sourceStop && sourcePlatform);
  const showDestination = loading || Boolean(destinationStop && destinationPlatform);

  if (!showSource && !showDestination) return null;

  const baseClass = compact
    ? "mt-2 flex flex-wrap gap-1.5 text-[10px]"
    : "mt-3 grid gap-2 text-[11px] sm:grid-cols-2";

  return (
    <div className={baseClass}>
      {showSource && (
        <span className="rounded-md border border-slate-200 bg-white px-2.5 py-1 font-black text-slate-600 dark:border-white/10 dark:bg-white/8 dark:text-slate-200">
          Board platform: {loading ? "checking schedule" : sourcePlatform}
        </span>
      )}
      {showDestination && (
        <span className="rounded-md border border-slate-200 bg-white px-2.5 py-1 font-black text-slate-600 dark:border-white/10 dark:bg-white/8 dark:text-slate-200">
          Arrival platform: {loading ? "checking schedule" : destinationPlatform}
        </span>
      )}
    </div>
  );
}

export function ExpectedPlatformPair({ trainNo, source, destination, initialRoute = EMPTY_ROUTE }: { trainNo: string; source: string; destination: string; initialRoute?: any[] }) {
  const initialRouteLength = initialRoute.length;
  const [state, setState] = useState<{ loading: boolean; route: any[]; error: string }>({
    loading: Boolean(trainNo && !initialRouteLength),
    route: initialRoute,
    error: "",
  });

  useEffect(() => {
    if (!trainNo || initialRouteLength) {
      setState({ loading: false, route: initialRoute, error: "" });
      return;
    }
    let mounted = true;
    setState({ loading: true, route: [], error: "" });
    postJson<any>("/api/train-search", { query: trainNo })
      .then((data) => {
        if (!mounted) return;
        setState({ loading: false, route: data.trains?.[0]?.route || [], error: "" });
      })
      .catch((error) => {
        if (!mounted) return;
        setState({ loading: false, route: [], error: error instanceof Error ? error.message : "Route unavailable" });
      });
    return () => {
      mounted = false;
    };
  }, [initialRoute, initialRouteLength, trainNo]);

  if (!trainNo) return null;

  const sourceStop = routeStopForStation(state.route, source);
  const destinationStop = routeStopForStation(state.route, destination);
  const sourcePlatform = platformValue(sourceStop);
  const destinationPlatform = platformValue(destinationStop);

  if (!state.loading && !sourcePlatform && !destinationPlatform) return null;

  return (
    <div className="mt-2">
      <div className="text-[10px] font-black uppercase text-slate-400">Expected platform</div>
      <PlatformPairSummary route={state.route} source={source} destination={destination} loading={state.loading} compact />
      {state.error && (
        <div className="mt-1 text-[10px] font-bold text-slate-400">Provider schedule did not return platform data.</div>
      )}
    </div>
  );
}

export function trainNumberName(train: any, fallback = "Train details") {
  const number = String(train?.trainNo || train?.train_no || train?.trainNumber || "").trim();
  const name = String(train?.trainName || train?.train_name || fallback).trim().toUpperCase();
  return number ? `${number} · ${name}` : name;
}

export function compatibleCoaches(classType: string) {
  if (classType === "1A") return ["H1", "H2"];
  if (classType === "2A") return ["A1", "A2", "A3", "A4"];
  if (classType === "SL") return Array.from({ length: 12 }, (_, index) => `S${index + 1}`);
  if (classType === "CC") return Array.from({ length: 8 }, (_, index) => `C${index + 1}`);
  if (classType === "EC") return ["E1", "E2"];
  return Array.from({ length: classType === "3A" || classType === "3E" ? 6 : 4 }, (_, index) => `B${index + 1}`);
}

export function defaultCoachFor(classType: string) {
  return compatibleCoaches(classType)[0];
}

export function groupSeatsForClass(classType: string, seats: ReturnType<typeof buildCoachSeats>) {
  if (classType === "1A") {
    const groups: { label: string; seats: typeof seats }[] = [];
    seats.forEach((seat) => {
      const label = seat.cabin || "Cabin";
      const existing = groups.find((group) => group.label === label);
      if (existing) existing.seats.push(seat);
      else groups.push({ label, seats: [seat] });
    });
    return groups;
  }
  const size = classType === "2A" ? 6 : ["CC", "EC"].includes(classType) ? 5 : 8;
  return Array.from({ length: Math.ceil(seats.length / size) }, (_, index) => ({
    label: ["CC", "EC"].includes(classType) ? `Row ${index + 1}` : `Bay ${index + 1}`,
    seats: seats.slice(index * size, index * size + size),
  }));
}

