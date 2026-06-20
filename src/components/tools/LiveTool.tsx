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
} from "../shared/utils";
import { LoadingBlock } from "../shared/LoadingBlock";
import { TrustSummary, QuotaTimingNotice, RunningDaysStrip } from "../shared/TrustSummary";
import { StationAutocomplete, RelatedStationChips, QuickSearch } from "../shared/StationAutocomplete";
import { ProductShell } from "../layout/ProductShell";
import { ToolHeader } from "../layout/ToolHeader";
import { CoachExplorer } from "./CoachExplorer";
import { BookingWorkspace } from "./BookingWorkspace";
import { liveCurrentLocation, liveStopName, liveStopTime } from "./FareTool";


export function LiveTool() {
  const [trainNo, setTrainNo] = useState("12395");
  const [date, setDate] = useState(todayIso());
  const [state, setState] = useState<{ loading: boolean; error: string; data: any | null }>({ loading: false, error: "", data: null });
  async function check(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const cleanTrainNo = trainNo.replace(/\D/g, "").slice(0, 5);
    if (cleanTrainNo.length < 4) return setState({ loading: false, error: "Enter a valid train number.", data: null });
    setTrainNo(cleanTrainNo);
    setState({ loading: true, error: "", data: null });
    try {
      const response = await fetch("/api/live", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ trainNo: cleanTrainNo, date }),
      });
      const payload = await response.json().catch(() => null);
      if (!payload) throw new Error("Live lookup returned an empty response.");
      if (!response.ok && !payload.error) throw new Error("Live lookup failed.");
      setState({ loading: false, error: "", data: payload });
    } catch (error) {
      setState({ loading: false, error: error instanceof Error ? error.message : "Live lookup failed.", data: null });
    }
  }
  const payload = state.data;
  const live = payload?.data || payload;
  const routeCandidate = live?.timeline || live?.TrainRoute || live?.route || live?.stations || [];
  const route = Array.isArray(routeCandidate) ? routeCandidate : [];
  const currentLocation = liveCurrentLocation(live, route);
  const latestStatusNote = liveDisplayValue(live?.statusNote || live?.StatusNote || live?.status_note || "");
  const providerStatus = payload?.status || live?.status || live?.Status;
  const statusUnavailable = Boolean(payload && (payload.success === false || payload.error || providerStatus === "COMING_SOON"));
  const statusMessage = liveDisplayValue(payload?.message || live?.message || payload?.error || payload?.meta?.warning || "Provider did not return running status for this train and date.");
  const providerName = liveDisplayValue(payload?.meta?.provider || live?.provider || "IRCTC-compatible running-status provider");

  return (
    <div className={softPanel("mx-auto max-w-5xl rounded-[32px] p-5")}>
      <Activity className="h-7 w-7 text-cyan-600 dark:text-cyan-200" />
      <h2 className="mt-4 text-3xl font-black">Train Running Status</h2>
      <p className="mt-2 text-sm font-semibold text-slate-500 dark:text-slate-400">Shows provider running-status data when returned. If the provider is unavailable, no location is inferred.</p>
      <form onSubmit={check} className="mt-5 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <input value={trainNo} onChange={(event) => setTrainNo(event.target.value.replace(/\D/g, "").slice(0, 5))} placeholder="Train no, e.g. 12395" className="h-13 rounded-2xl border border-slate-200 bg-white px-4 font-bold dark:border-white/10 dark:bg-white/8 dark:text-white" />
        <input value={date} onChange={(event) => setDate(event.target.value)} type="date" min="2026-06-21" max="2026-08-21" className="h-13 rounded-2xl border border-slate-200 bg-white px-4 font-bold dark:border-white/10 dark:bg-white/8 dark:text-white" />
        <button type="submit" disabled={state.loading} className="flex h-13 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-6 font-black text-white disabled:opacity-70 dark:bg-white dark:text-slate-950">
          {state.loading && <Loader2 className="h-4 w-4 animate-spin" />}
          <span>{state.loading ? "Checking" : "Check status"}</span>
        </button>
      </form>
      {state.error && <div className="mt-5 rounded-2xl bg-rose-50 p-4 font-black text-rose-700 dark:bg-rose-300/12 dark:text-rose-100">{state.error}</div>}
      {state.loading && <div className="mt-5"><LoadingBlock label="Checking provider running status..." /></div>}
      {!payload && !state.loading && !state.error && (
        <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-5 text-slate-700 dark:border-white/10 dark:bg-white/6 dark:text-slate-200">
          <div className="text-xs font-black uppercase text-slate-400">Live status</div>
          <h3 className="mt-2 text-2xl font-black">Check official running status on NTES.</h3>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">
            If RailRoute cannot fetch live tracking, use NTES with train {trainNo || "number"} for the official running feed.
          </p>
          <a href={NTES_URL} target="_blank" rel="noreferrer" className="mt-4 inline-flex rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white dark:bg-white dark:text-slate-950">
            Open NTES
          </a>
        </div>
      )}
      {statusUnavailable && !state.loading && (
        <div className="mt-6 rounded-3xl border border-amber-300/35 bg-amber-50 p-5 text-amber-900 dark:border-amber-300/20 dark:bg-amber-300/10 dark:text-amber-100">
          <div className="text-xs font-black uppercase">Running status unavailable</div>
          <h3 className="mt-2 text-2xl font-black">Provider did not return live status</h3>
          {payload?.meta && <TrustSummary meta={payload.meta} />}
          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
            <div className="rounded-2xl bg-white/70 p-3 dark:bg-black/20">
              <div className="text-[10px] font-black uppercase opacity-70">Train</div>
              <div className="mt-1 font-black">{trainNo}</div>
            </div>
            <div className="rounded-2xl bg-white/70 p-3 dark:bg-black/20">
              <div className="text-[10px] font-black uppercase opacity-70">Date</div>
              <div className="mt-1 font-black">{date}</div>
            </div>
            <div className="rounded-2xl bg-white/70 p-3 dark:bg-black/20">
              <div className="text-[10px] font-black uppercase opacity-70">Provider</div>
              <div className="mt-1 font-black">{providerName}</div>
            </div>
          </div>
          <p className="mt-4 text-sm font-bold leading-6">{statusMessage}</p>
          <a href={NTES_URL} target="_blank" rel="noreferrer" className="mt-4 inline-flex rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white dark:bg-white dark:text-slate-950">
            Open NTES
          </a>
        </div>
      )}
      {payload && !statusUnavailable && !state.loading && (
        <div className="mt-6 grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5 dark:border-white/10 dark:bg-black/20">
            <div className="text-xs font-black uppercase text-slate-400">Currently at / latest report</div>
            <h3 className="mt-2 text-2xl font-black">{currentLocation}</h3>
            {payload?.meta && <TrustSummary meta={payload.meta} />}
            {latestStatusNote && latestStatusNote !== "--" && <div className="mt-3 rounded-2xl bg-white p-3 text-sm font-black dark:bg-white/8">{latestStatusNote}</div>}
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              {[
                ["Status", live?.status || live?.Status || "On route"],
                ["Delay", live?.delay || live?.DelayInArrival || "--"],
                ["Train", trainNo],
                ["Updated", live?.lastUpdate || live?.LastUpdate || live?.updatedAt || live?.LastUpdated || "Provider response"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl bg-white p-3 dark:bg-white/8">
                  <div className="text-[10px] font-black uppercase text-slate-400">{label}</div>
                  <div className="mt-1 font-black">{liveDisplayValue(value)}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/6">
            <div className="text-xs font-black uppercase text-slate-400">Returned route points</div>
            <div className="mt-4 max-h-96 space-y-2 overflow-auto pr-1">
              {route.map((stop: any, index: number) => (
                <div key={`${liveStopName(stop, index)}-${index}`} className="rounded-2xl bg-slate-50 p-3 text-sm font-bold dark:bg-black/20">
                  {liveStopName(stop, index)} · {liveStopTime(stop)}
                </div>
              ))}
              {!route?.length && <div className="rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-500 dark:bg-black/20 dark:text-slate-300">Provider returned live summary but no route timeline.</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
