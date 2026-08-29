import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

type JsonObject = Record<string, unknown>;

type Decision = "approved" | "rejected";

type CandidateDecision = {
  candidate_id: string;
  task_id: string;
  visual_family: string;
  path: string;
  sha256: string;
  structural: Decision;
  visual: Decision;
  creative: Decision;
  notes: string | null;
};

export type TileMapReviewFinalization = {
  schema_version: 1;
  source_review_fingerprint: string;
  source_package_fingerprint: string;
  source_map_fingerprint: string;
  map_id: string;
  projection: string;
  creative_approval: {
    decision: "approved";
    approved_by: string;
    approved_at: string;
  };
  candidates: CandidateDecision[];
  tasks: Array<{
    task_id: string;
    visual_family: string;
    approved_sources: Array<{ path: string; sha256: string }>;
  }>;
  authority: {
    semantic_authority: "tile-map-studio";
    review_authority: "art-studio";
    provider_authority: "intermediate-only";
  };
  status: "review-finalized";
  finalization_fingerprint: string;
};

export async function finalizeTileMapReview(
  reviewPath: string,
  decisionsPath: string,
): Promise<TileMapReviewFinalization> {
  const [reviewBytes, decisionBytes] = await Promise.all([
    readFile(reviewPath),
    readFile(decisionsPath),
  ]);
  const review = parseObject(reviewBytes.toString("utf8"), reviewPath);
  const decisions = parseObject(decisionBytes.toString("utf8"), decisionsPath);
  if (review.schema_version !== 1 || review.status !== "awaiting-review") {
    throw failure("EVAVO_TILE_MAP_FINALIZE_REVIEW", "review must be schema v1 and awaiting-review");
  }
  if (decisions.schema_version !== 1) {
    throw failure("EVAVO_TILE_MAP_FINALIZE_DECISIONS", "review decisions schema_version must be 1");
  }
  const reviewFingerprint = sha256Hex(review.review_fingerprint, "review_fingerprint");
  if (sha256Hex(decisions.source_review_fingerprint, "decisions.source_review_fingerprint") !== reviewFingerprint) {
    throw failure("EVAVO_TILE_MAP_FINALIZE_DRIFT", "review decisions do not target this exact review fingerprint");
  }
  const reviewer = text(decisions.reviewed_by, "reviewed_by");
  const reviewedAt = timestamp(decisions.reviewed_at, "reviewed_at");
  const reviewCandidates = new Map<string, JsonObject>();
  for (const [index, item] of array(review.candidates, "review.candidates").entries()) {
    const candidate = object(item, `review.candidates[${index}]`);
    const id = text(candidate.candidate_id, `review.candidates[${index}].candidate_id`);
    if (reviewCandidates.has(id)) throw failure("EVAVO_TILE_MAP_FINALIZE_DUPLICATE", `duplicate review candidate ${id}`);
    reviewCandidates.set(id, candidate);
  }
  const decisionMap = new Map<string, JsonObject>();
  for (const [index, item] of array(decisions.candidates, "decisions.candidates").entries()) {
    const row = object(item, `decisions.candidates[${index}]`);
    const id = text(row.candidate_id, `decisions.candidates[${index}].candidate_id`);
    if (decisionMap.has(id)) throw failure("EVAVO_TILE_MAP_FINALIZE_DUPLICATE", `duplicate candidate decision ${id}`);
    decisionMap.set(id, row);
  }
  const missing = [...reviewCandidates.keys()].filter((id) => !decisionMap.has(id));
  const extra = [...decisionMap.keys()].filter((id) => !reviewCandidates.has(id));
  if (missing.length || extra.length) {
    throw failure("EVAVO_TILE_MAP_FINALIZE_SET", `review decision set mismatch: missing=${missing.join(",")}, extra=${extra.join(",")}`);
  }

  const candidateDecisions: CandidateDecision[] = [];
  const taskMap = new Map<string, { visual_family: string; sources: Array<{ path: string; sha256: string }> }>();
  for (const [candidateId, candidate] of [...reviewCandidates.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const row = decisionMap.get(candidateId)!;
    const structural = decision(row.structural, `${candidateId}.structural`);
    const visual = decision(row.visual, `${candidateId}.visual`);
    const creative = decision(row.creative, `${candidateId}.creative`);
    const notes = nullableText(row.notes, `${candidateId}.notes`);
    const taskId = text(candidate.task_id, `${candidateId}.task_id`);
    const family = text(candidate.visual_family, `${candidateId}.visual_family`);
    const candidateDecision: CandidateDecision = {
      candidate_id: candidateId,
      task_id: taskId,
      visual_family: family,
      path: text(candidate.path, `${candidateId}.path`),
      sha256: sha256Hex(candidate.sha256, `${candidateId}.sha256`),
      structural,
      visual,
      creative,
      notes,
    };
    candidateDecisions.push(candidateDecision);
    if (structural === "approved" && visual === "approved" && creative === "approved") {
      const current = taskMap.get(taskId) ?? { visual_family: family, sources: [] };
      if (current.visual_family !== family) throw failure("EVAVO_TILE_MAP_FINALIZE_FAMILY", `${taskId} spans multiple visual families`);
      current.sources.push({ path: candidateDecision.path, sha256: candidateDecision.sha256 });
      taskMap.set(taskId, current);
    }
  }
  if (taskMap.size === 0) throw failure("EVAVO_TILE_MAP_FINALIZE_EMPTY", "no candidates passed all three review gates");
  const tasks = [...taskMap.entries()]
    .map(([taskId, value]) => ({
      task_id: taskId,
      visual_family: value.visual_family,
      approved_sources: value.sources.sort((a, b) => a.path.localeCompare(b.path)),
    }))
    .sort((a, b) => a.visual_family.localeCompare(b.visual_family));

  const base = {
    schema_version: 1 as const,
    source_review_fingerprint: reviewFingerprint,
    source_package_fingerprint: sha256Hex(review.source_package_fingerprint, "source_package_fingerprint"),
    source_map_fingerprint: sha256Hex(review.source_map_fingerprint, "source_map_fingerprint"),
    map_id: text(review.map_id, "map_id"),
    projection: text(review.projection, "projection"),
    creative_approval: {
      decision: "approved" as const,
      approved_by: reviewer,
      approved_at: reviewedAt,
    },
    candidates: candidateDecisions,
    tasks,
    authority: {
      semantic_authority: "tile-map-studio" as const,
      review_authority: "art-studio" as const,
      provider_authority: "intermediate-only" as const,
    },
    status: "review-finalized" as const,
  };
  return { ...base, finalization_fingerprint: sha256(Buffer.from(canonical(base), "utf8")) };
}

function decision(value: unknown, path: string): Decision { if (value !== "approved" && value !== "rejected") throw failure("EVAVO_TILE_MAP_FINALIZE_DECISION", `${path} must be approved or rejected`); return value; }
function parseObject(content: string, label: string): JsonObject { try { return object(JSON.parse(content) as unknown, label); } catch (error) { if (error instanceof Error && "code" in error) throw error; throw failure("EVAVO_TILE_MAP_FINALIZE_JSON", `invalid JSON in ${label}`); } }
function object(value: unknown, path: string): JsonObject { if (!value || typeof value !== "object" || Array.isArray(value)) throw failure("EVAVO_TILE_MAP_FINALIZE_TYPE", `${path} must be object`); return value as JsonObject; }
function array(value: unknown, path: string): unknown[] { if (!Array.isArray(value)) throw failure("EVAVO_TILE_MAP_FINALIZE_TYPE", `${path} must be array`); return value; }
function text(value: unknown, path: string): string { if (typeof value !== "string" || !value.trim()) throw failure("EVAVO_TILE_MAP_FINALIZE_TYPE", `${path} must be non-empty string`); return value; }
function nullableText(value: unknown, path: string): string | null { if (value === null || value === undefined || value === "") return null; return text(value, path); }
function timestamp(value: unknown, path: string): string { const result = text(value, path); if (!Number.isFinite(Date.parse(result))) throw failure("EVAVO_TILE_MAP_FINALIZE_TYPE", `${path} must be ISO timestamp`); return result; }
function sha256Hex(value: unknown, path: string): string { const result = text(value, path).toLowerCase(); if (!/^[0-9a-f]{64}$/u.test(result)) throw failure("EVAVO_TILE_MAP_FINALIZE_HASH", `${path} must be SHA-256`); return result; }
function sha256(value: Uint8Array): string { return createHash("sha256").update(value).digest("hex"); }
function canonical(value: unknown): string { if (value === null || typeof value !== "object") return JSON.stringify(value); if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`; const entries = Object.entries(value as JsonObject).sort(([a], [b]) => a.localeCompare(b)); return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`; }
function failure(code: string, message: string): Error & { code: string } { const error = new Error(message) as Error & { code: string }; error.code = code; return error; }
