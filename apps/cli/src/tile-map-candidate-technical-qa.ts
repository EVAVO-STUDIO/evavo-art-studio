import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

type JsonObject = Record<string, unknown>;
type Severity = "error" | "warning";
type TechnicalStatus = "passed" | "blocked";

type QualityIssue = {
  code: string;
  severity: Severity;
  message: string;
};

type CandidateMetrics = {
  pixel_count: number;
  visible_pixels: number;
  transparent_pixels: number;
  soft_alpha_pixels: number;
  soft_alpha_ratio: number;
  unique_visible_colours: number;
  luminance_min: number;
  luminance_max: number;
  luminance_range: number;
  neighbour_variation: number;
  horizontal_seam_score: number;
  vertical_seam_score: number;
};

type CandidateReport = {
  candidate_id: string;
  task_id: string;
  visual_family: string;
  path: string;
  sha256: string;
  width: number;
  height: number;
  technical_status: TechnicalStatus;
  metrics: CandidateMetrics;
  issues: QualityIssue[];
};

type CandidateWork = {
  report: CandidateReport;
  pixels: Buffer;
  borders: Readonly<Record<"n" | "e" | "s" | "w", readonly number[]>>;
};

type FamilyReport = {
  task_id: string;
  visual_family: string;
  required_approved_variants: number;
  candidate_count: number;
  passed_candidates: number;
  blocked_candidates: number;
  closest_pair_similarity: number | null;
  minimum_border_alpha_similarity: number | null;
  technical_status: TechnicalStatus;
  issues: QualityIssue[];
};

export type TileMapCandidateTechnicalQa = {
  schema_version: 1;
  policy_version: "2026-08-30.1";
  source_package_path: string;
  source_package_sha256: string;
  source_package_fingerprint: string;
  source_review_path: string;
  source_review_sha256: string;
  source_review_fingerprint: string;
  source_provider_batch_fingerprint: string;
  source_execution_sha256: string;
  source_map_fingerprint: string;
  candidate_root: string;
  map_id: string;
  consumer_adapter: string | null;
  production_profile: string | null;
  projection: string;
  thresholds: {
    near_duplicate_similarity: number;
    seamless_edge_score: number;
    topology_border_alpha_similarity: number;
    pixel_exact_soft_alpha_ratio: number;
  };
  candidates: CandidateReport[];
  families: FamilyReport[];
  authority: {
    semantic_authority: "tile-map-studio";
    technical_admission_authority: "art-studio";
    creative_approval_authority: false;
    provider_success_implies_approval: false;
  };
  status: TechnicalStatus;
  qa_fingerprint: string;
};

const POLICY_VERSION = "2026-08-30.1" as const;
const NEAR_DUPLICATE_SIMILARITY = 0.9975;
const SEAMLESS_EDGE_SCORE = 0.92;
const TOPOLOGY_BORDER_ALPHA_SIMILARITY = 0.9;
const PIXEL_EXACT_SOFT_ALPHA_RATIO = 0.005;

const PIXEL_EXACT_PROFILES = new Set([
  "snes-topdown-rpg",
  "1990s-isometric-simulation",
  "mutable-isometric-dungeon",
  "rts-1990s",
  "platformer-metatile",
]);

const PROFILE_COLOUR_LIMITS: Readonly<Record<string, number>> = Object.freeze({
  "snes-topdown-rpg": 64,
  "1990s-isometric-simulation": 256,
  "mutable-isometric-dungeon": 256,
  "rts-1990s": 256,
  "platformer-metatile": 64,
});

