"use client";

import React, { useState, useEffect, useMemo, useRef, FormEvent } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowDownUp,
  Loader2,
  Search,
  Zap,
  Train,
  Route,
  TrendingUp,
  Clock,
  IndianRupee,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ExternalLink,
} from "lucide-react";

import { ThemeToggle } from "@/components/theme-toggle";
import { softPanel, productBg } from "@/components/shared/styles";
import { stationLabelFromCode } from "@/lib/railway-intelligence";
import { StationAutocomplete, resolveStationInput, DateQuickField } from "@/components/shared/StationAutocomplete";
import { postJson } from "@/components/shared/api";
import { todayIso, timeAmPm, stationCompactLabel } from "@/components/shared/utils";
import { classOptions, quotaOptions } from "@/components/shared/constants";
import {
  trainNumberName,
  primaryClassCode,
  compactSeatText,
  compactFareText,
  liveFareText,
  availabilityTone,
  fareTone,
  durationToMinutes,
  splitTotalDuration,
  splitRouteStableKey,
  actualLegSourceStation,
  actualLegDestinationStation,
  classFareAmount,
  trainFareAmount,
  fareToNumber,
  estimatedFareAmount,
  formatFare,
  formatDurationLong,
  timeToMinutes,
  dedupeSplitRoutes,
  isSeatAvailable,
  RunningDaysStrip,
  fullStationLabelFromCode,
} from "@/components/shared/TrustSummary";

function cx(...parts: (string | false | undefined | null)[]) {
  return parts.filter(Boolean).join(" ");
}

const TRAFFIC_SCORE_LABELS = [
  "Low traffic","Moderate","High traffic","Very high","Peak demand",
];

function trafficScore(train: any): number {
  const dur = durationToMinutes(train.duration) || 999;
  const available = isSeatAvailable(train.availability);
  let score = 0;
  if (dur < 300) score += 3;
  else if (dur < 600) score += 2;
  else if (dur < 900) score += 1;
  if (available) score += 1;
  const trainType = String(train.trainType || train.trainName || "").toUpperCase();
  if (/VANDE|RAJDHANI|SHATABDI|DURONTO|GATIMAAN/.test(trainType)) score += 2;
  if (/EXPRESS|EXP/.test(trainType)) score += 1;
  return Math.min(score, 4);
}

function TrafficBar({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex gap-0.5">
        {[0,1,2,3,4].map((i) => (
          <div key={i} className={cx(
            "h-2 w-2 rounded-full transition-all",
            i <= score
              ? score >= 4 ? "bg-rose-500" : score >= 3 ? "bg-amber-500" : "bg-emerald-500"
              : "bg-slate-200 dark:bg-white/10"
          )} />
        ))}
      </div>
      <span className="text-[10px] font-black uppercase text-slate-500 dark:text-slate-400">
        {TRAFFIC_SCORE_LABELS[score]}
      </span>
    </div>
  );
}

