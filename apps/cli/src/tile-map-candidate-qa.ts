import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

type JsonObject = Record<string, unknown>;
type Severity = "error" | "warning" | "info";

type Finding = Readonly<{
  code: string;
  severity: Severity;
  message: string;
}>;

type QaPolicy = Readonly<{
  minimum_visible_coverage: number;
  minimum_transparent_coverage_when_required: number;
  maximum_soft_alpha_ratio: number;
  maximum_palette_colours: number;
  maximum_palette_colours_blocking: number;
  minimum_luminance_range: number;
  maximum_isolated_pixel_ratio: number;
  minimum_seam_score: number;
  near_duplicate_mean_error: number;
  near_duplicate_changed_pixel_ratio: number;
  changed_pixel_threshold: number;
  topology_alpha_threshold: number;
}>;

type CandidatePixels = Readonly<{
  id: string;
  taskId: string;
  family: string;
  width: number;
  height: number;
  rgba: Buffer;
  metrics: CandidateMetrics;
  findings: readonly Finding[];
}>;

type CandidateMetrics = Readonly<{
  visible_pixels: number;
  transparent_pixels: number;
  soft_alpha_pixels: number;
  visible_coverage: number;
  transparent_coverage: number;
  soft_alpha_ratio: number;
  exact_palette_colours: number;
  quantized_palette_colours: number;
  luminance_min: number;
  luminance_max: number;
  luminance_range: number;
  luminance_standard_deviation: number;
  isolated_pixel_ratio: number;
  horizontal_seam_score: number;
  vertical_seam_score: number;
  edge_occupancy: Readonly<{ n: number; e: number; s: number; w: number }>;
  visible_components: number;
}>;

export type TileMapCandidateQaReport = Readonly<{
  schema_version: 1;
  source_package_path: string;
  source_package_sha256: string;
  source_package_fingerprint: string;
  source_review_path: string;
  source_review_sha256: string;
  source_review_fingerprint: string;
  source_provider_batch_fingerprint: string;
  source_execution_sha256: string;
  source_map_fingerprint: string;
  map_id: string;
  consumer_adapter: string | null;
  production_profile: string | null;
  projection: string;
  policy: QaPolicy;
  policy_source: Readonly<{
    kind: "profile-default" | "explicit-file";
    path: string | null;
    sha256: string | null;
  }>;
  candidates: readonly JsonObject[];
  families: readonly JsonObject[];
  summary: Readonly<{
    candidates: number;
    candidate_errors: number;
    candidate_warnings: number;
    family_errors: number;
    family_warnings: number;
    technically_clear_candidates: number;
  }>;
  authority: Readonly<{
    semantic_authority: "tile-map-studio";
    automated_technical_qa: true;
    structural_review_decision: false;
    visual_review_decision: false;
    creative_approval: false;
    provider_execution: false;
    candidate_promotion: false;
  }>;
  status: "passed" | "blocked";
  qa_fingerprint: string;
}>;

const PIXEL_PROFILES = new Set([
  "snes-topdown-rpg",
  "1990s-isometric-simulation",
  "mutable-isometric-dungeon",
  "rts-1990s",
  "platformer-metatile",
  "roguelike-room-corridor",
  "overworld-world-map",
]);