export async function compileTileMapCandidateTechnicalQa(
  sourcePackagePath: string,
  reviewPath: string,
): Promise<TileMapCandidateTechnicalQa> {
  const [packageBytes, reviewBytes] = await Promise.all([
    readFile(sourcePackagePath),
    readFile(reviewPath),
  ]);
  const sourcePackage = parseObject(packageBytes.toString("utf8"), sourcePackagePath);
  const review = parseObject(reviewBytes.toString("utf8"), reviewPath);
  if (
    sourcePackage.schema_version !== 1 ||
    sourcePackage.status !== "ready-for-candidate-authoring"
  ) {
    throw failure(
      "EVAVO_TILE_MAP_TECHNICAL_QA_PACKAGE",
      "source package must be governed Tile Map source package schema v1",
    );
  }
  if (review.schema_version !== 1 || review.status !== "awaiting-review") {
    throw failure(
      "EVAVO_TILE_MAP_TECHNICAL_QA_REVIEW",
      "candidate review must be schema v1 and awaiting-review",
    );
  }

  const sourcePackageFingerprint = sha256Hex(
    sourcePackage.package_fingerprint,
    "source package fingerprint",
  );
  const sourceMapFingerprint = sha256Hex(
    sourcePackage.source_map_fingerprint,
    "source package source_map_fingerprint",
  );
  const reviewFingerprint = sha256Hex(review.review_fingerprint, "review fingerprint");
  if (
    sha256Hex(review.source_package_fingerprint, "review source_package_fingerprint") !==
    sourcePackageFingerprint
  ) {
    throw failure(
      "EVAVO_TILE_MAP_TECHNICAL_QA_DRIFT",
      "candidate review does not target this exact source package",
    );
  }
  if (
    sha256Hex(review.source_map_fingerprint, "review source_map_fingerprint") !==
    sourceMapFingerprint
  ) {
    throw failure(
      "EVAVO_TILE_MAP_TECHNICAL_QA_DRIFT",
      "candidate review semantic map fingerprint is stale",
    );
  }
  const mapId = text(sourcePackage.map_id, "source package map_id");
  const projection = text(sourcePackage.projection, "source package projection");
  if (review.map_id !== mapId || review.projection !== projection) {
    throw failure(
      "EVAVO_TILE_MAP_TECHNICAL_QA_DRIFT",
      "candidate review map identity or projection differs from source package",
    );
  }

  const candidateRoot = absolutePath(review.candidate_root, "review candidate_root");
  const profile = nullableText(sourcePackage.production_profile, "production_profile");
  const pixelExact = profile !== null && PIXEL_EXACT_PROFILES.has(profile);
  const colourLimit = profile === null ? undefined : PROFILE_COLOUR_LIMITS[profile];

  const taskById = new Map<string, JsonObject>();
  for (const [index, value] of array(sourcePackage.tasks, "source package tasks").entries()) {
    const task = object(value, `source package tasks[${index}]`);
    const taskId = text(task.task_id, `source package tasks[${index}].task_id`);
    if (taskById.has(taskId)) {
      throw failure("EVAVO_TILE_MAP_TECHNICAL_QA_DUPLICATE", `duplicate task ${taskId}`);
    }
    taskById.set(taskId, task);
  }

  const workByFamily = new Map<string, CandidateWork[]>();
  const seenCandidates = new Set<string>();
  for (const [index, value] of array(review.candidates, "review candidates").entries()) {
    const candidate = object(value, `review candidates[${index}]`);
    const candidateId = text(candidate.candidate_id, `review candidates[${index}].candidate_id`);
    if (seenCandidates.has(candidateId)) {
      throw failure(
        "EVAVO_TILE_MAP_TECHNICAL_QA_DUPLICATE",
        `duplicate candidate ${candidateId}`,
      );
    }
    seenCandidates.add(candidateId);
    const taskId = text(candidate.task_id, `${candidateId}.task_id`);
    const task = taskById.get(taskId);
    if (!task) {
      throw failure(
        "EVAVO_TILE_MAP_TECHNICAL_QA_UNKNOWN",
        `${candidateId} references unknown task ${taskId}`,
      );
    }
    const family = text(candidate.visual_family, `${candidateId}.visual_family`);
    if (family !== text(task.visual_family, `${taskId}.visual_family`)) {
      throw failure(
        "EVAVO_TILE_MAP_TECHNICAL_QA_DRIFT",
        `${candidateId} visual family differs from its source task`,
      );
    }
    const dimensions = object(task.dimensions, `${taskId}.dimensions`);
    const width = positiveInteger(dimensions.width, `${taskId}.dimensions.width`);
    const height = positiveInteger(dimensions.height, `${taskId}.dimensions.height`);
    const relativePath = portableRelative(text(candidate.path, `${candidateId}.path`));
    const absoluteCandidate = path.resolve(candidateRoot, ...relativePath.split("/"));
    assertInside(candidateRoot, absoluteCandidate, `${candidateId} path`);
    const bytes = await readFile(absoluteCandidate);
    const expectedSha = sha256Hex(candidate.sha256, `${candidateId}.sha256`);
    const actualSha = sha256(bytes);
    if (actualSha !== expectedSha) {
      throw failure(
        "EVAVO_TILE_MAP_TECHNICAL_QA_HASH",
        `${candidateId} bytes changed after review intake`,
      );
    }

    const decoded = await sharp(bytes, { failOn: "error" })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (decoded.info.width !== width || decoded.info.height !== height) {
      throw failure(
        "EVAVO_TILE_MAP_TECHNICAL_QA_GEOMETRY",
        `${candidateId} decoded canvas ${decoded.info.width}x${decoded.info.height} != ${width}x${height}`,
      );
    }
    if (decoded.info.channels !== 4) {
      throw failure(
        "EVAVO_TILE_MAP_TECHNICAL_QA_FORMAT",
        `${candidateId} did not decode to RGBA`,
      );
    }

    const metrics = analysePixels(decoded.data, width, height);
    const issues: QualityIssue[] = [];
    if (metrics.visible_pixels === 0) {
      issues.push(errorIssue("EMPTY_CANDIDATE", "Candidate contains no visible pixels."));
    }
    if (pixelExact && metrics.soft_alpha_ratio > PIXEL_EXACT_SOFT_ALPHA_RATIO) {
      issues.push(
        errorIssue(
          "PIXEL_GRID_SOFT_ALPHA",
          `Pixel-exact profile has soft alpha ratio ${metrics.soft_alpha_ratio.toFixed(6)} above ${PIXEL_EXACT_SOFT_ALPHA_RATIO}.`,
        ),
      );
    }
    if (colourLimit !== undefined && metrics.unique_visible_colours > colourLimit) {
      issues.push(
        errorIssue(
          "PALETTE_BUDGET_EXCEEDED",
          `Candidate uses ${metrics.unique_visible_colours} visible RGBA colours; profile budget is ${colourLimit}.`,
        ),
      );
    }
    if (metrics.luminance_range < 8 && metrics.visible_pixels > 0) {
      issues.push(
        warningIssue(
          "LOW_NATIVE_SCALE_CONTRAST",
          "Candidate has very little luminance separation and may lose readability at native scale.",
        ),
      );
    }
    if (metrics.neighbour_variation > 0.48) {
      issues.push(
        warningIssue(
          "HIGH_FREQUENCY_DETAIL",
          "Candidate has unusually high local pixel variation; review for generated noise rather than intentional material detail.",
        ),
      );
    }
    const alphaRequired = booleanValue(task.alpha_required, `${taskId}.alpha_required`);
    if (alphaRequired && metrics.transparent_pixels === 0) {
      issues.push(
        warningIssue(
          "ALPHA_CHANNEL_WITHOUT_TRANSPARENCY",
          "Family requires alpha but this candidate occupies the complete canvas.",
        ),
      );
    }
    const topology = task.topology === null ? null : object(task.topology, `${taskId}.topology`);
    if (topology && topology.continuous_material === true && topology.seamless_edges === true) {
      if (
        metrics.horizontal_seam_score < SEAMLESS_EDGE_SCORE ||
        metrics.vertical_seam_score < SEAMLESS_EDGE_SCORE
      ) {
        issues.push(
          errorIssue(
            "SEAMLESS_MATERIAL_EDGE_MISMATCH",
            `Continuous material seam scores ${metrics.horizontal_seam_score.toFixed(4)}/${metrics.vertical_seam_score.toFixed(4)} are below ${SEAMLESS_EDGE_SCORE}.`,
          ),
        );
      }
    }

    const report: CandidateReport = {
      candidate_id: candidateId,
      task_id: taskId,
      visual_family: family,
      path: relativePath,
      sha256: actualSha,
      width,
      height,
      technical_status: issues.some((issue) => issue.severity === "error")
        ? "blocked"
        : "passed",
      metrics,
      issues,
    };
    const work: CandidateWork = {
      report,
      pixels: decoded.data,
      borders: borderAlpha(decoded.data, width, height),
    };
    const familyWork = workByFamily.get(family) ?? [];
    familyWork.push(work);
    workByFamily.set(family, familyWork);
  }

  const familyReports: FamilyReport[] = [];
  for (const [family, work] of [...workByFamily.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    work.sort((a, b) => a.report.candidate_id.localeCompare(b.report.candidate_id));
    const taskId = work[0]?.report.task_id;
    if (!taskId) continue;
    const task = taskById.get(taskId)!;
    const required = positiveInteger(
      task.required_approved_variants,
      `${taskId}.required_approved_variants`,
    );
    const topology = task.topology === null ? null : object(task.topology, `${taskId}.topology`);
    const hasTopologyEdges = topology
      ? optionalStringArray(topology.edge_signatures, `${taskId}.topology.edge_signatures`).length > 0
      : false;
    let closestPairSimilarity: number | null = null;
    let minimumBorderSimilarity: number | null = null;

    for (let leftIndex = 0; leftIndex < work.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < work.length; rightIndex += 1) {
        const left = work[leftIndex]!;
        const right = work[rightIndex]!;
        const similarity = rgbaSimilarity(left.pixels, right.pixels);
        closestPairSimilarity = closestPairSimilarity === null
          ? similarity
          : Math.max(closestPairSimilarity, similarity);
        if (similarity >= NEAR_DUPLICATE_SIMILARITY) {
          blockCandidate(
            right.report,
            "NEAR_DUPLICATE_VARIANT",
            `Candidate is ${similarity.toFixed(6)} similar to ${left.report.candidate_id}; it does not count as an independent visual variant.`,
          );
        }
        if (hasTopologyEdges) {
          const borderScore = borderSimilarity(left.borders, right.borders);
          minimumBorderSimilarity = minimumBorderSimilarity === null
            ? borderScore
            : Math.min(minimumBorderSimilarity, borderScore);
          if (borderScore < TOPOLOGY_BORDER_ALPHA_SIMILARITY) {
            blockCandidate(
              right.report,
              "TOPOLOGY_BORDER_DRIFT",
              `Boundary alpha compatibility ${borderScore.toFixed(6)} against ${left.report.candidate_id} is below ${TOPOLOGY_BORDER_ALPHA_SIMILARITY}.`,
            );
          }
        }
      }
    }

    const passed = work.filter((item) => item.report.technical_status === "passed").length;
    const issues: QualityIssue[] = [];
    if (passed < required) {
      issues.push(
        errorIssue(
          "INSUFFICIENT_TECHNICALLY_ADMITTED_VARIANTS",
          `Family has ${passed} technically admitted candidates but requires ${required}.`,
        ),
      );
    }
    familyReports.push({
      task_id: taskId,
      visual_family: family,
      required_approved_variants: required,
      candidate_count: work.length,
      passed_candidates: passed,
      blocked_candidates: work.length - passed,
      closest_pair_similarity: roundedOrNull(closestPairSimilarity),
      minimum_border_alpha_similarity: roundedOrNull(minimumBorderSimilarity),
      technical_status: issues.length ? "blocked" : "passed",
      issues,
    });
  }

  const missingFamilies = [...taskById.values()]
    .map((task) => text(task.visual_family, "task.visual_family"))
    .filter((family) => !workByFamily.has(family));
  for (const family of missingFamilies) {
    const task = [...taskById.values()].find(
      (candidate) => candidate.visual_family === family,
    )!;
    familyReports.push({
      task_id: text(task.task_id, `${family}.task_id`),
      visual_family: family,
      required_approved_variants: positiveInteger(
        task.required_approved_variants,
        `${family}.required_approved_variants`,
      ),
      candidate_count: 0,
      passed_candidates: 0,
      blocked_candidates: 0,
      closest_pair_similarity: null,
      minimum_border_alpha_similarity: null,
      technical_status: "blocked",
      issues: [errorIssue("MISSING_FAMILY_CANDIDATES", "No reviewed candidates exist for this family.")],
    });
  }
  familyReports.sort((a, b) => a.visual_family.localeCompare(b.visual_family));

  const candidateReports = [...workByFamily.values()]
    .flat()
    .map((item) => item.report)
    .sort(
      (a, b) =>
        a.visual_family.localeCompare(b.visual_family) ||
        a.candidate_id.localeCompare(b.candidate_id),
    );
  const status: TechnicalStatus = familyReports.some(
    (family) => family.technical_status === "blocked",
  )
    ? "blocked"
    : "passed";
  const base = {
    schema_version: 1 as const,
    policy_version: POLICY_VERSION,
    source_package_path: path.resolve(sourcePackagePath),
    source_package_sha256: sha256(packageBytes),
    source_package_fingerprint: sourcePackageFingerprint,
    source_review_path: path.resolve(reviewPath),
    source_review_sha256: sha256(reviewBytes),
    source_review_fingerprint: reviewFingerprint,
    source_provider_batch_fingerprint: sha256Hex(
      review.source_provider_batch_fingerprint,
      "review source_provider_batch_fingerprint",
    ),
    source_execution_sha256: sha256Hex(
      review.source_execution_sha256,
      "review source_execution_sha256",
    ),
    source_map_fingerprint: sourceMapFingerprint,
    candidate_root: candidateRoot,
    map_id: mapId,
    consumer_adapter: nullableText(sourcePackage.consumer_adapter, "consumer_adapter"),
    production_profile: profile,
    projection,
    thresholds: {
      near_duplicate_similarity: NEAR_DUPLICATE_SIMILARITY,
      seamless_edge_score: SEAMLESS_EDGE_SCORE,
      topology_border_alpha_similarity: TOPOLOGY_BORDER_ALPHA_SIMILARITY,
      pixel_exact_soft_alpha_ratio: PIXEL_EXACT_SOFT_ALPHA_RATIO,
    },
    candidates: candidateReports,
    families: familyReports,
    authority: {
      semantic_authority: "tile-map-studio" as const,
      technical_admission_authority: "art-studio" as const,
      creative_approval_authority: false as const,
      provider_success_implies_approval: false as const,
    },
    status,
  };
  return {
    ...base,
    qa_fingerprint: sha256(Buffer.from(canonical(base), "utf8")),
  };
}