function DirectTrainRow({ train, rank, classType }: { train: any; rank: number; classType: string }) {
  const [expanded, setExpanded] = useState(false);
  const score = trafficScore(train);
  const src = actualLegSourceStation(train) || train.source;
  const dst = actualLegDestinationStation(train) || train.destination;
  const fare = classType && classType !== "Any"
    ? classFareAmount(train, classType)
    : trainFareAmount(train);
  const fareText = fare ? `₹${fare.toLocaleString("en-IN")}` : compactFareText(liveFareText(train));
  const seatText = compactSeatText(train);
  const dur = durationToMinutes(train.duration);
  const durLabel = dur ? formatDurationLong(dur) : train.duration || "--";

  return (
    <article className={cx(softPanel("rounded-2xl overflow-hidden"), "transition-shadow hover:shadow-md")}>
      <div className="p-4">
        <div className="grid gap-3 sm:grid-cols-[auto_1fr_auto] sm:items-start">
          <div className="flex flex-col items-center gap-2 pt-1">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-sm font-black text-slate-700 dark:bg-white/10 dark:text-white">
              {rank}
            </span>
            <TrafficBar score={score} />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {train.trainType && (
                <span className="rounded-md bg-cyan-50 px-2 py-0.5 text-[10px] font-black uppercase text-cyan-800 dark:bg-cyan-300/12 dark:text-cyan-100">
                  {train.trainType}
                </span>
              )}
              <span className={cx("rounded-md border px-2 py-0.5 text-[10px] font-black", availabilityTone(seatText))}>
                {seatText}
              </span>
            </div>
            <h3 className="mt-1.5 text-lg font-black leading-tight">{trainNumberName(train)}</h3>
            <p className="mt-0.5 text-xs font-bold text-slate-500 dark:text-slate-400">
              {fullStationLabelFromCode(src)} → {fullStationLabelFromCode(dst)}
            </p>
            <RunningDaysStrip train={train} journeyDate="" compact />
          </div>
          <div className="grid grid-cols-3 gap-2 text-center min-w-[260px]">
            <div className="rounded-xl bg-slate-50 p-2 dark:bg-black/20">
              <div className="text-[9px] font-black uppercase text-slate-400">Departs</div>
              <div className="mt-0.5 text-xl font-black">{timeAmPm(train.departureTime)}</div>
              <div className="text-[10px] text-slate-500">{stationCompactLabel(src)}</div>
            </div>
            <div className="rounded-xl bg-slate-50 p-2 dark:bg-black/20 flex flex-col items-center justify-center">
              <div className="text-[9px] font-black uppercase text-slate-400">Duration</div>
              <div className="mt-0.5 text-sm font-black">{durLabel}</div>
              <div className="my-1 h-px w-full bg-gradient-to-r from-emerald-400 via-cyan-400 to-rose-400" />
            </div>
            <div className="rounded-xl bg-slate-50 p-2 dark:bg-black/20">
              <div className="text-[9px] font-black uppercase text-slate-400">Arrives</div>
              <div className="mt-0.5 text-xl font-black">{timeAmPm(train.arrivalTime)}</div>
              <div className="text-[10px] text-slate-500">{stationCompactLabel(dst)}</div>
            </div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <span className={cx("rounded-full border px-3 py-1 text-xs font-black", fareTone(fareText))}>
              {fareText || "Fare: check live"}
            </span>
            {primaryClassCode(train) && (
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-black text-slate-600 dark:border-white/10 dark:bg-white/8 dark:text-slate-300">
                {primaryClassCode(train)}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setExpanded((v) => !v)}
              className="flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-black text-slate-600 transition hover:border-cyan-300 hover:text-cyan-700 dark:border-white/10 dark:bg-white/8 dark:text-slate-200">
              {expanded ? <><span>Less</span><ChevronUp className="h-3 w-3" /></> : <><span>All classes</span><ChevronDown className="h-3 w-3" /></>}
            </button>
            <a href="https://www.irctc.co.in/nget/train-search" target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 rounded-full border border-cyan-300 bg-cyan-50 px-3 py-1.5 text-xs font-black text-cyan-800 transition hover:bg-cyan-100 dark:bg-cyan-300/12 dark:text-cyan-100">
              IRCTC <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
        {expanded && train.classAvailability && Object.keys(train.classAvailability).length > 0 && (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {Object.entries(train.classAvailability).map(([cls, rows]: [string, any]) => {
              const row = Array.isArray(rows) ? rows[0] : rows;
              const status = row?.text || row?.availabilityText || "";
              const clsFare = row?.fare ? `₹${row.fare}` : "";
              return (
                <div key={cls} className={cx("rounded-xl border p-2.5 text-center", availabilityTone(status))}>
                  <div className="text-xs font-black">{cls}</div>
                  {status && <div className="mt-0.5 text-[10px] font-bold">{status}</div>}
                  {clsFare && <div className="mt-0.5 text-[10px] font-black">{clsFare}</div>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </article>
  );
}

function SplitRow({ split, rank, classType }: { split: any; rank: number; classType: string }) {
  const leg1 = split.leg1 || {};
  const leg2 = split.leg2 || {};
  const hub = split.hubStation || actualLegDestinationStation(leg1) || actualLegSourceStation(leg2) || "";
  const totalDur = splitTotalDuration(split);
  const layover = split.layoverDuration || "--";
  const scopedClass = classType && classType !== "Any" ? classType.toUpperCase() : "";
  const l1Class = scopedClass || primaryClassCode(leg1);
  const l2Class = scopedClass || primaryClassCode(leg2);
  const estimatedFare = estimatedFareAmount(leg1, l1Class) + estimatedFareAmount(leg2, l2Class);
  const verifiedFare = fareToNumber(split.totalFare);
  const totalFareText = verifiedFare
    ? formatFare(split.totalFare)
    : estimatedFare > 0
    ? `~₹${estimatedFare.toLocaleString("en-IN")} est.`
    : "Fare unavailable";

  function LegMini({ leg, label }: { leg: any; label: string }) {
    const src = actualLegSourceStation(leg) || leg.source;
    const dst = actualLegDestinationStation(leg) || leg.destination;
    const seatText = compactSeatText(leg);
    const fareText = compactFareText(liveFareText(leg));
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-black/20">
        <div className="text-[10px] font-black uppercase text-slate-400">{label}</div>
        <div className="mt-1 truncate text-sm font-black">{trainNumberName(leg, "Train")}</div>
        <div className="mt-0.5 text-[11px] font-bold text-slate-500 dark:text-slate-400">
          {stationCompactLabel(src)} → {stationCompactLabel(dst)}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-1 text-center">
          <div className="rounded-lg bg-white p-1.5 dark:bg-white/5">
            <div className="text-[9px] uppercase text-slate-400">Dep</div>
            <div className="text-sm font-black">{timeAmPm(leg.departureTime)}</div>
          </div>
          <div className="rounded-lg bg-white p-1.5 dark:bg-white/5">
            <div className="text-[9px] uppercase text-slate-400">Arr</div>
            <div className="text-sm font-black">{timeAmPm(leg.arrivalTime)}</div>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <span className={cx("rounded-md border px-2 py-0.5 text-[10px] font-black", availabilityTone(seatText))}>{seatText}</span>
          <span className={cx("rounded-md border px-2 py-0.5 text-[10px] font-black", fareTone(fareText))}>{fareText}</span>
        </div>
      </div>
    );
  }

  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#081321]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-white/10 dark:bg-white/[0.03]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-600 text-xs font-black text-white">{rank}</span>
          <span className="rounded-full bg-violet-100 px-2.5 py-1 text-[10px] font-black text-violet-800 dark:bg-violet-300/12 dark:text-violet-100">Split Journey</span>
          <span className="text-sm font-black">
            {stationCompactLabel(actualLegSourceStation(leg1) || leg1.source)} →{" "}
            <span className="text-cyan-600 dark:text-cyan-300">{stationCompactLabel(hub)}</span> →{" "}
            {stationCompactLabel(actualLegDestinationStation(leg2) || leg2.destination)}
          </span>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 font-black dark:border-white/10 dark:bg-white/8">Total: {totalDur}</span>
          <span className="rounded-full bg-amber-100 px-2.5 py-1 font-black text-amber-900 dark:bg-amber-300/12 dark:text-amber-100">Layover: {layover}</span>
          <span className={cx("rounded-full border px-2.5 py-1 font-black", fareTone(totalFareText))}>{totalFareText}</span>
        </div>
      </div>
      <div className="grid gap-3 p-4 sm:grid-cols-2">
        <LegMini leg={leg1} label="Leg 1" />
        <LegMini leg={leg2} label="Leg 2" />
      </div>
      <div className="mx-4 mb-4 rounded-xl border border-amber-300/35 bg-amber-50 px-3 py-2 text-[11px] font-black text-amber-900 dark:border-amber-300/20 dark:bg-amber-300/10 dark:text-amber-100">
        Transfer at {fullStationLabelFromCode(hub)} · Confirm platform on station boards before boarding
      </div>
    </article>
  );
}

function StatsBar({ directCount, splitCount, loading, splitLoading, classType }: {
  directCount: number; splitCount: number; loading: boolean; splitLoading: boolean; classType: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {[
        { icon: <Train className="h-4 w-4" />, label: "Direct Trains", value: loading ? "—" : String(directCount), color: "text-cyan-600 dark:text-cyan-300", bg: "bg-cyan-50 dark:bg-cyan-300/10" },
        { icon: <Route className="h-4 w-4" />, label: "Split Journeys", value: splitLoading ? "—" : String(splitCount), color: "text-violet-600 dark:text-violet-300", bg: "bg-violet-50 dark:bg-violet-300/10" },
        { icon: <Zap className="h-4 w-4" />, label: "Class Filter", value: classType || "Any", color: "text-emerald-600 dark:text-emerald-300", bg: "bg-emerald-50 dark:bg-emerald-300/10" },
        { icon: <TrendingUp className="h-4 w-4" />, label: "Total Options", value: loading || splitLoading ? "…" : String(directCount + splitCount), color: "text-amber-600 dark:text-amber-300", bg: "bg-amber-50 dark:bg-amber-300/10" },
      ].map((stat) => (
        <div key={stat.label} className={cx(softPanel("rounded-2xl p-4"), "flex flex-col gap-1")}>
          <div className={cx("flex items-center gap-1.5 text-xs font-black", stat.color)}>{stat.icon}{stat.label}</div>
          <div className="text-2xl font-black">{stat.value}</div>
        </div>
      ))}
    </div>
  );
}

type SortKey = "best" | "fastest" | "cheapest" | "earliest";

function SortBar({ sort, setSort }: { sort: SortKey; setSort: (s: SortKey) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {(["best","fastest","cheapest","earliest"] as SortKey[]).map((key) => (
        <button key={key} type="button" onClick={() => setSort(key)}
          className={cx("rounded-full border px-4 py-2 text-xs font-black transition capitalize",
            sort === key
              ? "border-slate-950 bg-slate-950 text-white dark:border-white dark:bg-white dark:text-slate-950"
              : "border-slate-200 bg-white text-slate-500 hover:border-slate-400 dark:border-white/10 dark:bg-white/6 dark:text-slate-300"
          )}>
          {key}
        </button>
      ))}
    </div>
  );
}

export function GodModeWorkspace() {
  const [source, setSource] = useState("");
  const [destination, setDestination] = useState("");
  const [sourceQuery, setSourceQuery] = useState("");
  const [destinationQuery, setDestinationQuery] = useState("");
  const [date, setDate] = useState(todayIso());
  const [classType, setClassType] = useState("3A");
  const [quota, setQuota] = useState("GN");
  const [sort, setSort] = useState<SortKey>("best");
  const [hasSearched, setHasSearched] = useState(false);
  const [searchKey, setSearchKey] = useState("");
  const lastKey = useRef("");

  const [state, setState] = useState<{
    loading: boolean; splitLoading: boolean; error: string; trains: any[]; splits: any[];
  }>({ loading: false, splitLoading: false, error: "", trains: [], splits: [] });

  useEffect(() => {
    function sync() { setSearchKey(window.location.search); }
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  useEffect(() => {
    const key = searchKey || window.location.search;
    if (!key || lastKey.current === key) return;
    lastKey.current = key;
    const p = new URLSearchParams(key);
    const rawSrc = p.get("from") || p.get("source") || "";
    const rawDst = p.get("to") || p.get("destination") || "";
    if (!rawSrc || !rawDst) return;
    const s = resolveStationInput("", rawSrc) || rawSrc.toUpperCase();
    const d = resolveStationInput("", rawDst) || rawDst.toUpperCase();
    const dt = p.get("date") || todayIso();
    const cl = p.get("class") || "3A";
    const qt = (p.get("quota") || "GN").toUpperCase();
    setSource(s); setSourceQuery(stationLabelFromCode(s));
    setDestination(d); setDestinationQuery(stationLabelFromCode(d));
    setDate(dt); setClassType(cl); setQuota(qt);
    window.setTimeout(() => runSearch(undefined, { source: s, destination: d, date: dt, classType: cl, quota: qt }), 80);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchKey]);

  async function runSearch(e?: FormEvent, override?: { source: string; destination: string; date: string; classType: string; quota: string }) {
    e?.preventDefault();
    const src = override?.source || resolveStationInput(source, sourceQuery) || source;
    const dst = override?.destination || resolveStationInput(destination, destinationQuery) || destination;
    const dt = override?.date || date;
    const cl = override?.classType || classType;
    const qt = override?.quota || quota;
    if (!src || !dst) {
      setState((s) => ({ ...s, error: "Choose a source and destination.", loading: false, splitLoading: false }));
      return;
    }
    setHasSearched(true);
    setState({ loading: true, splitLoading: true, error: "", trains: [], splits: [] });
    if (typeof window !== "undefined") {
      const params = new URLSearchParams({ from: src, to: dst, date: dt, class: cl, quota: qt });
      window.history.pushState(null, "", `/godmode?${params.toString()}`);
    }
    const payload = { source: src, destination: dst, date: dt, classType: cl, quota: qt };
    const directP = postJson<any>("/api/train-between", payload)
      .then((res) => { setState((s) => ({ ...s, loading: false, trains: res.trains || [], error: "" })); })
      .catch((err) => { setState((s) => ({ ...s, loading: false, error: err?.message || "Direct search failed." })); });
    const splitP = postJson<any>("/api/search-split", { ...payload, directTrains: [], mode: "quick" })
      .then((res) => { setState((s) => ({ ...s, splitLoading: false, splits: res?.splitRoutes || res?.data?.splitRoutes || [] })); })
      .catch(() => { setState((s) => ({ ...s, splitLoading: false })); });
    await Promise.allSettled([directP, splitP]);
  }

  const sortedTrains = useMemo(() => {
    const sc = classType && classType !== "Any" ? classType.toUpperCase() : "";
    return [...state.trains].sort((a, b) => {
      if (sort === "fastest") return (durationToMinutes(a.duration) || 9999) - (durationToMinutes(b.duration) || 9999);
      if (sort === "cheapest") {
        const fa = sc ? classFareAmount(a, sc) : trainFareAmount(a);
        const fb = sc ? classFareAmount(b, sc) : trainFareAmount(b);
        return (fa || Infinity) - (fb || Infinity);
      }
      if (sort === "earliest") return timeToMinutes(a.departureTime) - timeToMinutes(b.departureTime);
      return trafficScore(b) - trafficScore(a) || (durationToMinutes(a.duration) || 9999) - (durationToMinutes(b.duration) || 9999);
    });
  }, [state.trains, sort, classType]);

  const sortedSplits = useMemo(() => {
    const sc = classType && classType !== "Any" ? classType.toUpperCase() : "";
    return dedupeSplitRoutes(state.splits).sort((a, b) => {
      if (sort === "fastest") return (durationToMinutes(splitTotalDuration(a)) || 9999) - (durationToMinutes(splitTotalDuration(b)) || 9999);
      if (sort === "cheapest") {
        const l1 = sc || primaryClassCode(a.leg1); const l2 = sc || primaryClassCode(a.leg2);
        const l1b = sc || primaryClassCode(b.leg1); const l2b = sc || primaryClassCode(b.leg2);
        return (estimatedFareAmount(a.leg1, l1) + estimatedFareAmount(a.leg2, l2) || Infinity) - (estimatedFareAmount(b.leg1, l1b) + estimatedFareAmount(b.leg2, l2b) || Infinity);
      }
      if (sort === "earliest") return timeToMinutes(a.leg1?.departureTime) - timeToMinutes(b.leg1?.departureTime);
      return (Number(b?.score || 0) - Number(a?.score || 0)) || (durationToMinutes(splitTotalDuration(a)) || 9999) - (durationToMinutes(splitTotalDuration(b)) || 9999);
    }).slice(0, 15);
  }, [state.splits, sort, classType]);

  return (
    <div className={productBg()}>
      <div className="border-b border-slate-200 bg-white/80 backdrop-blur-sm dark:border-white/10 dark:bg-[#050816]/80">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-sm font-black text-slate-400 transition hover:text-slate-700 dark:hover:text-white">RailRoute</Link>
            <span className="text-slate-300 dark:text-white/20">/</span>
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-500" />
              <span className="text-sm font-black text-amber-600 dark:text-amber-400">GodMode</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/trains" className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-700 transition hover:border-cyan-300 dark:border-white/10 dark:bg-white/8 dark:text-slate-200">
              Standard view
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 pb-20 pt-8 sm:px-6">
        <div className="mb-8">
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-amber-500" />
            <span className="text-xs font-black uppercase tracking-widest text-amber-600 dark:text-amber-400">GodMode</span>
          </div>
          <h1 className="mt-2 text-4xl font-black tracking-tight">
            Full route intelligence.
            <span className="text-slate-400"> No caps. No filters.</span>
          </h1>
          <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">
            Every direct train returned by the provider, ranked by traffic + suitability, plus top 15 split journeys. Zero truncation.
          </p>
        </div>

        <div className={softPanel("rounded-[28px] p-5 mb-6")}>
          <form onSubmit={runSearch}>
            <div className="grid gap-3 lg:grid-cols-[1fr_auto_1fr]">
              <StationAutocomplete label="From" placeholder="Starting Point" example="" value={source} setValue={setSource} query={sourceQuery} setQuery={setSourceQuery} />
              <button type="button" onClick={() => { const a = source; const aq = sourceQuery; setSource(destination); setSourceQuery(destinationQuery); setDestination(a); setDestinationQuery(aq); }}
                className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-white text-cyan-700 dark:border-white/10 dark:bg-white/8 dark:text-cyan-100">
                <ArrowDownUp className="h-5 w-5" />
              </button>
              <StationAutocomplete label="To" placeholder="End Point" example="" value={destination} setValue={setDestination} query={destinationQuery} setQuery={setDestinationQuery} />
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_160px_200px_auto]">
              <DateQuickField date={date} setDate={setDate} />
              <label className="block">
                <span className="mb-2 block text-[11px] font-black uppercase text-slate-500 dark:text-slate-400">Class</span>
                <select value={classType} onChange={(e) => setClassType(e.target.value)}
                  className="h-14 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold dark:border-white/10 dark:bg-[#111827] dark:text-white">
                  {["Any", ...classOptions].map((c) => <option key={c}>{c}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-2 block text-[11px] font-black uppercase text-slate-500 dark:text-slate-400">Quota</span>
                <select value={quota} onChange={(e) => setQuota(e.target.value)}
                  className="h-14 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold dark:border-white/10 dark:bg-[#111827] dark:text-white">
                  {quotaOptions.map((q) => <option key={q.code} value={q.code}>{q.code} · {q.label}</option>)}
                </select>
              </label>
              <button className="mt-6 flex h-14 items-center justify-center gap-2 rounded-2xl bg-amber-500 px-8 text-sm font-black text-white hover:bg-amber-600 transition">
                {state.loading || state.splitLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                GodSearch
              </button>
            </div>
          </form>
        </div>

        {state.error && (
          <div className="mb-4 rounded-2xl border border-rose-300/40 bg-rose-50 p-4 font-bold text-rose-700 dark:bg-rose-400/10 dark:text-rose-100">{state.error}</div>
        )}

        {hasSearched && (
          <>
            <StatsBar directCount={sortedTrains.length} splitCount={sortedSplits.length} loading={state.loading} splitLoading={state.splitLoading} classType={classType} />
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <SortBar sort={sort} setSort={setSort} />
              {(state.loading || state.splitLoading) && (
                <div className="flex items-center gap-2 rounded-full bg-amber-50 px-4 py-2 text-xs font-black text-amber-700 dark:bg-amber-300/10 dark:text-amber-200">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {state.loading ? "Scanning direct trains…" : "Finding split journeys…"}
                </div>
              )}
            </div>

            <div className="mt-6">
              <div className="mb-4 flex items-center gap-3">
                <Train className="h-5 w-5 text-cyan-600 dark:text-cyan-300" />
                <h2 className="text-xl font-black">Direct Trains {!state.loading && <span className="text-base font-black text-slate-400">({sortedTrains.length} total)</span>}</h2>
              </div>
              {state.loading && sortedTrains.length === 0 ? (
                <div className={softPanel("rounded-2xl p-8 text-center")}><Loader2 className="mx-auto h-8 w-8 animate-spin text-cyan-500" /><p className="mt-3 font-bold text-slate-500">Scanning direct train inventory…</p></div>
              ) : sortedTrains.length === 0 ? (
                <div className={softPanel("rounded-2xl p-8 text-center")}><AlertTriangle className="mx-auto h-8 w-8 text-amber-500" /><p className="mt-3 font-black text-lg">No direct trains found.</p></div>
              ) : (
                <div className="space-y-3">
                  {sortedTrains.map((train, i) => (
                    <DirectTrainRow key={`${train.trainNo}-${train.source}-${train.destination}`} train={train} rank={i + 1} classType={classType} />
                  ))}
                </div>
              )}
            </div>

            <div className="mt-10">
              <div className="mb-4 flex items-center gap-3">
                <Route className="h-5 w-5 text-violet-600 dark:text-violet-300" />
                <h2 className="text-xl font-black">Top 15 Split Journeys {!state.splitLoading && <span className="text-base font-black text-slate-400">({sortedSplits.length} found)</span>}</h2>
              </div>
              {state.splitLoading && sortedSplits.length === 0 ? (
                <div className={softPanel("rounded-2xl p-8 text-center")}><Loader2 className="mx-auto h-8 w-8 animate-spin text-violet-500" /><p className="mt-3 font-bold text-slate-500">Finding split journeys via major hubs…</p></div>
              ) : sortedSplits.length === 0 ? (
                <div className={softPanel("rounded-2xl p-8 text-center")}><AlertTriangle className="mx-auto h-8 w-8 text-amber-500" /><p className="mt-3 font-black text-lg">No split journeys found.</p></div>
              ) : (
                <div className="space-y-3">
                  {sortedSplits.map((split, i) => (
                    <SplitRow key={splitRouteStableKey(split) || `split-${i}`} split={split} rank={i + 1} classType={classType} />
                  ))}
                </div>
              )}
            </div>

            {!state.loading && !state.splitLoading && (sortedTrains.length > 0 || sortedSplits.length > 0) && (
              <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs font-semibold leading-6 text-slate-500 dark:border-white/10 dark:bg-white/4 dark:text-slate-400">
                GodMode shows all direct trains without capping, and top 15 split journeys. Fare and availability may be from schedule cache — verify on IRCTC before booking. Split journeys require two separate tickets.
              </div>
            )}
          </>
        )}

        {!hasSearched && (
          <div className={softPanel("rounded-[28px] p-10 text-center mt-4")}>
            <Zap className="mx-auto h-12 w-12 text-amber-400" />
            <h2 className="mt-4 text-3xl font-black">Ready to cook.</h2>
            <p className="mt-2 text-sm font-semibold text-slate-500 dark:text-slate-400">
              Enter source + destination + date. GodMode returns every direct train and top 15 splits — no limits.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