export async function compileTileMapCandidateQa(
  sourcePackagePath: string,
  reviewPath: string,
  policyPath?: string,
): Promise<TileMapCandidateQaReport> {
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
      "EVAVO_TILE_MAP_QA_PACKAGE",
      "source package must be governed Tile Map source package schema v1",
    );
  }
  if (review.schema_version !== 1 || review.status !== "awaiting-review") {
    throw failure(
      "EVAVO_TILE_MAP_QA_REVIEW",
      "candidate review must be schema v1 and awaiting-review",
    );
  }

  const packageFingerprint = sha256Hex(
    sourcePackage.package_fingerprint,
    "source package fingerprint",
  );
  const reviewFingerprint = sha256Hex(review.review_fingerprint, "review fingerprint");
  const sourceMapFingerprint = sha256Hex(
    sourcePackage.source_map_fingerprint,
    "source map fingerprint",
  );
  if (review.source_package_fingerprint !== packageFingerprint) {
    throw failure(
      "EVAVO_TILE_MAP_QA_DRIFT",
      "candidate review does not target the exact source package",
    );
  }
  if (review.source_map_fingerprint !== sourceMapFingerprint) {
    throw failure(
      "EVAVO_TILE_MAP_QA_DRIFT",
      "candidate review semantic map fingerprint is stale",
    );
  }
  if (
    review.map_id !== sourcePackage.map_id ||
    review.projection !== sourcePackage.projection
  ) {
    throw failure(
      "EVAVO_TILE_MAP_QA_DRIFT",
      "map identity or projection differs between source package and review",
    );
  }
  const reviewAuthority = object(review.authority, "review.authority");
  if (
    reviewAuthority.execution_evidence_required !== true ||
    reviewAuthority.provider_authority !== "intermediate-only"
  ) {
    throw failure(
      "EVAVO_TILE_MAP_QA_AUTHORITY",
      "candidate review does not retain authorized intermediate provider evidence",
    );
  }
  const providerBatchFingerprint = sha256Hex(
    review.source_provider_batch_fingerprint,
    "review.source_provider_batch_fingerprint",
  );
  const executionSha256 = sha256Hex(
    review.source_execution_sha256,
    "review.source_execution_sha256",
  );
  await verifyRetainedProviderResults(review);

  const taskMap = sourceTasks(sourcePackage);
  const productionProfile = nullableText(
    sourcePackage.production_profile,
    "production_profile",
  );
  const policyEvidence = await loadPolicy(productionProfile, policyPath);
  const candidateRoot = absolutePath(review.candidate_root, "review.candidate_root");
  const reviewCandidates = array(review.candidates, "review.candidates");
  if (reviewCandidates.length === 0) {
    throw failure("EVAVO_TILE_MAP_QA_EMPTY", "candidate review contains no candidates");
  }

  const candidates: CandidatePixels[] = [];
  const seenIds = new Set<string>();
  for (const [index, entry] of reviewCandidates.entries()) {
    const candidate = object(entry, `review.candidates[${index}]`);
    const id = text(candidate.candidate_id, `review.candidates[${index}].candidate_id`);
    if (seenIds.has(id)) {
      throw failure("EVAVO_TILE_MAP_QA_DUPLICATE", `duplicate candidate id: ${id}`);
    }
    seenIds.add(id);
    const taskId = text(candidate.task_id, `${id}.task_id`);
    const family = text(candidate.visual_family, `${id}.visual_family`);
    const task = taskMap.get(taskId);
    if (!task || task.visualFamily !== family) {
      throw failure(
        "EVAVO_TILE_MAP_QA_TASK",
        `${id} does not map to the exact source-package task/family`,
      );
    }
    const relativePath = portableRelative(text(candidate.path, `${id}.path`));
    const absoluteCandidate = resolveInside(candidateRoot, relativePath, `${id}.path`);
    const bytes = await readFile(absoluteCandidate);
    const expectedSha = sha256Hex(candidate.sha256, `${id}.sha256`);
    if (sha256(bytes) !== expectedSha) {
      throw failure("EVAVO_TILE_MAP_QA_HASH", `${id} candidate bytes changed after review intake`);
    }
    if (positiveInteger(candidate.bytes, `${id}.bytes`) !== bytes.length) {
      throw failure("EVAVO_TILE_MAP_QA_HASH", `${id} candidate byte count changed after review intake`);
    }
    const decoded = await sharp(bytes, { failOn: "error" })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (
      decoded.info.width !== task.width ||
      decoded.info.height !== task.height ||
      decoded.info.channels !== 4
    ) {
      throw failure(
        "EVAVO_TILE_MAP_QA_GEOMETRY",
        `${id} decoded canvas is ${decoded.info.width}x${decoded.info.height}; expected ${task.width}x${task.height}`,
      );
    }
    const result = analyseCandidate(
      id,
      taskId,
      family,
      decoded.data,
      decoded.info.width,
      decoded.info.height,
      task,
      policyEvidence.policy,
      productionProfile,
    );
    candidates.push(result);
  }

  candidates.sort(
    (left, right) =>
      left.family.localeCompare(right.family) || left.id.localeCompare(right.id),
  );
  const familyReports = analyseFamilies(candidates, taskMap, policyEvidence.policy);
  const candidateReports = candidates.map((candidate) => ({
    candidate_id: candidate.id,
    task_id: candidate.taskId,
    visual_family: candidate.family,
    metrics: candidate.metrics,
    findings: candidate.findings,
    technically_clear: !candidate.findings.some((finding) => finding.severity === "error"),
    creative_approval: false,
  }));
  const candidateErrors = candidateReports.reduce(
    (sum, candidate) =>
      sum +
      (candidate.findings as readonly Finding[]).filter((finding) => finding.severity === "error")
        .length,
    0,
  );
  const candidateWarnings = candidateReports.reduce(
    (sum, candidate) =>
      sum +
      (candidate.findings as readonly Finding[]).filter(
        (finding) => finding.severity === "warning",
      ).length,
    0,
  );
  const familyErrors = familyReports.reduce(
    (sum, family) =>
      sum +
      (family.findings as readonly Finding[]).filter((finding) => finding.severity === "error")
        .length,
    0,
  );
  const familyWarnings = familyReports.reduce(
    (sum, family) =>
      sum +
      (family.findings as readonly Finding[]).filter(
        (finding) => finding.severity === "warning",
      ).length,
    0,
  );
  const technicallyClear = candidateReports.filter(
    (candidate) => candidate.technically_clear,
  ).length;
  const blocked = candidateErrors + familyErrors > 0;

  const base = {
    schema_version: 1 as const,
    source_package_path: path.resolve(sourcePackagePath),
    source_package_sha256: sha256(packageBytes),
    source_package_fingerprint: packageFingerprint,
    source_review_path: path.resolve(reviewPath),
    source_review_sha256: sha256(reviewBytes),
    source_review_fingerprint: reviewFingerprint,
    source_provider_batch_fingerprint: providerBatchFingerprint,
    source_execution_sha256: executionSha256,
    source_map_fingerprint: sourceMapFingerprint,
    map_id: text(sourcePackage.map_id, "map_id"),
    consumer_adapter: nullableText(sourcePackage.consumer_adapter, "consumer_adapter"),
    production_profile: productionProfile,
    projection: text(sourcePackage.projection, "projection"),
    policy: policyEvidence.policy,
    policy_source: policyEvidence.source,
    candidates: candidateReports,
    families: familyReports,
    summary: {
      candidates: candidateReports.length,
      candidate_errors: candidateErrors,
      candidate_warnings: candidateWarnings,
      family_errors: familyErrors,
      family_warnings: familyWarnings,
      technically_clear_candidates: technicallyClear,
    },
    authority: {
      semantic_authority: "tile-map-studio" as const,
      automated_technical_qa: true as const,
      structural_review_decision: false as const,
      visual_review_decision: false as const,
      creative_approval: false as const,
      provider_execution: false as const,
      candidate_promotion: false as const,
    },
    status: blocked ? ("blocked" as const) : ("passed" as const),
  };
  return {
    ...base,
    qa_fingerprint: sha256(Buffer.from(canonical(base), "utf8")),
  };
}

