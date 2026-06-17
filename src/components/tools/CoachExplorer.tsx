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
import { TrustSummary, QuotaTimingNotice, RunningDaysStrip, trainNumberName, availabilityTone, classAvailabilityStatus, defaultCoachFor, compatibleCoaches, groupSeatsForClass, classFareText, fareTone, classDataSourceLabel } from "../shared/TrustSummary";
import { StationAutocomplete, RelatedStationChips, QuickSearch } from "../shared/StationAutocomplete";
import { ProductShell } from "../layout/ProductShell";
import { ToolHeader } from "../layout/ToolHeader";
import { BookingWorkspace } from "./BookingWorkspace";


export function CoachExplorer({ initialClass = "3A", embedded = false, train }: { initialClass?: string; embedded?: boolean; train?: any }) {
  const [classType, setClassType] = useState(initialClass);
  const [coach, setCoach] = useState(() => defaultCoachFor(initialClass));
  const [selected, setSelected] = useState<string[]>([]);
  const seats = useMemo(() => buildCoachSeats(classType, coach), [classType, coach]);
  const coachOptions = compatibleCoaches(classType);
  const seatGroups = useMemo(() => groupSeatsForClass(classType, seats), [classType, seats]);
  const classSeatStatus = train ? classAvailabilityStatus(train, classType) : "";
  const classRate = train ? classFareText(train, classType) : "";
  const seatTile = (seat: ReturnType<typeof buildCoachSeats>[number], compact = false) => {
    const isSelected = selected.includes(seat.id);
    return (
      <button key={seat.id} type="button" disabled={seat.state === "booked"} onClick={() => setSelected((items) => items.includes(seat.id) ? items.filter((id) => id !== seat.id) : [...items, seat.id])} className={`${compact ? "h-12" : "h-14"} rounded-xl border text-xs font-black transition ${
        isSelected ? "border-cyan-500 bg-cyan-400 text-slate-950 shadow-lg shadow-cyan-400/20" :
        "border-slate-200 bg-white text-slate-700 dark:border-white/10 dark:bg-white/8 dark:text-slate-200"
      }`}>
        <span className="block leading-none">{seat.number}</span>
        <span className="mt-1 block text-[10px] leading-none">{seat.berth}</span>
      </button>
    );
  };

  return (
    <div className={embedded ? "" : softPanel("rounded-[32px] p-5")}>
      {train && (
        <div className="mb-4 rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-black/20">
          <div className="text-[11px] font-black uppercase text-slate-400">Current train coach explorer</div>
          <div className="mt-1 text-lg font-black">{trainNumberName(train)}</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <span className={`rounded-full border px-3 py-1.5 text-xs font-black ${availabilityTone(classSeatStatus)}`}>{classType} availability: {classSeatStatus}</span>
	            <span className={`rounded-full border px-3 py-1.5 text-xs font-black ${fareTone(classRate)}`}>{classType} rate: {classRate}</span>
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-600 dark:border-white/10 dark:bg-white/8 dark:text-slate-200">{classDataSourceLabel(train, classType)}</span>
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {classOptions.map((item) => <button key={item} onClick={() => { setClassType(item); setCoach(defaultCoachFor(item)); setSelected([]); }} className={`rounded-full border px-3 py-2 text-xs font-black ${classType === item ? "border-cyan-400 bg-cyan-100 text-cyan-800 dark:bg-cyan-300/12 dark:text-cyan-100" : "border-slate-200 bg-white dark:border-white/10 dark:bg-white/6"}`}>{item}</button>)}
      </div>
      <div className="mt-4 flex gap-2 overflow-auto pb-2">
        {coachOptions.map((item) => <button key={item} onClick={() => { setCoach(item); setSelected([]); }} className={`shrink-0 rounded-2xl border px-4 py-2 text-sm font-black ${coach === item ? "border-slate-950 bg-slate-950 text-white dark:border-white dark:bg-white dark:text-slate-950" : "border-slate-200 bg-white dark:border-white/10 dark:bg-white/6"}`}>{item}</button>)}
      </div>
      <div className="mt-5 rounded-[28px] border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-black/20">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="font-black">{classType === "1A" ? `${coach} cabin / coupe layout` : `${coach} coach berth layout`}</h3>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
              {classType === "1A" ? "1AC cabins use LB/UB berths, not 3-tier bays" : classType === "2A" ? "2AC bays use LB/UB plus side lower/upper, no middle berth" : ["3A", "3E", "SL"].includes(classType) ? "Each bay shows 6 main berths + 2 side berths" : "Chair car row layout"}
            </p>
            <p className="mt-1 text-xs font-black text-cyan-700 dark:text-cyan-200">Exploring all {seatGroups.length} {["CC", "EC"].includes(classType) ? "rows" : classType === "1A" ? "cabins/coupes" : "bays"} in {coach}</p>
          </div>
          <Train className="h-5 w-5 text-cyan-600 dark:text-cyan-200" />
        </div>
        <div className="mb-4 flex flex-wrap gap-2">
          <span className="rounded-full border border-slate-300 bg-white px-3 py-1 text-[11px] font-black text-slate-700 dark:border-white/10 dark:bg-white/8 dark:text-slate-200">Layout reference only</span>
          <span className="rounded-full border border-amber-300 bg-amber-100 px-3 py-1 text-[11px] font-black text-amber-800 dark:bg-amber-300/12 dark:text-amber-100">Availability shown separately</span>
          <span className="rounded-full border border-slate-300 bg-slate-200 px-3 py-1 text-[11px] font-black text-slate-600 dark:border-white/10 dark:bg-white/10 dark:text-slate-300">No occupied berth positions</span>
          <span className="rounded-full border border-cyan-300 bg-cyan-50 px-3 py-1 text-[11px] font-black text-cyan-800 dark:bg-cyan-300/12 dark:text-cyan-100">Actual berth numbers are post-booking/chart only</span>
        </div>
        <div className="grid gap-3 xl:grid-cols-2">
          {seatGroups.map((group) => (
            <div key={group.label} className="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-white/6">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="text-[11px] font-black uppercase text-slate-400">{group.label}</div>
                <div className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-500 dark:bg-black/20 dark:text-slate-300">
                  {classType === "1A" ? "Cabin/Coupe" : ["CC", "EC"].includes(classType) ? "Chair row" : "Bay + side"}
                </div>
              </div>
              {classType === "1A" ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-black/20">
                  <div className="mb-2 text-center text-[10px] font-black uppercase text-slate-400">Private cabin area</div>
                  <div className="grid grid-cols-2 gap-2">{group.seats.map((seat) => seatTile(seat))}</div>
                </div>
              ) : ["CC", "EC"].includes(classType) ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-black/20">
                  <div className="mb-2 text-center text-[10px] font-black uppercase text-slate-400">W · MW · M · ME · E</div>
                  <div className="grid grid-cols-5 gap-2">{group.seats.map((seat) => seatTile(seat, true))}</div>
                </div>
              ) : (
                <div className="grid grid-cols-[1fr_42px_84px] gap-2">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-2 dark:border-white/10 dark:bg-black/20">
                    <div className={`grid gap-2 ${classType === "2A" ? "grid-cols-2" : "grid-cols-3"}`}>
                      {group.seats.slice(0, classType === "2A" ? 4 : 6).map((seat) => seatTile(seat, true))}
                    </div>
                    <div className="mt-2 text-center text-[10px] font-black uppercase text-slate-400">Main bay</div>
                  </div>
                  <div className="flex items-center justify-center rounded-2xl bg-slate-100 text-[10px] font-black uppercase tracking-wide text-slate-400 [writing-mode:vertical-rl] dark:bg-black/20">
                    aisle
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-2 dark:border-white/10 dark:bg-black/20">
                    <div className="grid gap-2">{group.seats.slice(classType === "2A" ? 4 : 6).map((seat) => seatTile(seat, true))}</div>
                    <div className="mt-2 text-center text-[10px] font-black uppercase text-slate-400">Side</div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function readPnrStation(value: any) {
  if (!value) return "";
  if (typeof value === "string") return value;
  const name = value.name || value.stationName || value.StationName || value.station || "";
  const code = value.code || value.stationCode || value.StationCode || "";
  if (name && code) return `${name} — ${String(code).toUpperCase()}`;
  return name || code || "";
}

function normalizeStatusObject(obj: any): string {
  if (!obj || typeof obj !== "object") return "";
  
  if (obj.details && typeof obj.details === "string") {
    const upperDetails = obj.details.toUpperCase();
    if (upperDetails.startsWith("CNF")) {
      return "CNF";
    }
    const quotaMatch = upperDetails.match(/\b(GNWL|RLWL|PQWL|TQWL|CKWL|RSWL|WL|RAC)\s*[-/]?\s*0*(\d+)\b/);
    if (quotaMatch) return `${quotaMatch[1]}-${quotaMatch[2]}`;
    return obj.details;
  }
  
  const status = obj.status || obj.Status || "";
  const statusStr = String(status).trim();
  const upperStatus = statusStr.toUpperCase();
  
  if (upperStatus === "CNF" || upperStatus === "CONFIRMED") {
    return "CNF";
  }
  
  const number = obj.berthNo ?? obj.number ?? obj.position ?? obj.WaitlistNo ?? obj.waitlistNo ?? "";
  const numStr = String(number).trim();
  
  if (upperStatus && numStr && !isNaN(Number(numStr))) {
    return `${upperStatus}-${numStr}`;
  }
  
  return statusStr;
}

export function normalizePnrStatusText(value: unknown): string {
  if (value == null) return "--";
  if (typeof value === "object") {
    const res = normalizeStatusObject(value);
    if (res) return res;
  }
  const text = liveDisplayValue(value).replace(/\s+/g, " ").trim();
  if (!text || text === "--") return "--";
  const upper = text.toUpperCase();
  const quotaMatch = upper.match(/\b(GNWL|RLWL|PQWL|TQWL|CKWL|RSWL|WL|RAC)\s*[-/]?\s*0*(\d+)\b/);
  if (quotaMatch) return `${quotaMatch[1]}-${quotaMatch[2]}`;
  const genericWaitlist = upper.match(/\b(?:WAITLIST|WAITING|WL)\s*[-/]?\s*0*(\d+)\b/);
  if (genericWaitlist) return `WL-${genericWaitlist[1]}`;
  if (/\b(?:CNF|CONFIRMED|CONFIRM)\b/.test(upper)) return "CNF";
  if (/\b(?:WAITLIST|WAITING)\b/.test(upper)) return "Waitlist";
  return text;
}

export function pickPassengerField(passenger: any, keys: string[]) {
  for (const key of keys) {
    const value = passenger?.[key];
    if (value != null && value !== "") return value;
  }
  return "";
}

export const pnrBookingStatusKeys = [
  "bookingStatusDetails",
  "BookingStatusDetails",
  "booking_status_details",
  "booking_status_number",
  "BookingStatusNumber",
  "bookingStatusNumber",
  "bookingPosition",
  "BookingPosition",
  "bookingPositionNumber",
  "BookingPositionNumber",
  "bookingWL",
  "BookingWL",
  "bookingWaitlist",
  "BookingWaitlist",
  "reservationStatus",
  "ReservationStatus",
  "bookedStatus",
  "BookedStatus",
  "booked_status",
  "BookingStatus",
  "bookingStatus",
  "booking_status",
  "booking",
  "Booking",
];

export const pnrCurrentStatusKeys = [
  "currentStatusDetails",
  "CurrentStatusDetails",
  "current_status_details",
  "CurrentStatus",
  "currentStatus",
  "current_status",
  "current",
  "Current",
];

export const pnrGenericStatusKeys = ["status", "Status", "passengerStatus", "PassengerStatus"];

export function normalizePnrCoachText(passenger: any, currentStatus: string) {
  const pick = (fieldKeys: string[]) => {
    if (passenger?.current && typeof passenger.current === "object") {
      const val = pickPassengerField(passenger.current, fieldKeys);
      if (val !== "") return val;
    }
    if (passenger?.booking && typeof passenger.booking === "object") {
      const val = pickPassengerField(passenger.booking, fieldKeys);
      if (val !== "") return val;
    }
    return pickPassengerField(passenger, fieldKeys);
  };

  const coachKeys = ["coach", "Coach", "coachNo", "CoachNo", "coachNumber", "CoachNumber"];
  const berthKeys = ["berth", "Berth", "berthNo", "BerthNo", "berthNumber", "BerthNumber", "berthType", "BerthType", "berthCode", "BerthCode"];
  const seatKeys = ["seat", "Seat", "seatNo", "SeatNo"];

  let coach = pick(coachKeys);
  let berth = pick(berthKeys);
  let seat = pick(seatKeys);

  const details = passenger?.current?.details || passenger?.booking?.details || passenger?.details || "";
  if (details && typeof details === "string" && (!coach || !berth)) {
    const parts = details.split("/");
    if (parts[0] === "CNF" && parts.length >= 3) {
      if (!coach) coach = parts[1];
      if (!berth) berth = parts[2];
    }
  }

  const coachText = liveDisplayValue(coach).trim();
  const berthText = liveDisplayValue(berth).trim();
  const seatText = liveDisplayValue(seat).trim();
  const current = currentStatus.toUpperCase();
  
  const parts: string[] = [];
  if (coachText && coachText !== "--" && /[A-Z0-9]/i.test(coachText) && !/\b(WL|RAC|WAITLIST)\b/i.test(coachText)) {
    parts.push(coachText);
  }
  if (berthText && berthText !== "--" && !/\b(WL|RAC|WAITLIST)\b/i.test(berthText)) {
    parts.push(berthText);
  }
  if (!/\b(WL|RAC|WAITLIST|RLWL|GNWL|PQWL|TQWL)\b/.test(current) && seatText && seatText !== "--" && seatText !== berthText) {
    parts.push(seatText);
  }

  return parts.length ? parts.join(" / ") : "--";
}

export function pnrStatusFromSeat(passenger: any) {
  const seat = pickPassengerField(passenger, ["seat", "Seat", "seatNo", "SeatNo", "berth", "Berth", "berthNo", "BerthNo"]);
  const normalized = normalizePnrStatusText(seat);
  return /\b(?:GNWL|RLWL|PQWL|TQWL|CKWL|RSWL|WL|RAC)-\d+\b/i.test(normalized) ? normalized : "";
}

export function parsePnrPosition(value: unknown) {
  const normalized = normalizePnrStatusText(value);
  const match = normalized.toUpperCase().match(/\b(GNWL|RLWL|PQWL|TQWL|CKWL|RSWL|WL|RAC)-(\d+)\b/);
  if (!match) return null;
  return { quota: match[1], number: Number(match[2]), label: `${match[1]}-${Number(match[2])}` };
}

export function pnrMovementLabel(bookingStatus: string, currentStatus: string) {
  const booking = parsePnrPosition(bookingStatus);
  const current = parsePnrPosition(currentStatus);
  if (booking && current) {
    if (booking.quota !== current.quota) return `${booking.label} → ${current.label}`;
    const improvement = booking.number - current.number;
    if (improvement > 0) return `+${improvement} positions`;
    if (improvement < 0) return `${Math.abs(improvement)} positions worse`;
    return "No movement";
  }
  if (booking && currentStatus.toUpperCase() === "CNF") {
    return `${booking.label} → CNF`;
  }
  return "Unavailable";
}

export function normalizePnrPassenger(passenger: any, index: number) {
  const bookingExplicit = pickPassengerField(passenger, pnrBookingStatusKeys);
  const currentExplicit = pickPassengerField(passenger, pnrCurrentStatusKeys);
  const genericStatus = pickPassengerField(passenger, pnrGenericStatusKeys);
  const seatStatus = pnrStatusFromSeat(passenger);
  const bookingRaw = bookingExplicit;
  const currentRaw = currentExplicit || seatStatus || genericStatus;
  const bookingStatus = bookingRaw ? normalizePnrStatusText(bookingRaw) : "Provider did not return booking-time position";
  const currentStatus = normalizePnrStatusText(currentRaw);
  const hasBookingAtBookingTime = Boolean(bookingExplicit);
  const hasCurrentStatus = Boolean(currentExplicit || seatStatus);
  const providerSeparated = hasBookingAtBookingTime && hasCurrentStatus;
  const movement = hasBookingAtBookingTime && hasCurrentStatus ? pnrMovementLabel(bookingStatus, currentStatus) : "Unavailable";
  return {
    passenger: passenger?.passenger || passenger?.name || passenger?.Name || passenger?.Number || passenger?.serialNo || index + 1,
    bookingStatus,
    currentStatus,
    coach: normalizePnrCoachText(passenger, currentStatus),
    hasBookingAtBookingTime,
    hasCurrentStatus,
    providerSeparated,
    movement,
    movementAvailable: movement !== "Unavailable",
    bookingNote: hasBookingAtBookingTime ? "Provider returned booking-time value" : "Provider did not return booked-as WL/RAC/CNF position",
    currentNote: currentExplicit ? "Provider returned current value" : seatStatus ? "Provider returned current waitlist number" : genericStatus ? "Provider returned one status field" : "Provider did not return status details",
  };
}

export function normalizePnrPayload(payload: any, fallbackPnr: string) {
  const data = payload?.data || payload || {};
  const train = data.train || data.Train || data.trainInfo || data.train_info || {};
  const journey = data.journey || data.Journey || {};
  const chart = data.chart || data.Chart || {};
  const passengersRaw =
    data.passengers ||
    data.Passengers ||
    data.PassengerStatus ||
    data.passengerStatus ||
    data.passengerList ||
    data.PassengerList ||
    [];
  const passengers = (Array.isArray(passengersRaw) ? passengersRaw : []).map(normalizePnrPassenger);
  const from = readPnrStation(journey.from || journey.From || journey.source || journey.Source || data.from || data.Source || data.From);
  const to = readPnrStation(journey.to || journey.To || journey.destination || journey.Destination || data.to || data.Destination || data.To);

  return {
    raw: data,
    pnr: data.pnr || data.PNR || fallbackPnr,
    trainNo: train.number || train.trainNo || train.TrainNo || data.trainNo || data.TrainNo || "--",
    trainName: train.name || train.trainName || train.TrainName || data.trainName || data.TrainName || "Train details",
    journeyDate: journey.dateOfJourney || journey.DateOfJourney || data.dateOfJourney || data.DateOfJourney || data.journeyDate || data.JourneyDate || journey.date || journey.departure || "--",
    from: from || "--",
    to: to || "--",
    chartStatus: chart.status || chart.message || data.chartStatus || data.ChartPrepared || data.ChartStatus || "--",
    status: data.status || data.Status || passengers[0]?.currentStatus || "--",
    passengers,
    warning: data.warning || payload?.warning || payload?.meta?.warning || "",
  };
}
