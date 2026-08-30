import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

type JsonObject = Record<string, unknown>;
type Cardinal = "n" | "e" | "s" | "w";
type Severity = "error" | "warning";

type Finding = Readonly<{
  code: string;
  severity: Severity;
  message: string;
}>;

type BoundaryPolicy = Readonly<{
  border_width: number;
  stable_edge_mean_error: number;
  stable_edge_changed_ratio: number;
  seamless_cross_edge_mean_error: number;
  seamless_cross_edge_changed_ratio: number;
  topology_alpha_profile_error: number;
  minimum_interior_changed_ratio: number;
  changed_sample_threshold: number;
}>;

type Candidate = Readonly<{
  id: string;
  taskId: string;
  family: string;
  width: number;
  height: number;
  rgba: Buffer;
}>;

type Task = Readonly<{
  id: string;
  family: string;
  requiredVariants: number;
  topology: JsonObject | null;
}>;

export type TileMapCandidateBoundaryQaReport = Readonly<{
  schema_version: 1;
  source_package_path: string;
  source_package_sha256: string;
  source_package_fingerprint: string;
  source_review_path: string;
  source_review_sha256: string;
  source_review_fingerprint: string;
  source_candidate_qa_path: string;
  source_candidate_qa_sha256: string;
  source_candidate_qa_fingerprint: string;
  source_provider_batch_fingerprint: string;
  source_execution_sha256: string;
  source_map_fingerprint: string;
  map_id: string;
  projection: string;
  policy: BoundaryPolicy;
  families: readonly JsonObject[];
  summary: Readonly<{
    families: number;
    errors: number;
    warnings: number;
    technically_clear_families: number;
  }>;
  authority: Readonly<{
    semantic_authority: "tile-map-studio";
    automated_boundary_qa: true;
    structural_review_decision: false;
    visual_review_decision: false;
    creative_approval: false;
    candidate_promotion: false;
  }>;
  status: "passed" | "blocked";
  boundary_qa_fingerprint: string;
}>;

