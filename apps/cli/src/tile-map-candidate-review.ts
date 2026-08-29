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
  source_map_fingerprint: string;
  provider_results_path: string;
  provider_results_sha256: string;
  candidate_root: string;
  map_id: string;
  projection: string;
  candidates: ReviewCandidate[];
  authority: {
    semantic_authority: "tile-map-studio";
    review_authority: "art-studio";
    provider_authority: "intermediate-only";
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
  if (batch.schema_version !== 1 || batch.status !== "ready-for-provider-candidates") {
    throw failure("EVAVO_TILE_MAP_REVIEW_BATCH", "candidate batch must be schema v1 and ready-for-provider-candidates");
  }
  if (results.schema_version !== 1) {
    throw failure("EVAVO_TILE_MAP_REVIEW_RESULTS", "candidate results schema_version must be 1");
  }
  const batchFingerprint = sha256Hex(batch.batch_fingerprint, "batch_fingerprint");
  if (sha256Hex(results.source_batch_fingerprint, "results.source_batch_fingerprint") !== batchFingerprint) {
    throw failure("EVAVO_TILE_MAP_REVIEW_DRIFT", "candidate results do not target this exact batch fingerprint");
  }
  const jobs = new Map<string, JsonObject>();
  for (const [index, item] of array(batch.jobs, "batch.jobs").entries()) {
    const job = object(item, `batch.jobs[${index}]`);
    const candidateId = text(job.candidate_id, `batch.jobs[${index}].candidate_id`);
    if (jobs.has(candidateId)) throw failure("EVAVO_TILE_MAP_REVIEW_DUPLICATE", `duplicate candidate job ${candidateId}`);
    jobs.set(candidateId, job);
  }
  const resultRows = array(results.candidates, "results.candidates");
  if (resultRows.length !== jobs.size) {
    throw failure("EVAVO_TILE_MAP_REVIEW_COUNT", `candidate results contain ${resultRows.length} rows; expected ${jobs.size}`);
  }
  const resolvedResultsPath = path.resolve(resultsPath);
  const resultsRoot = path.dirname(resolvedResultsPath);
  const candidates: ReviewCandidate[] = [];
  const seen = new Set<string>();
  const seenDigests = new Set<string>();
  for (const [index, item] of resultRows.entries()) {
    const row = object(item, `results.candidates[${index}]`);
    const candidateId = text(row.candidate_id, `results.candidates[${index}].candidate_id`);
    if (seen.has(candidateId)) throw failure("EVAVO_TILE_MAP_REVIEW_DUPLICATE", `duplicate candidate result ${candidateId}`);
    seen.add(candidateId);
    const job = jobs.get(candidateId);
    if (!job) throw failure("EVAVO_TILE_MAP_REVIEW_UNKNOWN", `unknown candidate result ${candidateId}`);
    const requested = portableRelative(text(row.path, `${candidateId}.path`));
    const expectedPath = portableRelative(text(job.output_path, `${candidateId}.output_path`));
    if (requested !== expectedPath) {
      throw failure("EVAVO_TILE_MAP_REVIEW_PATH", `${candidateId} result path ${requested} != planned ${expectedPath}`);
    }
    const absolute = path.resolve(resultsRoot, ...requested.split("/"));
    const relative = path.relative(resultsRoot, absolute);
    if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw failure("EVAVO_TILE_MAP_REVIEW_PATH", `${candidateId} result escapes results root`);
    }
    const bytes = await readFile(absolute);
    const actualSha = sha256(bytes);
    const expectedSha = sha256Hex(row.sha256, `${candidateId}.sha256`);
    if (actualSha !== expectedSha) throw failure("EVAVO_TILE_MAP_REVIEW_HASH", `${candidateId} result hash changed`);
    if (seenDigests.has(actualSha)) {
      throw failure("EVAVO_TILE_MAP_REVIEW_DUPLICATE", `${candidateId} duplicates another candidate's exact bytes`);
    }
    seenDigests.add(actualSha);
    const metadata = await sharp(bytes, { failOn: "error" }).metadata();
    if (metadata.format !== "png" || !metadata.width || !metadata.height) {
      throw failure("EVAVO_TILE_MAP_REVIEW_FORMAT", `${candidateId} must be a readable PNG`);
    }
    const dimensions = object(job.dimensions, `${candidateId}.dimensions`);
    const expectedWidth = positiveInteger(dimensions.width, `${candidateId}.dimensions.width`);
    const expectedHeight = positiveInteger(dimensions.height, `${candidateId}.dimensions.height`);
    if (metadata.width !== expectedWidth || metadata.height !== expectedHeight) {
      throw failure("EVAVO_TILE_MAP_REVIEW_GEOMETRY", `${candidateId} is ${metadata.width}x${metadata.height}; expected ${expectedWidth}x${expectedHeight}`);
    }
    const alphaRequired = booleanValue(job.alpha_required, `${candidateId}.alpha_required`);
    if (alphaRequired && metadata.hasAlpha !== true) {
      throw failure("EVAVO_TILE_MAP_REVIEW_ALPHA", `${candidateId} requires alpha`);
    }
    candidates.push({
      candidate_id: candidateId,
      task_id: text(job.task_id, `${candidateId}.task_id`),
      visual_family: text(job.visual_family, `${candidateId}.visual_family`),
      path: requested,
      sha256: actualSha,
      bytes: bytes.length,
      width: metadata.width,
      height: metadata.height,
      has_alpha: metadata.hasAlpha === true,
      structural_review: "pending",
      visual_review: "pending",
      creative_review: "pending",
      promotion_eligible: false,
    });
  }
  const missing = [...jobs.keys()].filter((candidateId) => !seen.has(candidateId));
  if (missing.length) throw failure("EVAVO_TILE_MAP_REVIEW_MISSING", `candidate results missing: ${missing.join(", ")}`);
  candidates.sort((a, b) => a.visual_family.localeCompare(b.visual_family) || a.candidate_id.localeCompare(b.candidate_id));
  const base = {
    schema_version: 1 as const,
    source_batch_sha256: sha256(batchBytes),
    source_batch_fingerprint: batchFingerprint,
    source_package_fingerprint: sha256Hex(batch.source_package_fingerprint, "source_package_fingerprint"),
    source_map_fingerprint: sha256Hex(batch.source_map_fingerprint, "source_map_fingerprint"),
    provider_results_path: resolvedResultsPath,
    provider_results_sha256: sha256(resultsBytes),
    candidate_root: resultsRoot,
    map_id: text(batch.map_id, "map_id"),
    projection: text(batch.projection, "projection"),
    candidates,
    authority: {
      semantic_authority: "tile-map-studio" as const,
      review_authority: "art-studio" as const,
      provider_authority: "intermediate-only" as const,
    },
    status: "awaiting-review" as const,
  };
  return { ...base, review_fingerprint: sha256(Buffer.from(canonical(base), "utf8")) };
}

