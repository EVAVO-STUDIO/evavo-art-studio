import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  compileApprovedSourcesManifest,
  type TileMapApprovedSourcesManifest,
} from "./tile-map-approved-sources.js";

type JsonObject = Record<string, unknown>;

export type ReviewedTileMapApprovedSourcesManifest = Omit<
  TileMapApprovedSourcesManifest,
  "manifest_fingerprint"
> & {
  pre_review_manifest_fingerprint: string;
  source_review_path: string;
  source_review_sha256: string;
  source_review_fingerprint: string;
  source_provider_batch_path: string;
  source_provider_batch_sha256: string;
  source_provider_batch_fingerprint: string;
  source_execution_receipt_path: string;
  source_execution_receipt_sha256: string;
  source_execution_sha256: string;
  source_mastering_receipt_path: string;
  source_mastering_receipt_sha256: string;
  source_mastering_sha256: string;
  provider_results_path: string;
  provider_results_sha256: string;
  provider_results_fingerprint: string;
  candidate_root: string;
  review_finalization_path: string;
  review_finalization_sha256: string;
  review_finalization_fingerprint: string;
  manifest_fingerprint: string;
};

export async function compileReviewedApprovedSourcesManifest(
  sourcePackagePath: string,
  reviewPath: string,
  finalizationPath: string,
): Promise<ReviewedTileMapApprovedSourcesManifest> {
  const [packageBytes, reviewBytes, finalizationBytes] = await Promise.all([
    readFile(sourcePackagePath),
    readFile(reviewPath),
    readFile(finalizationPath),
  ]);
  const sourcePackage = parseObject(
    packageBytes.toString("utf8"),
    sourcePackagePath,
  );
  const review = parseObject(reviewBytes.toString("utf8"), reviewPath);
  const finalization = parseObject(
    finalizationBytes.toString("utf8"),
    finalizationPath,
  );
  if (
    sourcePackage.schema_version !== 1 ||
    sourcePackage.status !== "ready-for-candidate-authoring"
  ) {
    throw failure(
      "EVAVO_TILE_MAP_REVIEWED_APPROVAL_PACKAGE",
      "source package must be schema v1 and ready-for-candidate-authoring",
    );
  }
  if (review.schema_version !== 1 || review.status !== "awaiting-review") {
    throw failure(
      "EVAVO_TILE_MAP_REVIEWED_APPROVAL_REVIEW",
      "review must be schema v1 and awaiting-review",
    );
  }
  if (
    finalization.schema_version !== 1 ||
    finalization.status !== "review-finalized"
  ) {
    throw failure(
      "EVAVO_TILE_MAP_REVIEWED_APPROVAL_FINALIZATION",
      "finalization must be schema v1 and review-finalized",
    );
  }

  const packageFingerprint = verifiedFingerprint(
    sourcePackage,
    "package_fingerprint",
    "source package",
  );
  const reviewFingerprint = verifiedFingerprint(
    review,
    "review_fingerprint",
    "candidate review",
  );
  const finalizationFingerprint = verifiedFingerprint(
    finalization,
    "finalization_fingerprint",
    "review finalization",
  );
  const sourceMapFingerprint = sha256Hex(
    sourcePackage.source_map_fingerprint,
    "source package source_map_fingerprint",
  );
  if (
    sha256Hex(
      review.source_package_fingerprint,
      "review.source_package_fingerprint",
    ) !== packageFingerprint ||
    sha256Hex(
      finalization.source_package_fingerprint,
      "finalization.source_package_fingerprint",
    ) !== packageFingerprint
  ) {
    throw failure(
      "EVAVO_TILE_MAP_REVIEWED_APPROVAL_DRIFT",
      "review/finalization do not target the exact source package",
    );
  }
  if (
    sha256Hex(
      finalization.source_review_fingerprint,
      "finalization.source_review_fingerprint",
    ) !== reviewFingerprint
  ) {
    throw failure(
      "EVAVO_TILE_MAP_REVIEWED_APPROVAL_DRIFT",
      "finalization does not target the exact review manifest",
    );
  }
  if (
    sha256Hex(
      review.source_map_fingerprint,
      "review.source_map_fingerprint",
    ) !== sourceMapFingerprint ||
    sha256Hex(
      finalization.source_map_fingerprint,
      "finalization.source_map_fingerprint",
    ) !== sourceMapFingerprint
  ) {
    throw failure(
      "EVAVO_TILE_MAP_REVIEWED_APPROVAL_DRIFT",
      "review/finalization semantic map fingerprint is stale",
    );
  }
  if (
    review.map_id !== sourcePackage.map_id ||
    finalization.map_id !== sourcePackage.map_id
  ) {
    throw failure(
      "EVAVO_TILE_MAP_REVIEWED_APPROVAL_DRIFT",
      "map_id differs across source package, review and finalization",
    );
  }
  if (
    review.projection !== sourcePackage.projection ||
    finalization.projection !== sourcePackage.projection
  ) {
    throw failure(
      "EVAVO_TILE_MAP_REVIEWED_APPROVAL_DRIFT",
      "projection differs across source package, review and finalization",
    );
  }

  const reviewAuthority = object(review.authority, "review.authority");
  if (
    reviewAuthority.execution_evidence_required !== true ||
    reviewAuthority.deterministic_mastering_required !== true ||
    reviewAuthority.mastering_quality_required !== true ||
    reviewAuthority.provider_authority !== "intermediate-only" ||
    reviewAuthority.review_authority !== "art-studio"
  ) {
    throw failure(
      "EVAVO_TILE_MAP_REVIEWED_APPROVAL_AUTHORITY",
      "candidate review does not preserve execution/mastering/approval boundaries",
    );
  }

  const providerBatchRecord = await readBoundJson(
    review.source_provider_batch_path,
    review.source_provider_batch_sha256,
    "Tile Map provider runtime batch",
  );
  const providerBatchFingerprint = verifiedFingerprint(
    providerBatchRecord.value,
    "provider_batch_fingerprint",
    "provider runtime batch",
  );
  if (
    providerBatchFingerprint !==
    sha256Hex(
      review.source_provider_batch_fingerprint,
      "review.source_provider_batch_fingerprint",
    )
  ) {
    throw failure(
      "EVAVO_TILE_MAP_REVIEWED_APPROVAL_DRIFT",
      "review provider-batch fingerprint is stale",
    );
  }

  const executionRecord = await readBoundJson(
    review.source_execution_receipt_path,
    review.source_execution_receipt_sha256,
    "Tile Map provider execution receipt",
  );
  const executionSha256 = verifiedSealedDocument(
    executionRecord.value,
    "executionSha256",
    "provider execution receipt",
  );
  if (
    executionSha256 !==
    sha256Hex(
      review.source_execution_sha256,
      "review.source_execution_sha256",
    )
  ) {
    throw failure(
      "EVAVO_TILE_MAP_REVIEWED_APPROVAL_DRIFT",
      "review provider-execution fingerprint is stale",
    );
  }

  const masteringRecord = await readBoundJson(
    review.source_mastering_receipt_path,
    review.source_mastering_receipt_sha256,
    "Tile Map candidate mastering receipt",
  );
  const masteringSha256 = verifiedSealedDocument(
    masteringRecord.value,
    "masteringSha256",
    "candidate mastering receipt",
  );
  if (
    masteringSha256 !==
    sha256Hex(
      review.source_mastering_sha256,
      "review.source_mastering_sha256",
    )
  ) {
    throw failure(
      "EVAVO_TILE_MAP_REVIEWED_APPROVAL_DRIFT",
      "review mastering fingerprint is stale",
    );
  }

  const providerResultsPath = absolutePath(
    review.provider_results_path,
    "review.provider_results_path",
  );
  const candidateRoot = absolutePath(
    review.candidate_root,
    "review.candidate_root",
  );
  if (candidateRoot !== path.dirname(providerResultsPath)) {
    throw failure(
      "EVAVO_TILE_MAP_REVIEWED_APPROVAL_ROOT",
      "review candidate_root must equal the provider-results directory",
    );
  }
  const providerResultsBytes = await readFile(providerResultsPath);
  if (
    sha256(providerResultsBytes) !==
    sha256Hex(
      review.provider_results_sha256,
      "review.provider_results_sha256",
    )
  ) {
    throw failure(
      "EVAVO_TILE_MAP_REVIEWED_APPROVAL_DRIFT",
      "provider results bytes changed after candidate review intake",
    );
  }
  const providerResults = parseObject(
    providerResultsBytes.toString("utf8"),
    "provider results",
  );
  const providerResultsFingerprint = verifiedFingerprint(
    providerResults,
    "results_fingerprint",
    "provider results",
  );
  if (
    providerResultsFingerprint !==
      sha256Hex(
        review.provider_results_fingerprint,
        "review.provider_results_fingerprint",
      ) ||
    providerResults.schema_version !== 2 ||
    providerResults.source_map_fingerprint !== sourceMapFingerprint ||
    providerResults.source_provider_batch_path !== providerBatchRecord.path ||
    providerResults.source_provider_batch_sha256 !==
      sha256(providerBatchRecord.bytes) ||
    providerResults.source_provider_batch_fingerprint !==
      providerBatchFingerprint ||
    providerResults.source_execution_receipt_path !== executionRecord.path ||
    providerResults.source_execution_receipt_sha256 !==
      sha256(executionRecord.bytes) ||
    providerResults.source_execution_sha256 !== executionSha256 ||
    providerResults.source_mastering_receipt_path !== masteringRecord.path ||
    providerResults.source_mastering_receipt_sha256 !==
      sha256(masteringRecord.bytes) ||
    providerResults.source_mastering_sha256 !== masteringSha256
  ) {
    throw failure(
      "EVAVO_TILE_MAP_REVIEWED_APPROVAL_DRIFT",
      "provider results do not bind the exact provider/mastering evidence",
    );
  }

  const reviewCandidates = new Map<string, JsonObject>();
  for (const [index, item] of array(
    review.candidates,
    "review.candidates",
  ).entries()) {
    const candidate = object(item, `review.candidates[${index}]`);
    const id = text(
      candidate.candidate_id,
      `review.candidates[${index}].candidate_id`,
    );
    if (reviewCandidates.has(id)) {
      throw failure(
        "EVAVO_TILE_MAP_REVIEWED_APPROVAL_SET",
        `duplicate review candidate ${id}`,
      );
    }
    reviewCandidates.set(id, candidate);
  }
  const finalizedCandidates = new Map<string, JsonObject>();
  for (const [index, item] of array(
    finalization.candidates,
    "finalization.candidates",
  ).entries()) {
    const candidate = object(item, `finalization.candidates[${index}]`);
    const id = text(
      candidate.candidate_id,
      `finalization.candidates[${index}].candidate_id`,
    );
    if (finalizedCandidates.has(id)) {
      throw failure(
        "EVAVO_TILE_MAP_REVIEWED_APPROVAL_SET",
        `duplicate finalized candidate ${id}`,
      );
    }
    finalizedCandidates.set(id, candidate);
  }
  if (reviewCandidates.size !== finalizedCandidates.size) {
    throw failure(
      "EVAVO_TILE_MAP_REVIEWED_APPROVAL_SET",
      "review and finalization candidate sets differ",
    );
  }
  for (const [candidateId, candidate] of reviewCandidates) {
    const decision = finalizedCandidates.get(candidateId);
    if (!decision) {
      throw failure(
        "EVAVO_TILE_MAP_REVIEWED_APPROVAL_SET",
        `finalization missing candidate ${candidateId}`,
      );
    }
    for (const key of [
      "task_id",
      "visual_family",
      "path",
      "sha256",
    ] as const) {
      if (decision[key] !== candidate[key]) {
        throw failure(
          "EVAVO_TILE_MAP_REVIEWED_APPROVAL_DRIFT",
          `${candidateId} ${key} changed between review and finalization`,
        );
      }
    }
  }

  const approvedTriples = new Set<string>();
  for (const candidate of finalizedCandidates.values()) {
    if (
      candidate.structural === "approved" &&
      candidate.visual === "approved" &&
      candidate.creative === "approved"
    ) {
      approvedTriples.add(
        `${candidate.task_id}\n${candidate.path}\n${candidate.sha256}`,
      );
    }
  }
  for (const [taskIndex, item] of array(
    finalization.tasks,
    "finalization.tasks",
  ).entries()) {
    const task = object(item, `finalization.tasks[${taskIndex}]`);
    const taskId = text(
      task.task_id,
      `finalization.tasks[${taskIndex}].task_id`,
    );
    for (const [sourceIndex, sourceItem] of array(
      task.approved_sources,
      `${taskId}.approved_sources`,
    ).entries()) {
      const source = object(
        sourceItem,
        `${taskId}.approved_sources[${sourceIndex}]`,
      );
      const key = `${taskId}\n${text(
        source.path,
        `${taskId}.path`,
      )}\n${sha256Hex(source.sha256, `${taskId}.sha256`)}`;
      if (!approvedTriples.has(key)) {
        throw failure(
          "EVAVO_TILE_MAP_REVIEWED_APPROVAL_BYPASS",
          `${taskId} approved source did not pass all three review gates`,
        );
      }
    }
  }

  const manifest = await compileApprovedSourcesManifest(
    sourcePackagePath,
    finalizationPath,
    candidateRoot,
  );
  const {
    manifest_fingerprint: preReviewFingerprint,
    ...manifestWithoutFingerprint
  } = manifest;
  const base = {
    ...manifestWithoutFingerprint,
    pre_review_manifest_fingerprint: preReviewFingerprint,
    source_review_path: path.resolve(reviewPath),
    source_review_sha256: sha256(reviewBytes),
    source_review_fingerprint: reviewFingerprint,
    source_provider_batch_path: providerBatchRecord.path,
    source_provider_batch_sha256: sha256(providerBatchRecord.bytes),
    source_provider_batch_fingerprint: providerBatchFingerprint,
    source_execution_receipt_path: executionRecord.path,
    source_execution_receipt_sha256: sha256(executionRecord.bytes),
    source_execution_sha256: executionSha256,
    source_mastering_receipt_path: masteringRecord.path,
    source_mastering_receipt_sha256: sha256(masteringRecord.bytes),
    source_mastering_sha256: masteringSha256,
    provider_results_path: providerResultsPath,
    provider_results_sha256: sha256(providerResultsBytes),
    provider_results_fingerprint: providerResultsFingerprint,
    candidate_root: candidateRoot,
    review_finalization_path: path.resolve(finalizationPath),
    review_finalization_sha256: sha256(finalizationBytes),
    review_finalization_fingerprint: finalizationFingerprint,
  };
  return {
    ...base,
    manifest_fingerprint: sha256(Buffer.from(canonical(base), "utf8")),
  };
}

