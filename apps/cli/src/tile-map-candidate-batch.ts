import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

type JsonObject = Record<string, unknown>;

type CandidateJob = {
  candidate_id: string;
  task_id: string;
  visual_family: string;
  task_kind: "tile-family" | "feature-family";
  candidate_index: number;
  projection: string;
  dimensions: { width: number; height: number };
  alpha_required: boolean;
  semantic_source_ids: string[];
  immutable_semantic_rules: string[];
  creative_direction: string[];
  topology: JsonObject | null;
  feature_kind: string | null;
  output_path: string;
  provider_request: {
    operation: "generate";
    authority: "intermediate-only";
    canvas: { width: number; height: number };
    prompt_contract: {
      must_preserve: string[];
      art_direction: string[];
      prohibited: string[];
    };
  };
  approvals: {
    structural: false;
    visual: false;
    creative: false;
  };
};

export type TileMapCandidateBatch = {
  schema_version: 1;
  source_package_sha256: string;
  source_package_fingerprint: string;
  source_map_fingerprint: string;
  map_id: string;
  consumer_adapter: string | null;
  projection: string;
  jobs: CandidateJob[];
  authority: {
    semantic_authority: "tile-map-studio";
    creative_authority: "art-studio";
    provider_authority: "candidate-generation-only";
  };
  status: "ready-for-provider-candidates";
  batch_fingerprint: string;
};

export async function compileTileMapCandidateBatchFile(input: string): Promise<TileMapCandidateBatch> {
  const bytes = await readFile(input);
  const raw = parseObject(bytes.toString("utf8"), input);
  return compileTileMapCandidateBatch(raw, sha256(bytes));
}

export function compileTileMapCandidateBatch(
  raw: JsonObject,
  sourcePackageSha256: string,
): TileMapCandidateBatch {
  if (raw.schema_version !== 1 || raw.status !== "ready-for-candidate-authoring") {
    throw failure("EVAVO_TILE_MAP_CANDIDATE_PACKAGE", "input must be governed Tile Map source package schema v1");
  }
  const projection = text(raw.projection, "projection");
  const sourceMapFingerprint = sha256Hex(raw.source_map_fingerprint, "source_map_fingerprint");
  const tasks = array(raw.tasks, "tasks");
  const jobs: CandidateJob[] = [];
  const seen = new Set<string>();
  for (const [taskIndex, entry] of tasks.entries()) {
    const task = object(entry, `tasks[${taskIndex}]`);
    const taskId = text(task.task_id, `tasks[${taskIndex}].task_id`);
    const visualFamily = text(task.visual_family, `tasks[${taskIndex}].visual_family`);
    const taskKind = task.task_kind;
    if (taskKind !== "tile-family" && taskKind !== "feature-family") {
      throw failure("EVAVO_TILE_MAP_CANDIDATE_KIND", `${taskId} task_kind is unsupported`);
    }
    if (text(task.projection, `${taskId}.projection`) !== projection) {
      throw failure("EVAVO_TILE_MAP_CANDIDATE_PROJECTION", `${taskId} projection differs from source package`);
    }
    const dimensions = object(task.dimensions, `${taskId}.dimensions`);
    const width = positiveInteger(dimensions.width, `${taskId}.dimensions.width`);
    const height = positiveInteger(dimensions.height, `${taskId}.dimensions.height`);
    const candidateCount = positiveInteger(task.candidate_count, `${taskId}.candidate_count`);
    const semanticRules = stringArray(task.immutable_semantic_rules, `${taskId}.immutable_semantic_rules`);
    const creativeDirection = stringArray(task.creative_direction, `${taskId}.creative_direction`);
    const semanticSourceIds = stringArray(task.semantic_source_ids, `${taskId}.semantic_source_ids`);
    const alphaRequired = booleanValue(task.alpha_required, `${taskId}.alpha_required`);
    const topology = task.topology === null ? null : object(task.topology, `${taskId}.topology`);
    const featureKind = task.feature_kind === null ? null : text(task.feature_kind, `${taskId}.feature_kind`);
    for (let index = 0; index < candidateCount; index += 1) {
      const candidateId = `tile-map-candidate-${sha256(Buffer.from(`${sourceMapFingerprint}\n${taskId}\n${index}`, "utf8")).slice(0, 20)}`;
      if (seen.has(candidateId)) throw failure("EVAVO_TILE_MAP_CANDIDATE_DUPLICATE", `duplicate candidate_id ${candidateId}`);
      seen.add(candidateId);
      const outputPath = `candidates/${safeSlug(visualFamily)}/${String(index + 1).padStart(2, "0")}.png`;
      jobs.push({
        candidate_id: candidateId,
        task_id: taskId,
        visual_family: visualFamily,
        task_kind: taskKind,
        candidate_index: index,
        projection,
        dimensions: { width, height },
        alpha_required: alphaRequired,
        semantic_source_ids: [...semanticSourceIds],
        immutable_semantic_rules: [...semanticRules],
        creative_direction: [...creativeDirection],
        topology,
        feature_kind: featureKind,
        output_path: outputPath,
        provider_request: {
          operation: "generate",
          authority: "intermediate-only",
          canvas: { width, height },
          prompt_contract: {
            must_preserve: [...semanticRules],
            art_direction: [...creativeDirection],
            prohibited: [
              "Do not invent gameplay semantics, connectivity, collision, navigation, text or symbols not present in the source contract.",
              "Do not treat provider success as approval.",
              "Do not crop, rotate or change the declared projection/canvas.",
            ],
          },
        },
        approvals: { structural: false, visual: false, creative: false },
      });
    }
  }
  if (jobs.length === 0) throw failure("EVAVO_TILE_MAP_CANDIDATE_EMPTY", "source package produced no candidate jobs");
  jobs.sort((a, b) => a.visual_family.localeCompare(b.visual_family) || a.candidate_index - b.candidate_index);
  const base = {
    schema_version: 1 as const,
    source_package_sha256: sha256Hex(sourcePackageSha256, "source_package_sha256"),
    source_package_fingerprint: sha256Hex(raw.package_fingerprint, "package_fingerprint"),
    source_map_fingerprint: sourceMapFingerprint,
    map_id: text(raw.map_id, "map_id"),
    consumer_adapter: nullableText(raw.consumer_adapter, "consumer_adapter"),
    projection,
    jobs,
    authority: {
      semantic_authority: "tile-map-studio" as const,
      creative_authority: "art-studio" as const,
      provider_authority: "candidate-generation-only" as const,
    },
    status: "ready-for-provider-candidates" as const,
  };
  return { ...base, batch_fingerprint: sha256(Buffer.from(canonical(base), "utf8")) };
}

