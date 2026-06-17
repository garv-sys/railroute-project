export type CacheState = "cached" | "stale";

export type CacheMeta = {
  state: CacheState;
  asOf: string;
  expiresAt: string;
};

type CacheEntry<T> = {
  data: T;
  timestamp: number;
  ttl: number;
  failed?: boolean;
};

type ProviderCacheOptions = {
  maxConcurrency?: number;
  retryCount?: number;
  retryDelayMs?: number;
  failureTtlMs?: number;
  staleWhileRevalidateMultiplier?: number;
  timeoutMs?: number;
  loggerPrefix?: string;
};

export type ProviderCacheStats = {
  entries: number;
  failureEntries: number;
  inFlight: number;
  activeRequests: number;
  queuedRequests: number;
  maxConcurrency: number;
  hits: number;
  staleHits: number;
  misses: number;
  deduped: number;
  lastProviderDurationMs?: number;
  lastProviderError?: string;
};

class ProviderQueue {
  private active = 0;
  private readonly queue: (() => void)[] = [];

  constructor(private readonly maxConcurrency: number) {}

  get stats() {
    return {
      activeRequests: this.active,
      queuedRequests: this.queue.length,
      maxConcurrency: this.maxConcurrency,
    };
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.maxConcurrency) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }

    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      const next = this.queue.shift();
      if (next) next();
    }
  }
}

function hasRateLimitSignal(value: unknown) {
  const text = typeof value === "string" ? value : JSON.stringify(value || "");
  return /too many requests|rate.?limit|429/i.test(text);
}

function withCacheMeta<T>(data: T, timestamp: number, ttl: number, state: CacheState): T {
  if (!data || typeof data !== "object" || Array.isArray(data)) return data;
  return {
    ...data,
    _cacheMeta: {
      state,
      asOf: new Date(timestamp).toISOString(),
      expiresAt: new Date(timestamp + ttl).toISOString(),
    } satisfies CacheMeta,
  };
}

export class ProviderCache {
  private readonly cache = new Map<string, CacheEntry<unknown>>();
  private readonly inFlight = new Map<string, Promise<unknown>>();
  private readonly queue: ProviderQueue;
  private readonly retryCount: number;
  private readonly retryDelayMs: number;
  private readonly failureTtlMs: number;
  private readonly staleMultiplier: number;
  private readonly timeoutMs: number;
  private readonly loggerPrefix: string;
  private hits = 0;
  private staleHits = 0;
  private misses = 0;
  private deduped = 0;
  private lastProviderDurationMs: number | undefined;
  private lastProviderError: string | undefined;

  constructor(options: ProviderCacheOptions = {}) {
    this.queue = new ProviderQueue(options.maxConcurrency ?? 3);
    this.retryCount = Math.max(1, options.retryCount ?? 1);
    this.retryDelayMs = options.retryDelayMs ?? 1500;
    this.failureTtlMs = options.failureTtlMs ?? 30_000;
    this.staleMultiplier = Math.max(1, options.staleWhileRevalidateMultiplier ?? 4);
    this.timeoutMs = options.timeoutMs ?? 20_000;
    this.loggerPrefix = options.loggerPrefix || "provider-cache";
  }

  stats(): ProviderCacheStats {
    let failureEntries = 0;
    for (const entry of this.cache.values()) {
      if (entry.failed) failureEntries++;
    }

    return {
      entries: this.cache.size,
      failureEntries,
      inFlight: this.inFlight.size,
      hits: this.hits,
      staleHits: this.staleHits,
      misses: this.misses,
      deduped: this.deduped,
      lastProviderDurationMs: this.lastProviderDurationMs,
      lastProviderError: this.lastProviderError,
      ...this.queue.stats,
    };
  }

  clear() {
    this.cache.clear();
    this.inFlight.clear();
  }

  async fetch<T>(key: string, fetchFn: () => Promise<T>, ttl: number): Promise<T> {
    const cached = this.cache.get(key) as CacheEntry<T> | undefined;
    const now = Date.now();
    const cachedTtl = cached?.ttl ?? ttl;

    if (cached && now - cached.timestamp < cachedTtl) {
      this.hits++;
      return withCacheMeta(cached.data, cached.timestamp, cachedTtl, "cached");
    }

    if (cached && !cached.failed && now - cached.timestamp < ttl * this.staleMultiplier) {
      this.staleHits++;
      this.refreshInBackground(key, fetchFn, ttl, cached.data);
      return withCacheMeta(cached.data, cached.timestamp, ttl, "stale");
    }

    const existing = this.inFlight.get(key) as Promise<T> | undefined;
    if (existing) {
      this.deduped++;
      return existing;
    }

    this.misses++;
    const request = this.queue.run(() => this.timedFetch(key, () => this.fetchWithRetry(key, fetchFn)))
      .then((data) => {
        this.storeProviderResult(key, data, ttl);
        return data;
      })
      .finally(() => {
        this.inFlight.delete(key);
      });

    this.inFlight.set(key, request);
    return request;
  }

