import { dynamicSplitHubCandidates, stationCoordinatesForRouting, isHubOnPath } from "./src/services/trainService";

const source = "CKP";
const dest = "JP";

// Expand aliases logic from trainService
const SPLIT_HUB_ALIASES: Record<string, string[]> = {
  NDLS: ["NDLS", "NZM", "DLI", "ANVT", "DEE", "DEC", "GGN"],
  NZM: ["NDLS", "NZM", "DLI", "ANVT", "DEE", "DEC", "GGN"],
  DLI: ["NDLS", "NZM", "DLI", "ANVT", "DEE", "DEC", "GGN"],
  ANVT: ["NDLS", "NZM", "DLI", "ANVT", "DEE", "DEC", "GGN"],
  DEE: ["NDLS", "NZM", "DLI", "ANVT", "DEE", "DEC", "GGN"],
  BSB: ["BSB", "BSBS", "BCY", "MGS", "DDU"],
  BSBS: ["BSB", "BSBS", "BCY", "MGS", "DDU"],
  MGS: ["BSB", "BSBS", "BCY", "MGS", "DDU"],
  DDU: ["BSB", "BSBS", "BCY", "MGS", "DDU"],
  PRYJ: ["PRYJ", "ALD", "PRRB", "PCOI", "SFG"],
  ALD: ["PRYJ", "ALD", "PRRB", "PCOI", "SFG"],
  PCOI: ["PRYJ", "ALD", "PRRB", "PCOI", "SFG"],
  LKO: ["LKO", "LJN"],
  LJN: ["LKO", "LJN"]
};

function expandSplitHubAliases(hubs: string[]) {
  const primary = Array.from(new Set(hubs.map((hub) => hub.toUpperCase()).filter(Boolean)));
  const aliases = primary.flatMap((hub) => (SPLIT_HUB_ALIASES[hub] || []).filter((alias) => alias !== hub));
  return Array.from(new Set([...primary, ...aliases])).filter(Boolean);
}

const rawCandidates = dynamicSplitHubCandidates(source, dest, "", 35);
console.log("Raw Candidates:", rawCandidates.join(", "));

const expanded = expandSplitHubAliases(rawCandidates);
console.log("\nExpanded:", expanded.join(", "));

const hubsToTry = expanded.slice(0, 35);
console.log(`\nHubs to try (sliced to 35): Count = ${hubsToTry.length}`);
console.log(hubsToTry.join(", "));
