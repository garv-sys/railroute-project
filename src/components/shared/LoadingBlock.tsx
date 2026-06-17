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

import { softPanel, productBg } from "./styles";
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
} from "./constants";
import { postJson } from "./api";
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
} from "./utils";
import { TrustSummary, QuotaTimingNotice, RunningDaysStrip } from "./TrustSummary";
import { StationAutocomplete, RelatedStationChips, QuickSearch } from "./StationAutocomplete";
import { ProductShell } from "../layout/ProductShell";
import { ToolHeader } from "../layout/ToolHeader";
import { CoachExplorer } from "../tools/CoachExplorer";
import { BookingWorkspace } from "../tools/BookingWorkspace";


export function LoadingBlock({ label }: { label: string }) {
  return (
    <div className={softPanel("mt-6 rounded-[28px] p-6")}>
      <div className="flex items-center gap-3 text-sm font-black text-slate-500 dark:text-slate-300"><Loader2 className="h-4 w-4 animate-spin" />{label}</div>
      <div className="mt-5 grid gap-3 md:grid-cols-3">{[0, 1, 2].map((item) => <div key={item} className="h-24 animate-pulse rounded-3xl bg-slate-100 dark:bg-white/8" />)}</div>
    </div>
  );
}
