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

import { configure, getAvailability } from "irctc-connect";

const API_KEY = process.env.IRCTC_API_KEY || "";
configure(API_KEY);

async function runTest() {
  console.log("Checking availability for Train 12015 (NZM -> JP) on 09-08-2026 in CC...");
  try {
    const res = await getAvailability("12015", "NZM", "JP", "09-08-2026", "CC", "GN");
    console.log("Response:", JSON.stringify(res, null, 2));
  } catch (err: any) {
    console.error("Error checking availability:", err);
  }
}

runTest().catch(console.error);
