import { findMultiSplitRoutes, findSmartRoutes, enrichWithLiveAvailability } from '@/services/trainService';
import { buildTrustMeta } from '@/lib/confidence';
import { apiFailure, apiSuccess, validationFailure } from '@/lib/api-response';
import { getClientIp, isRateLimited } from '@/lib/rate-limiter';

// Verifying live fare + seat availability for ~30 split-journey candidates means
// dozens of provider calls inside one request. The previous implicit default
// (10s on most Vercel plans) was getting hit mid-enrichment, which is the main
// reason split search used to come back sparse or empty. 60s gives the
// enrichment budget below (see enrichDeadlineMs) real room to work with.
export const maxDuration = 60;

function localRecommendation(directTrains: any[], splitRoutes: any[], multiSplitRoutes: any[] = [], budget?: string) {
  const budgetNote = budget ? ` Budget filter requested: ${budget}.` : "";
  return `Provider returned ${directTrains?.length || 0} direct train(s), ${splitRoutes?.length || 0} two-leg split option(s), and ${multiSplitRoutes?.length || 0} multi-leg split option(s).${budgetNote}`;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function POST(request: Request) {
  const apiStartTime = Date.now();
  const requestId = `ss_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const ip = getClientIp(request);
  if (isRateLimited(`ss_${ip}`, 15, 60 * 1000)) {
    return apiFailure({
      error: "Too many requests. Please try again later.",
      requestId,
      status: 429,
      provider: "Rate Limiter",
    });
  }
  try {
    const body = await request.json();
    const { source, destination, date, classType = "Any", directTrains = [], budget, preferredHub = "", debug = false } = body;

    if (!source || !destination || !date) {
      return validationFailure('Missing required parameters', requestId);
    }

    const coverageMode = "quick" as const;
    const plannerOptions = {
      debug: Boolean(debug),
      fetchLive: false,
      liveLookupLimit: 0,
      coverageMode,
      exactStationOnly: false,
      providerPairLimit: 8,
      maxSplitHubs: 200,
      maxSplitLegOptions: 40,
      maxSplitCandidates: 3000,
      maxSplitResults: 50,
      maxMultiPlans: 0,
      maxMultiLegOptions: 0,
      maxMultiCandidates: 0,
      maxMultiResults: 0,
      plannerLegTimeoutMs: 5000,
      globalTimeoutMs: 9000,
    } as const;

    const splitRoutes = await findSmartRoutes(source, destination, date, classType, directTrains, preferredHub, plannerOptions);
    const multiSplitRoutes = splitRoutes.length >= 20
      ? []
      : await withTimeout(
          findMultiSplitRoutes(source, destination, date, classType, preferredHub, {
            ...plannerOptions,
            maxMultiPlans: 10,
            maxMultiLegOptions: 4,
            maxMultiCandidates: 80,
            maxMultiResults: 16,
          }),
          3000,
          []
        );

    const isProviderBookingBlocked = (value: unknown) => {
      return /not available for booking|not bookable|train not on scheduled date|not scheduled|not running|class does not exist|class not available|class not returned|does not exist in this train|cancelled/i.test(String(value || ""));
    };

    const isLegVerifiedAndBookable = (leg: any) => {
      if (!leg) return false;
      const availabilityStatus = leg.availabilityStatus || 'NOT_CHECKED';
      const fareStatus = leg.fareStatus || 'NOT_CHECKED';
      
      const fareStr = String(leg.fare || '');
      const fare = Number(fareStr.replace(/[^\d.]/g, '')) || 0;

      const availText = String(leg.availability || "").toUpperCase();
      const reason = String(leg.lookupReason || "").toUpperCase();

      if (isProviderBookingBlocked(availText) || isProviderBookingBlocked(reason)) {
        return false;
      }

      const visibleSeatStatus = /\bAVAILABLE\b|\bAVL\b|RAC|WL|WAIT|REGRET|CNF|CONFIRM/.test(availText) &&
        !/NOT AVAILABLE|TRAIN NOT ON SCHEDULED DATE|NOT RUNNING|CLASS NOT AVAILABLE|CHECK SEATS|TAP TO CHECK|UNAVAILABLE/.test(availText);

      return availabilityStatus === 'VERIFIED' && fareStatus === 'VERIFIED' && fare > 0 && visibleSeatStatus;
    };

    const cleanTrain = (no: string) => String(no || '').trim().replace(/\D/g, '');

    const getDiverseSplitRoutes = (routes: any[], limit = 30) => {
      const selected: any[] = [];
      const trainCounts = new Map<string, number>();
      const hubCounts = new Map<string, number>();
      const seenCombos = new Set<string>();

      let remaining = [...routes];

      while (selected.length < limit && remaining.length > 0) {
        const scoredRemaining = remaining.map((r) => {
          const t1 = cleanTrain(r.leg1?.trainNo);
          const t2 = cleanTrain(r.leg2?.trainNo);
          const t1Rep = trainCounts.get(t1) || 0;
          const t2Rep = trainCounts.get(t2) || 0;
          const penalty = (t1Rep + t2Rep) * 20;
          return { route: r, score: (r.score || 0) - penalty };
        });

        scoredRemaining.sort((a, b) => b.score - a.score);
        const bestItem = scoredRemaining[0];
        const r = bestItem.route;

        remaining = remaining.filter((x) => x !== r);

        const t1 = cleanTrain(r.leg1?.trainNo);
        const t2 = cleanTrain(r.leg2?.trainNo);
        if (!t1 || !t2) continue;

        const comboKey1 = `${t1}_${t2}`;
        const comboKey2 = `${t2}_${t1}`;
        if (seenCombos.has(comboKey1) || seenCombos.has(comboKey2)) {
          continue;
        }

        const hub = r.hubStation;
        const hubCount = hubCounts.get(hub) || 0;
        if (hubCount >= 4) {
          continue;
        }

        selected.push(r);
        seenCombos.add(comboKey1);
        seenCombos.add(comboKey2);
        hubCounts.set(hub, hubCount + 1);
        trainCounts.set(t1, (trainCounts.get(t1) || 0) + 1);
        trainCounts.set(t2, (trainCounts.get(t2) || 0) + 1);
      }

      return selected;
    };

    const diverseRoutes = getDiverseSplitRoutes(splitRoutes, 30);

    // Attempt live enrichment on top candidates within time budget.
    // We do NOT discard routes that fail enrichment — they remain as fallbacks.
    // Enrich ALL routes in true parallel — no serial bail-out guard that starves later routes.
    // Every route starts simultaneously; the whole batch races against a shared deadline.
    //
    // Try to verify all 30 candidates, not just the first 20 — with maxDuration=60 and a
    // higher provider concurrency (see irctcService.ts) there's now real room to do this,
    // and the ranking step below means a slow/unverified candidate no longer means an
    // empty slot — it just ranks below the candidates that did verify in time.
    const LIVE_TOP_SPLIT = Math.min(diverseRoutes.length, 30);
    if (LIVE_TOP_SPLIT > 0) {
      const enrichDeadlineMs = 38000; // total budget from API start, well inside maxDuration=60
      const perRouteTimeoutMs = 9000; // per-route cap so one slow route can't block others

      const enrichRoute = async (route: any) => {
        const legDate = route.leg1Date || route.leg2Date || date;
        try {
          const [leg1Enriched, leg2Enriched] = await Promise.all([
            withTimeout(
              enrichWithLiveAvailability(route.leg1, legDate, classType, { fetchLive: true, fetchAllClasses: false, debug: false }),
              perRouteTimeoutMs,
              route.leg1
            ),
            withTimeout(
              enrichWithLiveAvailability(route.leg2, legDate, classType, { fetchLive: true, fetchAllClasses: false, debug: false }),
              perRouteTimeoutMs,
              route.leg2
            ),
          ]);
          if (leg1Enriched?.trainNo && leg2Enriched?.trainNo) {
            route.leg1 = leg1Enriched;
            route.leg2 = leg2Enriched;
            route._liveEnriched = true;
          }
        } catch (e) {
          console.warn(`[search-split] Enrichment failed`, e);
        }
      };

      const timeRemaining = Math.max(4000, enrichDeadlineMs - (Date.now() - apiStartTime));
      await Promise.race([
        Promise.all(diverseRoutes.slice(0, LIVE_TOP_SPLIT).map(enrichRoute)),
        new Promise((resolve) => setTimeout(resolve, timeRemaining))
      ]);
    }

    // A leg is definitively rejected when IRCTC explicitly said the class/date is invalid.
    // These are NOT transient errors — retrying or showing them as "unverified" is pointless.
    const FIRM_REJECTION_RE =
      /not available for booking|not bookable|train not on scheduled date|not scheduled|not running|class does not exist|class not available|class not returned|does not exist in this train|cancelled|no quota available/i;

    const isLegDefinitelyRejected = (leg: any) => {
      if (!leg) return false;
      const availStatus = leg.availabilityStatus || 'NOT_CHECKED';
      if (availStatus === 'VERIFIED') return false; // real seat data → definitely NOT rejected
      const reason = String(leg.lookupReason || leg.availability || leg.availabilityText || '');
      return FIRM_REJECTION_RE.test(reason);
    };

    const isNotBookable = (leg: any) => {
      if (!leg) return false;
      const reason = String(leg.lookupReason || leg.availability || leg.availabilityText || leg.status || '').toLowerCase();
      return reason.includes("not bookable") || reason.includes("not available for booking") || reason.includes("train not on scheduled date");
    };

    const parseFareVal = (fareStrOrNum: any) => {
      const fareStr = String(fareStrOrNum || '');
      return Number(fareStr.replace(/[^\d.]/g, '')) || 0;
    };

    // Hard-exclude only what's factually wrong — a leg that IRCTC explicitly rejected,
    // or a card with literally no fare on either leg. These aren't "couldn't verify in
    // time" situations, they're "this combination cannot be booked" situations.
    const candidatePool = diverseRoutes.filter(route => {
      if (isNotBookable(route.leg1) || isNotBookable(route.leg2)) {
        return false;
      }
      if (isLegDefinitelyRejected(route.leg1) || isLegDefinitelyRejected(route.leg2)) {
        return false;
      }
      const f1 = parseFareVal(route.leg1.fare);
      const f2 = parseFareVal(route.leg2.fare);
      if (f1 === 0 && f2 === 0) {
        return false;
      }
      return true;
    });

    // Rank by real data quality rather than just slicing diversity order: routes where
    // both legs came back fully verified (live fare + visible seats) rank highest, routes
    // with only one leg verified rank next, and anything still unverified after the
    // enrichment window keeps its pre-enrichment estimate score as a tiebreaker. This is
    // what makes "best 15 of 30" actually mean best — previously the first 15 in diversity
    // order were shown even when a worse-but-verified route sat further down the list, and
    // a single slow leg could knock an otherwise-good card out of the results entirely.
    const verificationBoost = (route: any) => {
      const leg1Ok = isLegVerifiedAndBookable(route.leg1);
      const leg2Ok = isLegVerifiedAndBookable(route.leg2);
      if (leg1Ok && leg2Ok) return 200;
      if (leg1Ok || leg2Ok) return 90;
      return 0;
    };

    const rankedCandidates = candidatePool
      .map((route, idx) => ({
        route,
        finalScore: (typeof route.score === 'number' ? route.score : 50) + verificationBoost(route) - idx * 0.01,
      }))
      .sort((a, b) => b.finalScore - a.finalScore)
      .map((entry) => entry.route);

    let filteredSplitRoutes = rankedCandidates.slice(0, 15);
    const fullyVerifiedCount = filteredSplitRoutes.filter(
      (route) => isLegVerifiedAndBookable(route.leg1) && isLegVerifiedAndBookable(route.leg2)
    ).length;

    const LIVE_TOP_MULTI = Math.min(2, multiSplitRoutes.length);
    if (LIVE_TOP_MULTI > 0) {
      const promises = multiSplitRoutes.slice(0, LIVE_TOP_MULTI).map(async (route, index) => {
        const legs = route.legs || [];
        try {
          const enrichedLegs = await Promise.all(
            legs.map((leg: any) => enrichWithLiveAvailability(leg, date, classType, { fetchLive: true, fetchAllClasses: false, debug: false }))
          );
          if (enrichedLegs.every(el => el?.trainNo)) {
            multiSplitRoutes[index].legs = enrichedLegs;
          }
        } catch (e) {
          console.warn(`[search-split] Multi-leg enrichment failed for index ${index}`, e);
        }
      });

      const timeRemainingMulti = Math.max(1500, 40000 - (Date.now() - apiStartTime));
      await Promise.race([
        Promise.all(promises),
        new Promise((resolve) => setTimeout(resolve, timeRemainingMulti))
      ]);
    }

    // Same fix: show all multi-leg routes, verified first, fallback last.
    const verifiedMulti = multiSplitRoutes.filter(route => {
      const legs = route.legs || [];
      return legs.length > 0 && legs.every(isLegVerifiedAndBookable);
    });
    const unverifiedMulti = multiSplitRoutes.filter(route => {
      const legs = route.legs || [];
      return legs.length > 0 && !legs.every(isLegVerifiedAndBookable);
    });
    let filteredMultiSplitRoutes = [...verifiedMulti, ...unverifiedMulti].slice(0, 5);

    const routeRecommendation = localRecommendation(directTrains, filteredSplitRoutes, filteredMultiSplitRoutes, budget);
    const meta = buildTrustMeta({
      source: 'fallback',
      provider: 'RailRoute split planner',
      isLive: false,
      splitRoute: true,
      fallback: true,
      warning: 'Split journeys are inferred from separate provider-backed train-leg searches.',
    });

    return apiSuccess({
      data: { splitRoutes: filteredSplitRoutes, multiSplitRoutes: filteredMultiSplitRoutes, routeRecommendation },
      meta,
      requestId,
      extra: {
        splitRoutes: filteredSplitRoutes,
        multiSplitRoutes: filteredMultiSplitRoutes,
        routeRecommendation,
        coverageMode,
        canExpand: filteredSplitRoutes.length >= plannerOptions.maxSplitResults,
        splitCandidatesConsidered: diverseRoutes.length,
        splitFullyVerifiedCount: fullyVerifiedCount,
      },
    });
  } catch (error: any) {
    console.error('Search Split API Error:', error);
    return apiFailure({
      error: 'Internal server error',
      requestId,
      provider: 'RailRoute split planner',
      status: 500,
      trust: { splitRoute: true },
    });
  }
}
