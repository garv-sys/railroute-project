import fs from "fs";
import path from "path";

// Load env vars
try {
  const env = fs.readFileSync(path.resolve(".", ".env.local"), "utf-8");
  env.split("\n").forEach((line) => {
    const [key, ...val] = line.split("=");
    if (key && val.length) process.env[key.trim()] = val.join("=").trim();
  });
} catch {}

import { checkDirectTrains, findSmartRoutes } from "./src/services/trainService";

async function runTest(date: string) {
  const source = "DURE";
  const dest = "JP";
  console.log(`\n============================`);
  console.log(`TESTING: ${source} -> ${dest} on ${date}`);
  console.log(`============================`);
  
  try {
    const direct = await checkDirectTrains(source, dest, date, "Any", {
      debug: true,
      fetchLive: false,
      liveLookupLimit: 0,
      exactStationOnly: false,
      providerPairLimit: 20,
      plannerLegTimeoutMs: 4000,
    });
    console.log(`Direct trains found: ${direct.length}`);

    const split = await findSmartRoutes(source, dest, date, "Any", direct, "", {
      debug: true,
      fetchLive: true,
      liveLookupLimit: 30,
      coverageMode: "quick",
      exactStationOnly: false,
      providerPairLimit: 20,
      maxSplitHubs: 35,
      maxSplitLegOptions: 60,
      maxSplitCandidates: 400,
      maxSplitResults: 15,
      plannerLegTimeoutMs: 2500,
      globalTimeoutMs: 15000,
    });
    console.log(`Split routes found: ${split.length}`);
    if (split.length > 0) {
      split.slice(0, 3).forEach((r, idx) => {
        console.log(`[${idx+1}] Via Hub: ${r.hubStation} | Leg 1: ${r.leg1.trainNo} (${r.leg1.departureTime}->${r.leg1.arrivalTime}) | Leg 2: ${r.leg2.trainNo} (${r.leg2.departureTime}->${r.leg2.arrivalTime})`);
      });
    }
  } catch (err) {
    console.error("Test failed:", err);
  }
}

async function main() {
  await runTest("21-06-2026");
  await runTest("21-07-2026");
}

main().catch(console.error);
