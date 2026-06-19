import { configure, searchTrainBetweenStations } from 'irctc-connect';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const apiKey = process.env.IRCTC_API_KEY;
if (!apiKey) {
  console.error("No API key found!");
  process.exit(1);
}
configure(apiKey);

const pairs = [
  { from: 'CKP', to: 'PNBE' },
  { from: 'CKP', to: 'JP' }, // JP is Jaipur
  { from: 'CKP', to: 'GHY' }, // GHY is Guwahati
  { from: 'PNBE', to: 'SBC' },
  { from: 'PNBE', to: 'MAS' },
  { from: 'PNBE', to: 'JP' },
  { from: 'PNBE', to: 'NDLS' }
];

async function run() {
  const date = "25-07-2026";
  for (const pair of pairs) {
    console.log(`\n=== Querying ${pair.from} -> ${pair.to} on ${date} ===`);
    try {
      const res = await searchTrainBetweenStations(pair.from, pair.to, date);
      console.log(`Success:`, res.success);
      if (res.success && Array.isArray(res.data)) {
        console.log(`Found ${res.data.length} trains:`);
        res.data.slice(0, 5).forEach((t: any) => {
          console.log(`- ${t.train_no} ${t.train_name} (${t.from_time} -> ${t.to_time}) Runs: ${t.running_days || t.runsOn}`);
        });
        if (res.data.length > 5) {
          console.log(`... and ${res.data.length - 5} more.`);
        }
      } else {
        console.log(`Response detail:`, JSON.stringify(res).slice(0, 300));
      }
    } catch (e: any) {
      console.error(`Error querying ${pair.from} -> ${pair.to}:`, e.message || e);
    }
  }
}

run();
