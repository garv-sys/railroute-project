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
import dynamic from "next/dynamic";
const LeafletRouteMap = dynamic(() => import("../shared/LeafletRouteMap"), { ssr: false });
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
  stationCompactLabel,
} from "../shared/utils";
import { LoadingBlock } from "../shared/LoadingBlock";
import { TrustSummary, QuotaTimingNotice, RunningDaysStrip, primaryClassCode, classAvailabilityStatus, compactSeatText, classAvailabilityText, returnedClassesForTrain, liveFareText, compactFareText, fareTone, availabilityTone, readableRailStatus, fareToNumber, durationToMinutes, splitTotalDuration, splitLayoverMinutes, classFareAmount, trainFareAmount, timeToMinutes, multiSplitLayoverMinutes, actualLegSourceStation, actualLegDestinationStation, trainNumberName, isSeatAvailable, splitHasVerifiedFareAndSeats, formatFare, formatDurationLong, multiSplitHasVerifiedFareAndSeats, classFareText, classDataSourceLabel, debugModeEnabled, providerMarkedSelectedClassUnavailable, hasVerifiedFareAndSeat, dedupeSplitRoutes, isLongJourneyStationPair, splitRouteStableKey, splitAutoLiveRouteCountForJourney, liveSourceStation, liveDestinationStation, trainJourneyDate, needsLiveQuotaRefresh, type LiveClassQuote, applyLiveQuoteToTrain, liveQuoteFromResponse, isProviderDelay, providerDelayCopy, providerIssueCopy, lookupStatusLabel, fullStationLabelFromCode, SearchResultSummary, ResultSectionHeader, displayClassesForTrain, classCalendarFor, legUsesAlternateTerminal, nearbyTerminalDistanceSummary, requestedSourceStation, requestedDestinationStation, isUnavailableRailStatus, normalizedClassList, liveDataUnavailableWarning, ticketDecision, compactDebugJson, ExpectedPlatformPair, confirmationChanceLabel, confirmationChanceTone, PlatformPairSummary, platformDisplay, FareBreakdownPanel, availabilityCardTone, legDataTrustCopy, estimatedFareAmount, selectedClassCanBeChecked, providerBookingBlockedText } from "../shared/TrustSummary";
import { StationAutocomplete, RelatedStationChips, QuickSearch, resolveStationInput, splitBestRankScore, splitAvailabilityScore, multiSplitBestRankScore, DateQuickField, NearbyDateSuggestions } from "../shared/StationAutocomplete";
import { ProductShell } from "../layout/ProductShell";
import { ToolHeader } from "../layout/ToolHeader";
import { CoachExplorer } from "./CoachExplorer";
import { BookingWorkspace } from "./BookingWorkspace";


