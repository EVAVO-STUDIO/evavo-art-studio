import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import {
  compileApprovedSourcesManifest,
  type TileMapApprovedSourcesManifest,
} from "./tile-map-approved-sources.js";

type JsonObject = Record<string, unknown>;

export type ReviewedTileMapApprovedSourcesManifest = TileMapApprovedSourcesManifest & {
  source_review_path: string;
  source_review_sha256: string;
  source_review_fingerprint: string;
  review_finalization_path: string;
  review_finalization_sha256: string;
  review_finalization_fingerprint: string;
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
  const sourcePackage = parseObject(packageBytes.toString("utf8"), sourcePackagePath);
  const review = parseObject(reviewBytes.toString("utf8"), reviewPath);
  const finalization = parseObject(finalizationBytes.toString("utf8"), finalizationPath);
  if (review.schema_version !== 1 || review.status !== "awaiting-review") {
    throw failure("EVAVO_TILE_MAP_REVIEWED_APPROVAL_REVIEW", "review must be schema v1 and awaiting-review");
  }
  if (finalization.schema_version !== 1 || finalization.status !== "review-finalized") {
    throw failure("EVAVO_TILE_MAP_REVIEWED_APPROVAL_FINALIZATION", "finalization must be schema v1 and review-finalized");
  }
  const packageFingerprint = sha256Hex(sourcePackage.package_fingerprint, "package_fingerprint");
  const reviewFingerprint = sha256Hex(review.review_fingerprint, "review_fingerprint");
  const sourceMapFingerprint = sha256Hex(sourcePackage.source_map_fingerprint, "source_map_fingerprint");
  if (sha256Hex(review.source_package_fingerprint, "review.source_package_fingerprint") !== packageFingerprint) {
    throw failure("EVAVO_TILE_MAP_REVIEWED_APPROVAL_DRIFT", "review does not target the exact source package");
  }
  if (sha256Hex(finalization.source_package_fingerprint, "finalization.source_package_fingerprint") !== packageFingerprint) {
    throw failure("EVAVO_TILE_MAP_REVIEWED_APPROVAL_DRIFT", "finalization does not target the exact source package");
  }
  if (sha256Hex(finalization.source_review_fingerprint, "finalization.source_review_fingerprint") !== reviewFingerprint) {
    throw failure("EVAVO_TILE_MAP_REVIEWED_APPROVAL_DRIFT", "finalization does not target the exact review manifest");
  }
  if (sha256Hex(review.source_map_fingerprint, "review.source_map_fingerprint") !== sourceMapFingerprint ||
      sha256Hex(finalization.source_map_fingerprint, "finalization.source_map_fingerprint") !== sourceMapFingerprint) {
    throw failure("EVAVO_TILE_MAP_REVIEWED_APPROVAL_DRIFT", "review/finalization semantic map fingerprint is stale");
  }
  if (review.map_id !== sourcePackage.map_id || finalization.map_id !== sourcePackage.map_id) {
    throw failure("EVAVO_TILE_MAP_REVIEWED_APPROVAL_DRIFT", "map_id differs across source package, review and finalization");
  }
  if (review.projection !== sourcePackage.projection || finalization.projection !== sourcePackage.projection) {
    throw failure("EVAVO_TILE_MAP_REVIEWED_APPROVAL_DRIFT", "projection differs across source package, review and finalization");
  }

  const reviewCandidates = new Map<string, JsonObject>();
  for (const [index, item] of array(review.candidates, "review.candidates").entries()) {
    const candidate = object(item, `review.candidates[${index}]`);
    const id = text(candidate.candidate_id, `review.candidates[${index}].candidate_id`);
    reviewCandidates.set(id, candidate);
  }
  const finalizedCandidates = new Map<string, JsonObject>();
  for (const [index, item] of array(finalization.candidates, "finalization.candidates").entries()) {
    const candidate = object(item, `finalization.candidates[${index}]`);
    const id = text(candidate.candidate_id, `finalization.candidates[${index}].candidate_id`);
    finalizedCandidates.set(id, candidate);
  }
  if (reviewCandidates.size !== finalizedCandidates.size) {
    throw failure("EVAVO_TILE_MAP_REVIEWED_APPROVAL_SET", "review and finalization candidate sets differ");
  }
  for (const [candidateId, candidate] of reviewCandidates) {
    const decision = finalizedCandidates.get(candidateId);
    if (!decision) throw failure("EVAVO_TILE_MAP_REVIEWED_APPROVAL_SET", `finalization missing candidate ${candidateId}`);
    for (const key of ["task_id", "visual_family", "path", "sha256"] as const) {
      if (decision[key] !== candidate[key]) {
        throw failure("EVAVO_TILE_MAP_REVIEWED_APPROVAL_DRIFT", `${candidateId} ${key} changed between review and finalization`);
      }
    }
  }

  const approvedTriples = new Set<string>();
  for (const candidate of finalizedCandidates.values()) {
    if (candidate.structural === "approved" && candidate.visual === "approved" && candidate.creative === "approved") {
      approvedTriples.add(`${candidate.task_id}\n${candidate.path}\n${candidate.sha256}`);
    }
  }
  for (const [taskIndex, item] of array(finalization.tasks, "finalization.tasks").entries()) {
    const task = object(item, `finalization.tasks[${taskIndex}]`);
    const taskId = text(task.task_id, `finalization.tasks[${taskIndex}].task_id`);
    for (const [sourceIndex, sourceItem] of array(task.approved_sources, `${taskId}.approved_sources`).entries()) {
      const source = object(sourceItem, `${taskId}.approved_sources[${sourceIndex}]`);
      const key = `${taskId}\n${text(source.path, `${taskId}.path`)}\n${sha256Hex(source.sha256, `${taskId}.sha256`)}`;
      if (!approvedTriples.has(key)) {
        throw failure("EVAVO_TILE_MAP_REVIEWED_APPROVAL_BYPASS", `${taskId} approved source did not pass all three review gates`);
      }
    }
  }

  const manifest = await compileApprovedSourcesManifest(sourcePackagePath, finalizationPath);
  return {
    ...manifest,
    source_review_path: reviewPath,
    source_review_sha256: sha256(reviewBytes),
    source_review_fingerprint: reviewFingerprint,
    review_finalization_path: finalizationPath,
    review_finalization_sha256: sha256(finalizationBytes),
    review_finalization_fingerprint: sha256Hex(finalization.finalization_fingerprint, "finalization_fingerprint"),
  };
}

