import { apiSuccess } from "@/lib/api-response";
import { buildTrustMeta } from "@/lib/confidence";
import { getRailProviderCacheStats, searchDirectTrains } from "@/services/irctcService";

export async function GET() {
  const cache = getRailProviderCacheStats();
  const now = new Date().toISOString();
  const usage = cache.usage;
  const apiKey = process.env.IRCTC_API_KEY?.trim() || "";

  let liveSearchTest: any = null;
  try {
    liveSearchTest = await searchDirectTrains("PNBE", "NDLS", "24-07-2026");
  } catch (err: any) {
    liveSearchTest = { success: false, error: err.message || err };
  }

  return apiSuccess({
    data: {
      cache,
      usage,
      checkedAt: now,
      apiKeyLength: apiKey.length,
      apiKeyPrefix: apiKey ? `${apiKey.slice(0, 8)}...` : "none",
      liveSearchTest,
      note: "Operational health check with live search test diagnostics.",
      guardrails: {
        status: usage?.totals?.guarded ? "active" : "clear",
        providerCalls: usage?.totals?.providerCalls || 0,
        guardedCalls: usage?.totals?.guarded || 0,
        failedCalls: usage?.totals?.failures || 0,
      },
    },
    meta: buildTrustMeta({
      source: "live",
      provider: "RailRoute provider health diagnostics",
      isLive: true,
      asOf: now,
    }),
  });
}
