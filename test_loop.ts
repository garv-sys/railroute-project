import { findSmartRoutes } from "./src/services/trainService";

async function main() {
  const results = await findSmartRoutes("CKP", "JP", "25-06-2026", "Any", [], "", {
    debug: true,
    fetchLive: false,
    providerPairLimit: 20,
    maxSplitHubs: 35,
    maxSplitLegOptions: 60,
    maxSplitCandidates: 400,
    maxSplitResults: 15,
    plannerLegTimeoutMs: 4500,
    globalTimeoutMs: 18000,
  });
  console.log(`Results found: ${results.length}`);
}

main().catch(console.error);