function analysePixels(data: Buffer, width: number, height: number): CandidateMetrics {
  const colours = new Set<number>();
  let visible = 0;
  let transparent = 0;
  let softAlpha = 0;
  let minLuma = 255;
  let maxLuma = 0;
  let neighbourSum = 0;
  let neighbourCount = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const r = byte(data, offset);
      const g = byte(data, offset + 1);
      const b = byte(data, offset + 2);
      const a = byte(data, offset + 3);
      if (a === 0) transparent += 1;
      else {
        visible += 1;
        if (a < 255) softAlpha += 1;
        colours.add((((r * 256 + g) * 256 + b) * 256 + a) >>> 0);
        const luma = (299 * r + 587 * g + 114 * b) / 1000;
        minLuma = Math.min(minLuma, luma);
        maxLuma = Math.max(maxLuma, luma);
      }
      if (x + 1 < width) {
        neighbourSum += pixelDifference(data, offset, offset + 4);
        neighbourCount += 1;
      }
      if (y + 1 < height) {
        neighbourSum += pixelDifference(data, offset, offset + width * 4);
        neighbourCount += 1;
      }
    }
  }
  const pixelCount = width * height;
  return {
    pixel_count: pixelCount,
    visible_pixels: visible,
    transparent_pixels: transparent,
    soft_alpha_pixels: softAlpha,
    soft_alpha_ratio: rounded(pixelCount ? softAlpha / pixelCount : 0),
    unique_visible_colours: colours.size,
    luminance_min: rounded(visible ? minLuma : 0),
    luminance_max: rounded(visible ? maxLuma : 0),
    luminance_range: rounded(visible ? maxLuma - minLuma : 0),
    neighbour_variation: rounded(neighbourCount ? neighbourSum / neighbourCount : 0),
    horizontal_seam_score: rounded(seamScore(data, width, height, "horizontal")),
    vertical_seam_score: rounded(seamScore(data, width, height, "vertical")),
  };
}

