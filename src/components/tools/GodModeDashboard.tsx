"use client";

import React, { FormEvent, useEffect, useMemo, useState } from "react";
import { Activity, ArrowRight, Gauge, Loader2, Search, ShieldCheck, Train, Waypoints, type LucideIcon } from "lucide-react";

type GodModeResponse = {
  success: boolean;
  data?: {
    directTrains: any[];
    splitRoutes: any[];
    hubAnalysis: any[];
    metrics: {
      directTrainsFound: number;
      splitRoutesFound: number;
      searchTimeMs: number;
      searchTimeSeconds: number;
      hubsAnalyzed: number;
      hubsWithRoutes: number;
      targetMs: number;
    };
  };
  error?: string;
};

function trainClasses(train: any) {
  const classes = train?.classes || train?.providerReturnedClass || [];
  if (Array.isArray(classes) && classes.length) return classes.join(", ");
  return train?.classType || train?.selectedClass || "Any";
}

function availabilityText(train: any) {
  const cls = train?.classType || train?.selectedClass;
  const row = cls ? train?.classAvailability?.[cls]?.[0] : undefined;
  return row?.text || train?.availability || "Schedule checked";
}

function fareText(train: any) {
  const value = train?.fare;
  if (value && String(value).trim()) return value;
  return "Fare deferred";
}

function totalDuration(split: any) {
  const leg1 = split?.leg1?.duration || "N/A";
  const leg2 = split?.leg2?.duration || "N/A";
  return `${leg1} + ${split?.layoverDuration || "wait"} + ${leg2}`;
}

function confidence(score: unknown) {
  const value = Math.max(0, Math.min(100, Number(score) || 0));
  return `${value}%`;
}