type SourceTask = Readonly<{
  taskId: string;
  visualFamily: string;
  taskKind: "tile-family" | "feature-family";
  width: number;
  height: number;
  requiredVariants: number;
  alphaRequired: boolean;
  topology: JsonObject | null;
}>;

function sourceTasks(sourcePackage: JsonObject): Map<string, SourceTask> {
  const result = new Map<string, SourceTask>();
  const families = new Set<string>();
  for (const [index, entry] of array(sourcePackage.tasks, "source package tasks").entries()) {
    const task = object(entry, `source package tasks[${index}]`);
    const taskId = text(task.task_id, `source package tasks[${index}].task_id`);
    const visualFamily = text(
      task.visual_family,
      `source package tasks[${index}].visual_family`,
    );
    if (result.has(taskId) || families.has(visualFamily)) {
      throw failure(
        "EVAVO_TILE_MAP_QA_DUPLICATE",
        `duplicate source task/family: ${taskId} / ${visualFamily}`,
      );
    }
    const kind = task.task_kind;
    if (kind !== "tile-family" && kind !== "feature-family") {
      throw failure("EVAVO_TILE_MAP_QA_TASK", `${taskId} has unsupported task_kind`);
    }
    const dimensions = object(task.dimensions, `${taskId}.dimensions`);
    result.set(taskId, {
      taskId,
      visualFamily,
      taskKind: kind,
      width: positiveInteger(dimensions.width, `${taskId}.dimensions.width`),
      height: positiveInteger(dimensions.height, `${taskId}.dimensions.height`),
      requiredVariants: positiveInteger(
        task.required_approved_variants,
        `${taskId}.required_approved_variants`,
      ),
      alphaRequired: booleanValue(task.alpha_required, `${taskId}.alpha_required`),
      topology: task.topology === null ? null : object(task.topology, `${taskId}.topology`),
    });
    families.add(visualFamily);
  }
  return result;
}

