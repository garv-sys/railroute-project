import fs from "fs";
import path from "path";

try {
  const env = fs.readFileSync(path.resolve(process.cwd(), ".env.local"), "utf-8");
  env.split("\n").forEach((line) => {
    const [key, ...val] = line.split("=");
    if (key && val.length) process.env[key.trim()] = val.join("=").trim();
  });
} catch {}

import { findSmartRoutes } from "./src/services/trainService";

async function main() {
  const source = "CKP";
  const dest = "JP";
  const date = "25-06-2026";
  const classType = "Any";
  const directTrains: any[] = [];
  const preferredHub = "";

  console.log(`Running split route search from ${source} to ${dest} on ${date}...`);

  const results = await findSmartRoutes(
    source,
    dest,
    date,
    classType,
    directTrains,
    preferredHub,
    {
      debug: true,
      fetchLive: false, // Turn off live availability to speed up debug
      providerPairLimit: 20,
      maxSplitHubs: 15,
      maxSplitLegOptions: 60,
      maxSplitCandidates: 400,
      maxSplitResults: 15,
      plannerLegTimeoutMs: 4500,
      globalTimeoutMs: 18000,
    }
  );

  console.log(`\n=== RESULTS FOUND: ${results.length} ===`);
  results.forEach((r, i) => {
    console.log(`[${i+1}] Via Hub: ${r.hubStation} (${r.hubStationName})`);
    console.log(`    Leg 1: ${r.leg1.trainNo} ${r.leg1.trainName} (${r.leg1.source}->${r.leg1.destination}) | Arr: ${r.leg1.arrivalTime} | Date: ${r.leg1Date}`);
    console.log(`    Leg 2: ${r.leg2.trainNo} ${r.leg2.trainName} (${r.leg2.source}->${r.leg2.destination}) | Dep: ${r.leg2.departureTime} | Date: ${r.leg2Date}`);
    console.log(`    Layover: ${r.layoverHours.toFixed(2)} hours (${r.layoverDuration})`);
  });
}

main().catch(console.error);