export function TrainResultsWorkspace() {
  const searchRequestId = useRef(0);
  const liveHydrationGeneration = useRef(0);
  const liveHydrationChain = useRef(Promise.resolve());
  const splitAutoCheckedRouteCount = useRef(0);
  const lastAutoSearchKey = useRef("");
  const [searchKey, setSearchKey] = useState("");
  const [source, setSource] = useState(DEFAULT_SOURCE_CODE);
  const [destination, setDestination] = useState(DEFAULT_DESTINATION_CODE);
  const [preferredHub, setPreferredHub] = useState(DEFAULT_VIA_CODE);
  const [sourceQuery, setSourceQuery] = useState(stationLabelFromCode(DEFAULT_SOURCE_CODE));
  const [destinationQuery, setDestinationQuery] = useState(stationLabelFromCode(DEFAULT_DESTINATION_CODE));
  const [preferredHubQuery, setPreferredHubQuery] = useState(stationLabelFromCode(DEFAULT_VIA_CODE));
  const [date, setDate] = useState(todayIso());
  const [classType, setClassType] = useState("3A");
  const [quota, setQuota] = useState("GN");
  const allowSplit = true;
  const [resultMode, setResultMode] = useState<"all" | "direct" | "split" | "multi">("all");
  const [sortBy, setSortBy] = useState<"best" | "cheapest" | "highestFare" | "fastest" | "lowestLayover" | "earliest" | "latest">("best");
  const [maxFare, setMaxFare] = useState("");
  const [maxDuration, setMaxDuration] = useState("");
  const [confirmedOnly, setConfirmedOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [pendingMaxFare, setPendingMaxFare] = useState("");
  const [pendingMaxDuration, setPendingMaxDuration] = useState("");
  const [state, setState] = useState<{
    loading: boolean;
    splitLoading: boolean;
    splitCoverage: "none" | "quick" | "full";
    error: string;
    trains: any[];
    splits: any[];
    multiSplits: any[];
  }>({ loading: false, splitLoading: false, splitCoverage: "none", error: "", trains: [], splits: [], multiSplits: [] });
  const [liveHydration, setLiveHydration] = useState<LiveHydrationState>(emptyLiveHydration);
  const [manualLiveCheck, setManualLiveCheck] = useState("");
  const [classView, setClassView] = useState<{ train: any; classCode: string } | null>(null);
  const [detailTrain, setDetailTrain] = useState<any | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [recentSearches, setRecentSearches] = useState<{ from: string; to: string; date: string; class: string; quota: string; via?: string }[]>([]);

  useEffect(() => {
    function loadRecentSearches() {
      try {
        const stored = localStorage.getItem("railroute_recent_searches");
        if (stored) {
          setRecentSearches(JSON.parse(stored));
        }
      } catch (e) {
        console.warn("Failed to load recent searches:", e);
      }
    }
    loadRecentSearches();
    window.addEventListener("railroute-recent-searches-updated", loadRecentSearches);
    return () => {
      window.removeEventListener("railroute-recent-searches-updated", loadRecentSearches);
    };
  }, []);

  function deleteRecentSearch(fromVal: string, toVal: string) {
    try {
      const updated = recentSearches.filter((item) => item.from !== fromVal || item.to !== toVal);
      setRecentSearches(updated);
      localStorage.setItem("railroute_recent_searches", JSON.stringify(updated));
    } catch (e) {
      console.warn("Failed to delete recent search:", e);
    }
  }

  const selectedSortClass = classType && classType !== "Any" ? classType.toUpperCase() : "";
  const filteredTrains = useMemo(() => {
    const fareLimit = Number(maxFare) || Infinity;
    const durationLimit = maxDuration ? Number(maxDuration) * 60 : Infinity;
    const next = state.trains.filter((train) => {
      // Search query filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const trainName = String(train.trainName || "").toLowerCase();
        const trainNo = String(train.trainNo || "").toLowerCase();
        if (!trainName.includes(query) && !trainNo.includes(query)) return false;
      }
      // Only show trains that have confirmed fare + seat availability
      if (!hasVerifiedFareAndSeat(train, selectedSortClass)) return false;
      // Confirmed seats only filter
      if (confirmedOnly) {
        const avail = String(train?.availability || "").toUpperCase();
        const classAvail = selectedSortClass ? String(train?.classAvailability?.[selectedSortClass]?.[0]?.text || "").toUpperCase() : avail;
        const status = classAvail || avail;
        if (!/\bAVAILABLE\b|\bAVL\b|\bCNF\b|\bCONFIRM/.test(status) || /WL|RAC|WAITLIST/.test(status)) return false;
      }
      const fare = selectedSortClass ? classFareAmount(train, selectedSortClass) : trainFareAmount(train);
      const duration = durationToMinutes(train.duration);
      if (fare && fare > fareLimit) return false;
      if (duration && duration > durationLimit) return false;
      return true;
    });
    return [...next].sort((a, b) => {
      const fareA = selectedSortClass ? classFareAmount(a, selectedSortClass) : trainFareAmount(a);
      const fareB = selectedSortClass ? classFareAmount(b, selectedSortClass) : trainFareAmount(b);
      const durationA = durationToMinutes(a.duration) || Infinity;
      const durationB = durationToMinutes(b.duration) || Infinity;
      if (sortBy === "cheapest") return (fareA || Infinity) - (fareB || Infinity) || durationA - durationB;
      if (sortBy === "highestFare") return (fareB || -Infinity) - (fareA || -Infinity) || durationA - durationB;
      if (sortBy === "fastest") return (durationToMinutes(a.duration) || Infinity) - (durationToMinutes(b.duration) || Infinity);
      if (sortBy === "lowestLayover") return durationA - durationB;
      if (sortBy === "earliest") return timeToMinutes(a.departureTime) - timeToMinutes(b.departureTime);
      if (sortBy === "latest") return timeToMinutes(b.departureTime) - timeToMinutes(a.departureTime);
      const availabilityScore = (train: any) => {
        const availability = selectedSortClass ? classAvailabilityText(train, selectedSortClass) : train.availability;
        return isSeatAvailable(availability) ? 0 : /RAC/i.test(readableRailStatus(availability)) ? 1 : 2;
      };
      return availabilityScore(a) - availabilityScore(b) || (fareA || Infinity) - (fareB || Infinity) || durationA - durationB;
    });
  }, [confirmedOnly, maxDuration, maxFare, selectedSortClass, sortBy, state.trains, searchQuery]);
  const filteredSplits = useMemo(() => {
    const fareLimit = Number(maxFare) || Infinity;
    const durationLimit = maxDuration ? Number(maxDuration) * 60 : Infinity;
    return dedupeSplitRoutes(state.splits).filter((split) => {
      // Search query filter for splits
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const l1Name = String(split.leg1?.trainName || "").toLowerCase();
        const l1No = String(split.leg1?.trainNo || "").toLowerCase();
        const l2Name = String(split.leg2?.trainName || "").toLowerCase();
        const l2No = String(split.leg2?.trainNo || "").toLowerCase();
        const matchL1 = l1Name.includes(query) || l1No.includes(query);
        const matchL2 = l2Name.includes(query) || l2No.includes(query);
        if (!matchL1 && !matchL2) return false;
      }
      // Filter out splits where either leg is explicitly not bookable for the station pair
      const isLegUnbookable = (leg: any) => {
        const avail = String(leg?.availability || leg?.classAvailability?.[selectedSortClass || primaryClassCode(leg)]?.[0]?.availabilityText || leg?.classAvailability?.[selectedSortClass || primaryClassCode(leg)]?.[0]?.text || "");
        const reason = String(leg?.lookupReason || leg?.classAvailability?.[selectedSortClass || primaryClassCode(leg)]?.[0]?.lookupReason || "");
        return providerBookingBlockedText(avail) || providerBookingBlockedText(reason);
      };
      if (isLegUnbookable(split.leg1) || isLegUnbookable(split.leg2)) return false;
      // Only show splits where BOTH legs have confirmed fare + seat availability
      if (!splitHasVerifiedFareAndSeats(split, selectedSortClass)) return false;
      // Confirmed seats only filter
      if (confirmedOnly) {
        const isConfirmed = (leg: any) => {
          const avail = String(leg?.availability || "").toUpperCase();
          const classAvail = selectedSortClass ? String(leg?.classAvailability?.[selectedSortClass]?.[0]?.text || "").toUpperCase() : avail;
          const status = classAvail || avail;
          return /\bAVAILABLE\b|\bAVL\b|\bCNF\b|\bCONFIRM/.test(status) && !/WL|RAC|WAITLIST/.test(status);
        };
        if (!isConfirmed(split.leg1) || !isConfirmed(split.leg2)) return false;
      }
      const l1Class = selectedSortClass || primaryClassCode(split.leg1);
      const l2Class = selectedSortClass || primaryClassCode(split.leg2);
      const fare = fareToNumber(split.totalFare || split.fare) || estimatedFareAmount(split.leg1, l1Class) + estimatedFareAmount(split.leg2, l2Class);
      const duration = durationToMinutes(splitTotalDuration(split));
      if (fare && fare > fareLimit) return false;
      if (duration && duration > durationLimit) return false;
      return true;
    }).sort((a, b) => {
      const getFareVal = (s: any) => {
        const verifiedFare = fareToNumber(s.totalFare || s.fare);
        if (verifiedFare > 0) return verifiedFare;
        const leg1Class = selectedSortClass || primaryClassCode(s.leg1);
        const leg2Class = selectedSortClass || primaryClassCode(s.leg2);
        return estimatedFareAmount(s.leg1, leg1Class) + estimatedFareAmount(s.leg2, leg2Class) || Infinity;
      };
      const fareA = getFareVal(a);
      const fareB = getFareVal(b);

      if (sortBy === "cheapest") return (fareA || Infinity) - (fareB || Infinity);
      if (sortBy === "highestFare") return (fareB || -Infinity) - (fareA || -Infinity);
      if (sortBy === "fastest") return (durationToMinutes(splitTotalDuration(a)) || Infinity) - (durationToMinutes(splitTotalDuration(b)) || Infinity);
      if (sortBy === "lowestLayover") {
        return splitLayoverMinutes(a) - splitLayoverMinutes(b) ||
          (durationToMinutes(splitTotalDuration(a)) || Infinity) - (durationToMinutes(splitTotalDuration(b)) || Infinity) ||
          (fareA || Infinity) - (fareB || Infinity);
      }
      return splitBestRankScore(b, selectedSortClass) - splitBestRankScore(a, selectedSortClass) ||
        splitAvailabilityScore(a, selectedSortClass) - splitAvailabilityScore(b, selectedSortClass) ||
        (fareA || Infinity) - (fareB || Infinity) ||
        (durationToMinutes(splitTotalDuration(a)) || Infinity) - (durationToMinutes(splitTotalDuration(b)) || Infinity);
    });
  }, [confirmedOnly, maxDuration, maxFare, selectedSortClass, sortBy, state.splits, searchQuery]);
  const visibleTrains = useMemo(() => {
    const verified = filteredTrains;
    const verifiedKeys = new Set(verified.map((t) => `${t.trainNo}-${t.source}-${t.destination}`));
    let unverified = state.trains.filter(
      (t) => !verifiedKeys.has(`${t.trainNo}-${t.source}-${t.destination}`)
    );
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      unverified = unverified.filter((train) => {
        const trainName = String(train.trainName || "").toLowerCase();
        const trainNo = String(train.trainNo || "").toLowerCase();
        return trainName.includes(query) || trainNo.includes(query);
      });
    }
    const sortedUnverified = [...unverified].sort((a, b) => {
      const fareA = selectedSortClass ? classFareAmount(a, selectedSortClass) : trainFareAmount(a);
      const fareB = selectedSortClass ? classFareAmount(b, selectedSortClass) : trainFareAmount(b);
      if (sortBy === "cheapest") return (fareA || Infinity) - (fareB || Infinity);
      if (sortBy === "highestFare") return (fareB || -Infinity) - (fareA || -Infinity);
      if (sortBy === "fastest") return durationToMinutes(a.duration) - durationToMinutes(b.duration);
      return durationToMinutes(a.duration) - durationToMinutes(b.duration);
    });
    return [...verified, ...sortedUnverified];
  }, [filteredTrains, state.trains, sortBy, selectedSortClass, searchQuery]);

  const visibleSplitRoutes = useMemo(() => {
    const verified = filteredSplits;
    const verifiedKeys = new Set(verified.map(splitRouteStableKey));
    let unverified = dedupeSplitRoutes(state.splits).filter(
      (split) => !verifiedKeys.has(splitRouteStableKey(split))
    );
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      unverified = unverified.filter((split) => {
        const l1Name = String(split.leg1?.trainName || "").toLowerCase();
        const l1No = String(split.leg1?.trainNo || "").toLowerCase();
        const l2Name = String(split.leg2?.trainName || "").toLowerCase();
        const l2No = String(split.leg2?.trainNo || "").toLowerCase();
        return l1Name.includes(query) || l1No.includes(query) || l2Name.includes(query) || l2No.includes(query);
      });
    }
    const sortedUnverified = [...unverified].sort((a, b) => {
      if (sortBy === "lowestLayover") return splitLayoverMinutes(a) - splitLayoverMinutes(b);
      if (sortBy === "fastest") return (durationToMinutes(splitTotalDuration(a)) || Infinity) - (durationToMinutes(splitTotalDuration(b)) || Infinity);
      if (sortBy === "cheapest") {
        const getFareVal = (s: any) => {
          const verifiedFare = fareToNumber(s.totalFare || s.fare);
          if (verifiedFare > 0) return verifiedFare;
          const leg1Class = selectedSortClass || primaryClassCode(s.leg1);
          const leg2Class = selectedSortClass || primaryClassCode(s.leg2);
          return estimatedFareAmount(s.leg1, leg1Class) + estimatedFareAmount(s.leg2, leg2Class) || Infinity;
        };
        return getFareVal(a) - getFareVal(b);
      }
      return (Number(b?.score || 0) - Number(a?.score || 0)) ||
        (durationToMinutes(splitTotalDuration(a)) || Infinity) - (durationToMinutes(splitTotalDuration(b)) || Infinity);
    });

    return [...verified, ...sortedUnverified].slice(0, 15);
  }, [filteredSplits, state.splits, sortBy, selectedSortClass, searchQuery]);

  const filteredMultiSplits = useMemo(() => {
    const fareLimit = Number(maxFare) || Infinity;
    const durationLimit = maxDuration ? Number(maxDuration) * 60 : Infinity;
    return state.multiSplits.filter((split) => {
      // Filter out multi-splits where any leg is explicitly unbookable
      const legs: any[] = split.legs || [];
      const isLegUnbookable = (leg: any) => {
        const avail = String(leg?.availability || leg?.classAvailability?.[primaryClassCode(leg)]?.[0]?.availabilityText || leg?.classAvailability?.[primaryClassCode(leg)]?.[0]?.text || "");
        const reason = String(leg?.lookupReason || leg?.classAvailability?.[primaryClassCode(leg)]?.[0]?.lookupReason || "");
        return providerBookingBlockedText(avail) || providerBookingBlockedText(reason);
      };
      if (legs.some(isLegUnbookable)) return false;
      const getMultiFare = (s: any) => {
        const verifiedFare = fareToNumber(s.totalFare);
        if (verifiedFare > 0) return verifiedFare;
        return (s.legs || []).reduce((sum: number, leg: any) => {
          const lClass = selectedSortClass || primaryClassCode(leg);
          return sum + estimatedFareAmount(leg, lClass);
        }, 0);
      };
      const fare = getMultiFare(split);
      const duration = durationToMinutes(split.totalDuration);
      if (fare && fare > fareLimit) return false;
      if (duration && duration > durationLimit) return false;
      return true;
    }).sort((a, b) => {
      const getMultiFare = (s: any) => {
        const verifiedFare = fareToNumber(s.totalFare);
        if (verifiedFare > 0) return verifiedFare;
        return (s.legs || []).reduce((sum: number, leg: any) => {
          const lClass = selectedSortClass || primaryClassCode(leg);
          return sum + estimatedFareAmount(leg, lClass);
        }, 0) || Infinity;
      };
      const fareA = getMultiFare(a);
      const fareB = getMultiFare(b);

      if (sortBy === "cheapest") return (fareA || Infinity) - (fareB || Infinity);
      if (sortBy === "highestFare") return (fareB || -Infinity) - (fareA || -Infinity);
      if (sortBy === "fastest") return (durationToMinutes(a.totalDuration) || Infinity) - (durationToMinutes(b.totalDuration) || Infinity);
      if (sortBy === "lowestLayover") {
        return multiSplitLayoverMinutes(a) - multiSplitLayoverMinutes(b) ||
          (durationToMinutes(a.totalDuration) || Infinity) - (durationToMinutes(b.totalDuration) || Infinity) ||
          (fareA || Infinity) - (fareB || Infinity);
      }
      return multiSplitBestRankScore(b, selectedSortClass) - multiSplitBestRankScore(a, selectedSortClass) ||
        (b.score || 0) - (a.score || 0);
    });
  }, [maxDuration, maxFare, selectedSortClass, sortBy, state.multiSplits]);

  const hydrationPending = liveHydration.running || (liveHydration.total > 0 && liveHydration.done < liveHydration.total);
  const waitingForVerifiedDirect = !state.loading && state.trains.length > 0 && filteredTrains.length === 0 && hydrationPending;
  const waitingForVerifiedSplit = !state.splitLoading && (state.splits.length > 0 || state.multiSplits.length > 0) && filteredSplits.length === 0 && filteredMultiSplits.length === 0 && hydrationPending;
  const visibleSplitCount = visibleSplitRoutes.length + filteredMultiSplits.length;
  const showUnbookableDirectRows = !state.loading &&
    !waitingForVerifiedDirect &&
    filteredTrains.length === 0 &&
    state.trains.length > 0 &&
    state.trains.every((train) => !hasVerifiedFareAndSeat(train, selectedSortClass));
  const bookableDirectCount = filteredTrains.length;
  const scheduleOnlyDirectCount = Math.max(0, state.trains.length - bookableDirectCount);
  const allOptionCount = bookableDirectCount + visibleSplitCount;
  const directTabLabel = state.loading && state.trains.length === 0
    ? "Direct trains (scanning...)"
    : scheduleOnlyDirectCount > 0 && bookableDirectCount === 0
      ? `Direct trains (0 live · ${scheduleOnlyDirectCount} schedule)`
      : scheduleOnlyDirectCount > 0
        ? `Direct trains (${bookableDirectCount} live · ${scheduleOnlyDirectCount} schedule)`
        : `Direct trains (${bookableDirectCount})`;

	  useEffect(() => {
	    if (state.splitLoading || liveHydration.running) return;
	    if (!isLongJourneyStationPair(source, destination)) return;
	    if (filteredSplits.length + filteredMultiSplits.length >= LONG_JOURNEY_MIN_VERIFIED_SPLITS) return;
	    if (liveHydration.total > 0 && liveHydration.done < liveHydration.total) return;
	    if (splitAutoCheckedRouteCount.current >= state.splits.length) return;

	    const hydrationId = liveHydrationGeneration.current;
	    let scheduled = 0;
	    while (scheduled === 0 && splitAutoCheckedRouteCount.current < state.splits.length) {
	      const start = splitAutoCheckedRouteCount.current;
	      const end = Math.min(state.splits.length, start + LONG_JOURNEY_SPLIT_TOP_UP_ROUTE_COUNT);
	      splitAutoCheckedRouteCount.current = end;
	      const topUpRoutes = state.splits.slice(start, end);
	      scheduled = queueLiveHydration(
	        topUpRoutes.flatMap((route: any) => [route.leg1, route.leg2]),
	        { date, classType, quota },
	        searchRequestId.current,
	        hydrationId,
	        `more split options ${start + 1}-${end}`,
	        Number.POSITIVE_INFINITY
	      );
	    }
	  }, [
	    classType,
	    date,
	    destination,
	    filteredMultiSplits.length,
	    filteredSplits.length,
	    liveHydration.done,
	    liveHydration.running,
	    liveHydration.total,
	    source,
	    quota,
	    state.splitLoading,
	    state.splits,
	  ]);

	  useEffect(() => {
	    function syncFromLocation() {
	      setSearchKey(window.location.search);
    }

    syncFromLocation();
    window.addEventListener("popstate", syncFromLocation);
    window.addEventListener("railroute-search-change", syncFromLocation);
    return () => {
      window.removeEventListener("popstate", syncFromLocation);
      window.removeEventListener("railroute-search-change", syncFromLocation);
    };
  }, []);

  useEffect(() => {
    const effectiveSearchKey = searchKey || window.location.search;
    if (!effectiveSearchKey || lastAutoSearchKey.current === effectiveSearchKey) return;
    lastAutoSearchKey.current = effectiveSearchKey;
    const params = new URLSearchParams(effectiveSearchKey);
    const rawInitialSource = params.get("from") || params.get("source") || "";
    const rawInitialDestination = params.get("to") || params.get("destination") || "";
    const hasExplicitRoute = Boolean(rawInitialSource && rawInitialDestination);
    const initialSource = rawInitialSource ? resolveStationInput("", rawInitialSource) || rawInitialSource.toUpperCase() : "";
    const initialDestination = rawInitialDestination ? resolveStationInput("", rawInitialDestination) || rawInitialDestination.toUpperCase() : "";
    const initialDate = params.get("date") || todayIso();
    const initialClass = params.get("class") || params.get("classType") || "3A";
    const initialQuota = (params.get("quota") || "GN").toUpperCase();
    const rawInitialPreferredHub = params.get("via") || params.get("preferredHub") || "";
    const initialPreferredHub = rawInitialPreferredHub ? resolveStationInput("", rawInitialPreferredHub) || rawInitialPreferredHub.toUpperCase() : "";
    if (initialSource) {
      setSource(initialSource);
      setSourceQuery(stationCompactLabel(initialSource));
    } else {
      setSource("");
      setSourceQuery("");
    }
    if (initialDestination) {
      setDestination(initialDestination);
      setDestinationQuery(stationCompactLabel(initialDestination));
    } else {
      setDestination("");
      setDestinationQuery("");
    }
    if (initialPreferredHub) {
      setPreferredHub(initialPreferredHub);
      setPreferredHubQuery(stationCompactLabel(initialPreferredHub));
    } else {
      setPreferredHub("");
      setPreferredHubQuery("");
    }
    setDate(initialDate);
    setClassType(initialClass);
    setQuota(initialQuota);
    if (hasExplicitRoute && initialSource && initialDestination) {
      window.setTimeout(() => runSearch(undefined, { source: initialSource, destination: initialDestination, date: initialDate, classType: initialClass, quota: initialQuota, preferredHub: initialPreferredHub }), 80);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchKey]);

  async function runSearch(event?: FormEvent, override?: { source: string; destination: string; date: string; classType: string; quota?: string; preferredHub?: string; fetchSplits?: boolean; pushUrl?: boolean }) {
    event?.preventDefault();
    const resolvedSource = resolveStationInput(source, sourceQuery);
    const resolvedDestination = resolveStationInput(destination, destinationQuery);
    const resolvedPreferredHub = resolveStationInput(preferredHub, preferredHubQuery);
    const payload = override || {
      source: resolvedSource,
      destination: resolvedDestination,
      date,
      classType,
      quota,
      preferredHub: resolvedPreferredHub && resolvedPreferredHub !== resolvedSource && resolvedPreferredHub !== resolvedDestination ? resolvedPreferredHub : "",
    };
    const providerPayload = {
      source: payload.source,
      destination: payload.destination,
      date: payload.date,
      classType: payload.classType,
      quota: (payload.quota || quota || "GN").toUpperCase(),
      preferredHub: payload.preferredHub || "",
    };
    const debug = debugModeEnabled();
    const requestPayload = { ...providerPayload, debug };
    setHasSearched(true);
    if (!payload.source || !payload.destination) {
      searchRequestId.current += 1;
      setState({ loading: false, splitLoading: false, splitCoverage: "none", error: "Choose Starting Point and End Point.", trains: [], splits: [], multiSplits: [] });
      return;
    }
    const requestId = searchRequestId.current + 1;
    searchRequestId.current = requestId;
    const hydrationId = liveHydrationGeneration.current + 1;
    liveHydrationGeneration.current = hydrationId;
    splitAutoCheckedRouteCount.current = 0;
    setResultMode("all");
    setLiveHydration(emptyLiveHydration);
    if ((!override || override.pushUrl) && typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("railroute_recent_searches");
        let list = stored ? JSON.parse(stored) : [];
        if (!Array.isArray(list)) list = [];
        const newSearch = {
          from: providerPayload.source,
          to: providerPayload.destination,
          date: providerPayload.date,
          class: providerPayload.classType,
          quota: providerPayload.quota,
          via: providerPayload.preferredHub || ""
        };
        const filtered = list.filter((item: any) => item?.from !== newSearch.from || item?.to !== newSearch.to);
        const updated = [newSearch, ...filtered].slice(0, 5);
        localStorage.setItem("railroute_recent_searches", JSON.stringify(updated));
        window.dispatchEvent(new Event("railroute-recent-searches-updated"));
      } catch (e) {
        console.warn("Failed to save search:", e);
      }

      const params = new URLSearchParams({
        from: providerPayload.source,
        to: providerPayload.destination,
        date: providerPayload.date,
        class: providerPayload.classType,
        quota: providerPayload.quota,
      });
      if (providerPayload.preferredHub) params.set("via", providerPayload.preferredHub);
      if (debug) params.set("debug", "true");
      window.history.pushState(null, "", `/trains?${params.toString()}`);
    }
    setState({ loading: true, splitLoading: true, splitCoverage: "quick", error: "", trains: [], splits: [], multiSplits: [] });
    try {
      let directCountForRequest = 0;
      let splitCountForRequest = 0;

      const reversePayload = { ...requestPayload };
      reversePayload.source = requestPayload.destination;
      reversePayload.destination = requestPayload.source;

      const forwardDirectPromise = postJson<any>("/api/train-between", requestPayload)
        .then((direct) => {
          if (requestId !== searchRequestId.current) return [];
          const trains = direct.trains || [];
          directCountForRequest += trains.length;
          setState((current) => ({ ...current, loading: false, trains, error: "" }));
          queueLiveHydration(
            trains,
            { date: providerPayload.date, classType: providerPayload.classType, quota: providerPayload.quota },
            requestId,
            hydrationId,
            "direct train rows",
            AUTO_LIVE_DIRECT_LIMIT
          );
          return trains;
        })
        .catch((error) => {
          if (requestId !== searchRequestId.current) return [];
          const message = error instanceof Error ? error.message : "Direct train search failed.";
          setState((current) => ({ ...current, loading: false, error: message, trains: [] }));
          return [];
        });

      const reverseDirectPromise = postJson<any>("/api/train-between", reversePayload)
        .then((direct) => {
          if (requestId !== searchRequestId.current) return [];
          return direct.trains || [];
        })
        .catch(() => {
          if (requestId !== searchRequestId.current) return [];
          return [];
        });

      const forwardSplitPromise = postJson<any>("/api/search-split", {
        ...requestPayload,
        directTrains: [],
        mode: "quick",
      })
        .then((split) => {
          const splitRoutes = split?.splitRoutes || split?.data?.splitRoutes || [];
          const multiSplitRoutes = split?.multiSplitRoutes || split?.data?.multiSplitRoutes || [];
          splitCountForRequest += splitRoutes.length + multiSplitRoutes.length;
          if (requestId !== searchRequestId.current) return;
          setState((current) => ({
            ...current,
            splitLoading: false,
            splitCoverage: "quick",
            splits: splitRoutes,
            multiSplits: multiSplitRoutes,
          }));
          const initialSplitRouteCount = Math.min(
            splitAutoLiveRouteCountForJourney(providerPayload.source, providerPayload.destination),
            splitRoutes.length
          );
          splitAutoCheckedRouteCount.current = initialSplitRouteCount;
          const prioritySplitRoutes = splitRoutes.slice(0, initialSplitRouteCount);
          queueLiveHydration(
            [
              ...prioritySplitRoutes.flatMap((route: any) => [route.leg1, route.leg2]),
            ],
            { date: providerPayload.date, classType: providerPayload.classType, quota: providerPayload.quota },
            requestId,
            hydrationId,
            `first ${initialSplitRouteCount} split options`,
            Number.POSITIVE_INFINITY
          );
          return { splitRoutes, multiSplitRoutes };
        })
        .catch(() => {
          if (requestId !== searchRequestId.current) return { splitRoutes: [], multiSplitRoutes: [] };
          setState((current) => ({
            ...current,
            splitLoading: false,
            splitCoverage: "quick",
            splits: [],
            multiSplits: [],
          }));
          return { splitRoutes: [], multiSplitRoutes: [] };
        });

      const reverseSplitPromise = postJson<any>("/api/search-split", {
        ...reversePayload,
        directTrains: [],
        mode: "quick",
      })
        .then((split) => {
          const splitRoutes = split?.splitRoutes || split?.data?.splitRoutes || [];
          const multiSplitRoutes = split?.multiSplitRoutes || split?.data?.multiSplitRoutes || [];
          splitCountForRequest += splitRoutes.length + multiSplitRoutes.length;
          return { splitRoutes, multiSplitRoutes };
        })
        .catch(() => {
          return { splitRoutes: [], multiSplitRoutes: [] };
        });

      const [[forwardDirect, reverseDirect], [forwardSplits, reverseSplits]] = await Promise.all([
        Promise.allSettled([forwardDirectPromise, reverseDirectPromise]),
        Promise.allSettled([forwardSplitPromise, reverseSplitPromise]),
      ]);

      if (requestId !== searchRequestId.current) return;

      const mergedTrains = [
        ...(forwardDirect.status === 'fulfilled' ? forwardDirect.value : []),
        ...(reverseDirect.status === 'fulfilled' ? reverseDirect.value : []).filter((t: any) => {
          const tSrc = (t.source || '').toUpperCase();
          const tDst = (t.destination || '').toUpperCase();
          const userSrc = (providerPayload.source || '').toUpperCase();
          const userDst = (providerPayload.destination || '').toUpperCase();
          if (tSrc === userDst && tDst === userSrc) return false;
          if (tSrc === userSrc && tDst === userDst) return true;
          return true;
        }),
      ];

      if (mergedTrains.length > 0 && mergedTrains.length !== directCountForRequest) {
        directCountForRequest = mergedTrains.length;
        setState((current) => ({ ...current, loading: false, trains: mergedTrains, error: "" }));
        queueLiveHydration(
          mergedTrains,
          { date: providerPayload.date, classType: providerPayload.classType, quota: providerPayload.quota },
          requestId,
          hydrationId,
          "merged direct train rows",
          AUTO_LIVE_DIRECT_LIMIT
        );
      }

      if (forwardSplits.status === 'fulfilled' || reverseSplits.status === 'fulfilled') {
        const currentSplits = state.splits;
        const currentMultiSplits = state.multiSplits;
        const forwardSplitData = forwardSplits.status === 'fulfilled' ? forwardSplits.value : null;
        const reverseSplitData = reverseSplits.status === 'fulfilled' ? reverseSplits.value : null;

        const filterReverseSplitRoutes = (routes: any[] = [], src: string, dst: string) => {
          return routes.filter((route) => {
            const leg1 = route.leg1 || {};
            const leg1Src = (leg1.source || leg1.trainSource || '').toUpperCase();
            const leg1Dst = (leg1.destination || leg1.trainDestination || '').toUpperCase();
            const leg2 = route.leg2 || {};
            const leg2Src = (leg2.source || leg2.trainSource || '').toUpperCase();
            const leg2Dst = (leg2.destination || leg2.trainDestination || '').toUpperCase();

            if (leg1Src === src && leg1Dst === dst) return true;
            if (leg1Src === dst && leg1Dst === src) return false;
            if ((leg1Src === src || !leg1Src) && (leg2Dst === dst || leg2Src === dst)) return true;
            if (leg1Src === dst && leg2Dst === src) return false;
            return true;
          });
        };

        const newSplits = [
          ...currentSplits,
          ...(forwardSplitData?.splitRoutes || []),
          ...filterReverseSplitRoutes(reverseSplitData?.splitRoutes || [], providerPayload.source.toUpperCase(), providerPayload.destination.toUpperCase()),
        ];
        const newMultiSplits = [
          ...currentMultiSplits,
          ...(forwardSplitData?.multiSplitRoutes || []),
          ...filterReverseSplitRoutes(reverseSplitData?.multiSplitRoutes || [], providerPayload.source.toUpperCase(), providerPayload.destination.toUpperCase()),
        ];
        setState((current) => ({
          ...current,
          splitLoading: false,
          splitCoverage: "quick",
          splits: newSplits,
          multiSplits: newMultiSplits,
        }));

        const totalSplitRoutes = newSplits.length;
        const initialSplitRouteCount = Math.min(
          splitAutoLiveRouteCountForJourney(providerPayload.source, providerPayload.destination),
          totalSplitRoutes
        );
        splitAutoCheckedRouteCount.current = initialSplitRouteCount;
        const prioritySplitRoutes = newSplits.slice(0, initialSplitRouteCount);
        queueLiveHydration(
          [
            ...prioritySplitRoutes.flatMap((route: any) => [route.leg1, route.leg2]),
          ],
          { date: providerPayload.date, classType: providerPayload.classType, quota: providerPayload.quota },
          requestId,
          hydrationId,
          `first ${initialSplitRouteCount} split options`,
          Number.POSITIVE_INFINITY
        );
      }

      if (requestId === searchRequestId.current && directCountForRequest === 0 && splitCountForRequest > 0) {
        setResultMode("split");
      }
    } catch (error) {
      if (requestId !== searchRequestId.current) return;
      liveHydrationGeneration.current += 1;
      setLiveHydration(emptyLiveHydration);
      setState({ loading: false, splitLoading: false, splitCoverage: "none", error: error instanceof Error ? error.message : "Train search failed.", trains: [], splits: [], multiSplits: [] });
    }
  }

	  function sameLiveTrain(left: any, right: any) {
	    const leftDate = String(left?.journeyDate || "");
	    const rightDate = String(right?.journeyDate || "");
	    return String(left?.trainNo || "") === String(right?.trainNo || "") &&
	      String(left?.source || "") === String(right?.source || "") &&
	      String(left?.destination || "") === String(right?.destination || "") &&
	      (!leftDate || !rightDate || leftDate === rightDate);
	  }

  function requestedLiveClasses(train: any, requestedClass: string) {
    const selected = String(requestedClass || "").toUpperCase();
    if (selected && selected !== "ANY") return [selected];
    const fallbackClass = selected && selected !== "ANY" ? selected : primaryClassCode(train);
    return [fallbackClass].filter(Boolean);
  }

	  function uniqueLiveTargets(trains: any[], requestedClass: string, fallbackDate: string) {
	    const seen = new Set<string>();
	    return trains.flatMap((train) => {
	      const trainNo = String(train?.trainNo || "");
	      const sourceCode = liveSourceStation(train);
	      const destinationCode = liveDestinationStation(train);
	      const journeyDate = trainJourneyDate(train, fallbackDate);
	      if (!trainNo || !sourceCode || !destinationCode) return [];
	      return requestedLiveClasses(train, requestedClass).flatMap((classCode) => {
	        if (!classCode || !needsLiveQuotaRefresh(train, classCode)) return [];
	        const key = `${trainNo}_${sourceCode}_${destinationCode}_${journeyDate}_${classCode}`;
	        if (seen.has(key)) return [];
	        seen.add(key);
	        return [{ train, classCode, key, journeyDate }];
	      });
	    });
	  }

  function applyHydratedQuote(target: any, classCode: string, quote: LiveClassQuote) {
    setState((current) => {
      const patchTrain = (train: any) => sameLiveTrain(train, target) ? applyLiveQuoteToTrain(train, classCode, quote) : train;
      const patchSplit = (split: any) => {
        const leg1 = patchTrain(split.leg1 || {});
        const leg2 = patchTrain(split.leg2 || {});
        const leg1Fare = trainFareAmount(leg1) || fareToNumber(split.leg1Fare);
        const leg2Fare = trainFareAmount(leg2) || fareToNumber(split.leg2Fare);
        return {
          ...split,
          leg1,
          leg2,
          leg1Fare,
          leg2Fare,
          totalFare: leg1Fare > 0 && leg2Fare > 0 ? leg1Fare + leg2Fare : split.totalFare,
        };
      };
      const patchMultiSplit = (split: any) => {
        const legs = (split.legs || []).map(patchTrain);
        const fares = legs.map((leg: any) => trainFareAmount(leg)).filter((fare: number) => fare > 0);
        return {
          ...split,
          legs,
          totalFare: fares.length === legs.length ? fares.reduce((sum: number, fare: number) => sum + fare, 0) : split.totalFare,
        };
      };
      return {
        ...current,
        trains: current.trains.map(patchTrain),
        splits: current.splits.map(patchSplit),
        multiSplits: current.multiSplits.map(patchMultiSplit),
      };
    });
  }

  function queueLiveHydration(
    trains: any[],
    payload: { date: string; classType: string; quota: string },
    requestId: number,
    hydrationId: number,
    label: string,
    autoLimit = Number.POSITIVE_INFINITY
  ) {
	    const allTargets = uniqueLiveTargets(trains.filter(Boolean), payload.classType, payload.date);
    const limit = Number.isFinite(autoLimit) ? Math.max(0, autoLimit) : allTargets.length;
	    const targets = limit >= allTargets.length ? allTargets : allTargets.slice(0, limit);
	    const deferred = Math.max(0, allTargets.length - targets.length);
	    if (deferred > 0) {
	      setLiveHydration((current) => ({
	        ...current,
	        deferred: current.deferred + deferred,
	      }));
	    }
	    if (!targets.length) return 0;

	    const hydrationTask = (async () => {
        if (requestId !== searchRequestId.current || hydrationId !== liveHydrationGeneration.current) return;
        setLiveHydration((current) => ({
          running: true,
          done: current.done,
          total: current.total + targets.length,
          current: label,
          rateLimited: current.rateLimited,
          deferred: current.deferred,
        }));

        for (const target of targets) {
          if (requestId !== searchRequestId.current || hydrationId !== liveHydrationGeneration.current) return;
          setLiveHydration((current) => ({ ...current, current: `${target.train.trainNo} ${target.classCode}` }));

          let quote: LiveClassQuote;
          let rateLimited = false;
          const fetchQuoteForClass = async (classCode: string) => {
            const targetDate = target.journeyDate || trainJourneyDate(target.train, payload.date);
            const availabilityPayload = {
              trainNo: target.train.trainNo,
              source: liveSourceStation(target.train),
              destination: liveDestinationStation(target.train),
              date: targetDate,
              classType: classCode,
              quota: payload.quota || "GN",
              debug: debugModeEnabled(),
            };
            const response = await postJson<any>("/api/availability", availabilityPayload);
            const nextQuote = liveQuoteFromResponse(response, classCode, targetDate);
            const nextRateLimited = isProviderDelay(`${nextQuote.availability} ${nextQuote.warning || ""} ${nextQuote.error || ""}`);
            return { quote: nextQuote, rateLimited: nextRateLimited };
          };
          try {
            const result = await fetchQuoteForClass(target.classCode);
            quote = result.quote;
            rateLimited = result.rateLimited;
            if (rateLimited) {
              const rateLimitedCopy = providerDelayCopy(target.classCode);
              quote = {
                ...quote,
                availability: rateLimitedCopy,
                source: "Live check queued",
                updatedTime: rateLimitedCopy,
                availabilityStatus: "RATE_LIMITED",
                fareStatus: quote.fare > 0 ? "VERIFIED" : "RATE_LIMITED",
                lookupReason: rateLimitedCopy,
                error: rateLimitedCopy,
              };
            }
	          } catch (error) {
	            const message = error instanceof Error ? error.message : "Provider request failed";
	            rateLimited = isProviderDelay(message);
	            const lookupStatus: LookupTrustStatus = rateLimited ? "RATE_LIMITED" : "PROVIDER_UNAVAILABLE";
              const cleanMessage = providerIssueCopy(message, target.classCode);
	            quote = {
              availability: lookupStatusLabel(lookupStatus, "availability", target.classCode, cleanMessage),
              fare: 0,
              source: rateLimited ? "Live check queued" : "Provider unavailable",
              updatedTime: cleanMessage,
              availabilityStatus: lookupStatus,
              fareStatus: lookupStatus,
              lookupReason: cleanMessage,
	              error: cleanMessage,
	            };
	          }

	          if (requestId !== searchRequestId.current || hydrationId !== liveHydrationGeneration.current) return;
	          applyHydratedQuote(target.train, target.classCode, quote);
	          setLiveHydration((current) => ({
	            ...current,
	            done: Math.min(current.total, current.done + 1),
	            rateLimited: current.rateLimited + (rateLimited ? 1 : 0),
	          }));

            await new Promise((resolve) => setTimeout(resolve, 150));
        }

        if (requestId === searchRequestId.current && hydrationId === liveHydrationGeneration.current) {
          setLiveHydration((current) => {
            const complete = current.done >= current.total;
            return { ...current, running: !complete, current: complete ? "complete" : current.current };
          });
        }
      })();

	    liveHydrationChain.current = hydrationTask.catch(() => undefined);
	    return targets.length;
	  }

	  function liveRefreshKey(train: any, classCode: string) {
	    return `${train?.trainNo || ""}_${liveSourceStation(train)}_${liveDestinationStation(train)}_${trainJourneyDate(train, date)}_${classCode || ""}_${quota || "GN"}`;
	  }

  async function refreshLiveForTrain(train: any, requestedClass?: string) {
    const classCode = String(requestedClass || primaryClassCode(train, classType) || classType || "").toUpperCase();
    if (!train?.trainNo || !train?.source || !train?.destination || !classCode) return;
	    const key = liveRefreshKey(train, classCode);
	    const targetDate = trainJourneyDate(train, date);
	    if (manualLiveCheck === key) return;
    setManualLiveCheck(key);

    const fetchQuoteForClass = async (nextClass: string) => {
      const response = await postJson<any>("/api/availability", {
	        trainNo: train.trainNo,
	        source: liveSourceStation(train),
	        destination: liveDestinationStation(train),
	        date: targetDate,
	        classType: nextClass,
        quota,
        debug: debugModeEnabled(),
        priority: true,
      });
	      return liveQuoteFromResponse(response, nextClass, targetDate);
    };

    try {
      const quote = await fetchQuoteForClass(classCode);
      applyHydratedQuote(train, classCode, quote);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Provider request failed";
      const rateLimited = isProviderDelay(message);
      const lookupStatus: LookupTrustStatus = rateLimited ? "RATE_LIMITED" : "PROVIDER_UNAVAILABLE";
      const cleanMessage = providerIssueCopy(message, classCode);
      applyHydratedQuote(train, classCode, {
        availability: lookupStatusLabel(lookupStatus, "availability", classCode, cleanMessage),
        fare: 0,
        source: rateLimited ? "Live check queued" : "Provider unavailable",
        updatedTime: cleanMessage,
        availabilityStatus: lookupStatus,
        fareStatus: lookupStatus,
        lookupReason: cleanMessage,
        error: cleanMessage,
      });
    } finally {
      setManualLiveCheck((current) => (current === key ? "" : current));
    }
  }

  function stopAutomaticLiveChecks() {
    liveHydrationGeneration.current += 1;
    setLiveHydration((current) => ({ ...current, running: false, current: "stopped" }));
  }

  function retryPriorityLiveChecks() {
    if (!state.trains.length && !state.splits.length && !state.multiSplits.length) return;
    const hydrationId = liveHydrationGeneration.current + 1;
    liveHydrationGeneration.current = hydrationId;
    setLiveHydration(emptyLiveHydration);
    queueLiveHydration(
      [
        ...state.trains,
        ...state.splits.flatMap((split: any) => [split.leg1, split.leg2]),
        ...state.multiSplits.flatMap((split: any) => split.legs || []),
      ],
      { date, classType, quota },
      searchRequestId.current,
      hydrationId,
      "retry all selected-class rows",
      AUTO_LIVE_DIRECT_LIMIT
    );
  }

  function selectNearbyDate(nextDate: string) {
    const resolvedSource = resolveStationInput(source, sourceQuery);
    const resolvedDestination = resolveStationInput(destination, destinationQuery);
    const resolvedPreferredHub = resolveStationInput(preferredHub, preferredHubQuery);
    setDate(nextDate);
    runSearch(undefined, {
      source: resolvedSource,
      destination: resolvedDestination,
      date: nextDate,
      classType,
      quota,
      preferredHub: resolvedPreferredHub && resolvedPreferredHub !== resolvedSource && resolvedPreferredHub !== resolvedDestination ? resolvedPreferredHub : "",
      pushUrl: true,
    });
  }

  const selectedPreferredHub = resolveStationInput(preferredHub, preferredHubQuery);
  const showSplitResults = hasSearched || state.splitLoading || state.splits.length > 0 || state.multiSplits.length > 0;

  return (
    <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6">
      <div className={softPanel("rounded-[32px] p-5")}>
        <form onSubmit={runSearch}>
          <div className="grid gap-3 lg:grid-cols-[1fr_auto_1fr] lg:items-end">
            <StationAutocomplete label="From" placeholder="Starting Point" example="" value={source} setValue={setSource} query={sourceQuery} setQuery={setSourceQuery} />
            <button type="button" onClick={() => { const a = source; const aq = sourceQuery; setSource(destination); setSourceQuery(destinationQuery); setDestination(a); setDestinationQuery(aq); }} className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-white text-cyan-700 dark:border-white/10 dark:bg-white/8 dark:text-cyan-100"><ArrowDownUp className="h-5 w-5" /></button>
            <StationAutocomplete label="To" placeholder="End Point" example="" value={destination} setValue={setDestination} query={destinationQuery} setQuery={setDestinationQuery} />
          </div>
          <div className="grid gap-2 lg:grid-cols-2">
            <RelatedStationChips label="From" value={source} query={sourceQuery} onSelect={(code) => { setSource(code); setSourceQuery(stationLabelFromCode(code)); }} />
            <RelatedStationChips label="To" value={destination} query={destinationQuery} onSelect={(code) => { setDestination(code); setDestinationQuery(stationLabelFromCode(code)); }} />
          </div>
          <div className="mt-4 grid gap-3 xl:grid-cols-[1fr_1fr_150px_190px_auto]">
            <DateQuickField date={date} setDate={setDate} />
            <StationAutocomplete label="Via" placeholder="Optional layover station" example="" value={preferredHub} setValue={setPreferredHub} query={preferredHubQuery} setQuery={setPreferredHubQuery} />
            <label className="block">
              <span className="mb-2 block text-[11px] font-black uppercase text-slate-500 dark:text-slate-400">Class</span>
              <select value={classType} onChange={(event) => setClassType(event.target.value)} className="h-14 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold dark:border-white/10 dark:bg-[#111827] dark:text-white">{["Any", ...classOptions].map((item) => <option key={item}>{item}</option>)}</select>
            </label>
            <label className="block">
              <span className="mb-2 block text-[11px] font-black uppercase text-slate-500 dark:text-slate-400">Quota</span>
              <select value={quota} onChange={(event) => setQuota(event.target.value)} className="h-14 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold dark:border-white/10 dark:bg-[#111827] dark:text-white">
                {quotaOptions.map((item) => <option key={item.code} value={item.code}>{item.code} · {item.label}</option>)}
              </select>
            </label>
            <button className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-6 text-sm font-black text-white dark:bg-white dark:text-slate-950 xl:self-start xl:mt-6">
              <span className="flex h-4 w-4 items-center justify-center" aria-hidden="true">
                {state.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </span>
              <span>Search</span>
            </button>
          </div>
          <QuotaTimingNotice date={date} classType={classType} quota={quota} />
          {allowSplit && selectedPreferredHub && selectedPreferredHub !== source && selectedPreferredHub !== destination && (
            <div className="mt-3 rounded-2xl border border-cyan-300/40 bg-cyan-50 px-4 py-3 text-sm font-bold text-cyan-900 dark:bg-cyan-300/10 dark:text-cyan-50">
              Prioritizing split journeys via {fullStationLabelFromCode(selectedPreferredHub)}.
            </div>
          )}
        </form>
        {recentSearches.length > 0 && (
          <div className="mt-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="text-[10px] font-black uppercase text-slate-400">Recent Searches (Click to search)</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {recentSearches.map((item) => {
                const label = `${item.from} → ${item.to} (${item.date})`;
                return (
                  <div
                    key={`${item.from}-${item.to}-${item.date}-${item.class}`}
                    className="group flex items-center gap-1.5 rounded-full border border-slate-200 bg-white pl-3.5 pr-2 py-1 text-xs font-bold text-slate-700 shadow-sm dark:border-white/10 dark:bg-[#101725] dark:text-slate-200"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setSource(item.from);
                        setSourceQuery(stationLabelFromCode(item.from));
                        setDestination(item.to);
                        setDestinationQuery(stationLabelFromCode(item.to));
                        setDate(item.date);
                        setClassType(item.class);
                        setQuota(item.quota || "GN");
                        if (item.via) {
                          setPreferredHub(item.via);
                          setPreferredHubQuery(stationLabelFromCode(item.via));
                        } else {
                          setPreferredHub("");
                          setPreferredHubQuery("");
                        }
                        runSearch(undefined, {
                          source: item.from,
                          destination: item.to,
                          date: item.date,
                          classType: item.class,
                          quota: item.quota || "GN",
                          preferredHub: item.via || "",
                          pushUrl: true,
                        });
                      }}
                      className="hover:text-cyan-600 dark:hover:text-cyan-300"
                    >
                      {label}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteRecentSearch(item.from, item.to)}
                      className="rounded-full p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/10 dark:hover:text-white"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
      {state.error && <div className="mt-5 rounded-3xl border border-rose-300/40 bg-rose-50 p-5 font-bold text-rose-700 dark:bg-rose-400/10 dark:text-rose-100">{state.error}</div>}
      {state.loading && <LoadingBlock label="Scanning train inventory..." />}
	      {(hasSearched || state.loading || state.splitLoading || state.trains.length > 0 || state.splits.length > 0 || state.multiSplits.length > 0) && (
	        <SearchResultSummary
	          trains={filteredTrains}
	          splitCount={showSplitResults ? visibleSplitRoutes.length : 0}
	          multiSplitCount={showSplitResults ? filteredMultiSplits.length : 0}
	          scheduleOnlyDirectCount={scheduleOnlyDirectCount}
	          loading={state.loading}
	          splitLoading={state.splitLoading}
	          date={date}
	          classType={classType}
	          quota={quota}
	        />
	      )}
	      {hasSearched && !state.loading && !state.splitLoading && bookableDirectCount < 3 && source && destination && (
	        <NearbyDateSuggestions
	          source={source}
	          destination={destination}
	          date={date}
	          classType={classType}
	          quota={quota}
	          directCount={bookableDirectCount}
	          onSelectDate={selectNearbyDate}
	        />
	      )}
      {(state.trains.length > 0 || state.splits.length > 0 || state.multiSplits.length > 0) && (liveHydration.total > 0 || liveHydration.deferred > 0) && (
        <div className="mt-4 rounded-2xl border border-cyan-300/30 bg-cyan-50 px-4 py-3 text-sm dark:border-cyan-300/20 dark:bg-cyan-300/8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-black uppercase tracking-wide text-cyan-800 dark:text-cyan-100">
                Selected-class live fare + availability queue
              </div>
            <div className="mt-1 font-bold text-slate-700 dark:text-slate-200">
                {liveHydration.running
                  ? `Checking ${liveHydration.current || "provider data"} · ${Math.min(liveHydration.done, liveHydration.total)}/${liveHydration.total}`
                  : liveHydration.total > 0
                    ? `Checked ${Math.min(liveHydration.done, liveHydration.total)}/${liveHydration.total} selected-class requests`
                    : "Automatic live checks deferred"}
                {liveHydration.deferred > 0 ? ` · ${liveHydration.deferred} more exact row/leg checks available on buttons` : ""}
              </div>
              <div className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                Train list may be cached; fare and seat checks use each row&apos;s exact train/source/destination/date/class/{quota} quota.
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-md border border-cyan-300/35 bg-white px-3 py-2 text-[11px] font-black text-cyan-800 dark:bg-white/8 dark:text-cyan-100">
                Parallel live checks
              </span>
              {liveHydration.running ? (
                <button type="button" onClick={stopAutomaticLiveChecks} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-[11px] font-black text-slate-700 dark:border-white/10 dark:bg-white/8 dark:text-slate-200">
                  Stop queue
                </button>
              ) : (
                <button type="button" onClick={retryPriorityLiveChecks} className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-[11px] font-black text-emerald-800 dark:bg-emerald-300/12 dark:text-emerald-100">
                  Check all live
                </button>
              )}
              {liveHydration.rateLimited > 0 && (
                <span className="rounded-md border border-amber-300/45 bg-amber-50 px-3 py-2 text-[11px] font-black text-amber-900 dark:bg-amber-300/10 dark:text-amber-100">
                  {liveHydration.rateLimited} checks still queued
                </span>
              )}
            </div>
          </div>
        </div>
      )}
      {(hasSearched || state.loading || state.splitLoading || state.trains.length > 0 || state.splits.length > 0 || state.multiSplits.length > 0) && (
        <div className={softPanel("mt-6 rounded-[28px] p-4")}>
	          <div className="flex flex-wrap gap-2">
	            {[
	              ["all", state.loading || state.splitLoading
	                ? "All options (loading...)"
	                : `All options (${allOptionCount})`],
	              ["direct", directTabLabel],
	              ["split", state.splitLoading && visibleSplitCount === 0 ? "Split Journey (finding...)" : `Split Journey (${visibleSplitCount})`],
	            ].map(([key, label]) => (
              <button key={key} type="button" onClick={() => setResultMode(key as "all" | "direct" | "split" | "multi")} className={`rounded-full border px-4 py-2 text-xs font-black ${resultMode === key ? "border-slate-950 bg-slate-950 text-white dark:border-white dark:bg-white dark:text-slate-950" : "border-slate-200 bg-white text-slate-500 dark:border-white/10 dark:bg-white/6 dark:text-slate-300"}`}>
                {label}
              </button>
            ))}
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-5">
            <select aria-label="Sort results" value={sortBy} onChange={(event) => setSortBy(event.target.value as typeof sortBy)} className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black dark:border-white/10 dark:bg-[#111827] dark:text-white">
              <option value="best">Best availability + value</option>
              <option value="cheapest">Cheapest first</option>
              <option value="highestFare">Highest fare first</option>
              <option value="fastest">Shortest duration first</option>
              <option value="lowestLayover">Lowest layover first</option>
              <option value="earliest">Earliest departure</option>
              <option value="latest">Latest departure</option>
            </select>
            <input
              value={pendingMaxFare}
              onChange={(e) => setPendingMaxFare(e.target.value.replace(/\D/g, "").slice(0, 6))}
              onBlur={() => setMaxFare(pendingMaxFare)}
              onKeyDown={(e) => { if (e.key === "Enter") { setMaxFare(pendingMaxFare); (e.target as HTMLInputElement).blur(); } }}
              placeholder="Max fare, e.g. 2000"
              className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black outline-none focus:border-cyan-400 dark:border-white/10 dark:bg-white/8 dark:text-white"
            />
            <input
              value={pendingMaxDuration}
              onChange={(e) => setPendingMaxDuration(e.target.value.replace(/[^\d.]/g, "").slice(0, 4))}
              onBlur={() => setMaxDuration(pendingMaxDuration)}
              onKeyDown={(e) => { if (e.key === "Enter") { setMaxDuration(pendingMaxDuration); (e.target as HTMLInputElement).blur(); } }}
              placeholder="Max hours, e.g. 12"
              className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black outline-none focus:border-cyan-400 dark:border-white/10 dark:bg-white/8 dark:text-white"
            />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search train name or no..."
              className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black outline-none focus:border-cyan-400 dark:border-white/10 dark:bg-white/8 dark:text-white"
            />
            <button
              type="button"
              onClick={() => setConfirmedOnly((prev) => !prev)}
              className={`h-12 rounded-2xl border px-4 text-sm font-black transition-colors ${
                confirmedOnly
                  ? "border-emerald-500 bg-emerald-500 text-white shadow-sm"
                  : "border-slate-200 bg-white text-slate-600 hover:border-emerald-400 hover:text-emerald-600 dark:border-white/10 dark:bg-white/8 dark:text-slate-300"
              }`}
            >
              {confirmedOnly ? "✓ Confirmed seats only" : "Confirmed seats only"}
            </button>
	          </div>
	        </div>
	      )}

          {/* Emergency travel panel removed per request */}
	      <div className="mt-6 space-y-4">
        {(resultMode === "all" || resultMode === "direct") && (
          <>
            <ResultSectionHeader title="Direct Trains" detail="Single-train journeys returned by the provider for the selected station pair/date." />
            {state.loading && state.trains.length === 0 ? (
              <LoadingBlock label="Loading direct trains..." />
            ) : visibleTrains.length > 0 ? (
              <>
                <div className="mb-4 text-[11px] font-black uppercase text-slate-500 dark:text-slate-400">
                  {visibleTrains.length} {visibleTrains.length === 1 ? "train" : "trains"} found
                </div>
                {visibleTrains.length > 0 && shouldShowBestDirectPanel(source, destination, visibleTrains[0]) && (
                  <BestDirectOptionPanel train={visibleTrains[0]} />
                )}
                <div className="space-y-4">
                  {visibleTrains.map((train) => (
                    <PremiumTrainCard
                      key={`${train.trainNo}-${train.source}-${train.destination}`}
                      train={train}
                      journeyDate={date}
                      onClass={(classCode) => setClassView({ train, classCode })}
                      onRefresh={(classCode) => refreshLiveForTrain(train, classCode)}
                      refreshingKey={manualLiveCheck}
                      onDetail={() => setDetailTrain(train)}
                      quota={quota}
                    />
                  ))}
                </div>
              </>
            ) : (
              <div className={softPanel("rounded-[30px] p-6")}>
                <h3 className="text-2xl font-black">No trains found between {stationCompactLabel(source)} and {stationCompactLabel(destination)} on {date}.</h3>
              </div>
            )}
          </>
        )}
        {showSplitResults && (resultMode === "all" || resultMode === "split") && (
          <>
            <ResultSectionHeader title="Split Journeys" detail="Ranked two-leg journeys found from provider-returned train legs. Each leg is checked separately with its exact station pair, date, class, and quota." />
            {state.splitLoading && state.splits.length === 0 ? (
              <LoadingBlock label={state.splitCoverage === "full" ? "Running expanded split route scan..." : "Finding quick split and multi-split journeys..."} />
            ) : visibleSplitRoutes.length > 0 || filteredMultiSplits.length > 0 ? (
              <>
                {visibleSplitRoutes.length > 0 && (
                  <div className="mb-3 text-[11px] font-black uppercase text-slate-500 dark:text-slate-400">
                    {visibleSplitRoutes.length} split option{visibleSplitRoutes.length !== 1 ? "s" : ""} · Ranked by score
                  </div>
                )}
                {visibleSplitRoutes.map((split, index) => (
                  <SplitJourneyCard
                    key={splitRouteStableKey(split) || `${split.hubStation}-${index}`}
                    split={split}
                    rank={index + 1}
                    journeyDate={date}
                    requestedClass={classType}
                    quota={quota}
                    autoFetchLive={index < splitAutoLiveRouteCountForJourney(source, destination)}
                  />
                ))}
                {filteredMultiSplits.map((split, index) => (
                  <MultiSplitJourneyCard
                    key={`${split.interchangeStations?.join("-") || "multi"}-${index}`}
                    split={split}
                    journeyDate={date}
                    requestedClass={classType}
                    quota={quota}
                  />
                ))}
              </>
            ) : (
              <div className={softPanel("rounded-[30px] p-6")}>
                <h3 className="text-2xl font-black">No split route found via major hubs.</h3>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">
                  No split route found via major hubs. Try specifying a via station manually.
                </p>
              </div>
            )}
          </>
        )}
        {!state.loading && !state.splitLoading && (state.trains.length > 0 || state.splits.length > 0 || state.multiSplits.length > 0) && !visibleTrains.length && !visibleSplitRoutes.length && !filteredMultiSplits.length && (
          <div className={softPanel("rounded-[30px] p-6")}>
            <h3 className="text-2xl font-black">No trains match these filters.</h3>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">
              Try switching off available-only, increasing max fare, or increasing max journey hours.
            </p>
          </div>
        )}
        {!hasSearched && !state.loading && !state.splitLoading && !state.trains.length && !state.splits.length && !state.multiSplits.length && (
          <div className={softPanel("rounded-[30px] p-6")}>
            <h3 className="text-2xl font-black">Ready when you are.</h3>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">
              Choose source, destination, date and class, then run Search. Split journeys are optional and stay off until you enable them.
            </p>
          </div>
        )}
        {false && hasSearched && !state.loading && !state.splitLoading && !state.trains.length && !state.splits.length && !state.multiSplits.length && (
          <div className={softPanel("rounded-[30px] p-6")}>
            <h3 className="text-2xl font-black">{allowSplit ? "No train options found for this exact search." : "No direct train found for this exact search."}</h3>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">
              {allowSplit
                ? "RailRoute checked direct and split route inventory and did not find a valid option for this date. Try a different date."
                : "RailRoute checked direct trains first so search stays fast. This route may need a connection; run split search only when you want gateway options."}
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              {!allowSplit && (
                <button
                  type="button"
                  onClick={() => {
                    const resolvedSource = resolveStationInput(source, sourceQuery);
                    const resolvedDestination = resolveStationInput(destination, destinationQuery);
                    const resolvedPreferredHub = resolveStationInput(preferredHub, preferredHubQuery);
                    runSearch(undefined, {
                      source: resolvedSource,
                      destination: resolvedDestination,
                      date,
                      classType,
                      preferredHub: resolvedPreferredHub && resolvedPreferredHub !== resolvedSource && resolvedPreferredHub !== resolvedDestination ? resolvedPreferredHub : "",
                      fetchSplits: true,
                    });
                  }}
                  className="inline-flex rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white dark:bg-white dark:text-slate-950"
                >
                  Find split journeys
                </button>
              )}
            </div>
          </div>
        )}
      </div>
      <AnimatePresence>
        {classView && <ClassDetailModal train={classView.train} classCode={classView.classCode} journeyDate={date} quota={quota} onClose={() => setClassView(null)} />}
        {detailTrain && <TrainDetailModal train={detailTrain} journeyDate={date} onClose={() => setDetailTrain(null)} onClass={(classCode) => { setClassView({ train: detailTrain, classCode }); setDetailTrain(null); }} />}
      </AnimatePresence>
      <RailRouteCapabilityPanel />
      <StationCodeLookup />
    </section>
  );
}
export function RailRouteCapabilityPanel() {
  const items = [
    ["Search trains", "Find direct trains between selected stations with date and class filters."],
    ["Check route", "Use the route column on each card when a train number is available."],
    ["Coach layout", "Click any class chip to inspect berth layout, coach options, fare and status."],
    ["Ticket status", "Read green AVL, yellow RAC and red WL/REGRET signals before booking."],
    ["Split journeys", "Switch to split results to compare two-leg routes, layover and cost."],
    ["Live status", "Read availability, fare and class status inside this app."],
  ];

  return (
    <div className={softPanel("mt-8 rounded-[30px] p-5")}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs font-black uppercase text-cyan-700 dark:text-cyan-200">What you can do here</div>
          <h3 className="mt-2 text-2xl font-black">RailRoute tools on this page</h3>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-2 text-xs font-black text-slate-600 dark:bg-white/10 dark:text-slate-200">Provider-aware checks</span>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {items.map(([title, body]) => (
          <div key={title} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-black/20">
            <div className="font-black">{title}</div>
            <p className="mt-1 text-xs font-semibold leading-5 text-slate-500 dark:text-slate-400">{body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function StationCodeLookup() {
  const [code, setCode] = useState("");
  const normalized = code.trim().toUpperCase();
  const station = normalized ? stationByCode(normalized) : null;
  const stationLookupState = station ? stationState(station.code) : null;
  const quickDate = todayIso();
  const quickRoutes = station
    ? [
      { label: `${station.code} → New Delhi`, href: `/trains?source=${station.code}&destination=NDLS&date=${quickDate}&classType=3A` },
      { label: `Patna → ${station.code}`, href: `/trains?source=PNBE&destination=${station.code}&date=${quickDate}&classType=3A` },
      { label: `${station.code} → Mumbai`, href: `/trains?source=${station.code}&destination=CSMT&date=${quickDate}&classType=3A` },
    ]
    : [];
  const stationSuggestions = !station && normalized.length >= 2 ? stationMatches(normalized, 3) : [];

  return (
    <div className={softPanel("mt-8 rounded-[30px] p-5")}>
      <div className="grid gap-4 md:grid-cols-[0.8fr_1.2fr] md:items-center">
        <div>
          <div className="text-xs font-black uppercase text-cyan-700 dark:text-cyan-200">Station code lookup</div>
          <h3 className="mt-2 text-2xl font-black">Write a code, get station info</h3>
          <p className="mt-2 text-sm font-semibold text-slate-500 dark:text-slate-400">Try DDU, PRYJ, PNBE, SBC, SMVB, BNC or any station code.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-[220px_1fr]">
          <input
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 10))}
            placeholder="e.g. DDU"
            className="h-13 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black uppercase text-slate-950 outline-none focus:border-cyan-400 dark:border-white/10 dark:bg-white/8 dark:text-white"
          />
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-black/20">
            {station ? (
              <>
                <div className="text-lg font-black">{fullStationLabelFromCode(station.code)}</div>
                <div className="mt-1 text-sm font-bold text-slate-500 dark:text-slate-400">State: {stationLookupState === "India" ? "Unavailable" : stationLookupState} · Code: {station.code}</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link href={`/trains?source=${station.code}&destination=NDLS&date=${quickDate}&classType=3A`} className="rounded-full bg-cyan-100 px-3 py-2 text-xs font-black text-cyan-800 transition hover:bg-cyan-200 dark:bg-cyan-300/12 dark:text-cyan-100">
                    Search from {station.code}
                  </Link>
                  <Link href={`/trains?source=PNBE&destination=${station.code}&date=${quickDate}&classType=3A`} className="rounded-full bg-slate-200 px-3 py-2 text-xs font-black text-slate-800 transition hover:bg-slate-300 dark:bg-white/10 dark:text-slate-100">
                    Search to {station.code}
                  </Link>
                  <Link href={`/trains?source=${station.code}&destination=JP&date=${quickDate}&classType=3A`} className="rounded-full bg-emerald-100 px-3 py-2 text-xs font-black text-emerald-800 transition hover:bg-emerald-200 dark:bg-emerald-300/12 dark:text-emerald-100">
                    Split planner
                  </Link>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {quickRoutes.map((route) => (
                    <Link key={route.href} href={route.href} className="rounded-2xl border border-slate-200 bg-white p-3 text-xs font-black text-slate-700 transition hover:border-cyan-300 hover:text-cyan-700 dark:border-white/10 dark:bg-white/8 dark:text-slate-200">
                      {route.label}
                    </Link>
                  ))}
                </div>
              </>
            ) : normalized ? (
              <>
                <div className="font-bold text-rose-600 dark:text-rose-200">No station found for {normalized}</div>
                {stationSuggestions.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {stationSuggestions.map((item) => (
                      <button key={item.code} type="button" onClick={() => setCode(item.code)} className="rounded-full bg-slate-200 px-3 py-2 text-xs font-black text-slate-800 transition hover:bg-cyan-100 dark:bg-white/10 dark:text-slate-100">
                        {stationLabel(item)}
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="font-bold text-slate-500 dark:text-slate-400">Station details will appear here.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


export function shouldShowBestDirectPanel(source: string, destination: string, train: any) {
  const duration = durationToMinutes(train?.duration);
  return (
    duration > 0 &&
    duration <= 8 * 60 &&
    String(train?.source || "").toUpperCase() === source.toUpperCase() &&
    String(train?.destination || "").toUpperCase() === destination.toUpperCase()
  );
}

export function BestDirectOptionPanel({ train }: { train: any }) {
  return (
    <div className={softPanel("rounded-[30px] p-5")}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-xs font-black uppercase text-emerald-700 dark:text-emerald-200">Best direct option</div>
          <h3 className="mt-2 text-2xl font-black">{trainNumberName(train)}</h3>
          <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
            Direct provider route: {fullStationLabelFromCode(train.source, false)} to {fullStationLabelFromCode(train.destination, false)}. Split options still appear below when they are useful.
          </p>
        </div>
        <div className="grid min-w-[280px] grid-cols-3 gap-2 text-center text-sm">
          <div className="rounded-2xl bg-slate-50 p-3 dark:bg-black/20">
            <div className="text-[10px] font-black uppercase text-slate-400">Depart</div>
            <div className="mt-1 text-xl font-black">{train.departureTime || "--:--"}</div>
          </div>
          <div className="rounded-2xl bg-slate-50 p-3 dark:bg-black/20">
            <div className="text-[10px] font-black uppercase text-slate-400">Arrive</div>
            <div className="mt-1 text-xl font-black">{train.arrivalTime || "--:--"}</div>
          </div>
          <div className="rounded-2xl bg-slate-50 p-3 dark:bg-black/20">
            <div className="text-[10px] font-black uppercase text-slate-400">Journey</div>
            <div className="mt-1 text-xl font-black">{train.duration || "--"}</div>
          </div>
        </div>
      </div>
      <div className="mt-4 rounded-2xl border border-amber-300/35 bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-900 dark:border-amber-300/20 dark:bg-amber-300/10 dark:text-amber-100">
        Final seat status and fare update when the provider returns selected-date data.
      </div>
    </div>
  );
}

export function CoachPositionStrip({ train }: { train: any; activeCoach?: string }) {
  const classes = displayClassesForTrain(train);
  return (
    <div className="rounded-2xl border border-amber-300/35 bg-amber-50 p-4 dark:border-amber-300/20 dark:bg-amber-300/10">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px] font-black uppercase text-slate-500 dark:text-slate-400">Coach position</div>
        <span className="rounded-md border border-amber-300/45 bg-white px-2.5 py-1 text-[10px] font-black text-amber-800 dark:bg-black/20 dark:text-amber-100">Not returned by provider</span>
      </div>
      <p className="mt-2 text-sm font-bold leading-6 text-amber-950 dark:text-amber-50">
        Coach order is not shown because the provider did not return verified coach-position data for this search. RailRoute does not infer loco, parcel, general, or coach sequence.
      </p>
      {classes.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {classes.map((classCode: string) => (
            <span key={classCode} className="rounded-md border border-amber-300/35 bg-white px-2.5 py-1 text-[10px] font-black text-amber-900 dark:bg-black/20 dark:text-amber-100">
              {classCode}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function SeatCalendarStrip({ train, classType }: { train: any; classType: string }) {
  const calendar = classCalendarFor(train, classType);
  if (!calendar.length) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-bold text-slate-500 dark:border-white/10 dark:bg-black/20 dark:text-slate-300">
        Availability calendar unavailable. The provider did not return date-specific quota rows for this class.
      </div>
    );
  }
  return (
    <div className="grid gap-2 grid-cols-4 sm:grid-cols-6 lg:grid-cols-10 xl:grid-cols-12">
      {calendar.map((item: any, index: number) => {
        const status = readableRailStatus(item.text || item.availabilityText || item.status || train.availability);
        const fare = item.fare ? `₹${String(item.fare).replace(/^₹/, "")}` : compactFareText(liveFareText(train));
        return (
          <div key={`${item.date || index}-${status}`} className={`rounded-2xl border p-2 ${availabilityTone(status)}`}>
            <div className="text-[9px] font-black uppercase opacity-70">{item.date || prettyDateLabel(todayIso(index))}</div>
            <div className="mt-1 text-xs font-black">{status}</div>
            <div className="mt-1 text-[10px] font-black opacity-80">{fare}</div>
          </div>
        );
      })}
    </div>
  );
}

export function TrainDetailModal({ train, journeyDate, onClose, onClass }: { train: any; journeyDate: string; onClose: () => void; onClass: (classCode: string) => void }) {
  const [copied, setCopied] = useState(false);
  const classes = displayClassesForTrain(train);
  const actualSource = actualLegSourceStation(train) || train.source;
  const actualDestination = actualLegDestinationStation(train) || train.destination;
  const alternateTerminal = legUsesAlternateTerminal(train);
  const terminalDistanceSummary = nearbyTerminalDistanceSummary(
    actualSource,
    requestedSourceStation(train),
    actualDestination,
    requestedDestinationStation(train)
  );
  const summary = `${trainNumberName(train)} | ${fullStationLabelFromCode(actualSource)} to ${fullStationLabelFromCode(actualDestination)} | ${journeyDate} | ${train.classType || "3A"} | ${compactSeatText(train)} | ${compactFareText(liveFareText(train))}`;

  async function copySummary() {
    await navigator.clipboard?.writeText(summary);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <motion.div className="fixed inset-0 z-[70] bg-slate-950/55 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }} className="mx-auto mt-6 max-h-[90vh] max-w-6xl overflow-auto rounded-[34px] border border-slate-200 bg-white p-5 text-slate-950 shadow-2xl dark:border-white/10 dark:bg-[#08111f] dark:text-white">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-cyan-100 px-3 py-1 text-[11px] font-black text-cyan-800 dark:bg-cyan-300/12 dark:text-cyan-100">Train intelligence</span>
              <span className={`rounded-full border px-3 py-1 text-[11px] font-black ${availabilityTone(train.availability)}`}>{compactSeatText(train)}</span>
            </div>
            <h3 className="mt-4 text-3xl font-black">{trainNumberName(train)}</h3>
            <p className="mt-1 text-sm font-bold text-slate-500 dark:text-slate-400">{fullStationLabelFromCode(actualSource)} to {fullStationLabelFromCode(actualDestination)} · {journeyDate}</p>
            {alternateTerminal && (
              <p className="mt-2 rounded-md border border-amber-300/40 bg-amber-50 px-3 py-2 text-xs font-black text-amber-900 dark:bg-amber-300/10 dark:text-amber-100">
                Search was {fullStationLabelFromCode(requestedSourceStation(train), false)} → {fullStationLabelFromCode(requestedDestinationStation(train), false)}; provider-backed fare/seat is for {fullStationLabelFromCode(actualSource, false)} → {fullStationLabelFromCode(actualDestination, false)}.
                {terminalDistanceSummary ? ` ${terminalDistanceSummary}` : ""}
              </p>
            )}
          </div>
          <button onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 transition hover:border-rose-300 hover:text-rose-600 dark:border-white/10"><X className="h-4 w-4" /></button>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-4">
          {[
            ["Departure", train.departureTime || "--:--"],
            ["Arrival", train.arrivalTime || "--:--"],
            ["Full journey", train.duration || "N/A"],
            ["Final fare", compactFareText(liveFareText(train))],
          ].map(([label, value]) => (
            <div key={label} className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/6">
              <div className="text-[11px] font-black uppercase text-slate-400">{label}</div>
              <div className="mt-1 text-xl font-black">{value}</div>
            </div>
          ))}
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_0.55fr]">
          <div className="space-y-5">
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-black uppercase text-slate-400">Seat calendar</div>
                  <h4 className="mt-1 text-xl font-black">Next 7 days for {train.classType || "3A"}</h4>
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-[11px] font-black text-slate-500 dark:bg-white/10 dark:text-slate-300">Selected class/quota</span>
              </div>
              <div className="mt-4"><SeatCalendarStrip train={train} classType={train.classType || "3A"} /></div>
            </div>
            <InlineRoutePanel trainNo={train.trainNo} train={train} />
          </div>

          <div className="space-y-4">
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/6">
              <div className="text-xs font-black uppercase text-slate-400">Class tools</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {classes.map((classCode: string) => (
                  <button key={classCode} type="button" onClick={() => onClass(classCode)} className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 transition hover:border-cyan-400 hover:text-cyan-700 dark:border-white/10 dark:bg-white/8 dark:text-slate-200">
                    {classCode}
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/6">
              <div className="text-xs font-black uppercase text-slate-400">Trip summary</div>
              <div className="mt-3 rounded-2xl bg-white p-3 text-sm font-black dark:bg-black/20">{summary}</div>
              <button type="button" onClick={copySummary} className="mt-3 flex w-full items-center justify-center rounded-2xl border border-cyan-300 bg-cyan-50 px-4 py-3 text-sm font-black text-cyan-800 transition hover:bg-cyan-100 dark:bg-cyan-300/12 dark:text-cyan-100">
                {copied ? "Copied booking summary" : "Copy booking summary"}
              </button>
            </div>
            <CoachPositionStrip train={train} />
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function renderAvailabilityRow(train: any) {
  const hasAvailability = train.classAvailability && Object.keys(train.classAvailability).length > 0;
  const classes = hasAvailability
    ? Object.keys(train.classAvailability)
    : (train.classes && train.classes.length > 0 ? train.classes : ["SL", "3A", "2A", "1A"]);

  const maxVisible = 6;
  const displayedClasses = classes.slice(0, maxVisible);
  const moreCount = classes.length - maxVisible;

  const getSeatPillStyleAndText = (statusText: string | undefined, isChecking: boolean, classCode: string) => {
    if (isChecking || !statusText) {
      return {
        style: "bg-slate-200/60 text-slate-500 dark:bg-white/8 dark:text-slate-400 animate-pulse",
        text: `${classCode} · Checking...`
      };
    }
    const statusUpper = statusText.toUpperCase();
    if (/\bAVAILABLE\b|\bAVL\b|CNF|CONFIRM/.test(statusUpper)) {
      return {
        style: "bg-green-500/15 text-green-700 dark:text-green-300",
        text: `${classCode} · ${statusText}`
      };
    }
    if (/RAC/.test(statusUpper)) {
      return {
        style: "bg-amber-500/15 text-amber-700 dark:text-amber-200",
        text: `${classCode} · ${statusText}`
      };
    }
    if (/WL|WAIT/.test(statusUpper)) {
      return {
        style: "bg-rose-500/15 text-rose-700 dark:text-rose-200",
        text: `${classCode} · ${statusText}`
      };
    }
    return {
      style: "bg-slate-200/60 text-slate-500 dark:bg-white/8 dark:text-slate-400",
      text: `${classCode} · ${statusText}`
    };
  };

  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {displayedClasses.map((classCode: string) => {
        const hasData = train.classAvailability?.[classCode]?.[0];
        const statusText = hasData ? classAvailabilityStatus(train, classCode) : undefined;
        const { style, text } = getSeatPillStyleAndText(statusText, !hasData, classCode);
        return (
          <span
            key={classCode}
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-black ${style}`}
          >
            {text}
          </span>
        );
      })}
      {moreCount > 0 && (
        <span className="inline-flex items-center rounded-full bg-slate-200/60 text-slate-500 dark:bg-white/8 dark:text-slate-400 px-2.5 py-0.5 text-xs font-black">
          +{moreCount} more
        </span>
      )}
    </div>
  );
}

export function PremiumTrainCard({
  train,
  journeyDate,
  onClass,
  onRefresh,
  refreshingKey,
  onDetail,
  quota = "GN",
}: {
  train: any;
  journeyDate: string;
  onClass: (classCode: string) => void;
  onRefresh: (classCode: string) => void;
  refreshingKey?: string;
  onDetail: () => void;
  quota?: string;
}) {
  const classes = displayClassesForTrain(train);
  const actualSource = actualLegSourceStation(train);
  const actualDestination = actualLegDestinationStation(train);
  const requestedSource = requestedSourceStation(train);
  const requestedDestination = requestedDestinationStation(train);
  const alternateTerminal = legUsesAlternateTerminal(train);
  const terminalDistanceSummary = nearbyTerminalDistanceSummary(actualSource, requestedSource, actualDestination, requestedDestination);

  const [routeOpen, setRouteOpen] = useState(false);
  const [coachOpen, setCoachOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [mapRoute, setMapRoute] = useState<any[]>(train.route || []);
  const [mapRouteLoading, setMapRouteLoading] = useState(false);

  useEffect(() => {
    if (!mapOpen || mapRoute.length > 0) return;
    let active = true;
    setMapRouteLoading(true);
    postJson<any>("/api/train-search", { query: train.trainNo })
      .then((data) => {
        if (!active) return;
        setMapRoute(data.trains?.[0]?.route || []);
        setMapRouteLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setMapRouteLoading(false);
      });
    return () => { active = false; };
  }, [mapOpen, train.trainNo, mapRoute.length]);

  const mapStations = useMemo(() => {
    if (mapRoute && mapRoute.length > 0) {
      return mapRoute.map((stop: any) => ({
        code: stop.code || stop.stationCode,
        name: stop.name || stop.stationName || stop.code
      }));
    }
    return [
      { code: actualSource || train.source, name: fullStationLabelFromCode(actualSource || train.source) },
      { code: actualDestination || train.destination, name: fullStationLabelFromCode(actualDestination || train.destination) }
    ];
  }, [mapRoute, actualSource, actualDestination, train.source, train.destination]);
  const routeAvailable = Boolean(train.trainNo);
  const trustMeta = train.trustMeta || trustMetaFromTrain(train);
  const primaryClass = primaryClassCode(train);
  const shouldOfferLiveCheck = Boolean(primaryClass && needsLiveQuotaRefresh(train, primaryClass));
  const hasProviderFareOrAvailability = trainFareAmount(train) > 0 || !isUnavailableRailStatus(train.availability);
	  const selectedClass = String(train?.selectedClass || "").toUpperCase().trim();
	  const providerClassList = normalizedClassList(returnedClassesForTrain(train));
	  const selectedClassNotReturned = Boolean(selectedClass && selectedClass !== "ANY" && providerClassList.length && !providerClassList.includes(selectedClass));
	  const resolvedJourneyDate = trainJourneyDate(train, journeyDate);
	  const liveLookupKey = primaryClass ? `${train?.trainNo}_${liveSourceStation(train)}_${liveDestinationStation(train)}_${resolvedJourneyDate}_${primaryClass}_${quota || "GN"}` : "";
  const checkingPrimaryClass = Boolean(liveLookupKey && refreshingKey === liveLookupKey);
  const showLiveFallbackWarning = liveDataUnavailableWarning(train, primaryClass);
  const requestExactLive = (classCode: string) => {
    if (!classCode) return;
    onRefresh(classCode);
  };
  return (
    <article className={softPanel("overflow-hidden rounded-2xl")}>
      <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_240px_260px]">
        <div>
          <div className="flex flex-wrap gap-2">
            <DataBadge type={train.isCityTerminalOption ? "NEARBY BOARDING" : "LIVE"} label={train.isCityTerminalOption ? "Nearby / terminal train" : "Direct train"} />
            <DataBadge type={badgeTypeFromSource(trustMeta.source)} label={train.dataSource || trustMeta.provider} />
            {hasProviderFareOrAvailability && <DataBadge type="LIVE" label="Live Data Available" />}
          </div>
          <TrustSummary meta={trustMeta} />
          <h3 className="mt-4 text-2xl font-black">{trainNumberName(train)}</h3>
          <p className="mt-1 text-sm font-bold text-slate-500 dark:text-slate-400">
            {train.trainType ? `${train.trainType} · ` : ""}
            {fullStationLabelFromCode(actualSource || train.source)} to {fullStationLabelFromCode(actualDestination || train.destination)}
          </p>
          {alternateTerminal && (
            <p className="mt-1 rounded-md border border-amber-300/40 bg-amber-50 px-3 py-2 text-xs font-black text-amber-900 dark:bg-amber-300/10 dark:text-amber-100">
              Search was {fullStationLabelFromCode(requestedSource, false)} → {fullStationLabelFromCode(requestedDestination, false)}; provider-backed fare/seat is for {fullStationLabelFromCode(actualSource, false)} → {fullStationLabelFromCode(actualDestination, false)}.
              {terminalDistanceSummary ? ` ${terminalDistanceSummary}` : ""}
            </p>
          )}
	          <RunningDaysStrip train={train} journeyDate={resolvedJourneyDate} />
          {selectedClassNotReturned && (
            <div className="mt-2 rounded-2xl border border-amber-300/35 bg-amber-50 px-3 py-2 text-xs font-black text-amber-900 dark:border-amber-300/20 dark:bg-amber-300/10 dark:text-amber-100">
              {selectedClass} was not returned in the provider class list for this train.
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <span className={`rounded-md border px-3 py-1.5 text-xs font-black ${availabilityTone(train.availability)}`}>Railway availability: {compactSeatText(train)}</span>
            <span className={`rounded-full border px-3 py-1.5 text-xs font-black ${fareTone(liveFareText(train))}`}>Final fare: {compactFareText(liveFareText(train))}</span>
            <span className="rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-black text-slate-600 dark:border-white/10 dark:bg-white/8 dark:text-slate-300">{primaryClass || "Class unavailable"} · IRCTC-compatible provider</span>
          </div>
          {showLiveFallbackWarning && (
            <div className="mt-3 rounded-2xl border border-amber-300/40 bg-amber-50 px-4 py-3 text-xs font-black leading-5 text-amber-900 dark:border-amber-300/20 dark:bg-amber-300/10 dark:text-amber-100">
              Live data unavailable.
            </div>
          )}
          {shouldOfferLiveCheck && primaryClass && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" disabled={checkingPrimaryClass} onClick={() => requestExactLive(primaryClass)} className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-800 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-70 dark:bg-emerald-300/12 dark:text-emerald-100">
                {checkingPrimaryClass ? "Checking availability..." : "Check Availability"}
              </button>
              <button type="button" disabled={checkingPrimaryClass} onClick={() => requestExactLive(primaryClass)} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-black text-slate-700 transition hover:border-cyan-400 hover:text-cyan-800 disabled:cursor-not-allowed disabled:opacity-70 dark:border-white/10 dark:bg-white/8 dark:text-slate-100">
                {checkingPrimaryClass ? "Checking fare..." : "Check Fare"}
              </button>
            </div>
          )}
          <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-3xl bg-slate-50 p-4 dark:bg-black/20">
            <div><div className="text-3xl font-black">{train.departureTime || "--:--"}</div><div className="mt-1 text-xs font-black text-emerald-600 dark:text-emerald-200">{fullStationLabelFromCode(actualSource || train.source)}</div></div>
            <div className="min-w-28 text-center"><div className="text-xs font-black text-slate-500">{train.duration || "N/A"}</div><div className="my-2 h-px bg-gradient-to-r from-emerald-400 via-cyan-400 to-rose-400" /><div className="text-[11px] font-bold text-slate-400">route</div></div>
            <div className="text-right"><div className="text-3xl font-black">{train.arrivalTime || "--:--"}</div><div className="mt-1 text-xs font-black text-rose-600 dark:text-rose-200">{fullStationLabelFromCode(actualDestination || train.destination)}</div></div>
          </div>
          {renderAvailabilityRow(train)}

          <div className="mt-3 rounded-2xl border border-amber-300/35 bg-amber-50 px-4 py-3 text-xs font-black leading-5 text-amber-900 dark:border-amber-300/20 dark:bg-amber-300/10 dark:text-amber-100">
            Platform numbers are hidden unless returned by the provider. Confirm the final platform on station boards before boarding.
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => setCoachOpen((value) => !value)} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black text-slate-700 transition hover:border-cyan-400 hover:text-cyan-700 dark:border-white/10 dark:bg-white/6 dark:text-slate-200">
              {coachOpen ? "Hide coach position" : "Coach position"}
            </button>
            <button type="button" onClick={onDetail} className="rounded-full border border-cyan-300 bg-cyan-50 px-3 py-2 text-xs font-black text-cyan-800 transition hover:bg-cyan-100 dark:bg-cyan-300/12 dark:text-cyan-100">
              Train details
            </button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {classes.length > 0 ? classes.map((classCode: string) => (
	              <button key={classCode} type="button" disabled={refreshingKey === `${train?.trainNo}_${liveSourceStation(train)}_${liveDestinationStation(train)}_${resolvedJourneyDate}_${classCode}_${quota || "GN"}`} onClick={() => requestExactLive(classCode)} className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 transition hover:border-cyan-400 hover:text-cyan-700 disabled:cursor-not-allowed disabled:opacity-70 dark:border-white/10 dark:bg-white/8 dark:text-slate-200 dark:hover:bg-cyan-300/12">
	                {refreshingKey === `${train?.trainNo}_${liveSourceStation(train)}_${liveDestinationStation(train)}_${resolvedJourneyDate}_${classCode}_${quota || "GN"}` ? `Checking ${classCode}` : classCode}
              </button>
            )) : (
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black text-slate-500 dark:border-white/10 dark:bg-white/6 dark:text-slate-300">
                Provider did not return verified classes
              </span>
            )}
          </div>
          {coachOpen && <div className="mt-4"><CoachPositionStrip train={train} /></div>}
        </div>
        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/6">
          <div className="text-[11px] font-black uppercase text-slate-400">Train route</div>
          <div className={`mt-3 rounded-2xl border p-3 text-sm font-black ${routeAvailable ? "border-cyan-300 bg-cyan-100 text-cyan-800 dark:border-cyan-300/25 dark:bg-cyan-300/12 dark:text-cyan-100" : "border-slate-200 bg-slate-100 text-slate-500 dark:border-white/10 dark:bg-white/8 dark:text-slate-300"}`}>
            {routeAvailable ? "Route check available" : "Route unavailable"}
          </div>
          <div className="mt-3 text-xs font-bold leading-5 text-slate-500 dark:text-slate-400">
            Expands in this card using the IRCTC-compatible schedule endpoint. Route data may be cached.
          </div>
          <button type="button" disabled={!routeAvailable} onClick={() => setRouteOpen((value) => !value)} className="mt-4 flex w-full items-center justify-center rounded-2xl border border-cyan-300 bg-cyan-50 px-4 py-3 text-sm font-black text-cyan-800 transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-cyan-300/12 dark:text-cyan-100">
            {routeOpen ? "Hide train route" : "Check train route"}
          </button>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/8">
          <div className="text-[11px] font-black uppercase text-slate-400">Ticket status</div>
          <div className={`mt-2 rounded-2xl p-3 text-xl font-black ${ticketDecision(train.availability).tone}`}>{ticketDecision(train.availability).label}</div>
          <div className="mt-3 grid gap-2">
            <div className={`rounded-2xl border p-3 text-sm font-black ${availabilityTone(train.availability)}`}>
              <div className="text-[10px] uppercase opacity-70">Railway availability</div>
              <div className="mt-1 text-lg">{compactSeatText(train)}</div>
            </div>
	            <div className={`rounded-2xl border p-3 text-sm font-black ${fareTone(liveFareText(train))}`}>
              <div className="text-[10px] uppercase opacity-70">Rate</div>
	              <div className="mt-1 text-lg">{compactFareText(liveFareText(train))}</div>
            </div>
          </div>
          {shouldOfferLiveCheck && primaryClass && (
            <button type="button" disabled={checkingPrimaryClass} onClick={() => requestExactLive(primaryClass)} className="mt-3 flex w-full items-center justify-center rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-800 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-70 dark:bg-emerald-300/12 dark:text-emerald-100">
              {checkingPrimaryClass ? "Checking exact fare + availability..." : "Check Fare + Availability"}
            </button>
          )}
          <div className="mt-4 text-xs font-semibold leading-5 text-slate-500">All provider-returned direct trains are listed above. Class details refresh this exact train and class. Berth layout is not a booked-berth view.</div>
        </div>
      </div>
      {routeOpen && <div className="border-t border-slate-200 px-5 pb-5 dark:border-white/10"><InlineRoutePanel trainNo={train.trainNo} train={train} /></div>}
      {debugModeEnabled() && train?._debugTrace && <ProviderDebugPanel trace={train._debugTrace} />}
    </article>
  );
}

export function ProviderDebugPanel({ trace }: { trace: any }) {
  return (
    <details className="border-t border-slate-200 bg-slate-50 px-5 py-4 text-xs dark:border-white/10 dark:bg-black/20">
      <summary className="cursor-pointer font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">Provider debug trace</summary>
      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        {[
          ["Provider Source", trace.providerSource || trace.provider || "Unavailable"],
          ["API Endpoint", trace.apiEndpoint || "Unavailable"],
          ["Selected Class", trace.selectedClass || trace.mappedResponse?.selectedClass || "Unavailable"],
          ["Provider Returned Class", trace.providerReturnedClass || trace.mappedResponse?.providerReturnedClass || "Unavailable"],
          ["Availability Response", trace.availabilityResponse || trace.rawResponse?.data?.availability || "Unavailable"],
          ["Fare Response", trace.fareResponse || trace.rawResponse?.data?.fare || "Unavailable"],
          ["Mapped Response", trace.mappedResponse],
          ["Rendered Response", trace.renderedResponse],
          ["Raw Response", trace.rawResponse],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-white/6">
            <div className="mb-2 text-[10px] font-black uppercase text-slate-400">{String(label)}</div>
            <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words text-[11px] font-semibold leading-5 text-slate-700 dark:text-slate-200">
              {typeof value === "string" ? value : compactDebugJson(value)}
            </pre>
          </div>
        ))}
      </div>
    </details>
  );
}

export function DirectTrainIndex({
  trains,
  journeyDate,
  source,
  destination,
  selectedClass,
  quota,
  onClass,
  onDetail,
  onRefresh,
  refreshingKey,
}: {
  trains: any[];
  journeyDate: string;
  source: string;
  destination: string;
  selectedClass: string;
  quota: string;
  onClass: (train: any, classCode: string) => void;
  onDetail: (train: any) => void;
  onRefresh: (train: any, classCode: string) => void;
  refreshingKey: string;
}) {
  const [routeTrain, setRouteTrain] = useState<any | null>(null);
  if (!trains.length) return null;
  return (
    <div className="mb-4 space-y-3">
      <div className={softPanel("rounded-2xl p-4")}>
        <div>
          <div className="text-[11px] font-black uppercase text-slate-400">Complete direct list</div>
          <div className="mt-1 text-sm font-bold text-slate-600 dark:text-slate-300">
            Showing all {trains.length} direct train result{trains.length === 1 ? "" : "s"} returned after filters.
          </div>
        </div>
      </div>
      <div className="space-y-3">
        {trains.map((train, index) => {
          const searchedClass = String(selectedClass || "").toUpperCase();
          const classCode = searchedClass && searchedClass !== "ANY" ? searchedClass : primaryClassCode(train);
          const rowClasses = searchedClass && searchedClass !== "ANY" ? [searchedClass] : displayClassesForTrain(train);
          const liveKey = `${train?.trainNo || ""}_${liveSourceStation(train)}_${liveDestinationStation(train)}_${journeyDate}_${classCode || ""}_${quota || "GN"}`;
          const checking = refreshingKey === liveKey;
          const needsRefresh = classCode ? needsLiveQuotaRefresh(train, classCode) : false;
          const durationMinutes = durationToMinutes(train.duration);
          const durationLabel = durationMinutes ? formatDurationLong(durationMinutes) : train.duration || "--";
          const actualSource = actualLegSourceStation(train) || source;
          const actualDestination = actualLegDestinationStation(train) || destination;
          const requestedSource = requestedSourceStation(train, source);
          const requestedDestination = requestedDestinationStation(train, destination);
          const alternateTerminal = legUsesAlternateTerminal(train, source, destination);
          const terminalDistanceSummary = nearbyTerminalDistanceSummary(actualSource, requestedSource, actualDestination, requestedDestination);
          const trainSource = train.trainSource || actualSource;
          const trainDestination = train.trainDestination || actualDestination;
          const trainRunsDifferentRoute = trainSource !== actualSource || trainDestination !== actualDestination;
          return (
            <article key={`${train.trainNo}-${train.source}-${train.destination}-direct-card`} className={softPanel("rounded-2xl p-4")}>
              <div className="grid gap-4 lg:grid-cols-[minmax(240px,1.15fr)_minmax(320px,1.3fr)_minmax(220px,0.9fr)_auto] lg:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-black uppercase text-slate-500 dark:bg-white/10 dark:text-slate-300">#{index + 1}</span>
                    {train.trainType && <span className="rounded-md bg-cyan-50 px-2 py-1 text-[10px] font-black uppercase text-cyan-800 dark:bg-cyan-300/12 dark:text-cyan-100">{train.trainType}</span>}
                  </div>
                  <h4 className="mt-2 text-xl font-black tracking-tight">{trainNumberName(train)}</h4>
                  <div className="mt-2 text-sm font-black text-slate-600 dark:text-slate-200">
                    {stationCompactLabel(actualSource)} → {stationCompactLabel(actualDestination)}
                  </div>
                  {alternateTerminal && (
                    <div className="mt-1 rounded-md border border-amber-300/40 bg-amber-50 px-2.5 py-1.5 text-xs font-black text-amber-900 dark:bg-amber-300/10 dark:text-amber-100">
                      Search was {stationCompactLabel(requestedSource)} → {stationCompactLabel(requestedDestination)}; live fare/seat is for {stationCompactLabel(actualSource)} → {stationCompactLabel(actualDestination)}.
                      {terminalDistanceSummary ? ` ${terminalDistanceSummary}` : ""}
                    </div>
                  )}
                  {trainRunsDifferentRoute && (
                    <div className="mt-1 text-xs font-semibold text-slate-400 dark:text-slate-500">
                      Provider route segment: {stationCompactLabel(trainSource)} → {stationCompactLabel(trainDestination)}
                    </div>
                  )}
                  <RunningDaysStrip train={train} journeyDate={journeyDate} compact />
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-black/20">
                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                    <div>
                      <div className="text-[10px] font-black uppercase text-slate-400">Departure</div>
                      <div className="mt-1 text-2xl font-black">{timeAmPm(train.departureTime)}</div>
                      <div className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">{stationCompactLabel(actualSource)}</div>
                    </div>
                    <div className="min-w-24 text-center">
                      <div className="text-[10px] font-black uppercase text-slate-400">Duration</div>
                      <div className="mt-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-black text-slate-700 dark:border-white/10 dark:bg-white/8 dark:text-slate-200">{durationLabel}</div>
                      <div className="mx-auto mt-2 h-px w-full bg-gradient-to-r from-emerald-400 via-cyan-400 to-rose-400" />
                    </div>
	                    <div className="text-right">
	                      <div className="text-[10px] font-black uppercase text-slate-400">Arrival</div>
	                      <div className="mt-1 text-2xl font-black">{timeAmPm(train.arrivalTime)}</div>
	                      <div className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">{stationCompactLabel(actualDestination)}</div>
	                    </div>
	                  </div>
	                  <ExpectedPlatformPair
	                    trainNo={train.trainNo}
	                    source={actualSource}
	                    destination={actualDestination}
	                    initialRoute={train.route}
	                  />
	                </div>

                <div className="space-y-2">
                  {rowClasses.map((nextClass: string) => {
                    const fare = classFareText(train, nextClass);
                    const seats = classAvailabilityStatus(train, nextClass);
	                    const fareCopy = compactFareText(fare);
	                    const seatCopy = seats;
	                    const retryOnly = /tap to retry/i.test(`${fareCopy} ${seatCopy}`);
	                    const chanceCopy = confirmationChanceLabel(seatCopy, train);
	                    return (
                      <button
                        key={`${train.trainNo}-${train.source}-${train.destination}-${nextClass}-card`}
                        type="button"
                        onClick={() => onClass(train, nextClass)}
                        className={`grid w-full grid-cols-[auto_1fr] items-center gap-3 rounded-2xl border px-3 py-3 text-left text-sm font-black ${availabilityTone(seats)}`}
                      >
                        <span className="rounded-md bg-white/70 px-2 py-1 text-xs dark:bg-black/20">{nextClass}</span>
                        {retryOnly ? (
                          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            <span>Tap to check</span>
                            {fareCopy && !/check fare|tap to retry|tap to check/i.test(fareCopy) && <span>{fareCopy}</span>}
                          </span>
                        ) : (
	                          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
	                            <span>{seatCopy}</span>
	                            <span>Final fare: {fareCopy}</span>
	                            {chanceCopy && (
	                              <span className={`rounded-md border px-2 py-0.5 text-[10px] ${confirmationChanceTone(seatCopy, train)}`}>
	                                {chanceCopy}
	                              </span>
	                            )}
	                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                <div className="flex flex-wrap gap-2 lg:justify-end">
                  <button type="button" onClick={() => setRouteTrain(train)} className="h-11 rounded-xl border border-cyan-300 bg-cyan-50 px-4 text-xs font-black text-cyan-800 dark:bg-cyan-300/12 dark:text-cyan-100">
                    Route
                  </button>
                  {classCode && (
                    <button type="button" onClick={() => onRefresh(train, classCode)} disabled={checking} className="inline-flex h-11 items-center gap-1 rounded-xl border border-emerald-300 bg-emerald-50 px-4 text-xs font-black text-emerald-800 disabled:cursor-wait disabled:opacity-70 dark:bg-emerald-300/12 dark:text-emerald-100">
                      {checking && <Loader2 className="h-3 w-3 animate-spin" />}
                      {checking ? "Checking" : needsRefresh ? "Refresh live" : "Refresh"}
                    </button>
                  )}
                  {classCode && (
                    <button type="button" onClick={() => onClass(train, classCode)} className="h-11 rounded-xl border border-cyan-300 bg-cyan-50 px-4 text-xs font-black text-cyan-800 dark:bg-cyan-300/12 dark:text-cyan-100">
                      {classCode}
                    </button>
                  )}
                  <button type="button" onClick={() => onDetail(train)} className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-700 dark:border-white/10 dark:bg-white/8 dark:text-slate-200">
                    More
                  </button>
                </div>
              </div>
              {routeTrain && routeTrain.trainNo === train.trainNo && routeTrain.source === train.source && routeTrain.destination === train.destination && (
                <div className="mt-4 rounded-2xl border border-cyan-300/30 bg-cyan-50/70 p-3 dark:border-cyan-300/20 dark:bg-cyan-300/10">
                  <div className="mb-3 flex items-center justify-between gap-3 px-1">
                    <div className="text-xs font-black uppercase text-cyan-800 dark:text-cyan-100">Direct train route</div>
                    <button type="button" onClick={() => setRouteTrain(null)} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-black text-slate-700 dark:border-white/10 dark:bg-white/8 dark:text-slate-100">Hide</button>
                  </div>
                  <InlineRoutePanel trainNo={routeTrain.trainNo} train={routeTrain} />
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}

export function InlineRoutePanel({ trainNo, train }: { trainNo: string; train: any }) {
  const [state, setState] = useState<{ loading: boolean; route: any[]; error: string }>({ loading: true, route: [], error: "" });

  useEffect(() => {
    let mounted = true;
    postJson<any>("/api/train-search", { query: trainNo })
      .then((data) => {
        if (!mounted) return;
        setState({ loading: false, route: data.trains?.[0]?.route || [], error: "" });
      })
      .catch((error) => {
        if (!mounted) return;
        setState({ loading: false, route: [], error: error instanceof Error ? error.message : "Route unavailable" });
      });
    return () => {
      mounted = false;
    };
  }, [trainNo]);

	  const route = state.route.length ? state.route : train.route?.length ? train.route : [];
	  const sourceCode = actualLegSourceStation(train) || liveSourceStation(train) || train?.source || "";
	  const destinationCode = actualLegDestinationStation(train) || liveDestinationStation(train) || train?.destination || "";

	  return (
    <div className="mt-4 rounded-3xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-black uppercase text-slate-400">Complete route</div>
          <div className="mt-1 text-lg font-black">{train.departureTime || "--:--"} → {train.arrivalTime || "--:--"}</div>
          <div className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">Showing every station returned by the IRCTC-compatible schedule endpoint.</div>
	          <div className="mt-2 rounded-2xl border border-amber-300/35 bg-amber-50 px-3 py-2 text-[11px] font-black text-amber-900 dark:border-amber-300/20 dark:bg-amber-300/10 dark:text-amber-100">
	            Platform numbers appear only when the provider returns them.
	          </div>
	          <PlatformPairSummary
	            route={route}
	            source={sourceCode}
	            destination={destinationCode}
	            loading={state.loading}
	          />
	        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600 dark:bg-black/20 dark:text-slate-300">{route.length} stops</span>
      </div>
	      {state.loading && <div className="mt-4 text-sm font-bold text-slate-500">Loading route from train schedule...</div>}
	      {state.error && <div className="mt-4 text-sm font-bold text-rose-600">{state.error}</div>}
	      {!state.loading && !state.error && route.length === 0 && (
	        <div className="mt-4 rounded-2xl border border-amber-300/35 bg-amber-50 p-3 text-sm font-bold text-amber-900 dark:border-amber-300/20 dark:bg-amber-300/10 dark:text-amber-100">
	          Provider did not return a verified route for this train.
	        </div>
	      )}
	      <div className="mt-4 max-h-[560px] overflow-y-auto pr-1">
        <div className="grid gap-2 md:grid-cols-2">
          {route.map((stop: any, index: number) => {
            return (
              <div key={`${stop.code}-${index}`} className="rounded-2xl bg-slate-50 p-3 text-sm dark:bg-black/20">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-black">{stop.label || stationLabelFromCode(stop.code)}</div>
                    <div className="mt-1 text-xs font-bold text-slate-500">Arr {stop.arrival || "--"} · Dep {stop.departure || "--"} · Halt {stop.halt || "-"}</div>
                  </div>
                  <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[10px] font-black text-slate-500 dark:bg-white/10 dark:text-slate-300">#{index + 1}</span>
                </div>
                <div className="mt-2 text-[11px] font-bold text-slate-400">
                  {platformDisplay(stop)} · Day {stop.day || 1} · {stop.distance ?? "--"} km
                </div>
              </div>
            );
          })}
        </div>
        {route.length > 20 && (
          <div className="sticky bottom-0 mt-3 rounded-2xl border border-slate-200 bg-white/90 p-3 text-center text-xs font-black text-slate-500 backdrop-blur dark:border-white/10 dark:bg-[#101725]/90 dark:text-slate-300">
            Complete route loaded: {route.length} stops
          </div>
        )}
      </div>
    </div>
  );
}

export function ClassDetailModal({ train, classCode, journeyDate, quota = "GN", onClose }: { train: any; classCode: string; journeyDate: string; quota?: string; onClose: () => void }) {
  const [liveTrain, setLiveTrain] = useState(train);
  const [fetchingLive, setFetchingLive] = useState(false);
  const fetchedKeyRef = useRef("");

  useEffect(() => {
    setLiveTrain(train);
    fetchedKeyRef.current = "";
  }, [train, classCode]);

  useEffect(() => {
    const key = `${train?.trainNo || ""}_${liveSourceStation(train)}_${liveDestinationStation(train)}_${journeyDate}_${classCode}_${quota || "GN"}`;
    if (!journeyDate || !train?.trainNo || !train?.source || !train?.destination || fetchedKeyRef.current === key) return;
    if (!needsLiveQuotaRefresh(liveTrain, classCode)) return;

    fetchedKeyRef.current = key;
    setFetchingLive(true);
    postJson<any>("/api/availability", {
      trainNo: train.trainNo,
      source: liveSourceStation(train),
      destination: liveDestinationStation(train),
      date: journeyDate,
      classType: classCode,
      quota,
      debug: debugModeEnabled(),
    })
      .then((response) => {
        const quote = liveQuoteFromResponse(response, classCode, journeyDate);
        setLiveTrain((current: any) => applyLiveQuoteToTrain(current, classCode, quote));
      })
	      .catch((error) => {
        const message = error instanceof Error ? error.message : "Provider request failed";
        const rateLimited = isProviderDelay(message);
        const lookupStatus: LookupTrustStatus = rateLimited ? "RATE_LIMITED" : "PROVIDER_UNAVAILABLE";
        const cleanMessage = providerIssueCopy(message, classCode);
        const quote: LiveClassQuote = {
          availability: lookupStatusLabel(lookupStatus, "availability", classCode, cleanMessage),
          fare: 0,
          source: rateLimited ? "Live check queued" : "Provider unavailable",
          updatedTime: cleanMessage,
          availabilityStatus: lookupStatus,
          fareStatus: lookupStatus,
          lookupReason: cleanMessage,
          error: cleanMessage,
        };
        setLiveTrain((current: any) => applyLiveQuoteToTrain(current, classCode, quote));
      })
      .finally(() => setFetchingLive(false));
  }, [classCode, journeyDate, liveTrain, quota, train]);

  const classState = useMemo(() => {
    const availability = fetchingLive ? "Fetching live availability..." : classAvailabilityStatus(liveTrain, classCode);
    const source = fetchingLive ? "Provider check in progress" : classDataSourceLabel(liveTrain, classCode);
    return {
      loading: fetchingLive,
      error: source === "Not returned" ? "Selected-date class quota was not returned by the provider." : "",
      fare: classFareText(liveTrain, classCode),
      availability,
      source,
    };
  }, [classCode, fetchingLive, liveTrain]);
  const classTrain = useMemo(() => ({ ...liveTrain, classType: classCode, fare: classState.fare, availability: classState.availability }), [classCode, classState.availability, classState.fare, liveTrain]);
  const decision = ticketDecision(classState.availability);
  const trace = liveTrain?.classAvailability?.[classCode]?.[0]?.providerTrace;
  const actualSource = actualLegSourceStation(liveTrain) || liveTrain.source;
  const actualDestination = actualLegDestinationStation(liveTrain) || liveTrain.destination;

  return (
    <motion.div className="fixed inset-0 z-[70] bg-slate-950/50 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }} className="mx-auto mt-10 max-h-[88vh] max-w-5xl overflow-auto rounded-[34px] border border-slate-200 bg-white p-5 text-slate-950 shadow-2xl dark:border-white/10 dark:bg-[#08111f] dark:text-white">
        <div className="flex items-start justify-between gap-4">
          <div>
            <span className="rounded-full bg-cyan-100 px-3 py-1 text-[11px] font-black text-cyan-800 dark:bg-cyan-300/12 dark:text-cyan-100">{classCode} class view</span>
            <h3 className="mt-4 text-3xl font-black">{train.trainName}</h3>
            <p className="mt-1 text-sm font-bold text-slate-500 dark:text-slate-400">Fare · availability · berth layout · coach options for {journeyDate}</p>
          </div>
          <button type="button" aria-label="Close class details" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 dark:border-white/10"><X className="h-4 w-4" /></button>
        </div>
        <div className="mt-6 grid gap-5 lg:grid-cols-[0.7fr_1.3fr]">
          <div className="space-y-3">
            {[
              ["Fare", classState.fare],
              ["Availability", classState.availability],
              ["Source", classState.source],
              ["Class queried", classCode],
              ["Quota queried", quota],
              ["Journey date", journeyDate],
              ["Provider leg", `${actualSource || "--"} → ${actualDestination || "--"}`],
              ["Coach options", classCode === "1A" ? "H1 · HA1 · Cabin/Coupe" : classCode === "2A" ? "A1 · A2 · A3 · A4" : classCode === "SL" ? "S1 · S2 · S3 · ... · S12" : ["3A", "3E"].includes(classCode) ? "B1 · B2 · B3 · B4 · B5 · B6" : "B1 · B2 · B3 · B4"],
            ].map(([label, value]) => (
              <div key={label} className={`rounded-3xl border p-4 ${label === "Availability" && !classState.loading ? availabilityTone(value) : "border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/6"}`}><div className="text-[11px] font-black uppercase text-slate-400">{label}</div><div className="mt-1 text-xl font-black">{value}</div></div>
            ))}
            <div className={`rounded-3xl p-4 text-sm font-black ${decision.tone}`}>
              Ticket check: {decision.label}
            </div>
            <FareBreakdownPanel train={liveTrain} classCode={classCode} fare={classState.fare} />
            <div className="rounded-3xl border border-cyan-300/30 bg-cyan-50 p-4 text-sm font-black leading-6 text-cyan-900 dark:bg-cyan-300/10 dark:text-cyan-100">
              Quota is requested through the provider. Actual berth numbers are assigned after booking/charting, so this layout is not an occupied-berth view.
            </div>
            {classState.error && <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800 dark:border-amber-300/20 dark:bg-amber-300/10 dark:text-amber-100">{classState.error}</div>}
          </div>
          <CoachExplorer initialClass={classCode} embedded train={classTrain} />
        </div>
        {debugModeEnabled() && trace && <ProviderDebugPanel trace={trace} />}
      </motion.div>
    </motion.div>
  );
}

type ClassPanelSelection = { train: any; classCode: string; label: string };

export function ClassRateStrip({
  train,
  journeyDate,
  selectedClass,
  quota = "GN",
  autoFetchSelected = true,
  onSelect,
}: {
  train: any;
  journeyDate: string;
  selectedClass?: string;
  quota?: string;
  autoFetchSelected?: boolean;
  onSelect: (selection: ClassPanelSelection) => void;
}) {
  const [quotes, setQuotes] = useState<Record<string, LiveClassQuote>>({});
  const [loadingClass, setLoadingClass] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const autoFetchedClasses = useRef<Set<string>>(new Set());
  const displayTrain = useMemo(
    () => Object.entries(quotes).reduce((current, [classCode, quote]) => applyLiveQuoteToTrain(current, classCode, quote), train),
    [quotes, train]
  );
  const selectedClassCode = String(selectedClass || primaryClassCode(displayTrain) || primaryClassCode(train) || "").toUpperCase();
  const classCodes = selectedClassCode
    ? [selectedClassCode]
    : displayClassesForTrain(displayTrain).slice(0, 3);

  async function fetchClassQuote(classCode: string, openPanel: boolean) {
    const currentTrain = applyLiveQuoteToTrain(displayTrain, classCode, quotes[classCode]);
    if (openPanel && (quotes[classCode] || !needsLiveQuotaRefresh(displayTrain, classCode))) {
      onSelect({ train: currentTrain, classCode, label: `${classCode} class` });
      return;
    }

    if (!journeyDate || !train?.trainNo || !train?.source || !train?.destination || quotes[classCode] || !needsLiveQuotaRefresh(displayTrain, classCode)) {
      if (openPanel) onSelect({ train: currentTrain, classCode, label: `${classCode} class` });
      return;
    }

    setLoadingClass(classCode);
    setErrors((current) => ({ ...current, [classCode]: "" }));
    try {
      const response = await postJson<any>("/api/availability", {
        trainNo: train.trainNo,
        source: liveSourceStation(train),
        destination: liveDestinationStation(train),
        date: journeyDate,
        classType: classCode,
        quota,
        debug: debugModeEnabled(),
      });
      const quote = liveQuoteFromResponse(response, classCode, journeyDate);
      const nextTrain = applyLiveQuoteToTrain(displayTrain, classCode, quote);
      setQuotes((current) => ({ ...current, [classCode]: quote }));
      if (openPanel) onSelect({ train: nextTrain, classCode, label: `${classCode} class` });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Live quota unavailable";
      setErrors((current) => ({ ...current, [classCode]: providerIssueCopy(message, classCode) }));
    } finally {
      setLoadingClass("");
    }
  }

  // Auto-fetch live fare + availability for all displayed classes on mount / when key params change
  useEffect(() => {
    if (!autoFetchSelected || !journeyDate || !train?.trainNo || !train?.source || !train?.destination) return;
    const codesToFetch = classCodes.filter((code) => {
      if (!code || !needsLiveQuotaRefresh(displayTrain, code)) return false;
      const key = `${train.trainNo}|${liveSourceStation(train)}|${liveDestinationStation(train)}|${journeyDate}|${code}|${quota || "GN"}`;
      if (autoFetchedClasses.current.has(key)) return false;
      autoFetchedClasses.current.add(key);
      return true;
    });
    if (codesToFetch.length === 0) return;
    // Fetch sequentially with a small delay between to avoid hammering the API
    let cancelled = false;
    (async () => {
      for (const code of codesToFetch) {
        if (cancelled) break;
        await fetchClassQuote(code, false);
        if (!cancelled && codesToFetch.indexOf(code) < codesToFetch.length - 1) {
          await new Promise((r) => setTimeout(r, 300));
        }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFetchSelected, journeyDate, train?.trainNo, train?.source, train?.destination, selectedClassCode, quota]);

  return (
    <div className="mt-3 min-w-0 space-y-2">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] font-black uppercase text-slate-400">Selected-class live check</span>
        <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-black text-slate-500 dark:border-white/10 dark:bg-white/6 dark:text-slate-300">
          Exact train/date/{quota || "GN"}
        </span>
      </div>
      {classCodes.length === 0 && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-500 dark:border-white/10 dark:bg-white/6 dark:text-slate-300">
          Provider did not return verified classes for this train/date.
        </div>
      )}
      {classCodes.map((classCode) => {
          const status = loadingClass === classCode ? "Fetching selected-date availability..." : classAvailabilityStatus(displayTrain, classCode);
          const fare = classFareText(displayTrain, classCode);
          const selected = selectedClassCode === classCode;
          const sourceLabel = loadingClass === classCode ? "Provider check" : errors[classCode] ? "Check seats" : classDataSourceLabel(displayTrain, classCode);
          const needsFetch = loadingClass !== classCode && needsLiveQuotaRefresh(displayTrain, classCode);
          const routeCopy = `${liveSourceStation(train) || "--"} → ${liveDestinationStation(train) || "--"} · ${journeyDate || "--"} · ${quota || "GN"}`;
          return (
            <button
              key={`${train?.trainNo || "train"}-${train?.source || "src"}-${classCode}`}
              type="button"
              title={quotes[classCode]?.warning || errors[classCode] || ""}
              onClick={() => void fetchClassQuote(classCode, false)}
              className={`w-full min-w-0 rounded-xl border p-2.5 text-left transition hover:border-cyan-300 ${
                selected ? "border-cyan-300 bg-cyan-50/70 dark:bg-cyan-300/10" : "border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/6"
              }`}
            >
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="shrink-0 rounded-md bg-slate-950 px-2.5 py-1 text-xs font-black text-white dark:bg-white dark:text-slate-950">{classCode}</span>
                {needsFetch ? (
                  <>
                    {fare && !/fare unavailable/i.test(fare)
                      ? <span className={`max-w-full truncate rounded-md border px-2.5 py-1 text-xs font-black ${fareTone(fare)}`}>{fare}</span>
                      : <span className="max-w-full truncate rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-black text-slate-500 dark:border-white/10 dark:bg-white/6 dark:text-slate-300">Tap to check fare</span>
                    }
                    <span className="min-w-0 max-w-full truncate rounded-md border border-cyan-300 bg-cyan-50 px-2.5 py-1 text-xs font-black text-cyan-800 dark:bg-cyan-300/12 dark:text-cyan-100">
                      {loadingClass === classCode ? "Fetching live..." : `Check seats ${classCode}`}
                    </span>
                  </>
                ) : (
                  <>
                    {fare && !/fare unavailable/i.test(fare)
                      ? <span className={`max-w-full truncate rounded-md border px-2.5 py-1 text-xs font-black ${fareTone(fare)}`}>{fare}</span>
                      : <span className="max-w-full truncate rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-black text-slate-500 dark:border-white/10 dark:bg-white/6 dark:text-slate-300">Tap to check fare</span>
                    }
                    <span className={`max-w-full truncate rounded-md border px-2.5 py-1 text-xs font-black ${availabilityTone(status)}`}>{status}</span>
                  </>
                )}
                <span className="max-w-full truncate rounded-md bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase text-slate-500 dark:bg-white/8 dark:text-slate-300">
                  {sourceLabel}
                </span>
              </div>
              <div className="mt-2 truncate text-[11px] font-semibold leading-5 text-slate-500 dark:text-slate-400">
                Exact request: {routeCopy}
              </div>
              {errors[classCode] && (
                <div className="mt-2 rounded-md border border-amber-300/40 bg-amber-50 px-2.5 py-1.5 text-[11px] font-bold text-amber-900 dark:bg-amber-300/10 dark:text-amber-100">
                  {errors[classCode]}
                </div>
              )}
            </button>
          );
        })}
    </div>
  );
}

export function ClassSnapshotPanel({ selection, onClose }: { selection: ClassPanelSelection; onClose: () => void }) {
  const availability = classAvailabilityStatus(selection.train, selection.classCode);
  const fare = classFareText(selection.train, selection.classCode);
  const source = classDataSourceLabel(selection.train, selection.classCode);
  const trace = selection.train?.classAvailability?.[selection.classCode]?.[0]?.providerTrace;
  const scopedTrain = { ...selection.train, classType: selection.classCode, availability, fare };
  const trustMeta = trustMetaFromTrain(selection.train);
  const actualSource = actualLegSourceStation(selection.train) || selection.train.source;
  const actualDestination = actualLegDestinationStation(selection.train) || selection.train.destination;
  return (
    <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#0f172a]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <DataBadge type={badgeTypeFromSource(trustMeta.source)} label={selection.label} />
          <h4 className="mt-3 text-2xl font-black">{selection.classCode} fare, quota and berth layout</h4>
          <p className="mt-1 text-sm font-bold text-slate-500 dark:text-slate-400">{trainNumberName(selection.train)} · {fullStationLabelFromCode(actualSource, false)} to {fullStationLabelFromCode(actualDestination, false)}</p>
          <TrustSummary meta={trustMeta} />
        </div>
        <button type="button" onClick={onClose} aria-label="Close class details" className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 transition hover:border-rose-300 hover:text-rose-600 dark:border-white/10 dark:bg-white/8 dark:text-slate-100">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
	        <div className={`rounded-3xl border p-4 ${fareTone(fare)}`}>
          <div className="text-[11px] font-black uppercase text-emerald-700 dark:text-emerald-200">Rate</div>
          <div className="mt-1 text-2xl font-black">{fare}</div>
        </div>
        <div className={`rounded-3xl border p-4 ${availabilityCardTone(availability)}`}>
          <div className="text-[11px] font-black uppercase opacity-75">Availability</div>
          <div className="mt-1 text-2xl font-black">{availability}</div>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white/80 p-4 dark:border-white/10 dark:bg-black/20">
          <div className="text-[11px] font-black uppercase text-slate-400">Source</div>
          <div className="mt-1 text-2xl font-black">{source}</div>
        </div>
      </div>
      <div className="mt-4">
        <FareBreakdownPanel train={selection.train} classCode={selection.classCode} fare={fare} />
      </div>
      <div className="mt-4 rounded-3xl border border-amber-300/35 bg-amber-50 px-4 py-3 text-sm font-black leading-6 text-amber-900 dark:bg-amber-300/10 dark:text-amber-100">
        Berth layout is a coach-layout explorer only. It does not show actual booked or occupied berths; final allocation happens during booking/charting.
      </div>
	      <div className="mt-4">
	        <CoachExplorer initialClass={selection.classCode} embedded train={scopedTrain} />
	      </div>
	      {debugModeEnabled() && trace && <ProviderDebugPanel trace={trace} />}
	    </div>
	  );
}

export function SplitJourneyCard({
  split,
  journeyDate,
  requestedClass = "",
  quota = "GN",
  autoFetchLive = false,
  rank,
}: {
  split: any;
  journeyDate: string;
  requestedClass?: string;
  quota?: string;
  autoFetchLive?: boolean;
  rank?: number;
}) {
  const leg1 = split.leg1 || {};
  const leg2 = split.leg2 || {};
  const [routeTrain, setRouteTrain] = useState<any | null>(null);
  const [classPanel, setClassPanel] = useState<ClassPanelSelection | null>(null);

  const [mapOpen1, setMapOpen1] = useState(false);
  const [mapRoute1, setMapRoute1] = useState<any[]>(leg1.route || []);
  const [mapRouteLoading1, setMapRouteLoading1] = useState(false);

  const [mapOpen2, setMapOpen2] = useState(false);
  const [mapRoute2, setMapRoute2] = useState<any[]>(leg2.route || []);
  const [mapRouteLoading2, setMapRouteLoading2] = useState(false);

  useEffect(() => {
    if (!mapOpen1 || mapRoute1.length > 0) return;
    let active = true;
    setMapRouteLoading1(true);
    postJson<any>("/api/train-search", { query: leg1.trainNo })
      .then((data) => {
        if (!active) return;
        setMapRoute1(data.trains?.[0]?.route || []);
        setMapRouteLoading1(false);
      })
      .catch(() => {
        if (!active) return;
        setMapRouteLoading1(false);
      });
    return () => { active = false; };
  }, [mapOpen1, leg1.trainNo, mapRoute1.length]);

  useEffect(() => {
    if (!mapOpen2 || mapRoute2.length > 0) return;
    let active = true;
    setMapRouteLoading2(true);
    postJson<any>("/api/train-search", { query: leg2.trainNo })
      .then((data) => {
        if (!active) return;
        setMapRoute2(data.trains?.[0]?.route || []);
        setMapRouteLoading2(false);
      })
      .catch(() => {
        if (!active) return;
        setMapRouteLoading2(false);
      });
    return () => { active = false; };
  }, [mapOpen2, leg2.trainNo, mapRoute2.length]);

  const mapStations1 = useMemo(() => {
    const actSrc = actualLegSourceStation(leg1) || leg1.source;
    const actDst = actualLegDestinationStation(leg1) || leg1.destination;
    if (mapRoute1 && mapRoute1.length > 0) {
      return mapRoute1.map((stop: any) => ({
        code: stop.code || stop.stationCode,
        name: stop.name || stop.stationName || stop.code
      }));
    }
    return [
      { code: actSrc, name: fullStationLabelFromCode(actSrc) },
      { code: actDst, name: fullStationLabelFromCode(actDst) }
    ];
  }, [mapRoute1, leg1]);

  const mapStations2 = useMemo(() => {
    const actSrc = actualLegSourceStation(leg2) || leg2.source;
    const actDst = actualLegDestinationStation(leg2) || leg2.destination;
    if (mapRoute2 && mapRoute2.length > 0) {
      return mapRoute2.map((stop: any) => ({
        code: stop.code || stop.stationCode,
        name: stop.name || stop.stationName || stop.code
      }));
    }
    return [
      { code: actSrc, name: fullStationLabelFromCode(actSrc) },
      { code: actDst, name: fullStationLabelFromCode(actDst) }
    ];
  }, [mapRoute2, leg2]);
  const scopedClass = String(requestedClass || "").toUpperCase().trim();
  const totalDuration = splitTotalDuration(split);
  const hubCode = split.hubStation || actualLegDestinationStation(leg1) || actualLegSourceStation(leg2) || "";
  const trustMeta = trustMetaFromTrain(leg1, { splitRoute: true });
  const legTrust = legDataTrustCopy([leg1, leg2], trustMeta);
  const routeTitle = `${stationCompactLabel(actualLegSourceStation(leg1) || leg1.source)} → ${stationCompactLabel(hubCode)} → ${stationCompactLabel(actualLegDestinationStation(leg2) || leg2.destination)}`;
  const totalFareVerified = [leg1, leg2].every((leg) => String(leg?.fareStatus || "").toUpperCase() === "VERIFIED");
  const leg1Class = scopedClass && scopedClass !== "ANY" ? scopedClass : primaryClassCode(leg1);
  const leg2Class = scopedClass && scopedClass !== "ANY" ? scopedClass : primaryClassCode(leg2);
  const totalFareText = fareToNumber(split.totalFare) && totalFareVerified
    ? formatFare(split.totalFare)
    : "Fare unavailable";

  function selectedClassForLeg(leg: any) {
    if (classPanel && classPanel.train?.trainNo === leg.trainNo && classPanel.train?.source === leg.source && classPanel.train?.destination === leg.destination) {
      return classPanel.classCode;
    }
    return scopedClass && scopedClass !== "ANY" ? scopedClass : primaryClassCode(leg);
  }

  function legFareText(leg: any, fallbackFare: unknown) {
    if (trainFareAmount(leg) > 0) return liveFareText(leg);
    if (fareToNumber(fallbackFare) > 0 && String(leg?.fareStatus || "").toUpperCase() === "VERIFIED") return formatFare(fallbackFare);
    return liveFareText(leg);
  }

  function selectedClassCopy(leg: any, classCode: string) {
    if (!classCode || classCode === "ANY" || selectedClassCanBeChecked(leg, classCode)) return "";
    return `${classCode} was not returned for this leg; the route is still shown because the train and timing are valid.`;
  }

  function isSelectedRouteLeg(leg: any) {
    return Boolean(
      routeTrain &&
      routeTrain.trainNo === leg.trainNo &&
      routeTrain.source === leg.source &&
      routeTrain.destination === leg.destination &&
      trainJourneyDate(routeTrain, journeyDate) === trainJourneyDate(leg, journeyDate)
    );
  }

	  function renderLeg(
	    leg: any,
	    label: string,
	    fallbackFare: unknown,
	    mapOpen: boolean,
	    setMapOpen: (open: boolean) => void,
	    mapRoute: any[],
	    mapRouteLoading: boolean,
	    mapStations: any[]
	  ) {
	    const selectedClassCode = selectedClassForLeg(leg);
	    const legJourneyDate = trainJourneyDate(leg, journeyDate);
	    const fareText = legFareText(leg, fallbackFare);
		    const seatText = compactSeatText(leg);
		    const chanceCopy = confirmationChanceLabel(seatText, leg);
		    const classCopy = selectedClassCopy(leg, selectedClassCode);
	    const actualSource = actualLegSourceStation(leg) || leg.source || "--";
	    const actualDestination = actualLegDestinationStation(leg) || leg.destination || "--";
	    const requestedSource = requestedSourceStation(leg);
	    const requestedDestination = requestedDestinationStation(leg);
	    const alternateTerminal = legUsesAlternateTerminal(leg);
	    const terminalDistanceSummary = nearbyTerminalDistanceSummary(actualSource, requestedSource, actualDestination, requestedDestination);
	    const routeCopy = `${actualSource} → ${actualDestination} · ${legJourneyDate || "--"} · ${quota || "GN"}`;
	    const routeOpen = isSelectedRouteLeg(leg);
    return (
      <div className="px-4 py-4">
        <div className="grid gap-4 2xl:grid-cols-[minmax(220px,0.85fr)_minmax(360px,1fr)_minmax(420px,1.1fr)_auto] 2xl:items-center">
          <div className="min-w-0">
            <div className="text-[11px] font-black uppercase text-slate-400">{label}</div>
            <h4 className="mt-1 truncate text-xl font-black">{trainNumberName(leg, "Train leg")}</h4>
            <p className="mt-1 text-xs font-bold leading-5 text-slate-500 dark:text-slate-400">
              Exact request: {routeCopy}
            </p>
            {alternateTerminal && (
              <p className="mt-2 rounded-md border border-amber-300/40 bg-amber-50 px-2.5 py-1.5 text-[11px] font-black text-amber-900 dark:bg-amber-300/10 dark:text-amber-100">
                Search leg was {requestedSource || "--"} → {requestedDestination || "--"}; provider-backed live check is {actualSource} → {actualDestination}.
                {terminalDistanceSummary ? ` ${terminalDistanceSummary}` : ""}
              </p>
            )}
          </div>
          <div className="min-w-0 rounded-xl bg-slate-50 p-3 dark:bg-black/20">
	            <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
            <div className="min-w-0">
              <div className="truncate text-xs font-black text-slate-500 dark:text-slate-400" title={stationCompactLabel(actualSource)}>{stationCompactLabel(actualSource)}</div>
              <div className="mt-1 whitespace-nowrap text-2xl font-black">{timeAmPm(leg.departureTime)}</div>
            </div>
            <div className="min-w-16 text-center">
              <div className="h-px w-14 bg-slate-300 dark:bg-white/20" />
              <div className="mt-1 text-[10px] font-black text-slate-400">{leg.duration || "--"}</div>
            </div>
            <div className="min-w-0 text-right">
              <div className="truncate text-xs font-black text-slate-500 dark:text-slate-400" title={stationCompactLabel(actualDestination)}>{stationCompactLabel(actualDestination)}</div>
              <div className="mt-1 whitespace-nowrap text-2xl font-black">{timeAmPm(leg.arrivalTime)}</div>
            </div>
	            </div>
	            <ExpectedPlatformPair
	              trainNo={leg.trainNo}
	              source={actualSource}
	              destination={actualDestination}
	              initialRoute={leg.route}
	            />
              {renderAvailabilityRow(leg)}

	          </div>
	          <div className="min-w-0">
	            <div className="flex flex-wrap gap-2">
	              <span className={`rounded-md border px-2.5 py-1 text-xs font-black ${fareTone(fareText)}`}>{compactFareText(fareText) || "Tap to check fare"}</span>
	              <span className={`rounded-md border px-2.5 py-1 text-xs font-black ${availabilityTone(seatText)}`}>{seatText}</span>
	              {chanceCopy && (
	                <span className={`rounded-md border px-2.5 py-1 text-xs font-black ${confirmationChanceTone(seatText, leg)}`}>
	                  {chanceCopy}
	                </span>
	              )}
	              {selectedClassCode && (
                <span className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-black text-slate-600 dark:border-white/10 dark:bg-white/8 dark:text-slate-300">
                  {selectedClassCode}
                </span>
              )}
            </div>
            {classCopy && (
              <div className="mt-2 rounded-md border border-amber-300/35 bg-amber-50 px-2.5 py-1.5 text-[11px] font-bold text-amber-900 dark:bg-amber-300/10 dark:text-amber-100">
                {classCopy}
              </div>
            )}
	            <ClassRateStrip
	              train={leg}
	              journeyDate={legJourneyDate}
	              selectedClass={selectedClassCode}
              quota={quota}
              autoFetchSelected={autoFetchLive}
              onSelect={(selection) => setClassPanel({ ...selection, label: `${label} · ${selection.classCode}` })}
            />
          </div>
          <div className="flex flex-wrap justify-start gap-2 lg:justify-end">
            <button type="button" onClick={() => setRouteTrain(routeOpen ? null : leg)} className="rounded-md border border-cyan-300 bg-cyan-50 px-3 py-2 text-[11px] font-black text-cyan-800 transition hover:bg-cyan-100 dark:bg-cyan-300/12 dark:text-cyan-100">
              {routeOpen ? "Hide route" : "Route"}
            </button>
            <button type="button" onClick={() => setClassPanel({ train: leg, classCode: selectedClassCode || primaryClassCode(leg), label: `${label} · ${selectedClassCode || primaryClassCode(leg)}` })} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-black text-slate-700 transition hover:border-cyan-300 dark:border-white/10 dark:bg-white/8 dark:text-slate-200">
              Coach layout
            </button>
          </div>
        </div>
        {routeOpen && (
          <div className="mt-4 rounded-2xl border border-cyan-300/30 bg-cyan-50/70 p-3 dark:border-cyan-300/20 dark:bg-cyan-300/10">
            <div className="mb-3 flex items-center justify-between gap-3 px-1">
              <div className="text-xs font-black uppercase text-cyan-800 dark:text-cyan-100">{label} route</div>
              <button type="button" onClick={() => setRouteTrain(null)} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-black text-slate-700 dark:border-white/10 dark:bg-white/8 dark:text-slate-100">Hide</button>
            </div>
            <InlineRoutePanel trainNo={leg.trainNo} train={leg} />
          </div>
        )}
      </div>
    );
  }

  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#081321]">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-4 dark:border-white/10 dark:bg-white/[0.03]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {rank != null && (
              <span className="inline-flex items-center justify-center rounded-full bg-cyan-600 px-2.5 py-0.5 text-[11px] font-black text-white tabular-nums shadow-sm">
                #{rank}
              </span>
            )}
            <DataBadge type="SPLIT ROUTE" label="Split journey" />
            <DataBadge type={legTrust.badgeType} label={legTrust.badgeLabel} />
          </div>
            <h3 className="mt-3 text-xl font-black leading-tight">{routeTitle}</h3>
            <p className="mt-2 max-w-3xl text-xs font-semibold leading-5 text-slate-500 dark:text-slate-400">{legTrust.text}</p>
          </div>
          <div className="grid min-w-[260px] grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-white px-3 py-2 dark:bg-black/20">
              <div className="text-[10px] font-black uppercase text-slate-400">Total</div>
              <div className="mt-1 text-sm font-black">{totalDuration}</div>
            </div>
            <div className="rounded-xl bg-white px-3 py-2 dark:bg-black/20">
              <div className="text-[10px] font-black uppercase text-slate-400">Layover</div>
              <div className="mt-1 text-sm font-black">{split.layoverDuration || "--"}</div>
            </div>
            <div className={`rounded-xl border px-3 py-2 ${fareTone(totalFareText)}`}>
              <div className="text-[10px] font-black uppercase opacity-70">Total cost</div>
              <div className="mt-1 text-sm font-black">{totalFareText}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="divide-y divide-slate-200 dark:divide-white/10">
        {renderLeg(leg1, "Leg 1", split.leg1Fare, mapOpen1, setMapOpen1, mapRoute1, mapRouteLoading1, mapStations1)}
        <div className="flex flex-wrap items-center gap-2 bg-slate-50 px-4 py-3 text-xs font-bold text-slate-600 dark:bg-white/[0.025] dark:text-slate-300">
          <span className="rounded-md border border-cyan-300/35 bg-cyan-50 px-2.5 py-1 font-black text-cyan-900 dark:bg-cyan-300/10 dark:text-cyan-100">
            Layover at {stationCompactLabel(hubCode)}: {split.layoverDuration || "--"}
          </span>
          <span className={`rounded-md border px-2.5 py-1 font-black ${fareTone(totalFareText)}`}>
            Total cost: {totalFareText}
          </span>
          {(compactFareText(legFareText(leg1, split.leg1Fare)) || compactFareText(legFareText(leg2, split.leg2Fare))) && (
            <span className="rounded-md border border-slate-200 bg-white px-2.5 py-1 font-black text-slate-600 dark:border-white/10 dark:bg-white/8 dark:text-slate-200">
              Leg fares: {compactFareText(legFareText(leg1, split.leg1Fare)) || "—"} + {compactFareText(legFareText(leg2, split.leg2Fare)) || "—"}
            </span>
          )}
          <span className="rounded-md border border-amber-300/35 bg-amber-50 px-2.5 py-1 font-black text-amber-900 dark:bg-amber-300/10 dark:text-amber-100">
            Transfer buffer shown; platform numbers are assigned by railway operations.
          </span>
        </div>
        {renderLeg(leg2, "Leg 2", split.leg2Fare, mapOpen2, setMapOpen2, mapRoute2, mapRouteLoading2, mapStations2)}
      </div>
      {classPanel && <ClassSnapshotPanel selection={classPanel} onClose={() => setClassPanel(null)} />}
    </article>
  );
}

export function MultiSplitJourneyCard({
  split,
  journeyDate,
  requestedClass = "",
  quota = "GN",
  autoFetchLive = false,
}: {
  split: any;
  journeyDate: string;
  requestedClass?: string;
  quota?: string;
  autoFetchLive?: boolean;
}) {
  const legs = split.legs || [];
  const [routeTrain, setRouteTrain] = useState<any | null>(null);
  const [classPanel, setClassPanel] = useState<ClassPanelSelection | null>(null);
  const scopedClass = String(requestedClass || "").toUpperCase().trim();
  const path = legs.length
    ? [legs[0]?.source, ...split.interchangeStations, legs[legs.length - 1]?.destination].filter(Boolean)
    : split.interchangeStations || [];
  const trustMeta = trustMetaFromTrain(legs[0] || {}, { splitRoute: true });
  const legTrust = legDataTrustCopy(legs, trustMeta);
  const totalFareVerified = legs.length > 0 && legs.every((leg: any) => String(leg?.fareStatus || "").toUpperCase() === "VERIFIED");
  const totalFareText = fareToNumber(split.totalFare) && totalFareVerified
    ? formatFare(split.totalFare)
    : "Fare unavailable";

  function isSelectedRouteLeg(leg: any) {
    return Boolean(
      routeTrain &&
      routeTrain.trainNo === leg.trainNo &&
      routeTrain.source === leg.source &&
      routeTrain.destination === leg.destination &&
      trainJourneyDate(routeTrain, journeyDate) === trainJourneyDate(leg, journeyDate)
    );
  }

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-cyan-300/15 dark:bg-[#071321]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap gap-2">
            <DataBadge type="SPLIT ROUTE" label="Multi-split journey" />
            <DataBadge type={legTrust.badgeType} label={legTrust.badgeLabel} />
          </div>
          <p className="mt-3 text-[11px] font-semibold leading-5 text-slate-500 dark:text-slate-400">{legTrust.text}</p>
          <h3 className="mt-3 text-2xl font-black">
            {path.map((code: string) => fullStationLabelFromCode(code, false)).join(" → ")}
          </h3>
          <p className="mt-2 text-sm font-bold text-slate-500 dark:text-slate-400">
            Uses smaller-station gateway junctions first, then long-distance provider-backed legs.
          </p>
        </div>
	      <div className="rounded-2xl bg-slate-50 p-4 text-sm font-black dark:bg-black/20">
	        <div className="text-[11px] uppercase text-slate-400">Total</div>
		        <div className="text-xl">{totalFareText} · {split.totalDuration || "--"}</div>
	        <div className="mt-1 text-[11px] font-black text-slate-400">Ranked by provider-returned timing, fare and availability</div>
	      </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <span className={`rounded-full border px-3 py-2 text-xs font-black ${fareTone(totalFareText)}`}>
          Total cost: {totalFareText}
        </span>
        {(split.layovers || []).map((layover: any) => (
          <span key={layover.station} className="rounded-full bg-violet-100 px-3 py-2 text-xs font-black text-violet-800 dark:bg-violet-300/12 dark:text-violet-100">
            {fullStationLabelFromCode(layover.station, false)} layover: {layover.duration}
          </span>
        ))}
        <span className="rounded-full bg-amber-100 px-3 py-2 text-xs font-black text-amber-900 dark:bg-amber-300/12 dark:text-amber-100">
          Platforms shown only if returned by provider
        </span>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-3">
	        {legs.map((leg: any, index: number) => {
	          const routeOpen = isSelectedRouteLeg(leg);
	          return (
	          <div key={`${leg.trainNo}-${trainJourneyDate(leg, journeyDate)}-${index}`} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm text-slate-500">Journey {index + 1}</div>
                <h4 className="mt-1 text-lg font-black">{trainNumberName(leg, `Leg ${index + 1} train`)}</h4>
                <div className="mt-1 text-xs font-black text-slate-400">{fullStationLabelFromCode(leg.source, false)} → {fullStationLabelFromCode(leg.destination, false)}</div>
              </div>
		              <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-black ${fareTone(liveFareText(leg))}`}>Fare: {compactFareText(liveFareText(leg))}</span>
            </div>
            <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm font-black dark:bg-black/20">
              {leg.departureTime || "--:--"} → {leg.arrivalTime || "--:--"} · {leg.duration || "--"}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
			              <span className={`rounded-full border px-2.5 py-1 text-xs font-black ${availabilityTone(leg.availability)}`}>Seats: {compactSeatText(leg)}</span>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-700 dark:bg-white/10 dark:text-slate-200">{leg.classType || "3A"}</span>
            </div>
	            <ClassRateStrip
	              train={leg}
	              journeyDate={trainJourneyDate(leg, journeyDate)}
              selectedClass={classPanel && classPanel.train?.trainNo === leg.trainNo ? classPanel.classCode : scopedClass && scopedClass !== "ANY" ? scopedClass : undefined}
              quota={quota}
              autoFetchSelected={autoFetchLive}
              onSelect={(selection) => setClassPanel({ ...selection, label: `Journey ${index + 1} · ${selection.classCode}` })}
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => setRouteTrain(routeOpen ? null : leg)} className="rounded-full border border-cyan-300 bg-cyan-50 px-3 py-1.5 text-[11px] font-black text-cyan-800 dark:bg-cyan-300/12 dark:text-cyan-100">{routeOpen ? "Hide route" : "Route"}</button>
              <button type="button" onClick={() => setClassPanel({ train: leg, classCode: primaryClassCode(leg), label: `Journey ${index + 1} · ${primaryClassCode(leg)}` })} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-black text-slate-700 dark:border-white/10 dark:bg-white/8 dark:text-slate-200">Coach layout</button>
            </div>
            {routeOpen && (
              <div className="mt-4 rounded-2xl border border-cyan-300/30 bg-cyan-50/70 p-3 dark:border-cyan-300/20 dark:bg-cyan-300/10">
                <div className="mb-3 flex items-center justify-between gap-3 px-1">
                  <div className="text-xs font-black uppercase text-cyan-800 dark:text-cyan-100">Journey {index + 1} route</div>
                  <button type="button" onClick={() => setRouteTrain(null)} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-black text-slate-700 dark:border-white/10 dark:bg-white/8 dark:text-slate-100">Hide</button>
                </div>
                <InlineRoutePanel trainNo={leg.trainNo} train={leg} />
              </div>
            )}
          </div>
        );
        })}
      </div>

      {classPanel && <ClassSnapshotPanel selection={classPanel} onClose={() => setClassPanel(null)} />}
    </article>
  );
}

