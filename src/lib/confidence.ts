export type TrustSource = "live" | "cached" | "fallback" | "mock" | "unavailable";

export type TrustMeta = {
  source: TrustSource;
  provider: string;
  isLive: boolean;
  asOf: string;
  expiresAt?: string;
  confidence: number;
  warning?: string;
};

export type TrustInput = {
  source?: TrustSource;
  provider?: string;
  isLive?: boolean;
  asOf?: string | Date;
  expiresAt?: string | Date;
  warning?: string;
  splitRoute?: boolean;
  fallback?: boolean;
  mock?: boolean;
  cached?: boolean;
  inferredFare?: boolean;
};

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function isoDate(value?: string | Date) {
  if (!value) return new Date().toISOString();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

export function addMs(date: string | Date, ms: number) {
  const base = date instanceof Date ? date : new Date(date);
  return new Date(base.getTime() + ms).toISOString();
}

export function scoreConfidence(input: TrustInput = {}) {
  const source = input.source || (input.mock ? "mock" : input.fallback ? "fallback" : input.cached ? "cached" : "live");
  if ((input.isLive ?? source === "live") && source === "live" && !input.splitRoute && !input.inferredFare) return 100;
  return clamp(0);
}

export function confidenceLabel(confidence = 0) {
  if (confidence >= 75) return "High confidence";
  if (confidence >= 45) return "Medium confidence";
  return "Low confidence";
}

export function buildTrustMeta(input: TrustInput = {}): TrustMeta {
  const source = input.source || (input.mock ? "mock" : input.fallback ? "fallback" : input.cached ? "cached" : "live");
  const asOf = isoDate(input.asOf);
  const isLive = input.isLive ?? source === "live";
  const metaInput = { ...input, source, isLive, asOf };

  return {
    source,
    provider: input.provider || "RailRoute provider",
    isLive,
    asOf,
    expiresAt: input.expiresAt ? isoDate(input.expiresAt) : undefined,
    confidence: scoreConfidence(metaInput),
    warning: input.warning,
  };
}

export function formatTrustUpdated(meta?: Pick<TrustMeta, "source" | "asOf" | "warning"> | null) {
  if (!meta?.asOf) return "Updated time unavailable";
  const date = new Date(meta.asOf);
  if (Number.isNaN(date.getTime())) return "Updated time unavailable";
  const ageMs = Math.max(0, Date.now() - date.getTime());
  const minutes = Math.floor(ageMs / 60000);
  const time = date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });

  if (meta.source === "live") return minutes < 1 ? "Provider response just now" : `Provider response ${minutes} min${minutes === 1 ? "" : "s"} ago`;
  if (meta.source === "cached") return `Cached from successful query at ${time}`;
  if (meta.source === "unavailable") return meta.warning || "Provider did not return verified data";
  if (meta.source === "fallback") return meta.warning || "Provider fallback result";
  return "Reference data";
}

export function trustMetaFromTrain(train: any, options: { splitRoute?: boolean; nearbyBoarding?: boolean } = {}) {
  const text = String(train?.dataSource || train?._providerSource || train?.source || "").toLowerCase();
  const isMock = Boolean(train?._mockFallback) || /mock|fallback estimate/.test(text);
  const isScheduleFallback = Boolean(train?._scheduleOnly) || /schedule fallback|directory|reference|verify fare|fallback/.test(text);
  const isCached = /cached|reference|stored/.test(text);
  const provider = train?.provider || train?._providerSource || (isScheduleFallback ? "RailRoute schedule reference" : "IRCTC-compatible provider");
  const source: TrustSource = isMock ? "mock" : isScheduleFallback ? "fallback" : isCached ? "cached" : "live";
  const warning = source === "live"
    ? undefined
    : options.splitRoute
      ? "Split route is inferred from separate train legs."
      : "Provider quota was not returned for every field.";

  return buildTrustMeta({
    source,
    provider,
    isLive: source === "live",
    asOf: train?.meta?.asOf || train?.trustMeta?.asOf,
    warning,
    splitRoute: options.splitRoute,
    fallback: source === "fallback",
    mock: source === "mock",
    cached: source === "cached",
    inferredFare: /fare unavailable|estimate|verify/i.test(String(train?.fare ?? "")),
  });
}

export function trustMetaForTrainList(trains: any[], options: { splitRoute?: boolean } = {}) {
  if (!trains?.length) {
    return buildTrustMeta({
      source: "fallback",
      provider: "RailRoute route planner",
      isLive: false,
      fallback: true,
      splitRoute: options.splitRoute,
      warning: "No train rows were returned for this segment.",
    });
  }

  const metas = (trains || []).map((train) => trustMetaFromTrain(train, options));
  const hasLive = metas.some((meta) => meta.source === "live");
  const hasMock = metas.some((meta) => meta.source === "mock");
  const hasFallback = metas.some((meta) => meta.source === "fallback");
  const hasCached = metas.some((meta) => meta.source === "cached");
  const source: TrustSource = hasMock ? "mock" : hasFallback ? "fallback" : hasCached && !hasLive ? "cached" : "live";

  return buildTrustMeta({
    source,
    provider: hasLive ? "IRCTC-compatible provider" : "RailRoute route planner",
    isLive: source === "live",
    splitRoute: options.splitRoute,
    fallback: source === "fallback",
    mock: source === "mock",
    cached: source === "cached",
    warning: source === "live" ? undefined : "Some fields are cached, fallback, or inferred.",
  });
}