function seamScore(
  data: Buffer,
  width: number,
  height: number,
  axis: "horizontal" | "vertical",
): number {
  let total = 0;
  const count = axis === "horizontal" ? height : width;
  for (let index = 0; index < count; index += 1) {
    const first = axis === "horizontal" ? index * width * 4 : index * 4;
    const second = axis === "horizontal"
      ? (index * width + width - 1) * 4
      : ((height - 1) * width + index) * 4;
    total += pixelDifference(data, first, second);
  }
  return count ? Math.max(0, 1 - total / count) : 1;
}

function borderAlpha(
  data: Buffer,
  width: number,
  height: number,
): Readonly<Record<"n" | "e" | "s" | "w", readonly number[]>> {
  const n: number[] = [];
  const e: number[] = [];
  const s: number[] = [];
  const w: number[] = [];
  for (let x = 0; x < width; x += 1) {
    n.push(byte(data, x * 4 + 3) / 255);
    s.push(byte(data, ((height - 1) * width + x) * 4 + 3) / 255);
  }
  for (let y = 0; y < height; y += 1) {
    w.push(byte(data, y * width * 4 + 3) / 255);
    e.push(byte(data, (y * width + width - 1) * 4 + 3) / 255);
  }
  return Object.freeze({ n, e, s, w });
}

