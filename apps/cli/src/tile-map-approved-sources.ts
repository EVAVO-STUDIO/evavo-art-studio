import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

type JsonObject = Record<string, unknown>;

type ApprovedSource = {
  path: string;
  sha256: string;
  bytes: number;
  format: "png";
  width: number;
  height: number;
  has_alpha: boolean;
};

type ApprovedTask = {
  task_id: string;
  visual_family: string;
  required_approved_variants: number;
  approved_sources: ApprovedSource[];
};

export type TileMapApprovedSourcesManifest = {
  schema_version: 1;
  source_package_path: string;
  source_package_sha256: string;
  source_package_fingerprint: string;
  source_map_fingerprint: string;
  approval_path: string;
  approval_sha256: string;
  approved_source_root: string;
  map_id: string;
  consumer_adapter: string | null;
  projection: string;
  creative_approval: {
    decision: "approved";
    approved_by: string;
    approved_at: string;
  };
  tasks: ApprovedTask[];
  authority: {
    semantic_authority: "tile-map-studio";
    creative_approval_authority: "art-studio";
    next_authority: "sprite-studio-lossless-mastering";
  };
  eligible_for_sprite_studio: true;
  manifest_fingerprint: string;
};

export async function compileApprovedSourcesManifest(
  sourcePackagePath: string,
  approvalPath: string,
  approvedSourceRoot?: string,
): Promise<TileMapApprovedSourcesManifest> {
  const [packageBytes, approvalBytes] = await Promise.all([
    readFile(sourcePackagePath),
    readFile(approvalPath),
  ]);
  const sourcePackage = parseObject(packageBytes.toString("utf8"), sourcePackagePath);
  const approval = parseObject(approvalBytes.toString("utf8"), approvalPath);
  if (sourcePackage.schema_version !== 1 || sourcePackage.status !== "ready-for-candidate-authoring") {
    throw failure("EVAVO_TILE_MAP_APPROVAL_PACKAGE", "source package must be governed Tile Map source package schema v1");
  }
  const packageFingerprint = sha256Hex(sourcePackage.package_fingerprint, "source package fingerprint");
  const sourceMapFingerprint = sha256Hex(sourcePackage.source_map_fingerprint, "source package source_map_fingerprint");
  if (approval.schema_version !== 1) throw failure("EVAVO_TILE_MAP_APPROVAL_SCHEMA", "approval schema_version must be 1");
  if (sha256Hex(approval.source_package_fingerprint, "approval.source_package_fingerprint") !== packageFingerprint) {
    throw failure("EVAVO_TILE_MAP_APPROVAL_DRIFT", "approval does not target this exact source package fingerprint");
  }
  const creative = object(approval.creative_approval, "creative_approval");
  if (creative.decision !== "approved") {
    throw failure("EVAVO_TILE_MAP_APPROVAL_DECISION", "creative_approval.decision must be approved");
  }
  const approvedBy = text(creative.approved_by, "creative_approval.approved_by");
  const approvedAt = timestamp(creative.approved_at, "creative_approval.approved_at");

  const packageTasks = new Map<string, JsonObject>();
  for (const [index, item] of array(sourcePackage.tasks, "source package tasks").entries()) {
    const task = object(item, `source package tasks[${index}]`);
    const taskId = text(task.task_id, `source package tasks[${index}].task_id`);
    if (packageTasks.has(taskId)) throw failure("EVAVO_TILE_MAP_APPROVAL_DUPLICATE", `duplicate source task ${taskId}`);
    packageTasks.set(taskId, task);
  }
  const decisions = new Map<string, JsonObject>();
  for (const [index, item] of array(approval.tasks, "approval.tasks").entries()) {
    const row = object(item, `approval.tasks[${index}]`);
    const taskId = text(row.task_id, `approval.tasks[${index}].task_id`);
    if (decisions.has(taskId)) throw failure("EVAVO_TILE_MAP_APPROVAL_DUPLICATE", `duplicate approval task ${taskId}`);
    decisions.set(taskId, row);
  }
  const unknown = [...decisions.keys()].filter((id) => !packageTasks.has(id));
  if (unknown.length) throw failure("EVAVO_TILE_MAP_APPROVAL_UNKNOWN", `approval contains unknown tasks: ${unknown.join(", ")}`);
  const missing = [...packageTasks.keys()].filter((id) => !decisions.has(id));
  if (missing.length) throw failure("EVAVO_TILE_MAP_APPROVAL_MISSING", `approval is missing tasks: ${missing.join(", ")}`);

  const approvalRoot = approvedSourceRoot
    ? path.resolve(approvedSourceRoot)
    : path.dirname(path.resolve(approvalPath));
  const tasks: ApprovedTask[] = [];
  for (const [taskId, task] of [...packageTasks.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const approvalDecision = decisions.get(taskId)!;
    const required = positiveInteger(task.required_approved_variants, `${taskId}.required_approved_variants`);
    const taskKind = text(task.task_kind, `${taskId}.task_kind`);
    if (taskKind !== "tile-family" && taskKind !== "feature-family") {
      throw failure("EVAVO_TILE_MAP_APPROVAL_TYPE", `${taskId}.task_kind is unsupported`);
    }
    const dimensions = object(task.dimensions, `${taskId}.dimensions`);
    const expectedWidth = positiveInteger(dimensions.width, `${taskId}.dimensions.width`);
    const expectedHeight = positiveInteger(dimensions.height, `${taskId}.dimensions.height`);
    const alphaRequired = booleanValue(task.alpha_required, `${taskId}.alpha_required`);
    const rows = array(approvalDecision.approved_sources, `${taskId}.approved_sources`);
    if (rows.length < required) {
      throw failure("EVAVO_TILE_MAP_APPROVAL_COUNT", `${taskId} has ${rows.length} approved sources; requires at least ${required}`);
    }
    const approvedSources: ApprovedSource[] = [];
    const digests = new Set<string>();
    const paths = new Set<string>();
    for (const [index, item] of rows.entries()) {
      const row = object(item, `${taskId}.approved_sources[${index}]`);
      const requested = portableRelative(
        text(row.path, `${taskId}.approved_sources[${index}].path`),
      );
      if (path.posix.extname(requested).toLowerCase() !== ".png") {
        throw failure("EVAVO_TILE_MAP_APPROVAL_FORMAT", `${taskId} approved source must be lossless PNG: ${requested}`);
      }
      const absolute = path.resolve(approvalRoot, ...requested.split("/"));
      const relative = path.relative(approvalRoot, absolute);
      if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        throw failure("EVAVO_TILE_MAP_APPROVAL_PATH", `approved source escapes approved source root: ${requested}`);
      }
      const bytes = await readFile(absolute);
      const actual = sha256(bytes);
      const expected = sha256Hex(row.sha256, `${taskId}.approved_sources[${index}].sha256`);
      if (actual !== expected) throw failure("EVAVO_TILE_MAP_APPROVAL_HASH", `approved source hash changed: ${requested}`);
      if (digests.has(actual)) throw failure("EVAVO_TILE_MAP_APPROVAL_DUPLICATE", `${taskId} approved sources contain duplicate image bytes`);
      if (paths.has(requested)) throw failure("EVAVO_TILE_MAP_APPROVAL_DUPLICATE", `${taskId} approved source path repeated: ${requested}`);

      const metadata = await sharp(bytes, { failOn: "error" }).metadata();
      if (metadata.format !== "png") {
        throw failure("EVAVO_TILE_MAP_APPROVAL_FORMAT", `${taskId} approved source bytes are not PNG: ${requested}`);
      }
      if (!metadata.width || !metadata.height) {
        throw failure("EVAVO_TILE_MAP_APPROVAL_GEOMETRY", `${taskId} approved source has unknown dimensions: ${requested}`);
      }
      if (taskKind === "tile-family") {
        if (metadata.width !== expectedWidth || metadata.height !== expectedHeight) {
          throw failure(
            "EVAVO_TILE_MAP_APPROVAL_GEOMETRY",
            `${taskId} approved tile ${requested} is ${metadata.width}x${metadata.height}; expected ${expectedWidth}x${expectedHeight}`,
          );
        }
      } else if (metadata.width < expectedWidth || metadata.height < expectedHeight) {
        throw failure(
          "EVAVO_TILE_MAP_APPROVAL_GEOMETRY",
          `${taskId} approved feature ${requested} is smaller than nominal ${expectedWidth}x${expectedHeight}`,
        );
      }
      if (alphaRequired && metadata.hasAlpha !== true) {
        throw failure("EVAVO_TILE_MAP_APPROVAL_ALPHA", `${taskId} approved source requires alpha: ${requested}`);
      }

      digests.add(actual);
      paths.add(requested);
      approvedSources.push({
        path: requested,
        sha256: actual,
        bytes: bytes.length,
        format: "png",
        width: metadata.width,
        height: metadata.height,
        has_alpha: metadata.hasAlpha === true,
      });
    }
    tasks.push({
      task_id: taskId,
      visual_family: text(task.visual_family, `${taskId}.visual_family`),
      required_approved_variants: required,
      approved_sources: approvedSources.sort((a, b) => a.path.localeCompare(b.path)),
    });
  }

  const base = {
    schema_version: 1 as const,
    source_package_path: path.resolve(sourcePackagePath),
    source_package_sha256: sha256(packageBytes),
    source_package_fingerprint: packageFingerprint,
    source_map_fingerprint: sourceMapFingerprint,
    approval_path: path.resolve(approvalPath),
    approval_sha256: sha256(approvalBytes),
    approved_source_root: approvalRoot,
    map_id: text(sourcePackage.map_id, "source package map_id"),
    consumer_adapter: nullableText(sourcePackage.consumer_adapter, "source package consumer_adapter"),
    projection: text(sourcePackage.projection, "source package projection"),
    creative_approval: { decision: "approved" as const, approved_by: approvedBy, approved_at: approvedAt },
    tasks,
    authority: {
      semantic_authority: "tile-map-studio" as const,
      creative_approval_authority: "art-studio" as const,
      next_authority: "sprite-studio-lossless-mastering" as const,
    },
    eligible_for_sprite_studio: true as const,
  };
  return { ...base, manifest_fingerprint: sha256(Buffer.from(canonical(base), "utf8")) };
}

