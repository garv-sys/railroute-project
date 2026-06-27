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

import { softPanel, productBg } from "../shared/styles";
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
} from "../shared/constants";
import { postJson } from "../shared/api";
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
  liveDisplayValue,
  minBookableDateIso,
  maxBookableDateIso,
} from "../shared/utils";
import { LoadingBlock } from "../shared/LoadingBlock";
import { TrustSummary, QuotaTimingNotice, RunningDaysStrip, formatFare, lookupStatusLabel, debugModeEnabled, availabilityTone } from "../shared/TrustSummary";
import { StationAutocomplete, RelatedStationChips, QuickSearch, resolveStationInput } from "../shared/StationAutocomplete";
import { ProductShell } from "../layout/ProductShell";
import { ToolHeader } from "../layout/ToolHeader";
import { CoachExplorer } from "./CoachExplorer";
import { BookingWorkspace } from "./BookingWorkspace";
import { ProviderDebugPanel } from "./TrainResultsWorkspace";


export function FareTool() {
  const [trainNo, setTrainNo] = useState("");
  const [source, setSource] = useState("");
  const [destination, setDestination] = useState("");
  const [sourceQuery, setSourceQuery] = useState("");
  const [destinationQuery, setDestinationQuery] = useState("");
  const [date, setDate] = useState(todayIso());
  const [classType, setClassType] = useState("ALL");
  const [quota, setQuota] = useState("GN");
  const [state, setState] = useState<{ loading: boolean; error: string; data: any | null }>({ loading: false, error: "", data: null });
  async function check() {
    const resolvedSource = resolveStationInput(source, sourceQuery);
    const resolvedDestination = resolveStationInput(destination, destinationQuery);
    if (!trainNo || !resolvedSource || !resolvedDestination || !date) return setState({ loading: false, error: "Enter train number, source, destination and date. Station names like Alwar work too.", data: null });
    setSource(resolvedSource);
    setDestination(resolvedDestination);
    setSourceQuery(stationLabelFromCode(resolvedSource));
    setDestinationQuery(stationLabelFromCode(resolvedDestination));
    setState({ loading: true, error: "", data: null });
    try {
	      setState({ loading: false, error: "", data: await postJson("/api/fare", { trainNo, source: resolvedSource, destination: resolvedDestination, date, classType, quota, debug: debugModeEnabled() }) });
    } catch (error) {
      setState({ loading: false, error: error instanceof Error ? error.message : "Fare failed.", data: null });
    }
  }
  const rows = state.data?.fareTable || [];
  return (
    <div className={softPanel("mx-auto max-w-5xl rounded-[32px] p-5")}>
      <IndianRupee className="h-7 w-7 text-cyan-600 dark:text-cyan-200" />
      <h2 className="mt-4 text-3xl font-black">Fare Enquiry</h2>
      <p className="mt-2 text-sm font-semibold text-slate-500 dark:text-slate-400">Live fare is shown only when the selected-date availability provider returns it for the train, route, class and quota. Otherwise the row stays unavailable.</p>
      <div className="mt-5 grid gap-3 lg:grid-cols-[0.8fr_1.2fr_1.2fr_0.9fr_auto]">
        <label className="block">
          <span className="mb-2 block text-[11px] font-black uppercase text-slate-500 dark:text-slate-400">Train no</span>
          <input value={trainNo} onChange={(event) => setTrainNo(event.target.value.replace(/\D/g, "").slice(0, 5))} placeholder="e.g. 12395" className="h-14 w-full rounded-2xl border border-slate-200 bg-white px-4 font-bold dark:border-white/10 dark:bg-white/8 dark:text-white" />
        </label>
        <StationAutocomplete label="From" placeholder="Station name or code" example="Alwar / AWR" value={source} setValue={setSource} query={sourceQuery} setQuery={setSourceQuery} />
        <StationAutocomplete label="To" placeholder="Station name or code" example="Jaipur / JP" value={destination} setValue={setDestination} query={destinationQuery} setQuery={setDestinationQuery} />
        <label className="block">
          <span className="mb-2 block text-[11px] font-black uppercase text-slate-500 dark:text-slate-400">Date</span>
          <input value={date} onChange={(event) => setDate(event.target.value)} type="date" min={minBookableDateIso()} max={maxBookableDateIso()} className="h-14 w-full rounded-2xl border border-slate-200 bg-white px-4 font-bold dark:border-white/10 dark:bg-white/8 dark:text-white" />
        </label>
        <button type="button" onClick={check} className="mt-5 flex h-14 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-6 font-black text-white dark:bg-white dark:text-slate-950">
          {state.loading && <Loader2 className="h-4 w-4 animate-spin" />}
          <span>{state.loading ? "Checking" : "Check Fare"}</span>
        </button>
      </div>
      <div className="mt-5 grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-black/20">
        <div>
          <div className="text-[11px] font-black uppercase text-slate-500 dark:text-slate-400">Class list</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {fareClassOptions.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setClassType(item)}
                className={`rounded-full border px-3 py-2 text-xs font-black transition ${classType === item ? "border-cyan-400 bg-cyan-100 text-cyan-900 dark:bg-cyan-300/15 dark:text-cyan-100" : "border-slate-200 bg-white text-slate-600 hover:border-cyan-300 dark:border-white/10 dark:bg-white/6 dark:text-slate-300"}`}
              >
                {item === "ALL" ? "All classes" : `${item} · ${classLabelMap[item] || item}`}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="text-[11px] font-black uppercase text-slate-500 dark:text-slate-400">Quota</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {fareQuotaOptions.map((item) => (
              <button
                key={item.code}
                type="button"
                onClick={() => setQuota(item.code)}
                className={`rounded-full border px-3 py-2 text-xs font-black transition ${quota === item.code ? "border-emerald-400 bg-emerald-100 text-emerald-900 dark:bg-emerald-300/15 dark:text-emerald-100" : "border-slate-200 bg-white text-slate-600 hover:border-emerald-300 dark:border-white/10 dark:bg-white/6 dark:text-slate-300"}`}
              >
                {item.code} · {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      {state.error && <div className="mt-5 rounded-2xl bg-rose-50 p-4 font-black text-rose-700 dark:bg-rose-300/12 dark:text-rose-100">{state.error}</div>}
      {state.data && (
        <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs font-black uppercase text-slate-400">Class-wise fare</div>
              <h3 className="mt-1 text-2xl font-black">{state.data.trainNo} · {state.data.trainName ? `${state.data.trainName} · ` : ""}{state.data.source} → {state.data.destination}</h3>
              <div className="mt-1 text-xs font-black uppercase text-slate-500 dark:text-slate-400">
                {state.data.classType === "ALL" ? "Provider-returned classes" : state.data.classType} · {state.data.quota || quota} quota
              </div>
              {state.data.meta && <TrustSummary meta={state.data.meta} />}
              {state.data.referenceFrom && (
                <div className="mt-2 text-xs font-black text-slate-500 dark:text-slate-300">
                  {state.data.referenceFrom}
                </div>
              )}
            </div>
            <span className={`rounded-full px-3 py-2 text-xs font-black ${state.data.sourceType === "date-specific-provider" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-300/12 dark:text-emerald-100" : "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200"}`}>
              {state.data.sourceType === "date-specific-provider" ? "Date-specific provider fare" : "Provider did not return fare"}
            </span>
          </div>
          {state.data.warning && <div className="mt-4 rounded-2xl border border-amber-300/35 bg-amber-50 p-3 text-xs font-black leading-5 text-amber-900 dark:border-amber-300/20 dark:bg-amber-300/10 dark:text-amber-100">{state.data.warning}</div>}
          <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 dark:border-white/10">
            <div className="grid grid-cols-[1.4fr_0.8fr_1fr_1.2fr_1fr] bg-slate-100 px-4 py-3 text-xs font-black uppercase text-slate-500 dark:bg-black/30 dark:text-slate-400">
              <span>Class</span><span>Quota</span><span>Fare</span><span>Status</span><span>Source</span>
            </div>
	            {rows.map((row: any) => (
              <div key={`${row.classCode}-${row.quota || state.data.quota}`} className="grid grid-cols-[1.4fr_0.8fr_1fr_1.2fr_1fr] items-center border-t border-slate-200 px-4 py-3 text-sm font-black dark:border-white/10">
                <span>
                  <span className="block">{row.classCode}</span>
                  <span className="block text-xs font-bold text-slate-500 dark:text-slate-400">{classLabelMap[row.classCode] || "Rail class"}</span>
                </span>
                <span>{row.quota || state.data.quota}</span>
                <span>{row.fare ? formatFare(row.fare) : row.issueCode === "SUSPECT_PROVIDER_MAPPING" ? "Hidden: suspect provider mapping" : lookupStatusLabel(row.fareStatus || "PROVIDER_UNAVAILABLE", "fare", row.classCode, row.warning)}</span>
		                <span className={`w-fit rounded-full border px-2.5 py-1 text-xs ${availabilityTone(row.availability ?? "Provider did not return availability")}`}>{row.availability ?? "Provider did not return availability"}</span>
                <span className={row.fare ? "text-emerald-700 dark:text-emerald-200" : row.availability ? "text-cyan-700 dark:text-cyan-200" : "text-slate-500 dark:text-slate-300"}>
                  {row.fare ? "date-specific fare" : row.availability ? "provider availability" : "not returned"}
                </span>
	              </div>
	            ))}
	            {rows.length === 0 && (
	              <div className="border-t border-slate-200 px-4 py-5 text-sm font-bold text-slate-500 dark:border-white/10 dark:text-slate-300">
	                Provider did not return date-specific fare or availability rows for this train, route, quota and date.
	              </div>
	            )}
	          </div>
	          {debugModeEnabled() && state.data?.debugTrace && <ProviderDebugPanel trace={state.data.debugTrace} />}
	        </div>
	      )}
    </div>
  );
}



export function liveStopName(stop: unknown, index: number) {
  if (!stop || typeof stop !== "object") return liveDisplayValue(stop) || `Stop ${index + 1}`;
  const record = stop as Record<string, unknown>;
  return liveDisplayValue(record.stationName ?? record.StationName ?? record.name ?? record.Name ?? record.code ?? record.StationCode ?? `Stop ${index + 1}`);
}

export function liveStopTime(stop: unknown) {
  if (!stop || typeof stop !== "object") return "--";
  const record = stop as Record<string, unknown>;
  return liveDisplayValue(record.arrival ?? record.ArrivalTime ?? record.departure ?? record.DepartureTime ?? record.time ?? record.Time);
}

export function liveStatusNoteLocation(note: unknown) {
  const text = liveDisplayValue(note);
  if (!text || text === "--") return "";
  const match = text.match(/\b(?:departed from|arrived at|reached|crossed)\s+(.+?)(?:\s+at\b|$)/i);
  return match?.[1]?.replace(/\(([^)]+)\)/, " ($1)").trim() || "";
}

export function liveCurrentLocation(live: any, route: any[]) {
  const explicit = live?.CurrentStation || live?.currentStation || live?.current_station || live?.currentStationName || live?.stationName;
  if (explicit) return liveStopName(explicit, 0);
  const noteLocation = liveStatusNoteLocation(live?.statusNote || live?.StatusNote || live?.status_note || live?.latestStatus);
  if (noteLocation) return noteLocation;
  const markedCurrent = route.find((stop: any) => /current|here|at station/i.test(String(stop?.status || stop?.Status || "")));
  if (markedCurrent) return liveStopName(markedCurrent, 0);
  const lastPassed = [...route].reverse().find((stop: any) => /passed|departed/i.test(String(stop?.status || stop?.Status || "")));
  if (lastPassed) return liveStopName(lastPassed, 0);
  return "Provider returned status data";
}