function portableRelative(value: string): string { if (value.includes("\\") || path.posix.isAbsolute(value)) throw failure("EVAVO_TILE_MAP_REVIEW_PATH", `path must be forward-slash relative: ${value}`); const normalized = path.posix.normalize(value); if (normalized !== value || normalized === "." || normalized === ".." || normalized.startsWith("../") || normalized.includes("//")) throw failure("EVAVO_TILE_MAP_REVIEW_PATH", `unsafe candidate path: ${value}`); return normalized; }
function parseObject(content: string, label: string): JsonObject { try { return object(JSON.parse(content) as unknown, label); } catch (error) { if (error instanceof Error && "code" in error) throw error; throw failure("EVAVO_TILE_MAP_REVIEW_JSON", `invalid JSON in ${label}`); } }
function object(value: unknown, path: string): JsonObject { if (!value || typeof value !== "object" || Array.isArray(value)) throw failure("EVAVO_TILE_MAP_REVIEW_TYPE", `${path} must be object`); return value as JsonObject; }
function array(value: unknown, path: string): unknown[] { if (!Array.isArray(value)) throw failure("EVAVO_TILE_MAP_REVIEW_TYPE", `${path} must be array`); return value; }
function text(value: unknown, path: string): string { if (typeof value !== "string" || !value.trim()) throw failure("EVAVO_TILE_MAP_REVIEW_TYPE", `${path} must be non-empty string`); return value; }
function positiveInteger(value: unknown, path: string): number { if (!Number.isSafeInteger(value) || (value as number) <= 0) throw failure("EVAVO_TILE_MAP_REVIEW_TYPE", `${path} must be positive integer`); return value as number; }
function booleanValue(value: unknown, path: string): boolean { if (typeof value !== "boolean") throw failure("EVAVO_TILE_MAP_REVIEW_TYPE", `${path} must be boolean`); return value; }
function sha256Hex(value: unknown, path: string): string { const result = text(value, path).toLowerCase(); if (!/^[0-9a-f]{64}$/u.test(result)) throw failure("EVAVO_TILE_MAP_REVIEW_HASH", `${path} must be SHA-256`); return result; }
function sha256(value: Uint8Array): string { return createHash("sha256").update(value).digest("hex"); }
function canonical(value: unknown): string { if (value === null || typeof value !== "object") return JSON.stringify(value); if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`; const entries = Object.entries(value as JsonObject).sort(([a], [b]) => a.localeCompare(b)); return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`; }
function failure(code: string, message: string): Error & { code: string } { const error = new Error(message) as Error & { code: string }; error.code = code; return error; }
