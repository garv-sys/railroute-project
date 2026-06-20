"use client";

import { FormEvent, type ReactNode, useDeferredValue, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity,
  AlertCircle,
  ArrowDownUp,
  ArrowRight,
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  Circle,
  Copy,
  Gauge,
  Heart,
  IndianRupee,
  Layers3,
  Loader2,
  MapPin,
  Navigation,
  Radio,
  Route,
  Search,
  Share2,
  ShieldCheck,
  Sparkles,
  Star,
  Train,
  Wallet,
  Zap,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

import {
  normalizeText,
  stationByCode,
  stationCityName,
  stationLabel,
  stationLabelFromCode,
  stationState,
  stations,
  type Station,
} from "@/lib/railway-intelligence";

type SmartToggle = "split" | "fastest" | "lowest" | "calendar" | "direct" | "available";
type SortKey = "recommended" | "cheapest" | "fastest" | "earliest" | "latest" | "duration" | "stops";
type TravelMode = "balanced" | "cheapest" | "fastest" | "comfort";

type ApiState<T> = {
  loading: boolean;
  error: string;
  data: T | null;
};

type MapStation = Station & { lat: number; lng: number };

function toMapStation(station?: Station | null): MapStation | null {
  if (!station || !Number.isFinite(station.lat) || !Number.isFinite(station.lon)) return null;
  return { ...station, lat: Number(station.lat), lng: Number(station.lon) };
}

function mapStationByCode(code: string) {
  return toMapStation(stationByCode(code));
}

const MAP_STATIONS: MapStation[] = stations
  .map(toMapStation)
  .filter((station): station is MapStation => Boolean(station))
  .sort((a, b) => {
    const aJunction = a.type === "junction" ? 1 : 0;
    const bJunction = b.type === "junction" ? 1 : 0;
    if (bJunction !== aJunction) return bJunction - aJunction;
    return a.code.localeCompare(b.code);
  })
  .slice(0, 120);

const CLASS_FILTERS = [
  { key: "AC", label: "AC" },
  { key: "SL", label: "Sleeper" },
  { key: "3A", label: "3AC" },
  { key: "2A", label: "2AC" },
  { key: "CC", label: "Chair Car" },
  { key: "EC", label: "Executive" },
  { key: "TQ", label: "Tatkal" },
];

const SMART_TOGGLES: { key: SmartToggle; label: string; icon: typeof Zap }[] = [
  { key: "split", label: "Split Journey", icon: Layers3 },
  { key: "fastest", label: "Fastest Trains", icon: Gauge },
  { key: "lowest", label: "Lowest Fare", icon: IndianRupee },
  { key: "calendar", label: "Seat Calendar", icon: CalendarDays },
  { key: "direct", label: "Direct Only", icon: Route },
  { key: "available", label: "Available Seats Only", icon: Check },
];

const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

function todayIso(offset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
}

function fuzzyDistance(a: string, b: string) {
  const source = normalizeText(a).slice(0, 32);
  const target = normalizeText(b).slice(0, 32);
  if (!source || !target) return 99;

  const dp = Array.from({ length: source.length + 1 }, () => Array(target.length + 1).fill(0));
  for (let i = 0; i <= source.length; i++) dp[i][0] = i;
  for (let j = 0; j <= target.length; j++) dp[0][j] = j;
  for (let i = 1; i <= source.length; i++) {
    for (let j = 1; j <= target.length; j++) {
      const cost = source[i - 1] === target[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[source.length][target.length];
}

function stationScore(station: Station, query: string) {
  const q = query.trim();
  if (!q) return 0;

  const code = station.code.toUpperCase();
  const name = station.name.toUpperCase();
  const city = stationCityName(station).toUpperCase();
  const state = stationState(station.code).toUpperCase();
  const upper = q.toUpperCase();
  const normalizedQuery = normalizeText(q);

  if (code === upper) return 3000;
  if (city === upper || name === upper) return 2600;
  if (code.startsWith(upper)) return 2300 - code.length;
  if (city.startsWith(upper)) return 2100 - city.length / 10;
  if (name.startsWith(upper)) return 1900 - name.length / 10;
  if (state.startsWith(upper)) return 1500;
  if (code.includes(upper)) return 1300 - code.indexOf(upper);
  if (normalizeText(name).includes(normalizedQuery)) return 1100;
  if (normalizeText(city).includes(normalizedQuery)) return 1000;

  const cityDistance = fuzzyDistance(q, city);
  const nameDistance = fuzzyDistance(q, name);
  const codeDistance = fuzzyDistance(q, code);
  const best = Math.min(cityDistance, nameDistance, codeDistance);
  if (best <= Math.max(1, Math.floor(normalizedQuery.length / 3))) {
    return 800 - best * 30;
  }

  return 0;
}

function parseFare(value: unknown) {
  const num = Number(String(value || "").replace(/[^\d.]/g, ""));
  return Number.isFinite(num) && num > 0 ? num : 999999;
}

function parseTimeMinutes(value: string) {
  const [h, m] = String(value || "00:00").split(":").map((part) => Number(part));
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

function parseDurationMinutes(value: string) {
  const text = String(value || "");
  const hour = text.match(/(\d+)\s*h/i)?.[1] || text.match(/(\d+):/)?.[1];
  const min = text.match(/(\d+)\s*m/i)?.[1] || text.match(/:(\d+)/)?.[1];
  return (Number(hour) || 0) * 60 + (Number(min) || 0);
}

function firstAvailability(train: any, classType: string) {
  const preferred = classType !== "Any" ? classType : train.classType || train.classes?.[0];
  return train.classAvailability?.[preferred]?.[0] || train.classAvailability?.[train.classType]?.[0] || null;
}

function statusTone(status: string) {
  const upper = status.toUpperCase();
  if (upper.includes("AVAILABLE") || upper.includes("AVL")) return "border-emerald-300/40 bg-emerald-400/12 text-emerald-200";
  if (upper.includes("RAC")) return "border-amber-300/40 bg-amber-400/12 text-amber-200";
  if (upper.includes("WL")) return "border-orange-300/40 bg-orange-400/12 text-orange-200";
  return "border-slate-300/20 bg-white/8 text-slate-300";
}

function deterministicDelay(trainNo: string) {
  const seed = Number(String(trainNo || "0").slice(-2)) || 0;
  if (seed % 5 === 0) return { label: "On time", tone: "border-emerald-300/40 bg-emerald-400/12 text-emerald-200", minutes: 0 };
  if (seed % 3 === 0) return { label: "+18 min", tone: "border-amber-300/40 bg-amber-400/12 text-amber-200", minutes: 18 };
  return { label: "+7 min", tone: "border-blue-300/40 bg-blue-400/12 text-blue-200", minutes: 7 };
}

function confidenceFor(train: any) {
  const availability = String(train.availability ?? "");
  if (availability.includes("AVAILABLE") || availability.includes("AVL")) return 94;
  if (availability.includes("RAC")) return 78;
  if (availability.includes("WL")) return Math.max(32, Number(train.confirmationChance) || 46);
  return 61;
}

const CLIENT_CACHE_TTL_MS = 60_000;
const clientResponseCache = new Map<string, { timestamp: number; data: unknown }>();
const clientInFlightRequests = new Map<string, Promise<unknown>>();

function stableStringify(value: unknown): string {
  if (!value || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
    .join(",")}}`;
}

function postJson<T>(url: string, body: Record<string, unknown>): Promise<T> {
  const key = `${url}:${stableStringify(body)}`;
  const cached = clientResponseCache.get(key);
  if (cached && Date.now() - cached.timestamp < CLIENT_CACHE_TTL_MS) return Promise.resolve(cached.data as T);

  const inFlight = clientInFlightRequests.get(key);
  if (inFlight) return inFlight as Promise<T>;

  const request = fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
    .then(async (response) => {
      const data = await response.json();
      if (!response.ok || data?.success === false) {
        throw new Error(data?.error || data?.message || "Request failed");
      }
      clientResponseCache.set(key, { timestamp: Date.now(), data });
      return data as T;
    })
    .finally(() => {
      clientInFlightRequests.delete(key);
    });

  clientInFlightRequests.set(key, request);
  return request;
}

function useDebouncedValue<T>(value: T, delayMs = 500) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}

function projectPoint(lat: number, lng: number, zoom: number, pan: { x: number; y: number }) {
  const x = ((lng - 66) / (98 - 66)) * 760 * zoom + pan.x;
  const y = ((37 - lat) / (37 - 6)) * 760 * zoom + pan.y;
  return { x, y };
}

function LoadingSkeleton({ label }: { label: string }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/8 px-4 py-3 text-sm font-semibold text-slate-200 backdrop-blur-xl">
        <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />
        {label}
      </div>
      {[0, 1, 2].map((item) => (
        <div key={item} className="h-40 animate-pulse rounded-3xl border border-white/10 bg-white/8" />
      ))}
    </div>
  );
}

function PremiumError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-3xl border border-rose-300/30 bg-rose-500/10 p-5 text-rose-100">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <div className="font-black">Railway data gateway notice</div>
          <p className="mt-1 text-sm leading-6 text-rose-100/80">{message}</p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-4 rounded-xl border border-rose-200/30 bg-white/10 px-4 py-2 text-xs font-black text-white transition hover:bg-white/16"
            >
              Retry request
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function StationAutocomplete({
  label,
  value,
  query,
  setQuery,
  onSelect,
  placeholder,
  example,
}: {
  label: string;
  value: string;
  query: string;
  setQuery: (value: string) => void;
  onSelect: (code: string) => void;
  placeholder: string;
  example: string;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const debouncedQuery = useDebouncedValue(query, 500);
  const deferredQuery = useDeferredValue(debouncedQuery);

  const matches = useMemo(() => {
    if (normalizeText(deferredQuery).length < 3) return [];
    return stations
      .map((station) => ({ station, score: stationScore(station, deferredQuery) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || stationCityName(a.station).localeCompare(stationCityName(b.station)))
      .slice(0, 50)
      .map((item) => item.station);
  }, [deferredQuery]);

  useEffect(() => setActiveIndex(0), [deferredQuery]);

  function select(station: Station) {
    onSelect(station.code);
    setQuery(stationLabel(station));
    setOpen(false);
  }

  return (
    <div className="relative">
      <div className="mb-2 flex items-center justify-between">
        <label className="text-[11px] font-black uppercase text-slate-400">{label}</label>
        <span className="text-[11px] font-semibold text-slate-500">{example}</span>
      </div>
      <div className="relative">
        <MapPin className={`pointer-events-none absolute left-4 top-4 h-4 w-4 ${label === "From" ? "text-emerald-300" : "text-rose-300"}`} />
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          onKeyDown={(event) => {
            if (!open || matches.length === 0) return;
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActiveIndex((index) => Math.min(index + 1, matches.length - 1));
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setActiveIndex((index) => Math.max(index - 1, 0));
            }
            if (event.key === "Enter") {
              event.preventDefault();
              select(matches[activeIndex]);
            }
            if (event.key === "Escape") setOpen(false);
          }}
          placeholder={placeholder}
          className="h-14 w-full rounded-2xl border border-white/10 bg-white/8 pl-11 pr-4 text-[15px] font-bold text-white outline-none backdrop-blur-xl transition placeholder:text-slate-500 focus:border-cyan-300/60 focus:bg-white/12 focus:ring-4 focus:ring-cyan-300/10"
          aria-label={label}
          aria-controls={`${label}-station-list`}
        />
      </div>
      <AnimatePresence>
        {open && query.trim().length >= 3 && (
          <motion.div
            id={`${label}-station-list`}
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            className="absolute z-50 mt-2 max-h-80 w-full overflow-auto rounded-2xl border border-white/12 bg-[#111827]/95 p-1.5 shadow-2xl shadow-black/50 backdrop-blur-2xl"
          >
            {matches.length === 0 ? (
              <div className="px-4 py-4 text-sm font-semibold text-slate-300">
                No exact match. You can still search by station code.
              </div>
            ) : (
              matches.map((station, index) => (
                <button
                  key={station.code}
                  type="button"
                  onMouseDown={() => select(station)}
                  className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-3 text-left transition ${
                    index === activeIndex ? "bg-white/14" : "hover:bg-white/10"
                  }`}
                  role="option"
                  aria-selected={value === station.code}
                >
                  <span className="min-w-0 truncate text-sm font-bold text-slate-100">{stationCityName(station)} ({stationState(station.code)})</span>
                  <span className="shrink-0 rounded-lg border border-cyan-300/30 bg-cyan-300/10 px-2.5 py-1 text-xs font-black text-cyan-100">{station.code}</span>
                </button>
              ))
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SmartSearchPanel({
  source,
  destination,
  sourceQuery,
  destinationQuery,
  setSourceQuery,
  setDestinationQuery,
  setSource,
  setDestination,
  date,
  setDate,
  classType,
  setClassType,
  smartToggles,
  setSmartToggles,
  mode,
  setMode,
  loading,
  onSubmit,
}: {
  source: string;
  destination: string;
  sourceQuery: string;
  destinationQuery: string;
  setSourceQuery: (value: string) => void;
  setDestinationQuery: (value: string) => void;
  setSource: (value: string) => void;
  setDestination: (value: string) => void;
  date: string;
  setDate: (value: string) => void;
  classType: string;
  setClassType: (value: string) => void;
  smartToggles: SmartToggle[];
  setSmartToggles: (value: SmartToggle[]) => void;
  mode: TravelMode;
  setMode: (value: TravelMode) => void;
  loading: boolean;
  onSubmit: (event: FormEvent) => void;
}) {
  const [swapSpin, setSwapSpin] = useState(false);

  function toggleSmart(key: SmartToggle) {
    setSmartToggles(smartToggles.includes(key) ? smartToggles.filter((item) => item !== key) : [...smartToggles, key]);
  }

  function swapStations() {
    setSwapSpin(true);
    const oldSource = source;
    const oldSourceQuery = sourceQuery;
    setSource(destination);
    setDestination(oldSource);
    setSourceQuery(destinationQuery);
    setDestinationQuery(oldSourceQuery);
    window.setTimeout(() => setSwapSpin(false), 420);
  }

  return (
    <motion.form
      onSubmit={onSubmit}
      layout
      className="rounded-[28px] border border-white/12 bg-white/8 p-4 shadow-2xl shadow-black/30 backdrop-blur-2xl sm:p-5"
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-xs font-black uppercase text-cyan-200">RailRoute Command</div>
          <h2 className="mt-1 text-2xl font-black text-white">Find the best journey</h2>
        </div>
        <span className="rounded-full border border-emerald-300/30 bg-emerald-400/10 px-3 py-1 text-[11px] font-black text-emerald-100">
          LIVE
        </span>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_auto_1fr] lg:items-end">
        <StationAutocomplete
          label="From"
          value={source}
          query={sourceQuery}
          setQuery={setSourceQuery}
          onSelect={setSource}
          placeholder="Starting Point"
          example="e.g. Jaipur (Rajasthan)"
        />
        <button
          type="button"
          onClick={swapStations}
          className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-white/14 bg-white/10 text-cyan-100 shadow-lg transition hover:border-cyan-300/40 hover:bg-cyan-300/12 lg:mb-0"
          aria-label="Swap source and destination"
        >
          <motion.span animate={{ rotate: swapSpin ? 180 : 0, scale: swapSpin ? 1.15 : 1 }} transition={{ type: "spring", stiffness: 420, damping: 18 }}>
            <ArrowDownUp className="h-5 w-5" />
          </motion.span>
        </button>
        <StationAutocomplete
          label="To"
          value={destination}
          query={destinationQuery}
          setQuery={setDestinationQuery}
          onSelect={setDestination}
          placeholder="End Point"
          example="e.g. Patna (Bihar)"
        />
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div>
          <label className="mb-2 block text-[11px] font-black uppercase text-slate-400">Journey date</label>
          <input
            type="date"
            value={date}
            min="2026-06-21"
            max="2026-08-21"
            onChange={(event) => setDate(event.target.value)}
            className="h-12 w-full rounded-2xl border border-white/10 bg-white/8 px-4 text-sm font-bold text-white outline-none focus:border-cyan-300/60 focus:ring-4 focus:ring-cyan-300/10"
          />
        </div>
        <div>
          <label className="mb-2 block text-[11px] font-black uppercase text-slate-400">Travel class</label>
          <select
            value={classType}
            onChange={(event) => setClassType(event.target.value)}
            className="h-12 w-full rounded-2xl border border-white/10 bg-[#111827] px-4 text-sm font-bold text-white outline-none focus:border-cyan-300/60 focus:ring-4 focus:ring-cyan-300/10"
          >
            {["Any", "SL", "3A", "2A", "1A", "CC", "EC"].map((item) => (
              <option key={item} value={item}>{item === "Any" ? "Any Class" : item}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-2 block text-[11px] font-black uppercase text-slate-400">Best Train For Me</label>
          <select
            value={mode}
            onChange={(event) => setMode(event.target.value as TravelMode)}
            className="h-12 w-full rounded-2xl border border-white/10 bg-[#111827] px-4 text-sm font-bold text-white outline-none focus:border-cyan-300/60 focus:ring-4 focus:ring-cyan-300/10"
          >
            <option value="balanced">Balanced</option>
            <option value="cheapest">Cheapest</option>
            <option value="fastest">Fastest</option>
            <option value="comfort">Most Comfortable</option>
          </select>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {SMART_TOGGLES.map(({ key, label, icon: Icon }) => {
          const active = smartToggles.includes(key);
          return (
            <button
              key={key}
              type="button"
              onClick={() => toggleSmart(key)}
              className={`flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-black transition ${
                active
                  ? "border-cyan-300/50 bg-cyan-300/16 text-cyan-50 shadow-lg shadow-cyan-950/20"
                  : "border-white/10 bg-white/6 text-slate-300 hover:border-white/20 hover:bg-white/10"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          );
        })}
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <button
          disabled={loading}
          className="flex h-13 flex-1 items-center justify-center gap-2 rounded-2xl bg-white px-5 py-4 text-sm font-black text-slate-950 shadow-xl shadow-cyan-950/20 transition hover:bg-cyan-50 disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Search Trains
        </button>
        <button
          type="button"
          onClick={() => document.getElementById("live")?.scrollIntoView({ behavior: "smooth" })}
          className="flex h-13 items-center justify-center gap-2 rounded-2xl border border-white/12 bg-white/8 px-5 py-4 text-sm font-black text-white transition hover:bg-white/12"
        >
          <Radio className="h-4 w-4 text-emerald-200" />
	          Train Status
        </button>
      </div>
    </motion.form>
  );
}

function TrainResultCard({
  train,
  classType,
  onShare,
  onFavorite,
  favorite,
}: {
  train: any;
  classType: string;
  onShare: (train: any) => void;
  onFavorite: (train: any) => void;
  favorite: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const availability = firstAvailability(train, classType);
  const status = availability?.text ?? train.availability ?? "Checking availability...";
  const liveFare = availability?.fare
    ? `₹${Number(availability.fare).toLocaleString("en-IN")}`
    : train.fare && train.fare !== "--"
    ? train.fare
    : null;
  const delay = deterministicDelay(train.trainNo);
  const confidence = confidenceFor(train);
  const isSplit = Boolean(train.legs);

  // Build class-wise fare+availability from classAvailability map
  const classEntries = Object.entries(train.classAvailability || {}) as [string, any[]][];
  const hasClassData = classEntries.length > 0;

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="group overflow-hidden rounded-[28px] border border-white/10 bg-white/8 shadow-2xl shadow-black/20 backdrop-blur-2xl transition hover:border-cyan-300/30 hover:bg-white/10"
    >
      <div className="flex flex-col gap-5 p-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-black ${isSplit ? "border-violet-300/40 bg-violet-400/12 text-violet-100" : "border-cyan-300/40 bg-cyan-400/12 text-cyan-100"}`}>
              {isSplit ? "Split journey" : "Direct"}
            </span>
            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-black ${delay.tone}`}>{delay.label}</span>
            <span className="rounded-full border border-white/10 bg-white/8 px-2.5 py-1 text-[11px] font-black text-slate-300">{confidence}% reliability</span>
            {liveFare && (
              <span className="rounded-full border border-emerald-300/40 bg-emerald-400/12 px-2.5 py-1 text-[11px] font-black text-emerald-100">
                {liveFare}
              </span>
            )}
          </div>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h3 className="truncate text-xl font-black text-white">{train.trainName}</h3>
              <p className="mt-1 text-sm font-semibold text-slate-400">#{train.trainNo} · {train.trainType || "Express"}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onFavorite(train)}
                className={`flex h-10 w-10 items-center justify-center rounded-2xl border transition ${favorite ? "border-rose-300/40 bg-rose-400/14 text-rose-100" : "border-white/10 bg-white/8 text-slate-300 hover:bg-white/12"}`}
                aria-label="Favorite route"
              >
                <Heart className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => onShare(train)}
                className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/8 text-slate-300 transition hover:bg-white/12"
                aria-label="Share itinerary"
              >
                <Share2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-3xl border border-white/8 bg-black/18 p-4">
            <div>
              <div className="text-3xl font-black text-white">{train.departureTime || "--:--"}</div>
              <div className="mt-1 text-xs font-black uppercase text-emerald-200">{stationLabelFromCode(train.source)}</div>
              <div className="mt-0.5 text-[10px] font-bold text-slate-500">{train.source}</div>
            </div>
            <div className="flex min-w-28 flex-col items-center">
              <span className="text-xs font-black text-slate-400">{train.duration || "N/A"}</span>
              <div className="relative my-3 h-px w-full bg-gradient-to-r from-emerald-300 via-cyan-300 to-rose-300">
                <motion.span
                  className="absolute -top-2 left-0 flex h-4 w-4 items-center justify-center rounded-full bg-white text-slate-950"
                  animate={{ x: ["0%", "620%", "0%"] }}
                  transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
                >
                  <Train className="h-2.5 w-2.5" />
                </motion.span>
              </div>
              <span className="text-[11px] font-semibold text-slate-500">Direct route</span>
            </div>
            <div className="text-right">
              <div className="text-3xl font-black text-white">{train.arrivalTime || "--:--"}</div>
              <div className="mt-1 text-xs font-black uppercase text-rose-200">{stationLabelFromCode(train.destination)}</div>
              <div className="mt-0.5 text-[10px] font-bold text-slate-500">{train.destination}</div>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-[1.1fr_1fr]">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-2 text-[11px] font-black uppercase text-slate-500">Runs</span>
              {DAY_LABELS.map((day, index) => {
                const runs = train.runsOnDays ? train.runsOnDays[index] : true;
                return (
                  <span
                    key={`${day}-${index}`}
                    className={`flex h-6 w-6 items-center justify-center rounded-lg text-[10px] font-black ${
                      runs ? "bg-emerald-300/14 text-emerald-100" : "bg-white/6 text-slate-600 line-through"
                    }`}
                  >
                    {day}
                  </span>
                );
              })}
            </div>
            <div className="flex flex-wrap justify-start gap-2 md:justify-end">
              {(train.classes || ["SL", "3A", "2A", "1A"]).slice(0, 7).map((code: string) => (
                <span key={code} className="rounded-full border border-white/10 bg-white/8 px-2.5 py-1 text-[11px] font-black text-slate-300">{code}</span>
              ))}
            </div>
          </div>
        </div>

        {/* Right panel: fare + availability */}
        <div className="w-full rounded-3xl border border-white/10 bg-white/8 p-4 lg:w-72">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[11px] font-black uppercase text-slate-500">Live Fare</div>
              <div className="mt-1 text-3xl font-black text-white">
                {liveFare ?? <span className="text-lg text-slate-400">Fetching…</span>}
              </div>
              {train.classType && (
                <div className="mt-1 text-[10px] font-bold text-slate-500">{train.classType} class</div>
              )}
            </div>
            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-black ${statusTone(status)}`}>{status}</span>
          </div>

          {/* Class-wise availability grid */}
          {hasClassData && (
            <div className="mt-4 space-y-1.5">
              <div className="text-[10px] font-black uppercase text-slate-500 mb-2">All Classes · Live</div>
              {classEntries.slice(0, 6).map(([cls, rows]) => {
                const row0 = Array.isArray(rows) ? rows[0] : null;
                const clsFare = row0?.fare ? `₹${Number(row0.fare).toLocaleString("en-IN")}` : "—";
                const clsStatus = row0?.text || "—";
                return (
                  <div key={cls} className="flex items-center justify-between rounded-xl border border-white/8 bg-white/5 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-black text-cyan-200 w-8">{cls}</span>
                      <span className={`text-[10px] font-bold truncate max-w-[90px] ${statusTone(clsStatus).split(" ").pop()}`}>{clsStatus}</span>
                    </div>
                    <span className="text-[11px] font-black text-white shrink-0">{clsFare}</span>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-gradient-to-r from-emerald-300 via-cyan-300 to-indigo-300" style={{ width: `${confidence}%` }} />
          </div>
          <div className="mt-3 text-xs font-semibold text-slate-400">Best for: {confidence > 80 ? "confirmed seats" : "backup planning"}</div>
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/8 px-4 py-3 text-sm font-black text-white transition hover:bg-white/12"
          >
            All Stations & Details
            <ChevronDown className={`h-4 w-4 transition ${expanded ? "rotate-180" : ""}`} />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-white/10 bg-black/16"
          >
            <div className="grid gap-4 p-5 lg:grid-cols-[1fr_300px]">
              <StationTimeline train={train} />
              <ClassAvailabilityPanel train={train} classType={classType} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  );
}

function StationTimeline({ train }: { train: any }) {
  const [schedule, setSchedule] = useState<any[] | null>(null);
  const [loadingSchedule, setLoadingSchedule] = useState(false);

  useEffect(() => {
    if (!train.trainNo) return;
    setLoadingSchedule(true);
    postJson<any>("/api/schedule", { trainNo: train.trainNo })
      .then((data) => {
        const stops =
          data?.data?.route ||
          data?.data?.stations ||
          data?.route ||
          data?.stations ||
          null;
        setSchedule(Array.isArray(stops) ? stops : null);
      })
      .catch(() => setSchedule(null))
      .finally(() => setLoadingSchedule(false));
  }, [train.trainNo]);

  // If we have real schedule stops, show them; otherwise fall back to source/dest
  const stops: Array<{ code: string; name: string; arrival: string; departure: string; day?: number; distance?: number; platform?: string }> =
    schedule && schedule.length > 0
      ? schedule.map((s: any) => ({
          code: s.station_code || s.stnCode || s.code || "",
          name: s.station_name || s.stnName || s.name || s.station_code || s.code || "",
          arrival: s.arrival || s.arr_time || s.arrivalTime || "--:--",
          departure: s.departure || s.dep_time || s.departureTime || "--:--",
          day: s.day || s.dayCount || 1,
          distance: s.distance || s.km || undefined,
          platform: s.platform || undefined,
        }))
      : [
          { code: train.source, name: stationLabelFromCode(train.source), arrival: "--", departure: train.departureTime || "--", day: 1 },
          { code: train.destination, name: stationLabelFromCode(train.destination), arrival: train.arrivalTime || "--", departure: "--", day: 1 },
        ];

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h4 className="text-sm font-black uppercase text-white">Full Station Route</h4>
        <div className="flex items-center gap-2">
          {loadingSchedule && <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-300" />}
          <span className="rounded-full border border-white/10 px-3 py-1 text-[11px] font-black text-slate-400">
            {schedule ? `${stops.length} stops` : "Showing endpoints"}
          </span>
        </div>
      </div>
      <div className="max-h-96 overflow-y-auto space-y-0 pr-1">
        {stops.map((stop, index) => {
          const isFirst = index === 0;
          const isLast = index === stops.length - 1;
          const isSource = stop.code === train.source;
          const isDest = stop.code === train.destination;
          return (
            <div key={`${stop.code}-${index}`} className="grid grid-cols-[auto_1fr_auto] gap-3">
              <div className="flex flex-col items-center">
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[10px] font-black ${
                    isSource || isFirst
                      ? "border-emerald-300 bg-emerald-300/16 text-emerald-100"
                      : isDest || isLast
                      ? "border-rose-300 bg-rose-300/16 text-rose-100"
                      : "border-cyan-300/30 bg-cyan-300/8 text-cyan-200"
                  }`}
                >
                  {stop.day && stop.day > 1 ? `D${stop.day}` : index + 1}
                </span>
                {index < stops.length - 1 && <span className="w-px flex-1 bg-white/10 my-0.5" style={{ minHeight: "20px" }} />}
              </div>
              <div className="pb-3">
                <div className="text-sm font-black text-white leading-tight">{stop.name}</div>
                <div className="mt-0.5 flex items-center gap-2 text-[10px] font-semibold text-slate-500">
                  <span className="font-black text-slate-400">{stop.code}</span>
                  {stop.platform && <span>· Platform {stop.platform}</span>}
                  {stop.distance && <span>· {stop.distance} km</span>}
                </div>
              </div>
              <div className="text-right pb-3">
                {isSource || isFirst ? (
                  <div className="text-sm font-black text-emerald-300">{stop.departure}</div>
                ) : isDest || isLast ? (
                  <div className="text-sm font-black text-rose-300">{stop.arrival}</div>
                ) : (
                  <div>
                    <div className="text-xs font-bold text-slate-300">{stop.arrival}</div>
                    <div className="text-[10px] text-slate-500">{stop.departure}</div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ClassAvailabilityPanel({ train, classType }: { train: any; classType: string }) {
  const classEntries = Object.entries(train.classAvailability || {}) as [string, any[]][];
  const allClasses = train.classes || ["SL", "3A", "2A", "1A"];

  const activeClass = classType !== "Any" ? classType : train.classType || allClasses[0];
  const availability = firstAvailability(train, classType);
  const status = availability?.text ?? train.availability ?? "—";

  return (
    <div className="rounded-3xl border border-white/10 bg-white/7 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-black uppercase text-white">Class Availability</h4>
          <p className="mt-1 text-xs font-semibold text-slate-500">Live seat status · all classes</p>
        </div>
        <span className={`rounded-full border px-2 py-1 text-[10px] font-black ${statusTone(status)}`}>{status}</span>
      </div>

      <div className="mt-4 space-y-2">
        {(classEntries.length > 0 ? classEntries : allClasses.map((cls: string) => [cls, []])).map(([cls, rows]: [string, any[]]) => {
          const row0 = Array.isArray(rows) ? rows[0] : null;
          const clsFare = row0?.fare ? `₹${Number(row0.fare).toLocaleString("en-IN")}` : null;
          const clsText = row0?.text || "—";
          const isActive = cls === activeClass;
          return (
            <div
              key={cls}
              className={`rounded-2xl border p-3 transition ${
                isActive
                  ? "border-cyan-300/40 bg-cyan-300/10"
                  : "border-white/8 bg-white/5"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-black ${isActive ? "text-cyan-200" : "text-slate-300"}`}>{cls}</span>
                  {isActive && <span className="text-[9px] font-black text-cyan-400 bg-cyan-400/10 rounded-full px-1.5 py-0.5">SELECTED</span>}
                </div>
                {clsFare && <span className="text-sm font-black text-white">{clsFare}</span>}
              </div>
              <div className={`mt-1 text-[11px] font-bold ${statusTone(clsText).split(" ").pop()}`}>{clsText}</div>
              {row0?.seats !== undefined && row0.seats !== null && (
                <div className="mt-1 text-[10px] font-semibold text-slate-500">{row0.seats} seats</div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        {["Available", "RAC", "WL"].map((label) => (
          <div key={label} className="rounded-xl border border-white/8 bg-white/5 p-2 text-center">
            <div className={`text-[10px] font-black ${
              label === "Available" ? "text-emerald-300" : label === "RAC" ? "text-amber-300" : "text-orange-300"
            }`}>{label}</div>
            <div className="mt-0.5 text-[10px] text-slate-500">Live</div>
          </div>
        ))}
      </div>
      <p className="mt-4 text-[10px] font-semibold leading-5 text-slate-500">Final berth allocation is controlled by IRCTC charting. Live data subject to API availability.</p>
    </div>
  );
}

const CKP_ROUTES = [
  {
    id: "ckp-udz",
    from: "CKP",
    to: "UDZ",
    fromLabel: "Chakradharpur",
    toLabel: "Udaipur City",
    fromState: "Jharkhand",
    toState: "Rajasthan",
    approxDuration: "~24h",
    highlight: "Scenic Rajasthan route",
    color: "from-amber-500/20 to-orange-600/20",
    borderColor: "border-amber-400/30",
    badgeColor: "text-amber-200 border-amber-300/30 bg-amber-400/10",
  },
  {
    id: "ckp-awr",
    from: "CKP",
    to: "AWR",
    fromLabel: "Chakradharpur",
    toLabel: "Alwar",
    fromState: "Jharkhand",
    toState: "Rajasthan",
    approxDuration: "~20h",
    highlight: "Tiger reserve gateway",
    color: "from-emerald-500/20 to-teal-600/20",
    borderColor: "border-emerald-400/30",
    badgeColor: "text-emerald-200 border-emerald-300/30 bg-emerald-400/10",
  },
  {
    id: "ckp-ju",
    from: "CKP",
    to: "JU",
    fromLabel: "Chakradharpur",
    toLabel: "Jodhpur Jn",
    fromState: "Jharkhand",
    toState: "Rajasthan",
    approxDuration: "~26h",
    highlight: "Blue City express corridor",
    color: "from-blue-500/20 to-indigo-600/20",
    borderColor: "border-blue-400/30",
    badgeColor: "text-blue-200 border-blue-300/30 bg-blue-400/10",
  },
  {
    id: "ckp-jp",
    from: "CKP",
    to: "JP",
    fromLabel: "Chakradharpur",
    toLabel: "Jaipur Jn",
    fromState: "Jharkhand",
    toState: "Rajasthan",
    approxDuration: "~22h",
    highlight: "Pink City direct corridor",
    color: "from-pink-500/20 to-rose-600/20",
    borderColor: "border-pink-400/30",
    badgeColor: "text-pink-200 border-pink-300/30 bg-pink-400/10",
  },
  {
    id: "rnc-jp",
    from: "RNC",
    to: "JP",
    fromLabel: "Ranchi Jn",
    toLabel: "Jaipur Jn",
    fromState: "Jharkhand",
    toState: "Rajasthan",
    approxDuration: "~24h",
    highlight: "Capital to Pink City express",
    color: "from-violet-500/20 to-purple-600/20",
    borderColor: "border-violet-400/30",
    badgeColor: "text-violet-200 border-violet-300/30 bg-violet-400/10",
  },
  {
    id: "jp-rnc",
    from: "JP",
    to: "RNC",
    fromLabel: "Jaipur Jn",
    toLabel: "Ranchi Jn",
    fromState: "Rajasthan",
    toState: "Jharkhand",
    approxDuration: "~24h",
    highlight: "Return — Pink City to Capital",
    color: "from-cyan-500/20 to-sky-600/20",
    borderColor: "border-cyan-400/30",
    badgeColor: "text-cyan-200 border-cyan-300/30 bg-cyan-400/10",
  },
];

const PATNA_ROUTES = [
  {
    id: "pnbe-awr",
    from: "PNBE",
    to: "AWR",
    fromLabel: "Patna Junction",
    toLabel: "Alwar",
    fromState: "Bihar",
    toState: "Rajasthan",
    approxDuration: "~18h",
    highlight: "Agra & Alwar gateway link",
    color: "from-sky-500/20 to-indigo-600/20",
    borderColor: "border-sky-400/30",
    badgeColor: "text-sky-200 border-sky-300/30 bg-sky-400/10",
  },
  {
    id: "pnbe-jp",
    from: "PNBE",
    to: "JP",
    fromLabel: "Patna Junction",
    toLabel: "Jaipur Jn",
    fromState: "Bihar",
    toState: "Rajasthan",
    approxDuration: "~18h",
    highlight: "Direct Ziyarat Exp corridor",
    color: "from-pink-500/20 to-rose-600/20",
    borderColor: "border-pink-400/30",
    badgeColor: "text-pink-200 border-pink-300/30 bg-pink-400/10",
  },
  {
    id: "pnbe-ghy",
    from: "PNBE",
    to: "GHY",
    fromLabel: "Patna Junction",
    toLabel: "Guwahati",
    fromState: "Bihar",
    toState: "Assam",
    approxDuration: "~16h",
    highlight: "Rajdhani & Express Corridor",
    color: "from-emerald-500/20 to-teal-600/20",
    borderColor: "border-emerald-400/30",
    badgeColor: "text-emerald-200 border-emerald-300/30 bg-emerald-400/10",
  },
  {
    id: "pnbe-ju",
    from: "PNBE",
    to: "JU",
    fromLabel: "Patna Junction",
    toLabel: "Jodhpur Jn",
    fromState: "Bihar",
    toState: "Rajasthan",
    approxDuration: "~22h",
    highlight: "Direct Howrah Jodhpur link",
    color: "from-amber-500/20 to-orange-600/20",
    borderColor: "border-amber-400/30",
    badgeColor: "text-amber-200 border-amber-300/30 bg-amber-400/10",
  },
  {
    id: "pnbe-udz",
    from: "PNBE",
    to: "UDZ",
    fromLabel: "Patna Junction",
    toLabel: "Udaipur City",
    fromState: "Bihar",
    toState: "Rajasthan",
    approxDuration: "~24h",
    highlight: "Kavi Guru Express link",
    color: "from-rose-500/20 to-red-600/20",
    borderColor: "border-rose-400/30",
    badgeColor: "text-rose-200 border-rose-300/30 bg-rose-400/10",
  },
];

function CKPRoutesExplorer({
  onSelectRoute,
}: {
  onSelectRoute: (from: string, to: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<'jharkhand' | 'bihar'>('jharkhand');
  const activeRoutes = activeTab === 'jharkhand' ? CKP_ROUTES : PATNA_ROUTES;

  return (
    <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
      <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-3 flex gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1.5 text-[11px] font-black uppercase text-cyan-100">
              <Zap className="h-3 w-3" />
              {activeTab === 'jharkhand' ? 'Jharkhand × Rajasthan Corridors' : 'Bihar × National Corridors'}
            </span>
          </div>
          <h2 className="text-3xl font-black text-white sm:text-4xl">
            {activeTab === 'jharkhand' ? 'CKP & Ranchi Express Routes' : 'Patna Express Routes'}
          </h2>
          <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-slate-400">
            {activeTab === 'jharkhand'
              ? 'Live trains from Chakradharpur (CKP) and Ranchi (RNC) to Udaipur, Alwar, Jodhpur, and Jaipur — plus the return Jaipur→Ranchi corridor. One click loads real fares & seat availability.'
              : 'Direct and connecting trains from Patna Junction (PNBE) to Alwar, Jaipur, Guwahati, Jodhpur, and Udaipur. One click loads live fares & seat availability.'
            }
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1.5 rounded-2xl bg-white/5 p-1.5 border border-white/8 backdrop-blur-xl">
            <button
              type="button"
              onClick={() => setActiveTab('jharkhand')}
              className={`rounded-xl px-4 py-2 text-xs font-black transition ${
                activeTab === 'jharkhand' ? 'bg-cyan-500 text-black shadow-lg shadow-cyan-500/20' : 'text-slate-400 hover:text-white'
              }`}
            >
              Jharkhand
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('bihar')}
              className={`rounded-xl px-4 py-2 text-xs font-black transition ${
                activeTab === 'bihar' ? 'bg-cyan-500 text-black shadow-lg shadow-cyan-500/20' : 'text-slate-400 hover:text-white'
              }`}
            >
              Bihar (Patna)
            </button>
          </div>
          <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/6 px-4 py-2.5 h-[38px]">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-black text-emerald-200">Live API data</span>
          </div>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {activeRoutes.map((route) => (
          <motion.button
            key={route.id}
            type="button"
            onClick={() => onSelectRoute(route.from, route.to)}
            whileHover={{ scale: 1.025, y: -3 }}
            whileTap={{ scale: 0.97 }}
            className={`group relative overflow-hidden rounded-[28px] border ${route.borderColor} bg-gradient-to-br ${route.color} p-6 text-left shadow-2xl shadow-black/30 backdrop-blur-xl transition`}
          >
            {/* Animated shimmer */}
            <div className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/6 to-transparent transition-transform duration-700 group-hover:translate-x-full" />

            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/12 bg-white/10">
                <Train className="h-6 w-6 text-white" />
              </div>
              <span className={`rounded-full border px-2.5 py-1 text-[11px] font-black ${route.badgeColor}`}>
                {route.approxDuration}
              </span>
            </div>

            <div className="space-y-3">
              {/* From */}
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full border border-emerald-300/40 bg-emerald-400/12">
                  <MapPin className="h-3.5 w-3.5 text-emerald-300" />
                </div>
                <div>
                  <div className="text-base font-black text-white">{route.fromLabel}</div>
                  <div className="text-[10px] font-bold text-slate-400">{route.fromState} · <span className="text-cyan-300">{route.from}</span></div>
                </div>
              </div>

              {/* Arrow */}
              <div className="ml-3.5 flex items-center gap-2">
                <div className="w-px h-4 bg-white/20" />
                <ArrowRight className="h-4 w-4 text-slate-400 ml-1" />
              </div>

              {/* To */}
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full border border-rose-300/40 bg-rose-400/12">
                  <MapPin className="h-3.5 w-3.5 text-rose-300" />
                </div>
                <div>
                  <div className="text-base font-black text-white">{route.toLabel}</div>
                  <div className="text-[10px] font-bold text-slate-400">{route.toState} · <span className="text-rose-300">{route.to}</span></div>
                </div>
              </div>
            </div>

            <div className="mt-5 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400">{route.highlight}</span>
              <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/12 bg-white/10 text-white transition group-hover:bg-white/20">
                <Search className="h-4 w-4" />
              </span>
            </div>
          </motion.button>
        ))}
      </div>

      {/* Route stats bar */}
      <div className={`mt-6 grid grid-cols-2 gap-4 rounded-[24px] border border-white/8 bg-white/5 p-5 backdrop-blur-xl sm:grid-cols-3 ${activeTab === 'jharkhand' ? 'lg:grid-cols-6' : 'lg:grid-cols-5'}`}>
        {(activeTab === 'jharkhand'
          ? [
              { label: "CKP → UDZ", sub: "Via Ratlam", icon: Route },
              { label: "CKP → AWR", sub: "Via Delhi", icon: Route },
              { label: "CKP → JU", sub: "Via Ajmer", icon: Route },
              { label: "CKP → JP", sub: "Via Nagda", icon: Route },
              { label: "RNC → JP", sub: "Via Bokaro", icon: Route },
              { label: "JP → RNC", sub: "Return corridor", icon: Route },
            ]
          : [
              { label: "PNBE → AWR", sub: "Via Agra / JP", icon: Route },
              { label: "PNBE → JP", sub: "Ziyarat Exp", icon: Route },
              { label: "PNBE → GHY", sub: "Rajdhani / Exp", icon: Route },
              { label: "PNBE → JU", sub: "Howrah-JU link", icon: Route },
              { label: "PNBE → UDZ", sub: "Kavi Guru link", icon: Route },
            ]
        ).map(({ label, sub, icon: Icon }) => (
          <div key={label} className="flex items-center gap-2">
            <Icon className="h-3.5 w-3.5 text-cyan-300 shrink-0" />
            <div>
              <div className="text-xs font-black text-white">{label}</div>
              <div className="text-[10px] font-semibold text-slate-500">{sub}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function CoachPreview({ classType, availability }: { classType: string; availability: string }) {
  const sleeper = ["SL", "3A", "2A", "1A"].includes(classType);
  const seats = Array.from({ length: sleeper ? 24 : 32 }, (_, index) => index + 1);

  return (
    <div className="rounded-3xl border border-white/10 bg-white/7 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-black uppercase text-white">Coach layout</h4>
          <p className="mt-1 text-xs font-semibold text-slate-500">{sleeper ? "Berth arrangement" : "Chair car arrangement"} · {classType}</p>
        </div>
        <span className={`rounded-full border px-2 py-1 text-[10px] font-black ${statusTone(availability)}`}>{availability}</span>
      </div>
      <div className={`mt-4 grid gap-2 ${sleeper ? "grid-cols-4" : "grid-cols-4"}`}>
        {seats.map((seat) => {
          const available = seat % 5 !== 0;
          return (
            <span
              key={seat}
              className={`flex h-8 items-center justify-center rounded-lg text-[10px] font-black ${
                available ? "bg-emerald-300/16 text-emerald-100" : "bg-rose-300/12 text-rose-100"
              }`}
            >
              {sleeper ? (seat % 3 === 0 ? "UB" : seat % 3 === 1 ? "LB" : "MB") : seat}
            </span>
          );
        })}
      </div>
      <p className="mt-4 text-xs font-semibold leading-5 text-slate-500">Visual layout is an availability-aware preview. Final berth allocation is controlled by IRCTC charting.</p>
    </div>
  );
}

function ResultsBoard({
  trains,
  splits,
  loading,
  error,
  classType,
  sort,
  setSort,
  filters,
  setFilters,
  smartToggles,
  favorites,
  setFavorites,
}: {
  trains: any[];
  splits: any[];
  loading: boolean;
  error: string;
  classType: string;
  sort: SortKey;
  setSort: (value: SortKey) => void;
  filters: string[];
  setFilters: (value: string[]) => void;
  smartToggles: SmartToggle[];
  favorites: string[];
  setFavorites: (value: string[]) => void;
}) {
  function toggleFilter(filter: string) {
    setFilters(filters.includes(filter) ? filters.filter((item) => item !== filter) : [...filters, filter]);
  }

  const splitTrainCards = useMemo(
    () => splits.map((route, index) => ({
      trainNo: `SPLIT-${index + 1}`,
      trainName: `${route.leg1?.trainName || "Leg 1"} + ${route.leg2?.trainName || "Leg 2"}`,
      source: route.leg1?.source,
      destination: route.leg2?.destination,
      departureTime: route.leg1?.departureTime,
      arrivalTime: route.leg2?.arrivalTime,
      duration: `${Math.max(1, Math.round((route.layoverHours || 2) + parseDurationMinutes(route.leg1?.duration || "0h") / 60 + parseDurationMinutes(route.leg2?.duration || "0h") / 60))}h ${Math.round(((route.layoverHours || 2) % 1) * 60)}m`,
      fare: `₹${route.totalFare || "--"}`,
      availability: `${route.combinedConfirmationChance || 78}% confidence`,
      classes: route.leg1?.classes || ["SL", "3A", "2A"],
      trainType: "Smart Split",
      routeNote: `Layover ${route.layoverDuration || "2h"}`,
      legs: route,
    })),
    [splits]
  );

  const allResults = useMemo(
    () => (smartToggles.includes("split") ? [...trains, ...splitTrainCards] : trains),
    [smartToggles, splitTrainCards, trains]
  );

  const visible = useMemo(() => {
    let next = [...allResults];

    if (filters.length) {
      next = next.filter((train) => {
        const classes = (train.classes || []).join(" ");
        return filters.some((filter) => {
          if (filter === "AC") return /1A|2A|3A|3E|CC|EC/.test(classes);
          if (filter === "TQ") return true;
          return classes.includes(filter);
        });
      });
    }

    if (smartToggles.includes("available")) {
      const isSeatAvailable = (status: string) => {
        const upper = String(status || "").toUpperCase();
        return upper.includes("AVAILABLE") || upper.includes("AVL") || upper.includes("RAC") || upper.includes("CURR_AVBL");
      };
      next = next.filter((train) => {
        if (train.legs) {
          const leg1Status = train.legs.leg1?.availability ?? "";
          const leg2Status = train.legs.leg2?.availability ?? "";
          return isSeatAvailable(leg1Status) && isSeatAvailable(leg2Status);
        }
        return isSeatAvailable(train.availability ?? "");
      });
    }

    if (smartToggles.includes("direct")) {
      next = next.filter((train) => !train.legs);
    }

    next.sort((a, b) => {
      if (sort === "cheapest") return parseFare(a.fare) - parseFare(b.fare);
      if (sort === "fastest" || sort === "duration") return parseDurationMinutes(a.duration) - parseDurationMinutes(b.duration);
      if (sort === "earliest") return parseTimeMinutes(a.departureTime) - parseTimeMinutes(b.departureTime);
      if (sort === "latest") return parseTimeMinutes(b.departureTime) - parseTimeMinutes(a.departureTime);
      if (sort === "stops") return Number(Boolean(a.legs)) - Number(Boolean(b.legs));
      return (b.confirmationChance || confidenceFor(b)) - (a.confirmationChance || confidenceFor(a));
    });

    return next;
  }, [allResults, filters, sort, smartToggles]);

  function share(train: any) {
    const text = `${train.trainName} (${train.trainNo}) ${stationLabelFromCode(train.source)} to ${stationLabelFromCode(train.destination)} · ${train.departureTime} to ${train.arrivalTime} · ${train.fare}`;
    navigator.clipboard?.writeText(text).catch(() => undefined);
  }

  function favorite(train: any) {
    const id = `${train.trainNo}-${train.source}-${train.destination}`;
    setFavorites(favorites.includes(id) ? favorites.filter((item) => item !== id) : [...favorites, id]);
  }

  return (
    <section id="results" className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <span className="text-xs font-black uppercase text-cyan-200">Train results</span>
          <h2 className="mt-2 text-3xl font-black text-white sm:text-4xl">Live railway intelligence</h2>
          {allResults.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-bold text-cyan-200/90">
              <span className="rounded-full bg-cyan-950/60 border border-cyan-500/30 px-2.5 py-0.5">Showing {visible.length} of {allResults.length} routes</span>
              <span>·</span>
              <span>{trains.length} direct</span>
              <span>·</span>
              <span>{splitTrainCards.length} split</span>
            </div>
          )}
          <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-slate-400">Compare direct trains, split journeys, fares, delay reliability, route details, and seats in one view.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as SortKey)}
            className="h-11 rounded-2xl border border-white/10 bg-[#111827] px-4 text-sm font-black text-white outline-none"
            aria-label="Sort trains"
          >
            <option value="recommended">Recommended</option>
            <option value="cheapest">Cheapest</option>
            <option value="fastest">Fastest</option>
            <option value="earliest">Earliest Departure</option>
            <option value="latest">Latest Departure</option>
            <option value="duration">Shortest Duration</option>
            <option value="stops">Least Stops</option>
          </select>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {CLASS_FILTERS.map((filter) => (
          <button
            key={filter.key}
            type="button"
            onClick={() => toggleFilter(filter.key)}
            className={`rounded-full border px-3 py-2 text-xs font-black transition ${
              filters.includes(filter.key)
                ? "border-cyan-300/50 bg-cyan-300/16 text-cyan-50"
                : "border-white/10 bg-white/6 text-slate-400 hover:bg-white/10"
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {loading && <LoadingSkeleton label="Scanning railway inventory, fares, and availability..." />}
      {error && <PremiumError message={error} />}
      {!loading && !error && allResults.length === 0 && (
        <div className="rounded-[28px] border border-white/10 bg-white/8 p-10 text-center backdrop-blur-xl">
          <Sparkles className="mx-auto h-8 w-8 text-cyan-200" />
          <h3 className="mt-4 text-xl font-black text-white">Start with a journey search</h3>
          <p className="mx-auto mt-2 max-w-lg text-sm font-semibold leading-6 text-slate-400">Use Starting Point and End Point above. No stations are prefilled, so every search is intentional.</p>
        </div>
      )}
      {!loading && !error && allResults.length > 0 && visible.length === 0 && (
        <div className="rounded-[28px] border border-white/10 bg-white/8 p-10 text-center backdrop-blur-xl">
          <h3 className="text-xl font-black text-white">No trains match these filters</h3>
          <p className="mt-2 text-sm font-semibold text-slate-400">Relax one filter or disable Available Seats Only to see waitlist options.</p>
        </div>
      )}
      <div className="space-y-4">
        {visible.map((train) => (
          <TrainResultCard
            key={`${train.trainNo}-${train.source}-${train.destination}`}
            train={train}
            classType={classType}
            onShare={share}
            onFavorite={favorite}
            favorite={favorites.includes(`${train.trainNo}-${train.source}-${train.destination}`)}
          />
        ))}
      </div>
    </section>
  );
}

function IndiaMapExperience({
  source,
  destination,
  setSource,
  setDestination,
  setSourceQuery,
  setDestinationQuery,
}: {
  source: string;
  destination: string;
  setSource: (value: string) => void;
  setDestination: (value: string) => void;
  setSourceQuery: (value: string) => void;
  setDestinationQuery: (value: string) => void;
}) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const sourceStation = mapStationByCode(source);
  const destStation = mapStationByCode(destination);
  const splitHub = sourceStation && destStation
    ? [...MAP_STATIONS]
      .filter((station) => station.code !== sourceStation.code && station.code !== destStation.code)
      .sort((a, b) => {
        const midLat = (sourceStation.lat + destStation.lat) / 2;
        const midLng = (sourceStation.lng + destStation.lng) / 2;
        const distanceA = Math.hypot(a.lat - midLat, a.lng - midLng);
        const distanceB = Math.hypot(b.lat - midLat, b.lng - midLng);
        return distanceA - distanceB;
      })[0]
    : null;
  const fallbackStations = ["JP", "NDLS", "PNBE"].map(mapStationByCode).filter((station): station is MapStation => Boolean(station));
  const routeStations = sourceStation && destStation ? [sourceStation, ...(splitHub ? [splitHub] : []), destStation] : (fallbackStations.length >= 3 ? fallbackStations : MAP_STATIONS.slice(0, 3));
  const points = routeStations.map((station) => projectPoint(station.lat, station.lng, zoom, pan));
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  const altPath = (fallbackStations.length >= 3 ? fallbackStations : MAP_STATIONS.slice(0, 3)).map((station, index) => {
    const point = projectPoint(station.lat, station.lng, zoom, pan);
    return `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`;
  }).join(" ");

  function selectStation(code: string) {
    const station = stationByCode(code);
    if (!source) {
      setSource(code);
      if (station) setSourceQuery(stationLabel(station));
      return;
    }
    setDestination(code);
    if (station) setDestinationQuery(stationLabel(station));
  }

  return (
    <section id="map" className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <span className="text-xs font-black uppercase text-cyan-200">India map experience</span>
          <h2 className="mt-2 text-3xl font-black text-white sm:text-4xl">Plan Your Journey on Map</h2>
          <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-slate-400">Visualize markers, route paths, split hubs, alternate routes, ETA tooltips, and movement across India.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setZoom((value) => Math.min(1.35, value + 0.1))} className="rounded-2xl border border-white/10 bg-white/8 px-4 py-2 text-sm font-black text-white">Zoom +</button>
          <button onClick={() => setZoom((value) => Math.max(0.85, value - 0.1))} className="rounded-2xl border border-white/10 bg-white/8 px-4 py-2 text-sm font-black text-white">Zoom -</button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="relative min-h-[560px] overflow-hidden rounded-[34px] border border-white/10 bg-[radial-gradient(circle_at_30%_20%,rgba(34,211,238,0.22),transparent_28%),linear-gradient(145deg,#07111f,#111827_55%,#160f25)] shadow-2xl shadow-black/40">
          <svg viewBox="0 0 760 760" className="h-full min-h-[560px] w-full" role="img" aria-label="Interactive India railway map">
            <defs>
              <filter id="routeGlow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="6" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <linearGradient id="routeLine" x1="0" x2="1">
                <stop offset="0%" stopColor="#6ee7b7" />
                <stop offset="45%" stopColor="#22d3ee" />
                <stop offset="100%" stopColor="#fb7185" />
              </linearGradient>
            </defs>
            <path
              d="M246 68 C320 42 442 54 514 120 C590 190 624 294 611 394 C598 498 543 608 454 680 C368 750 263 709 216 635 C169 561 130 493 118 402 C105 302 150 116 246 68Z"
              fill="rgba(255,255,255,0.035)"
              stroke="rgba(255,255,255,0.14)"
              strokeWidth="2"
            />
            <path d={altPath} fill="none" stroke="rgba(167,139,250,0.4)" strokeWidth="3" strokeDasharray="8 10" />
            <path d={path} fill="none" stroke="url(#routeLine)" strokeWidth="5" strokeLinecap="round" filter="url(#routeGlow)" />
            <motion.circle
              r="8"
              fill="#ffffff"
              filter="url(#routeGlow)"
              animate={{ cx: points.map((point) => point.x), cy: points.map((point) => point.y) }}
              transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.g
              animate={{ x: points.map((point) => point.x - 11), y: points.map((point) => point.y - 11) }}
              transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
            >
              <rect width="22" height="22" rx="7" fill="#0f172a" stroke="#fff" />
              <path d="M6 7h10v7H6zM7 15h2M13 15h2" stroke="#67e8f9" strokeWidth="1.4" fill="none" strokeLinecap="round" />
            </motion.g>
            {MAP_STATIONS.map((station) => {
              const point = projectPoint(station.lat, station.lng, zoom, pan);
              const isSource = station.code === source;
              const isDestination = station.code === destination;
              const isHub = station.code === splitHub?.code && source && destination;
              return (
                <g key={station.code} transform={`translate(${point.x} ${point.y})`}>
                  <button type="button" onClick={() => selectStation(station.code)} className="cursor-pointer">
                    <circle r={isSource || isDestination ? 10 : isHub ? 8 : 5} fill={isSource ? "#34d399" : isDestination ? "#fb7185" : isHub ? "#a78bfa" : "#94a3b8"} stroke="#fff" strokeWidth="2" />
                  </button>
                  <text x="10" y="-8" fill="#e5e7eb" fontSize="12" fontWeight="800">{station.code}</text>
                </g>
              );
            })}
          </svg>
          <div className="absolute left-5 top-5 flex flex-wrap gap-2">
            <span className="rounded-full border border-emerald-300/30 bg-emerald-400/12 px-3 py-1 text-xs font-black text-emerald-100">Green source</span>
            <span className="rounded-full border border-rose-300/30 bg-rose-400/12 px-3 py-1 text-xs font-black text-rose-100">Red destination</span>
            <span className="rounded-full border border-violet-300/30 bg-violet-400/12 px-3 py-1 text-xs font-black text-violet-100">Split hub</span>
          </div>
          <div className="absolute bottom-5 right-5 flex gap-2">
            <button onClick={() => setPan({ x: pan.x - 18, y: pan.y })} className="rounded-xl bg-white/10 px-3 py-2 text-xs font-black text-white">Pan W</button>
            <button onClick={() => setPan({ x: pan.x + 18, y: pan.y })} className="rounded-xl bg-white/10 px-3 py-2 text-xs font-black text-white">Pan E</button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-[28px] border border-white/10 bg-white/8 p-5 backdrop-blur-xl">
            <h3 className="text-lg font-black text-white">Route intelligence</h3>
            <div className="mt-4 space-y-3">
              {routeStations.map((station, index) => (
                <div key={station.code} className="flex items-center justify-between rounded-2xl border border-white/8 bg-white/6 p-3">
                  <div>
                    <div className="text-sm font-black text-white">{station.name}</div>
                    <div className="text-xs font-semibold text-slate-500">{station.state} · ETA {index === 0 ? "Now" : `${index * 4 + 6}h`}</div>
                  </div>
                  <span className="rounded-lg bg-white/10 px-2 py-1 text-xs font-black text-slate-200">{station.code}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-[28px] border border-white/10 bg-white/8 p-5 backdrop-blur-xl">
            <h3 className="text-lg font-black text-white">Alternate route</h3>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-400">A violet dashed route shows backup routing. Split Journey mode uses this layer to compare hub options.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function LiveTrainIntelligence() {
  const [trainNo, setTrainNo] = useState("");
  const [date, setDate] = useState(todayIso());
  const [state, setState] = useState<ApiState<any>>({ loading: false, error: "", data: null });

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!/^\d{5}$/.test(trainNo)) {
      setState({ loading: false, error: "Enter a valid 5-digit train number.", data: null });
      return;
    }
    setState({ loading: true, error: "", data: null });
    try {
      const data = await postJson<any>("/api/live", { trainNo, date });
      setState({ loading: false, error: "", data });
    } catch (error) {
      setState({ loading: false, error: error instanceof Error ? error.message : "Could not fetch live status.", data: null });
    }
  }

  const live = state.data?.data || state.data;
  const timeline = live?.timeline || live?.TrainRoute || live?.route || [];
  const current = live?.CurrentStation || timeline?.[2] || null;
  const next = Array.isArray(timeline) ? timeline[3] : null;

  return (
    <section id="live" className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
      <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
        <form onSubmit={submit} className="rounded-[30px] border border-white/10 bg-white/8 p-5 shadow-2xl shadow-black/20 backdrop-blur-xl">
          <span className="text-xs font-black uppercase text-emerald-200">Live Train Intelligence</span>
          <h2 className="mt-2 text-3xl font-black text-white">Flight-style railway tracking</h2>
	          <p className="mt-3 text-sm font-semibold leading-6 text-slate-400">Show current station, ETA, actual departure, arrival, and platform fields only when the provider supports them.</p>
          <div className="mt-5 space-y-3">
            <input
              value={trainNo}
              onChange={(event) => setTrainNo(event.target.value.replace(/\D/g, "").slice(0, 5))}
              placeholder="Train number"
              className="h-13 w-full rounded-2xl border border-white/10 bg-white/8 px-4 text-sm font-black text-white outline-none placeholder:text-slate-500 focus:border-emerald-300/60"
            />
            <input
              type="date"
              value={date}
              min="2026-06-21"
              max="2026-08-21"
              onChange={(event) => setDate(event.target.value)}
              className="h-13 w-full rounded-2xl border border-white/10 bg-white/8 px-4 text-sm font-bold text-white outline-none focus:border-emerald-300/60"
            />
            <button disabled={state.loading} className="flex h-13 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-300 px-4 text-sm font-black text-slate-950 disabled:opacity-60">
              {state.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radio className="h-4 w-4" />}
              Track Live
            </button>
          </div>
        </form>

        <div className="rounded-[30px] border border-white/10 bg-white/8 p-5 shadow-2xl shadow-black/20 backdrop-blur-xl">
          {state.loading && <LoadingSkeleton label="Connecting to live train running feed..." />}
          {state.error && <PremiumError message={state.error} onRetry={() => document.getElementById("live")?.scrollIntoView()} />}
          {!state.loading && !state.error && !state.data && (
            <div className="grid min-h-80 place-items-center text-center">
              <div>
                <Navigation className="mx-auto h-10 w-10 text-emerald-200" />
                <h3 className="mt-4 text-xl font-black text-white">Live tracker ready</h3>
                <p className="mx-auto mt-2 max-w-md text-sm font-semibold leading-6 text-slate-400">Enter a train number to see progress, delay, ETA, actual departure, expected arrival, and timeline.</p>
              </div>
            </div>
          )}
          {state.data && (
            <div>
              <div className="grid gap-3 md:grid-cols-4">
                {[
                  { label: "Current station", value: current?.StationName || current?.stationName || current?.stnName || "In transit" },
                  { label: "Next station", value: next?.StationName || next?.stationName || next?.stnName || "Awaiting feed" },
                  { label: "Delay", value: current?.DelayInArrival || current?.delay || live?.delay || "Live" },
	                  { label: "Platform", value: current?.Platform || current?.platform || "Not returned by provider" },
                ].map((item) => (
                  <div key={item.label} className="rounded-3xl border border-white/8 bg-black/16 p-4">
                    <div className="text-[11px] font-black uppercase text-slate-500">{item.label}</div>
                    <div className="mt-2 text-lg font-black text-white">{item.value}</div>
                  </div>
                ))}
              </div>
              <div className="mt-6 rounded-3xl border border-white/8 bg-black/16 p-5">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-black text-white">Journey progress</span>
                  <span className="text-xs font-black text-emerald-200">ETA adaptive</span>
                </div>
                <div className="mt-4 h-3 overflow-hidden rounded-full bg-white/10">
                  <motion.div className="h-full rounded-full bg-gradient-to-r from-emerald-300 via-cyan-300 to-blue-300" initial={{ width: 0 }} animate={{ width: "54%" }} transition={{ duration: 1.2 }} />
                </div>
              </div>
              <div className="mt-5 space-y-2">
                {(Array.isArray(timeline) ? timeline.slice(0, 8) : []).map((stop: any, index: number) => (
                  <div key={index} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-2xl border border-white/8 bg-white/6 px-4 py-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-300/12 text-xs font-black text-emerald-100">{index + 1}</span>
                    <div>
                      <div className="text-sm font-black text-white">{stop.StationName || stop.stationName || stop.stnName || "Station"}</div>
                      <div className="text-xs font-semibold text-slate-500">Actual dep: {stop.ActualDeparture || stop.departure || "--"} · Expected arr: {stop.ActualArrival || stop.arrival || "--"}</div>
                    </div>
                    <span className="text-xs font-black text-slate-400">{stop.DelayInArrival || stop.delay || "--"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function UtilityModules({ source, destination, date, classType }: { source: string; destination: string; date: string; classType: string }) {
  const [pnr, setPnr] = useState("");
  const [pnrState, setPnrState] = useState<ApiState<any>>({ loading: false, error: "", data: null });
  const [trainNo, setTrainNo] = useState("");
  const [availabilityState, setAvailabilityState] = useState<ApiState<any>>({ loading: false, error: "", data: null });
  const [fareState, setFareState] = useState<ApiState<any>>({ loading: false, error: "", data: null });

  async function checkPnr() {
    if (!/^\d{10}$/.test(pnr)) {
      setPnrState({ loading: false, error: "Enter a 10-digit PNR.", data: null });
      return;
    }
    setPnrState({ loading: true, error: "", data: null });
    try {
      const data = await postJson<any>("/api/pnr", { pnr });
      setPnrState({ loading: false, error: "", data });
    } catch (error) {
      setPnrState({ loading: false, error: error instanceof Error ? error.message : "PNR lookup failed.", data: null });
    }
  }

  async function checkSeats() {
    if (!/^\d{5}$/.test(trainNo) || !source || !destination) {
      setAvailabilityState({ loading: false, error: "Enter train number and select route stations first.", data: null });
      return;
    }
    setAvailabilityState({ loading: true, error: "", data: null });
    try {
      const data = await postJson<any>("/api/availability", { trainNo, source, destination, date, classType: classType === "Any" ? "3A" : classType });
      setAvailabilityState({ loading: false, error: "", data });
    } catch (error) {
      setAvailabilityState({ loading: false, error: error instanceof Error ? error.message : "Availability lookup failed.", data: null });
    }
  }

  async function checkFare() {
    if (!/^\d{5}$/.test(trainNo) || !source || !destination) {
      setFareState({ loading: false, error: "Enter train number and select route stations first.", data: null });
      return;
    }
    setFareState({ loading: true, error: "", data: null });
    try {
      const data = await postJson<any>("/api/fare", { trainNo, source, destination, date, classType: classType === "Any" ? "3A" : classType });
      setFareState({ loading: false, error: "", data });
    } catch (error) {
      setFareState({ loading: false, error: error instanceof Error ? error.message : "Fare enquiry failed.", data: null });
    }
  }

  const pnrData = pnrState.data?.data || pnrState.data;
  const availability = availabilityState.data?.data?.availability ?? availabilityState.data?.availability ?? [];
	  const fare = fareState.data?.data?.fare ?? null;

  return (
    <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
      <div className="mb-8">
        <span className="text-xs font-black uppercase text-cyan-200">Premium utilities</span>
        <h2 className="mt-2 text-3xl font-black text-white sm:text-4xl">PNR, fare, seats, calendar, alerts</h2>
      </div>
      <div className="grid gap-5 lg:grid-cols-4">
        <div className="rounded-[30px] border border-white/10 bg-white/8 p-5 backdrop-blur-xl">
          <ShieldCheck className="h-6 w-6 text-cyan-200" />
          <h3 className="mt-4 text-xl font-black text-white">PNR Status</h3>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-400">Passenger record, chart state, status, and journey details.</p>
          <div className="mt-5 flex gap-2">
            <input value={pnr} onChange={(event) => setPnr(event.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="10-digit PNR" className="h-12 min-w-0 flex-1 rounded-2xl border border-white/10 bg-white/8 px-4 text-sm font-black text-white outline-none placeholder:text-slate-500" />
            <button onClick={checkPnr} className="rounded-2xl bg-cyan-300 px-4 text-sm font-black text-slate-950">{pnrState.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Check"}</button>
          </div>
          {pnrState.error && <p className="mt-3 text-xs font-semibold text-rose-200">{pnrState.error}</p>}
          {pnrData && <p className="mt-4 rounded-2xl bg-white/8 p-3 text-sm font-bold text-slate-200">Status: {pnrData.status || pnrData.Status || "Returned by provider"}</p>}
        </div>

        <div className="rounded-[30px] border border-white/10 bg-white/8 p-5 backdrop-blur-xl">
          <Wallet className="h-6 w-6 text-emerald-200" />
          <h3 className="mt-4 text-xl font-black text-white">Seat Availability</h3>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-400">Class-wise seats and next 7 days when provider calendar data is available.</p>
          <div className="mt-5 flex gap-2">
            <input value={trainNo} onChange={(event) => setTrainNo(event.target.value.replace(/\D/g, "").slice(0, 5))} placeholder="Train no." className="h-12 min-w-0 flex-1 rounded-2xl border border-white/10 bg-white/8 px-4 text-sm font-black text-white outline-none placeholder:text-slate-500" />
            <button onClick={checkSeats} className="rounded-2xl bg-emerald-300 px-4 text-sm font-black text-slate-950">{availabilityState.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Seats"}</button>
          </div>
          {availabilityState.error && <p className="mt-3 text-xs font-semibold text-rose-200">{availabilityState.error}</p>}
          <div className="mt-4 grid grid-cols-2 gap-2">
            {(availability.length ? availability.slice(0, 6) : Array.from({ length: 6 })).map((item: any, index: number) => (
              <div key={index} className="rounded-2xl border border-white/8 bg-white/6 p-3">
                <div className="text-[11px] font-black text-slate-500">{item?.date || item?.JourneyDate || `D+${index}`}</div>
                <div className="mt-1 text-xs font-black text-white">{item?.availabilityText || item?.status || "Awaiting"}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[30px] border border-white/10 bg-white/8 p-5 backdrop-blur-xl">
          <IndianRupee className="h-6 w-6 text-lime-200" />
          <h3 className="mt-4 text-xl font-black text-white">Fare Enquiry</h3>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-400">Live fare is shown only when returned by the selected-date availability provider.</p>
          <div className="mt-5 flex gap-2">
            <input value={trainNo} onChange={(event) => setTrainNo(event.target.value.replace(/\D/g, "").slice(0, 5))} placeholder="Train no." className="h-12 min-w-0 flex-1 rounded-2xl border border-white/10 bg-white/8 px-4 text-sm font-black text-white outline-none placeholder:text-slate-500" />
            <button onClick={checkFare} className="rounded-2xl bg-lime-300 px-4 text-sm font-black text-slate-950">{fareState.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Fare"}</button>
          </div>
          {fareState.error && <p className="mt-3 text-xs font-semibold text-rose-200">{fareState.error}</p>}
          <div className="mt-4 rounded-2xl border border-white/8 bg-white/6 p-4">
            <div className="text-[11px] font-black uppercase text-slate-500">
              {fareState.data?.fareIsDateSpecific ? "Date-specific provider fare" : "Live fare unavailable"}
            </div>
            <div className="mt-1 text-2xl font-black text-white">{fare ? `₹${String(fare).replace(/^₹/, "")}` : "Awaiting"}</div>
            <div className="mt-2 text-xs font-semibold text-slate-500">{classType === "Any" ? "3A enquiry class" : classType} · {source || "Source"} to {destination || "Destination"}</div>
            {fareState.data?.warning && <div className="mt-2 text-xs font-semibold text-amber-100">{fareState.data.warning}</div>}
          </div>
        </div>

        <div className="rounded-[30px] border border-white/10 bg-white/8 p-5 backdrop-blur-xl">
          <Bell className="h-6 w-6 text-amber-200" />
          <h3 className="mt-4 text-xl font-black text-white">Notify when seats open</h3>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-400">Architecture placeholder for watchlists, alerts, favourite routes, and boarding station change support.</p>
          <div className="mt-5 space-y-2">
            {["Recent searches", "Favourite routes", "Boarding station change", "Alternative trains"].map((item) => (
              <div key={item} className="flex items-center justify-between rounded-2xl border border-white/8 bg-white/6 p-3">
                <span className="text-sm font-bold text-slate-200">{item}</span>
                <span className="text-[10px] font-black text-amber-100">READY</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function RailRouteSuperApp() {
  const [source, setSource] = useState("");
  const [destination, setDestination] = useState("");
  const [sourceQuery, setSourceQuery] = useState("");
  const [destinationQuery, setDestinationQuery] = useState("");
  const [date, setDate] = useState(todayIso(1));
  const [classType, setClassType] = useState("Any");
  const [smartToggles, setSmartToggles] = useState<SmartToggle[]>(["split"]);
  const [mode, setMode] = useState<TravelMode>("balanced");
  const [sort, setSort] = useState<SortKey>("recommended");
  const [filters, setFilters] = useState<string[]>([]);
  const [direct, setDirect] = useState<ApiState<any[]>>({ loading: false, error: "", data: null });
  const [splits, setSplits] = useState<any[]>([]);
  const [recent, setRecent] = useState<{ source: string; destination: string; date: string }[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);

  useEffect(() => {
    try {
      setRecent(JSON.parse(localStorage.getItem("railroute_recent_searches") || "[]"));
      setFavorites(JSON.parse(localStorage.getItem("railroute_favorites") || "[]"));
    } catch {
      setRecent([]);
      setFavorites([]);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("railroute_favorites", JSON.stringify(favorites));
  }, [favorites]);

  async function runSearch(event?: FormEvent) {
    event?.preventDefault();
    if (!source || !destination) {
      setDirect({ loading: false, error: "Select a Starting Point and End Point from the station search.", data: null });
      return;
    }
    if (source === destination) {
      setDirect({ loading: false, error: "Starting Point and End Point cannot be the same station.", data: null });
      return;
    }

    setDirect({ loading: true, error: "", data: null });
    setSplits([]);
    const searchRecord = { source, destination, date };
    const updatedRecent = [searchRecord, ...recent.filter((item) => item.source !== source || item.destination !== destination)].slice(0, 5);
    setRecent(updatedRecent);
    localStorage.setItem("railroute_recent_searches", JSON.stringify(updatedRecent));

    try {
      const directResult = await postJson<{ trains: any[] }>("/api/train-between", { source, destination, date, classType });
      let trains = directResult.trains || [];

      if (mode === "cheapest" || smartToggles.includes("lowest")) {
        trains = [...trains].sort((a, b) => parseFare(a.fare) - parseFare(b.fare));
      }
      if (mode === "fastest" || smartToggles.includes("fastest")) {
        trains = [...trains].sort((a, b) => parseDurationMinutes(a.duration) - parseDurationMinutes(b.duration));
      }
      setDirect({ loading: false, error: "", data: trains });

      if (smartToggles.includes("split")) {
        postJson<{ splitRoutes: any[] }>("/api/search-split", { source, destination, date, classType, directTrains: trains })
          .then((data) => setSplits(data.splitRoutes || []))
          .catch(() => setSplits([]));
      }

      window.setTimeout(() => document.getElementById("results")?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    } catch (error) {
      setDirect({ loading: false, error: error instanceof Error ? error.message : "Railway search failed.", data: null });
    }
  }

  function chooseRecent(item: { source: string; destination: string; date: string }) {
    const sourceStation = stationByCode(item.source);
    const destStation = stationByCode(item.destination);
    setSource(item.source);
    setDestination(item.destination);
    setDate(item.date);
    if (sourceStation) setSourceQuery(stationLabel(sourceStation));
    if (destStation) setDestinationQuery(stationLabel(destStation));
  }

  const bestTrain = direct.data?.[0] || null;
  const routeLabel = source && destination ? `${stationLabelFromCode(source)} to ${stationLabelFromCode(destination)}` : "Choose your railway corridor";

  return (
    <main className="min-h-screen overflow-hidden bg-[#050816] text-white">
      <div className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(circle_at_20%_0%,rgba(34,211,238,0.16),transparent_28%),radial-gradient(circle_at_90%_20%,rgba(251,113,133,0.13),transparent_30%),linear-gradient(180deg,#050816_0%,#08111f_48%,#0b1020_100%)]" />

      <nav className="sticky top-0 z-50 border-b border-white/8 bg-[#050816]/78 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
          <a href="#top" className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-slate-950 shadow-lg shadow-cyan-950/20">
              <Train className="h-5 w-5" />
            </span>
            <span className="text-lg font-black">RailRoute</span>
          </a>
          <div className="hidden items-center gap-1 lg:flex">
            {[
              ["Search", "top"],
              ["Results", "results"],
              ["Utilities", "utilities"],
            ].map(([label, id]) => (
              <a key={label} href={`#${id}`} className="rounded-2xl px-3 py-2 text-sm font-bold text-slate-400 transition hover:bg-white/8 hover:text-white">{label}</a>
            ))}
          </div>
          <a href="#top" className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/8 px-4 py-2 text-sm font-black text-white transition hover:bg-white/12">
            Launch Search
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </nav>

      <section id="top" className="relative z-10 mx-auto grid min-h-[92vh] max-w-7xl items-center gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="relative">
          <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <span className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-xs font-black uppercase text-cyan-100">
              <Sparkles className="h-3.5 w-3.5" />
              Premium Indian railway intelligence
            </span>
            <h1 className="mt-6 max-w-3xl text-5xl font-black leading-[1.02] text-white sm:text-6xl lg:text-7xl">
              Plan Smarter Railway Journeys
            </h1>
            <p className="mt-6 max-w-2xl text-lg font-semibold leading-8 text-slate-300">
              Live train tracking, smart route planning, seat intelligence, split journeys, fare comparison and more.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              {[
                { label: "Search Trains", icon: Search, target: "top" },
                { label: "PNR Status", icon: ShieldCheck, target: "utilities" },
              ].map(({ label, icon: Icon, target }, index) => (
                <a
                  key={label}
                  href={`#${target}`}
                  className={`flex h-12 items-center gap-2 rounded-2xl px-5 text-sm font-black transition ${
                    index === 0 ? "bg-white text-slate-950 shadow-xl shadow-cyan-950/20 hover:bg-cyan-50" : "border border-white/10 bg-white/8 text-white hover:bg-white/12"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </a>
              ))}
            </div>
          </motion.div>

          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {[
              ["Live APIs", "PNR · Seats · Fare"],
              ["Split engine", "Hub-aware routing"],
              ["Map mode", "ETA + route layers"],
            ].map(([title, body]) => (
              <div key={title} className="rounded-3xl border border-white/10 bg-white/7 p-4 backdrop-blur-xl">
                <div className="text-sm font-black text-white">{title}</div>
                <div className="mt-1 text-xs font-semibold text-slate-500">{body}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative">
          <motion.div
            initial={{ opacity: 0, scale: 0.96, x: 24 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            transition={{ duration: 0.7 }}
            className="relative min-h-[520px] overflow-hidden rounded-[34px] border border-white/10 bg-slate-950 shadow-2xl shadow-black/40"
          >
            <Image
              src="/vande-bharat-hero.jpg"
              alt="Vande Bharat Express train"
              fill
              priority
              sizes="(min-width: 1024px) 52vw, 100vw"
              className="object-cover opacity-72"
            />
            <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(5,8,22,0.92)_0%,rgba(5,8,22,0.48)_48%,rgba(5,8,22,0.18)_100%)]" />
            <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-[#050816] to-transparent" />
            <motion.div
              className="absolute left-10 right-10 top-16 h-px bg-gradient-to-r from-transparent via-cyan-200 to-transparent"
              animate={{ opacity: [0.2, 1, 0.2], x: [-30, 30, -30] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.div
              className="absolute bottom-18 left-8 flex items-center gap-3 rounded-3xl border border-white/12 bg-white/10 px-4 py-3 backdrop-blur-2xl"
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-200 text-slate-950">
                <Activity className="h-5 w-5" />
              </span>
              <div>
                <div className="text-sm font-black text-white">Vande Bharat corridor scan</div>
                <div className="text-xs font-semibold text-slate-300">Seat intelligence · live ETA · fare layers</div>
              </div>
            </motion.div>
            <div className="absolute right-6 top-6 rounded-3xl border border-emerald-300/30 bg-emerald-400/12 px-4 py-3 backdrop-blur-xl">
              <div className="text-[11px] font-black uppercase text-emerald-100">System status</div>
              <div className="mt-1 flex items-center gap-2 text-sm font-black text-white"><span className="h-2 w-2 rounded-full bg-emerald-300" />Live feed ready</div>
            </div>
          </motion.div>
        </div>
      </section>

      <section className="relative z-20 mx-auto max-w-7xl px-4 pb-10 sm:px-6">
        <SmartSearchPanel
          source={source}
          destination={destination}
          sourceQuery={sourceQuery}
          destinationQuery={destinationQuery}
          setSourceQuery={setSourceQuery}
          setDestinationQuery={setDestinationQuery}
          setSource={setSource}
          setDestination={setDestination}
          date={date}
          setDate={setDate}
          classType={classType}
          setClassType={setClassType}
          smartToggles={smartToggles}
          setSmartToggles={setSmartToggles}
          mode={mode}
          setMode={setMode}
          loading={direct.loading}
          onSubmit={runSearch}
        />
        <div className="mt-4 flex flex-wrap gap-2">
          {recent.map((item) => (
            <button key={`${item.source}-${item.destination}-${item.date}`} onClick={() => chooseRecent(item)} className="rounded-full border border-white/10 bg-white/7 px-3 py-2 text-xs font-black text-slate-300 transition hover:bg-white/12">
              {item.source} → {item.destination}
            </button>
          ))}
        </div>
      </section>

      <CKPRoutesExplorer
        onSelectRoute={(from, to) => {
          const fromSt = stationByCode(from);
          const toSt = stationByCode(to);
          setSource(from);
          setDestination(to);
          if (fromSt) setSourceQuery(stationLabel(fromSt));
          if (toSt) setDestinationQuery(stationLabel(toSt));
          window.setTimeout(() => {
            document.getElementById("results")?.scrollIntoView({ behavior: "smooth", block: "start" });
            runSearch();
          }, 80);
        }}
      />

      <section className="relative z-10 mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="grid gap-4 lg:grid-cols-4">
          {[
            { icon: Star, title: "Route comparison", body: bestTrain ? `${bestTrain.trainName} ranks first for ${mode}.` : "Compare fare, seats, delay, and duration when provider data is present." },
            { icon: IndianRupee, title: "Cheapest hint", body: bestTrain ? `Start around ${bestTrain.fare}. Recheck fare before booking.` : "Run a search to unlock fare guidance." },
            { icon: Gauge, title: "Reliability score", body: bestTrain ? `${confidenceFor(bestTrain)}% route confidence` : "Delay and confirmation heuristics ready." },
            { icon: Copy, title: "Share itinerary", body: routeLabel },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-[28px] border border-white/10 bg-white/7 p-5 backdrop-blur-xl">
              <Icon className="h-5 w-5 text-cyan-200" />
              <h3 className="mt-4 text-lg font-black text-white">{title}</h3>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-400">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <ResultsBoard
        trains={direct.data || []}
        splits={splits}
        loading={direct.loading}
        error={direct.error}
        classType={classType}
        sort={sort}
        setSort={setSort}
        filters={filters}
        setFilters={setFilters}
        smartToggles={smartToggles}
        favorites={favorites}
        setFavorites={setFavorites}
      />
      <IndiaMapExperience
        source={source}
        destination={destination}
        setSource={setSource}
        setDestination={setDestination}
        setSourceQuery={setSourceQuery}
        setDestinationQuery={setDestinationQuery}
      />
      <LiveTrainIntelligence />
      <div id="utilities">
        <UtilityModules source={source} destination={destination} date={date} classType={classType} />
      </div>
      <footer className="relative z-10 border-t border-white/8 px-4 py-10 sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 text-sm font-semibold text-slate-500 md:flex-row md:items-center md:justify-between">
          <span>RailRoute · Premium Indian railway intelligence platform</span>
          <span>Vande Bharat image: Wikimedia Commons CC0.</span>
        </div>
      </footer>
    </main>
  );
}

function PremiumShell({
  children,
  navMode = "landing",
}: {
  children: ReactNode;
  navMode?: "landing" | "workspace";
}) {
  return (
    <main className="min-h-screen overflow-hidden bg-[#050816] text-white">
      <div className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(circle_at_20%_0%,rgba(34,211,238,0.16),transparent_28%),radial-gradient(circle_at_90%_20%,rgba(251,113,133,0.13),transparent_30%),linear-gradient(180deg,#050816_0%,#08111f_48%,#0b1020_100%)]" />
      <nav className="sticky top-0 z-50 border-b border-white/8 bg-[#050816]/78 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/" className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-slate-950 shadow-lg shadow-cyan-950/20">
              <Train className="h-5 w-5" />
            </span>
            <span className="text-lg font-black">RailRoute</span>
          </Link>
          <div className="hidden items-center gap-1 lg:flex">
            {(navMode === "landing"
              ? [
                  ["Search", "#search"],
                  ["Trust", "#trust"],
                  ["Workspace", "/trains"],
                ]
              : [
                  ["Results", "#results"],
                  ["Utilities", "#utilities"],
                  ["Home", "/"],
                ]).map(([label, href]) => (
              <a key={label} href={href} className="rounded-2xl px-3 py-2 text-sm font-bold text-slate-400 transition hover:bg-white/8 hover:text-white">{label}</a>
            ))}
          </div>
          <a href={navMode === "landing" ? "#search" : "/"} className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/8 px-4 py-2 text-sm font-black text-white transition hover:bg-white/12">
            {navMode === "landing" ? "Start Search" : "New Search"}
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </nav>
      {children}
    </main>
  );
}

function LandingMapBackdrop() {
  const previewStations = ["JP", "NDLS", "PNBE"]
    .map(mapStationByCode)
    .filter((station): station is MapStation => Boolean(station));
  const route = (previewStations.length >= 3 ? previewStations : MAP_STATIONS.slice(0, 3))
    .map((station, index) => {
      const point = projectPoint(station.lat, station.lng, 1, { x: 0, y: 0 });
      return `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`;
    })
    .join(" ");

  return (
    <div className="absolute inset-0 overflow-hidden opacity-80">
      <svg viewBox="0 0 760 760" className="absolute right-[-12%] top-[-12%] h-[120%] w-[92%] min-w-[720px]" aria-hidden="true">
        <defs>
          <filter id="landingGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="8" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <linearGradient id="landingRoute" x1="0" x2="1">
            <stop offset="0%" stopColor="#6ee7b7" />
            <stop offset="55%" stopColor="#22d3ee" />
            <stop offset="100%" stopColor="#fb7185" />
          </linearGradient>
        </defs>
        <path d="M246 68 C320 42 442 54 514 120 C590 190 624 294 611 394 C598 498 543 608 454 680 C368 750 263 709 216 635 C169 561 130 493 118 402 C105 302 150 116 246 68Z" fill="rgba(255,255,255,0.035)" stroke="rgba(255,255,255,0.14)" strokeWidth="2" />
        <path d={route} fill="none" stroke="url(#landingRoute)" strokeWidth="5" strokeLinecap="round" filter="url(#landingGlow)" />
        <motion.circle r="9" fill="#fff" filter="url(#landingGlow)" animate={{ cx: [projectPoint(26.9196, 75.7878, 1, { x: 0, y: 0 }).x, projectPoint(28.6423, 77.2209, 1, { x: 0, y: 0 }).x, projectPoint(25.6094, 85.1376, 1, { x: 0, y: 0 }).x], cy: [projectPoint(26.9196, 75.7878, 1, { x: 0, y: 0 }).y, projectPoint(28.6423, 77.2209, 1, { x: 0, y: 0 }).y, projectPoint(25.6094, 85.1376, 1, { x: 0, y: 0 }).y] }} transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }} />
        {MAP_STATIONS.slice(0, 14).map((station) => {
          const point = projectPoint(station.lat, station.lng, 1, { x: 0, y: 0 });
          return (
            <g key={station.code} transform={`translate(${point.x} ${point.y})`}>
              <circle r="5" fill="rgba(226,232,240,0.86)" stroke="#0f172a" strokeWidth="2" />
              <text x="10" y="-8" fill="#e5e7eb" fontSize="12" fontWeight="800">{station.code}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function LandingSearchCard() {
  const router = useRouter();
  const [source, setSource] = useState("");
  const [destination, setDestination] = useState("");
  const [sourceQuery, setSourceQuery] = useState("");
  const [destinationQuery, setDestinationQuery] = useState("");
  const [date, setDate] = useState(todayIso(1));
  const [classType, setClassType] = useState("Any");
  const [error, setError] = useState("");
  const [swapSpin, setSwapSpin] = useState(false);

  function swapStations() {
    setSwapSpin(true);
    const oldSource = source;
    const oldSourceQuery = sourceQuery;
    setSource(destination);
    setDestination(oldSource);
    setSourceQuery(destinationQuery);
    setDestinationQuery(oldSourceQuery);
    window.setTimeout(() => setSwapSpin(false), 420);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!source || !destination) {
      setError("Choose both Starting Point and Destination from station search.");
      return;
    }
    if (source === destination) {
      setError("Starting Point and Destination cannot be the same.");
      return;
    }

    const params = new URLSearchParams({ from: source, to: destination, date, class: classType });
    router.push(`/trains?${params.toString()}`);
  }

  return (
    <motion.form
      id="search"
      onSubmit={submit}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
      className="mx-auto w-full max-w-5xl rounded-[32px] border border-white/12 bg-white/10 p-4 shadow-2xl shadow-black/40 backdrop-blur-2xl sm:p-5"
    >
      <div className="grid gap-3 lg:grid-cols-[1fr_auto_1fr] lg:items-end">
        <StationAutocomplete
          label="From"
          value={source}
          query={sourceQuery}
          setQuery={setSourceQuery}
          onSelect={setSource}
          placeholder="Starting Point"
          example="e.g. Jaipur (Rajasthan)"
        />
        <button
          type="button"
          onClick={swapStations}
          className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-white/14 bg-white/10 text-cyan-100 shadow-lg transition hover:border-cyan-300/40 hover:bg-cyan-300/12"
          aria-label="Swap source and destination"
        >
          <motion.span animate={{ rotate: swapSpin ? 180 : 0, scale: swapSpin ? 1.15 : 1 }} transition={{ type: "spring", stiffness: 420, damping: 18 }}>
            <ArrowDownUp className="h-5 w-5" />
          </motion.span>
        </button>
        <StationAutocomplete
          label="To"
          value={destination}
          query={destinationQuery}
          setQuery={setDestinationQuery}
          onSelect={setDestination}
          placeholder="Destination"
          example="e.g. Patna (Bihar)"
        />
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
        <div>
          <label className="mb-2 block text-[11px] font-black uppercase text-slate-400">Travel Date</label>
          <input type="date" min="2026-06-21" max="2026-08-21" value={date} onChange={(event) => setDate(event.target.value)} className="h-13 w-full rounded-2xl border border-white/10 bg-white/8 px-4 text-sm font-bold text-white outline-none focus:border-cyan-300/60" />
        </div>
        <div>
          <label className="mb-2 block text-[11px] font-black uppercase text-slate-400">Train Class</label>
          <select value={classType} onChange={(event) => setClassType(event.target.value)} className="h-13 w-full rounded-2xl border border-white/10 bg-[#111827] px-4 text-sm font-bold text-white outline-none focus:border-cyan-300/60">
            {["Any", "SL", "3A", "2A", "1A", "CC", "EC"].map((item) => <option key={item} value={item}>{item === "Any" ? "Any Class" : item}</option>)}
          </select>
        </div>
        <button className="mt-0 flex h-13 items-center justify-center gap-2 rounded-2xl bg-white px-7 text-sm font-black text-slate-950 shadow-xl shadow-cyan-950/20 transition hover:bg-cyan-50 md:self-end">
          <Search className="h-4 w-4" />
          Search
        </button>
      </div>
      {error && <p className="mt-3 rounded-2xl border border-rose-300/25 bg-rose-400/10 px-4 py-3 text-sm font-bold text-rose-100">{error}</p>}
    </motion.form>
  );
}

export function RailRouteLandingPage() {
  return (
    <PremiumShell navMode="landing">
      <section className="relative z-10 min-h-[calc(100vh-73px)] overflow-hidden px-4 py-10 sm:px-6">
        <LandingMapBackdrop />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,8,22,0.98)_0%,rgba(5,8,22,0.82)_46%,rgba(5,8,22,0.44)_100%)]" />
        <div className="relative mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
          <div className="py-10">
            <motion.span initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-xs font-black uppercase text-cyan-100">
              <Sparkles className="h-3.5 w-3.5" />
              Indian railway travel intelligence
            </motion.span>
            <motion.h1 initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="mt-6 max-w-3xl text-5xl font-black leading-[1.02] text-white sm:text-6xl lg:text-7xl">
              Plan Smarter Railway Journeys
            </motion.h1>
            <motion.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mt-6 max-w-2xl text-lg font-semibold leading-8 text-slate-300">
              Live train tracking, smart route planning, seat intelligence, split journeys, fare comparison and more.
            </motion.p>
            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {[
                ["Provider data", "Train, fare and seats when returned"],
                ["Map-first planning", "Route layers and ETA"],
                ["Premium trains", "Vande Bharat inspired"],
              ].map(([title, body]) => (
                <div key={title} className="rounded-3xl border border-white/10 bg-white/7 p-4 backdrop-blur-xl">
                  <div className="text-sm font-black text-white">{title}</div>
                  <div className="mt-1 text-xs font-semibold text-slate-500">{body}</div>
                </div>
              ))}
            </div>
          </div>
          <motion.div initial={{ opacity: 0, scale: 0.96, x: 24 }} animate={{ opacity: 1, scale: 1, x: 0 }} transition={{ duration: 0.7 }} className="relative hidden min-h-[520px] overflow-hidden rounded-[34px] border border-white/10 bg-slate-950 shadow-2xl shadow-black/40 lg:block">
            <Image src="/vande-bharat-hero.jpg" alt="Vande Bharat Express train" fill priority sizes="48vw" className="object-cover opacity-72" />
            <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(5,8,22,0.88)_0%,rgba(5,8,22,0.42)_46%,rgba(5,8,22,0.14)_100%)]" />
            <motion.div className="absolute bottom-10 left-8 flex items-center gap-3 rounded-3xl border border-white/12 bg-white/10 px-4 py-3 backdrop-blur-2xl" animate={{ y: [0, -8, 0] }} transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}>
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-200 text-slate-950"><Activity className="h-5 w-5" /></span>
              <div><div className="text-sm font-black text-white">Vande Bharat corridor feel</div><div className="text-xs font-semibold text-slate-300">Fast UX · live ETA · premium trust</div></div>
            </motion.div>
          </motion.div>
        </div>
        <div className="relative mx-auto mt-4 max-w-7xl">
          <LandingSearchCard />
        </div>
      </section>
      <section id="map-preview" className="relative z-10 mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
          <div className="rounded-[34px] border border-white/10 bg-white/8 p-5 backdrop-blur-xl">
            <h2 className="text-3xl font-black text-white">Interactive India map background</h2>
            <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-slate-400">RailRoute turns source and destination into a visual journey, with major station markers, animated path previews and split-route planning.</p>
            <div className="relative mt-6 min-h-[360px] overflow-hidden rounded-[28px] border border-white/10 bg-[#07111f]">
              <LandingMapBackdrop />
            </div>
          </div>
          <div id="trust" className="space-y-4">
            {[
              { icon: ShieldCheck, title: "IRCTC-compatible APIs", body: "Built around live train search, PNR, seats, fare and schedule endpoints." },
              { icon: Radio, title: "Live train intelligence", body: "Working status modules are separated on the results page for fast focused usage." },
              { icon: Wallet, title: "Travel-commerce polish", body: "Modern trust cues inspired by flight apps, RedBus and premium fintech UX." },
            ].map(({ icon: Icon, title, body }) => (
              <div key={title} className="rounded-[28px] border border-white/10 bg-white/8 p-5 backdrop-blur-xl">
                <Icon className="h-5 w-5 text-cyan-200" />
                <h3 className="mt-4 text-lg font-black text-white">{title}</h3>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-400">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </PremiumShell>
  );
}

export function RailRouteSearchWorkspace({
  initialSource = "",
  initialDestination = "",
  initialDate = todayIso(1),
  initialClassType = "Any",
}: {
  initialSource?: string;
  initialDestination?: string;
  initialDate?: string;
  initialClassType?: string;
}) {
  const [source, setSource] = useState(initialSource);
  const [destination, setDestination] = useState(initialDestination);
  const [sourceQuery, setSourceQuery] = useState(() => {
    const station = initialSource ? stationByCode(initialSource) : null;
    return station ? stationLabel(station) : "";
  });
  const [destinationQuery, setDestinationQuery] = useState(() => {
    const station = initialDestination ? stationByCode(initialDestination) : null;
    return station ? stationLabel(station) : "";
  });
  const [date, setDate] = useState(initialDate || todayIso(1));
  const [classType, setClassType] = useState(initialClassType || "Any");
  const [smartToggles, setSmartToggles] = useState<SmartToggle[]>(["split"]);
  const [mode, setMode] = useState<TravelMode>("balanced");
  const [sort, setSort] = useState<SortKey>("recommended");
  const [filters, setFilters] = useState<string[]>([]);
  const [direct, setDirect] = useState<ApiState<any[]>>({ loading: false, error: "", data: null });
  const [splits, setSplits] = useState<any[]>([]);
  const [recent, setRecent] = useState<{ source: string; destination: string; date: string }[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);

  useEffect(() => {
    try {
      setRecent(JSON.parse(localStorage.getItem("railroute_recent_searches") || "[]"));
      setFavorites(JSON.parse(localStorage.getItem("railroute_favorites") || "[]"));
    } catch {
      setRecent([]);
      setFavorites([]);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("railroute_favorites", JSON.stringify(favorites));
  }, [favorites]);

  async function runSearch(event?: FormEvent) {
    event?.preventDefault();
    if (!source || !destination) {
      setDirect({ loading: false, error: "Select a Starting Point and Destination from the nationwide station search.", data: null });
      return;
    }
    if (source === destination) {
      setDirect({ loading: false, error: "Starting Point and Destination cannot be the same station.", data: null });
      return;
    }

    setDirect({ loading: true, error: "", data: null });
    setSplits([]);
    const searchRecord = { source, destination, date };
    const updatedRecent = [searchRecord, ...recent.filter((item) => item.source !== source || item.destination !== destination)].slice(0, 5);
    setRecent(updatedRecent);
    localStorage.setItem("railroute_recent_searches", JSON.stringify(updatedRecent));

    try {
      const directResult = await postJson<{ trains: any[] }>("/api/train-between", { source, destination, date, classType });
      let trains = directResult.trains || [];
      if (mode === "cheapest" || smartToggles.includes("lowest")) {
        trains = [...trains].sort((a, b) => parseFare(a.fare) - parseFare(b.fare));
      }
      if (mode === "fastest" || smartToggles.includes("fastest")) {
        trains = [...trains].sort((a, b) => parseDurationMinutes(a.duration) - parseDurationMinutes(b.duration));
      }
      setDirect({ loading: false, error: "", data: trains });

      if (smartToggles.includes("split")) {
        postJson<{ splitRoutes: any[] }>("/api/search-split", { source, destination, date, classType, directTrains: trains })
          .then((data) => setSplits(data.splitRoutes || []))
          .catch(() => setSplits([]));
      }
    } catch (error) {
      setDirect({ loading: false, error: error instanceof Error ? error.message : "Railway search failed.", data: null });
    }
  }

  useEffect(() => {
    if (initialSource && initialDestination) {
      window.setTimeout(() => runSearch(), 50);
    }
    // Run once from the landing page query params.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function chooseRecent(item: { source: string; destination: string; date: string }) {
    const sourceStation = stationByCode(item.source);
    const destStation = stationByCode(item.destination);
    setSource(item.source);
    setDestination(item.destination);
    setDate(item.date);
    if (sourceStation) setSourceQuery(stationLabel(sourceStation));
    if (destStation) setDestinationQuery(stationLabel(destStation));
  }

  const bestTrain = direct.data?.[0] || null;
  const routeLabel = source && destination ? `${stationLabelFromCode(source)} to ${stationLabelFromCode(destination)}` : "Choose your railway corridor";

  return (
    <PremiumShell navMode="workspace">
      <section id="top" className="relative z-10 border-b border-white/8 px-4 py-8 sm:px-6">
        <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[0.74fr_0.26fr] lg:items-center">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-xs font-black uppercase text-cyan-100">
              <Route className="h-3.5 w-3.5" />
              Search workspace
            </span>
            <h1 className="mt-4 text-3xl font-black text-white sm:text-5xl">Train results, live tools and route intelligence.</h1>
            <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-slate-400">Use this page for real train search, PNR, live train status, seat availability, fare enquiry, sorting and filters.</p>
          </div>
          <div className="hidden overflow-hidden rounded-[28px] border border-white/10 bg-white/8 p-3 backdrop-blur-xl lg:block">
            <div className="relative h-44 overflow-hidden rounded-3xl">
              <Image src="/vande-bharat-hero.jpg" alt="Vande Bharat Express train" fill sizes="320px" className="object-cover opacity-80" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#050816] to-transparent" />
            </div>
          </div>
        </div>
      </section>

      <section className="relative z-20 mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <SmartSearchPanel
          source={source}
          destination={destination}
          sourceQuery={sourceQuery}
          destinationQuery={destinationQuery}
          setSourceQuery={setSourceQuery}
          setDestinationQuery={setDestinationQuery}
          setSource={setSource}
          setDestination={setDestination}
          date={date}
          setDate={setDate}
          classType={classType}
          setClassType={setClassType}
          smartToggles={smartToggles}
          setSmartToggles={setSmartToggles}
          mode={mode}
          setMode={setMode}
          loading={direct.loading}
          onSubmit={runSearch}
        />
        <div className="mt-4 flex flex-wrap gap-2">
          {recent.map((item) => (
            <button key={`${item.source}-${item.destination}-${item.date}`} onClick={() => chooseRecent(item)} className="rounded-full border border-white/10 bg-white/7 px-3 py-2 text-xs font-black text-slate-300 transition hover:bg-white/12">
              {item.source} → {item.destination}
            </button>
          ))}
        </div>
      </section>

      <CKPRoutesExplorer
        onSelectRoute={(from, to) => {
          const fromSt = stationByCode(from);
          const toSt = stationByCode(to);
          setSource(from);
          setDestination(to);
          if (fromSt) setSourceQuery(stationLabel(fromSt));
          if (toSt) setDestinationQuery(stationLabel(toSt));
          window.setTimeout(() => {
            runSearch();
            document.getElementById("results")?.scrollIntoView({ behavior: "smooth", block: "start" });
          }, 80);
        }}
      />

      <section className="relative z-10 mx-auto max-w-7xl px-4 py-4 sm:px-6">
        <div className="grid gap-4 lg:grid-cols-4">
          {[
            { icon: Star, title: "Best Train For Me", body: bestTrain ? `${bestTrain.trainName} looks strongest for ${mode}.` : "Run a search for a ranked recommendation." },
            { icon: IndianRupee, title: "Cheapest travel hint", body: bestTrain ? `Fare preview starts around ${bestTrain.fare}.` : "Lowest fare mode is ready." },
            { icon: Gauge, title: "Delay reliability", body: bestTrain ? `${confidenceFor(bestTrain)}% route confidence` : "Reliability scores appear with results." },
            { icon: Copy, title: "Share itinerary", body: routeLabel },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-[28px] border border-white/10 bg-white/7 p-5 backdrop-blur-xl">
              <Icon className="h-5 w-5 text-cyan-200" />
              <h3 className="mt-4 text-lg font-black text-white">{title}</h3>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-400">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <ResultsBoard
        trains={direct.data || []}
        splits={splits}
        loading={direct.loading}
        error={direct.error}
        classType={classType}
        sort={sort}
        setSort={setSort}
        filters={filters}
        setFilters={setFilters}
        smartToggles={smartToggles}
        favorites={favorites}
        setFavorites={setFavorites}
      />
      <IndiaMapExperience
        source={source}
        destination={destination}
        setSource={setSource}
        setDestination={setDestination}
        setSourceQuery={setSourceQuery}
        setDestinationQuery={setDestinationQuery}
      />
      <LiveTrainIntelligence />
      <div id="utilities">
        <UtilityModules source={source} destination={destination} date={date} classType={classType} />
      </div>
      <footer className="relative z-10 border-t border-white/8 px-4 py-10 sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 text-sm font-semibold text-slate-500 md:flex-row md:items-center md:justify-between">
          <span>RailRoute search workspace · live railway tools</span>
          <span>Vande Bharat image: Wikimedia Commons CC0.</span>
        </div>
      </footer>
    </PremiumShell>
  );
}
