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
import { TrustSummary, QuotaTimingNotice, RunningDaysStrip } from "../shared/TrustSummary";
import { StationAutocomplete, RelatedStationChips, QuickSearch } from "../shared/StationAutocomplete";
import { ProductShell } from "../layout/ProductShell";
import { ToolHeader } from "../layout/ToolHeader";
import { CoachExplorer } from "./CoachExplorer";
import { BookingWorkspace } from "./BookingWorkspace";


export function RailRouteHomePage() {
  return (
    <ProductShell>
      <section className="relative min-h-[820px] overflow-hidden bg-slate-950 px-4 py-10 text-white sm:px-6 lg:min-h-[860px] lg:py-16">
        <Image src="/cinematic-train-hero-train.jpg" alt="Cinematic train arriving at a night railway platform" fill priority sizes="100vw" className="object-cover object-center opacity-70" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(2,6,23,0.94)_0%,rgba(2,6,23,0.82)_36%,rgba(2,6,23,0.45)_66%,rgba(2,6,23,0.76)_100%)]" />
        <div className="absolute inset-0 bg-slate-950/35" />
        <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-[#050816] to-transparent" />

        <div className="relative z-10 mx-auto grid max-w-7xl gap-8 lg:items-center">
          <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className="max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-md border border-cyan-200/25 bg-slate-950/45 px-4 py-2 text-xs font-black uppercase text-cyan-100">
              <Sparkles className="h-3.5 w-3.5" />
              Provider-backed railway planning
            </span>
            <h1 className="mt-7 max-w-4xl text-5xl font-black leading-[1.02] tracking-tight text-white sm:text-7xl">
              PLAN TRUSTWORTHY RAILWAY JOURNEYS
            </h1>
            <p className="mt-6 max-w-2xl text-lg font-semibold leading-8 text-slate-200">
              Search trains, routes, split options and class-wise fare or availability only when the provider returns them for the selected journey.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              {[
                ["Search Trains", "/trains", Search],
                ["PNR Status", "/pnr", ShieldCheck],
                ["Coach Layouts", "/coach", Train],
              ].map(([label, href, Icon], index) => {
                const I = Icon as typeof Search;
                return (
                  <Link key={String(label)} href={String(href)} className={`flex h-12 items-center gap-2 rounded-xl px-5 text-sm font-black transition ${index === 0 ? "bg-white text-slate-950 hover:bg-cyan-50" : "border border-white/15 bg-slate-950/35 text-white hover:bg-white/16"}`}>
                    <I className="h-4 w-4" />
                    {String(label)}
                  </Link>
                );
              })}
            </div>
            <div className="mt-8">
              <QuickSearch compact />
            </div>
          </motion.div>
        </div>
      </section>

      <section className="relative z-10 mx-auto -mt-12 max-w-7xl px-4 pb-14 sm:px-6">
        <div className="overflow-hidden rounded-[34px] border border-white/10 bg-slate-950/95 p-5 text-white shadow-2xl shadow-slate-950/30 backdrop-blur-2xl sm:p-6">
          <div className="flex flex-col gap-3 border-b border-white/10 pb-5 md:flex-row md:items-end md:justify-between">
            <div>
              <span className="text-xs font-black uppercase text-cyan-200">Quick utility cockpit</span>
              <h2 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Railway tools that actually move the journey forward.</h2>
            </div>
            <p className="max-w-md text-sm font-semibold leading-6 text-slate-400">
              Direct access to ticket checks, provider availability, date-specific fares, coach layouts, routes and split planning.
            </p>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["PNR Status", "/pnr", ShieldCheck, "Chart and passenger status"],
            ["Train Route", "/route", Route, "Complete station timeline"],
            ["Coach Layout", "/coach", Train, "Berth layout reference"],
            ["Seat Availability", "/trains", WalletCards, "Provider class quota"],
            ["Fare Calculator", "/fare", IndianRupee, "Date-specific when returned"],
            ["Platform Notes", "/route", Compass, "Provider platform fields when returned"],
            ["Split Journey Planner", "/trains", ArrowDownUp, "Clearly labelled two-leg options"],
          ].map(([title, href, Icon, body]) => {
            const I = Icon as typeof Route;
            return (
              <Link key={String(title)} href={String(href)} className="group rounded-[26px] border border-white/10 bg-white/[0.055] p-5 shadow-xl shadow-black/10 backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:border-cyan-200/35 hover:bg-white/[0.09] hover:shadow-cyan-950/30">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/10 text-cyan-100 transition group-hover:border-cyan-200/40 group-hover:bg-cyan-200/15">
                  <I className="h-5 w-5" />
                </span>
                <h3 className="mt-5 text-lg font-black">{String(title)}</h3>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-400">{String(body)}</p>
                <div className="mt-5 flex items-center gap-2 text-xs font-black uppercase text-cyan-200/80">
                  Open tool
                  <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-1" />
                </div>
              </Link>
            );
          })}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <div className={softPanel("grid gap-4 rounded-[34px] p-6 md:grid-cols-4")}>
          {[
            ["8,990", "station search index"],
            ["IRCTC", "compatible checks"],
            ["Full", "route timelines"],
            ["Dark + Light", "persistent themes"],
          ].map(([value, label]) => (
            <div key={label} className="rounded-3xl bg-slate-50 p-5 dark:bg-black/20">
              <div className="text-3xl font-black">{value}</div>
              <div className="mt-1 text-sm font-bold text-slate-500 dark:text-slate-400">{label}</div>
            </div>
          ))}
        </div>
      </section>
    </ProductShell>
  );
}
