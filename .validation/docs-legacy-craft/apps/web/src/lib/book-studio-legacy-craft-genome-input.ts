import type { NextRequest } from "next/server";

export const BOOK_LEGACY_CRAFT_GENOME_MAX_BODY_BYTES = 8 * 1024 * 1024;

export async function readBoundedBookLegacyCraftGenomeJson(request: NextRequest): Promise<unknown> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    const contentLength = Number(declaredLength);
    if (!Number.isFinite(contentLength) || contentLength < 0 || contentLength > BOOK_LEGACY_CRAFT_GENOME_MAX_BODY_BYTES) {
      throw new Error("DOCS_BOOK_LEGACY_CRAFT_BODY_TOO_LARGE");
    }
  }
  const source = await request.text();
  if (!source.trim()) throw new Error("DOCS_BOOK_LEGACY_CRAFT_BODY_INVALID");
  if (Buffer.byteLength(source, "utf8") > BOOK_LEGACY_CRAFT_GENOME_MAX_BODY_BYTES) {
    throw new Error("DOCS_BOOK_LEGACY_CRAFT_BODY_TOO_LARGE");
  }
  try {
    return JSON.parse(source) as unknown;
  } catch {
    throw new Error("DOCS_BOOK_LEGACY_CRAFT_BODY_INVALID");
  }
}
