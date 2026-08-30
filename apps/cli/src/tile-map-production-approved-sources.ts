import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  compileQaReviewedApprovedSourcesManifest,
  type QaReviewedTileMapApprovedSourcesManifest,
} from "./tile-map-qa-approved-sources.js";

type JsonObject = Record<string, unknown>;

export type TileMapProductionApprovedSourcesManifest = Omit<
  QaReviewedTileMapApprovedSourcesManifest,
  "manifest_fingerprint"
> & {
  production_art_evidence_schema_version: 1;
  pre_production_evidence_manifest_fingerprint: string;
  source_boundary_qa_path: string;
  source_boundary_qa_sha256: string;
  source_boundary_qa_fingerprint: string;
  source_candidate_proof_receipt_path: string;
  source_candidate_proof_receipt_sha256: string;
  source_candidate_proof_receipt_fingerprint: string;
  source_candidate_proof_aggregate_digest: string;
  production_evidence_authority: "blocking-technical-and-review-evidence-only";
  manifest_fingerprint: string;
};

export async function compileTileMapProductionApprovedSourcesManifest(
  sourcePackagePath: string,
  reviewPath: string,
  candidateQaPath: string,
  boundaryQaPath: string,
  proofReceiptPath: string,
  finalizationPath: string,
): Promise<TileMapProductionApprovedSourcesManifest> {
  const [boundaryBytes, proofBytes, finalizationBytes] = await Promise.all([
    readFile(boundaryQaPath),
    readFile(proofReceiptPath),
    readFile(finalizationPath),
  ]);
  const boundary = parseObject(boundaryBytes.toString("utf8"), boundaryQaPath);
  const proof = parseObject(proofBytes.toString("utf8"), proofReceiptPath);
  const finalization = parseObject(
    finalizationBytes.toString("utf8"),
    finalizationPath,
  );
  const reviewed = await compileQaReviewedApprovedSourcesManifest(
    sourcePackagePath,
    reviewPath,
    candidateQaPath,
    finalizationPath,
  );

  validateBoundaryQa(reviewed, boundary);
  await validateProofReceipt(reviewed, proof, proofReceiptPath);
  validateApprovedFamilies(reviewed, boundary, finalization);

  const boundaryFingerprint = sha256Hex(
    boundary.boundary_qa_fingerprint,
    "boundary_qa_fingerprint",
  );
  const proofFingerprint = sha256Hex(
    proof.receipt_fingerprint,
    "proof receipt_fingerprint",
  );
  const { manifest_fingerprint: preProductionFingerprint, ...withoutFingerprint } =
    reviewed;
  const base = {
    ...withoutFingerprint,
    production_art_evidence_schema_version: 1 as const,
    pre_production_evidence_manifest_fingerprint: preProductionFingerprint,
    source_boundary_qa_path: path.resolve(boundaryQaPath),
    source_boundary_qa_sha256: sha256(boundaryBytes),
    source_boundary_qa_fingerprint: boundaryFingerprint,
    source_candidate_proof_receipt_path: path.resolve(proofReceiptPath),
    source_candidate_proof_receipt_sha256: sha256(proofBytes),
    source_candidate_proof_receipt_fingerprint: proofFingerprint,
    source_candidate_proof_aggregate_digest: sha256Hex(
      proof.aggregate_proof_digest,
      "proof aggregate_proof_digest",
    ),
    production_evidence_authority:
      "blocking-technical-and-review-evidence-only" as const,
  };
  return {
    ...base,
    manifest_fingerprint: sha256(Buffer.from(canonical(base), "utf8")),
  };
}

function validateBoundaryQa(
  approved: QaReviewedTileMapApprovedSourcesManifest,
  boundary: JsonObject,
): void {
  if (
    boundary.schema_version !== 1 ||
    (boundary.status !== "passed" && boundary.status !== "blocked")
  ) {
    throw failure(
      "EVAVO_TILE_MAP_PRODUCTION_BOUNDARY",
      "boundary QA must be schema v1 with passed or blocked status",
    );
  }
  const fingerprint = sha256Hex(
    boundary.boundary_qa_fingerprint,
    "boundary_qa_fingerprint",
  );
  if (hashWithout(boundary, "boundary_qa_fingerprint") !== fingerprint) {
    throw failure(
      "EVAVO_TILE_MAP_PRODUCTION_BOUNDARY",
      "boundary QA self fingerprint is invalid",
    );
  }
  const expected = {
    source_package_fingerprint: approved.source_package_fingerprint,
    source_review_fingerprint: approved.source_review_fingerprint,
    source_candidate_qa_fingerprint: approved.source_candidate_qa_fingerprint,
    source_provider_batch_fingerprint: approved.source_provider_batch_fingerprint,
    source_execution_sha256: approved.source_execution_sha256,
    source_map_fingerprint: approved.source_map_fingerprint,
    map_id: approved.map_id,
    projection: approved.projection,
  };
  for (const [key, value] of Object.entries(expected)) {
    if (boundary[key] !== value) {
      throw failure(
        "EVAVO_TILE_MAP_PRODUCTION_DRIFT",
        `${key} differs between boundary QA and reviewed approval`,
      );
    }
  }
  const authority = object(boundary.authority, "boundary.authority");
  if (
    authority.automated_boundary_qa !== true ||
    authority.structural_review_decision !== false ||
    authority.visual_review_decision !== false ||
    authority.creative_approval !== false ||
    authority.candidate_promotion !== false
  ) {
    throw failure(
      "EVAVO_TILE_MAP_PRODUCTION_AUTHORITY",
      "boundary QA must remain blocking-only and non-approving",
    );
  }
}