function borderSimilarity(
  left: CandidateWork["borders"],
  right: CandidateWork["borders"],
): number {
  let minimum = 1;
  for (const side of ["n", "e", "s", "w"] as const) {
    const a = left[side];
    const b = right[side];
    if (a.length !== b.length) return 0;
    let difference = 0;
    for (let index = 0; index < a.length; index += 1) {
      difference += Math.abs((a[index] ?? 0) - (b[index] ?? 0));
    }
    minimum = Math.min(minimum, a.length ? 1 - difference / a.length : 1);
  }
  return minimum;
}

function rgbaSimilarity(left: Buffer, right: Buffer): number {
  if (left.length !== right.length || left.length === 0) return 0;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference += Math.abs(byte(left, index) - byte(right, index));
  }
  return Math.max(0, 1 - difference / (left.length * 255));
}

function pixelDifference(data: Buffer, left: number, right: number): number {
  let difference = 0;
  for (let channel = 0; channel < 4; channel += 1) {
    difference += Math.abs(byte(data, left + channel) - byte(data, right + channel));
  }
  return difference / (4 * 255);
}

function byte(data: Buffer, index: number): number {
  return data[index] ?? 0;
}

function blockCandidate(report: CandidateReport, code: string, message: string): void {
  if (!report.issues.some((issue) => issue.code === code && issue.message === message)) {
    report.issues.push(errorIssue(code, message));
  }
  report.technical_status = "blocked";
}