function analyseCandidate(
  id: string,
  taskId: string,
  family: string,
  rgba: Buffer,
  width: number,
  height: number,
  task: SourceTask,
  policy: QaPolicy,
  productionProfile: string | null,
): CandidatePixels {
  const total = width * height;
  let visible = 0;
  let transparent = 0;
  let softAlpha = 0;
  let luminanceSum = 0;
  let luminanceSquared = 0;
  let luminanceMin = 1;
  let luminanceMax = 0;
  const exactColours = new Set<number>();
  const quantizedColours = new Set<number>();
  const visibleMask = new Uint8Array(total);
  const luma = new Float64Array(total);

  for (let pixel = 0; pixel < total; pixel += 1) {
    const offset = pixel * 4;
    const red = rgba[offset] ?? 0;
    const green = rgba[offset + 1] ?? 0;
    const blue = rgba[offset + 2] ?? 0;
    const alpha = rgba[offset + 3] ?? 0;
    if (alpha === 0) transparent += 1;
    else {
      visible += 1;
      visibleMask[pixel] = 1;
      if (alpha < 255) softAlpha += 1;
      exactColours.add((red << 24) | (green << 16) | (blue << 8) | alpha);
      quantizedColours.add(((red >> 3) << 10) | ((green >> 3) << 5) | (blue >> 3));
      const value = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
      luma[pixel] = value;
      luminanceSum += value;
      luminanceSquared += value * value;
      luminanceMin = Math.min(luminanceMin, value);
      luminanceMax = Math.max(luminanceMax, value);
    }
  }
  if (visible === 0) {
    luminanceMin = 0;
    luminanceMax = 0;
  }
  const luminanceMean = visible === 0 ? 0 : luminanceSum / visible;
  const luminanceVariance =
    visible === 0
      ? 0
      : Math.max(0, luminanceSquared / visible - luminanceMean * luminanceMean);
  const edgeOccupancy = {
    n: edgeVisible(visibleMask, width, height, "n", policy.topology_alpha_threshold),
    e: edgeVisible(visibleMask, width, height, "e", policy.topology_alpha_threshold),
    s: edgeVisible(visibleMask, width, height, "s", policy.topology_alpha_threshold),
    w: edgeVisible(visibleMask, width, height, "w", policy.topology_alpha_threshold),
  };
  const components = visibleComponents(visibleMask, width, height);
  const isolatedRatio = isolatedPixelRatio(visibleMask, luma, width, height);
  const metrics: CandidateMetrics = {
    visible_pixels: visible,
    transparent_pixels: transparent,
    soft_alpha_pixels: softAlpha,
    visible_coverage: ratio(visible, total),
    transparent_coverage: ratio(transparent, total),
    soft_alpha_ratio: ratio(softAlpha, total),
    exact_palette_colours: exactColours.size,
    quantized_palette_colours: quantizedColours.size,
    luminance_min: rounded(luminanceMin),
    luminance_max: rounded(luminanceMax),
    luminance_range: rounded(luminanceMax - luminanceMin),
    luminance_standard_deviation: rounded(Math.sqrt(luminanceVariance)),
    isolated_pixel_ratio: rounded(isolatedRatio),
    horizontal_seam_score: rounded(oppositeEdgeScore(rgba, width, height, "horizontal")),
    vertical_seam_score: rounded(oppositeEdgeScore(rgba, width, height, "vertical")),
    edge_occupancy: edgeOccupancy,
    visible_components: components.length,
  };
  const findings: Finding[] = [];
  if (metrics.visible_coverage < policy.minimum_visible_coverage) {
    findings.push(
      finding(
        "TILE_MAP_QA_NEAR_BLANK",
        "error",
        `${id} visible coverage ${metrics.visible_coverage} is below ${policy.minimum_visible_coverage}`,
      ),
    );
  }
  if (
    task.alphaRequired &&
    metrics.transparent_coverage < policy.minimum_transparent_coverage_when_required
  ) {
    findings.push(
      finding(
        "TILE_MAP_QA_ALPHA_OPAQUE",
        "error",
        `${id} requires useful transparency but transparent coverage is ${metrics.transparent_coverage}`,
      ),
    );
  }
  const pixelArt = productionProfile !== null && PIXEL_PROFILES.has(productionProfile);
  if (pixelArt && metrics.soft_alpha_ratio > policy.maximum_soft_alpha_ratio) {
    findings.push(
      finding(
        "TILE_MAP_QA_SOFT_ALPHA",
        "error",
        `${id} soft-alpha ratio ${metrics.soft_alpha_ratio} exceeds pixel-art limit ${policy.maximum_soft_alpha_ratio}`,
      ),
    );
  }
  const paletteLimit =
    task.taskKind === "feature-family"
      ? Math.min(2048, policy.maximum_palette_colours * 4)
      : policy.maximum_palette_colours;
  const paletteBlocking =
    task.taskKind === "feature-family"
      ? Math.min(4096, policy.maximum_palette_colours_blocking * 4)
      : policy.maximum_palette_colours_blocking;
  if (metrics.quantized_palette_colours > paletteBlocking) {
    findings.push(
      finding(
        "TILE_MAP_QA_PALETTE_EXCESS",
        "error",
        `${id} quantized palette ${metrics.quantized_palette_colours} exceeds blocking limit ${paletteBlocking}`,
      ),
    );
  } else if (metrics.quantized_palette_colours > paletteLimit) {
    findings.push(
      finding(
        "TILE_MAP_QA_PALETTE_DENSE",
        "warning",
        `${id} quantized palette ${metrics.quantized_palette_colours} exceeds profile target ${paletteLimit}`,
      ),
    );
  }
  if (
    metrics.visible_coverage >= policy.minimum_visible_coverage &&
    metrics.luminance_range < policy.minimum_luminance_range
  ) {
    findings.push(
      finding(
        "TILE_MAP_QA_NATIVE_SCALE_FLAT",
        "warning",
        `${id} luminance range ${metrics.luminance_range} may be unreadably flat at native scale`,
      ),
    );
  }
  if (metrics.isolated_pixel_ratio > policy.maximum_isolated_pixel_ratio) {
    findings.push(
      finding(
        "TILE_MAP_QA_ISOLATED_NOISE",
        "warning",
        `${id} isolated-pixel ratio ${metrics.isolated_pixel_ratio} suggests noisy or unmastered detail`,
      ),
    );
  }

  const seamless =
    task.topology?.continuous_material === true || task.topology?.seamless_edges === true;
  if (seamless) {
    if (
      metrics.horizontal_seam_score < policy.minimum_seam_score ||
      metrics.vertical_seam_score < policy.minimum_seam_score
    ) {
      findings.push(
        finding(
          "TILE_MAP_QA_SEAM_FAILURE",
          "error",
          `${id} seamless scores h=${metrics.horizontal_seam_score}, v=${metrics.vertical_seam_score}; minimum ${policy.minimum_seam_score}`,
        ),
      );
    }
  }

  const requiredEdges = topologyEdges(task.topology);
  if (task.alphaRequired && requiredEdges.size > 0) {
    const missingEdges = [...requiredEdges].filter(
      (edge) => metrics.edge_occupancy[edge] <= 0,
    );
    if (missingEdges.length > 0) {
      findings.push(
        finding(
          "TILE_MAP_QA_TOPOLOGY_EDGE_MISSING",
          "error",
          `${id} does not visibly reach required topology edges: ${missingEdges.join(", ")}`,
        ),
      );
    }
    if (
      !components.some((component) =>
        [...requiredEdges].every((edge) => component.edges.has(edge)),
      )
    ) {
      findings.push(
        finding(
          "TILE_MAP_QA_TOPOLOGY_DISCONNECTED",
          "error",
          `${id} has no single visible component connecting all required topology edges`,
        ),
      );
    }
  }

  findings.sort((left, right) => left.code.localeCompare(right.code));
  return {
    id,
    taskId,
    family,
    width,
    height,
    rgba,
    metrics,
    findings,
  };
}

