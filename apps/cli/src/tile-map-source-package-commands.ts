import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

type JsonObject = Record<string, unknown>;

type SourceTask = {
  task_id: string;
  visual_family: string;
  task_kind: "tile-family" | "feature-family";
  projection: string;
  dimensions: { width: number; height: number };
  required_approved_variants: number;
  candidate_count: number;
  alpha_required: boolean;
  semantic_source_ids: string[];
  immutable_semantic_rules: string[];
  creative_direction: string[];
  topology: JsonObject | null;
  feature_kind: string | null;
  output_contract: {
    candidate_directory: string;
    review_manifest: string;
    approved_source_manifest: string;
    format: "png-lossless";
    create_only: true;
    source_overwrite: false;
  };
  gates: {
    provider_output_is_intermediate: true;
    structural_review_required: true;
    visual_review_required: true;
    creative_approval_required: true;
    sprite_packaging_blocked_until_approval: true;
  };
};

export type TileMapSourcePackage = {
  schema_version: 1;
  source_plan_sha256: string;
  source_plan_fingerprint: string;
  source_map_fingerprint: string;
  map_id: string;
  consumer_adapter: string | null;
  production_profile: string | null;
  projection: string;
  tasks: SourceTask[];
  authority: {
    semantic_authority: "tile-map-studio";
    creative_authority: "art-studio";
    mastering_authority: "sprite-studio";
    provider_authority: "candidate-generation-only";
  };
  promotion_policy: {
    minimum_approved_sources_per_task_must_match_requirement: true;
    approval_must_bind_exact_file_sha256: true;
    provider_success_never_implies_approval: true;
    atlas_packaging_never_implies_semantic_approval: true;
  };
  status: "ready-for-candidate-authoring";
  package_fingerprint: string;
};

export async function compileTileMapSourcePackageFile(input: string): Promise<TileMapSourcePackage> {
  const bytes = await readFile(input);
  const raw = parseObject(bytes.toString("utf8"), input);
  return compileTileMapSourcePackage(raw, sha256(bytes));
}

export function compileTileMapSourcePackage(
  raw: JsonObject,
  sourcePlanSha256: string,
): TileMapSourcePackage {
  if (raw.schema_version !== 1 || raw.status !== "awaiting-source-art") {
    throw failure("EVAVO_TILE_MAP_SOURCE_PLAN_SCHEMA", "input must be a Tile Map art production plan schema v1");
  }
  const source = object(raw.source, "source");
  if (source.authority !== "evavo-tile-map-studio") {
    throw failure("EVAVO_TILE_MAP_SOURCE_AUTHORITY", "source.authority must be evavo-tile-map-studio");
  }
  const authority = object(raw.authority_contract, "authority_contract");
  if (
    authority.semantic_authority !== "tile-map-studio" ||
    authority.art_studio_role !== "source-art-generation-and-creative-approval" ||
    authority.sprite_studio_role !== "lossless-mastering-atlas-and-receipt" ||
    authority.provider_results_are_intermediate !== true ||
    authority.creative_approval_cannot_be_inferred_from_build_success !== true
  ) {
    throw failure("EVAVO_TILE_MAP_SOURCE_AUTHORITY", "input authority contract is incompatible with governed source creation");
  }
  const projection = text(source.projection, "source.projection");
  const tasks = array(raw.tasks, "tasks").map((entry, index) => compileTask(entry, index, projection));
  if (tasks.length === 0) throw failure("EVAVO_TILE_MAP_SOURCE_EMPTY", "source plan must contain tasks");
  const ids = new Set<string>();
  const families = new Set<string>();
  for (const task of tasks) {
    if (ids.has(task.task_id)) throw failure("EVAVO_TILE_MAP_SOURCE_DUPLICATE", `duplicate task_id: ${task.task_id}`);
    if (families.has(task.visual_family)) throw failure("EVAVO_TILE_MAP_SOURCE_DUPLICATE", `duplicate visual_family: ${task.visual_family}`);
    ids.add(task.task_id);
    families.add(task.visual_family);
  }
  const base = {
    schema_version: 1 as const,
    source_plan_sha256: sha256Hex(sourcePlanSha256, "source_plan_sha256"),
    source_plan_fingerprint: sha256Hex(raw.plan_fingerprint, "plan_fingerprint"),
    source_map_fingerprint: sha256Hex(source.source_map_fingerprint, "source.source_map_fingerprint"),
    map_id: text(source.map_id, "source.map_id"),
    consumer_adapter: nullableText(source.consumer_adapter, "source.consumer_adapter"),
    production_profile: nullableText(source.production_profile, "source.production_profile"),
    projection,
    tasks: tasks.sort((a, b) => a.visual_family.localeCompare(b.visual_family)),
    authority: {
      semantic_authority: "tile-map-studio" as const,
      creative_authority: "art-studio" as const,
      mastering_authority: "sprite-studio" as const,
      provider_authority: "candidate-generation-only" as const,
    },
    promotion_policy: {
      minimum_approved_sources_per_task_must_match_requirement: true as const,
      approval_must_bind_exact_file_sha256: true as const,
      provider_success_never_implies_approval: true as const,
      atlas_packaging_never_implies_semantic_approval: true as const,
    },
    status: "ready-for-candidate-authoring" as const,
  };
  return { ...base, package_fingerprint: sha256(Buffer.from(canonical(base), "utf8")) };
}

