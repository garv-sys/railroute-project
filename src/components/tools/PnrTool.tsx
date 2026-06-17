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
import { TrustSummary, QuotaTimingNotice, RunningDaysStrip, confirmationChanceFromStatus, confirmationChanceTone } from "../shared/TrustSummary";
import { StationAutocomplete, RelatedStationChips, QuickSearch } from "../shared/StationAutocomplete";
import { ProductShell } from "../layout/ProductShell";
import { ToolHeader } from "../layout/ToolHeader";
import { CoachExplorer, normalizePnrPayload } from "./CoachExplorer";
import { BookingWorkspace } from "./BookingWorkspace";


export function PnrTool() {
  const [pnr, setPnr] = useState("");
  const [state, setState] = useState<{ loading: boolean; error: string; data: any | null }>({ loading: false, error: "", data: null });
  const [savedPnrs, setSavedPnrs] = useState<{ pnr: string; trainName: string }[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("railroute_recent_pnrs");
      if (stored) {
        setSavedPnrs(JSON.parse(stored));
      }
    } catch (e) {
      console.warn("Failed to load saved PNRs:", e);
    }
  }, []);

  function savePnr(pnrVal: string, trainName: string) {
    try {
      const stored = localStorage.getItem("railroute_recent_pnrs");
      let currentList = stored ? JSON.parse(stored) : [];
      if (!Array.isArray(currentList)) currentList = [];
      const filtered = currentList.filter((item: any) => item?.pnr !== pnrVal);
      const updated = [{ pnr: pnrVal, trainName }, ...filtered].slice(0, 5);
      setSavedPnrs(updated);
      localStorage.setItem("railroute_recent_pnrs", JSON.stringify(updated));
    } catch (e) {
      console.warn("Failed to save PNR:", e);
    }
  }

  function deleteSavedPnr(pnrVal: string) {
    try {
      const updated = savedPnrs.filter((item) => item.pnr !== pnrVal);
      setSavedPnrs(updated);
      localStorage.setItem("railroute_recent_pnrs", JSON.stringify(updated));
    } catch (e) {
      console.warn("Failed to delete PNR:", e);
    }
  }

  async function triggerCheck(targetPnr: string) {
    if (!/^\d{10}$/.test(targetPnr)) return setState({ loading: false, error: "Enter a 10-digit PNR.", data: null });
    setState({ loading: true, error: "", data: null });
    try {
      const result = (await postJson("/api/pnr", { pnr: targetPnr })) as any;
      setState({ loading: false, error: "", data: result });
      
      const pnrData = result?.data || (result?.success === undefined ? result : null);
      if (pnrData) {
        const normalized = normalizePnrPayload(pnrData, targetPnr);
        savePnr(targetPnr, normalized.trainName);
      }
    } catch (error) {
      setState({ loading: false, error: error instanceof Error ? error.message : "PNR failed.", data: null });
    }
  }

  async function check(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    await triggerCheck(pnr);
  }

  const pnrData = state.data?.data || (state.data?.success === undefined ? state.data : null);
  const normalizedPnr = pnrData ? normalizePnrPayload(pnrData, pnr) : null;
  const passengers = normalizedPnr?.passengers || [];
  const source = state.data?.source || pnrData?.source || "provider";

  return (
    <div className={softPanel("mx-auto max-w-5xl rounded-[32px] p-5")}>
      <ShieldCheck className="h-7 w-7 text-cyan-600 dark:text-cyan-200" />
      <h2 className="mt-4 text-3xl font-black">PNR Status</h2>
      <form onSubmit={check} className="mt-5 flex flex-col gap-3 sm:flex-row">
        <input value={pnr} onChange={(event) => setPnr(event.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="10-digit PNR" className="h-13 flex-1 rounded-2xl border border-slate-200 bg-white px-4 font-bold dark:border-white/10 dark:bg-white/8 dark:text-white" />
        <button type="submit" disabled={state.loading} className="flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-6 font-black text-white disabled:opacity-70 dark:bg-white dark:text-slate-950">
          {state.loading && <Loader2 className="h-4 w-4 animate-spin" />}
          <span>{state.loading ? "Checking" : "Check PNR"}</span>
        </button>
      </form>
      {savedPnrs.length > 0 && (
        <div className="mt-4">
          <div className="text-[10px] font-black uppercase text-slate-400">Recently checked PNRs (Click to check)</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {savedPnrs.map((item) => (
              <div
                key={item.pnr}
                className="group flex items-center gap-1.5 rounded-full border border-slate-200 bg-white pl-3.5 pr-2 py-1 text-xs font-bold text-slate-700 shadow-sm dark:border-white/10 dark:bg-[#101725] dark:text-slate-200"
              >
                <button
                  type="button"
                  onClick={() => {
                    setPnr(item.pnr);
                    triggerCheck(item.pnr);
                  }}
                  className="hover:text-cyan-600 dark:hover:text-cyan-300"
                >
                  {item.pnr} {item.trainName && item.trainName !== "Train details" ? `· ${item.trainName}` : ""}
                </button>
                <button
                  type="button"
                  onClick={() => deleteSavedPnr(item.pnr)}
                  className="rounded-full p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/10 dark:hover:text-white"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      {state.error && (
        <div className="mt-5 rounded-2xl border border-rose-300/40 bg-rose-50 p-4 font-black text-rose-700 dark:border-rose-300/20 dark:bg-rose-300/12 dark:text-rose-100">
          <div>{/not found|invalid|empty/i.test(state.error) ? "PNR not found. Check the number and try again." : `Service unavailable. ${state.error}`}</div>
        </div>
      )}
      {state.data?.meta && !pnrData && (
        <div className="mt-5 rounded-2xl border border-amber-300/40 bg-amber-50 p-4 text-sm font-black leading-6 text-amber-900 dark:border-amber-300/20 dark:bg-amber-300/10 dark:text-amber-100">
          <TrustSummary meta={state.data.meta} />
          <div className="mt-3">{state.data.warning || state.data.meta.warning || "Provider unavailable; no PNR passenger rows shown."}</div>
        </div>
      )}
      {normalizedPnr && (
        <div className="mt-6 grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5 dark:border-white/10 dark:bg-black/20">
            <div className="flex flex-wrap gap-2">
              <DataBadge type={badgeTypeFromSource(state.data?.meta?.source || (source === "fallback" ? "fallback" : "live"))} label={source === "fallback" ? "Provider unavailable" : "Provider result"} />
              {state.data?.requestId && <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-slate-500 dark:bg-white/10 dark:text-slate-300">{state.data.requestId}</span>}
            </div>
            {state.data?.meta && <TrustSummary meta={state.data.meta} />}
            <h3 className="mt-4 text-2xl font-black">{normalizedPnr.trainName}</h3>
            <p className="mt-1 text-sm font-bold text-slate-500 dark:text-slate-400">PNR {normalizedPnr.pnr}</p>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              {[
                ["Train", normalizedPnr.trainNo],
                ["Journey date", normalizedPnr.journeyDate],
                ["From", normalizedPnr.from],
                ["To", normalizedPnr.to],
                ["Chart", normalizedPnr.chartStatus],
                ["Provider summary", normalizedPnr.status],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl bg-white p-3 dark:bg-white/8">
                  <div className="text-[10px] font-black uppercase text-slate-400">{label}</div>
                  <div className="mt-1 font-black">{String(value)}</div>
                </div>
              ))}
            </div>
            {(state.data?.warning || normalizedPnr.warning) && <div className="mt-4 rounded-2xl border border-amber-300/35 bg-amber-50 p-3 text-xs font-black leading-5 text-amber-900 dark:border-amber-300/20 dark:bg-amber-300/10 dark:text-amber-100">{state.data?.warning || normalizedPnr.warning}</div>}
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs font-black uppercase text-slate-400">Passenger status</div>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              {passengers.map((passenger: any, index: number) => {
                const fromCode = normalizedPnr.from.includes(" — ") ? normalizedPnr.from.split(" — ")[1] : normalizedPnr.from;
                const toCode = normalizedPnr.to.includes(" — ") ? normalizedPnr.to.split(" — ")[1] : normalizedPnr.to;
                const routeLabel = fromCode && toCode ? `${fromCode} → ${toCode}` : "--";
                const chanceVal = confirmationChanceFromStatus(passenger.currentStatus);
                const chanceLabel = chanceVal !== null ? `${chanceVal}% Chance` : "100% Chance";

                return (
                  <div key={`${passenger.passenger || passenger.Number || index}`} className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm dark:border-white/10 dark:bg-black/20 sm:grid-cols-7">
                    <div><div className="text-[10px] font-black uppercase text-slate-400">Passenger</div><div className="mt-1 font-black">{passenger.passenger}</div></div>
                    <div><div className="text-[10px] font-black uppercase text-slate-400">From / To</div><div className="mt-1 font-black text-slate-700 dark:text-slate-300">{routeLabel}</div></div>
                    <div>
                      <div className="text-[10px] font-black uppercase text-slate-400">Booked as</div>
                      <div className={`mt-1 font-black ${passenger.hasBookingAtBookingTime ? "" : "text-slate-500 dark:text-slate-300"}`}>{passenger.bookingStatus}</div>
                      {!passenger.hasBookingAtBookingTime && <div className="mt-1 text-[10px] font-black uppercase text-amber-600 dark:text-amber-200">{passenger.bookingNote}</div>}
                    </div>
                    <div>
                      <div className="text-[10px] font-black uppercase text-slate-400">Current now</div>
                      <div className="mt-1 font-black text-emerald-700 dark:text-emerald-200">{passenger.currentStatus}</div>
                      <div className="mt-1 text-[10px] font-black uppercase text-amber-600 dark:text-amber-200">{passenger.currentNote}</div>
                    </div>
                    <div>
                      <div className="text-[10px] font-black uppercase text-slate-400">Confirm Chance</div>
                      <div className="mt-1 font-black">
                        <span className={`rounded-md border px-2 py-0.5 text-[11px] font-black inline-block ${confirmationChanceTone(passenger.currentStatus)}`}>
                          {chanceLabel}
                        </span>
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-black uppercase text-slate-400">Movement</div>
                      <div className={`mt-1 font-black ${passenger.movementAvailable ? "text-cyan-700 dark:text-cyan-200" : "text-slate-500 dark:text-slate-300"}`}>{passenger.movement}</div>
                      {!passenger.movementAvailable && <div className="mt-1 text-[10px] font-black uppercase text-slate-400">Needs booked-as value</div>}
                    </div>
                    <div><div className="text-[10px] font-black uppercase text-slate-400">Coach / berth</div><div className="mt-1 font-black">{passenger.coach}</div></div>
                  </div>
                );
              })}
              {!passengers.length && <div className="rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-500 dark:bg-black/20 dark:text-slate-300">Provider returned PNR metadata but did not return passenger rows.</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
