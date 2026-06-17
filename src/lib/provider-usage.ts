export type ProviderCallKind =
  | "train-list"
  | "availability"
  | "pnr"
  | "live"
  | "station-live"
  | "schedule";

type ProviderCallStatus = "success" | "empty" | "rate_limited" | "guarded" | "failed";

type ProviderUsageEvent = {
  id: string;
  kind: ProviderCallKind;
  label: string;
  status: ProviderCallStatus;
  durationMs: number;
  timestamp: string;
  error?: string;
};

type ProviderKindStats = {
  total: number;
  success: number;
  empty: number;
  rateLimited: number;
  guarded: number;
  failed: number;
  totalDurationMs: number;
  lastStatus?: ProviderCallStatus;
  lastError?: string;
  lastAt?: string;
};

const WINDOW_MS = 60_000;
const RECENT_LIMIT = 80;

const defaultLimits: Record<ProviderCallKind, number> = {
  "train-list": 600,
  availability: 480,
  pnr: 180,
  live: 240,
  "station-live": 240,
  schedule: 360,
};

const envLimitNames: Record<ProviderCallKind, string> = {
  "train-list": "RAILROUTE_TRAIN_LIST_CALLS_PER_MINUTE",
  availability: "RAILROUTE_AVAILABILITY_CALLS_PER_MINUTE",
  pnr: "RAILROUTE_PNR_CALLS_PER_MINUTE",
  live: "RAILROUTE_LIVE_CALLS_PER_MINUTE",
  "station-live": "RAILROUTE_STATION_LIVE_CALLS_PER_MINUTE",
  schedule: "RAILROUTE_SCHEDULE_CALLS_PER_MINUTE",
};

const totals = new Map<ProviderCallKind, ProviderKindStats>();
const windows = new Map<ProviderCallKind, { startedAt: number; used: number }>();
const recent: ProviderUsageEvent[] = [];

function metricFor(kind: ProviderCallKind) {
  const existing = totals.get(kind);
  if (existing) return existing;
  const next: ProviderKindStats = {
    total: 0,
    success: 0,
    empty: 0,
    rateLimited: 0,
    guarded: 0,
    failed: 0,
    totalDurationMs: 0,
  };
  totals.set(kind, next);
  return next;
}

function providerLimit(kind: ProviderCallKind) {
  const envValue = Number(process.env[envLimitNames[kind]]);
  return Number.isFinite(envValue) && envValue > 0 ? Math.floor(envValue) : defaultLimits[kind];
}

function windowFor(kind: ProviderCallKind) {
  const now = Date.now();
  const current = windows.get(kind);
  if (current && now - current.startedAt < WINDOW_MS) return current;
  const next = { startedAt: now, used: 0 };
  windows.set(kind, next);
  return next;
}

function compactError(value: unknown) {
  const text = value instanceof Error ? value.message : String(value || "");
  return text.length > 240 ? `${text.slice(0, 240)}...` : text;
}

function isRateLimited(value: unknown) {
  const text = typeof value === "string" ? value : JSON.stringify(value || "");
  return /rate.?limit|429|too many requests|usage limit|quota exceeded|billing cycle/i.test(text);
}

function isEmptyProviderResult(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const payload = value as { success?: boolean; data?: unknown; error?: unknown };
  if (payload.success === false) return true;
  if (Array.isArray(payload.data)) return payload.data.length === 0;
  if (payload.data && typeof payload.data === "object") {
    const data = payload.data as Record<string, unknown>;
    const availability = data.availability;
    const trains = data.trains;
    if (Array.isArray(availability)) return availability.length === 0;
    if (Array.isArray(trains)) return trains.length === 0;
  }
  return false;
}