async function readBoundJson(
  pathValue: unknown,
  expectedSha256: unknown,
  label: string,
): Promise<{ path: string; bytes: Buffer; value: JsonObject }> {
  const resolved = absolutePath(pathValue, `${label} path`);
  const bytes = await readFile(resolved);
  if (sha256(bytes) !== sha256Hex(expectedSha256, `${label} SHA-256`)) {
    throw failure(
      "EVAVO_TILE_MAP_REVIEWED_APPROVAL_DRIFT",
      `${label} bytes changed after candidate review`,
    );
  }
  return {
    path: resolved,
    bytes,
    value: parseObject(bytes.toString("utf8"), label),
  };
}

function verifiedFingerprint(
  value: JsonObject,
  field: string,
  label: string,
): string {
  const claimed = sha256Hex(value[field], `${label}.${field}`);
  const { [field]: _fingerprint, ...body } = value;
  const actual = sha256(Buffer.from(canonical(body), "utf8"));
  if (actual !== claimed) {
    throw failure(
      "EVAVO_TILE_MAP_REVIEWED_APPROVAL_DRIFT",
      `${label} self fingerprint is invalid`,
    );
  }
  return claimed;
}

function verifiedSealedDocument(
  value: JsonObject,
  hashField: string,
  label: string,
): string {
  const claimed = sha256Hex(value[hashField], `${label}.${hashField}`);
  const runId = text(value.runId, `${label}.runId`);
  const { [hashField]: _hash, runId: _runId, ...body } = value;
  const actual = sha256(Buffer.from(canonical(body), "utf8"));
  if (actual !== claimed || runId !== claimed.slice(0, 20)) {
    throw failure(
      "EVAVO_TILE_MAP_REVIEWED_APPROVAL_DRIFT",
      `${label} self hash is invalid`,
    );
  }
  return claimed;
}