export async function compileTileMapCandidateBoundaryQa(
  sourcePackagePath: string,
  reviewPath: string,
  candidateQaPath: string,
  policyPath?: string,
): Promise<TileMapCandidateBoundaryQaReport> {
  const [packageBytes, reviewBytes, qaBytes] = await Promise.all([
    readFile(sourcePackagePath),
    readFile(reviewPath),
    readFile(candidateQaPath),
  ]);
  const sourcePackage = parseObject(packageBytes.toString("utf8"), sourcePackagePath);
  const review = parseObject(reviewBytes.toString("utf8"), reviewPath);
  const candidateQa = parseObject(qaBytes.toString("utf8"), candidateQaPath);
  if (
    sourcePackage.schema_version !== 1 ||
    sourcePackage.status !== "ready-for-candidate-authoring"
  ) {
    throw failure(
      "EVAVO_TILE_MAP_BOUNDARY_PACKAGE",
      "source package must be governed Tile Map source package schema v1",
    );
  }
  if (review.schema_version !== 1 || review.status !== "awaiting-review") {
    throw failure(
      "EVAVO_TILE_MAP_BOUNDARY_REVIEW",
      "candidate review must be schema v1 and awaiting-review",
    );
  }
  if (
    candidateQa.schema_version !== 1 ||
    (candidateQa.status !== "passed" && candidateQa.status !== "blocked")
  ) {
    throw failure(
      "EVAVO_TILE_MAP_BOUNDARY_QA",
      "candidate QA must be schema v1 with passed or blocked status",
    );
  }

  const packageFingerprint = sha256Hex(
    sourcePackage.package_fingerprint,
    "source package fingerprint",
  );
  const reviewFingerprint = sha256Hex(review.review_fingerprint, "review fingerprint");
  const qaFingerprint = sha256Hex(
    candidateQa.qa_fingerprint,
    "candidate QA fingerprint",
  );
  if (hashWithout(candidateQa, "qa_fingerprint") !== qaFingerprint) {
    throw failure(
      "EVAVO_TILE_MAP_BOUNDARY_QA",
      "candidate QA self fingerprint is invalid",
    );
  }
  if (
    review.source_package_fingerprint !== packageFingerprint ||
    candidateQa.source_package_fingerprint !== packageFingerprint
  ) {
    throw failure(
      "EVAVO_TILE_MAP_BOUNDARY_DRIFT",
      "review or candidate QA does not target the exact source package",
    );
  }
  if (candidateQa.source_review_fingerprint !== reviewFingerprint) {
    throw failure(
      "EVAVO_TILE_MAP_BOUNDARY_DRIFT",
      "candidate QA does not target the exact candidate review",
    );
  }
  for (const key of [
    "source_provider_batch_fingerprint",
    "source_execution_sha256",
    "source_map_fingerprint",
    "map_id",
    "projection",
  ] as const) {
    if (review[key] !== candidateQa[key]) {
      throw failure(
        "EVAVO_TILE_MAP_BOUNDARY_DRIFT",
        `${key} differs between candidate review and candidate QA`,
      );
    }
  }

  const policy = await loadPolicy(policyPath);
  const tasks = taskMap(sourcePackage);
  const qaCandidates = new Map<string, JsonObject>();
  for (const [index, item] of array(candidateQa.candidates, "candidate QA candidates").entries()) {
    const row = object(item, `candidate QA candidates[${index}]`);
    const id = text(row.candidate_id, `candidate QA candidates[${index}].candidate_id`);
    if (qaCandidates.has(id)) {
      throw failure(
        "EVAVO_TILE_MAP_BOUNDARY_DUPLICATE",
        `duplicate candidate QA row: ${id}`,
      );
    }
    qaCandidates.set(id, row);
  }

  const candidateRoot = absolutePath(review.candidate_root, "review.candidate_root");
  const candidates: Candidate[] = [];
  for (const [index, item] of array(review.candidates, "review candidates").entries()) {
    const row = object(item, `review candidates[${index}]`);
    const id = text(row.candidate_id, `review candidates[${index}].candidate_id`);
    const taskId = text(row.task_id, `${id}.task_id`);
    const family = text(row.visual_family, `${id}.visual_family`);
    const task = tasks.get(taskId);
    if (!task || task.family !== family) {
      throw failure(
        "EVAVO_TILE_MAP_BOUNDARY_TASK",
        `${id} does not map to the source-package task/family`,
      );
    }
    const qaRow = qaCandidates.get(id);
    if (!qaRow || qaRow.task_id !== taskId || qaRow.visual_family !== family) {
      throw failure(
        "EVAVO_TILE_MAP_BOUNDARY_DRIFT",
        `${id} differs between candidate review and candidate QA`,
      );
    }
    const relative = portableRelative(text(row.path, `${id}.path`));
    const absolute = resolveInside(candidateRoot, relative, `${id}.path`);
    const bytes = await readFile(absolute);
    if (sha256(bytes) !== sha256Hex(row.sha256, `${id}.sha256`)) {
      throw failure(
        "EVAVO_TILE_MAP_BOUNDARY_HASH",
        `${id} candidate bytes changed after candidate QA`,
      );
    }
    const decoded = await sharp(bytes, { failOn: "error" })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    candidates.push({
      id,
      taskId,
      family,
      width: decoded.info.width,
      height: decoded.info.height,
      rgba: decoded.data,
    });
  }
  if (candidates.length !== qaCandidates.size) {
    throw failure(
      "EVAVO_TILE_MAP_BOUNDARY_SET",
      "candidate review and candidate QA sets differ",
    );
  }

  const grouped = new Map<string, Candidate[]>();
  for (const candidate of candidates) {
    const rows = grouped.get(candidate.family) ?? [];
    rows.push(candidate);
    grouped.set(candidate.family, rows);
  }
  const familyReports: JsonObject[] = [];
  for (const [family, rows] of [...grouped.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const task = [...tasks.values()].find((entry) => entry.family === family);
    if (!task) {
      throw failure("EVAVO_TILE_MAP_BOUNDARY_TASK", `missing source task for ${family}`);
    }
    rows.sort((left, right) => left.id.localeCompare(right.id));
    familyReports.push(analyseFamily(task, rows, policy));
  }

  const errors = familyReports.reduce(
    (sum, family) =>
      sum +
      (family.findings as readonly Finding[]).filter(
        (finding) => finding.severity === "error",
      ).length,
    0,
  );
  const warnings = familyReports.reduce(
    (sum, family) =>
      sum +
      (family.findings as readonly Finding[]).filter(
        (finding) => finding.severity === "warning",
      ).length,
    0,
  );
  const clear = familyReports.filter((family) => family.technically_clear === true).length;
  const base = {
    schema_version: 1 as const,
    source_package_path: path.resolve(sourcePackagePath),
    source_package_sha256: sha256(packageBytes),
    source_package_fingerprint: packageFingerprint,
    source_review_path: path.resolve(reviewPath),
    source_review_sha256: sha256(reviewBytes),
    source_review_fingerprint: reviewFingerprint,
    source_candidate_qa_path: path.resolve(candidateQaPath),
    source_candidate_qa_sha256: sha256(qaBytes),
    source_candidate_qa_fingerprint: qaFingerprint,
    source_provider_batch_fingerprint: sha256Hex(
      review.source_provider_batch_fingerprint,
      "source_provider_batch_fingerprint",
    ),
    source_execution_sha256: sha256Hex(
      review.source_execution_sha256,
      "source_execution_sha256",
    ),
    source_map_fingerprint: sha256Hex(
      review.source_map_fingerprint,
      "source_map_fingerprint",
    ),
    map_id: text(review.map_id, "map_id"),
    projection: text(review.projection, "projection"),
    policy,
    families: familyReports,
    summary: {
      families: familyReports.length,
      errors,
      warnings,
      technically_clear_families: clear,
    },
    authority: {
      semantic_authority: "tile-map-studio" as const,
      automated_boundary_qa: true as const,
      structural_review_decision: false as const,
      visual_review_decision: false as const,
      creative_approval: false as const,
      candidate_promotion: false as const,
    },
    status: errors === 0 ? ("passed" as const) : ("blocked" as const),
  };
  return {
    ...base,
    boundary_qa_fingerprint: sha256(Buffer.from(canonical(base), "utf8")),
  };
}

function analyseFamily(
  task: Task,
  candidates: readonly Candidate[],
  policy: BoundaryPolicy,
): JsonObject {
  const requiredEdges = topologyEdges(task.topology);
  const seamless =
    task.topology?.continuous_material === true ||
    task.topology?.seamless_edges === true;
  const sameEdgeComparisons: JsonObject[] = [];
  const crossEdgeComparisons: JsonObject[] = [];
  const interiorComparisons: JsonObject[] = [];
  const findings: Finding[] = [];

  for (let left = 0; left < candidates.length; left += 1) {
    for (let right = left + 1; right < candidates.length; right += 1) {
      const a = candidates[left]!;
      const b = candidates[right]!;
      assertSameCanvas(a, b);
      const interior = interiorDifference(a, b, policy);
      interiorComparisons.push({
        left_candidate_id: a.id,
        right_candidate_id: b.id,
        ...interior,
      });
      for (const edge of ["n", "e", "s", "w"] as const) {
        const comparison = edgeDifference(a, edge, b, edge, policy);
        sameEdgeComparisons.push({
          left_candidate_id: a.id,
          right_candidate_id: b.id,
          edge,
          ...comparison,
        });
        if (
          requiredEdges.has(edge) &&
          (comparison.alpha_mean_error > policy.topology_alpha_profile_error ||
            comparison.changed_ratio > policy.stable_edge_changed_ratio)
        ) {
          findings.push(
            finding(
              "TILE_MAP_BOUNDARY_TOPOLOGY_DRIFT",
              "error",
              `${task.family} variants ${a.id}/${b.id} alter required ${edge} topology edge`,
            ),
          );
        }
      }
    }
  }

  if (seamless) {
    for (const left of candidates) {
      for (const right of candidates) {
        for (const [leftEdge, rightEdge] of [
          ["e", "w"],
          ["s", "n"],
        ] as const) {
          const comparison = edgeDifference(
            left,
            leftEdge,
            right,
            rightEdge,
            policy,
          );
          crossEdgeComparisons.push({
            left_candidate_id: left.id,
            right_candidate_id: right.id,
            left_edge: leftEdge,
            right_edge: rightEdge,
            ...comparison,
          });
          if (
            comparison.mean_error > policy.seamless_cross_edge_mean_error ||
            comparison.changed_ratio > policy.seamless_cross_edge_changed_ratio
          ) {
            findings.push(
              finding(
                "TILE_MAP_BOUNDARY_SEAM_PAIR",
                "error",
                `${task.family} ${left.id}:${leftEdge} is incompatible with ${right.id}:${rightEdge}`,
              ),
            );
          }
        }
      }
    }
  } else if (requiredEdges.size > 0) {
    for (const comparison of sameEdgeComparisons) {
      if (
        requiredEdges.has(comparison.edge as Cardinal) &&
        ((comparison.mean_error as number) > policy.stable_edge_mean_error ||
          (comparison.changed_ratio as number) > policy.stable_edge_changed_ratio)
      ) {
        findings.push(
          finding(
            "TILE_MAP_BOUNDARY_VARIANT_EDGE_DRIFT",
            "error",
            `${task.family} visual variants materially change required boundary pixels`,
          ),
        );
        break;
      }
    }
  }

  const maximumInteriorChange = Math.max(
    0,
    ...interiorComparisons.map(
      (comparison) => comparison.changed_ratio as number,
    ),
  );
  if (
    candidates.length > 1 &&
    maximumInteriorChange < policy.minimum_interior_changed_ratio
  ) {
    findings.push(
      finding(
        "TILE_MAP_BOUNDARY_WEAK_INTERIOR_VARIATION",
        "warning",
        `${task.family} candidates differ too little inside their stable boundaries`,
      ),
    );
  }

  const uniqueFindings = [...new Map(findings.map((entry) => [
    `${entry.code}\0${entry.message}`,
    entry,
  ])).values()].sort((a, b) => a.code.localeCompare(b.code));
  return {
    visual_family: task.family,
    task_id: task.id,
    required_approved_variants: task.requiredVariants,
    candidate_count: candidates.length,
    required_edges: [...requiredEdges].sort(),
    seamless_material: seamless,
    same_edge_comparisons: sameEdgeComparisons,
    cross_edge_comparisons: crossEdgeComparisons,
    interior_comparisons: interiorComparisons,
    findings: uniqueFindings,
    technically_clear: !uniqueFindings.some((entry) => entry.severity === "error"),
    creative_approval: false,
  };
}

function edgeDifference(
  left: Candidate,
  leftEdge: Cardinal,
  right: Candidate,
  rightEdge: Cardinal,
  policy: BoundaryPolicy,
): Readonly<{
  mean_error: number;
  alpha_mean_error: number;
  changed_ratio: number;
}> {
  assertSameCanvas(left, right);
  const a = edgeSamples(left, leftEdge, policy.border_width);
  const b = edgeSamples(right, rightEdge, policy.border_width);
  if (a.length !== b.length) {
    throw failure("EVAVO_TILE_MAP_BOUNDARY_GEOMETRY", "edge sample sizes differ");
  }
  let error = 0;
  let alphaError = 0;
  let changed = 0;
  for (let index = 0; index < a.length; index += 4) {
    const leftAlpha = a[index + 3]!;
    const rightAlpha = b[index + 3]!;
    let pixelError = Math.abs(leftAlpha - rightAlpha);
    for (let channel = 0; channel < 3; channel += 1) {
      pixelError += Math.abs(a[index + channel]! - b[index + channel]!);
    }
    const normalized = pixelError / 4;
    error += normalized;
    alphaError += Math.abs(leftAlpha - rightAlpha);
    if (normalized > policy.changed_sample_threshold) changed += 1;
  }
  const pixels = a.length / 4;
  return {
    mean_error: rounded(error / Math.max(1, pixels)),
    alpha_mean_error: rounded(alphaError / Math.max(1, pixels)),
    changed_ratio: rounded(changed / Math.max(1, pixels)),
  };
}

function edgeSamples(
  candidate: Candidate,
  edge: Cardinal,
  borderWidth: number,
): number[] {
  const output: number[] = [];
  const width = candidate.width;
  const height = candidate.height;
  const depth = Math.min(borderWidth, edge === "n" || edge === "s" ? height : width);
  for (let strip = 0; strip < depth; strip += 1) {
    if (edge === "n" || edge === "s") {
      const y = edge === "n" ? strip : height - 1 - strip;
      for (let x = 0; x < width; x += 1) pushPremultiplied(output, candidate.rgba, (y * width + x) * 4);
    } else {
      const x = edge === "w" ? strip : width - 1 - strip;
      for (let y = 0; y < height; y += 1) pushPremultiplied(output, candidate.rgba, (y * width + x) * 4);
    }
  }
  return output;
}

function pushPremultiplied(output: number[], rgba: Buffer, offset: number): void {
  const alpha = (rgba[offset + 3] ?? 0) / 255;
  output.push(
    ((rgba[offset] ?? 0) / 255) * alpha,
    ((rgba[offset + 1] ?? 0) / 255) * alpha,
    ((rgba[offset + 2] ?? 0) / 255) * alpha,
    alpha,
  );
}

function interiorDifference(
  left: Candidate,
  right: Candidate,
  policy: BoundaryPolicy,
): Readonly<{ mean_error: number; changed_ratio: number }> {
  assertSameCanvas(left, right);
  const border = Math.min(
    policy.border_width,
    Math.max(0, Math.floor(Math.min(left.width, left.height) / 2) - 1),
  );
  let error = 0;
  let changed = 0;
  let samples = 0;
  for (let y = border; y < left.height - border; y += 1) {
    for (let x = border; x < left.width - border; x += 1) {
      const offset = (y * left.width + x) * 4;
      const a = premultipliedPixel(left.rgba, offset);
      const b = premultipliedPixel(right.rgba, offset);
      const pixelError =
        (Math.abs(a[0] - b[0]) +
          Math.abs(a[1] - b[1]) +
          Math.abs(a[2] - b[2]) +
          Math.abs(a[3] - b[3])) /
        4;
      error += pixelError;
      if (pixelError > policy.changed_sample_threshold) changed += 1;
      samples += 1;
    }
  }
  return {
    mean_error: rounded(error / Math.max(1, samples)),
    changed_ratio: rounded(changed / Math.max(1, samples)),
  };
}

function premultipliedPixel(rgba: Buffer, offset: number): readonly number[] {
  const alpha = (rgba[offset + 3] ?? 0) / 255;
  return [
    ((rgba[offset] ?? 0) / 255) * alpha,
    ((rgba[offset + 1] ?? 0) / 255) * alpha,
    ((rgba[offset + 2] ?? 0) / 255) * alpha,
    alpha,
  ];
}

function taskMap(sourcePackage: JsonObject): Map<string, Task> {
  const result = new Map<string, Task>();
  for (const [index, item] of array(sourcePackage.tasks, "source package tasks").entries()) {
    const row = object(item, `source package tasks[${index}]`);
    const id = text(row.task_id, `source package tasks[${index}].task_id`);
    if (result.has(id)) {
      throw failure("EVAVO_TILE_MAP_BOUNDARY_DUPLICATE", `duplicate task id: ${id}`);
    }
    result.set(id, {
      id,
      family: text(row.visual_family, `${id}.visual_family`),
      requiredVariants: positiveInteger(
        row.required_approved_variants,
        `${id}.required_approved_variants`,
      ),
      topology: row.topology === null ? null : object(row.topology, `${id}.topology`),
    });
  }
  return result;
}

function topologyEdges(topology: JsonObject | null): Set<Cardinal> {
  const result = new Set<Cardinal>();
  if (!topology || !Array.isArray(topology.edge_signatures)) return result;
  for (const raw of topology.edge_signatures) {
    if (typeof raw !== "string") continue;
    for (const token of raw.toLowerCase().split(/[^a-z]+/u).filter(Boolean)) {
      if (!/^[nesw]{1,4}$/u.test(token)) continue;
      for (const edge of token) result.add(edge as Cardinal);
    }
  }
  return result;
}

async function loadPolicy(policyPath?: string): Promise<BoundaryPolicy> {
  const defaults: BoundaryPolicy = {
    border_width: 1,
    stable_edge_mean_error: 0.08,
    stable_edge_changed_ratio: 0.3,
    seamless_cross_edge_mean_error: 0.04,
    seamless_cross_edge_changed_ratio: 0.2,
    topology_alpha_profile_error: 0.08,
    minimum_interior_changed_ratio: 0.03,
    changed_sample_threshold: 0.05,
  };
  if (!policyPath) return defaults;
  const raw = parseObject(
    (await readFile(path.resolve(policyPath))).toString("utf8"),
    policyPath,
  );
  if (raw.schema_version !== 1) {
    throw failure("EVAVO_TILE_MAP_BOUNDARY_POLICY", "boundary policy schema_version must be 1");
  }
  const values = object(raw.thresholds, "boundary policy thresholds");
  return {
    border_width: integer(
      values.border_width,
      defaults.border_width,
      1,
      8,
      "border_width",
    ),
    stable_edge_mean_error: threshold(
      values.stable_edge_mean_error,
      defaults.stable_edge_mean_error,
      "stable_edge_mean_error",
    ),
    stable_edge_changed_ratio: threshold(
      values.stable_edge_changed_ratio,
      defaults.stable_edge_changed_ratio,
      "stable_edge_changed_ratio",
    ),
    seamless_cross_edge_mean_error: threshold(
      values.seamless_cross_edge_mean_error,
      defaults.seamless_cross_edge_mean_error,
      "seamless_cross_edge_mean_error",
    ),
    seamless_cross_edge_changed_ratio: threshold(
      values.seamless_cross_edge_changed_ratio,
      defaults.seamless_cross_edge_changed_ratio,
      "seamless_cross_edge_changed_ratio",
    ),
    topology_alpha_profile_error: threshold(
      values.topology_alpha_profile_error,
      defaults.topology_alpha_profile_error,
      "topology_alpha_profile_error",
    ),
    minimum_interior_changed_ratio: threshold(
      values.minimum_interior_changed_ratio,
      defaults.minimum_interior_changed_ratio,
      "minimum_interior_changed_ratio",
    ),
    changed_sample_threshold: threshold(
      values.changed_sample_threshold,
      defaults.changed_sample_threshold,
      "changed_sample_threshold",
    ),
  };
}

function assertSameCanvas(left: Candidate, right: Candidate): void {
  if (left.width !== right.width || left.height !== right.height) {
    throw failure(
      "EVAVO_TILE_MAP_BOUNDARY_GEOMETRY",
      `${left.id}/${right.id} canvas sizes differ`,
    );
  }
}
function threshold(value: unknown, fallback: number, label: string): number {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw failure("EVAVO_TILE_MAP_BOUNDARY_POLICY", `${label} must be between 0 and 1`);
  }
  return value;
}
function integer(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
  label: string,
): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw failure(
      "EVAVO_TILE_MAP_BOUNDARY_POLICY",
      `${label} must be integer ${minimum}..${maximum}`,
    );
  }
  return value as number;
}
function finding(code: string, severity: Severity, message: string): Finding {
  return Object.freeze({ code, severity, message });
}
function rounded(value: number): number {
  return Number(value.toFixed(6));
}
function hashWithout(value: JsonObject, key: string): string {
  const copy = { ...value };
  delete copy[key];
  return sha256(Buffer.from(canonical(copy), "utf8"));
}
function portableRelative(value: string): string {
  if (value.includes("\\") || path.posix.isAbsolute(value)) {
    throw failure("EVAVO_TILE_MAP_BOUNDARY_PATH", `path must be forward-slash relative: ${value}`);
  }
  const normalized = path.posix.normalize(value);
  if (normalized !== value || normalized === "." || normalized === ".." || normalized.startsWith("../")) {
    throw failure("EVAVO_TILE_MAP_BOUNDARY_PATH", `unsafe relative path: ${value}`);
  }
  return normalized;
}
function absolutePath(value: unknown, label: string): string {
  const input = text(value, label);
  const resolved = path.resolve(input);
  if (resolved !== input) {
    throw failure("EVAVO_TILE_MAP_BOUNDARY_PATH", `${label} must be absolute and normalized`);
  }
  return resolved;
}
function resolveInside(root: string, relative: string, label: string): string {
  const candidate = path.resolve(root, ...relative.split("/"));
  const relation = path.relative(root, candidate);
  if (relation === ".." || relation.startsWith(`..${path.sep}`) || path.isAbsolute(relation)) {
    throw failure("EVAVO_TILE_MAP_BOUNDARY_PATH", `${label} escapes candidate root`);
  }
  return candidate;
}
function parseObject(content: string, label: string): JsonObject {
  try {
    return object(JSON.parse(content) as unknown, label);
  } catch (error) {
    if (error instanceof Error && "code" in error) throw error;
    throw failure("EVAVO_TILE_MAP_BOUNDARY_JSON", `invalid JSON in ${label}`);
  }
}
function object(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw failure("EVAVO_TILE_MAP_BOUNDARY_TYPE", `${label} must be object`);
  }
  return value as JsonObject;
}
function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw failure("EVAVO_TILE_MAP_BOUNDARY_TYPE", `${label} must be array`);
  }
  return value;
}
function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw failure("EVAVO_TILE_MAP_BOUNDARY_TYPE", `${label} must be non-empty string`);
  }
  return value;
}
function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw failure("EVAVO_TILE_MAP_BOUNDARY_TYPE", `${label} must be positive integer`);
  }
  return value as number;
}
function sha256Hex(value: unknown, label: string): string {
  const result = text(value, label).toLowerCase();
  if (!/^[0-9a-f]{64}$/u.test(result)) {
    throw failure("EVAVO_TILE_MAP_BOUNDARY_HASH", `${label} must be SHA-256`);
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
