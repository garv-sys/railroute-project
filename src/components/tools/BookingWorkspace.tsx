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
import { TrustSummary, QuotaTimingNotice, RunningDaysStrip } from "../shared/TrustSummary";
import { StationAutocomplete, RelatedStationChips, QuickSearch } from "../shared/StationAutocomplete";
import { ProductShell } from "../layout/ProductShell";
import { ToolHeader } from "../layout/ToolHeader";
import { CoachExplorer } from "./CoachExplorer";
import { TrainResultsWorkspace } from "./TrainResultsWorkspace";
import { FareTool } from "./FareTool";
import { PnrTool } from "./PnrTool";


export function BookingWorkspace() {
  return (
    <div className="space-y-8">
      <section className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className={softPanel("rounded-[30px] p-6")}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-xs font-black uppercase text-cyan-700 dark:text-cyan-200">Booking flow</div>
              <h2 className="mt-2 text-3xl font-black">Plan here, confirm on IRCTC.</h2>
              <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">
                Use the same route search, split planner, fare enquiry and PNR tools in order. RailRoute shows provider-returned data and sends final ticket confirmation to IRCTC.
              </p>
            </div>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-4">
            {[
              ["1", "Search", "Pick route, date and class."],
              ["2", "Compare", "Check direct and split options."],
              ["3", "Verify fare", "Confirm selected-date provider fare."],
              ["4", "Book", "Complete payment on IRCTC."],
            ].map(([step, title, body]) => (
              <div key={step} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-black/20">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-cyan-100 text-sm font-black text-cyan-800 dark:bg-cyan-300/15 dark:text-cyan-100">{step}</div>
                <div className="mt-3 font-black">{title}</div>
                <p className="mt-1 text-xs font-semibold leading-5 text-slate-500 dark:text-slate-400">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <TrainResultsWorkspace />
      <section className="grid gap-6 px-4 pb-16 sm:px-6 xl:grid-cols-2">
        <FareTool />
        <PnrTool />
      </section>
    </div>
  );
}

export function formatHealthMs(value: unknown) {
  const ms = Number(value);
  if (!Number.isFinite(ms) || ms <= 0) return "0s";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const seconds = Math.ceil(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}

export function healthNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString("en-IN") : "0";
}

export function HealthMetricCard({ label, value, detail, tone = "slate" }: { label: string; value: string; detail?: string; tone?: "slate" | "green" | "amber" | "rose" | "cyan" }) {
  const tones = {
    slate: "border-slate-200 bg-white dark:border-white/10 dark:bg-white/6",
    green: "border-emerald-300/40 bg-emerald-50 text-emerald-950 dark:bg-emerald-300/10 dark:text-emerald-50",
    amber: "border-amber-300/40 bg-amber-50 text-amber-950 dark:bg-amber-300/10 dark:text-amber-50",
    rose: "border-rose-300/40 bg-rose-50 text-rose-950 dark:bg-rose-300/10 dark:text-rose-50",
    cyan: "border-cyan-300/40 bg-cyan-50 text-cyan-950 dark:bg-cyan-300/10 dark:text-cyan-50",
  };
  return (
    <div className={`rounded-3xl border p-4 ${tones[tone]}`}>
      <div className="text-[11px] font-black uppercase opacity-70">{label}</div>
      <div className="mt-2 text-3xl font-black">{value}</div>
      {detail && <div className="mt-2 text-xs font-bold leading-5 opacity-75">{detail}</div>}
    </div>
  );
}

export function ProviderHealthDashboard() {
  const [state, setState] = useState<{ loading: boolean; error: string; data: any | null }>({ loading: true, error: "", data: null });

  async function refresh() {
    setState((current) => ({ ...current, loading: true, error: "" }));
    try {
      const response = await fetch("/api/provider-health", { cache: "no-store" });
      const data = await response.json();
      setState({ loading: false, error: data?.error || "", data: data?.data || data });
    } catch (error) {
      setState({ loading: false, error: error instanceof Error ? error.message : "Provider health unavailable", data: null });
    }
  }

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  const data = state.data || {};
  const cache = data.cache || {};
  const usage = data.usage || cache.usage || {};
  const totals = usage.totals || {};
  const byKind = usage.byKind || {};
  const windows = usage.windows || {};
  const recent = Array.isArray(usage.recent) ? usage.recent : [];
  const cacheGroups: Array<[string, any]> = [
    ["Train list", cache.trainList],
    ["Availability", cache.availability],
    ["Schedule/PNR/live", cache.general],
  ];
  const queueGroups: Array<[string, any]> = [
    ["Train list", cache.queues?.trainList],
    ["Availability", cache.queues?.availability],
  ];
  const qaDate = todayIso(14); // always "2 weeks from today" instead of a date that goes stale
  const qaRoutes = [
    ["PNBE → JP", "PNBE", "JP"],
    ["PNBE → MAS", "PNBE", "MAS"],
    ["PNBE → SBC", "PNBE", "SBC"],
    ["PNBE → BHL", "PNBE", "BHL"],
    ["CKP → JP", "CKP", "JP"],
    ["NDLS → MAS", "NDLS", "MAS"],
    ["NDLS → SBC", "NDLS", "SBC"],
    ["GHY → TVC", "GHY", "TVC"],
    ["PNBE → GHY", "PNBE", "GHY"],
    ["PNBE → MMCT", "PNBE", "MMCT"],
  ];

  return (
    <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <DataBadge type="LIVE" label="No provider call on refresh" />
          <h2 className="mt-3 text-3xl font-black">Operating dashboard</h2>
          <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">
            Health reads local counters, queues, cooldowns and caches. It never spends an IRCTC lookup just to render this page.
          </p>
        </div>
        <button type="button" onClick={() => void refresh()} disabled={state.loading} className="inline-flex h-12 items-center gap-2 rounded-2xl border border-cyan-300 bg-cyan-50 px-4 text-sm font-black text-cyan-800 disabled:cursor-wait disabled:opacity-70 dark:bg-cyan-300/12 dark:text-cyan-100">
          {state.loading && <Loader2 className="h-4 w-4 animate-spin" />}
          Refresh health
        </button>
      </div>

      {state.error && (
        <div className="mt-5 rounded-3xl border border-rose-300/40 bg-rose-50 p-4 text-sm font-bold text-rose-800 dark:bg-rose-300/10 dark:text-rose-100">
          {state.error}
        </div>
      )}

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <HealthMetricCard label="Provider calls tracked" value={healthNumber(totals.providerCalls)} detail="Real provider attempts in this server instance." tone="cyan" />
        <HealthMetricCard label="Guarded calls" value={healthNumber(totals.guarded)} detail="Calls blocked by per-minute protection." tone={totals.guarded ? "amber" : "green"} />
        <HealthMetricCard label="Failures/rate limits" value={healthNumber(totals.failures)} detail="Provider failures plus rate-limit signals." tone={totals.failures ? "rose" : "green"} />
        <HealthMetricCard label="Checked at" value={data.checkedAt ? new Date(data.checkedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "--"} detail="Auto-refreshes every 15 seconds." />
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className={softPanel("rounded-[30px] p-5")}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-black uppercase text-cyan-700 dark:text-cyan-200">Per-minute guardrails</div>
              <h3 className="mt-1 text-xl font-black">Usage window by provider call type</h3>
            </div>
            <span className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-black text-slate-500 dark:border-white/10 dark:bg-white/6 dark:text-slate-300">
              High limits, still protected
            </span>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {Object.entries(windows).map(([kind, window]: [string, any]) => {
              const used = Number(window?.used || 0);
              const limit = Number(window?.limit || 1);
              const pct = Math.min(100, Math.round((used / Math.max(1, limit)) * 100));
              const stats = byKind[kind] || {};
              return (
                <div key={kind} className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-black/20">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-black capitalize">{kind.replace("-", " ")}</div>
                    <div className="text-xs font-black text-slate-500">{healthNumber(used)} / {healthNumber(limit)}</div>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
                    <div className={`h-full rounded-full ${pct > 80 ? "bg-rose-500" : pct > 55 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${pct}%` }} />
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                    <span>OK {healthNumber(stats.success)}</span>
                    <span>Fail {healthNumber((stats.failed || 0) + (stats.rateLimited || 0))}</span>
                    <span>Reset {formatHealthMs(window?.resetsInMs)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className={softPanel("rounded-[30px] p-5")}>
          <div className="text-[11px] font-black uppercase text-cyan-700 dark:text-cyan-200">Estimated burn</div>
          <h3 className="mt-1 text-xl font-black">What one heavy search can use</h3>
          <div className="mt-4 space-y-3 text-sm font-bold leading-6 text-slate-600 dark:text-slate-300">
            <div className="rounded-2xl bg-slate-50 p-3 dark:bg-black/20">Direct search: 1 train-list call, then one availability/fare call per selected train/class that gets hydrated.</div>
            <div className="rounded-2xl bg-slate-50 p-3 dark:bg-black/20">Long split search: planner scans hub legs, then verifies up to 16 split routes immediately and tops up toward 20 live-backed routes.</div>
            <div className="rounded-2xl bg-slate-50 p-3 dark:bg-black/20">Cache protection: train list 5 min, fare/schedule longer, selected-date availability max 60 sec.</div>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <div className={softPanel("rounded-[30px] p-5")}>
          <div className="text-[11px] font-black uppercase text-cyan-700 dark:text-cyan-200">Cache and queues</div>
          <h3 className="mt-1 text-xl font-black">Current backend pressure</h3>
          <div className="mt-4 grid gap-3">
            {cacheGroups.map(([label, stats]: [string, any]) => (
              <div key={label} className="grid gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs font-bold text-slate-500 dark:border-white/10 dark:bg-black/20 dark:text-slate-400 sm:grid-cols-4">
                <span className="font-black text-slate-900 dark:text-white">{label}</span>
                <span>Entries {healthNumber(stats?.entries)}</span>
                <span>Hits {healthNumber(stats?.hits)} / Misses {healthNumber(stats?.misses)}</span>
                <span>In-flight {healthNumber(stats?.inFlight)}</span>
              </div>
            ))}
            {queueGroups.map(([label, queue]: [string, any]) => (
              <div key={`${label}-queue`} className="grid gap-2 rounded-2xl border border-cyan-300/30 bg-cyan-50 p-3 text-xs font-bold text-cyan-900 dark:bg-cyan-300/10 dark:text-cyan-100 sm:grid-cols-4">
                <span className="font-black">{label} queue</span>
                <span>Running {healthNumber(queue?.running)}</span>
                <span>Queued {healthNumber(queue?.queued)}</span>
                <span>Concurrency {healthNumber(queue?.maxConcurrent)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className={softPanel("rounded-[30px] p-5")}>
          <div className="text-[11px] font-black uppercase text-cyan-700 dark:text-cyan-200">Route QA matrix</div>
          <h3 className="mt-1 text-xl font-black">Tap-through routes to test after deploy</h3>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {qaRoutes.map(([label, from, to]) => (
              <Link key={label} href={`/trains?from=${from}&to=${to}&date=${qaDate}&class=3A&quota=GN`} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-black text-slate-700 transition hover:border-cyan-300 hover:text-cyan-700 dark:border-white/10 dark:bg-black/20 dark:text-slate-200">
                {label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className={softPanel("mt-5 rounded-[30px] p-5")}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-black uppercase text-cyan-700 dark:text-cyan-200">Recent provider events</div>
            <h3 className="mt-1 text-xl font-black">Last {recent.length} tracked calls</h3>
          </div>
          <span className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-black text-slate-500 dark:border-white/10 dark:bg-white/6 dark:text-slate-300">
            Server-memory telemetry
          </span>
        </div>
        <div className="mt-4 overflow-x-auto">
          <div className="min-w-[760px] divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 text-sm dark:divide-white/10 dark:border-white/10">
            <div className="grid grid-cols-[0.8fr_1.4fr_0.8fr_0.8fr_1.4fr] bg-slate-50 px-4 py-3 text-[11px] font-black uppercase text-slate-500 dark:bg-white/6 dark:text-slate-300">
              <span>Kind</span><span>Request</span><span>Status</span><span>Duration</span><span>Time/error</span>
            </div>
            {recent.length ? recent.slice(0, 24).map((event: any) => (
              <div key={event.id} className="grid grid-cols-[0.8fr_1.4fr_0.8fr_0.8fr_1.4fr] px-4 py-3 text-xs font-bold text-slate-600 dark:text-slate-300">
                <span className="font-black capitalize">{String(event.kind || "").replace("-", " ")}</span>
                <span className="truncate" title={event.label}>{event.label}</span>
                <span className={`font-black ${event.status === "success" ? "text-emerald-600 dark:text-emerald-300" : event.status === "guarded" || event.status === "rate_limited" ? "text-amber-600 dark:text-amber-300" : "text-rose-600 dark:text-rose-300"}`}>{event.status}</span>
                <span>{formatHealthMs(event.durationMs)}</span>
                <span className="truncate" title={event.error || event.timestamp}>{event.error || new Date(event.timestamp).toLocaleTimeString("en-IN")}</span>
              </div>
            )) : (
              <div className="px-4 py-6 text-sm font-bold text-slate-500 dark:text-slate-300">No provider calls tracked in this server instance yet.</div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
