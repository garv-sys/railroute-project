import { NextRequest, NextResponse } from "next/server";
import { stationMatches, stationRelatedCodes, stationByCode, type Station } from "@/lib/railway-intelligence";

const cache = new Map<string, { data: any; expiry: number }>();
const CACHE_TTL = 60 * 1000; // 60 seconds

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q");

  if (!q) {
    return NextResponse.json({ error: "Missing query parameter 'q'" }, { status: 400 });
  }

  const query = q.trim();
  if (query.length < 2 || query.length > 50) {
    return NextResponse.json({ error: "Query length must be between 2 and 50 characters" }, { status: 400 });
  }

  const cacheKey = query.toLowerCase();
  const cached = cache.get(cacheKey);
  const now = Date.now();

  if (cached && cached.expiry > now) {
    return NextResponse.json(cached.data);
  }

  try {
    const relatedStations = stationRelatedCodes(query, 10)
      .map((code) => stationByCode(code))
      .filter((station): station is Station => Boolean(station));
    const directMatches = query.length >= 2 ? stationMatches(query, 10) : [];
    const exactCode = stationByCode(query.toUpperCase());
    const seen = new Set<string>();
    
    const rawMatches = [
      ...(exactCode ? [exactCode] : []),
      ...relatedStations,
      ...directMatches,
    ].filter((station) => {
      if (!station?.code || seen.has(station.code)) return false;
      seen.add(station.code);
      return true;
    }).slice(0, 10);

    const data = rawMatches.map((station) => ({
      code: station.code,
      name: station.name,
      state: station.state || "",
      zone: station.zone || "",
      type: station.type || "",
    }));

    cache.set(cacheKey, { data, expiry: now + CACHE_TTL });
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to search stations" }, { status: 500 });
  }
}