function parseObject(content: string, label: string): JsonObject { try { return object(JSON.parse(content) as unknown, label); } catch (error) { if (error instanceof Error && "code" in error) throw error; throw failure("EVAVO_TILE_MAP_REVIEWED_APPROVAL_JSON", `invalid JSON in ${label}`); } }
function object(value: unknown, path: string): JsonObject { if (!value || typeof value !== "object" || Array.isArray(value)) throw failure("EVAVO_TILE_MAP_REVIEWED_APPROVAL_TYPE", `${path} must be object`); return value as JsonObject; }
function array(value: unknown, path: string): unknown[] { if (!Array.isArray(value)) throw failure("EVAVO_TILE_MAP_REVIEWED_APPROVAL_TYPE", `${path} must be array`); return value; }
function text(value: unknown, path: string): string { if (typeof value !== "string" || !value.trim()) throw failure("EVAVO_TILE_MAP_REVIEWED_APPROVAL_TYPE", `${path} must be non-empty string`); return value; }
function sha256Hex(value: unknown, path: string): string { const result = text(value, path).toLowerCase(); if (!/^[0-9a-f]{64}$/u.test(result)) throw failure("EVAVO_TILE_MAP_REVIEWED_APPROVAL_HASH", `${path} must be SHA-256`); return result; }
function sha256(value: Uint8Array): string { return createHash("sha256").update(value).digest("hex"); }
function failure(code: string, message: string): Error & { code: string } { const error = new Error(message) as Error & { code: string }; error.code = code; return error; }
