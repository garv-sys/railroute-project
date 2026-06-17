import { NextResponse } from "next/server";

import { getTrainSchedule } from "@/services/irctcService";
import { buildTrustMeta } from "@/lib/confidence";
import {
  stationByCode,
  stationLabelFromCode,
  stationState,
  type RouteStop,
  type TrainDetails,
} from "@/lib/railway-intelligence";

function pickArray(value: any): any[] {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.data?.route)) return value.data.route;
  if (Array.isArray(value?.data?.schedule)) return value.data.schedule;
  if (Array.isArray(value?.route)) return value.route;
  if (Array.isArray(value?.schedule)) return value.schedule;
  return [];
}

function normalizeStop(stop: any, index: number): RouteStop | null {
  const code = String(stop?.stnCode || stop?.station_code || stop?.stationCode || stop?.code || stop?.StationCode || "").toUpperCase();
  if (!code) return null;

  return {
    code,
    stationName: stop?.stnName || stop?.station_name || stop?.stationName || stop?.name || stop?.StationName || undefined,
    arrival: String(stop?.arrTime || stop?.arrival || stop?.ArrivalTime || stop?.scharr || (index === 0 ? "Start" : "--:--")),
    departure: String(stop?.depTime || stop?.departure || stop?.DepartureTime || stop?.schdep || (index === 0 ? stop?.departure : "--:--") || "--:--"),
    halt: String(stop?.haltTime || stop?.halt || stop?.HaltTime || (index === 0 ? "-" : "--")),
    distance: Number(stop?.distance || stop?.Distance || 0),
    platform: stop?.platform || stop?.PlatformNo || stop?.pf || undefined,
    day: Number(stop?.day || stop?.dayCnt || stop?.Day || 1),
  };
}

function normalizeRunningDays(value: any, fallback?: string[]) {
  if (Array.isArray(value)) return value.length ? value : fallback || ["Schedule not returned"];
  const raw = String(value || "").trim();
  if (/^[01]{7}$/.test(raw)) {
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const active = days.filter((_, index) => raw[index] === "1");
    return active.length === 7 ? ["Daily"] : active.length ? active : fallback || ["Check schedule"];
  }
  return raw ? [raw] : fallback || ["Schedule not returned"];
}

function normalizeTrain(query: string, live: any): TrainDetails | null {
  const route = pickArray(live).map(normalizeStop).filter(Boolean) as RouteStop[];
  if (route.length < 2) return null;

  const data = live?.data || live;
  const trainInfo = data?.trainInfo || data?.train_info || data;
  const trainNo = String(trainInfo?.trainNo || trainInfo?.train_no || trainInfo?.trainNumber || trainInfo?.number || query).replace(/\D/g, "") || query;
  const trainName = String(trainInfo?.trainName || trainInfo?.train_name || trainInfo?.name || "Indian Railways Train").toUpperCase();

  return {
    trainNo,
    trainName,
    type: String(trainInfo?.trainType || trainInfo?.type || "").trim() || "Train",
    source: trainInfo?.from_stn_code || route[0].code,
    destination: trainInfo?.to_stn_code || route[route.length - 1].code,
    runningDays: normalizeRunningDays(trainInfo?.runningDays || trainInfo?.running_days || trainInfo?.runsOn, ["Schedule not returned"]),
    classes: Array.isArray(trainInfo?.classes) ? trainInfo.classes : [],
    route,
  };
}

function enrich(train: TrainDetails, dataSource: string) {
  return {
    ...train,
    dataSource,
    sourceLabel: stationLabelFromCode(train.source),
    destinationLabel: stationLabelFromCode(train.destination),
    route: train.route.map((stop) => {
      const station = stationByCode(stop.code);
      const providerName = stop.stationName ? `${stop.stationName} (${stationState(stop.code)})` : undefined;
      return {
        ...stop,
        stationName: station ? stationLabelFromCode(stop.code, false) : providerName || stop.code,
        state: stationState(stop.code),
        label: station ? stationLabelFromCode(stop.code) : `${providerName || stop.code} — ${stop.code}`,
      };
    }),
  };
}

export async function POST(request: Request) {
  try {
    const { query } = await request.json();
    const cleanQuery = String(query || "").trim();

    if (!cleanQuery) {
      return NextResponse.json({
        success: false,
        error: "Missing train number or name",
        data: null,
        meta: buildTrustMeta({ source: "fallback", provider: "RailRoute validation", isLive: false, fallback: true, warning: "Missing train number or name" }),
      }, { status: 400 });
    }

    const numeric = cleanQuery.match(/\d{5}/)?.[0];

    if (numeric) {
      try {
        const live = await getTrainSchedule(numeric);
        const normalized = normalizeTrain(numeric, live);
        if (normalized) {
          const cacheMeta = live?._cacheMeta;
          const trains = [enrich(normalized, cacheMeta ? "Recently cached schedule" : "IRCTC-compatible provider schedule")];
          return NextResponse.json({
            success: true,
            source: cacheMeta ? "cached" : "live",
            trains,
            data: { trains },
            meta: buildTrustMeta({
              source: cacheMeta ? "cached" : "live",
              provider: live?.provider || "IRCTC-compatible schedule provider",
              isLive: !cacheMeta,
              asOf: cacheMeta?.asOf,
              expiresAt: cacheMeta?.expiresAt,
              warning: cacheMeta?.state === "stale" ? "Refreshing cached schedule in the background." : undefined,
            }),
          });
        }
      } catch (error) {
        console.warn(`[Train Search] Live schedule failed for ${numeric}:`, error);
      }
    }

    return NextResponse.json({
      success: true,
      source: "provider-unavailable",
      trains: [],
      data: { trains: [] },
      meta: buildTrustMeta({ source: "fallback", provider: "IRCTC-compatible schedule provider", isLive: false, fallback: true, warning: "No provider-backed schedule was returned for this query." }),
    });
  } catch (error) {
    console.error("Train Search API Error:", error);
    return NextResponse.json({
      success: false,
      error: "Internal server error",
      data: null,
      meta: buildTrustMeta({ source: "fallback", provider: "RailRoute train-search API", isLive: false, fallback: true, warning: "Internal server error" }),
    }, { status: 500 });
  }
}