function portableRelative(value: string): string {
  if (value.includes("\\") || path.posix.isAbsolute(value)) {
    throw failure("EVAVO_TILE_MAP_APPROVAL_PATH", `approved source path must be forward-slash relative: ${value}`);
  }
  const normalized = path.posix.normalize(value);
  if (
    normalized !== value ||
    normalized === "." ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    normalized.includes("//")
  ) {
    throw failure("EVAVO_TILE_MAP_APPROVAL_PATH", `unsafe approved source path: ${value}`);
  }
  return normalized;
}
function parseObject(content: string, label: string): JsonObject {
  try { return object(JSON.parse(content) as unknown, label); }
  catch (error) { if (error instanceof Error && "code" in error) throw error; throw failure("EVAVO_TILE_MAP_APPROVAL_JSON", `invalid JSON in ${label}`); }
}
function object(value: unknown, path: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw failure("EVAVO_TILE_MAP_APPROVAL_TYPE", `${path} must be object`);
  return value as JsonObject;
}
function array(value: unknown, path: string): unknown[] { if (!Array.isArray(value)) throw failure("EVAVO_TILE_MAP_APPROVAL_TYPE", `${path} must be array`); return value; }
function text(value: unknown, path: string): string { if (typeof value !== "string" || !value.trim()) throw failure("EVAVO_TILE_MAP_APPROVAL_TYPE", `${path} must be non-empty string`); return value; }
function nullableText(value: unknown, path: string): string | null { if (value === null || value === undefined) return null; return text(value, path); }
function positiveInteger(value: unknown, path: string): number { if (!Number.isSafeInteger(value) || (value as number) <= 0) throw failure("EVAVO_TILE_MAP_APPROVAL_TYPE", `${path} must be positive integer`); return value as number; }
function booleanValue(value: unknown, path: string): boolean { if (typeof value !== "boolean") throw failure("EVAVO_TILE_MAP_APPROVAL_TYPE", `${path} must be boolean`); return value; }
function timestamp(value: unknown, path: string): string { const result = text(value, path); if (!Number.isFinite(Date.parse(result))) throw failure("EVAVO_TILE_MAP_APPROVAL_TYPE", `${path} must be ISO timestamp`); return result; }
function sha256Hex(value: unknown, path: string): string { const result = text(value, path).toLowerCase(); if (!/^[0-9a-f]{64}$/u.test(result)) throw failure("EVAVO_TILE_MAP_APPROVAL_HASH", `${path} must be SHA-256`); return result; }
function sha256(value: Uint8Array): string { return createHash("sha256").update(value).digest("hex"); }
function canonical(value: unknown): string { if (value === null || typeof value !== "object") return JSON.stringify(value); if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`; const entries = Object.entries(value as JsonObject).sort(([a], [b]) => a.localeCompare(b)); return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`; }
function failure(code: string, message: string): Error & { code: string } { const error = new Error(message) as Error & { code: string }; error.code = code; return error; }