  async fetchFresh<T>(key: string, fetchFn: () => Promise<T>): Promise<T> {
    const existing = this.inFlight.get(key) as Promise<T> | undefined;
    if (existing) {
      this.deduped++;
      return existing;
    }

    this.misses++;
    const request = this.queue.run(() => this.timedFetch(key, () => this.fetchWithRetry(key, fetchFn)))
      .finally(() => {
        this.inFlight.delete(key);
      });

    this.inFlight.set(key, request);
    return request;
  }

  private refreshInBackground<T>(key: string, fetchFn: () => Promise<T>, ttl: number, fallbackData: T) {
    if (this.inFlight.has(key)) return;

    const refresh = this.queue.run(() => this.timedFetch(key, () => this.fetchWithRetry(key, fetchFn)))
      .then((data) => {
        this.storeProviderResult(key, data, ttl);
        return data;
      })
      .catch((error) => {
        console.warn(`[${this.loggerPrefix}] Background refresh failed for ${key}:`, error?.message || error);
        return fallbackData;
      })
      .finally(() => {
        this.inFlight.delete(key);
      });

    this.inFlight.set(key, refresh);
  }

  private storeProviderResult<T>(key: string, data: T, ttl: number) {
    const failed = this.isFailedProviderResult(data);
    const cacheTtl = failed ? this.failureTtlMs : ttl;
    if (cacheTtl <= 0) return;
    this.cache.set(key, { data, timestamp: Date.now(), ttl: cacheTtl, failed });
  }

  private async timedFetch<T>(key: string, fetchFn: () => Promise<T>) {
    const started = Date.now();
    try {
      const data = await this.withTimeout(fetchFn(), key);
      this.lastProviderDurationMs = Date.now() - started;
      this.lastProviderError = this.isFailedProviderResult(data)
        ? String((data as { error?: unknown }).error || "Provider returned unsuccessful response")
        : undefined;
      return data;
    } catch (error: any) {
      this.lastProviderDurationMs = Date.now() - started;
      this.lastProviderError = error?.message || String(error);
      console.warn(`[${this.loggerPrefix}] Provider request failed for ${key} after ${this.lastProviderDurationMs}ms:`, this.lastProviderError);
      throw error;
    }
  }

  private withTimeout<T>(request: Promise<T>, key: string) {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<T>((_resolve, reject) => {
      timeout = setTimeout(() => {
        reject(new Error(`Provider request timed out after ${this.timeoutMs}ms for ${key}`));
      }, this.timeoutMs);
    });

    return Promise.race([request, timeoutPromise]).finally(() => {
      if (timeout) clearTimeout(timeout);
    });
  }

  private async fetchWithRetry<T>(key: string, fetchFn: () => Promise<T>): Promise<T> {
    for (let attempt = 1; attempt <= this.retryCount; attempt++) {
      try {
        const data = await fetchFn();
        if (this.isRateLimitedResult(data) && attempt < this.retryCount) {
          await this.sleepForRetry(key, attempt);
          continue;
        }
        return data;
      } catch (error: any) {
        if (attempt >= this.retryCount) throw error;
        await this.sleepForRetry(key, attempt, error);
      }
    }

    return fetchFn();
  }

  private isFailedProviderResult(data: unknown) {
    return Boolean(data && typeof data === "object" && (data as { success?: boolean }).success === false);
  }

  private isRateLimitedResult(data: unknown) {
    if (!this.isFailedProviderResult(data)) return false;
    return hasRateLimitSignal((data as { error?: unknown }).error || data);
  }

  private async sleepForRetry(key: string, attempt: number, error?: unknown) {
    const sleepTime = attempt * this.retryDelayMs;
    const reason = error ? `error: ${(error as Error)?.message || error}` : "rate limited";
    console.warn(`[${this.loggerPrefix}] ${reason} for ${key}. Retry ${attempt}/${this.retryCount} in ${sleepTime}ms.`);
    await new Promise((resolve) => setTimeout(resolve, sleepTime));
  }
}
