import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

type JsonObject = Record<string, unknown>;

type ReviewCandidate = {
  candidate_id: string;
  task_id: string;
  visual_family: string;
  path: string;
  sha256: string;
  bytes: number;
  width: number;
  height: number;
  has_alpha: boolean;
  source_provider_artifact_id: string;
  mastered_artifact_id: string;
  mastering_evidence_artifact_id: string;
  mastering_job_id: string;
  mastering_spec_sha256: string;
  structural_review: "pending";
  visual_review: "pending";
  creative_review: "pending";
  promotion_eligible: false;
};

export type TileMapCandidateReviewManifest = {
  schema_version: 1;
  source_batch_sha256: string;
  source_batch_fingerprint: string;
  source_package_fingerprint: string;
  source_provider_batch_path: string;
  source_provider_batch_sha256: string;
  source_provider_batch_fingerprint: string;
  source_execution_receipt_path: string;
  source_execution_receipt_sha256: string;
  source_execution_sha256: string;
  source_mastering_receipt_path: string;
  source_mastering_receipt_sha256: string;
  source_mastering_sha256: string;
  source_map_fingerprint: string;
  provider_results_path: string;
  provider_results_sha256: string;
  provider_results_fingerprint: string;
  candidate_root: string;
  map_id: string;
  projection: string;
  candidates: ReviewCandidate[];
  authority: {
    semantic_authority: "tile-map-studio";
    review_authority: "art-studio";
    provider_authority: "intermediate-only";
    execution_evidence_required: true;
    deterministic_mastering_required: true;
    mastering_quality_required: true;
  };
  status: "awaiting-review";
  review_fingerprint: string;
};

