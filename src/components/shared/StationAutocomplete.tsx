"use client";

import React, { useState, useEffect, useMemo, useRef, FormEvent, useDeferredValue } from "react";
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
  stationRelatedCodes,
  stationState,
  STATION_COORDS,
  titleCase,
  type Station,
  stationMatches,
} from "@/lib/railway-intelligence";

import { softPanel, productBg } from "./styles";
import {
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
  minBookableDateIso,
  maxBookableDateIso,
} from "./utils";
import { LoadingBlock } from "./LoadingBlock";
import { TrustSummary, QuotaTimingNotice, RunningDaysStrip, primaryClassCode, classAvailabilityStatus, compactSeatText, classAvailabilityText, returnedClassesForTrain, readableRailStatus, availabilityNumber, confirmationChanceFromStatus, waitlistConfirmationChance, fareToNumber, durationToMinutes, splitTotalDuration, splitLayoverMinutes, classFareAmount, trainFareAmount, timeToMinutes, multiSplitLayoverMinutes, actualLegSourceStation, actualLegDestinationStation, trainNumberName, isSeatAvailable, splitHasVerifiedFareAndSeats, formatFare, formatDurationLong, multiSplitHasVerifiedFareAndSeats } from "./TrustSummary";
import { ProductShell } from "../layout/ProductShell";
import { ToolHeader } from "../layout/ToolHeader";
import { useStationSearch } from "@/hooks/useStationSearch";
import { CoachExplorer } from "../tools/CoachExplorer";
import { BookingWorkspace } from "../tools/BookingWorkspace";


