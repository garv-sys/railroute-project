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
import { ProductShell } from "../layout/ProductShell";
import { ToolHeader } from "../layout/ToolHeader";
import { CoachExplorer } from "./CoachExplorer";
import { BookingWorkspace } from "./BookingWorkspace";


import { PnrTool } from "./PnrTool";
import { FareTool } from "./FareTool";
import { LiveTool } from "./LiveTool";
import { TrainSearchPanel } from "./TrainSearchPanel";
import { TrainResultsWorkspace } from "./TrainResultsWorkspace";
import { ProviderHealthDashboard } from "./BookingWorkspace";

export function RailRouteToolPage({ tool }: { tool: ToolKind }) {
  return (
    <ProductShell active={tool}>
      <ToolHeader tool={tool} />
      {tool === "book" && <BookingWorkspace />}
      {tool === "trains" && (
        <>
          <TrainResultsWorkspace />
          <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6"><TrainSearchPanel compact /></section>
        </>
      )}
      {tool === "train-search" && <section className="px-4 pb-16 sm:px-6"><TrainSearchPanel /></section>}
      {tool === "live" && <section className="px-4 pb-16 sm:px-6"><LiveTool /></section>}
      {tool === "pnr" && <section className="px-4 pb-16 sm:px-6"><PnrTool /></section>}
      {tool === "fare" && <section className="px-4 pb-16 sm:px-6"><FareTool /></section>}
      {tool === "route" && <section className="px-4 pb-16 sm:px-6"><TrainSearchPanel /></section>}
      {tool === "coach" && <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6"><CoachExplorer /></section>}
      {tool === "health" && <ProviderHealthDashboard />}
    </ProductShell>
  );
}
