import type {
  LegacyWebsiteBookArtBatchInputV1,
  LegacyWebsiteBookArtBatchResultV1,
} from "./book-production-legacy-state-batch.js";
import {
  importLegacyWebsiteBookArtStateBatch as importLegacyWebsiteBookArtStateBatchUnchecked,
} from "./book-production-legacy-state-batch.js";

export type {
  LegacyWebsiteBookArtBatchInputV1,
  LegacyWebsiteBookArtBatchItemResultV1,
  LegacyWebsiteBookArtBatchItemV1,
  LegacyWebsiteBookArtBatchResultV1,
} from "./book-production-legacy-state-batch.js";

/**
 * Public batch entrypoint. Every declared source-record fingerprint must match
 * the exact canonical legacy import input before any item can be processed.
 */
export async function importLegacyWebsiteBookArtStateBatch(
  input: LegacyWebsiteBookArtBatchInputV1,
): Promise<LegacyWebsiteBookArtBatchResultV1> {
  const sourceBlockers: string[] = [];
  for (const item of Array.isArray(input?.items) ? input.items : []) {
    const expected = await sha256(canonicalJson(item?.input));
    const supplied = normalizeSha(item?.sourceRecordFingerprint);
    if (!supplied || supplied !== expected) {
      sourceBlockers.push(`Legacy Website Book Art item ${text(item?.migrationItemId) || "unknown"} source record fingerprint does not match its exact canonical input.`);
    }
  }

  const result = await importLegacyWebsiteBookArtStateBatchUnchecked(input);
  if (!sourceBlockers.length) return result;
  const withoutFingerprint: Omit<LegacyWebsiteBookArtBatchResultV1, "batchFingerprint"> = {
    ...result,
    status: "blocked",
    processedMigrationItemIds: [],
    itemResults: [],
    counts: {
      expected: result.counts.expected,
      processed: 0,
      candidateImported: 0,
      selectionEvidenceImported: 0,
      blocked: 0,
    },
    blockers: unique([...result.blockers, ...sourceBlockers]),
    warnings: unique(result.warnings),
    authoritativeWritesPerformed: false,
    promotionRequired: true,
    artifactBytesRewritten: false,
    publicationPerformed: false,
  };
  return {
    ...withoutFingerprint,
    batchFingerprint: await sha256(canonicalJson(withoutFingerprint)),
  };
}

export async function fingerprintLegacyWebsiteBookArtSourceRecord(value: unknown): Promise<string> {
  return sha256(canonicalJson(value));
}

function canonicalJson(value: unknown): string { return JSON.stringify(canonical(value)); }
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, canonical(item)]));
  }
  return value;
}
async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
function normalizeSha(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.replace(/^sha256:/, "");
  return /^[a-f0-9]{64}$/.test(normalized) ? normalized : undefined;
}
function text(value: unknown): string { return typeof value === "string" ? value : ""; }
function unique(values: string[]): string[] { return [...new Set(values.map((item) => item.trim()).filter(Boolean))]; }