async function validateProofReceipt(
  approved: QaReviewedTileMapApprovedSourcesManifest,
  proof: JsonObject,
  proofReceiptPath: string,
): Promise<void> {
  if (proof.schema_version !== 1 || proof.status !== "review-proof-only") {
    throw failure(
      "EVAVO_TILE_MAP_PRODUCTION_PROOF",
      "candidate proof receipt must be schema v1 and review-proof-only",
    );
  }
  const fingerprint = sha256Hex(
    proof.receipt_fingerprint,
    "proof receipt_fingerprint",
  );
  if (hashWithout(proof, "receipt_fingerprint") !== fingerprint) {
    throw failure(
      "EVAVO_TILE_MAP_PRODUCTION_PROOF",
      "candidate proof receipt self fingerprint is invalid",
    );
  }
  const expected = {
    source_review_fingerprint: approved.source_review_fingerprint,
    source_candidate_qa_fingerprint: approved.source_candidate_qa_fingerprint,
    source_provider_batch_fingerprint: approved.source_provider_batch_fingerprint,
    source_execution_sha256: approved.source_execution_sha256,
    source_map_fingerprint: approved.source_map_fingerprint,
    map_id: approved.map_id,
    projection: approved.projection,
  };
  for (const [key, value] of Object.entries(expected)) {
    if (proof[key] !== value) {
      throw failure(
        "EVAVO_TILE_MAP_PRODUCTION_DRIFT",
        `${key} differs between candidate proof and reviewed approval`,
      );
    }
  }
  const authority = object(proof.authority, "proof.authority");
  if (
    authority.visual_review_evidence !== true ||
    authority.automated_technical_qa !== false ||
    authority.structural_review_decision !== false ||
    authority.visual_review_decision !== false ||
    authority.creative_approval !== false ||
    authority.candidate_promotion !== false
  ) {
    throw failure(
      "EVAVO_TILE_MAP_PRODUCTION_AUTHORITY",
      "candidate proof authority must remain review-evidence-only",
    );
  }

  const root = path.dirname(path.resolve(proofReceiptPath));
  const proofFiles = array(proof.proof_files, "proof.proof_files");
  if (proofFiles.length === 0) {
    throw failure(
      "EVAVO_TILE_MAP_PRODUCTION_PROOF",
      "candidate proof receipt contains no family proof files",
    );
  }
  const aggregate = createHash("sha256");
  const seen = new Set<string>();
  for (const [index, item] of proofFiles.entries()) {
    const row = object(item, `proof.proof_files[${index}]`);
    const file = portableRelative(
      text(row.file, `proof.proof_files[${index}].file`),
    );
    if (seen.has(file)) {
      throw failure(
        "EVAVO_TILE_MAP_PRODUCTION_PROOF",
        `duplicate proof file: ${file}`,
      );
    }
    seen.add(file);
    const absolute = resolveInside(root, file, `proof file ${file}`);
    const bytes = await readFile(absolute);
    const digest = sha256Hex(row.sha256, `${file}.sha256`);
    if (sha256(bytes) !== digest) {
      throw failure(
        "EVAVO_TILE_MAP_PRODUCTION_PROOF",
        `candidate proof file hash changed: ${file}`,
      );
    }
    if (bytes.length !== positiveInteger(row.bytes, `${file}.bytes`)) {
      throw failure(
        "EVAVO_TILE_MAP_PRODUCTION_PROOF",
        `candidate proof file byte count changed: ${file}`,
      );
    }
    aggregate.update(file, "utf8");
    aggregate.update("\0");
    aggregate.update(digest, "ascii");
    aggregate.update("\n");
  }
  if (
    aggregate.digest("hex") !==
    sha256Hex(proof.aggregate_proof_digest, "aggregate_proof_digest")
  ) {
    throw failure(
      "EVAVO_TILE_MAP_PRODUCTION_PROOF",
      "candidate proof aggregate digest is invalid",
    );
  }
}

