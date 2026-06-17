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
  type ToolKind,
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
import { ProductShell } from "./ProductShell";
import { CoachExplorer } from "../tools/CoachExplorer";
import { BookingWorkspace } from "../tools/BookingWorkspace";


export function ToolHeader({ tool }: { tool: ToolKind }) {
  const copy: Record<ToolKind, [string, string]> = {
    trains: ["Train Search", "Search by stations, train number, or train name with railway intelligence."],
    "train-search": ["Train Number Search", "Full train details, running days, route and complete timetable."],
    live: ["Train Running Status", "Check running status when the provider is available, with a clear unavailable state otherwise."],
    pnr: ["PNR Status", "Passenger status, chart state and journey summary."],
    fare: ["Fare Enquiry", "Live fare only when the selected-date availability provider returns it."],
    route: ["Route Details", "Complete station timeline with arrival, departure, halt, distance, and provider-returned platform when available."],
    coach: ["Coach Explorer", "Interactive berth layout with coach tabs and availability states."],
    book: ["Booking Workspace", "Search, compare, verify fare and hand off final booking to IRCTC with clear provider labels."],
    health: ["Provider Health", "API usage, queue, cache and route QA signals without making a fresh provider call."],
  };
  return (
    <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <span className="inline-flex rounded-full border border-cyan-300/35 bg-cyan-100 px-4 py-2 text-xs font-black uppercase text-cyan-800 dark:bg-cyan-300/10 dark:text-cyan-100">RailRoute app</span>
      <h1 className="mt-5 text-4xl font-black tracking-tight sm:text-6xl">{copy[tool][0]}</h1>
      <p className="mt-4 max-w-3xl text-base font-semibold leading-7 text-slate-600 dark:text-slate-300">{copy[tool][1]}</p>
    </section>
  );
}
