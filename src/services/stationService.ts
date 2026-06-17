import {
  stationByCode,
  stationLabel,
  stationLabelFromCode,
  stationMatches,
  type Station,
} from "@/lib/railway-intelligence";

export function getStationSuggestions(query: string, limit = 18): Station[] {
  return stationMatches(query, limit);
}

export function getStationByCode(code: string): Station | undefined {
  return stationByCode(code);
}

export function getStationLabel(codeOrStation: string | Station, withCode = true) {
  if (typeof codeOrStation === "string") return stationLabelFromCode(codeOrStation, withCode);
  return stationLabel(codeOrStation, withCode);
}