function recordProviderCall(event: Omit<ProviderUsageEvent, "id" | "timestamp">) {
  const timestamp = new Date().toISOString();
  const fullEvent: ProviderUsageEvent = {
    ...event,
    id: `${event.kind}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp,
  };
  const stats = metricFor(event.kind);
  stats.total += 1;
  stats.totalDurationMs += Math.max(0, Math.round(event.durationMs));
  stats.lastAt = timestamp;
  stats.lastStatus = event.status;
  if (event.error) stats.lastError = event.error;
  if (event.status === "success") stats.success += 1;
  if (event.status === "empty") stats.empty += 1;
  if (event.status === "rate_limited") stats.rateLimited += 1;
  if (event.status === "guarded") stats.guarded += 1;
  if (event.status === "failed") stats.failed += 1;

  recent.unshift(fullEvent);
  if (recent.length > RECENT_LIMIT) recent.splice(RECENT_LIMIT);
}

function reserveProviderCall(kind: ProviderCallKind, label: string) {
  const currentWindow = windowFor(kind);
  const limit = providerLimit(kind);
  if (currentWindow.used >= limit) {
    const retryAfterMs = Math.max(1000, WINDOW_MS - (Date.now() - currentWindow.startedAt));
    recordProviderCall({
      kind,
      label,
      status: "guarded",
      durationMs: 0,
      error: `Per-minute ${kind} guardrail reached. Retry after ${Math.ceil(retryAfterMs / 1000)}s.`,
    });
    return { allowed: false, retryAfterMs, limit, used: currentWindow.used };
  }
  currentWindow.used += 1;
  return { allowed: true, retryAfterMs: 0, limit, used: currentWindow.used };
}

export async function trackProviderCall<T>(kind: ProviderCallKind, label: string, fn: () => Promise<T>) {
  const reservation = reserveProviderCall(kind, label);
  if (!reservation.allowed) {
    throw new Error(`RailRoute provider usage guardrail paused ${kind} calls for ${Math.ceil(reservation.retryAfterMs / 1000)}s.`);
  }

  const started = Date.now();
  try {
    const result = await fn();
    const durationMs = Date.now() - started;
    const status = isRateLimited(result)
      ? "rate_limited"
      : isEmptyProviderResult(result)
        ? "empty"
        : "success";
    recordProviderCall({
      kind,
      label,
      status,
      durationMs,
      error: status === "rate_limited" ? "Provider returned a rate-limit signal." : undefined,
    });
    return result;
  } catch (error) {
    recordProviderCall({
      kind,
      label,
      status: isRateLimited(error) ? "rate_limited" : "failed",
      durationMs: Date.now() - started,
      error: compactError(error),
    });
    throw error;
  }
}

export function getProviderUsageStats() {
  const now = Date.now();
  const kinds = Object.keys(defaultLimits) as ProviderCallKind[];
  const limits = Object.fromEntries(kinds.map((kind) => [kind, providerLimit(kind)]));
  const windowStats = Object.fromEntries(kinds.map((kind) => {
    const current = windowFor(kind);
    return [kind, {
      used: current.used,
      limit: providerLimit(kind),
      resetsInMs: Math.max(0, WINDOW_MS - (now - current.startedAt)),
      startedAt: new Date(current.startedAt).toISOString(),
    }];
  }));
  const byKind = Object.fromEntries(kinds.map((kind) => {
    const stats = metricFor(kind);
    return [kind, {
      ...stats,
      averageDurationMs: stats.total > 0 ? Math.round(stats.totalDurationMs / stats.total) : 0,
    }];
  }));
  const totalProviderCalls = kinds.reduce((sum, kind) => sum + metricFor(kind).total, 0);
  const totalGuarded = kinds.reduce((sum, kind) => sum + metricFor(kind).guarded, 0);
  const totalFailures = kinds.reduce((sum, kind) => sum + metricFor(kind).failed + metricFor(kind).rateLimited, 0);
  return {
    checkedAt: new Date().toISOString(),
    windowMs: WINDOW_MS,
    limits,
    windows: windowStats,
    byKind,
    recent,
    totals: {
      providerCalls: totalProviderCalls,
      guarded: totalGuarded,
      failures: totalFailures,
    },
  };
}
