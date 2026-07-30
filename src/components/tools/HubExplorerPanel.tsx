"use client";

import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Train,
  ArrowRight,
  Clock,
  MapPin,
  IndianRupee,
  Loader2,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Zap,
  GitMerge,
  X,
} from "lucide-react";
import {
  stationLabelFromCode,
} from "@/lib/railway-intelligence";
import {
  fareToNumber,
  compactSeatText,
  liveFareText,
  primaryClassCode,
  splitTotalDuration,
  isSeatAvailable,
  trainNumberName,
  actualLegSourceStation,
  actualLegDestinationStation,
  timeToMinutes,
  fareTone,
} from "../shared/TrustSummary";
import { stationCompactLabel, timeAmPm } from "../shared/utils";
import { softPanel } from "../shared/styles";
import { postJson } from "../shared/api";
import { SplitJourneyCard } from "./TrainResultsWorkspace";

// ─── Hub definitions ──────────────────────────────────────────────────────────
export const HUB_DEFINITIONS = [
  {
    id: "NDLS",
    city: "New Delhi",
    primaryCode: "NDLS",
    terminals: ["NDLS", "DLI", "NZM", "ANVT", "DEE", "DEC"],
    emoji: "🏛️",
    color: "blue",
    description: "Capital — all Delhi terminals",
  },
  {
    id: "CNB",
    city: "Kanpur",
    primaryCode: "CNB",
    terminals: ["CNB", "CPB"],
    emoji: "🏭",
    color: "emerald",
    description: "Kanpur Central & Anwarganj",
  },
  {
    id: "LKO",
    city: "Lucknow",
    primaryCode: "LKO",
    terminals: ["LKO", "LJN"],
    emoji: "🏯",
    color: "rose",
    description: "Lucknow & Lucknow Jn.",
  },
  {
    id: "PRYJ",
    city: "Prayagraj",
    primaryCode: "PRYJ",
    terminals: ["PRYJ", "ALD", "PCOI", "PRRB", "SFG"],
    emoji: "🌊",
    color: "cyan",
    description: "Sangam city — all Prayagraj stations",
  },
  {
    id: "DDU",
    city: "Pt. DDU Jn.",
    primaryCode: "DDU",
    terminals: ["DDU", "MGS"],
    emoji: "🚉",
    color: "purple",
    description: "Pt. Deen Dayal Upadhyaya & Mughal Sarai",
  },
  {
    id: "BSB",
    city: "Varanasi",
    primaryCode: "BSB",
    terminals: ["BSB", "BSBS", "KEI", "BCY"],
    emoji: "🕌",
    color: "amber",
    description: "Banaras / Varanasi — all terminals",
  },
  {
    id: "AGC",
    city: "Agra / Tundla",
    primaryCode: "AGC",
    terminals: ["AGC", "AF", "TDL", "MTJ"],
    emoji: "🏰",
    color: "purple",
    description: "Taj City & Tundla Junction",
  },
] as const;

type HubId = typeof HUB_DEFINITIONS[number]["id"];
export type HubDefinition = typeof HUB_DEFINITIONS[number];

export interface HubLegState {
  leg1Trains: any[];
  leg2Trains: any[];
  loading: boolean;
  loaded: boolean;
  error?: string;
}