export function StationAutocomplete({
  label,
  placeholder,
  value,
  setValue,
  query,
  setQuery,
}: {
  label: string;
  placeholder: string;
  example: string;
  value: string;
  setValue: (code: string) => void;
  query: string;
  setQuery: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const helperText = query.trim() ? value || "" : "";
  const canOpenSuggestions = query.trim().length >= 2;
  const advisory = useMemo(() => railAccessAdvisory(query), [query]);
  const { results: matches, loading } = useStationSearch(query);

  useEffect(() => {
    setActive(0);
  }, [query]);

  function select(station: Station) {
    setValue(station.code);
    setQuery(stationLabel(station));
    setOpen(false);
  }

  return (
    <div className="relative">
      <div className="mb-2 flex items-center justify-between gap-3">
        <label className="text-[11px] font-black uppercase text-slate-500 dark:text-slate-400">{label}</label>
        {helperText ? <span className="truncate text-[11px] font-semibold text-slate-400 dark:text-slate-500">{helperText}</span> : null}
      </div>
      <div className="relative">
        <MapPin className={`pointer-events-none absolute left-4 top-4 h-4 w-4 ${label === "From" ? "text-emerald-500" : label === "Via" ? "text-cyan-500" : "text-rose-500"}`} />
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setValue("");
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 140)}
          onKeyDown={(event) => {
            if (!open || matches.length === 0) return;
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActive((index) => Math.min(index + 1, matches.length - 1));
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive((index) => Math.max(index - 1, 0));
            }
            if (event.key === "Enter") {
              event.preventDefault();
              select(matches[active]);
            }
          }}
          placeholder={placeholder}
          className="h-14 w-full rounded-2xl border border-slate-200 bg-white/85 pl-11 pr-4 text-[15px] font-bold text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-cyan-400 focus:ring-4 focus:ring-cyan-300/15 dark:border-white/10 dark:bg-white/8 dark:text-white dark:placeholder:text-slate-500"
          aria-label={label}
        />
      </div>
      <AnimatePresence>
        {open && canOpenSuggestions && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="absolute z-50 mt-2 max-h-96 w-full overflow-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-2xl shadow-slate-400/20 dark:border-white/12 dark:bg-[#111827]/96 dark:shadow-black/50"
          >
            {advisory && (
              <div className="mb-1 rounded-xl border border-amber-300/40 bg-amber-50 px-3 py-2 text-xs font-bold leading-5 text-amber-950 dark:border-amber-300/25 dark:bg-amber-300/10 dark:text-amber-50">
                <div className="font-black">{advisory.title}</div>
                <div className="mt-1">{advisory.message}</div>
                {advisory.nearestCodes.length > 0 && (
                  <div className="mt-1 text-[11px] font-black uppercase text-amber-700 dark:text-amber-200">
                    Nearest railheads: {advisory.nearestCodes.map((code) => stationCompactLabel(code)).join(" · ")}
                  </div>
                )}
              </div>
            )}
            {loading ? (
              <div className="flex items-center gap-2 px-4 py-4 text-sm font-semibold text-slate-500 dark:text-slate-300">
                <Loader2 className="h-4 w-4 animate-spin text-cyan-500" />
                <span>Searching stations...</span>
              </div>
            ) : matches.length === 0 ? (
              <div className="px-4 py-4 text-sm font-semibold text-slate-500 dark:text-slate-300">No station found. Try station code or city spelling.</div>
            ) : (
              <>
                <div className="sticky top-0 z-10 mb-1 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-[11px] font-black uppercase text-slate-500 backdrop-blur dark:border-white/10 dark:bg-[#111827]/95 dark:text-slate-300">
                  Showing station and nearby city terminals
                </div>
                {matches.map((station, index) => (
                  <button
                    key={station.code}
                    type="button"
                    onMouseDown={() => select(station)}
                    className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-3 text-left transition ${
                      index === active ? "bg-cyan-50 dark:bg-white/14" : "hover:bg-slate-50 dark:hover:bg-white/10"
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold text-slate-900 dark:text-slate-100">
                        <HighlightMatch value={stationCityName(station)} query={query} />
                      </span>
                      <span className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 text-[11px] font-black uppercase text-slate-400 dark:text-slate-500">
                        {station.state && <span className="truncate"><HighlightMatch value={station.state} query={query} /></span>}
                        {station.type && <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-slate-500 dark:bg-white/8 dark:text-slate-300">{station.type}</span>}
                      </span>
                    </span>
                    <span className="shrink-0 rounded-lg border border-cyan-300/40 bg-cyan-100 px-2.5 py-1 text-xs font-black text-cyan-800 dark:bg-cyan-300/10 dark:text-cyan-100">
                      <HighlightMatch value={station.code} query={query} />
                    </span>
                  </button>
                ))}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      <input type="hidden" value={value} readOnly />
    </div>
  );
}

export function RelatedStationChips({
  label,
  value,
  query,
  onSelect,
}: {
  label: string;
  value: string;
  query: string;
  onSelect: (code: string) => void;
}) {
  const codes = useMemo(() => {
    const base = value || query;
    return stationRelatedCodes(base, 9).filter((code) => stationByCode(code));
  }, [query, value]);
  if (codes.length <= 1) return null;
  return (
    <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2">
      <span className="text-[10px] font-black uppercase text-slate-400">{label} nearby terminals</span>
      {codes.map((code) => (
        <button
          key={`${label}-${code}`}
          type="button"
          onClick={() => onSelect(code)}
          className={`rounded-full border px-3 py-1.5 text-[11px] font-black transition ${
            code === value
              ? "border-cyan-300 bg-cyan-100 text-cyan-900 dark:bg-cyan-300/12 dark:text-cyan-50"
              : "border-slate-200 bg-white/80 text-slate-600 hover:border-cyan-300 dark:border-white/10 dark:bg-white/6 dark:text-slate-300"
          }`}
          title={stationLabelFromCode(code)}
        >
          {stationCompactLabel(code)}
        </button>
      ))}
    </div>
  );
}

export function DateQuickField({ date, setDate }: { date: string; setDate: (value: string) => void }) {
  // Indian Railways lets you book up to 60 days ahead of the journey date (excluding
  // the journey date itself). These bounds — and the quick-pick shortcuts below — are
  // computed from "today" on every render, so the window always stays correct instead
  // of silently going stale the way a hardcoded calendar date would.
  const minDate = minBookableDateIso();
  const maxDate = maxBookableDateIso();
  const options: [string, string][] = [
    ["Today", todayIso()],
    ["Tomorrow", todayIso(1)],
    ["+1 week", addIsoDays(todayIso(), 7)],
    ["Max (60d)", maxDate],
  ];

  return (
    <label className="block">
      <span className="mb-2 flex items-center justify-between gap-3">
        <span className="text-[11px] font-black uppercase text-slate-500 dark:text-slate-400">Date</span>
        <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500">{prettyDateLabel(date)}</span>
      </span>
      <input type="date" min={minDate} max={maxDate} value={date} onChange={(event) => setDate(event.target.value)} className="h-13 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-950 outline-none focus:border-cyan-400 dark:border-white/10 dark:bg-white/8 dark:text-white" />
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map(([label, value]) => (
          <button
            key={label}
            type="button"
            onClick={() => setDate(value)}
            className={`rounded-full border px-3 py-1.5 text-[11px] font-black transition ${
              date === value
                ? "border-cyan-300 bg-cyan-100 text-cyan-800 dark:bg-cyan-300/12 dark:text-cyan-100"
                : "border-slate-200 bg-white/80 text-slate-500 hover:border-cyan-300 dark:border-white/10 dark:bg-white/6 dark:text-slate-400"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[10px] font-bold text-slate-400 dark:text-slate-500">Bookable {prettyDateLabel(minDate)} – {prettyDateLabel(maxDate)} (60-day advance reservation window)</p>
    </label>
  );
}

export function NearbyDateSuggestions({
  source,
  destination,
  date,
  classType,
  quota,
  directCount,
  onSelectDate,
}: {
  source: string;
  destination: string;
  date: string;
  classType: string;
  quota: string;
  directCount: number;
  onSelectDate: (date: string) => void;
}) {
  const [nearby, setNearby] = useState<{ loading: boolean; items: Array<{ date: string; count: number; error?: string }> }>({
    loading: false,
    items: [],
  });

  useEffect(() => {
    if (!source || !destination || !date || directCount >= 3) {
      setNearby({ loading: false, items: [] });
      return;
    }

    let active = true;
    const today = todayIso();
    const nearbyDates = Array.from({ length: 7 }, (_, index) => addIsoDays(date, index - 3)).filter((item) => item >= today && item <= maxBookableDateIso());
    setNearby((current) => ({ loading: true, items: current.items.filter((item) => nearbyDates.includes(item.date)) }));

    Promise.all(
      nearbyDates.map(async (nearbyDate) => {
        try {
          const response = await postJson<any>("/api/train-between", {
            source,
            destination,
            date: nearbyDate,
            classType,
            quota,
            debug: false,
          });
          const trains = response?.trains || response?.data?.trains || [];
          return { date: nearbyDate, count: Array.isArray(trains) ? trains.length : 0 };
        } catch (error) {
          return { date: nearbyDate, count: 0, error: error instanceof Error ? error.message : "Could not fetch count" };
        }
      })
    ).then((items) => {
      if (!active) return;
      setNearby({ loading: false, items });
    });

    return () => {
      active = false;
    };
  }, [classType, date, destination, directCount, quota, source]);

  if (directCount >= 3 || (!nearby.loading && nearby.items.length === 0)) return null;

  const maxCount = Math.max(1, ...nearby.items.map((item) => item.count));
  const recommended = nearby.items
    .filter((item) => item.date !== date)
    .sort((a, b) => b.count - a.count)[0];

  return (
    <div className={softPanel("mt-4 rounded-[28px] p-4")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
	          <div className="text-[11px] font-black uppercase text-cyan-700 dark:text-cyan-200">Nearby date options</div>
	          <h3 className="mt-1 text-lg font-black">
	            Only {directCount} live direct option{directCount === 1 ? "" : "s"} on {shortDateLabel(date)}. Nearby schedule counts:
	          </h3>
	        </div>
        {nearby.loading ? (
          <span className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-black text-slate-500 dark:border-white/10 dark:bg-white/8 dark:text-slate-300">
            Checking dates...
          </span>
	        ) : recommended && recommended.count > directCount ? (
	          <span className="rounded-md border border-emerald-300/35 bg-emerald-50 px-3 py-2 text-[11px] font-black text-emerald-800 dark:bg-emerald-300/10 dark:text-emerald-100">
	            Recommended: {shortDateLabel(recommended.date)} · {recommended.count} schedule trains
	          </span>
	        ) : null}
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-7">
        {(nearby.items.length ? nearby.items : Array.from({ length: 7 }, (_, index) => ({ date: addIsoDays(date, index - 3), count: 0 }))).map((item) => {
          const selected = item.date === date;
          const width = `${Math.max(item.count > 0 ? 14 : 4, Math.round((item.count / maxCount) * 100))}%`;
          const isRecommended = recommended?.date === item.date && item.count > directCount;
          return (
            <button
              key={item.date}
              type="button"
              onClick={() => onSelectDate(item.date)}
              className={`rounded-2xl border p-3 text-left transition ${
                selected
                  ? "border-cyan-400 bg-cyan-50 text-cyan-950 dark:bg-cyan-300/10 dark:text-cyan-50"
                  : isRecommended
                    ? "border-emerald-300 bg-emerald-50 text-emerald-950 hover:border-emerald-400 dark:bg-emerald-300/10 dark:text-emerald-50"
                    : "border-slate-200 bg-slate-50 text-slate-700 hover:border-cyan-300 dark:border-white/10 dark:bg-white/6 dark:text-slate-200"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-black">{shortDateLabel(item.date)}</span>
                {selected && <span className="text-[10px] font-black uppercase">Selected</span>}
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
                <div className={`h-full rounded-full ${item.count >= 6 ? "bg-emerald-500" : item.count >= 3 ? "bg-cyan-500" : "bg-amber-500"}`} style={{ width }} />
              </div>
	              <div className="mt-2 text-xs font-black">
	                {nearby.loading ? "Checking..." : `${item.count} schedule train${item.count === 1 ? "" : "s"}`}
	              </div>
            </button>
          );
        })}
      </div>
    </div>
	  );
	}

export function optionAvailabilitySummary(train: any, classCode = "") {
  const code = classCode && classCode !== "ANY" ? classCode : primaryClassCode(train);
  return code ? classAvailabilityStatus(train, code) : compactSeatText(train);
}

export function splitAvailabilityScore(split: any, classCode = "") {
  const statuses = [optionAvailabilitySummary(split?.leg1, classCode), optionAvailabilitySummary(split?.leg2, classCode)];
  return statuses.reduce((score, status) => {
    const text = readableRailStatus(status).toUpperCase();
    if (/\bAVAILABLE\b|\bAVL\b|CNF|CONFIRM/.test(text) && !/WL|WAIT|REGRET/.test(text)) return score + 0;
    if (/RAC/.test(text)) return score + 1;
    if (/WL|WAIT/.test(text)) return score + 2;
    return score + 5;
  }, 0);
}

export function legSeatQualityScore(leg: any, classCode = "") {
  const status = optionAvailabilitySummary(leg, classCode);
  const text = readableRailStatus(status).toUpperCase();
  const count = availabilityNumber(text);
  const chance = confirmationChanceFromStatus(status, leg);
  if (/\bAVAILABLE\b|\bAVL\b|CNF|CONFIRM/.test(text) && !/WL|WAIT|REGRET/.test(text)) {
    return 100 + Math.min(35, count);
  }
  if (/RAC/.test(text)) {
    return 70 + Math.min(20, Math.max(0, 12 - count)) + (chance ? Math.round(chance / 10) : 0);
  }
  if (/WL|WAIT/.test(text)) {
    return Math.max(5, Math.min(85, chance ?? waitlistConfirmationChance(count, Number(leg?.confirmationChance))));
  }
  if (/REGRET|NOT AVAILABLE|UNAVAILABLE/.test(text)) return 0;
  return 12;
}

export function splitLiveQualityScore(split: any, classCode = "") {
  const leg1 = legSeatQualityScore(split?.leg1, classCode);
  const leg2 = legSeatQualityScore(split?.leg2, classCode);
  return Math.round((leg1 + leg2) / 2);
}

export function layoverComfortPenalty(minutes: number) {
  if (!Number.isFinite(minutes)) return 120;
  if (minutes < 45) return 90 + (45 - minutes);
  if (minutes < 75) return 24 + Math.round((75 - minutes) / 2);
  if (minutes <= 240) return 0;
  if (minutes <= 420) return Math.round((minutes - 240) / 12);
  return 20 + Math.round((minutes - 420) / 8);
}

export function splitBestRankScore(split: any, classCode = "") {
  const fare = fareToNumber(split?.totalFare || split?.fare) || 999999;
  const duration = durationToMinutes(splitTotalDuration(split)) || 99999;
  const layover = splitLayoverMinutes(split);
  const liveQuality = splitLiveQualityScore(split, classCode);
  const providerScore = Number(split?.score || 0);
  return (
    liveQuality * 9 +
    Math.min(70, providerScore / 2) -
    Math.min(260, fare / 45) -
    Math.min(260, duration / 18) -
    layoverComfortPenalty(layover) * 1.4
  );
}

export function emergencySeatScore(value: unknown, train?: any) {
  const status = readableRailStatus(value).toUpperCase();
  const count = availabilityNumber(status);
  const chance = confirmationChanceFromStatus(status, train);
  if (/\bAVAILABLE\b|\bAVL\b|CNF|CONFIRM/.test(status) && !/WL|WAIT|REGRET/.test(status)) return 120 + Math.min(40, count);
  if (/RAC/.test(status)) return 98 + Math.min(18, Math.max(0, 18 - count));
  if (/WL|WAIT/.test(status)) return Math.max(8, Math.min(92, chance ?? waitlistConfirmationChance(count, Number(train?.confirmationChance))));
  if (/REGRET|NOT AVAILABLE|UNAVAILABLE/.test(status)) return 0;
  return 10;
}

export function emergencySeatLabel(value: unknown, train?: any) {
  const status = readableRailStatus(value);
  const upper = status.toUpperCase();
  const chance = confirmationChanceFromStatus(status, train);
  if (/\bAVAILABLE\b|\bAVL\b|CNF|CONFIRM/.test(upper) && !/WL|WAIT|REGRET/.test(upper)) return "Confirmed seats";
  if (/RAC/.test(upper)) return "RAC travelable";
  if (/WL|WAIT/.test(upper) && chance != null) return chance >= 80 ? `High WL chance · ~${chance}%` : `WL risk · ~${chance}%`;
  if (/REGRET/.test(upper)) return "Regret";
  return status || "Provider status";
}

export function directEmergencyRankScore(train: any, classCode = "") {
  const code = classCode && classCode !== "ANY" ? classCode : primaryClassCode(train);
  const availability = code ? classAvailabilityText(train, code) : compactSeatText(train);
  const fare = code ? classFareAmount(train, code) : trainFareAmount(train);
  const duration = durationToMinutes(train?.duration) || 99999;
  return emergencySeatScore(availability, train) * 10 -
    Math.min(260, duration / 9) -
    Math.min(200, (fare || 999999) / 45) -
    timeToMinutes(train?.departureTime) / 220;
}

export function splitEmergencyRankScore(split: any, classCode = "") {
  const leg1Seat = optionAvailabilitySummary(split?.leg1, classCode);
  const leg2Seat = optionAvailabilitySummary(split?.leg2, classCode);
  const weakerLeg = Math.min(emergencySeatScore(leg1Seat, split?.leg1), emergencySeatScore(leg2Seat, split?.leg2));
  const averageLeg = (emergencySeatScore(leg1Seat, split?.leg1) + emergencySeatScore(leg2Seat, split?.leg2)) / 2;
  const fare = fareToNumber(split?.totalFare || split?.fare) || 999999;
  const duration = durationToMinutes(splitTotalDuration(split)) || 99999;
  const layover = splitLayoverMinutes(split);
  return weakerLeg * 9 + averageLeg * 2 -
    Math.min(260, duration / 9) -
    Math.min(220, fare / 45) -
    layoverComfortPenalty(layover) * 2;
}

export function multiEmergencyRankScore(split: any, classCode = "") {
  const legs = Array.isArray(split?.legs) ? split.legs : [];
  const scores: number[] = legs.map((leg: any) => emergencySeatScore(optionAvailabilitySummary(leg, classCode), leg));
  const weakest = scores.length ? Math.min(...scores) : 0;
  const average = scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : 0;
  const fare = fareToNumber(split?.totalFare) || 999999;
  const duration = durationToMinutes(split?.totalDuration) || 99999;
  const layover = multiSplitLayoverMinutes(split);
  return weakest * 9 + average * 2 -
    Math.min(260, duration / 9) -
    Math.min(220, fare / 45) -
    layoverComfortPenalty(layover) * 1.7 -
    Math.max(0, legs.length - 2) * 28;
}

export function multiSplitBestRankScore(split: any, classCode = "") {
  const legs = Array.isArray(split?.legs) ? split.legs : [];
  const liveQuality = legs.length
    ? Math.round(legs.reduce((sum: number, leg: any) => sum + legSeatQualityScore(leg, classCode), 0) / legs.length)
    : 0;
  const fare = fareToNumber(split?.totalFare) || 999999;
  const duration = durationToMinutes(split?.totalDuration) || 99999;
  const layover = multiSplitLayoverMinutes(split);
  const providerScore = Number(split?.score || 0);
  return (
    liveQuality * 9 +
    Math.min(70, providerScore / 2) -
    Math.min(260, fare / 45) -
    Math.min(260, duration / 18) -
    layoverComfortPenalty(layover) * 1.3 -
    Math.max(0, legs.length - 2) * 22
  );
}

export function splitOptionLabel(split: any) {
  const leg1 = split?.leg1 || {};
  const leg2 = split?.leg2 || {};
  const hub = split?.hubStation || actualLegDestinationStation(leg1) || actualLegSourceStation(leg2);
  return `${trainNumberName(leg1, "Leg 1")} + ${trainNumberName(leg2, "Leg 2")} via ${stationCompactLabel(hub)}`;
}

export function BestOptionsPanel({
  directTrains,
  splitRoutes,
  classCode,
}: {
  directTrains: any[];
  splitRoutes: any[];
  classCode: string;
}) {
  const cleanClass = String(classCode || "").toUpperCase();
  const directOptions = directTrains.map((train) => ({
    kind: "direct" as const,
    label: trainNumberName(train),
    route: `${stationCompactLabel(actualLegSourceStation(train) || train.source)} → ${stationCompactLabel(actualLegDestinationStation(train) || train.destination)}`,
    fare: cleanClass ? classFareAmount(train, cleanClass) : trainFareAmount(train),
    duration: durationToMinutes(train.duration),
    layover: Infinity,
    availabilityScore: (() => {
      const status = cleanClass ? classAvailabilityText(train, cleanClass) : compactSeatText(train);
      return isSeatAvailable(status) ? 0 : /RAC/i.test(status) ? 1 : /WL|WAIT/i.test(status) ? 2 : 5;
    })(),
    seat: cleanClass ? classAvailabilityText(train, cleanClass) : compactSeatText(train),
  }));
  const splitOptions = splitRoutes.filter((split) => splitHasVerifiedFareAndSeats(split, cleanClass)).map((split) => ({
    kind: "split" as const,
    label: splitOptionLabel(split),
    route: `${stationCompactLabel(actualLegSourceStation(split?.leg1) || split?.leg1?.source)} → ${stationCompactLabel(split?.hubStation)} → ${stationCompactLabel(actualLegDestinationStation(split?.leg2) || split?.leg2?.destination)}`,
    fare: fareToNumber(split.totalFare),
    duration: durationToMinutes(splitTotalDuration(split)),
    layover: splitLayoverMinutes(split),
    availabilityScore: splitAvailabilityScore(split, cleanClass),
    bestScore: splitBestRankScore(split, cleanClass),
    seat: `${compactSeatText(split?.leg1)} + ${compactSeatText(split?.leg2)}`,
  }));
  const options = [...directOptions, ...splitOptions].filter((option) => option.fare > 0 || option.duration > 0);
  if (!options.length) return null;

  const cheapest = [...options].filter((option) => option.fare > 0).sort((a, b) => a.fare - b.fare || a.duration - b.duration)[0];
  const fastest = [...options].filter((option) => option.duration > 0).sort((a, b) => a.duration - b.duration || a.fare - b.fare)[0];
  const lowestLayover = [...splitOptions].filter((option) => Number.isFinite(option.layover)).sort((a, b) => a.layover - b.layover || a.fare - b.fare)[0];
  const bestAvailability = [...options].sort((a: any, b: any) => {
    const bestA = Number(a.bestScore || 0);
    const bestB = Number(b.bestScore || 0);
    if (bestA || bestB) return bestB - bestA || a.availabilityScore - b.availabilityScore || a.fare - b.fare || a.duration - b.duration;
    return a.availabilityScore - b.availabilityScore || a.fare - b.fare || a.duration - b.duration;
  })[0];
  const cards = [
    ["Cheapest", cheapest, cheapest?.fare ? formatFare(cheapest.fare) : ""],
    ["Fastest", fastest, fastest?.duration ? formatDurationLong(fastest.duration) : ""],
    ["Lowest layover", lowestLayover, lowestLayover?.layover ? formatDurationLong(lowestLayover.layover) : ""],
    ["Best seats", bestAvailability, bestAvailability?.seat || ""],
  ].filter(([, option]) => option) as Array<[string, typeof options[number], string]>;

  return (
    <div className={softPanel("mt-4 rounded-[28px] p-4")}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="text-[11px] font-black uppercase text-cyan-700 dark:text-cyan-200">Best usable options</div>
          <h3 className="mt-1 text-lg font-black">Fare + seat-backed picks for this search</h3>
        </div>
        <span className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-black text-slate-500 dark:border-white/10 dark:bg-white/6 dark:text-slate-300">
          {cleanClass || "Selected class"}
        </span>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {cards.map(([title, option, metric]) => (
          <div key={`${title}-${option.label}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-black/20">
            <div className="text-[10px] font-black uppercase text-slate-400">{title}</div>
            <div className="mt-1 text-lg font-black">{metric}</div>
            <div className="mt-2 line-clamp-2 text-xs font-black leading-5 text-slate-700 dark:text-slate-200">{option.label}</div>
            <div className="mt-1 text-[11px] font-semibold leading-4 text-slate-500 dark:text-slate-400">{option.route}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function EmergencyTravelPanel({
  directTrains,
  splitRoutes,
  multiSplits,
  classCode,
  loading,
}: {
  directTrains: any[];
  splitRoutes: any[];
  multiSplits: any[];
  classCode: string;
  loading: boolean;
}) {
  const cleanClass = String(classCode || "").toUpperCase();
  const directOptions = directTrains.map((train) => {
    const code = cleanClass && cleanClass !== "ANY" ? cleanClass : primaryClassCode(train);
    const seat = code ? classAvailabilityText(train, code) : compactSeatText(train);
    return {
      kind: "Direct" as const,
      label: trainNumberName(train),
      route: `${stationCompactLabel(actualLegSourceStation(train) || train.source)} → ${stationCompactLabel(actualLegDestinationStation(train) || train.destination)}`,
      fare: code ? classFareAmount(train, code) : trainFareAmount(train),
      duration: durationToMinutes(train.duration),
      layover: "No transfer",
      readiness: emergencySeatLabel(seat, train),
      seat,
      score: directEmergencyRankScore(train, code),
    };
  });
  const splitOptions = splitRoutes.filter((split) => splitHasVerifiedFareAndSeats(split, cleanClass)).map((split) => {
    const leg1Seat = optionAvailabilitySummary(split?.leg1, cleanClass);
    const leg2Seat = optionAvailabilitySummary(split?.leg2, cleanClass);
    const layover = splitLayoverMinutes(split);
    return {
      kind: "Split" as const,
      label: splitOptionLabel(split),
      route: `${stationCompactLabel(actualLegSourceStation(split?.leg1) || split?.leg1?.source)} → ${stationCompactLabel(split?.hubStation)} → ${stationCompactLabel(actualLegDestinationStation(split?.leg2) || split?.leg2?.destination)}`,
      fare: fareToNumber(split.totalFare),
      duration: durationToMinutes(splitTotalDuration(split)),
      layover: Number.isFinite(layover) ? formatDurationLong(layover) : "Transfer",
      readiness: `${emergencySeatLabel(leg1Seat, split?.leg1)} + ${emergencySeatLabel(leg2Seat, split?.leg2)}`,
      seat: `${readableRailStatus(leg1Seat)} + ${readableRailStatus(leg2Seat)}`,
      score: splitEmergencyRankScore(split, cleanClass),
    };
  });
  const multiOptions = multiSplits.filter((split) => multiSplitHasVerifiedFareAndSeats(split, cleanClass)).map((split) => {
    const legs = Array.isArray(split?.legs) ? split.legs : [];
    const seats = legs.map((leg: any) => optionAvailabilitySummary(leg, cleanClass));
    const layover = multiSplitLayoverMinutes(split);
    return {
      kind: "Multi-split" as const,
      label: split?.label || `${legs.length || 3}-leg emergency route`,
      route: legs.length
        ? legs.map((leg: any, index: number) => index === 0
            ? `${stationCompactLabel(actualLegSourceStation(leg) || leg.source)} → ${stationCompactLabel(actualLegDestinationStation(leg) || leg.destination)}`
            : stationCompactLabel(actualLegDestinationStation(leg) || leg.destination)).join(" → ")
        : "Multi-leg route",
      fare: fareToNumber(split.totalFare),
      duration: durationToMinutes(split.totalDuration),
      layover: Number.isFinite(layover) ? formatDurationLong(layover) : "Transfers",
      readiness: seats.map((seat: unknown, index: number) => `L${index + 1}: ${emergencySeatLabel(seat, legs[index])}`).join(" · "),
      seat: seats.map(readableRailStatus).join(" + "),
      score: multiEmergencyRankScore(split, cleanClass),
    };
  });
  const options = [...directOptions, ...splitOptions, ...multiOptions]
    .filter((option) => option.fare > 0 && option.duration > 0 && !/regret/i.test(option.readiness))
    .sort((a, b) => b.score - a.score || a.duration - b.duration || a.fare - b.fare)
    .slice(0, 6);

  if (!options.length && !loading) return null;

  return (
    <div className={softPanel("mt-4 rounded-[30px] border-emerald-300/40 p-4 dark:border-emerald-300/25")}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-black uppercase text-emerald-700 dark:text-emerald-200">Emergency travel mode</div>
          <h3 className="mt-1 text-xl font-black">Fastest travelable options first</h3>
          <p className="mt-1 max-w-3xl text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">
            Prioritizes confirmed seats, RAC, and high-clearance WL, then ranks by total time, transfer risk, and fare.
          </p>
        </div>
        <span className="rounded-md border border-emerald-300/40 bg-emerald-50 px-3 py-2 text-[11px] font-black text-emerald-800 dark:bg-emerald-300/10 dark:text-emerald-100">
          {cleanClass || "Selected class"} · urgent ranking
        </span>
      </div>
      {options.length > 0 ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {options.map((option, index) => (
            <div key={`${option.kind}-${option.label}-${index}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-black/20">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="rounded-md border border-emerald-300/40 bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase text-emerald-800 dark:bg-emerald-300/10 dark:text-emerald-100">#{index + 1} {option.kind}</span>
                <span className="text-sm font-black">{formatFare(option.fare)}</span>
              </div>
              <div className="mt-3 line-clamp-2 text-base font-black leading-5">{option.label}</div>
              <div className="mt-1 text-xs font-bold leading-5 text-slate-500 dark:text-slate-400">{option.route}</div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-black">
                <span className="rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-white/10 dark:bg-white/6">{formatDurationLong(option.duration)}</span>
                <span className="rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-white/10 dark:bg-white/6">{option.layover}</span>
              </div>
              <div className="mt-3 rounded-xl border border-cyan-300/35 bg-cyan-50 px-3 py-2 text-xs font-black text-cyan-900 dark:bg-cyan-300/10 dark:text-cyan-100">
                {option.readiness}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-amber-300/35 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900 dark:bg-amber-300/10 dark:text-amber-100">
          Building emergency picks as live fare and seat checks complete.
        </div>
      )}
    </div>
  );
}

export function resolveStationInput(selectedCode: string, query: string) {
  const codeMatch = query.match(/(?:—\s*|\()\s*([A-Z0-9]{2,6})\s*\)?$/i);
  if (codeMatch) return codeMatch[1].toUpperCase();

  const selectedAliasCode = stationAliasCodes(selectedCode)[0];
  if (selectedAliasCode) return selectedAliasCode;
  if (selectedCode) return selectedCode;
  const trimmed = query.trim();
  const aliasCode = stationAliasCodes(trimmed)[0];
  if (aliasCode) return aliasCode;
  const exactCode = stationByCode(trimmed.toUpperCase());
  if (exactCode) return exactCode.code;
  if (normalizeText(trimmed).length < 3) return "";
  const matches = stationMatches(trimmed, 1);
  if (matches && matches[0]) return matches[0].code;
  return /^[A-Z0-9]{2,6}$/.test(trimmed) ? trimmed.toUpperCase() : "";
}

export function QuickSearch({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [source, setSource] = useState(DEFAULT_SOURCE_CODE);
  const [destination, setDestination] = useState(DEFAULT_DESTINATION_CODE);
  const [preferredHub, setPreferredHub] = useState(DEFAULT_VIA_CODE);
  const [sourceQuery, setSourceQuery] = useState(stationLabelFromCode(DEFAULT_SOURCE_CODE));
  const [destinationQuery, setDestinationQuery] = useState(stationLabelFromCode(DEFAULT_DESTINATION_CODE));
  const [preferredHubQuery, setPreferredHubQuery] = useState(stationLabelFromCode(DEFAULT_VIA_CODE));
  const [date, setDate] = useState(todayIso());
  const [classType, setClassType] = useState("3A");
  const [quota, setQuota] = useState("GN");
  const [error, setError] = useState("");
  const [swap, setSwap] = useState(false);
  const [trainQuery, setTrainQuery] = useState("");

  function swapStations() {
    setSwap(true);
    const oldSource = source;
    const oldQuery = sourceQuery;
    setSource(destination);
    setDestination(oldSource);
    setSourceQuery(destinationQuery);
    setDestinationQuery(oldQuery);
    window.setTimeout(() => setSwap(false), 420);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const resolvedSource = resolveStationInput(source, sourceQuery);
    const resolvedDestination = resolveStationInput(destination, destinationQuery);
    const resolvedPreferredHub = resolveStationInput(preferredHub, preferredHubQuery);

    if (!resolvedSource || !resolvedDestination) {
      setError("Select both Starting Point and End Point from station search.");
      return;
    }
    if (resolvedSource === resolvedDestination) {
      setError("Starting Point and End Point cannot be the same.");
      return;
    }
    const params = new URLSearchParams({
      from: resolvedSource,
      to: resolvedDestination,
      date,
      class: classType,
      quota,
    });
    if (resolvedPreferredHub && resolvedPreferredHub !== resolvedSource && resolvedPreferredHub !== resolvedDestination) {
      params.set("via", resolvedPreferredHub);
    }
    router.push(`/trains?${params.toString()}`);
  }

  function submitTrainLookup() {
    const cleanQuery = trainQuery.trim();
    if (!cleanQuery) {
      setError("Enter a train number or train name.");
      return;
    }
    setError("");
    router.push(`/train-search?query=${encodeURIComponent(cleanQuery)}`);
  }

  return (
    <motion.form
      onSubmit={submit}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      className={compact
        ? "w-full rounded-[30px] border border-white/15 bg-white/12 p-3 shadow-2xl shadow-black/30 backdrop-blur-2xl sm:p-4"
        : softPanel("mx-auto w-full max-w-5xl rounded-[32px] p-4 sm:p-5")}
    >
      <div className="grid gap-3 lg:grid-cols-[1fr_auto_1fr] lg:items-end">
        <StationAutocomplete label="From" placeholder="Starting Point" example="" value={source} setValue={setSource} query={sourceQuery} setQuery={setSourceQuery} />
        <button type="button" onClick={swapStations} className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-white text-cyan-700 shadow-lg transition hover:border-cyan-300 dark:border-white/14 dark:bg-white/10 dark:text-cyan-100" aria-label="Swap source and destination">
          <motion.span animate={{ rotate: swap ? 180 : 0, scale: swap ? 1.12 : 1 }} transition={{ type: "spring", stiffness: 420, damping: 18 }}>
            <ArrowDownUp className="h-5 w-5" />
          </motion.span>
        </button>
        <StationAutocomplete label="To" placeholder="End Point" example="" value={destination} setValue={setDestination} query={destinationQuery} setQuery={setDestinationQuery} />
      </div>
      <div className="grid gap-2 lg:grid-cols-2">
        <RelatedStationChips label="From" value={source} query={sourceQuery} onSelect={(code) => { setSource(code); setSourceQuery(stationLabelFromCode(code)); }} />
        <RelatedStationChips label="To" value={destination} query={destinationQuery} onSelect={(code) => { setDestination(code); setDestinationQuery(stationLabelFromCode(code)); }} />
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]">
        <DateQuickField date={date} setDate={setDate} />
        <label className="block">
          <span className="mb-2 block text-[11px] font-black uppercase text-slate-500 dark:text-slate-400">Class</span>
          <select value={classType} onChange={(event) => setClassType(event.target.value)} className="h-13 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-950 outline-none focus:border-cyan-400 dark:border-white/10 dark:bg-[#111827] dark:text-white">
            {["Any", ...classOptions].map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="mb-2 block text-[11px] font-black uppercase text-slate-500 dark:text-slate-400">Quota</span>
          <select value={quota} onChange={(event) => setQuota(event.target.value)} className="h-13 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-950 outline-none focus:border-cyan-400 dark:border-white/10 dark:bg-[#111827] dark:text-white">
            {quotaOptions.map((item) => <option key={item.code} value={item.code}>{item.code} · {item.label}</option>)}
          </select>
        </label>
        <button className="flex h-13 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-7 text-sm font-black text-white shadow-xl transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-cyan-50 md:self-end">
          <Search className="h-4 w-4" />
          Search Trains
        </button>
      </div>
      <QuotaTimingNotice date={date} classType={classType} quota={quota} />
      <div className="mt-4">
        <StationAutocomplete label="Via" placeholder="Optional layover city or station" example="" value={preferredHub} setValue={setPreferredHub} query={preferredHubQuery} setQuery={setPreferredHubQuery} />
      </div>
      {error && <p className="mt-3 rounded-2xl border border-rose-300/40 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700 dark:bg-rose-400/10 dark:text-rose-100">{error}</p>}
      <div className="mt-4 rounded-3xl border border-slate-200 bg-slate-50/80 p-3 dark:border-white/10 dark:bg-black/20">
        <div className="mb-2 text-[11px] font-black uppercase text-slate-500 dark:text-slate-400">Search by train number or name</div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Train className="pointer-events-none absolute left-4 top-4 h-4 w-4 text-cyan-600 dark:text-cyan-200" />
            <input
              value={trainQuery}
              onChange={(event) => setTrainQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  submitTrainLookup();
                }
              }}
              placeholder="12376, Rajdhani, Vande Bharat"
              className="h-13 w-full rounded-2xl border border-slate-200 bg-white pl-11 pr-4 text-sm font-bold text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-cyan-400 dark:border-white/10 dark:bg-white/8 dark:text-white dark:placeholder:text-slate-500"
            />
          </div>
          <button type="button" onClick={submitTrainLookup} className="flex h-13 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-900 transition hover:border-cyan-300 dark:border-white/10 dark:bg-white/8 dark:text-white">
            <Search className="h-4 w-4" />
            Lookup Train
          </button>
        </div>
      </div>
    </motion.form>
  );
}

export function HighlightMatch({ value, query }: { value: string; query: string }) {
  const text = String(value || "");
  const needle = String(query || "").trim();
  if (!needle) return <>{text}</>;
  const index = text.toLowerCase().indexOf(needle.toLowerCase());
  if (index === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, index)}
      <strong className="font-black text-slate-950 dark:text-white">{text.slice(index, index + needle.length)}</strong>
      {text.slice(index + needle.length)}
    </>
  );
}