export function GodModeDashboard() {
  const [source, setSource] = useState("DURE");
  const [destination, setDestination] = useState("JP");
  const [date, setDate] = useState("2026-07-21");
  const [classType, setClassType] = useState("3A");
  const [preferredHub, setPreferredHub] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<GodModeResponse["data"] | null>(null);

  async function runSearch(event?: FormEvent) {
    event?.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/godmode", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source, destination, date, classType, preferredHub }),
      });
      const payload = await response.json() as GodModeResponse;
      if (!response.ok || !payload.success) throw new Error(payload.error || "GodMode search failed");
      setResult(payload.data || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "GodMode search failed");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const metrics = result?.metrics;
  const splitRoutes = useMemo(() => result?.splitRoutes || [], [result]);
  const directTrains = useMemo(() => result?.directTrains || [], [result]);
  const hubs = useMemo(() => result?.hubAnalysis || [], [result]);
  const metricCards: [string, string | number, LucideIcon][] = [
    ["Direct trains found", metrics?.directTrainsFound ?? 0, Train],
    ["Split routes found", metrics?.splitRoutesFound ?? 0, Waypoints],
    ["Search time", `${metrics?.searchTimeSeconds ?? 0}s`, Activity],
    ["Hubs analyzed", metrics?.hubsAnalyzed ?? 0, ShieldCheck],
  ];

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <section className="border-b border-zinc-800 bg-zinc-950 px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.22em] text-lime-300">
                <Gauge className="h-4 w-4" />
                GODMODE
              </div>
              <h1 className="mt-2 text-3xl font-black text-white sm:text-5xl">RailRoute Power Search</h1>
            </div>
            <form onSubmit={runSearch} className="grid gap-2 sm:grid-cols-6 lg:w-[720px]">
              <input value={source} onChange={(event) => setSource(event.target.value.toUpperCase())} className="h-11 border border-zinc-700 bg-zinc-900 px-3 text-sm font-black outline-none focus:border-lime-300" placeholder="FROM" />
              <input value={destination} onChange={(event) => setDestination(event.target.value.toUpperCase())} className="h-11 border border-zinc-700 bg-zinc-900 px-3 text-sm font-black outline-none focus:border-lime-300" placeholder="TO" />
              <input value={date} onChange={(event) => setDate(event.target.value)} type="date" className="h-11 border border-zinc-700 bg-zinc-900 px-3 text-sm font-black outline-none focus:border-lime-300 sm:col-span-2" />
              <select value={classType} onChange={(event) => setClassType(event.target.value)} className="h-11 border border-zinc-700 bg-zinc-900 px-3 text-sm font-black outline-none focus:border-lime-300">
                {["Any", "1A", "2A", "3A", "3E", "SL", "CC", "EC", "2S"].map((item) => <option key={item}>{item}</option>)}
              </select>
              <button className="flex h-11 items-center justify-center gap-2 bg-lime-300 px-4 text-sm font-black text-zinc-950">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                RUN
              </button>
              <input value={preferredHub} onChange={(event) => setPreferredHub(event.target.value.toUpperCase())} className="h-11 border border-zinc-700 bg-zinc-900 px-3 text-sm font-black outline-none focus:border-lime-300 sm:col-span-6" placeholder="OPTIONAL PREFERRED HUB" />
            </form>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        {error && <div className="mb-5 border border-red-500 bg-red-950/40 p-3 text-sm font-black text-red-100">{error}</div>}

        <div className="grid gap-3 md:grid-cols-4">
          {metricCards.map(([label, value, Icon]) => (
            <div key={String(label)} className="border border-zinc-800 bg-zinc-900 p-4">
              <div className="flex items-center justify-between text-zinc-400">
                <span className="text-[11px] font-black uppercase">{String(label)}</span>
                <Icon className="h-4 w-4 text-lime-300" />
              </div>
              <div className="mt-2 text-3xl font-black text-white">{String(value)}</div>
            </div>
          ))}
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[1.3fr_1fr]">
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-black uppercase tracking-[0.18em] text-zinc-400">A. Direct Trains</h2>
              <span className="text-xs font-black text-lime-300">ALL RESULTS</span>
            </div>
            <div className="overflow-x-auto border border-zinc-800">
              <table className="w-full min-w-[820px] border-collapse text-left text-sm">
                <thead className="bg-zinc-900 text-[11px] uppercase text-zinc-400">
                  <tr>
                    <th className="p-3">Train</th>
                    <th className="p-3">Depart</th>
                    <th className="p-3">Arrive</th>
                    <th className="p-3">Duration</th>
                    <th className="p-3">Classes</th>
                    <th className="p-3">Availability</th>
                    <th className="p-3">Fare</th>
                  </tr>
                </thead>
                <tbody>
                  {directTrains.map((train) => (
                    <tr key={`${train.trainNo}-${train.source}-${train.destination}`} className="border-t border-zinc-800">
                      <td className="p-3 font-black text-white">{train.trainNo} {train.trainName}</td>
                      <td className="p-3">{train.departureTime}</td>
                      <td className="p-3">{train.arrivalTime}</td>
                      <td className="p-3">{train.duration}</td>
                      <td className="p-3 text-cyan-200">{trainClasses(train)}</td>
                      <td className="p-3 text-zinc-300">{availabilityText(train)}</td>
                      <td className="p-3 text-zinc-300">{fareText(train)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-black uppercase tracking-[0.18em] text-zinc-400">C. Hub Analysis</h2>
              <span className="text-xs font-black text-lime-300">RANKED</span>
            </div>
            <div className="space-y-2">
              {hubs.map((hub) => (
                <div key={hub.code} className="border border-zinc-800 bg-zinc-900 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-black text-white">#{hub.rank} {hub.name}</div>
                      <div className="mt-1 text-xs font-bold text-zinc-400">{hub.reasons?.join(" / ")}</div>
                    </div>
                    <div className="text-right text-xl font-black text-lime-300">{confidence(hub.confidence)}</div>
                  </div>
                  <div className="mt-3 grid grid-cols-4 gap-2 text-[11px] font-black uppercase text-zinc-400">
                    <span>Imp {hub.importance}</span>
                    <span>Density {hub.trainDensity}</span>
                    <span>Conn {hub.connectivity}</span>
                    <span>Geo {hub.geographicRelevance}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <section className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-black uppercase tracking-[0.18em] text-zinc-400">B. Best Split Routes</h2>
            <span className="text-xs font-black text-lime-300">TOP 15 MIXED-CLASS OK</span>
          </div>
          <div className="grid gap-3">
            {splitRoutes.map((split, index) => (
              <div key={`${split.hubStation}-${split.leg1?.trainNo}-${split.leg2?.trainNo}-${index}`} className="border border-zinc-800 bg-zinc-900 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="text-xs font-black uppercase text-lime-300">Via {split.hubStationName || split.hubStation}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-sm font-black text-white">
                      <span>{split.leg1?.trainNo} {split.leg1?.trainName}</span>
                      <ArrowRight className="h-4 w-4 text-zinc-500" />
                      <span>{split.leg2?.trainNo} {split.leg2?.trainName}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-right sm:grid-cols-4">
                    <div><div className="text-[10px] font-black uppercase text-zinc-500">Wait</div><div className="font-black">{split.layoverDuration}</div></div>
                    <div><div className="text-[10px] font-black uppercase text-zinc-500">Total</div><div className="font-black">{totalDuration(split)}</div></div>
                    <div><div className="text-[10px] font-black uppercase text-zinc-500">Classes</div><div className="font-black">{trainClasses(split.leg1)} / {trainClasses(split.leg2)}</div></div>
                    <div><div className="text-[10px] font-black uppercase text-zinc-500">Confidence</div><div className="font-black text-lime-300">{confidence(split.score)}</div></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