// ─── Color palette ────────────────────────────────────────────────────────────
const HUB_COLORS: Record<string, {
  tab: string; tabActive: string;
  header: string; cardBorder: string;
  badge: string; accentText: string;
  pill: string; dot: string;
}> = {
  blue: {
    tab: "border-blue-200 bg-blue-50/60 text-blue-700 hover:bg-blue-100 dark:border-blue-400/20 dark:bg-blue-400/8 dark:text-blue-200",
    tabActive: "border-blue-600 bg-blue-600 text-white shadow-lg shadow-blue-500/20 dark:border-blue-400 dark:bg-blue-400 dark:text-slate-950",
    header: "from-blue-600 via-blue-700 to-indigo-700",
    cardBorder: "border-blue-200/70 dark:border-blue-400/15",
    badge: "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-400/25 dark:bg-blue-400/10 dark:text-blue-200",
    accentText: "text-blue-600 dark:text-blue-300",
    pill: "bg-blue-100 text-blue-700 dark:bg-blue-400/15 dark:text-blue-200",
    dot: "bg-blue-500",
  },
  emerald: {
    tab: "border-emerald-200 bg-emerald-50/60 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-400/20 dark:bg-emerald-400/8 dark:text-emerald-200",
    tabActive: "border-emerald-600 bg-emerald-600 text-white shadow-lg shadow-emerald-500/20 dark:border-emerald-400 dark:bg-emerald-400 dark:text-slate-950",
    header: "from-emerald-600 via-emerald-700 to-teal-700",
    cardBorder: "border-emerald-200/70 dark:border-emerald-400/15",
    badge: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-200",
    accentText: "text-emerald-600 dark:text-emerald-300",
    pill: "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-200",
    dot: "bg-emerald-500",
  },
  rose: {
    tab: "border-rose-200 bg-rose-50/60 text-rose-700 hover:bg-rose-100 dark:border-rose-400/20 dark:bg-rose-400/8 dark:text-rose-200",
    tabActive: "border-rose-600 bg-rose-600 text-white shadow-lg shadow-rose-500/20 dark:border-rose-400 dark:bg-rose-400 dark:text-slate-950",
    header: "from-rose-600 via-rose-700 to-pink-700",
    cardBorder: "border-rose-200/70 dark:border-rose-400/15",
    badge: "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-400/25 dark:bg-rose-400/10 dark:text-rose-200",
    accentText: "text-rose-600 dark:text-rose-300",
    pill: "bg-rose-100 text-rose-700 dark:bg-rose-400/15 dark:text-rose-200",
    dot: "bg-rose-500",
  },
  cyan: {
    tab: "border-cyan-200 bg-cyan-50/60 text-cyan-700 hover:bg-cyan-100 dark:border-cyan-400/20 dark:bg-cyan-400/8 dark:text-cyan-200",
    tabActive: "border-cyan-600 bg-cyan-600 text-white shadow-lg shadow-cyan-500/20 dark:border-cyan-400 dark:bg-cyan-400 dark:text-slate-950",
    header: "from-cyan-600 via-cyan-700 to-sky-700",
    cardBorder: "border-cyan-200/70 dark:border-cyan-400/15",
    badge: "border-cyan-200 bg-cyan-50 text-cyan-800 dark:border-cyan-400/25 dark:bg-cyan-400/10 dark:text-cyan-200",
    accentText: "text-cyan-600 dark:text-cyan-300",
    pill: "bg-cyan-100 text-cyan-700 dark:bg-cyan-400/15 dark:text-cyan-200",
    dot: "bg-cyan-500",
  },
  purple: {
    tab: "border-purple-200 bg-purple-50/60 text-purple-700 hover:bg-purple-100 dark:border-purple-400/20 dark:bg-purple-400/8 dark:text-purple-200",
    tabActive: "border-purple-600 bg-purple-600 text-white shadow-lg shadow-purple-500/20 dark:border-purple-400 dark:bg-purple-400 dark:text-slate-950",
    header: "from-purple-600 via-purple-700 to-violet-700",
    cardBorder: "border-purple-200/70 dark:border-purple-400/15",
    badge: "border-purple-200 bg-purple-50 text-purple-800 dark:border-purple-400/25 dark:bg-purple-400/10 dark:text-purple-200",
    accentText: "text-purple-600 dark:text-purple-300",
    pill: "bg-purple-100 text-purple-700 dark:bg-purple-400/15 dark:text-purple-200",
    dot: "bg-purple-500",
  },
  amber: {
    tab: "border-amber-200 bg-amber-50/60 text-amber-700 hover:bg-amber-100 dark:border-amber-400/20 dark:bg-amber-400/8 dark:text-amber-200",
    tabActive: "border-amber-600 bg-amber-600 text-white shadow-lg shadow-amber-500/20 dark:border-amber-400 dark:bg-amber-400 dark:text-slate-950",
    header: "from-amber-600 via-amber-700 to-orange-700",
    cardBorder: "border-amber-200/70 dark:border-amber-400/15",
    badge: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-200",
    accentText: "text-amber-600 dark:text-amber-300",
    pill: "bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-200",
    dot: "bg-amber-500",
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getHubForSplit(split: any): HubId {
  const hub = String(split?.hubStation || "").toUpperCase().trim();
  if (!hub) return "NDLS";
  for (const def of HUB_DEFINITIONS) {
    if ((def.terminals as readonly string[]).includes(hub)) return def.id;
  }
  if (["AGC", "AF", "TDL", "MTJ"].includes(hub)) return "AGC";
  if (["NDLS", "DLI", "NZM", "ANVT", "DEE", "DEC", "GZB"].includes(hub)) return "NDLS";
  if (["CNB", "CPB", "CPA", "GOY", "ON"].includes(hub)) return "CNB";
  if (["LKO", "LJN", "BNZ", "ASH", "GTNR"].includes(hub)) return "LKO";
  if (["PRYJ", "ALD", "PCOI", "PRRB", "SFG", "NYN"].includes(hub)) return "PRYJ";
  if (["DDU", "MGS", "FKG", "BDL"].includes(hub)) return "DDU";
  if (["BSB", "BSBS", "KEI", "BCY"].includes(hub)) return "BSB";

  return "NDLS";
}

function seatBadgeTone(raw: any): string {
  const s = typeof raw === "string" ? raw.toUpperCase() : String(raw || "").toUpperCase();
  if (!s || s === "—" || s.includes("CHECK") || s.includes("TAP") || s.includes("OBJECT")) {
    return "border-slate-200 bg-slate-50 text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-400";
  }
  if (s.includes("AVAILABLE") || s.includes("AVL") || s.includes("CNF") || s.includes("CURR")) {
    return "border-emerald-300/60 bg-emerald-50 text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200";
  }
  if (s.includes("RAC")) {
    return "border-amber-300/60 bg-amber-50 text-amber-800 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200";
  }
  if (s.includes("WL") || s.includes("WAIT")) {
    return "border-orange-300/60 bg-orange-50 text-orange-800 dark:border-orange-400/30 dark:bg-orange-400/10 dark:text-orange-200";
  }
  if (s.includes("REGRET") || s.includes("NOT AVAILABLE") || s.includes("NOT RUNNING")) {
    return "border-rose-300/50 bg-rose-50 text-rose-800 dark:border-rose-400/20 dark:bg-rose-400/8 dark:text-rose-200";
  }
  return "border-slate-200 bg-slate-50 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300";
}

function cleanSeatString(raw: any): string {
  if (!raw) return "";
  if (typeof raw === "string") return raw;
  if (typeof raw === "object") {
    if (typeof raw.availability === "string") return raw.availability;
    if (typeof raw.status === "string") return raw.status;
    if (typeof raw.current === "string") return raw.current;
    if (typeof raw.text === "string") return raw.text;
    return "";
  }
  return String(raw || "");
}

function formatSeat(raw: any): string {
  const str = cleanSeatString(raw);
  const s = str.trim().toUpperCase();
  if (!s || s.includes("OBJECT") || s.includes("CHECK") || s.includes("TAP") || s.includes("NOT_CHECKED")) return "—";
  if (s.includes("AVAILABLE") || s.includes("AVL") || s.includes("CURR_AV")) {
    const n = s.match(/\d+/)?.[0];
    return n ? `AVAIL ${n}` : "AVAILABLE";
  }
  if (s.includes("RAC")) { const n = s.match(/\d+/)?.[0]; return n ? `RAC/${n}` : "RAC"; }
  if (s.includes("WL") || s.includes("WAIT")) { const n = s.match(/\d+/)?.[0]; return n ? `WL/${n}` : "WL"; }
  if (s.includes("REGRET")) return "NO SEATS";
  if (s.includes("NOT RUNNING")) return "NOT RUNNING";
  if (s.length > 14) return s.slice(0, 14) + "…";
  return s;
}

// ─── Live availability for a single train ─────────────────────────────────────
interface LiveQuote {
  fare: number;
  availability: string;
  status: "loading" | "verified" | "estimated" | "error" | "idle";
}

function useLiveQuote(
  train: any,
  journeyDate: string,
  classCode: string,
  quota: string,
  autoFetch = true,
  delayMs = 0
) {
  const [quote, setQuote] = useState<LiveQuote>({ fare: 0, availability: "", status: "idle" });

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    if (!autoFetch || !train?.trainNo || !train?.source || !train?.destination || !journeyDate || !classCode) return;

    const doFetch = async () => {
      if (cancelled) return;
      setQuote({ fare: 0, availability: "", status: "loading" });
      try {
        const res = await postJson<any>("/api/availability", {
          trainNo: train.trainNo,
          source: train.source,
          destination: train.destination,
          date: journeyDate,
          classType: classCode,
          quota: quota || "GN",
        });
        if (cancelled) return;
        const rawAvail = res?.availability || res?.data?.availability || "";
        const avail = typeof rawAvail === "string" ? rawAvail : String(rawAvail || "");
        const fare = fareToNumber(res?.fare ?? res?.data?.fare);
        const isVerified = res?.availabilityStatus === "VERIFIED" || res?.data?.availabilityStatus === "VERIFIED";
        setQuote({ fare, availability: avail, status: isVerified ? "verified" : "estimated" });
      } catch {
        if (!cancelled) setQuote({ fare: 0, availability: "Error", status: "error" });
      }
    };

    if (delayMs > 0) {
      timer = setTimeout(doFetch, delayMs);
    } else {
      doFetch();
    }

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [autoFetch, train?.trainNo, train?.source, train?.destination, journeyDate, classCode, quota, delayMs]);

  return { quote, refetch: () => {} };
}

// ─── Live train card ──────────────────────────────────────────────────────────
function LiveTrainCard({
  train,
  journeyDate,
  classCode,
  quota,
  direction,
  fetchDelay = 0,
  isDirectTrain = false,
}: {
  train: any;
  journeyDate: string;
  classCode: string;
  quota: string;
  direction: "leg1" | "leg2";
  fetchDelay?: number;
  isDirectTrain?: boolean;
}) {
  const resolvedClass = classCode && classCode !== "Any" ? classCode : primaryClassCode(train) || "3A";
  // Auto live fetch only top 3 trains to prevent network congestion
  const shouldAutoFetch = fetchDelay < 1800;
  const { quote, refetch } = useLiveQuote(train, journeyDate, resolvedClass, quota, shouldAutoFetch, fetchDelay);

  const existingFare = fareToNumber(liveFareText(train));
  const existingSeat = compactSeatText(train);
  const displayFare = quote.fare > 0 ? quote.fare : existingFare;
  const displaySeat = quote.availability || existingSeat || "";
  const fareText = displayFare > 0 ? `₹${displayFare.toLocaleString("en-IN")}` : "—";

  const src = train.source || "—";
  const dst = train.destination || "—";

  return (
    <div className="group relative flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:border-slate-300 hover:shadow-md dark:border-white/10 dark:bg-[#0c1628] dark:hover:border-white/20">
      {isDirectTrain && (
        <span className="absolute right-3 top-3 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[9px] font-black uppercase text-blue-700 dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-300">
          DIRECT
        </span>
      )}

      {/* Train name + number */}
      <div className="min-w-0 pr-16">
        <div className="truncate text-sm font-black text-slate-800 dark:text-white" title={trainNumberName(train)}>
          {trainNumberName(train, "Train")}
        </div>
        <div className="mt-0.5 text-[11px] font-bold text-slate-400">
          {stationCompactLabel(src)} → {stationCompactLabel(dst)}
        </div>
      </div>

      {/* Timing */}
      <div className="flex items-center gap-2">
        <div className="text-center">
          <div className="text-base font-black tabular-nums">{timeAmPm(train.departureTime) || "--"}</div>
          <div className="text-[10px] font-bold text-slate-400">{stationCompactLabel(src)}</div>
        </div>
        <div className="flex flex-1 flex-col items-center gap-0.5">
          <div className="h-px w-full bg-slate-200 dark:bg-white/10" />
          <div className="text-[10px] font-black text-slate-400">{train.duration || "--"}</div>
        </div>
        <div className="text-center">
          <div className="text-base font-black tabular-nums">{timeAmPm(train.arrivalTime) || "--"}</div>
          <div className="text-[10px] font-bold text-slate-400">{stationCompactLabel(dst)}</div>
        </div>
      </div>

      {/* Live fare + availability */}
      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2 dark:border-white/5">
        {/* Class badge */}
        <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-black text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
          {resolvedClass}
        </span>

        {/* Fare */}
        <span className={`rounded-md border px-2.5 py-1 text-xs font-black ${fareText !== "—" ? "border-emerald-300/50 bg-emerald-50 text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200" : "border-slate-200 bg-slate-50 text-slate-500 dark:border-white/10 dark:bg-white/5"}`}>
          <IndianRupee className="mr-0.5 inline h-3 w-3 opacity-70" />
          {quote.status === "loading" ? <Loader2 className="inline h-3 w-3 animate-spin" /> : (fareText !== "—" ? fareText.replace("₹", "") : "—")}
        </span>

        {/* Seat availability */}
        <span className={`flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-black ${seatBadgeTone(displaySeat)}`}>
          {quote.status === "loading" ? (
            <><Loader2 className="h-3 w-3 animate-spin" /> Checking…</>
          ) : (
            formatSeat(displaySeat)
          )}
        </span>

        {/* LIVE badge */}
        {quote.status === "verified" && (
          <span className="flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[9px] font-black uppercase text-white">
            <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
            LIVE
          </span>
        )}

        {/* Retry on error */}
        {quote.status === "error" && (
          <button type="button" onClick={refetch} className="ml-auto flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-black text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-300">
            <RefreshCw className="h-3 w-3" /> Retry
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Compact split route row ──────────────────────────────────────────────────
function SplitCompactRow({
  split,
  rank,
  classCode,
  journeyDate,
  quota,
  expanded,
  onToggle,
  directTrainNos,
}: {
  split: any;
  rank: number;
  classCode: string;
  journeyDate: string;
  quota: string;
  expanded: boolean;
  onToggle: () => void;
  directTrainNos: Set<string>;
}) {
  const leg1 = split.leg1 || {};
  const leg2 = split.leg2 || {};
  const hubCode = split.hubStation || "";
  const resolvedClass = classCode && classCode !== "Any" ? classCode.toUpperCase() : "";

  const leg1Class = resolvedClass || primaryClassCode(leg1) || "3A";
  const leg2Class = resolvedClass || primaryClassCode(leg2) || "3A";

  // Auto live fetch up to top 15 splits per request
  const shouldAutoFetch = rank <= 15;
  const { quote: q1 } = useLiveQuote(leg1, split.leg1Date || journeyDate, leg1Class, quota, shouldAutoFetch, Math.min(rank * 100, 1500));
  const { quote: q2 } = useLiveQuote(leg2, split.leg2Date || journeyDate, leg2Class, quota, shouldAutoFetch, Math.min(rank * 100 + 50, 1500));

  const f1 = q1.fare > 0 ? q1.fare : fareToNumber(liveFareText(leg1)) || fareToNumber(split.leg1Fare);
  const f2 = q2.fare > 0 ? q2.fare : fareToNumber(liveFareText(leg2)) || fareToNumber(split.leg2Fare);
  const total = f1 > 0 && f2 > 0 ? f1 + f2 : fareToNumber(split.totalFare);
  const totalText = total > 0 ? `₹${total.toLocaleString("en-IN")}` : "—";

  const s1 = q1.availability || compactSeatText(leg1);
  const s2 = q2.availability || compactSeatText(leg2);

  const totalDuration = splitTotalDuration(split);
  const layover = split.layoverDuration || "—";

  const bothLoading = q1.status === "loading" || q2.status === "loading";
  const bothVerified = q1.status === "verified" && q2.status === "verified";

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all dark:border-white/10 dark:bg-[#0c1628]">
      <button type="button" onClick={onToggle} className="w-full text-left" aria-expanded={expanded}>
        <div className="flex items-stretch gap-0 sm:gap-3 px-4 py-3">

          {/* Rank */}
          <div className="flex shrink-0 flex-col items-center justify-center w-7 mr-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-950 text-[11px] font-black text-white dark:bg-white dark:text-slate-950">
              {rank}
            </span>
          </div>

          {/* Main info */}
          <div className="min-w-0 flex-1 space-y-1.5">
            {/* Train pair */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs font-black">
              <span className="truncate text-slate-800 dark:text-white">{trainNumberName(leg1, "Leg 1")}</span>
              <ArrowRight className="h-3 w-3 shrink-0 text-slate-400" />
              <span className="shrink-0 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-black text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
                {stationCompactLabel(hubCode)}
              </span>
              <ArrowRight className="h-3 w-3 shrink-0 text-slate-400" />
              <span className="truncate text-slate-800 dark:text-white">{trainNumberName(leg2, "Leg 2")}</span>
            </div>

            {/* Timings strip */}
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold text-slate-500 dark:text-slate-400">
              <span className="font-black text-slate-700 dark:text-slate-200">{timeAmPm(leg1.departureTime)}</span>
              <span className="text-slate-300 dark:text-white/20">→</span>
              <span>{timeAmPm(leg1.arrivalTime)}</span>
              <span className="rounded-md border border-slate-200 bg-slate-50/80 px-1.5 py-0.5 dark:border-white/10 dark:bg-white/4">
                {layover} wait
              </span>
              <span>{timeAmPm(leg2.departureTime)}</span>
              <span className="text-slate-300 dark:text-white/20">→</span>
              <span className="font-black text-slate-700 dark:text-slate-200">{timeAmPm(leg2.arrivalTime)}</span>
              {totalDuration && (
                <span className="rounded-md border border-slate-200 bg-slate-50/80 px-1.5 py-0.5 dark:border-white/10 dark:bg-white/4">
                  ⏱ {totalDuration}
                </span>
              )}
            </div>

            {/* Availability badges row */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-black text-slate-400">L1:</span>
              <span className={`rounded-md border px-2 py-0.5 text-[10px] font-black ${seatBadgeTone(s1)}`}>
                {q1.status === "loading" ? <Loader2 className="inline h-3 w-3 animate-spin" /> : formatSeat(s1)}
              </span>
              {f1 > 0 && (
                <span className="rounded-md border border-emerald-200/60 bg-emerald-50 px-2 py-0.5 text-[10px] font-black text-emerald-800 dark:border-emerald-400/15 dark:bg-emerald-400/8 dark:text-emerald-300">
                  ₹{f1.toLocaleString("en-IN")}
                </span>
              )}
              <span className="mx-1 text-slate-300 dark:text-white/15">·</span>
              <span className="text-[10px] font-black text-slate-400">L2:</span>
              <span className={`rounded-md border px-2 py-0.5 text-[10px] font-black ${seatBadgeTone(s2)}`}>
                {q2.status === "loading" ? <Loader2 className="inline h-3 w-3 animate-spin" /> : formatSeat(s2)}
              </span>
              {f2 > 0 && (
                <span className="rounded-md border border-emerald-200/60 bg-emerald-50 px-2 py-0.5 text-[10px] font-black text-emerald-800 dark:border-emerald-400/15 dark:bg-emerald-400/8 dark:text-emerald-300">
                  ₹{f2.toLocaleString("en-IN")}
                </span>
              )}
              {bothVerified && (
                <span className="flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[9px] font-black uppercase text-white">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />LIVE
                </span>
              )}
            </div>
          </div>

          {/* Total fare + expand */}
          <div className="ml-2 flex shrink-0 flex-col items-end justify-between">
            <div className={`rounded-xl border px-3 py-1.5 text-sm font-black whitespace-nowrap ${totalText !== "—" ? "border-emerald-300/50 bg-emerald-50 text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200" : "border-slate-200 bg-slate-50 text-slate-500 dark:border-white/10 dark:bg-white/5"}`}>
              {bothLoading && totalText === "—" ? <Loader2 className="inline h-3 w-3 animate-spin" /> : totalText}
            </div>
            <span className="mt-2 text-slate-400">
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </span>
          </div>
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden border-t border-slate-200 dark:border-white/10"
          >
            <SplitJourneyCard
              split={split}
              journeyDate={journeyDate}
              requestedClass={resolvedClass || ""}
              quota={quota}
              autoFetchLive={false}
              fetchDelay={0}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Per-hub data view ────────────────────────────────────────────────────────
function HubDetailView({
  hub,
  hubSplits,
  hubLegState,
  source,
  destination,
  date,
  classType,
  quota,
  directTrainNos,
  onFetchLegs,
}: {
  hub: HubDefinition;
  hubSplits: any[];
  hubLegState?: HubLegState;
  source: string;
  destination: string;
  date: string;
  classType: string;
  quota: string;
  directTrainNos: Set<string>;
  onFetchLegs: () => void;
}) {
  const colors = HUB_COLORS[hub.color];
  const [expandedSplit, setExpandedSplit] = useState<number | null>(null);
  const [showAllLeg1, setShowAllLeg1] = useState(false);
  const [showAllLeg2, setShowAllLeg2] = useState(false);

  const leg1Trains = hubLegState?.leg1Trains || [];
  const leg2Trains = hubLegState?.leg2Trains || [];
  const resolvedClass = classType && classType !== "Any" ? classType.toUpperCase() : "3A";

  const topSplits = hubSplits.slice(0, 15);

  // Stats
  const availSplits = topSplits.filter((s) => {
    const s1 = compactSeatText(s.leg1 || {});
    const s2 = compactSeatText(s.leg2 || {});
    return isSeatAvailable(s1) && isSeatAvailable(s2);
  }).length;

  return (
    <div className="space-y-5">
      {/* ── Hub header banner ── */}
      <div className={`rounded-3xl bg-gradient-to-br p-5 text-white shadow-xl ${colors.header}`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl">{hub.emoji}</span>
              <h3 className="text-xl font-black">{hub.city}</h3>
            </div>
            <p className="mt-1 text-sm font-semibold text-white/80">{hub.description}</p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-white/70" />
              <span className="text-xs font-bold text-white/70">All terminals:</span>
              {hub.terminals.map((t) => (
                <span key={t} className="rounded-md border border-white/25 bg-white/15 px-2 py-0.5 text-[11px] font-black">
                  {t}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Leg 1 + Leg 2 trains (direct trains per leg) ── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-[#0c1628]">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <GitMerge className="h-4 w-4 text-slate-500" />
              <h4 className="font-black text-slate-800 dark:text-white">Available Trains at Each Leg</h4>
            </div>
            <p className="mt-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
              {source} → {hub.city} (Leg 1) &nbsp;·&nbsp; {hub.city} → {destination} (Leg 2)
              {" "}<span className="text-emerald-600 dark:text-emerald-400">· Live fare + availability</span>
            </p>
          </div>
          {!hubLegState?.loaded && (
            <button
              type="button"
              onClick={onFetchLegs}
              className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-xs font-black transition-all ${colors.badge}`}
            >
              {hubLegState?.loading ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading trains…</>
              ) : (
                <><Zap className="h-3.5 w-3.5" /> Fetch live trains</>
              )}
            </button>
          )}
        </div>

        {hubLegState?.loading && (
          <div className="flex items-center gap-3 rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm font-bold text-cyan-700 dark:border-cyan-400/20 dark:bg-cyan-400/10 dark:text-cyan-200">
            <Loader2 className="h-4 w-4 animate-spin shrink-0" />
            Searching trains for {source} → {hub.city} and {hub.city} → {destination}…
          </div>
        )}

        {hubLegState?.error && !hubLegState.loading && (
          <div className="flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {hubLegState.error}
          </div>
        )}

        {hubLegState?.loaded && !hubLegState.loading && (
          <div className="grid gap-5 md:grid-cols-2">
            {/* Leg 1 column */}
            <div>
              <div className="mb-3 flex items-center gap-2">
                <div className={`h-2 w-2 rounded-full ${colors.dot}`} />
                <span className="text-sm font-black text-slate-700 dark:text-slate-200">
                  Leg 1: {source} → {hub.city}
                </span>
              </div>
              {leg1Trains.length === 0 ? (
                <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-4 text-center text-xs font-bold text-slate-400 dark:border-white/8 dark:bg-white/3">
                  No direct trains found for {source} → {hub.city} on this date.
                </div>
              ) : (
                <div className="space-y-2">
                  {leg1Trains.slice(0, 15).map((train, i) => (
                    <LiveTrainCard
                      key={`l1-${train.trainNo || i}`}
                      train={train}
                      journeyDate={date}
                      classCode={resolvedClass}
                      quota={quota}
                      direction="leg1"
                      fetchDelay={i * 600}
                    />
                  ))}
                  {leg1Trains.length > 15 && (
                    <div className="text-center text-xs font-bold text-slate-400">
                      + {leg1Trains.length - 15} more trains available
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Leg 2 column */}
            <div>
              <div className="mb-3 flex items-center gap-2">
                <div className={`h-2 w-2 rounded-full ${colors.dot}`} />
                <span className="text-sm font-black text-slate-700 dark:text-slate-200">
                  Leg 2: {hub.city} → {destination}
                </span>
              </div>
              {leg2Trains.length === 0 ? (
                <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-4 text-center text-xs font-bold text-slate-400 dark:border-white/8 dark:bg-white/3">
                  No direct trains found for {hub.city} → {destination} on this date.
                </div>
              ) : (
                <div className="space-y-2">
                  {leg2Trains.slice(0, 15).map((train, i) => (
                    <LiveTrainCard
                      key={`l2-${train.trainNo || i}`}
                      train={train}
                      journeyDate={date}
                      classCode={resolvedClass}
                      quota={quota}
                      direction="leg2"
                      fetchDelay={i * 600 + 300}
                    />
                  ))}
                  {leg2Trains.length > 15 && (
                    <div className="text-center text-xs font-bold text-slate-400">
                      + {leg2Trains.length - 15} more trains available
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {!hubLegState && (
          <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center dark:border-white/10">
            <p className="text-sm font-bold text-slate-400">
              Click <strong>"Fetch live trains"</strong> above to load direct trains for each leg via {hub.city}.
            </p>
          </div>
        )}
      </div>

      {/* ── Up to 15 split routes via this hub ── */}
      <div>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h4 className="flex items-center gap-2 font-black text-slate-800 dark:text-white">
            <GitMerge className="h-4 w-4 text-slate-500" />
            Top {topSplits.length} Split Combinations via {hub.city}
          </h4>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-black text-slate-600 dark:border-white/10 dark:bg-white/6 dark:text-slate-300">
            Unique train pairs · capped at 15 · no direct trains included
          </span>
        </div>

        {topSplits.length === 0 ? (
          <div className={softPanel("rounded-2xl p-6 text-center")}>
            <Train className="mx-auto mb-3 h-7 w-7 text-slate-300 dark:text-slate-600" />
            <p className="text-sm font-bold text-slate-500 dark:text-slate-400">
              No split route combinations found via {hub.city} terminals ({hub.terminals.join(", ")}) for this search.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {topSplits.map((split, i) => (
              <SplitCompactRow
                key={`${split.leg1?.trainNo || "l1"}-${split.hubStation}-${split.leg2?.trainNo || "l2"}-${i}`}
                split={split}
                rank={i + 1}
                classCode={classType}
                journeyDate={date}
                quota={quota}
                expanded={expandedSplit === i}
                onToggle={() => setExpandedSplit(expandedSplit === i ? null : i)}
                directTrainNos={directTrainNos}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main exported component ──────────────────────────────────────────────────
export function HubExplorerPanel({
  splits,
  directTrains = [],
  date,
  classType,
  quota,
  source,
  destination,
  loading,
  leg1Classes = [],
  leg2Classes = [],
}: {
  splits: any[];
  directTrains?: any[];
  date: string;
  classType: string;
  quota: string;
  source: string;
  destination: string;
  loading?: boolean;
  leg1Classes?: string[];
  leg2Classes?: string[];
}) {
  // Group splits by hub
  const splitsByHub = useMemo(() => {
    const map: Record<HubId, any[]> = {
      NDLS: [], CNB: [], LKO: [], PRYJ: [], DDU: [], BSB: [], AGC: [],
    };
    for (const split of splits) {
      const hubId = getHubForSplit(split);
      if (map[hubId]) {
        map[hubId].push(split);
      } else {
        map.NDLS.push(split);
      }
    }
    return map;
  }, [splits]);

  // Set of direct train numbers (to filter from splits)
  const directTrainNos = useMemo(() => {
    const nos = new Set<string>();
    for (const t of directTrains) {
      const no = String(t?.trainNo || t?.train_no || "").trim().replace(/\D/g, "");
      if (no) nos.add(no);
    }
    return nos;
  }, [directTrains]);

  // Default to hub with most splits, or first hub
  const defaultHub = useMemo<HubId>(() => {
    let best: HubId = "NDLS";
    let bestCount = -1;
    for (const def of HUB_DEFINITIONS) {
      const count = splitsByHub[def.id]?.length || 0;
      if (count > bestCount) { bestCount = count; best = def.id; }
    }
    return best;
  }, [splitsByHub]);

  const [activeHub, setActiveHub] = useState<HubId | null>(null);
  const resolvedHub: HubId = activeHub || defaultHub;
  const activeDef = HUB_DEFINITIONS.find((d) => d.id === resolvedHub)!;

  // Per-hub leg train state
  const [hubLegData, setHubLegData] = useState<Record<string, HubLegState>>({});

  const fetchHubLegs = useCallback(async (hubId: HubId) => {
    const def = HUB_DEFINITIONS.find((d) => d.id === hubId);
    if (!def || !source || !destination || !date) return;
    setHubLegData((prev) => ({
      ...prev,
      [hubId]: { leg1Trains: [], leg2Trains: [], loading: true, loaded: false },
    }));
    try {
      const leg1Class = leg1Classes.length > 0 ? leg1Classes[0] : (classType && classType !== "Any" ? classType : "3A");
      const leg2Class = leg2Classes.length > 0 ? leg2Classes[0] : (classType && classType !== "Any" ? classType : "3A");
      const [leg1Res, leg2Res] = await Promise.all([
        postJson<any>("/api/search-direct", {
          source,
          destination: def.primaryCode,
          date,
          classType: leg1Class,
          quota: quota || "GN",
        }),
        postJson<any>("/api/search-direct", {
          source: def.primaryCode,
          destination,
          date,
          classType: leg2Class,
          quota: quota || "GN",
        }),
      ]);
      const leg1Trains = (leg1Res?.data?.trains || leg1Res?.data?.directTrains || leg1Res?.extra?.trains || leg1Res?.trains || []);
      const leg2Trains = (leg2Res?.data?.trains || leg2Res?.data?.directTrains || leg2Res?.extra?.trains || leg2Res?.trains || []);
      setHubLegData((prev) => ({
        ...prev,
        [hubId]: { leg1Trains, leg2Trains, loading: false, loaded: true },
      }));
    } catch (e: any) {
      setHubLegData((prev) => ({
        ...prev,
        [hubId]: { leg1Trains: [], leg2Trains: [], loading: false, loaded: true, error: e?.message || "Failed to fetch trains" },
      }));
    }
  }, [source, destination, date, classType, quota, leg1Classes, leg2Classes]);

  // Auto-fetch when hub changes if not already loaded
  useEffect(() => {
    const existing = hubLegData[resolvedHub];
    if (!existing?.loaded && !existing?.loading) {
      fetchHubLegs(resolvedHub);
    }
  }, [resolvedHub, hubLegData, fetchHubLegs]);



  const totalSplits = splits.length;

  return (
    <div className="space-y-5">
      {/* Panel title */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white">
            🗺️ Hub Explorer
          </h2>
          <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
            {source} → {destination} &nbsp;·&nbsp; {date} &nbsp;·&nbsp;
            {totalSplits} split routes across {HUB_DEFINITIONS.length} hubs
          </p>
          <p className="mt-0.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
            ● Live fare + live seat availability per train
          </p>
        </div>
        {loading && (
          <div className="flex items-center gap-2 rounded-xl border border-cyan-300/40 bg-cyan-50 px-3 py-2 text-xs font-black text-cyan-700 dark:border-cyan-400/20 dark:bg-cyan-400/10 dark:text-cyan-200">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Fetching split routes…
          </div>
        )}
      </div>

      {/* Hub tabs */}
      <div className="flex flex-wrap gap-2">
        {HUB_DEFINITIONS.map((def) => {
          const count = splitsByHub[def.id]?.length || 0;
          const colors = HUB_COLORS[def.color];
          const isActive = resolvedHub === def.id;
          const legLoaded = hubLegData[def.id]?.loaded;
          const legCount = legLoaded
            ? (hubLegData[def.id].leg1Trains.length + hubLegData[def.id].leg2Trains.length)
            : null;

          return (
            <button
              key={def.id}
              type="button"
              onClick={() => setActiveHub(def.id)}
              className={`flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-black transition-all duration-200 ${isActive ? colors.tabActive : colors.tab}`}
            >
              <span>{def.emoji}</span>
              <span>{def.city}</span>
              <div className="flex items-center gap-1">
                {count > 0 && (
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-black ${isActive ? "bg-white/20 text-white" : colors.pill}`}>
                    {count}
                  </span>
                )}
                {legCount !== null && legCount > 0 && (
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-black opacity-80 ${isActive ? "bg-white/15 text-white" : "bg-slate-100 text-slate-500 dark:bg-white/8 dark:text-slate-400"}`}>
                    +{legCount}🚆
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Hub overview summary grid */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {HUB_DEFINITIONS.map((def) => {
          const count = splitsByHub[def.id]?.length || 0;
          const colors = HUB_COLORS[def.color];
          const legState = hubLegData[def.id];
          const minFare = (splitsByHub[def.id] || []).reduce((min: number, s: any) => {
            const f = fareToNumber(s.totalFare);
            return f > 0 ? Math.min(min, f) : min;
          }, Infinity);
          const isActive = resolvedHub === def.id;

          return (
            <button
              key={def.id}
              type="button"
              onClick={() => setActiveHub(def.id)}
              className={`rounded-xl border p-3 text-left transition-all ${isActive
                ? `border-2 ${colors.cardBorder} ${colors.badge}`
                : "border-slate-200 bg-white hover:border-slate-300 dark:border-white/10 dark:bg-white/4 dark:hover:border-white/20"
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span>{def.emoji}</span>
                <span className="text-xs font-black text-slate-700 dark:text-slate-100">{def.city}</span>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {def.terminals.slice(0, 3).map((code) => (
                  <span key={code} className="rounded border border-slate-200 bg-white/80 px-1 py-0.5 text-[9px] font-black text-slate-500 dark:border-white/10 dark:bg-black/20 dark:text-slate-400">
                    {code}
                  </span>
                ))}
                {def.terminals.length > 3 && (
                  <span className="text-[9px] font-black text-slate-400">+{def.terminals.length - 3}</span>
                )}
              </div>
              <div className="mt-2 space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-black text-slate-700 dark:text-slate-200">{count} splits</span>
                  {Number.isFinite(minFare) && minFare > 0 && (
                    <span className={`text-[10px] font-black ${colors.accentText}`}>
                      from ₹{minFare.toLocaleString("en-IN")}
                    </span>
                  )}
                </div>
                {legState?.loaded && (
                  <div className="text-[10px] font-bold text-slate-400">
                    {legState.leg1Trains.length + legState.leg2Trains.length} leg trains loaded
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Active hub full detail */}
      <AnimatePresence mode="wait">
        <motion.div
          key={resolvedHub}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18 }}
        >
          <HubDetailView
            hub={activeDef}
            hubSplits={splitsByHub[resolvedHub] || []}
            hubLegState={hubLegData[resolvedHub]}
            source={source}
            destination={destination}
            date={date}
            classType={classType}
            quota={quota}
            directTrainNos={directTrainNos}
            onFetchLegs={() => fetchHubLegs(resolvedHub)}
          />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