export async function compileTileMapCandidateReview(
  batchPath: string,
  resultsPath: string,
): Promise<TileMapCandidateReviewManifest> {
  const [batchBytes, resultsBytes] = await Promise.all([
    readFile(batchPath),
    readFile(resultsPath),
  ]);
  const batch = parseObject(batchBytes.toString("utf8"), batchPath);
  const results = parseObject(resultsBytes.toString("utf8"), resultsPath);
  if (
    batch.schema_version !== 1 ||
    batch.status !== "ready-for-provider-candidates"
  ) {
    throw failure(
      "EVAVO_TILE_MAP_REVIEW_BATCH",
      "candidate batch must be schema v1 and ready-for-provider-candidates",
    );
  }
  const batchFingerprint = verifiedFingerprint(
    batch,
    "batch_fingerprint",
    "candidate batch",
  );
  if (results.schema_version !== 2) {
    throw failure(
      "EVAVO_TILE_MAP_REVIEW_RESULTS",
      "candidate results schema_version must be 2 after deterministic mastering",
    );
  }
  const resultsFingerprint = verifiedFingerprint(
    results,
    "results_fingerprint",
    "candidate results",
  );

  if (
    sha256Hex(
      results.source_batch_fingerprint,
      "results.source_batch_fingerprint",
    ) !== batchFingerprint
  ) {
    throw failure(
      "EVAVO_TILE_MAP_REVIEW_DRIFT",
      "candidate results do not target this exact batch fingerprint",
    );
  }
  const sourceMapFingerprint = sha256Hex(
    batch.source_map_fingerprint,
    "batch.source_map_fingerprint",
  );
  if (
    sha256Hex(
      results.source_map_fingerprint,
      "results.source_map_fingerprint",
    ) !== sourceMapFingerprint
  ) {
    throw failure(
      "EVAVO_TILE_MAP_REVIEW_DRIFT",
      "candidate results source map fingerprint does not match candidate batch",
    );
  }

  const providerBatchRecord = await readBoundJson(
    results.source_provider_batch_path,
    results.source_provider_batch_sha256,
    "Tile Map provider runtime batch",
  );
  const providerBatch = providerBatchRecord.value;
  if (
    providerBatch.schema_version !== 1 ||
    providerBatch.status !== "ready-for-provider-runtime"
  ) {
    throw failure(
      "EVAVO_TILE_MAP_REVIEW_PROVIDER_BATCH",
      "provider runtime batch schema/status is invalid",
    );
  }
  const providerBatchFingerprint = verifiedFingerprint(
    providerBatch,
    "provider_batch_fingerprint",
    "provider runtime batch",
  );
  if (
    providerBatchFingerprint !==
      sha256Hex(
        results.source_provider_batch_fingerprint,
        "results.source_provider_batch_fingerprint",
      ) ||
    providerBatch.source_candidate_batch_sha256 !== sha256(batchBytes) ||
    providerBatch.source_candidate_batch_fingerprint !== batchFingerprint ||
    providerBatch.source_package_fingerprint !==
      batch.source_package_fingerprint ||
    providerBatch.source_map_fingerprint !== sourceMapFingerprint ||
    providerBatch.map_id !== batch.map_id ||
    providerBatch.projection !== batch.projection
  ) {
    throw failure(
      "EVAVO_TILE_MAP_REVIEW_PROVIDER_BATCH",
      "provider runtime batch does not bind the exact candidate batch and semantic map",
    );
  }

  const executionRecord = await readBoundJson(
    results.source_execution_receipt_path,
    results.source_execution_receipt_sha256,
    "Tile Map provider execution receipt",
  );
  const execution = executionRecord.value;
  const executionSha256 = verifiedSealedDocument(
    execution,
    "executionSha256",
    "Tile Map provider execution receipt",
  );
  if (
    execution.schema !== "evavo.tile-map-provider-execution-receipt.v1" ||
    execution.status !== "succeeded" ||
    executionSha256 !==
      sha256Hex(
        results.source_execution_sha256,
        "results.source_execution_sha256",
      ) ||
    execution.sourceMapFingerprint !== sourceMapFingerprint
  ) {
    throw failure(
      "EVAVO_TILE_MAP_REVIEW_EXECUTION",
      "provider execution receipt is invalid or targets another semantic map",
    );
  }

  const authorizationRecord = await readBoundJson(
    object(execution.sourceAuthorization, "execution.sourceAuthorization").path,
    object(execution.sourceAuthorization, "execution.sourceAuthorization")
      .fileSha256,
    "Tile Map provider authorization",
  );
  const authorization = authorizationRecord.value;
  const authorizationSha256 = verifiedSealedDocument(
    authorization,
    "authorizationSha256",
    "Tile Map provider authorization",
  );
  const sourceAuthorization = object(
    execution.sourceAuthorization,
    "execution.sourceAuthorization",
  );
  const authorizationProviderBatch = object(
    authorization.sourceProviderBatch,
    "authorization.sourceProviderBatch",
  );
  if (
    authorization.schema !==
      "evavo.tile-map-provider-execution-authorization.v1" ||
    authorizationSha256 !== sourceAuthorization.documentSha256 ||
    authorization.runId !== sourceAuthorization.runId ||
    authorization.sourceMapFingerprint !== sourceMapFingerprint ||
    absolutePath(
      authorizationProviderBatch.path,
      "authorization.sourceProviderBatch.path",
    ) !== providerBatchRecord.path ||
    authorizationProviderBatch.fileSha256 !==
      sha256(providerBatchRecord.bytes) ||
    authorizationProviderBatch.documentSha256 !== providerBatchFingerprint
  ) {
    throw failure(
      "EVAVO_TILE_MAP_REVIEW_EXECUTION",
      "provider authorization does not bind the exact provider batch and execution receipt",
    );
  }

  const masteringRecord = await readBoundJson(
    results.source_mastering_receipt_path,
    results.source_mastering_receipt_sha256,
    "Tile Map candidate mastering receipt",
  );
  const mastering = masteringRecord.value;
  const masteringSha256 = verifiedSealedDocument(
    mastering,
    "masteringSha256",
    "Tile Map candidate mastering receipt",
  );
  const masteringProviderBatch = object(
    mastering.sourceProviderBatch,
    "mastering.sourceProviderBatch",
  );
  const masteringExecution = object(
    mastering.sourceProviderExecution,
    "mastering.sourceProviderExecution",
  );
  if (
    mastering.schema !==
      "evavo.tile-map-candidate-mastering-receipt.v1" ||
    mastering.status !== "succeeded" ||
    masteringSha256 !==
      sha256Hex(
        results.source_mastering_sha256,
        "results.source_mastering_sha256",
      ) ||
    mastering.sourceMapFingerprint !== sourceMapFingerprint ||
    absolutePath(
      masteringProviderBatch.path,
      "mastering.sourceProviderBatch.path",
    ) !== providerBatchRecord.path ||
    masteringProviderBatch.fileSha256 !== sha256(providerBatchRecord.bytes) ||
    masteringProviderBatch.documentSha256 !== providerBatchFingerprint ||
    absolutePath(
      masteringExecution.path,
      "mastering.sourceProviderExecution.path",
    ) !== executionRecord.path ||
    masteringExecution.fileSha256 !== sha256(executionRecord.bytes) ||
    masteringExecution.documentSha256 !== executionSha256
  ) {
    throw failure(
      "EVAVO_TILE_MAP_REVIEW_MASTERING",
      "mastering receipt is invalid or does not bind the exact provider execution",
    );
  }

  const resultsAuthority = object(results.authority, "results.authority");
  if (
    resultsAuthority.provider_output_authority !== "intermediate-only" ||
    resultsAuthority.deterministic_mastering_required !== true ||
    resultsAuthority.mastering_quality_required !== true ||
    resultsAuthority.review_required !== true ||
    resultsAuthority.approval_authority !== false
  ) {
    throw failure(
      "EVAVO_TILE_MAP_REVIEW_AUTHORITY",
      "candidate results do not preserve provider/mastering/review authority boundaries",
    );
  }

  const jobs = new Map<string, JsonObject>();
  for (const [index, item] of array(batch.jobs, "batch.jobs").entries()) {
    const job = object(item, `batch.jobs[${index}]`);
    const candidateId = text(
      job.candidate_id,
      `batch.jobs[${index}].candidate_id`,
    );
    if (jobs.has(candidateId)) {
      throw failure(
        "EVAVO_TILE_MAP_REVIEW_DUPLICATE",
        `duplicate candidate job ${candidateId}`,
      );
    }
    jobs.set(candidateId, job);
  }
  const masteringJobs = new Map<string, JsonObject>();
  for (const [index, item] of array(
    mastering.jobs,
    "mastering.jobs",
  ).entries()) {
    const job = object(item, `mastering.jobs[${index}]`);
    const candidateId = text(
      job.candidateId,
      `mastering.jobs[${index}].candidateId`,
    );
    if (masteringJobs.has(candidateId)) {
      throw failure(
        "EVAVO_TILE_MAP_REVIEW_DUPLICATE",
        `duplicate mastering job ${candidateId}`,
      );
    }
    masteringJobs.set(candidateId, job);
  }
  if (masteringJobs.size !== jobs.size) {
    throw failure(
      "EVAVO_TILE_MAP_REVIEW_MASTERING",
      "mastering receipt candidate count differs from candidate batch",
    );
  }

  const resultRows = array(results.candidates, "results.candidates");
  if (resultRows.length !== jobs.size) {
    throw failure(
      "EVAVO_TILE_MAP_REVIEW_COUNT",
      `candidate results contain ${resultRows.length} rows; expected ${jobs.size}`,
    );
  }
  const resolvedResultsPath = path.resolve(resultsPath);
  const resultsRoot = path.dirname(resolvedResultsPath);
  const candidates: ReviewCandidate[] = [];
  const seen = new Set<string>();
  const seenDigests = new Set<string>();

  for (const [index, item] of resultRows.entries()) {
    const row = object(item, `results.candidates[${index}]`);
    const candidateId = text(
      row.candidate_id,
      `results.candidates[${index}].candidate_id`,
    );
    if (seen.has(candidateId)) {
      throw failure(
        "EVAVO_TILE_MAP_REVIEW_DUPLICATE",
        `duplicate candidate result ${candidateId}`,
      );
    }
    seen.add(candidateId);
    const job = jobs.get(candidateId);
    const mastered = masteringJobs.get(candidateId);
    if (!job || !mastered) {
      throw failure(
        "EVAVO_TILE_MAP_REVIEW_UNKNOWN",
        `unknown or unmastered candidate result ${candidateId}`,
      );
    }

    const requested = portableRelative(text(row.path, `${candidateId}.path`));
    const expectedPath = portableRelative(
      text(job.output_path, `${candidateId}.output_path`),
    );
    if (requested !== expectedPath) {
      throw failure(
        "EVAVO_TILE_MAP_REVIEW_PATH",
        `${candidateId} result path ${requested} != planned ${expectedPath}`,
      );
    }
    if (
      mastered.outputPath !== expectedPath ||
      mastered.taskId !== job.task_id ||
      mastered.visualFamily !== job.visual_family ||
      mastered.state !== "succeeded" ||
      mastered.qualityPassed !== true ||
      mastered.approvalState !== "unapproved"
    ) {
      throw failure(
        "EVAVO_TILE_MAP_REVIEW_MASTERING",
        `${candidateId} mastering identity or quality status is invalid`,
      );
    }

    const sourceProviderArtifactId = artifactId(
      row.source_provider_artifact_id,
      `${candidateId}.source_provider_artifact_id`,
    );
    const masteredArtifactId = artifactId(
      row.mastered_artifact_id,
      `${candidateId}.mastered_artifact_id`,
    );
    const masteringEvidenceArtifactId = artifactId(
      row.mastering_evidence_artifact_id,
      `${candidateId}.mastering_evidence_artifact_id`,
    );
    const masteringJobId = text(
      row.mastering_job_id,
      `${candidateId}.mastering_job_id`,
    );
    const masteringSpecSha256 = sha256Hex(
      row.mastering_spec_sha256,
      `${candidateId}.mastering_spec_sha256`,
    );
    if (
      sourceProviderArtifactId !== mastered.sourceCandidateArtifactId ||
      masteredArtifactId !== mastered.masteredArtifactId ||
      masteringEvidenceArtifactId !== mastered.evidenceArtifactId ||
      masteringJobId !== mastered.masteringJobId ||
      masteringSpecSha256 !== mastered.masteringSpecSha256 ||
      row.mastered_artifact_content_hash !== mastered.masteredContentHash ||
      row.mastering_evidence_content_hash !== mastered.evidenceContentHash
    ) {
      throw failure(
        "EVAVO_TILE_MAP_REVIEW_MASTERING",
        `${candidateId} materialized lineage differs from mastering receipt`,
      );
    }

    const absolute = path.resolve(resultsRoot, ...requested.split("/"));
    const relative = path.relative(resultsRoot, absolute);
    if (
      relative === ".." ||
      relative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relative)
    ) {
      throw failure(
        "EVAVO_TILE_MAP_REVIEW_PATH",
        `${candidateId} result escapes results root`,
      );
    }
    const bytes = await readFile(absolute);
    const actualSha = sha256(bytes);
    const expectedSha = sha256Hex(row.sha256, `${candidateId}.sha256`);
    if (
      actualSha !== expectedSha ||
      actualSha !== mastered.masteredContentSha256
    ) {
      throw failure(
        "EVAVO_TILE_MAP_REVIEW_HASH",
        `${candidateId} mastered result hash changed`,
      );
    }
    if (seenDigests.has(actualSha)) {
      throw failure(
        "EVAVO_TILE_MAP_REVIEW_DUPLICATE",
        `${candidateId} duplicates another candidate's exact mastered bytes`,
      );
    }
    seenDigests.add(actualSha);

    const metadata = await sharp(bytes, { failOn: "error" }).metadata();
    if (metadata.format !== "png" || !metadata.width || !metadata.height) {
      throw failure(
        "EVAVO_TILE_MAP_REVIEW_FORMAT",
        `${candidateId} must be a readable mastered PNG`,
      );
    }
    const dimensions = object(job.dimensions, `${candidateId}.dimensions`);
    const expectedWidth = positiveInteger(
      dimensions.width,
      `${candidateId}.dimensions.width`,
    );
    const expectedHeight = positiveInteger(
      dimensions.height,
      `${candidateId}.dimensions.height`,
    );
    if (
      metadata.width !== expectedWidth ||
      metadata.height !== expectedHeight
    ) {
      throw failure(
        "EVAVO_TILE_MAP_REVIEW_GEOMETRY",
        `${candidateId} is ${metadata.width}x${metadata.height}; expected mastered ${expectedWidth}x${expectedHeight}`,
      );
    }
    const alphaRequired = booleanValue(
      job.alpha_required,
      `${candidateId}.alpha_required`,
    );
    if (alphaRequired && metadata.hasAlpha !== true) {
      throw failure(
        "EVAVO_TILE_MAP_REVIEW_ALPHA",
        `${candidateId} requires alpha after mastering`,
      );
    }

    candidates.push({
      candidate_id: candidateId,
      task_id: text(job.task_id, `${candidateId}.task_id`),
      visual_family: text(
        job.visual_family,
        `${candidateId}.visual_family`,
      ),
      path: requested,
      sha256: actualSha,
      bytes: bytes.length,
      width: metadata.width,
      height: metadata.height,
      has_alpha: metadata.hasAlpha === true,
      source_provider_artifact_id: sourceProviderArtifactId,
      mastered_artifact_id: masteredArtifactId,
      mastering_evidence_artifact_id: masteringEvidenceArtifactId,
      mastering_job_id: masteringJobId,
      mastering_spec_sha256: masteringSpecSha256,
      structural_review: "pending",
      visual_review: "pending",
      creative_review: "pending",
      promotion_eligible: false,
    });
  }

  const missing = [...jobs.keys()].filter(
    (candidateId) => !seen.has(candidateId),
  );
  if (missing.length) {
    throw failure(
      "EVAVO_TILE_MAP_REVIEW_MISSING",
      `candidate results missing: ${missing.join(", ")}`,
    );
  }
  candidates.sort(
    (a, b) =>
      a.visual_family.localeCompare(b.visual_family) ||
      a.candidate_id.localeCompare(b.candidate_id),
  );

  const base = {
    schema_version: 1 as const,
    source_batch_sha256: sha256(batchBytes),
    source_batch_fingerprint: batchFingerprint,
    source_package_fingerprint: sha256Hex(
      batch.source_package_fingerprint,
      "source_package_fingerprint",
    ),
    source_provider_batch_path: providerBatchRecord.path,
    source_provider_batch_sha256: sha256(providerBatchRecord.bytes),
    source_provider_batch_fingerprint: providerBatchFingerprint,
    source_execution_receipt_path: executionRecord.path,
    source_execution_receipt_sha256: sha256(executionRecord.bytes),
    source_execution_sha256: executionSha256,
    source_mastering_receipt_path: masteringRecord.path,
    source_mastering_receipt_sha256: sha256(masteringRecord.bytes),
    source_mastering_sha256: masteringSha256,
    source_map_fingerprint: sourceMapFingerprint,
    provider_results_path: resolvedResultsPath,
    provider_results_sha256: sha256(resultsBytes),
    provider_results_fingerprint: resultsFingerprint,
    candidate_root: resultsRoot,
    map_id: text(batch.map_id, "map_id"),
    projection: text(batch.projection, "projection"),
    candidates,
    authority: {
      semantic_authority: "tile-map-studio" as const,
      review_authority: "art-studio" as const,
      provider_authority: "intermediate-only" as const,
      execution_evidence_required: true as const,
      deterministic_mastering_required: true as const,
      mastering_quality_required: true as const,
    },
    status: "awaiting-review" as const,
  };
  return {
    ...base,
    review_fingerprint: sha256(Buffer.from(canonical(base), "utf8")),
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
      "EVAVO_TILE_MAP_REVIEW_DRIFT",
      `${label} bytes no longer match their retained SHA-256`,
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
      "EVAVO_TILE_MAP_REVIEW_DRIFT",
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
      "EVAVO_TILE_MAP_REVIEW_DRIFT",
      `${label} self hash is invalid`,
    );
  }
  return claimed;
}

