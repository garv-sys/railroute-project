import { NextRequest } from "next/server";

type RateLimitRecord = {
  timestamps: number[];
};

const store = new Map<string, RateLimitRecord>();

// Clean up old entries periodically to prevent memory leaks
if (typeof globalThis !== "undefined") {
  const globalAny = globalThis as any;
  if (!globalAny.rateLimitCleanupInterval) {
    globalAny.rateLimitCleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [key, record] of store.entries()) {
        const activeTimestamps = record.timestamps.filter((t) => now - t < 10 * 60 * 1000);
        if (activeTimestamps.length === 0) {
          store.delete(key);
        } else {
          record.timestamps = activeTimestamps;
        }
      }
    }, 5 * 60 * 1000); // Clean up every 5 minutes
  }
}

export function getClientIp(request: Request | NextRequest): string {
  const headers = request.headers;
  let ip = headers.get("x-forwarded-for") || headers.get("x-real-ip") || "";
  if (ip) {
    ip = ip.split(",")[0].trim();
  }
  return ip || "127.0.0.1";
}

export function isRateLimited(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  let record = store.get(key);

  if (!record) {
    record = { timestamps: [] };
    store.set(key, record);
  }

  // Filter timestamps within the sliding window
  record.timestamps = record.timestamps.filter((t) => now - t < windowMs);

  if (record.timestamps.length >= limit) {
    return true;
  }

  record.timestamps.push(now);
  return false;
}
