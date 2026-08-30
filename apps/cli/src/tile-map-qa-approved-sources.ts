import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  compileReviewedApprovedSourcesManifest,
  type ReviewedTileMapApprovedSourcesManifest,
} from "./tile-map-reviewed-approved-sources.js";

type JsonObject = Record<string, unknown>;

export type QaReviewedTileMapApprovedSourcesManifest = Omit<
  ReviewedTileMapApprovedSourcesManifest,
  "manifest_fingerprint"
> & {
  pre_candidate_qa_manifest_fingerprint: string;
  source_candidate_qa_path: string;
  source_candidate_qa_sha256: string;
  source_candidate_qa_fingerprint: string;
  candidate_qa_authority: "blocking-technical-evidence-only";
  manifest_fingerprint: string;
};

export async function compileQaReviewedApprovedSourcesManifest(
  sourcePackagePath: string,
  reviewPath: string,
  qaPath: string,
  finalizationPath: string,
): Promise<QaReviewedTileMapApprovedSourcesManifest> {
  const [reviewBytes, qaBytes, finalizationBytes] = await Promise.all([
    readFile(reviewPath),
    readFile(qaPath),
    readFile(finalizationPath),
  ]);
  const review = parseObject(reviewBytes.toString("utf8"), reviewPath);
  const qa = parseObject(qaBytes.toString("utf8"), qaPath);
  const finalization = parseObject(finalizationBytes.toString("utf8"), finalizationPath);
  if (qa.schema_version !== 1 || (qa.status !== "passed" && qa.status !== "blocked")) {
    throw failure(
      "EVAVO_TILE_MAP_QA_APPROVAL_SCHEMA",
      "candidate QA must be schema v1 with passed or blocked status",
    );
  }
  const qaFingerprint = sha256Hex(qa.qa_fingerprint, "qa_fingerprint");
  if (hashWithout(qa, "qa_fingerprint") !== qaFingerprint) {
    throw failure(
      "EVAVO_TILE_MAP_QA_APPROVAL_HASH",
      "candidate QA self fingerprint is invalid",
    );
  }
  const reviewFingerprint = sha256Hex(review.review_fingerprint, "review_fingerprint");
  if (sha256Hex(qa.source_review_fingerprint, "qa.source_review_fingerprint") !== reviewFingerprint) {
    throw failure(
      "EVAVO_TILE_MAP_QA_APPROVAL_DRIFT",
      "candidate QA does not target the exact review manifest",
    );
  }
  for (const key of [
    "source_package_fingerprint",
    "source_map_fingerprint",
    "source_provider_batch_fingerprint",
    "source_execution_sha256",
    "map_id",
    "projection",
  ] as const) {
    if (qa[key] !== review[key]) {
      throw failure(
        "EVAVO_TILE_MAP_QA_APPROVAL_DRIFT",
        `${key} differs between candidate QA and candidate review`,
      );
    }
  }
  const authority = object(qa.authority, "qa.authority");
  if (
    authority.automated_technical_qa !== true ||
    authority.structural_review_decision !== false ||
    authority.visual_review_decision !== false ||
    authority.creative_approval !== false ||
    authority.candidate_promotion !== false
  ) {
    throw failure(
      "EVAVO_TILE_MAP_QA_APPROVAL_AUTHORITY",
      "candidate QA authority must remain blocking-only and non-approving",
    );
  }

  const qaCandidates = new Map<string, JsonObject>();
  for (const [index, item] of array(qa.candidates, "qa.candidates").entries()) {
    const row = object(item, `qa.candidates[${index}]`);
    const candidateId = text(row.candidate_id, `qa.candidates[${index}].candidate_id`);
    if (qaCandidates.has(candidateId)) {
      throw failure(
        "EVAVO_TILE_MAP_QA_APPROVAL_DUPLICATE",
        `duplicate candidate QA row: ${candidateId}`,
      );
    }
    qaCandidates.set(candidateId, row);
  }
  const reviewCandidates = new Map<string, JsonObject>();
  for (const [index, item] of array(review.candidates, "review.candidates").entries()) {
    const row = object(item, `review.candidates[${index}]`);
    const candidateId = text(row.candidate_id, `review.candidates[${index}].candidate_id`);
    if (reviewCandidates.has(candidateId)) {
      throw failure(
        "EVAVO_TILE_MAP_QA_APPROVAL_DUPLICATE",
        `duplicate review candidate: ${candidateId}`,
      );
    }
    reviewCandidates.set(candidateId, row);
  }
  if (qaCandidates.size !== reviewCandidates.size) {
    throw failure(
      "EVAVO_TILE_MAP_QA_APPROVAL_SET",
      "candidate QA and review candidate sets differ",
    );
  }
  for (const [candidateId, reviewCandidate] of reviewCandidates) {
    const qaCandidate = qaCandidates.get(candidateId);
    if (!qaCandidate) {
      throw failure(
        "EVAVO_TILE_MAP_QA_APPROVAL_SET",
        `candidate QA is missing ${candidateId}`,
      );
    }
    for (const key of ["task_id", "visual_family"] as const) {
      if (qaCandidate[key] !== reviewCandidate[key]) {
        throw failure(
          "EVAVO_TILE_MAP_QA_APPROVAL_DRIFT",
          `${candidateId} ${key} differs between QA and review`,
        );
      }
    }
  }

  const qaFamilies = new Map<string, JsonObject>();
  for (const [index, item] of array(qa.families, "qa.families").entries()) {
    const row = object(item, `qa.families[${index}]`);
    const family = text(row.visual_family, `qa.families[${index}].visual_family`);
    if (qaFamilies.has(family)) {
      throw failure(
        "EVAVO_TILE_MAP_QA_APPROVAL_DUPLICATE",
        `duplicate family QA row: ${family}`,
      );
    }
    qaFamilies.set(family, row);
  }

  const finalized = new Map<string, JsonObject>();
  for (const [index, item] of array(finalization.candidates, "finalization.candidates").entries()) {
    const row = object(item, `finalization.candidates[${index}]`);
    const candidateId = text(
      row.candidate_id,
      `finalization.candidates[${index}].candidate_id`,
    );
    if (finalized.has(candidateId)) {
      throw failure(
        "EVAVO_TILE_MAP_QA_APPROVAL_DUPLICATE",
        `duplicate finalized candidate: ${candidateId}`,
      );
    }
    finalized.set(candidateId, row);
  }
  if (finalized.size !== reviewCandidates.size) {
    throw failure(
      "EVAVO_TILE_MAP_QA_APPROVAL_SET",
      "review finalization and QA candidate sets differ",
    );
  }

  for (const [candidateId, decision] of finalized) {
    const fullyApproved =
      decision.structural === "approved" &&
      decision.visual === "approved" &&
      decision.creative === "approved";
    if (!fullyApproved) continue;
    const candidateQa = qaCandidates.get(candidateId);
    if (!candidateQa || candidateQa.technically_clear !== true) {
      throw failure(
        "EVAVO_TILE_MAP_QA_APPROVAL_BLOCKED",
        `${candidateId} cannot be approved because automated technical QA has blocking findings`,
      );
    }
    const family = text(candidateQa.visual_family, `${candidateId}.visual_family`);
    const familyQa = qaFamilies.get(family);
    if (!familyQa || familyQa.technically_clear !== true) {
      throw failure(
        "EVAVO_TILE_MAP_QA_APPROVAL_BLOCKED",
        `${candidateId} cannot be approved because family ${family} fails effective-variant QA`,
      );
    }
  }

  const manifest = await compileReviewedApprovedSourcesManifest(
    sourcePackagePath,
    reviewPath,
    finalizationPath,
  );
  const {
    manifest_fingerprint: preCandidateQaFingerprint,
    ...manifestWithoutFingerprint
  } = manifest;
  const base = {
    ...manifestWithoutFingerprint,
    pre_candidate_qa_manifest_fingerprint: preCandidateQaFingerprint,
    source_candidate_qa_path: path.resolve(qaPath),
    source_candidate_qa_sha256: sha256(qaBytes),
    source_candidate_qa_fingerprint: qaFingerprint,
    candidate_qa_authority: "blocking-technical-evidence-only" as const,
  };
  return {
    ...base,
    manifest_fingerprint: sha256(Buffer.from(canonical(base), "utf8")),
  };
}

