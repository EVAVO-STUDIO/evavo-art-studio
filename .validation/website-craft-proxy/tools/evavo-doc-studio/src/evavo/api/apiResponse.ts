import { NextResponse } from "next/server";

export interface EvavoApiError {
  code: string;
  message: string;
  details?: unknown;
}

function meta(requestId?: string) {
  return {
    requestId: requestId ?? crypto.randomUUID(),
    createdAt: new Date().toISOString()
  };
}

export function apiOk<T>(data: T, init?: { status?: number; requestId?: string }) {
  return NextResponse.json({
    ok: true as const,
    data,
    meta: meta(init?.requestId)
  }, { status: init?.status ?? 200 });
}

export function apiFail(error: EvavoApiError, init?: { status?: number; requestId?: string }) {
  return NextResponse.json({
    ok: false as const,
    error,
    meta: meta(init?.requestId)
  }, { status: init?.status ?? 500 });
}
