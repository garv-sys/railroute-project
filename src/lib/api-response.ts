import { NextResponse } from "next/server";
import { buildTrustMeta, type TrustInput, type TrustMeta } from "@/lib/confidence";

type ApiResponseOptions<T> = {
  data: T;
  meta: TrustMeta;
  requestId?: string;
  status?: number;
  extra?: Record<string, unknown>;
};

type ApiFailureOptions = {
  error: string;
  requestId?: string;
  status?: number;
  provider?: string;
  warning?: string;
  trust?: TrustInput;
  extra?: Record<string, unknown>;
};

export function apiSuccess<T>({ data, meta, requestId, status = 200, extra = {} }: ApiResponseOptions<T>) {
  return NextResponse.json({
    ...extra,
    success: true,
    requestId,
    data,
    meta,
  }, { status });
}

export function apiFailure({
  error,
  requestId,
  status = 500,
  provider = "RailRoute API",
  warning,
  trust,
  extra = {},
}: ApiFailureOptions) {
  const message = warning || error;
  return NextResponse.json({
    ...extra,
    success: false,
    error,
    requestId,
    data: null,
    meta: buildTrustMeta({
      source: "fallback",
      provider,
      isLive: false,
      fallback: true,
      warning: message,
      ...trust,
    }),
  }, { status });
}

export function validationFailure(error: string, requestId?: string) {
  return apiFailure({
    error,
    requestId,
    status: 400,
    provider: "RailRoute validation",
  });
}