function hashWithout(value: JsonObject, key: string): string {
  const clone = { ...value };
  delete clone[key];
  return sha256(Buffer.from(canonical(clone), "utf8"));
}
function parseObject(content: string, label: string): JsonObject {
  try {
    return object(JSON.parse(content) as unknown, label);
  } catch (error) {
    if (error instanceof Error && "code" in error) throw error;
    throw failure("EVAVO_TILE_MAP_QA_APPROVAL_JSON", `invalid JSON in ${label}`);
  }
}
function object(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw failure("EVAVO_TILE_MAP_QA_APPROVAL_TYPE", `${label} must be object`);
  }
  return value as JsonObject;
}
function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw failure("EVAVO_TILE_MAP_QA_APPROVAL_TYPE", `${label} must be array`);
  }
  return value;
}
function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw failure("EVAVO_TILE_MAP_QA_APPROVAL_TYPE", `${label} must be non-empty string`);
  }
  return value;
}
function sha256Hex(value: unknown, label: string): string {
  const result = text(value, label).toLowerCase();
  if (!/^[0-9a-f]{64}$/u.test(result)) {
    throw failure("EVAVO_TILE_MAP_QA_APPROVAL_HASH", `${label} must be SHA-256`);
  }
  return result;
}
function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const entries = Object.entries(value as JsonObject).sort(([left], [right]) =>
    left.localeCompare(right),
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