function analyseFamilies(
  candidates: readonly CandidatePixels[],
  tasks: ReadonlyMap<string, SourceTask>,
  policy: QaPolicy,
): JsonObject[] {
  const byFamily = new Map<string, CandidatePixels[]>();
  for (const candidate of candidates) {
    const values = byFamily.get(candidate.family) ?? [];
    values.push(candidate);
    byFamily.set(candidate.family, values);
  }
  const reports: JsonObject[] = [];
  for (const [family, values] of [...byFamily.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    values.sort((left, right) => left.id.localeCompare(right.id));
    const task = [...tasks.values()].find((entry) => entry.visualFamily === family);
    if (!task) throw failure("EVAVO_TILE_MAP_QA_TASK", `missing task for family ${family}`);
    const parent = values.map((_, index) => index);
    const pairs: JsonObject[] = [];
    const findings: Finding[] = [];
    for (let left = 0; left < values.length; left += 1) {
      for (let right = left + 1; right < values.length; right += 1) {
        const comparison = pixelDifference(values[left]!, values[right]!, policy);
        const nearDuplicate =
          comparison.mean_error <= policy.near_duplicate_mean_error ||
          comparison.changed_pixel_ratio <= policy.near_duplicate_changed_pixel_ratio;
        if (nearDuplicate) union(parent, left, right);
        pairs.push({
          left_candidate_id: values[left]!.id,
          right_candidate_id: values[right]!.id,
          mean_error: comparison.mean_error,
          changed_pixel_ratio: comparison.changed_pixel_ratio,
          near_duplicate: nearDuplicate,
        });
      }
    }
    const clusters = new Set(values.map((_, index) => find(parent, index))).size;
    if (clusters < task.requiredVariants) {
      findings.push(
        finding(
          "TILE_MAP_QA_EFFECTIVE_VARIANTS",
          "error",
          `${family} has ${clusters} effective visual variants; requires ${task.requiredVariants}`,
        ),
      );
    }
    const nearPairs = pairs.filter((pair) => pair.near_duplicate === true).length;
    if (nearPairs > 0) {
      findings.push(
        finding(
          "TILE_MAP_QA_NEAR_DUPLICATE_VARIANTS",
          "warning",
          `${family} contains ${nearPairs} near-duplicate candidate pair(s)`,
        ),
      );
    }
    findings.sort((left, right) => left.code.localeCompare(right.code));
    reports.push({
      visual_family: family,
      task_id: task.taskId,
      required_approved_variants: task.requiredVariants,
      candidate_count: values.length,
      effective_visual_variants: clusters,
      pairwise_comparisons: pairs,
      findings,
      technically_clear: !findings.some((entry) => entry.severity === "error"),
      creative_approval: false,
    });
  }
  return reports;
}

function pixelDifference(
  left: CandidatePixels,
  right: CandidatePixels,
  policy: QaPolicy,
): Readonly<{ mean_error: number; changed_pixel_ratio: number }> {
  if (left.width !== right.width || left.height !== right.height) {
    return { mean_error: 1, changed_pixel_ratio: 1 };
  }
  let error = 0;
  let changed = 0;
  const pixels = left.width * left.height;
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    const offset = pixel * 4;
    let pixelError = 0;
    for (let channel = 0; channel < 4; channel += 1) {
      pixelError += Math.abs((left.rgba[offset + channel] ?? 0) - (right.rgba[offset + channel] ?? 0));
    }
    const normalized = pixelError / (4 * 255);
    error += normalized;
    if (normalized > policy.changed_pixel_threshold) changed += 1;
  }
  return {
    mean_error: rounded(error / pixels),
    changed_pixel_ratio: rounded(changed / pixels),
  };
}

