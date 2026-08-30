import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  compileReviewedApprovedSourcesManifest,
  type ReviewedTileMapApprovedSourcesManifest,
} from "./tile-map-reviewed-approved-sources.js";

type JsonObject = Record<string, unknown>;

type ReviewedWithoutFingerprint = Omit<
  ReviewedTileMapApprovedSourcesManifest,
  "schema_version" | "manifest_fingerprint"
>;

export type TechnicallyReviewedTileMapApprovedSourcesManifest =
  ReviewedWithoutFingerprint & {
    schema_version: 2;
    pre_technical_qa_manifest_fingerprint: string;
    source_technical_qa_path: string;
    source_technical_qa_sha256: string;
    source_technical_qa_fingerprint: string;
    technical_policy_version: string;
    technical_qa_required: true;
    manifest_fingerprint: string;
  };

export async function compileTechnicallyReviewedApprovedSourcesManifest(
  sourcePackagePath: string,
  reviewPath: string,
  technicalQaPath: string,
  finalizationPath: string,
): Promise<TechnicallyReviewedTileMapApprovedSourcesManifest> {
  const [packageBytes, reviewBytes, qaBytes, finalizationBytes] = await Promise.all([
    readFile(sourcePackagePath),
    readFile(reviewPath),
    readFile(technicalQaPath),
    readFile(finalizationPath),
  ]);
  const sourcePackage = parseObject(packageBytes.toString("utf8"), sourcePackagePath);
  const review = parseObject(reviewBytes.toString("utf8"), reviewPath);
  const qa = parseObject(qaBytes.toString("utf8"), technicalQaPath);
  const finalization = parseObject(
    finalizationBytes.toString("utf8"),
    finalizationPath,
  );
  if (qa.schema_version !== 1 || qa.status !== "passed") {
    throw failure(
      "EVAVO_TILE_MAP_TECHNICAL_APPROVAL_QA",
      "technical QA must be schema v1 with status passed",
    );
  }
  const qaFingerprint = sha256Hex(qa.qa_fingerprint, "technical QA fingerprint");
  const { qa_fingerprint: _qaFingerprint, ...qaBody } = qa;
  if (sha256(Buffer.from(canonical(qaBody), "utf8")) !== qaFingerprint) {
    throw failure(
      "EVAVO_TILE_MAP_TECHNICAL_APPROVAL_QA_HASH",
      "technical QA self fingerprint is invalid",
    );
  }

  const packageFingerprint = sha256Hex(
    sourcePackage.package_fingerprint,
    "source package fingerprint",
  );
  const reviewFingerprint = sha256Hex(review.review_fingerprint, "review fingerprint");
  const sourceMapFingerprint = sha256Hex(
    sourcePackage.source_map_fingerprint,
    "source map fingerprint",
  );
  if (
    sha256Hex(qa.source_package_fingerprint, "QA source_package_fingerprint") !==
      packageFingerprint ||
    sha256Hex(qa.source_review_fingerprint, "QA source_review_fingerprint") !==
      reviewFingerprint ||
    sha256Hex(qa.source_map_fingerprint, "QA source_map_fingerprint") !==
      sourceMapFingerprint
  ) {
    throw failure(
      "EVAVO_TILE_MAP_TECHNICAL_APPROVAL_DRIFT",
      "technical QA does not target the exact source package, review and semantic map",
    );
  }
  if (
    sha256Hex(qa.source_package_sha256, "QA source_package_sha256") !==
      sha256(packageBytes) ||
    sha256Hex(qa.source_review_sha256, "QA source_review_sha256") !==
      sha256(reviewBytes)
  ) {
    throw failure(
      "EVAVO_TILE_MAP_TECHNICAL_APPROVAL_DRIFT",
      "source package or review bytes changed after technical QA",
    );
  }
  if (
    qa.map_id !== sourcePackage.map_id ||
    qa.map_id !== review.map_id ||
    qa.projection !== sourcePackage.projection ||
    qa.projection !== review.projection
  ) {
    throw failure(
      "EVAVO_TILE_MAP_TECHNICAL_APPROVAL_DRIFT",
      "technical QA map identity or projection differs from reviewed source evidence",
    );
  }
  if (
    qa.source_provider_batch_fingerprint !==
      review.source_provider_batch_fingerprint ||
    qa.source_execution_sha256 !== review.source_execution_sha256
  ) {
    throw failure(
      "EVAVO_TILE_MAP_TECHNICAL_APPROVAL_DRIFT",
      "technical QA provider execution provenance differs from candidate review",
    );
  }
  if (
    finalization.source_review_fingerprint !== reviewFingerprint ||
    finalization.source_package_fingerprint !== packageFingerprint ||
    finalization.source_map_fingerprint !== sourceMapFingerprint
  ) {
    throw failure(
      "EVAVO_TILE_MAP_TECHNICAL_APPROVAL_DRIFT",
      "review finalization does not target the QA-bound evidence chain",
    );
  }

  const passedCandidates = new Set<string>();
  const qaCandidateIds = new Set<string>();
  for (const [index, value] of array(qa.candidates, "technical QA candidates").entries()) {
    const candidate = object(value, `technical QA candidates[${index}]`);
    const candidateId = text(candidate.candidate_id, `technical QA candidates[${index}].candidate_id`);
    if (qaCandidateIds.has(candidateId)) {
      throw failure(
        "EVAVO_TILE_MAP_TECHNICAL_APPROVAL_DUPLICATE",
        `technical QA duplicates candidate ${candidateId}`,
      );
    }
    qaCandidateIds.add(candidateId);
    if (candidate.technical_status === "passed") {
      passedCandidates.add(
        candidateKey(
          text(candidate.task_id, `${candidateId}.task_id`),
          text(candidate.visual_family, `${candidateId}.visual_family`),
          text(candidate.path, `${candidateId}.path`),
          sha256Hex(candidate.sha256, `${candidateId}.sha256`),
        ),
      );
    }
  }

  for (const [taskIndex, value] of array(
    finalization.tasks,
    "review finalization tasks",
  ).entries()) {
    const task = object(value, `review finalization tasks[${taskIndex}]`);
    const taskId = text(task.task_id, `review finalization tasks[${taskIndex}].task_id`);
    const family = text(
      task.visual_family,
      `review finalization tasks[${taskIndex}].visual_family`,
    );
    for (const [sourceIndex, sourceValue] of array(
      task.approved_sources,
      `${taskId}.approved_sources`,
    ).entries()) {
      const source = object(sourceValue, `${taskId}.approved_sources[${sourceIndex}]`);
      const key = candidateKey(
        taskId,
        family,
        text(source.path, `${taskId}.approved_sources[${sourceIndex}].path`),
        sha256Hex(
          source.sha256,
          `${taskId}.approved_sources[${sourceIndex}].sha256`,
        ),
      );
      if (!passedCandidates.has(key)) {
        throw failure(
          "EVAVO_TILE_MAP_TECHNICAL_APPROVAL_BYPASS",
          `${taskId} approved source did not pass the exact technical QA candidate gate`,
        );
      }
    }
  }

  const reviewed = await compileReviewedApprovedSourcesManifest(
    sourcePackagePath,
    reviewPath,
    finalizationPath,
  );
  const {
    schema_version: _schemaVersion,
    manifest_fingerprint: preTechnicalFingerprint,
    ...reviewedBody
  } = reviewed;
  const base = {
    ...reviewedBody,
    schema_version: 2 as const,
    pre_technical_qa_manifest_fingerprint: preTechnicalFingerprint,
    source_technical_qa_path: path.resolve(technicalQaPath),
    source_technical_qa_sha256: sha256(qaBytes),
    source_technical_qa_fingerprint: qaFingerprint,
    technical_policy_version: text(qa.policy_version, "technical QA policy_version"),
    technical_qa_required: true as const,
  };
  return {
    ...base,
    manifest_fingerprint: sha256(Buffer.from(canonical(base), "utf8")),
  };
}

