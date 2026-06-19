import { apiFailure, apiSuccess, validationFailure } from "@/lib/api-response";
import { buildTrustMeta } from "@/lib/confidence";
import { checkDirectTrains, findSmartRoutes, godModeHubCandidates } from "@/services/trainService";

function directTrainKeys(trains: any[]) {
  const trainNos = new Set<string>();
  const trainNames = new Set<string>();
  for (const train of trains || []) {
    const no = String(train.trainNo || train.train_no || train.train_number || "").trim().replace(/^0+/, "");
    const name = String(train.trainName || train.train_name || train.name || "").trim().toLowerCase();
    if (no) trainNos.add(no);
    if (name) trainNames.add(name);
  }
  return { trainNos, trainNames };
}

function removeDirectDuplicates(splits: any[], directTrains: any[]) {
  const { trainNos, trainNames } = directTrainKeys(directTrains);
  const seen = new Set<string>();
  return (splits || []).filter((split) => {
    const legNos = [split?.leg1?.trainNo, split?.leg2?.trainNo]
      .map((value) => String(value || "").trim().replace(/^0+/, ""))
      .filter(Boolean);
    const legNames = [split?.leg1?.trainName, split?.leg2?.trainName]
      .map((value) => String(value || "").trim().toLowerCase())
      .filter(Boolean);
    if (legNos.some((no) => trainNos.has(no))) return false;
    if (legNames.some((name) => trainNames.has(name))) return false;

    const key = [
      split?.hubStation,
      split?.leg1?.trainNo,
      split?.leg1Date || split?.leg1?.journeyDate,
      split?.leg2?.trainNo,
      split?.leg2Date || split?.leg2?.journeyDate,
    ].map((value) => String(value || "").toUpperCase()).join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function firstClassRows(classAvailability: any) {
  if (!classAvailability || typeof classAvailability !== "object") return undefined;
  return Object.fromEntries(
    Object.entries(classAvailability).map(([classCode, rows]) => [
      classCode,
      Array.isArray(rows) ? rows.slice(0, 1) : rows,
    ])
  );
}

function compactTrain(train: any) {
  if (!train) return train;
  return {
    trainNo: train.trainNo,
    trainName: train.trainName,
    source: train.source,
    destination: train.destination,
    departureTime: train.departureTime,
    arrivalTime: train.arrivalTime,
    duration: train.duration,
    availability: train.availability,
    fare: train.fare,
    journeyDate: train.journeyDate,
    departureDate: train.departureDate,
    arrivalDate: train.arrivalDate,
    classType: train.classType,
    selectedClass: train.selectedClass,
    classes: train.classes,
    providerReturnedClass: train.providerReturnedClass,
    classAvailability: firstClassRows(train.classAvailability),
    availabilityStatus: train.availabilityStatus,
    fareStatus: train.fareStatus,
    dataSource: train.dataSource,
    trainType: train.trainType,
  };
}

function compactSplit(split: any) {
  return {
    ...split,
    leg1: compactTrain(split?.leg1),
    leg2: compactTrain(split?.leg2),
  };
}

export async function POST(request: Request) {
  const requestId = `gm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const startedAt = Date.now();

  try {
    const body = await request.json();
    const {
      source,
      destination,
      date,
      classType = "Any",
      preferredHub = "",
      debug = false,
    } = body || {};

    if (!source || !destination || !date) {
      return validationFailure("Missing required parameters", requestId);
    }

    const hubAnalysis = godModeHubCandidates(source, destination, preferredHub, 8);
    const directTrains = await checkDirectTrains(source, destination, date, classType, {
      debug: Boolean(debug),
      fetchLive: false,
      liveLookupLimit: 0,
      coverageMode: "quick",
      exactStationOnly: false,
      providerPairLimit: 6,
      plannerLegTimeoutMs: 3200,
      globalTimeoutMs: 3800,
    });

    const splitRoutesRaw = await findSmartRoutes(source, destination, date, classType, directTrains, preferredHub, {
      debug: Boolean(debug),
      fetchLive: false,
      liveLookupLimit: 0,
      coverageMode: "quick",
      exactStationOnly: false,
      providerPairLimit: 1,
      maxSplitHubs: Math.max(5, hubAnalysis.length || 8),
      maxSplitLegOptions: 16,
      maxSplitCandidates: 180,
      maxSplitResults: 20,
      plannerLegTimeoutMs: 3000,
      globalTimeoutMs: Math.max(2500, 9200 - (Date.now() - startedAt)),
      allowMixedClassSplits: true,
    });

    const splitRoutes = removeDirectDuplicates(splitRoutesRaw, directTrains).slice(0, 15);
    const directTrainsForClient = directTrains.map(compactTrain);
    const splitRoutesForClient = splitRoutes.map(compactSplit);
    const searchTimeMs = Date.now() - startedAt;
    const hubsRepresented = new Set(splitRoutes.map((route) => route.hubStation).filter(Boolean));
    const metrics = {
      directTrainsFound: directTrains.length,
      splitRoutesFound: splitRoutes.length,
      searchTimeMs,
      searchTimeSeconds: Number((searchTimeMs / 1000).toFixed(2)),
      hubsAnalyzed: hubAnalysis.length,
      hubsWithRoutes: hubsRepresented.size,
      targetMs: 10000,
    };

    return apiSuccess({
      data: {
        directTrains: directTrainsForClient,
        splitRoutes: splitRoutesForClient,
        hubAnalysis,
        metrics,
      },
      requestId,
      meta: buildTrustMeta({
        source: "live",
        provider: "RailRoute GodMode planner",
        isLive: true,
        warning: "GodMode uses broad train-list search and schedule-class matching; live seat checks are intentionally deferred for speed.",
      }),
      extra: {
        directTrains: directTrainsForClient,
        splitRoutes: splitRoutesForClient,
        hubAnalysis,
        metrics,
      },
    });
  } catch (error) {
    console.error("GodMode API Error:", error);
    return apiFailure({
      error: "GodMode search failed",
      requestId,
      provider: "RailRoute GodMode planner",
      status: 500,
    });
  }
}
