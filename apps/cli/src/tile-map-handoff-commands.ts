import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

export const TILE_MAP_HANDOFF_SCHEMA_VERSION = 2;
export const TILE_MAP_ART_PLAN_SCHEMA_VERSION = 1;

type JsonObject = Record<string, unknown>;
type TileFamily = { visual_family: string; projection: string; tile_width: number; tile_height: number; tile_ids: string[]; terrains: string[]; edge_signatures: string[]; minimum_visual_variants: number; continuous_material: boolean; seamless_edges: boolean; alpha_required: boolean; semantic_rules: string[]; art_direction_notes: string[] };
type FeatureFamily = { visual_family: string; projection: string; feature_kind: string; source_feature_ids: string[]; nominal_width: number; nominal_height: number; minimum_visual_variants: number; alpha_required: boolean; semantic_rules: string[]; art_direction_notes: string[] };
type TileMapHandoff = { schema_version: 2; map_id: string; consumer_adapter: string | null; production_profile: string | null; projection: string; source_map_fingerprint: string; families: TileFamily[]; feature_families: FeatureFamily[]; art_studio_contract: { role: string; requirements: string[] }; sprite_studio_contract: JsonObject; blocking_rules: string[] };

export type TileMapHandoffCommandValues = { input?: string };
export type TileMapArtTask = {
  task_id: string;
  task_kind: "tile-family" | "feature-family";
  visual_family: string;
  projection: string;
  dimensions: { width: number; height: number };
  minimum_visual_variants: number;
  alpha_required: boolean;
  semantic_source_ids: string[];
  semantic_rules: string[];
  art_direction_notes: string[];
  topology: { terrains: string[]; edge_signatures: string[]; continuous_material: boolean; seamless_edges: boolean } | null;
  feature_kind: string | null;
  provider_output_authority: "intermediate-only";
  creative_approval_required: true;
  promotion_state: "blocked-pending-creative-approval";
};
export type TileMapArtProductionPlan = {
  schema_version: 1;
  source: { authority: "evavo-tile-map-studio"; handoff_schema_version: 2; handoff_sha256: string; map_id: string; source_map_fingerprint: string; consumer_adapter: string | null; production_profile: string | null; projection: string };
  authority_contract: { art_studio_role: "source-art-generation-and-creative-approval"; semantic_authority: "tile-map-studio"; provider_results_are_intermediate: true; creative_approval_cannot_be_inferred_from_build_success: true; sprite_studio_role: "lossless-mastering-atlas-and-receipt" };
  tasks: TileMapArtTask[];
  blocking_rules: string[];
  status: "awaiting-source-art";
  plan_fingerprint: string;
};

export async function handleTileMapHandoffCommand(command: string, values: TileMapHandoffCommandValues): Promise<{ handled: boolean; value?: unknown }> {
  if (command !== "tile-map-handoff") return { handled: false };
  if (!values.input) throw contractError("EVAVO_TILE_MAP_HANDOFF_INPUT_REQUIRED", "--input is required");
  const sourceBytes = await readFile(values.input);
  const handoff = validateHandoff(parseJson(sourceBytes.toString("utf8"), values.input));
  return { handled: true, value: compileProductionPlan(handoff, sha256(sourceBytes)) };
}

export function validateHandoff(payload: unknown): TileMapHandoff {
  const root = object(payload, "handoff");
  exactInteger(root.schema_version, "schema_version", TILE_MAP_HANDOFF_SCHEMA_VERSION);
  const mapId = nonEmptyString(root.map_id, "map_id");
  const projection = nonEmptyString(root.projection, "projection");
  const families = array(root.families, "families").map(validateTileFamily);
  const featureFamilies = array(root.feature_families, "feature_families").map(validateFeatureFamily);
  if (families.length + featureFamilies.length === 0) throw contractError("EVAVO_TILE_MAP_HANDOFF_EMPTY", "handoff must contain at least one visible tile or feature family");

  const allFamilies = [...families, ...featureFamilies];
  const seen = new Set<string>();
  for (const family of allFamilies) {
    if (seen.has(family.visual_family)) throw contractError("EVAVO_TILE_MAP_HANDOFF_DUPLICATE_FAMILY", `duplicate visual_family: ${family.visual_family}`);
    seen.add(family.visual_family);
    if (family.projection !== projection) throw contractError("EVAVO_TILE_MAP_HANDOFF_PROJECTION_MISMATCH", `visual family ${family.visual_family} projection ${family.projection} does not match handoff projection ${projection}`);
  }

  const art = object(root.art_studio_contract, "art_studio_contract");
  const artRole = nonEmptyString(art.role, "art_studio_contract.role");
  if (artRole !== "source-art-generation-and-creative-approval") throw contractError("EVAVO_TILE_MAP_HANDOFF_AUTHORITY_MISMATCH", `art_studio_contract.role must be source-art-generation-and-creative-approval, got ${artRole}`);

  return {
    schema_version: 2,
    map_id: mapId,
    consumer_adapter: optionalString(root.consumer_adapter, "consumer_adapter"),
    production_profile: optionalString(root.production_profile, "production_profile"),
    projection,
    source_map_fingerprint: sha256Hex(root.source_map_fingerprint, "source_map_fingerprint"),
    families,
    feature_families: featureFamilies,
    art_studio_contract: { role: artRole, requirements: stringArray(art.requirements, "art_studio_contract.requirements", true) },
    sprite_studio_contract: object(root.sprite_studio_contract, "sprite_studio_contract"),
    blocking_rules: stringArray(root.blocking_rules, "blocking_rules", true),
  };
}