function absolutePath(value: unknown, label: string): string {
  const requested = text(value, label);
  const resolved = path.resolve(requested);
  if (requested !== resolved) {
    throw failure(
      "EVAVO_TILE_MAP_REVIEW_PATH",
      `${label} must be absolute and normalized`,
    );
  }
  return resolved;
}

function artifactId(value: unknown, label: string): string {
  const result = text(value, label);
  if (!/^artifact_[0-9a-f]{64}$/u.test(result)) {
    throw failure(
      "EVAVO_TILE_MAP_REVIEW_ARTIFACT",
      `${label} must use artifact_<sha256> format`,
    );
  }
  return result;
}

function portableRelative(value: string): string {
  if (value.includes("\\") || path.posix.isAbsolute(value)) {
    throw failure(
      "EVAVO_TILE_MAP_REVIEW_PATH",
      `path must be forward-slash relative: ${value}`,
    );
  }
  const normalized = path.posix.normalize(value);
  if (
    normalized !== value ||
    normalized === "." ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    normalized.includes("//")
  ) {
    throw failure(
      "EVAVO_TILE_MAP_REVIEW_PATH",
      `unsafe candidate path: ${value}`,
    );
  }
  return normalized;
}
function parseObject(content: string, label: string): JsonObject {
  try {
    return object(JSON.parse(content) as unknown, label);
  } catch (error) {
    if (error instanceof Error && "code" in error) throw error;
    throw failure(
      "EVAVO_TILE_MAP_REVIEW_JSON",
      `invalid JSON in ${label}`,
    );
  }
}
function object(value: unknown, pathName: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw failure(
      "EVAVO_TILE_MAP_REVIEW_TYPE",
      `${pathName} must be object`,
    );
  }
  return value as JsonObject;
}
function array(value: unknown, pathName: string): unknown[] {
  if (!Array.isArray(value)) {
    throw failure(
      "EVAVO_TILE_MAP_REVIEW_TYPE",
      `${pathName} must be array`,
    );
  }
  return value;
}
function text(value: unknown, pathName: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw failure(
      "EVAVO_TILE_MAP_REVIEW_TYPE",
      `${pathName} must be non-empty string`,
    );
  }
  return value;
}
function positiveInteger(value: unknown, pathName: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw failure(
      "EVAVO_TILE_MAP_REVIEW_TYPE",
      `${pathName} must be positive integer`,
    );
  }
  return value as number;
}
function booleanValue(value: unknown, pathName: string): boolean {
  if (typeof value !== "boolean") {
    throw failure(
      "EVAVO_TILE_MAP_REVIEW_TYPE",
      `${pathName} must be boolean`,
    );
  }
  return value;
}
function sha256Hex(value: unknown, pathName: string): string {
  const result = text(value, pathName).toLowerCase();
  if (!/^[0-9a-f]{64}$/u.test(result)) {
    throw failure(
      "EVAVO_TILE_MAP_REVIEW_HASH",
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
  if (Array.isArray(value)) {
    return `[${value.map(canonical).join(",")}]`;
  }
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
