"use client";

import { clientAvailabilityQueue, clientInFlightRequests } from "./api-instances";
export { clientAvailabilityQueue, clientInFlightRequests };

function stableStringify(value: unknown): string {
  if (!value || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
    .join(",")}}`;
}

export async function postJson<T>(url: string, body: unknown): Promise<T> {
  const payload = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const priority = payload.priority === true;
  const requestBody = priority
    ? Object.fromEntries(Object.entries(payload).filter(([key]) => key !== "priority"))
    : body;
  const key = `${url}:${stableStringify(requestBody)}`;
  const inFlight = clientInFlightRequests.get(key);
  if (inFlight) return inFlight as Promise<T>;

  const runFetch = () => fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(requestBody),
  })
    .then(async (response) => {
      const data = await response.json();
      if (!response.ok || data?.error) {
        throw new Error(data?.error || "RailRoute request failed");
      }
      return data as T;
    });

  const request = url === "/api/availability" && !priority
    ? clientAvailabilityQueue.add(runFetch)
    : runFetch();

  const trackedRequest = request.finally(() => {
    clientInFlightRequests.delete(key);
  });

  clientInFlightRequests.set(key, trackedRequest);
  return trackedRequest;
}