async function verifyRetainedProviderResults(review: JsonObject): Promise<void> {
  const resultsPath = absolutePath(
    review.provider_results_path,
    "review.provider_results_path",
  );
  const candidateRoot = absolutePath(review.candidate_root, "review.candidate_root");
  if (path.dirname(resultsPath) !== candidateRoot) {
    throw failure(
      "EVAVO_TILE_MAP_QA_EVIDENCE",
      "candidate_root must be the retained provider-results directory",
    );
  }
  const bytes = await readFile(resultsPath);
  if (sha256(bytes) !== sha256Hex(review.provider_results_sha256, "provider_results_sha256")) {
    throw failure(
      "EVAVO_TILE_MAP_QA_EVIDENCE",
      "retained provider-results bytes changed after review intake",
    );
  }
}

async function loadPolicy(
  productionProfile: string | null,
  policyPath?: string,
): Promise<Readonly<{ policy: QaPolicy; source: TileMapCandidateQaReport["policy_source"] }>> {
  const base = defaultPolicy(productionProfile);
  if (!policyPath) {
    return {
      policy: base,
      source: { kind: "profile-default", path: null, sha256: null },
    };
  }
  const resolved = path.resolve(policyPath);
  const bytes = await readFile(resolved);
  const raw = parseObject(bytes.toString("utf8"), resolved);
  if (raw.schema_version !== 1) {
    throw failure("EVAVO_TILE_MAP_QA_POLICY", "QA policy schema_version must be 1");
  }
  const overrides = object(raw.thresholds, "policy.thresholds");
  const policy: QaPolicy = {
    minimum_visible_coverage: threshold(
      overrides.minimum_visible_coverage,
      base.minimum_visible_coverage,
      0,
      1,
      "minimum_visible_coverage",
    ),
    minimum_transparent_coverage_when_required: threshold(
      overrides.minimum_transparent_coverage_when_required,
      base.minimum_transparent_coverage_when_required,
      0,
      1,
      "minimum_transparent_coverage_when_required",
    ),
    maximum_soft_alpha_ratio: threshold(
      overrides.maximum_soft_alpha_ratio,
      base.maximum_soft_alpha_ratio,
      0,
      1,
      "maximum_soft_alpha_ratio",
    ),
    maximum_palette_colours: integerThreshold(
      overrides.maximum_palette_colours,
      base.maximum_palette_colours,
      1,
      65_536,
      "maximum_palette_colours",
    ),
    maximum_palette_colours_blocking: integerThreshold(
      overrides.maximum_palette_colours_blocking,
      base.maximum_palette_colours_blocking,
      1,
      65_536,
      "maximum_palette_colours_blocking",
    ),
    minimum_luminance_range: threshold(
      overrides.minimum_luminance_range,
      base.minimum_luminance_range,
      0,
      1,
      "minimum_luminance_range",
    ),
    maximum_isolated_pixel_ratio: threshold(
      overrides.maximum_isolated_pixel_ratio,
      base.maximum_isolated_pixel_ratio,
      0,
      1,
      "maximum_isolated_pixel_ratio",
    ),
    minimum_seam_score: threshold(
      overrides.minimum_seam_score,
      base.minimum_seam_score,
      0,
      1,
      "minimum_seam_score",
    ),
    near_duplicate_mean_error: threshold(
      overrides.near_duplicate_mean_error,
      base.near_duplicate_mean_error,
      0,
      1,
      "near_duplicate_mean_error",
    ),
    near_duplicate_changed_pixel_ratio: threshold(
      overrides.near_duplicate_changed_pixel_ratio,
      base.near_duplicate_changed_pixel_ratio,
      0,
      1,
      "near_duplicate_changed_pixel_ratio",
    ),
    changed_pixel_threshold: threshold(
      overrides.changed_pixel_threshold,
      base.changed_pixel_threshold,
      0,
      1,
      "changed_pixel_threshold",
    ),
    topology_alpha_threshold: integerThreshold(
      overrides.topology_alpha_threshold,
      base.topology_alpha_threshold,
      0,
      255,
      "topology_alpha_threshold",
    ),
  };
  if (policy.maximum_palette_colours_blocking < policy.maximum_palette_colours) {
    throw failure(
      "EVAVO_TILE_MAP_QA_POLICY",
      "maximum_palette_colours_blocking must be >= maximum_palette_colours",
    );
  }
  return {
    policy,
    source: { kind: "explicit-file", path: resolved, sha256: sha256(bytes) },
  };
}

