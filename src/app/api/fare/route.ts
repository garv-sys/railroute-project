import { ZodError } from "zod";

import { apiFailure, apiSuccess, validationFailure } from "@/lib/api-response";
import { getClientIp, isRateLimited } from "@/lib/rate-limiter";
import { getVerifiedFare } from "@/services/fareService";

function compact(value: unknown) {
  try {
    const text = JSON.stringify(value);
    return text.length > 1600 ? `${text.slice(0, 1600)}...` : text;
  } catch {
    return String(value);
  }
}

export async function POST(request: Request) {
  const requestId = `fare_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const ip = getClientIp(request);
  if (isRateLimited(`fare_${ip}`, 15, 60 * 1000)) {
    return apiFailure({
      error: "Too many requests. Please try again later.",
      requestId,
      status: 429,
      provider: "Rate Limiter",
    });
  }
	  try {
	    const body = await request.json();
	    const result = await getVerifiedFare(body);
	    const debug = body?.debug === true || body?.debug === "true";

    if (result.warning) {
      console.warn("[api/fare] Some class fares unavailable", {
        requestId,
        trainNo: result.trainNo,
        source: result.source,
        destination: result.destination,
        date: result.date,
        classType: result.classType,
        quota: result.quota,
        warning: result.warning,
        rows: compact(result.fareTable.map((row) => ({
          classCode: row.classCode,
          fare: row.fare,
          availability: row.availability,
          source: row.source,
        }))),
      });
    }

	    const responseData = {
	      trainNo: result.trainNo,
	      source: result.source,
	      destination: result.destination,
	      date: result.date,
	      classType: result.classType,
	      quota: result.quota,
	      classes: result.classes,
	      fare: result.fare,
	      dateSpecificFare: result.dateSpecificFare,
	      fareKind: result.fareKind,
	      fareIsDateSpecific: result.fareIsDateSpecific,
	      fareTable: result.fareTable,
	      warning: result.warning,
	      sourceType: result.sourceType,
	    };

	    return apiSuccess({
	      requestId,
	      data: responseData,
	      meta: result.meta,
	      extra: {
        trainNo: result.trainNo,
        source: result.source,
        destination: result.destination,
        date: result.date,
        classType: result.classType,
        quota: result.quota,
        classes: result.classes,
        fare: result.fare,
        dateSpecificFare: result.dateSpecificFare,
        fareKind: result.fareKind,
        fareIsDateSpecific: result.fareIsDateSpecific,
        fareTable: result.fareTable,
	        warning: result.warning,
	        sourceType: result.sourceType,
	        debugTrace: debug ? {
	          providerSource: "irctc-connect availability provider",
	          apiEndpoint: `fare-via-availability:${result.trainNo}:${result.source}:${result.destination}:${result.date}:${result.classType}:${result.quota}`,
	          selectedClass: result.classType,
	          providerReturnedClass: result.classes,
	          availabilityResponse: result.availabilityResults.map((item) => item.rawProviderResponse?.data?.availability ?? null),
	          fareResponse: result.availabilityResults.map((item) => item.rawProviderResponse?.data?.fare ?? null),
	          rawResponse: result.availabilityResults.map((item) => item.rawProviderResponse),
	          mappedResponse: result.availabilityResults.map((item) => item.data),
	          renderedResponse: responseData,
	        } : undefined,
	      },
	    });
  } catch (error: any) {
    if (error instanceof ZodError) {
      return validationFailure(error.issues[0]?.message || "Invalid fare request", requestId);
    }
    console.error("[api/fare] Error", { requestId, error });
    return apiFailure({ error: "Internal server error", requestId, provider: "RailRoute fare API" });
  }
}