function candidateKey(
  taskId: string,
  family: string,
  candidatePath: string,
  digest: string,
): string {
  return `${taskId}\n${family}\n${candidatePath}\n${digest}`;
}

function parseObject(content: string, label: string): JsonObject {
  try {
    return object(JSON.parse(content) as unknown, label);
  } catch (error) {
    if (error instanceof Error && "code" in error) throw error;
    throw failure(
      "EVAVO_TILE_MAP_TECHNICAL_APPROVAL_JSON",
      `invalid JSON in ${label}`,
    );
  }
}

function object(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw failure(
      "EVAVO_TILE_MAP_TECHNICAL_APPROVAL_TYPE",
      `${label} must be object`,
    );
  }
  return value as JsonObject;
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw failure(
      "EVAVO_TILE_MAP_TECHNICAL_APPROVAL_TYPE",
      `${label} must be array`,
    );
  }
  return value;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw failure(
      "EVAVO_TILE_MAP_TECHNICAL_APPROVAL_TYPE",
      `${label} must be non-empty string`,
    );
  }
  return value;
}

function sha256Hex(value: unknown, label: string): string {
  const result = text(value, label).toLowerCase();
  if (!/^[0-9a-f]{64}$/u.test(result)) {
    throw failure(
      "EVAVO_TILE_MAP_TECHNICAL_APPROVAL_HASH",
      `${label} must be SHA-256`,
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