function absolutePath(value: unknown, label: string): string {
  const requested = text(value, label);
  const resolved = path.resolve(requested);
  if (resolved !== requested) {
    throw failure(
      "EVAVO_TILE_MAP_REVIEWED_APPROVAL_ROOT",
      `${label} must be absolute and normalized`,
    );
  }
  return resolved;
}
function parseObject(content: string, label: string): JsonObject {
  try {
    return object(JSON.parse(content) as unknown, label);
  } catch (error) {
    if (error instanceof Error && "code" in error) throw error;
    throw failure(
      "EVAVO_TILE_MAP_REVIEWED_APPROVAL_JSON",
      `invalid JSON in ${label}`,
    );
  }
}
function object(value: unknown, pathName: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw failure(
      "EVAVO_TILE_MAP_REVIEWED_APPROVAL_TYPE",
      `${pathName} must be object`,
    );
  }
  return value as JsonObject;
}
function array(value: unknown, pathName: string): unknown[] {
  if (!Array.isArray(value)) {
    throw failure(
      "EVAVO_TILE_MAP_REVIEWED_APPROVAL_TYPE",
      `${pathName} must be array`,
    );
  }
  return value;
}
function text(value: unknown, pathName: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw failure(
      "EVAVO_TILE_MAP_REVIEWED_APPROVAL_TYPE",
      `${pathName} must be non-empty string`,
    );
  }
  return value;
}
function sha256Hex(value: unknown, pathName: string): string {
  const result = text(value, pathName).toLowerCase();
  if (!/^[0-9a-f]{64}$/u.test(result)) {
    throw failure(
      "EVAVO_TILE_MAP_REVIEWED_APPROVAL_HASH",
      `${pathName} must be SHA-256`,
    );
  }
  return result;
}
function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const entries = Object.entries(value as JsonObject).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  return `{${entries
    .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
    .join(",")}}`;
}
function failure(code: string, message: string): Error & { code: string } {
  const error = new Error(message) as Error & { code: string };
  error.code = code;
  return error;
}
