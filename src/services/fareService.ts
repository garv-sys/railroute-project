import { z } from "zod";

import {
  ALL_STANDARD_CLASSES,
  availabilityRequestSchema,
  getVerifiedAvailability,
  type AvailabilityServiceResult,
} from "@/services/availabilityService";
import { buildTrustMeta, type TrustMeta } from "@/lib/confidence";
import { fareReasonForStatus, type LookupProof, type LookupTrustStatus } from "@/lib/railway-trust";

export const fareRequestSchema = availabilityRequestSchema.extend({
  classType: z.string().trim().min(1).transform((value) => value.toUpperCase()).default("ALL"),
});

export type FareRow = {
  classCode: string;
  quota: string;
  fare: number | null;
  availability: string | null;
  status: string;
  seats: number | null;
  source: "date-specific-provider" | "unavailable";
  fareKind: "date-specific" | "unavailable";
  isDateSpecific: boolean;
  warning?: string;
  issueCode?: "SUSPECT_PROVIDER_MAPPING";
  availabilityStatus?: LookupTrustStatus;
  fareStatus?: LookupTrustStatus;
  lookupReason?: string;
  proof?: LookupProof;
};

export type FareServiceResult = {
  success: boolean;
  trainNo: string;
  source: string;
  destination: string;
  date: string;
  classType: string;
  quota: string;
  classes: string[];
  fare: number | null;
  dateSpecificFare: number | null;
  fareKind: "date-specific" | "unavailable";
  fareIsDateSpecific: boolean;
  sourceType: "date-specific-provider" | "unavailable";
  fareTable: FareRow[];
  warning: string;
  meta: TrustMeta;
  availabilityResults: AvailabilityServiceResult[];
};

function requestedClassList(value: string) {
  if (value === "ALL") return [...ALL_STANDARD_CLASSES];
  return Array.from(new Set(value.split(",").map((item) => item.trim().toUpperCase()).filter(Boolean)));
}

function hideSuspectFares(rows: FareRow[]) {
  const fareRows = rows.filter((row) => row.source === "date-specific-provider" && typeof row.fare === "number" && row.fare > 0);
  const uniqueFares = new Set(fareRows.map((row) => row.fare));
  const uniqueClasses = new Set(fareRows.map((row) => row.classCode));
  if (fareRows.length < 3 || uniqueFares.size !== 1 || uniqueClasses.size < 3) return rows;

  return rows.map((row) => {
    if (!fareRows.some((fareRow) => fareRow.classCode === row.classCode)) return row;
    return {
      ...row,
      fare: null,
      fareKind: "unavailable" as const,
      isDateSpecific: false,
      issueCode: "SUSPECT_PROVIDER_MAPPING" as const,
      fareStatus: "PROVIDER_UNAVAILABLE" as const,
      warning: "SUSPECT_PROVIDER_MAPPING: provider returned identical fare across multiple classes; fare hidden for trust.",
    };
  });
}

export async function getVerifiedFare(input: unknown): Promise<FareServiceResult> {
  const params = fareRequestSchema.parse(input);
  const classes = requestedClassList(params.classType);
  const availabilityResults = await Promise.all(
    classes.map(async (classCode) => {
      try {
        return await getVerifiedAvailability({ ...params, classType: classCode });
      } catch (err: any) {
        console.warn(`[fareService] getVerifiedAvailability failed for class ${classCode}:`, err?.message || err);
        // Return a minimal unavailable result so one failure doesn't blank the whole fare table
        return {
          success: false,
          data: {
            ...params,
            classType: classCode,
            availabilityText: null,
            status: 'UNAVAILABLE' as const,
            seats: null,
            availabilitySource: 'unavailable' as const,
            fare: null,
            fareSource: 'unavailable' as const,
            fareExactRequest: false,
            exactDate: false,
            availabilityStatus: 'PROVIDER_UNAVAILABLE' as const,
            fareStatus: 'PROVIDER_UNAVAILABLE' as const,
            lookupReason: `Error fetching availability: ${err?.message || 'unknown error'}`,
            proof: { trainNo: params.trainNo, source: params.source, destination: params.destination, date: params.date, classType: classCode, quota: params.quota },
            reason: err?.message || 'unknown error',
            provider: 'irctc-connect',
            rawAvailabilityRows: [],
            providerFare: null,
          },
          provider: 'irctc-connect',
          meta: buildTrustMeta({ source: 'unavailable', provider: 'irctc-connect', isLive: false, warning: err?.message || 'unknown error' }),
        } as AvailabilityServiceResult;
      }
    })
  );
  const rows: FareRow[] = availabilityResults.map((result, index) => {
    const classCode = classes[index];
    return {
      classCode,
      quota: params.quota,
      fare: result.data.fare,
      availability: result.data.availabilityText,
      status: result.data.status,
      seats: result.data.seats,
      source: result.data.fareSource,
      fareKind: result.data.fare && result.data.fare > 0 ? "date-specific" : "unavailable",
      isDateSpecific: Boolean(result.data.fare && result.data.fare > 0),
      warning: result.data.fare ? undefined : fareReasonForStatus(result.data.fareStatus, result.data.reason),
      availabilityStatus: result.data.availabilityStatus,
      fareStatus: result.data.fareStatus,
      lookupReason: result.data.lookupReason,
      proof: result.data.proof,
    };
  });

  const trustworthyRows = hideSuspectFares(rows);
  const renderRows = params.classType === "ALL"
    ? trustworthyRows.filter((row) => row.source === "date-specific-provider" || row.availability)
    : trustworthyRows;
  const dateSpecificRows = renderRows.filter((row) => row.source === "date-specific-provider" && row.fare && row.fare > 0);
  const warnings = trustworthyRows
    .filter((row) => !row.fare)
    .map((row) => `${row.classCode}: ${row.warning || fareReasonForStatus(row.fareStatus || "PROVIDER_UNAVAILABLE")}`);
  const warning = Array.from(new Set(warnings)).join(" ");
  const hasDateSpecificFare = dateSpecificRows.length > 0;
  const firstFare = dateSpecificRows[0]?.fare;

  return {
    success: true,
    trainNo: params.trainNo,
    source: params.source,
    destination: params.destination,
    date: params.date,
    classType: params.classType,
    quota: params.quota,
    classes: renderRows.map((row) => row.classCode),
    fare: typeof firstFare === "number" ? firstFare : null,
    dateSpecificFare: typeof firstFare === "number" ? firstFare : null,
    fareKind: hasDateSpecificFare ? "date-specific" : "unavailable",
    fareIsDateSpecific: hasDateSpecificFare,
    sourceType: hasDateSpecificFare ? "date-specific-provider" : "unavailable",
    fareTable: renderRows,
    warning,
    availabilityResults,
    meta: buildTrustMeta({
      source: hasDateSpecificFare ? "live" : "unavailable",
      provider: "irctc-connect availability provider",
      isLive: hasDateSpecificFare,
      warning: warning || undefined,
    }),
  };
}