function defaultPolicy(profile: string | null): QaPolicy {
  const pixelArt = profile !== null && PIXEL_PROFILES.has(profile);
  const palette =
    profile === "snes-topdown-rpg" || profile === "platformer-metatile"
      ? 32
      : pixelArt
        ? 96
        : 256;
  return {
    minimum_visible_coverage: 0.01,
    minimum_transparent_coverage_when_required: 0.005,
    maximum_soft_alpha_ratio: pixelArt ? 0.002 : 0.25,
    maximum_palette_colours: palette,
    maximum_palette_colours_blocking: palette * 2,
    minimum_luminance_range: 0.04,
    maximum_isolated_pixel_ratio: pixelArt ? 0.45 : 0.65,
    minimum_seam_score: 0.96,
    near_duplicate_mean_error: 0.015,
    near_duplicate_changed_pixel_ratio: 0.04,
    changed_pixel_threshold: 0.05,
    topology_alpha_threshold: 16,
  };
}

function oppositeEdgeScore(
  rgba: Buffer,
  width: number,
  height: number,
  axis: "horizontal" | "vertical",
): number {
  let difference = 0;
  let samples = 0;
  if (axis === "horizontal") {
    for (let y = 0; y < height; y += 1) {
      difference += premultipliedPixelDifference(rgba, (y * width) * 4, (y * width + width - 1) * 4);
      samples += 1;
    }
  } else {
    for (let x = 0; x < width; x += 1) {
      difference += premultipliedPixelDifference(rgba, x * 4, ((height - 1) * width + x) * 4);
      samples += 1;
    }
  }
  return Math.max(0, 1 - difference / Math.max(1, samples));
}

function premultipliedPixelDifference(rgba: Buffer, left: number, right: number): number {
  const leftAlpha = (rgba[left + 3] ?? 0) / 255;
  const rightAlpha = (rgba[right + 3] ?? 0) / 255;
  const channels = [0, 1, 2].reduce(
    (sum, channel) =>
      sum +
      Math.abs(
        ((rgba[left + channel] ?? 0) / 255) * leftAlpha -
          ((rgba[right + channel] ?? 0) / 255) * rightAlpha,
      ),
    0,
  );
  return (channels + Math.abs(leftAlpha - rightAlpha)) / 4;
}

function isolatedPixelRatio(
  mask: Uint8Array,
  luma: Float64Array,
  width: number,
  height: number,
): number {
  let visible = 0;
  let isolated = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (mask[index] !== 1) continue;
      visible += 1;
      const neighbours = [
        x > 0 ? index - 1 : -1,
        x + 1 < width ? index + 1 : -1,
        y > 0 ? index - width : -1,
        y + 1 < height ? index + width : -1,
      ].filter((candidate) => candidate >= 0 && mask[candidate] === 1);
      if (
        neighbours.length > 0 &&
        neighbours.every((candidate) => Math.abs(luma[index]! - luma[candidate]!) > 0.2)
      ) {
        isolated += 1;
      }
    }
  }
  return visible === 0 ? 0 : isolated / visible;
}

type Cardinal = "n" | "e" | "s" | "w";
type VisibleComponent = Readonly<{ edges: ReadonlySet<Cardinal>; size: number }>;

function visibleComponents(mask: Uint8Array, width: number, height: number): VisibleComponent[] {
  const visited = new Uint8Array(mask.length);
  const result: VisibleComponent[] = [];
  for (let start = 0; start < mask.length; start += 1) {
    if (mask[start] !== 1 || visited[start] === 1) continue;
    const queue = [start];
    visited[start] = 1;
    const edges = new Set<Cardinal>();
    let size = 0;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const index = queue[cursor]!;
      const x = index % width;
      const y = Math.floor(index / width);
      size += 1;
      if (y === 0) edges.add("n");
      if (x === width - 1) edges.add("e");
      if (y === height - 1) edges.add("s");
      if (x === 0) edges.add("w");
      const neighbours = [
        x > 0 ? index - 1 : -1,
        x + 1 < width ? index + 1 : -1,
        y > 0 ? index - width : -1,
        y + 1 < height ? index + width : -1,
      ];
      for (const neighbour of neighbours) {
        if (neighbour >= 0 && mask[neighbour] === 1 && visited[neighbour] === 0) {
          visited[neighbour] = 1;
          queue.push(neighbour);
        }
      }
    }
    result.push({ edges, size });
  }
  return result.sort((left, right) => right.size - left.size);
}