export function compileProductionPlan(handoff: TileMapHandoff, handoffSha256: string): TileMapArtProductionPlan {
  const tileTasks: TileMapArtTask[] = handoff.families.map((family) => ({
    task_id: stableTaskId("tile", family.visual_family), task_kind: "tile-family", visual_family: family.visual_family, projection: family.projection,
    dimensions: { width: family.tile_width, height: family.tile_height }, minimum_visual_variants: family.minimum_visual_variants, alpha_required: family.alpha_required,
    semantic_source_ids: [...family.tile_ids], semantic_rules: [...family.semantic_rules], art_direction_notes: [...family.art_direction_notes],
    topology: { terrains: [...family.terrains], edge_signatures: [...family.edge_signatures], continuous_material: family.continuous_material, seamless_edges: family.seamless_edges }, feature_kind: null,
    provider_output_authority: "intermediate-only", creative_approval_required: true, promotion_state: "blocked-pending-creative-approval",
  }));
  const featureTasks: TileMapArtTask[] = handoff.feature_families.map((family) => ({
    task_id: stableTaskId("feature", family.visual_family), task_kind: "feature-family", visual_family: family.visual_family, projection: family.projection,
    dimensions: { width: family.nominal_width, height: family.nominal_height }, minimum_visual_variants: family.minimum_visual_variants, alpha_required: family.alpha_required,
    semantic_source_ids: [...family.source_feature_ids], semantic_rules: [...family.semantic_rules], art_direction_notes: [...family.art_direction_notes], topology: null, feature_kind: family.feature_kind,
    provider_output_authority: "intermediate-only", creative_approval_required: true, promotion_state: "blocked-pending-creative-approval",
  }));
  const tasks = [...tileTasks, ...featureTasks].sort((a, b) => a.visual_family.localeCompare(b.visual_family) || a.task_kind.localeCompare(b.task_kind));
  const base = {
    schema_version: 1 as const,
    source: { authority: "evavo-tile-map-studio" as const, handoff_schema_version: 2 as const, handoff_sha256: sha256Hex(handoffSha256, "handoff_sha256"), map_id: handoff.map_id, source_map_fingerprint: handoff.source_map_fingerprint, consumer_adapter: handoff.consumer_adapter, production_profile: handoff.production_profile, projection: handoff.projection },
    authority_contract: { art_studio_role: "source-art-generation-and-creative-approval" as const, semantic_authority: "tile-map-studio" as const, provider_results_are_intermediate: true as const, creative_approval_cannot_be_inferred_from_build_success: true as const, sprite_studio_role: "lossless-mastering-atlas-and-receipt" as const },
    tasks,
    blocking_rules: [...handoff.blocking_rules],
    status: "awaiting-source-art" as const,
  };
  return { ...base, plan_fingerprint: sha256(Buffer.from(canonicalJson(base), "utf8")) };
}