function errorIssue(code: string, message: string): QualityIssue {
  return { code, severity: "error", message };
}

function warningIssue(code: string, message: string): QualityIssue {
  return { code, severity: "warning", message };
}

function rounded(value: number): number {
  return Number(value.toFixed(8));
}

function roundedOrNull(value: number | null): number | null {
  return value === null ? null : rounded(value);
}

function portableRelative(value: string): string {
  if (value.includes("\\") || path.posix.isAbsolute(value)) {
    throw failure(
      "EVAVO_TILE_MAP_TECHNICAL_QA_PATH",
      `candidate path must be forward-slash relative: ${value}`,
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
    throw failure("EVAVO_TILE_MAP_TECHNICAL_QA_PATH", `unsafe candidate path: ${value}`);
  }
  return normalized;
}

function absolutePath(value: unknown, label: string): string {
  const textValue = text(value, label);
  const resolved = path.resolve(textValue);
  if (resolved !== textValue) {
    throw failure("EVAVO_TILE_MAP_TECHNICAL_QA_PATH", `${label} must be absolute and normalized`);
  }
  return resolved;
}

function assertInside(root: string, candidate: string, label: string): void {
  const relative = path.relative(root, candidate);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw failure("EVAVO_TILE_MAP_TECHNICAL_QA_PATH", `${label} escapes candidate root`);
  }
}

function parseObject(content: string, label: string): JsonObject {
  try {
    return object(JSON.parse(content) as unknown, label);
  } catch (error) {
    if (error instanceof Error && "code" in error) throw error;
    throw failure("EVAVO_TILE_MAP_TECHNICAL_QA_JSON", `invalid JSON in ${label}`);
  }
}

function object(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw failure("EVAVO_TILE_MAP_TECHNICAL_QA_TYPE", `${label} must be object`);
  }
  return value as JsonObject;
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw failure("EVAVO_TILE_MAP_TECHNICAL_QA_TYPE", `${label} must be array`);
  }
  return value;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw failure("EVAVO_TILE_MAP_TECHNICAL_QA_TYPE", `${label} must be non-empty string`);
  }
  return value;
}

function nullableText(value: unknown, label: string): string | null {
  if (value === null || value === undefined) return null;
  return text(value, label);
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw failure("EVAVO_TILE_MAP_TECHNICAL_QA_TYPE", `${label} must be positive integer`);
  }
  return value as number;
}

function booleanValue(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw failure("EVAVO_TILE_MAP_TECHNICAL_QA_TYPE", `${label} must be boolean`);
  }
  return value;
}

function optionalStringArray(value: unknown, label: string): string[] {
  if (value === undefined || value === null) return [];
  return array(value, label).map((item, index) => text(item, `${label}[${index}]`));
}

function sha256Hex(value: unknown, label: string): string {
  const result = text(value, label).toLowerCase();
  if (!/^[0-9a-f]{64}$/u.test(result)) {
    throw failure("EVAVO_TILE_MAP_TECHNICAL_QA_HASH", `${label} must be SHA-256`);
  }
  return result;
}

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const entries = Object.entries(value as JsonObject).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries
    .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
    .join(",")}}`;
}

function failure(code: string, message: string): Error & { code: string } {
  const error = new Error(message) as Error & { code: string };
  error.code = code;
  return error;
}