function compileTask(value: unknown, index: number, rootProjection: string): SourceTask {
  const row = object(value, `tasks[${index}]`);
  const taskId = text(row.task_id, `tasks[${index}].task_id`);
  const family = text(row.visual_family, `tasks[${index}].visual_family`);
  const kind = row.task_kind;
  if (kind !== "tile-family" && kind !== "feature-family") {
    throw failure("EVAVO_TILE_MAP_SOURCE_TASK_KIND", `tasks[${index}].task_kind is unsupported`);
  }
  const projection = text(row.projection, `tasks[${index}].projection`);
  if (projection !== rootProjection) {
    throw failure("EVAVO_TILE_MAP_SOURCE_PROJECTION", `tasks[${index}] projection ${projection} != ${rootProjection}`);
  }
  const dimensions = object(row.dimensions, `tasks[${index}].dimensions`);
  const width = positiveInteger(dimensions.width, `tasks[${index}].dimensions.width`);
  const height = positiveInteger(dimensions.height, `tasks[${index}].dimensions.height`);
  const required = positiveInteger(row.minimum_visual_variants, `tasks[${index}].minimum_visual_variants`);
  if (
    row.provider_output_authority !== "intermediate-only" ||
    row.creative_approval_required !== true ||
    row.promotion_state !== "blocked-pending-creative-approval"
  ) {
    throw failure("EVAVO_TILE_MAP_SOURCE_PROMOTION", `tasks[${index}] weakens creative approval authority`);
  }
  const slug = safeSlug(family);
  return {
    task_id: taskId,
    visual_family: family,
    task_kind: kind,
    projection,
    dimensions: { width, height },
    required_approved_variants: required,
    candidate_count: Math.min(16, Math.max(4, required * 2)),
    alpha_required: booleanValue(row.alpha_required, `tasks[${index}].alpha_required`),
    semantic_source_ids: stringArray(row.semantic_source_ids, `tasks[${index}].semantic_source_ids`),
    immutable_semantic_rules: stringArray(row.semantic_rules, `tasks[${index}].semantic_rules`),
    creative_direction: stringArray(row.art_direction_notes, `tasks[${index}].art_direction_notes`),
    topology: row.topology === null ? null : object(row.topology, `tasks[${index}].topology`),
    feature_kind: row.feature_kind === null ? null : text(row.feature_kind, `tasks[${index}].feature_kind`),
    output_contract: {
      candidate_directory: `candidates/${slug}`,
      review_manifest: `review/${slug}.review.json`,
      approved_source_manifest: `approved/${slug}.approved-sources.json`,
      format: "png-lossless",
      create_only: true,
      source_overwrite: false,
    },
    gates: {
      provider_output_is_intermediate: true,
      structural_review_required: true,
      visual_review_required: true,
      creative_approval_required: true,
      sprite_packaging_blocked_until_approval: true,
    },
  };
}

function safeSlug(value: string): string {
  const slug = value.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "");
  if (!slug) throw failure("EVAVO_TILE_MAP_SOURCE_SLUG", `cannot derive safe output slug from ${value}`);
  return `${slug}-${sha256(Buffer.from(value, "utf8")).slice(0, 8)}`;
}

function parseObject(content: string, label: string): JsonObject {
  try { return object(JSON.parse(content) as unknown, label); }
  catch (error) {
    if (error instanceof Error && "code" in error) throw error;
    throw failure("EVAVO_TILE_MAP_SOURCE_JSON", `invalid JSON in ${label}`);
  }
}
function object(value: unknown, path: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw failure("EVAVO_TILE_MAP_SOURCE_TYPE", `${path} must be an object`);
  return value as JsonObject;
}
function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw failure("EVAVO_TILE_MAP_SOURCE_TYPE", `${path} must be an array`);
  return value;
}
function text(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) throw failure("EVAVO_TILE_MAP_SOURCE_TYPE", `${path} must be non-empty string`);
  return value;
}
function nullableText(value: unknown, path: string): string | null {
  if (value === null || value === undefined) return null;
  return text(value, path);
}
function positiveInteger(value: unknown, path: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) throw failure("EVAVO_TILE_MAP_SOURCE_TYPE", `${path} must be positive integer`);
  return value as number;
}
function booleanValue(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") throw failure("EVAVO_TILE_MAP_SOURCE_TYPE", `${path} must be boolean`);
  return value;
}
function stringArray(value: unknown, path: string): string[] {
  const values = array(value, path).map((item, index) => text(item, `${path}[${index}]`));
  if (values.length === 0) throw failure("EVAVO_TILE_MAP_SOURCE_TYPE", `${path} must not be empty`);
  if (new Set(values).size !== values.length) throw failure("EVAVO_TILE_MAP_SOURCE_DUPLICATE", `${path} contains duplicates`);
  return values;
}
function sha256Hex(value: unknown, path: string): string {
  const textValue = text(value, path).toLowerCase();
  if (!/^[0-9a-f]{64}$/u.test(textValue)) throw failure("EVAVO_TILE_MAP_SOURCE_HASH", `${path} must be SHA-256`);
  return textValue;
}
function sha256(value: Uint8Array): string { return createHash("sha256").update(value).digest("hex"); }
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const entries = Object.entries(value as JsonObject).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
}
function failure(code: string, message: string): Error & { code: string } {
  const error = new Error(message) as Error & { code: string };
  error.code = code;
  return error;
}
