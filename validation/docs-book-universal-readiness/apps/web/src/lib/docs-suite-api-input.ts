import type { NextRequest } from "next/server";

const MAXIMUM_BODY_BYTES = 4_000_000;

export async function readBoundedJson(request: NextRequest): Promise<unknown> {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (!Number.isFinite(contentLength) || contentLength > MAXIMUM_BODY_BYTES) {
    throw new Error("DOCS_SUITE_API_BODY_TOO_LARGE");
  }
  const source = await request.text();
  if (!source.trim() || Buffer.byteLength(source, "utf8") > MAXIMUM_BODY_BYTES) {
    throw new Error("DOCS_SUITE_API_BODY_INVALID");
  }
  return JSON.parse(source) as unknown;
}
