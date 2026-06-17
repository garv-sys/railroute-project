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
} from "../shared/utils";
import { LoadingBlock } from "../shared/LoadingBlock";
import { TrustSummary, QuotaTimingNotice, RunningDaysStrip, platformDisplay } from "../shared/TrustSummary";
import { StationAutocomplete, RelatedStationChips, QuickSearch } from "../shared/StationAutocomplete";
import { ProductShell } from "../layout/ProductShell";
import { ToolHeader } from "../layout/ToolHeader";
import { CoachExplorer } from "./CoachExplorer";
import { BookingWorkspace } from "./BookingWorkspace";


export function TrainSearchPanel({ compact = false }: { compact?: boolean }) {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<{ loading: boolean; error: string; trains: any[] }>({ loading: false, error: "", trains: [] });

  async function search(event?: FormEvent, forcedQuery?: string) {
    event?.preventDefault();
    const searchQuery = forcedQuery || query;
    if (!searchQuery.trim()) {
      setState({ loading: false, error: "Enter a train number or train name.", trains: [] });
      return;
    }
    setState({ loading: true, error: "", trains: [] });
    try {
      const data = await postJson<any>("/api/train-search", { query: searchQuery });
      setState({ loading: false, error: "", trains: data.trains || [] });
    } catch (error) {
      setState({ loading: false, error: error instanceof Error ? error.message : "Train lookup failed.", trains: [] });
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initialQuery = params.get("query");
    if (initialQuery) {
      setQuery(initialQuery);
      window.setTimeout(() => search(undefined, initialQuery), 50);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={softPanel(`rounded-[30px] p-5 ${compact ? "" : "mx-auto max-w-7xl"}`)}>
      <form onSubmit={search} className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Train className="pointer-events-none absolute left-4 top-4 h-4 w-4 text-cyan-600 dark:text-cyan-200" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Train number or name, e.g. 12395, Rajdhani, Ziyarat Express" className="h-13 w-full rounded-2xl border border-slate-200 bg-white pl-11 pr-4 text-sm font-bold outline-none focus:border-cyan-400 dark:border-white/10 dark:bg-white/8 dark:text-white dark:placeholder:text-slate-500" />
        </div>
        <button className="flex h-13 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-6 text-sm font-black text-white dark:bg-white dark:text-slate-950">
          <span className="flex h-4 w-4 items-center justify-center" aria-hidden="true">
            {state.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </span>
          <span>Search Train</span>
        </button>
      </form>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="text-xs font-black uppercase text-slate-400">Quick picks</span>
        {popularTrainQuickPicks.map((item) => (
          <button key={item} type="button" onClick={() => { setQuery(item); void search(undefined, item); }} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black text-slate-700 transition hover:border-cyan-300 hover:text-cyan-700 dark:border-white/10 dark:bg-white/8 dark:text-slate-200">
            {item}
          </button>
        ))}
      </div>
      {state.error && <p className="mt-4 rounded-2xl border border-rose-300/40 bg-rose-50 p-3 text-sm font-bold text-rose-700 dark:bg-rose-400/10 dark:text-rose-100">{state.error}</p>}
      <div className="mt-5 space-y-5">
        {state.trains.map((train) => <FullTrainDetails key={train.trainNo} train={train} />)}
      </div>
    </div>
  );
}

export function FullTrainDetails({ train }: { train: any }) {
  const route = train.route || [];
  return (
    <article className="overflow-hidden rounded-[28px] border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-black/20">
      <div className="grid gap-4 p-5 md:grid-cols-[1fr_auto] md:items-start">
        <div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-cyan-100 px-3 py-1 text-[11px] font-black text-cyan-800 dark:bg-cyan-300/12 dark:text-cyan-100">{train.type || "Express"}</span>
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-black text-emerald-800 dark:bg-emerald-300/12 dark:text-emerald-100">{(train.runningDays || ["Daily"]).join(" · ")}</span>
            <span className="rounded-full bg-slate-200 px-3 py-1 text-[11px] font-black text-slate-700 dark:bg-white/10 dark:text-slate-200">{train.dataSource || "IRCTC-compatible schedule"}</span>
          </div>
          <h2 className="mt-4 text-2xl font-black">{train.trainName}</h2>
          <p className="mt-1 text-sm font-bold text-slate-500 dark:text-slate-400">#{train.trainNo} · {stationLabelFromCode(train.source)} to {stationLabelFromCode(train.destination)}</p>
        </div>
        <div className="space-y-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm font-bold dark:border-white/10 dark:bg-white/8">
            Complete route · {route.length} stops
          </div>
          <div className="flex items-center justify-center rounded-2xl border border-cyan-300 bg-cyan-50 px-4 py-3 text-sm font-black text-cyan-800 dark:bg-cyan-300/12 dark:text-cyan-100">
            Complete timetable below
          </div>
        </div>
      </div>
      <div className="border-t border-slate-200 p-5 dark:border-white/10">
        <div className="space-y-0">
          {route.map((stop: any, index: number) => {
            return (
              <div key={`${stop.code}-${index}`} className="grid grid-cols-[auto_1fr] gap-4">
                <div className="flex flex-col items-center">
                  <span className={`flex h-8 w-8 items-center justify-center rounded-full border ${index === 0 ? "border-emerald-400 bg-emerald-100 text-emerald-700 dark:bg-emerald-400/12 dark:text-emerald-100" : index === route.length - 1 ? "border-rose-400 bg-rose-100 text-rose-700 dark:bg-rose-400/12 dark:text-rose-100" : "border-cyan-400 bg-cyan-100 text-cyan-700 dark:bg-cyan-400/12 dark:text-cyan-100"}`}>
                    <Circle className="h-2.5 w-2.5 fill-current" />
                  </span>
                  {index < route.length - 1 && <span className="h-20 w-px bg-slate-200 dark:bg-white/12" />}
                </div>
                <div className="pb-6">
                  <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/6 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="text-base font-black">{stop.stationName || stationLabelFromCode(stop.code, false)} <span className="text-slate-400">— {stop.code}</span></div>
                      <div className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">
                        {stop.state || "India"} · {platformDisplay(stop)} · {stop.distance} km
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-sm">
                      <div><div className="text-[10px] font-black uppercase text-slate-400">Arr</div><div className="font-black">{stop.arrival}</div></div>
                      <div><div className="text-[10px] font-black uppercase text-slate-400">Dep</div><div className="font-black">{stop.departure}</div></div>
                      <div><div className="text-[10px] font-black uppercase text-slate-400">Halt</div><div className="font-black">{stop.halt}</div></div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </article>
  );
}
