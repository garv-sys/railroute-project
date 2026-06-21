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

const ROUTES = [
  { from: "UDZ", to: "NDLS", label: "Udaipur to Delhi" },
  { from: "UDZ", to: "PNBE", label: "Udaipur to Patna" },
  { from: "UDZ", to: "CKP", label: "Udaipur to Chakradharpur" },
  { from: "UDZ", to: "HWH", label: "Udaipur to Kolkata" },
  { from: "PNBE", to: "JP", label: "Patna to Jaipur" },
  { from: "PNBE", to: "UDZ", label: "Patna to Udaipur" },
  { from: "PNBE", to: "AWR", label: "Patna to Alwar" },
  { from: "PNBE", to: "JU", label: "Patna to Jodhpur" },
  { from: "RNC", to: "JU", label: "Ranchi to Jodhpur" },
  { from: "RNC", to: "UDZ", label: "Ranchi to Udaipur" },
  { from: "RNC", to: "AWR", label: "Ranchi to Alwar" },
  { from: "PNBE", to: "GHY", label: "Patna to Guwahati" },
  { from: "PNBE", to: "BKN", label: "Patna to Bikaner" },
  { from: "PNBE", to: "BHL", label: "Patna to Bhilwara" },
  { from: "PNBE", to: "HYB", label: "Patna to Hyderabad" },
  { from: "PNBE", to: "SML", label: "Patna to Shimla" },
  { from: "PNBE", to: "ERS", label: "Patna to Kochi" },
  { from: "PNBE", to: "MAS", label: "Patna to Chennai" },
  { from: "PNBE", to: "SBC", label: "Patna to Bangalore" },
  { from: "PNBE", to: "RPO", label: "Patna to Sikkim" },
  { from: "NDLS", to: "CKP", label: "Delhi to Chakradharpur" },
];

async function run() {
  console.log("Starting test for all routes...");
  for (const route of ROUTES) {
    console.log(`\n========================================`);
    console.log(`Testing ${route.label} (${route.from} -> ${route.to})...`);
    try {
      const results = await findSmartRoutes(
        route.from,
        route.to,
        "25-06-2026",
        "Any",
        [],
        "",
        {
          debug: false,
          fetchLive: false,
          maxSplitHubs: 30,
          maxSplitLegOptions: 40,
          maxSplitCandidates: 200,
          maxSplitResults: 15,
          plannerLegTimeoutMs: 3000,
          globalTimeoutMs: 15000,
        }
      );
      console.log(`-> Results found: ${results.length}`);
      if (results.length > 0) {
        console.log(`Top hubs tried: ${Array.from(new Set(results.map(r => r.hubStation))).slice(0, 5).join(", ")}`);
      }
    } catch (err: any) {
      console.error(`Error searching ${route.label}:`, err.message || err);
    }
  }
}

run().catch(console.error);
