import fs from "fs";
import path from "path";

// Manually parse .env.local
try {
  const envPath = "/Users/garvtandon/hehe/.env.local";
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, "utf-8").split("\n");
    for (const line of lines) {
      const match = line.match(/^\s*([^#=]+)\s*=\s*(.*)$/);
      if (match) {
        const key = match[1].trim();
        let val = match[2].trim();
        if (val.startsWith('"') && val.endsWith('"')) {
          val = val.substring(1, val.length - 1);
        } else if (val.startsWith("'") && val.endsWith("'")) {
          val = val.substring(1, val.length - 1);
        }
        process.env[key] = val;
      }
    }
  }
} catch (e) {
  console.warn("Failed to load .env.local:", e);
}

import { configure } from "irctc-connect";
import { findSmartRoutes } from "/Users/garvtandon/hehe/src/services/trainService";

const API_KEY = process.env.IRCTC_API_KEY || "";
configure(API_KEY);

async function runTest() {
  console.log("Searching split routes for PNBE -> JP on 05-08-2026...");
  try {
    const results = await findSmartRoutes(
      "PNBE",
      "JP",
      "2026-08-05",
      "3A",
      [],
      "",
      {
        debug: true,
        fetchLive: false, // static first to see candidates
        maxSplitHubs: 100,
        maxSplitLegOptions: 30,
        maxSplitCandidates: 1000,
        maxSplitResults: 40,
        plannerLegTimeoutMs: 3000,
        globalTimeoutMs: 10000,
      }
    );
    console.log(`\nCandidates found: ${results.length}`);
    for (let i = 0; i < Math.min(results.length, 15); i++) {
      const r = results[i];
      console.log(`[#${i+1}] Via Hub: ${r.hubStation} (${r.hubStationName}), Score: ${r.score}`);
      console.log(`  Leg 1: ${r.leg1.trainNo} (${r.leg1.trainName}), classes: ${r.leg1.classes}`);
      console.log(`  Leg 2: ${r.leg2.trainNo} (${r.leg2.trainName}), classes: ${r.leg2.classes}`);
    }
  } catch (err: any) {
    console.error("Error:", err);
  }
}

runTest().catch(console.error);
