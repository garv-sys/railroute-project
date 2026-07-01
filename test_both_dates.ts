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
import { POST } from "/Users/garvtandon/hehe/src/app/api/search-split/route";

const API_KEY = process.env.IRCTC_API_KEY || "";
configure(API_KEY);

async function testDate(source: string, destination: string, date: string) {
  const start = Date.now();
  console.log(`\n=======================================\nTesting ${source} -> ${destination} on ${date}...`);
  try {
    const reqBody = {
      source,
      destination,
      date,
      classType: "3A",
      directTrains: []
    };
    const req = new Request("http://localhost:3000/api/search-split", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(reqBody)
    });
    const res = await POST(req);
    const data = await res.json();
    console.log(`Success in ${Date.now() - start}ms! Status = ${res.status}`);
    
    if (data.success === false) {
      console.error("API returned error:", data.error || data);
      return;
    }
    
    const splitRoutes = data.data?.splitRoutes || [];
    console.log(`Split routes returned: ${splitRoutes.length}`);
    for (let i = 0; i < Math.min(splitRoutes.length, 15); i++) {
      const r = splitRoutes[i];
      console.log(`  [Route #${i+1}] Via Hub: ${r.hubStation} (${r.hubStationName}), layoverHours: ${r.layoverHours.toFixed(2)}h`);
      console.log(`    Leg 1: ${r.leg1.trainNo} (${r.leg1.trainName}) - Avail=${r.leg1.availability}, Fare=${r.leg1.fare}, Status=${r.leg1.availabilityStatus}`);
      console.log(`    Leg 2: ${r.leg2.trainNo} (${r.leg2.trainName}) - Avail=${r.leg2.availability}, Fare=${r.leg2.fare}, Status=${r.leg2.availabilityStatus}`);
    }
  } catch (err: any) {
    console.error(`-> Error: ${err.message || err}`);
  }
}

async function runTests() {
  await testDate("PNBE", "JP", "2026-08-05");
  await testDate("DURE", "JP", "2026-08-09");
}

runTests()
  .then(() => {
    console.log("All tests completed successfully!");
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
