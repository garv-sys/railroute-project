export type LookupTrustStatus =
  | "VERIFIED"
  | "PROVIDER_UNAVAILABLE"
  | "NOT_CHECKED"
  | "RATE_LIMITED"
  | "CACHE_ONLY";

export type LookupProof = {
  trainNo: string;
  source: string;
  destination: string;
  date: string;
  classType: string;
  quota: string;
};

export function lookupStatusFromReason(reason: unknown): LookupTrustStatus {
  const text = String(reason || "").toLowerCase();
  if (/rate.?limit|too many requests|429|quota exceeded|delayed this exact request|usage limit exceeded|billing cycle/.test(text)) return "RATE_LIMITED";
  if (/not requested|check availability|tap class|schedule-only|schedule only|not available for booking|not bookable|not running|class does not exist|booking\/cancellation not allowed|does not exist in this train|sorry[, ]+this train is not available|train not on scheduled date/.test(text)) return "NOT_CHECKED";
  if (/cached/.test(text)) return "CACHE_ONLY";
  return "PROVIDER_UNAVAILABLE";
}

export function availabilityReasonForStatus(status: LookupTrustStatus, classCode: string, reason?: unknown) {
  const detail = String(reason || "").trim();
  if (status === "VERIFIED") return "Provider returned availability for this exact train/class/date.";
  if (status === "NOT_CHECKED") return `Availability not requested yet for ${classCode}.`;
  if (status === "RATE_LIMITED") return `Live seat check queued for ${classCode}.`;
  if (status === "CACHE_ONLY") return `Cached schedule only; availability was not live-verified for ${classCode}.`;
  if (detail && !/live data unavailable/i.test(detail)) {
    const sanitized = detail.replace(/sorry[, ]+this train is not available for booking for this date/gi, "Booking not open yet")
      .replace(/not available for booking/gi, "Not available")
      .replace(/not bookable/gi, "Not available")
      .replace(/not running/gi, "Not running")
      .replace(/class does not exist in this train for this train route/gi, "Class not available")
      .replace(/train not on scheduled date/gi, "Not running");
    return sanitized;
  }
  return `Provider did not return availability for ${classCode} on the selected train/date/quota.`;
}

export function fareReasonForStatus(status: LookupTrustStatus, reason?: unknown) {
  const detail = String(reason || "").trim();
  if (status === "VERIFIED") return "Provider returned fare for this exact train/class/date.";
  if (status === "NOT_CHECKED") return "Fare not requested yet.";
  if (status === "RATE_LIMITED") return "Estimated fare shown until live fare returns.";
  if (status === "CACHE_ONLY") return "Cached schedule only; fare was not live-verified.";
  if (detail && !/live fare unavailable/i.test(detail)) {
    const sanitized = detail.replace(/sorry[, ]+this train is not available for booking for this date/gi, "Booking not open yet")
      .replace(/not available for booking/gi, "Not available")
      .replace(/not bookable/gi, "Not available")
      .replace(/not running/gi, "Not running")
      .replace(/class does not exist in this train for this train route/gi, "Class not available")
      .replace(/train not on scheduled date/gi, "Not running");
    return sanitized;
  }
  return "Provider did not return fare for the selected train/class/date/quota.";
}

export function makeLookupProof(input: LookupProof): LookupProof {
  return {
    trainNo: String(input.trainNo || ""),
    source: String(input.source || "").toUpperCase(),
    destination: String(input.destination || "").toUpperCase(),
    date: String(input.date || ""),
    classType: String(input.classType || "").toUpperCase(),
    quota: String(input.quota || "GN").toUpperCase(),
  };
}
