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
  toolNav,
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
import { ToolHeader } from "./ToolHeader";
import { CoachExplorer } from "../tools/CoachExplorer";
import { BookingWorkspace } from "../tools/BookingWorkspace";


export function ProductShell({ children, active }: { children: React.ReactNode; active?: ToolKind }) {
  return (
    <main className={`${productBg()} notranslate`} translate="no">
      <div className="pointer-events-none fixed inset-0 z-0 bg-[linear-gradient(180deg,#f8fafc_0%,#eef2f7_52%,#e5e7eb_100%)] dark:bg-[linear-gradient(180deg,#050816_0%,#08111f_52%,#0b1020_100%)]" />
      <nav className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/95 dark:border-white/8 dark:bg-[#050816]/95">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href="/" className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-lg dark:bg-white dark:text-slate-950">
              <Train className="h-5 w-5" />
            </span>
            <span className="text-lg font-black tracking-tight">RailRoute</span>
          </Link>
          <div className="hidden items-center gap-1 lg:flex">
            {toolNav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-2xl px-3 py-2 text-sm font-bold transition ${
                  active === item.tool
                    ? "bg-slate-950 text-white dark:bg-white dark:text-slate-950"
                    : "text-slate-500 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-white/8 dark:hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link href="/trains" className="hidden items-center gap-2 rounded-2xl bg-slate-950 px-4 py-2 text-sm font-black text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-cyan-50 sm:flex">
              Search Trains
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
        <div className="border-t border-slate-200/70 px-4 py-2 dark:border-white/8 lg:hidden">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {toolNav.map((item) => (
              <Link
                key={`mobile-${item.href}`}
                href={item.href}
                className={`shrink-0 rounded-full px-3 py-2 text-xs font-black transition ${
                  active === item.tool
                    ? "bg-slate-950 text-white dark:bg-white dark:text-slate-950"
                    : "bg-slate-100 text-slate-600 dark:bg-white/8 dark:text-slate-200"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </nav>
      <div className="relative z-10">{children}</div>
      <footer className="relative z-10 mx-auto max-w-7xl px-4 pb-10 sm:px-6">
        <div className="rounded-3xl border border-slate-200 bg-white/85 p-4 text-xs font-semibold leading-6 text-slate-500 shadow-sm dark:border-white/10 dark:bg-white/6 dark:text-slate-300">
          RailRoute shows provider-backed train, fare and availability data when returned for the exact train/date/class/quota. Final seat availability, fare, platform, coach position, concessions, booking rules and charting status can change at IRCTC or railway operations until booking and journey time.
        </div>
      </footer>
    </main>
  );
}