function validateTileFamily(value: unknown, index: number): TileFamily {
  const p = `families[${index}]`; const x = object(value, p);
  return { visual_family: nonEmptyString(x.visual_family, `${p}.visual_family`), projection: nonEmptyString(x.projection, `${p}.projection`), tile_width: positiveInteger(x.tile_width, `${p}.tile_width`), tile_height: positiveInteger(x.tile_height, `${p}.tile_height`), tile_ids: stringArray(x.tile_ids, `${p}.tile_ids`, true), terrains: stringArray(x.terrains, `${p}.terrains`, true), edge_signatures: stringArray(x.edge_signatures, `${p}.edge_signatures`, false), minimum_visual_variants: positiveInteger(x.minimum_visual_variants, `${p}.minimum_visual_variants`), continuous_material: booleanValue(x.continuous_material, `${p}.continuous_material`), seamless_edges: booleanValue(x.seamless_edges, `${p}.seamless_edges`), alpha_required: booleanValue(x.alpha_required, `${p}.alpha_required`), semantic_rules: stringArray(x.semantic_rules, `${p}.semantic_rules`, true), art_direction_notes: stringArray(x.art_direction_notes, `${p}.art_direction_notes`, true) };
}
function validateFeatureFamily(value: unknown, index: number): FeatureFamily {
  const p = `feature_families[${index}]`; const x = object(value, p);
  return { visual_family: nonEmptyString(x.visual_family, `${p}.visual_family`), projection: nonEmptyString(x.projection, `${p}.projection`), feature_kind: nonEmptyString(x.feature_kind, `${p}.feature_kind`), source_feature_ids: stringArray(x.source_feature_ids, `${p}.source_feature_ids`, true), nominal_width: positiveInteger(x.nominal_width, `${p}.nominal_width`), nominal_height: positiveInteger(x.nominal_height, `${p}.nominal_height`), minimum_visual_variants: positiveInteger(x.minimum_visual_variants, `${p}.minimum_visual_variants`), alpha_required: booleanValue(x.alpha_required, `${p}.alpha_required`), semantic_rules: stringArray(x.semantic_rules, `${p}.semantic_rules`, true), art_direction_notes: stringArray(x.art_direction_notes, `${p}.art_direction_notes`, true) };
}
function stableTaskId(kind: string, family: string): string { return `tile-map-${kind}-${sha256(Buffer.from(`${kind}\n${family}`, "utf8")).slice(0, 16)}`; }
function canonicalJson(value: unknown): string { if (value === null || typeof value !== "object") return JSON.stringify(value); if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`; return `{${Object.entries(value as JsonObject).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`; }
function sha256(value: Uint8Array): string { return createHash("sha256").update(value).digest("hex"); }
function parseJson(content: string, source: string): unknown { try { return JSON.parse(content) as unknown; } catch (error) { throw contractError("EVAVO_TILE_MAP_HANDOFF_INVALID_JSON", `invalid JSON in ${source}: ${error instanceof Error ? error.message : String(error)}`); } }
function object(value: unknown, path: string): JsonObject { if (!value || typeof value !== "object" || Array.isArray(value)) throw contractError("EVAVO_TILE_MAP_HANDOFF_INVALID_TYPE", `${path} must be an object`); return value as JsonObject; }
function array(value: unknown, path: string): unknown[] { if (!Array.isArray(value)) throw contractError("EVAVO_TILE_MAP_HANDOFF_INVALID_TYPE", `${path} must be an array`); return value; }
function nonEmptyString(value: unknown, path: string): string { if (typeof value !== "string" || !value.trim()) throw contractError("EVAVO_TILE_MAP_HANDOFF_INVALID_TYPE", `${path} must be a non-empty string`); return value; }
function optionalString(value: unknown, path: string): string | null { return value === null || value === undefined ? null : nonEmptyString(value, path); }
function sha256Hex(value: unknown, path: string): string { const result = nonEmptyString(value, path).toLowerCase(); if (!/^[0-9a-f]{64}$/.test(result)) throw contractError("EVAVO_TILE_MAP_HANDOFF_INVALID_HASH", `${path} must be a SHA-256 hex digest`); return result; }
function exactInteger(value: unknown, path: string, expected: number): void { if (typeof value !== "number" || !Number.isInteger(value) || value !== expected) throw contractError("EVAVO_TILE_MAP_HANDOFF_UNSUPPORTED_SCHEMA", `${path} must equal ${expected}`); }
function positiveInteger(value: unknown, path: string): number { if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) throw contractError("EVAVO_TILE_MAP_HANDOFF_INVALID_TYPE", `${path} must be a positive integer`); return value; }
function booleanValue(value: unknown, path: string): boolean { if (typeof value !== "boolean") throw contractError("EVAVO_TILE_MAP_HANDOFF_INVALID_TYPE", `${path} must be boolean`); return value; }
function stringArray(value: unknown, path: string, required: boolean): string[] { const values = array(value, path).map((v, i) => nonEmptyString(v, `${path}[${i}]`)); if (required && values.length === 0) throw contractError("EVAVO_TILE_MAP_HANDOFF_INVALID_TYPE", `${path} must not be empty`); if (new Set(values).size !== values.length) throw contractError("EVAVO_TILE_MAP_HANDOFF_DUPLICATE_VALUE", `${path} contains duplicate values`); return values; }
function contractError(code: string, message: string): Error & { code: string } { const error = new Error(message) as Error & { code: string }; error.code = code; return error; }