function safeSlug(value: string): string {
  const slug = value.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "");
  if (!slug) throw failure("EVAVO_TILE_MAP_CANDIDATE_SLUG", `cannot derive safe slug from ${value}`);
  return `${slug}-${sha256(Buffer.from(value, "utf8")).slice(0, 8)}`;
}
function parseObject(content: string, label: string): JsonObject { try { return object(JSON.parse(content) as unknown, label); } catch (error) { if (error instanceof Error && "code" in error) throw error; throw failure("EVAVO_TILE_MAP_CANDIDATE_JSON", `invalid JSON in ${label}`); } }
function object(value: unknown, path: string): JsonObject { if (!value || typeof value !== "object" || Array.isArray(value)) throw failure("EVAVO_TILE_MAP_CANDIDATE_TYPE", `${path} must be object`); return value as JsonObject; }
function array(value: unknown, path: string): unknown[] { if (!Array.isArray(value)) throw failure("EVAVO_TILE_MAP_CANDIDATE_TYPE", `${path} must be array`); return value; }
function text(value: unknown, path: string): string { if (typeof value !== "string" || !value.trim()) throw failure("EVAVO_TILE_MAP_CANDIDATE_TYPE", `${path} must be non-empty string`); return value; }
function nullableText(value: unknown, path: string): string | null { if (value === null || value === undefined) return null; return text(value, path); }
function positiveInteger(value: unknown, path: string): number { if (!Number.isSafeInteger(value) || (value as number) <= 0) throw failure("EVAVO_TILE_MAP_CANDIDATE_TYPE", `${path} must be positive integer`); return value as number; }
function booleanValue(value: unknown, path: string): boolean { if (typeof value !== "boolean") throw failure("EVAVO_TILE_MAP_CANDIDATE_TYPE", `${path} must be boolean`); return value; }
function stringArray(value: unknown, path: string): string[] { const values = array(value, path).map((item, index) => text(item, `${path}[${index}]`)); if (values.length === 0) throw failure("EVAVO_TILE_MAP_CANDIDATE_TYPE", `${path} must not be empty`); return values; }
function sha256Hex(value: unknown, path: string): string { const result = text(value, path).toLowerCase(); if (!/^[0-9a-f]{64}$/u.test(result)) throw failure("EVAVO_TILE_MAP_CANDIDATE_HASH", `${path} must be SHA-256`); return result; }
function sha256(value: Uint8Array): string { return createHash("sha256").update(value).digest("hex"); }
function canonical(value: unknown): string { if (value === null || typeof value !== "object") return JSON.stringify(value); if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`; const entries = Object.entries(value as JsonObject).sort(([a], [b]) => a.localeCompare(b)); return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`; }
function failure(code: string, message: string): Error & { code: string } { const error = new Error(message) as Error & { code: string }; error.code = code; return error; }