function validateApprovedFamilies(
  approved: QaReviewedTileMapApprovedSourcesManifest,
  boundary: JsonObject,
  finalization: JsonObject,
): void {
  const boundaryFamilies = new Map<string, JsonObject>();
  for (const [index, item] of array(boundary.families, "boundary.families").entries()) {
    const row = object(item, `boundary.families[${index}]`);
    const family = text(row.visual_family, `boundary.families[${index}].visual_family`);
    if (boundaryFamilies.has(family)) {
      throw failure(
        "EVAVO_TILE_MAP_PRODUCTION_DUPLICATE",
        `duplicate boundary QA family: ${family}`,
      );
    }
    boundaryFamilies.set(family, row);
  }
  for (const task of approved.tasks) {
    const familyQa = boundaryFamilies.get(task.visual_family);
    if (!familyQa || familyQa.technically_clear !== true) {
      throw failure(
        "EVAVO_TILE_MAP_PRODUCTION_BOUNDARY",
        `approved family ${task.visual_family} does not pass boundary QA`,
      );
    }
  }

  const approvedTriples = new Set<string>();
  for (const [index, item] of array(finalization.candidates, "finalization.candidates").entries()) {
    const row = object(item, `finalization.candidates[${index}]`);
    if (
      row.structural === "approved" &&
      row.visual === "approved" &&
      row.creative === "approved"
    ) {
      approvedTriples.add(
        `${text(row.task_id, "finalization task_id")}\n${text(
          row.path,
          "finalization path",
        )}\n${sha256Hex(row.sha256, "finalization sha256")}`,
      );
    }
  }
  for (const task of approved.tasks) {
    for (const source of task.approved_sources) {
      const key = `${task.task_id}\n${source.path}\n${source.sha256}`;
      if (!approvedTriples.has(key)) {
        throw failure(
          "EVAVO_TILE_MAP_PRODUCTION_REVIEW",
          `${task.visual_family} approved source is absent from all-three-gates review`,
        );
      }
    }
  }
}

function hashWithout(value: JsonObject, key: string): string {
  const copy = { ...value };
  delete copy[key];
  return sha256(Buffer.from(canonical(copy), "utf8"));
}
function portableRelative(value: string): string {
  if (value.includes("\\") || path.posix.isAbsolute(value)) {
    throw failure(
      "EVAVO_TILE_MAP_PRODUCTION_PATH",
      `path must be forward-slash relative: ${value}`,
    );
  }
  const normalized = path.posix.normalize(value);
  if (
    normalized !== value ||
    normalized === "." ||
    normalized === ".." ||
    normalized.startsWith("../")
  ) {
    throw failure("EVAVO_TILE_MAP_PRODUCTION_PATH", `unsafe relative path: ${value}`);
  }
  return normalized;
}
function resolveInside(root: string, relative: string, label: string): string {
  const candidate = path.resolve(root, ...relative.split("/"));
  const relation = path.relative(root, candidate);
  if (
    relation === ".." ||
    relation.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relation)
  ) {
    throw failure("EVAVO_TILE_MAP_PRODUCTION_PATH", `${label} escapes proof root`);
  }
  return candidate;
}
function parseObject(content: string, label: string): JsonObject {
  try {
    return object(JSON.parse(content) as unknown, label);
  } catch (error) {
    if (error instanceof Error && "code" in error) throw error;
    throw failure("EVAVO_TILE_MAP_PRODUCTION_JSON", `invalid JSON in ${label}`);
  }
}
function object(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw failure("EVAVO_TILE_MAP_PRODUCTION_TYPE", `${label} must be object`);
  }
  return value as JsonObject;
}
function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw failure("EVAVO_TILE_MAP_PRODUCTION_TYPE", `${label} must be array`);
  }
  return value;
}
function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw failure("EVAVO_TILE_MAP_PRODUCTION_TYPE", `${label} must be non-empty string`);
  }
  return value;
}
function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw failure("EVAVO_TILE_MAP_PRODUCTION_TYPE", `${label} must be positive integer`);
  }
  return value as number;
}
function sha256Hex(value: unknown, label: string): string {
  const result = text(value, label).toLowerCase();
  if (!/^[0-9a-f]{64}$/u.test(result)) {
    throw failure("EVAVO_TILE_MAP_PRODUCTION_HASH", `${label} must be SHA-256`);
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
