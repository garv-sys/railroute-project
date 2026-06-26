import { ZodError } from "zod";

import { apiFailure, apiSuccess, validationFailure } from "@/lib/api-response";
import { availabilityReasonForStatus, fareReasonForStatus } from "@/lib/railway-trust";
import { getClientIp, isRateLimited } from "@/lib/rate-limiter";
import { getVerifiedAvailability } from "@/services/availabilityService";

// The client (ClassRateStrip) already waits up to 22s for a live quote — give the
// function room to match that instead of risking a platform-default timeout cutting
// it off first.
export const maxDuration = 30;

export async function POST(request: Request) {
  const requestId = `avail_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const ip = getClientIp(request);
  if (isRateLimited(`avail_${ip}`, 150, 60 * 1000)) {
    return apiFailure({
      error: "Too many requests. Please try again later.",
      requestId,
      status: 429,
      provider: "Rate Limiter",
    });
  }
	  try {
	    const body = await request.json();
	    const result = await getVerifiedAvailability(body);
	    const debug = body?.debug === true || body?.debug === "true";
	    if (!result.success) {
	      const isRateLimit = result.data?.availabilityStatus === "RATE_LIMITED" || /rate|429|limit/i.test(result.data?.reason || "");
	      const status = isRateLimit ? 429 : 400;
	      return apiFailure({
	        error: result.data?.reason || "Provider request failed",
	        requestId,
	        status,
	        provider: result.provider,
	        warning: result.meta?.warning,
	        extra: {
	          debugTrace: result.rawProviderResponse ? {
	            providerSource: result.provider,
	            apiEndpoint: `availability:${result.data?.trainNo}:${result.data?.source}:${result.data?.destination}:${result.data?.date}:${result.data?.classType}:${result.data?.quota}`,
	            selectedClass: result.data?.classType,
	            providerReturnedClass: result.data?.classType,
	            availabilityResponse: result.rawProviderResponse?.data?.availability ?? null,
	            fareResponse: result.rawProviderResponse?.data?.fare ?? null,
	            rawResponse: result.rawProviderResponse,
	            mappedResponse: result.data,
	            renderedResponse: result.data,
	          } : undefined,
	        }
	      });
	    }
	    const availabilityText = result.data.availabilityText ?? availabilityReasonForStatus(
	      result.data.availabilityStatus,
	      result.data.classType,
	      result.data.reason
	    );
	    const row = {
      date: result.data.date,
      availabilityText,
      status: availabilityText,
      // IMPORTANT: never use "unavailable" here when we have real data — even an
      // approximate date match has a real availability text and fare.  Using "unavailable"
      // causes liveQuoteFromResponse to suppress the data entirely (shows "Not returned").
      source: result.data.exactDate
        ? "date-specific-provider"
        : (result.data.availabilityText || result.data.fare)
          ? "approximate"
          : "unavailable",
      reason: result.data.reason,
      seats: result.data.seats,
      fare: result.data.fare,
      availabilityStatus: result.data.availabilityStatus,
      fareStatus: result.data.fareStatus,
      lookupReason: result.data.lookupReason,
      proof: result.data.proof,
    };

    if (!result.data.exactDate) {
      console.warn("[api/availability] Selected-date availability unavailable", {
        requestId,
        trainNo: result.data.trainNo,
        source: result.data.source,
        destination: result.data.destination,
        date: result.data.date,
        classType: result.data.classType,
        quota: result.data.quota,
        reason: result.data.reason,
      });
    }

	    const responseData = {
	      trainNo: result.data.trainNo,
	      source: result.data.source,
	      destination: result.data.destination,
	      date: result.data.date,
	      classType: result.data.classType,
	      quota: result.data.quota,
	      availability: [row],
	      fare: result.data.fare ? { totalFare: result.data.fare } : null,
	      availabilityText,
	      status: result.data.status,
	      seats: result.data.seats,
	      fareSource: result.data.fareSource,
	      fareExactRequest: result.data.fareExactRequest,
	      exactDate: result.data.exactDate,
	      reason: result.data.reason,
	      availabilityStatus: result.data.availabilityStatus,
	      fareStatus: result.data.fareStatus,
	      lookupReason: result.data.lookupReason,
	      fareWarning: fareReasonForStatus(result.data.fareStatus, result.data.reason),
	      proof: result.data.proof,
	    };

	    return apiSuccess({
	      requestId,
	      data: responseData,
	      meta: result.meta,
	      extra: {
	        provider: result.provider,
	        warning: result.meta.warning,
	        debugTrace: debug ? {
	          providerSource: result.provider,
	          apiEndpoint: `availability:${result.data.trainNo}:${result.data.source}:${result.data.destination}:${result.data.date}:${result.data.classType}:${result.data.quota}`,
	          selectedClass: result.data.classType,
	          providerReturnedClass: result.data.classType,
	          availabilityResponse: result.rawProviderResponse?.data?.availability ?? null,
	          fareResponse: result.rawProviderResponse?.data?.fare ?? null,
	          rawResponse: result.rawProviderResponse,
	          mappedResponse: result.data,
	          renderedResponse: responseData,
	        } : undefined,
	      },
	    });
  } catch (error: any) {
    if (error instanceof ZodError) {
      return validationFailure(error.issues[0]?.message || "Invalid availability request", requestId);
    }
    console.error("[api/availability] Error", { requestId, error });
    return apiFailure({ error: "Internal server error", requestId, provider: "RailRoute availability API" });
  }
}