function topologyEdges(topology: JsonObject | null): Set<Cardinal> {
  const result = new Set<Cardinal>();
  if (!topology || !Array.isArray(topology.edge_signatures)) return result;
  for (const entry of topology.edge_signatures) {
    if (typeof entry !== "string") continue;
    const tokens = entry.toLowerCase().split(/[^a-z]+/u).filter(Boolean);
    for (const token of tokens) {
      if (!/^[nesw]{1,4}$/u.test(token)) continue;
      for (const letter of token) result.add(letter as Cardinal);
    }
  }
  return result;
}

function edgeVisible(
  mask: Uint8Array,
  width: number,
  height: number,
  edge: Cardinal,
  _threshold: number,
): number {
  let visible = 0;
  let samples = 0;
  if (edge === "n" || edge === "s") {
    const y = edge === "n" ? 0 : height - 1;
    for (let x = 0; x < width; x += 1) {
      samples += 1;
      if (mask[y * width + x] === 1) visible += 1;
    }
  } else {
    const x = edge === "w" ? 0 : width - 1;
    for (let y = 0; y < height; y += 1) {
      samples += 1;
      if (mask[y * width + x] === 1) visible += 1;
    }
  }
  return rounded(visible / Math.max(1, samples));
}

function find(parent: number[], value: number): number {
  if (parent[value] !== value) parent[value] = find(parent, parent[value]!);
  return parent[value]!;
}
function union(parent: number[], left: number, right: number): void {
  const leftRoot = find(parent, left);
  const rightRoot = find(parent, right);
  if (leftRoot !== rightRoot) parent[rightRoot] = leftRoot;
}

function threshold(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
  label: string,
): number {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw failure("EVAVO_TILE_MAP_QA_POLICY", `${label} must be between ${minimum} and ${maximum}`);
  }
  return value;
}
function integerThreshold(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
  label: string,
): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw failure("EVAVO_TILE_MAP_QA_POLICY", `${label} must be integer ${minimum}..${maximum}`);
  }
  return value as number;
}
function finding(code: string, severity: Severity, message: string): Finding {
  return Object.freeze({ code, severity, message });
}
function ratio(value: number, total: number): number {
  return rounded(total === 0 ? 0 : value / total);
}
function rounded(value: number): number {
  return Number(value.toFixed(6));
}
function portableRelative(value: string): string {
  if (value.includes("\\") || path.posix.isAbsolute(value)) {
    throw failure("EVAVO_TILE_MAP_QA_PATH", `path must be forward-slash relative: ${value}`);
  }
  const normalized = path.posix.normalize(value);
  if (
    normalized !== value ||
    normalized === "." ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    normalized.includes("//")
  ) {
    throw failure("EVAVO_TILE_MAP_QA_PATH", `unsafe relative path: ${value}`);
  }
  return normalized;
}
function absolutePath(value: unknown, label: string): string {
  const input = text(value, label);
  const resolved = path.resolve(input);
  if (resolved !== input) {
    throw failure("EVAVO_TILE_MAP_QA_PATH", `${label} must be absolute and normalized`);
  }
  return resolved;
}
function resolveInside(root: string, relative: string, label: string): string {
  const candidate = path.resolve(root, ...relative.split("/"));
  const relation = path.relative(root, candidate);
  if (relation === ".." || relation.startsWith(`..${path.sep}`) || path.isAbsolute(relation)) {
    throw failure("EVAVO_TILE_MAP_QA_PATH", `${label} escapes candidate root`);
  }
  return candidate;
}
function parseObject(content: string, label: string): JsonObject {
  try {
    return object(JSON.parse(content) as unknown, label);
  } catch (error) {
    if (error instanceof Error && "code" in error) throw error;
    throw failure("EVAVO_TILE_MAP_QA_JSON", `invalid JSON in ${label}`);
  }
}
function object(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw failure("EVAVO_TILE_MAP_QA_TYPE", `${label} must be object`);
  }
  return value as JsonObject;
}
function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw failure("EVAVO_TILE_MAP_QA_TYPE", `${label} must be array`);
  }
  return value;
}
function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw failure("EVAVO_TILE_MAP_QA_TYPE", `${label} must be non-empty string`);
  }
  return value;
}
function nullableText(value: unknown, label: string): string | null {
  if (value === null || value === undefined) return null;
  return text(value, label);
}
function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw failure("EVAVO_TILE_MAP_QA_TYPE", `${label} must be positive integer`);
  }
  return value as number;
}
function booleanValue(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw failure("EVAVO_TILE_MAP_QA_TYPE", `${label} must be boolean`);
  }
  return value;
}
function sha256Hex(value: unknown, label: string): string {
  const result = text(value, label).toLowerCase();
  if (!/^[0-9a-f]{64}$/u.test(result)) {
    throw failure("EVAVO_TILE_MAP_QA_HASH", `${label} must be SHA-256`);
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
