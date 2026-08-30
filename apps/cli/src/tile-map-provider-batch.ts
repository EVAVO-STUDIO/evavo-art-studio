import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { compileProviderCandidateRuntimeContract } from "@evavo/art-providers";

type JsonObject = Record<string, unknown>;

type TileMapMasteringContract = {
  source_canvas_policy: "provider-adapter-derived";
  target_width: number;
  target_height: number;
  background_mode: "chroma-key" | "opaque-preserve";
  matte_colour: "#00ff00" | null;
  resampling: "lanczos3";
  delivery_profile_id: "godot-sprite-lossless";
  require_meaningful_alpha: boolean;
  require_fake_transparency_rejection: true;
  approval_authority: false;
};

export type TileMapProviderRuntimeBatch = {
  schema_version: 1;
  source_candidate_batch_sha256: string;
  source_candidate_batch_fingerprint: string;
  source_package_fingerprint: string;
  source_map_fingerprint: string;
  map_id: string;
  consumer_adapter: string | null;
  projection: string;
  jobs: Array<{
    candidate_id: string;
    task_id: string;
    visual_family: string;
    provider_family_id: string;
    output_path: string;
    mastering: TileMapMasteringContract;
    request_sha256: string;
    prompt_sha256: string;
    runtime_job_sha256: string;
    runtime_job: unknown;
  }>;
  authority: {
    semantic_authority: "tile-map-studio";
    provider_authority: "candidate-generation-only";
    mastering_authority: "art-studio-deterministic-unapproved";
    review_authority: "art-studio";
    approval_authority: "art-studio-explicit-review-only";
  };
  status: "ready-for-provider-runtime";
  provider_batch_fingerprint: string;
};

export async function compileTileMapProviderRuntimeBatch(
  candidateBatchPath: string,
): Promise<TileMapProviderRuntimeBatch> {
  const bytes = await readFile(candidateBatchPath);
  const batch = parseObject(bytes.toString("utf8"), candidateBatchPath);
  if (batch.schema_version !== 1 || batch.status !== "ready-for-provider-candidates") {
    throw failure(
      "EVAVO_TILE_MAP_PROVIDER_BATCH_SCHEMA",
      "candidate batch must be schema v1 and ready-for-provider-candidates",
    );
  }
  const sourceBatchFingerprint = sha256Hex(
    batch.batch_fingerprint,
    "candidate batch fingerprint",
  );
  const mapId = text(batch.map_id, "map_id");
  const projection = text(batch.projection, "projection");
  const consumer = nullableText(batch.consumer_adapter, "consumer_adapter");
  const sourcePackageFingerprint = sha256Hex(
    batch.source_package_fingerprint,
    "source_package_fingerprint",
  );
  const sourceMapFingerprint = sha256Hex(
    batch.source_map_fingerprint,
    "source_map_fingerprint",
  );

  const jobs = array(batch.jobs, "jobs").map((value, index) => {
    const row = object(value, `jobs[${index}]`);
    const candidateId = text(row.candidate_id, `jobs[${index}].candidate_id`);
    const taskId = text(row.task_id, `jobs[${index}].task_id`);
    const visualFamily = text(row.visual_family, `jobs[${index}].visual_family`);
    const providerFamilyId = providerSafeFamilyId(visualFamily);
    const outputPath = text(row.output_path, `jobs[${index}].output_path`);
    const dimensions = object(row.dimensions, `jobs[${index}].dimensions`);
    const width = positiveInteger(dimensions.width, `jobs[${index}].dimensions.width`);
    const height = positiveInteger(dimensions.height, `jobs[${index}].dimensions.height`);
    const semanticRules = stringArray(
      row.immutable_semantic_rules,
      `jobs[${index}].immutable_semantic_rules`,
    );
    const creativeDirection = stringArray(
      row.creative_direction,
      `jobs[${index}].creative_direction`,
    );
    const semanticSourceIds = stringArray(
      row.semantic_source_ids,
      `jobs[${index}].semantic_source_ids`,
    );
    const alphaRequired = booleanValue(
      row.alpha_required,
      `jobs[${index}].alpha_required`,
    );
    if (row.provider_authority !== "intermediate-only") {
      throw failure(
        "EVAVO_TILE_MAP_PROVIDER_AUTHORITY",
        `${candidateId} provider_authority must remain intermediate-only`,
      );
    }
    const topology =
      row.topology === null
        ? null
        : object(row.topology, `${candidateId}.topology`);
    const featureKind =
      row.feature_kind === null
        ? null
        : text(row.feature_kind, `${candidateId}.feature_kind`);
    const seed = Number.parseInt(
      sha256(Buffer.from(candidateId, "utf8")).slice(0, 8),
      16,
    );
    const creativeIntent = creativeDirection.join(" ");
    const mastering = masteringContract(width, height, alphaRequired);
    const mustHave = [
      ...semanticRules,
      `Projection must remain ${projection}.`,
      `Compose for a final mastered canvas of exactly ${width}x${height} pixels.`,
      "Retain clean large-scale forms that survive deterministic downsampling to native game resolution.",
      ...(alphaRequired
        ? [
            "Use the declared high-chroma matte only as a removable production background; do not paint green into the asset.",
          ]
        : ["Produce a fully opaque asset with no transparency." ]),
    ];
    const mustAvoid = [
      "Do not add text, labels, logos, UI, watermarks, signatures or gameplay symbols not present in the semantic contract.",
      "Do not alter collision, navigation, terrain identity, network connectivity, footprint or semantic edge shape through artwork.",
      "Do not imitate generic AI-art noise, evenly distributed procedural detail or unrelated decorative clutter.",
      "Do not fake pixel detail by adding high-frequency speckle that collapses at native tile size.",
    ];
    const providerBackground = alphaRequired
      ? ({ strategy: "chroma-key" as const, matteColour: "#00ff00" })
      : ({ strategy: "opaque-source" as const });
    const request = {
      schemaVersion: "1.0" as const,
      requestId: candidateId,
      operation: "generate" as const,
      assetKind: "environment" as const,
      continuityPhase: "independent" as const,
      assetId: taskId,
      candidateFamilyId: providerFamilyId,
      creativeIntent,
      negativeIntent: mustAvoid.join(" "),
      style: {
        styleName: `Tile Map Studio ${visualFamily}`,
        intent: creativeIntent,
        mustHave,
        mustAvoid,
        identityLocks: semanticRules,
        palette: [],
        lineTreatment: [],
        materials: [],
        cameraRules: [`Use the declared ${projection} projection only.`],
        compositionRules: [
          `Compose for deterministic mastering to ${width}x${height} pixels.`,
          "Preserve readable topology and silhouette at native game scale.",
          "Keep major forms separated and avoid sub-pixel clutter.",
        ],
        eraRules: creativeDirection,
      },
      shot: {
        subject: visualFamily,
        include: semanticSourceIds,
        exclude: mustAvoid,
        framing: [
          `Final mastered asset is exactly ${width}x${height} pixels.`,
          "Provider source resolution may be larger but must preserve the exact target aspect ratio.",
          featureKind ? `Feature kind: ${featureKind}.` : "Tile family asset.",
        ],
      },
      target: {
        width,
        height,
        transparency: alphaRequired
          ? ("required" as const)
          : ("opaque" as const),
        outputFormat: "png" as const,
      },
      background: providerBackground,
      quality: "high" as const,
      candidateCount: 1,
      seed,
      selection: {
        allowFallback: true,
        requireSeed: true,
      },
      metadata: {
        schema: "evavo.tile-map-provider-metadata.v1",
        candidateId,
        taskId,
        visualFamily,
        providerFamilyId,
        outputPath,
        sourceCandidateBatchFingerprint: sourceBatchFingerprint,
        sourcePackageFingerprint,
        sourceMapFingerprint,
        mapId,
        consumerAdapter: consumer,
        projection,
        semanticSourceIds,
        immutableSemanticRules: semanticRules,
        topology,
        featureKind,
        mastering,
        providerAuthority: "candidate-generation-only",
        reviewRequired: true,
        approvalAuthority: false,
      },
    };
    const contract = compileProviderCandidateRuntimeContract(request);
    return {
      candidate_id: candidateId,
      task_id: taskId,
      visual_family: visualFamily,
      provider_family_id: providerFamilyId,
      output_path: outputPath,
      mastering,
      request_sha256: contract.requestSha256,
      prompt_sha256: contract.compiledPromptSha256,
      runtime_job_sha256: sha256(
        Buffer.from(canonical(contract.runtimeJob), "utf8"),
      ),
      runtime_job: contract.runtimeJob,
    };
  });

  const ids = new Set<string>();
  for (const job of jobs) {
    if (ids.has(job.candidate_id)) {
      throw failure(
        "EVAVO_TILE_MAP_PROVIDER_DUPLICATE",
        `duplicate provider candidate id: ${job.candidate_id}`,
      );
    }
    ids.add(job.candidate_id);
  }
  jobs.sort(
    (a, b) =>
      a.visual_family.localeCompare(b.visual_family) ||
      a.candidate_id.localeCompare(b.candidate_id),
  );

  const base = {
    schema_version: 1 as const,
    source_candidate_batch_sha256: sha256(bytes),
    source_candidate_batch_fingerprint: sourceBatchFingerprint,
    source_package_fingerprint: sourcePackageFingerprint,
    source_map_fingerprint: sourceMapFingerprint,
    map_id: mapId,
    consumer_adapter: consumer,
    projection,
    jobs,
    authority: {
      semantic_authority: "tile-map-studio" as const,
      provider_authority: "candidate-generation-only" as const,
      mastering_authority: "art-studio-deterministic-unapproved" as const,
      review_authority: "art-studio" as const,
      approval_authority: "art-studio-explicit-review-only" as const,
    },
    status: "ready-for-provider-runtime" as const,
  };
  return {
    ...base,
    provider_batch_fingerprint: sha256(
      Buffer.from(canonical(base), "utf8"),
    ),
  };
}

function masteringContract(
  width: number,
  height: number,
  alphaRequired: boolean,
): TileMapMasteringContract {
  return {
    source_canvas_policy: "provider-adapter-derived",
    target_width: width,
    target_height: height,
    background_mode: alphaRequired ? "chroma-key" : "opaque-preserve",
    matte_colour: alphaRequired ? "#00ff00" : null,
    resampling: "lanczos3",
    delivery_profile_id: "godot-sprite-lossless",
    require_meaningful_alpha: alphaRequired,
    require_fake_transparency_rejection: true,
    approval_authority: false,
  };
}

function providerSafeFamilyId(value: string): string {
  return `tile-map-family-${sha256(Buffer.from(value, "utf8")).slice(0, 40)}`;
}
function parseObject(content: string, label: string): JsonObject {
  try {
    return object(JSON.parse(content) as unknown, label);
  } catch (error) {
    if (error instanceof Error && "code" in error) throw error;
    throw failure("EVAVO_TILE_MAP_PROVIDER_JSON", `invalid JSON in ${label}`);
  }
}
function object(value: unknown, path: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw failure("EVAVO_TILE_MAP_PROVIDER_TYPE", `${path} must be object`);
  }
  return value as JsonObject;
}
function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) {
    throw failure("EVAVO_TILE_MAP_PROVIDER_TYPE", `${path} must be array`);
  }
  return value;
}
function text(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw failure(
      "EVAVO_TILE_MAP_PROVIDER_TYPE",
      `${path} must be non-empty string`,
    );
  }
  return value;
}
function nullableText(value: unknown, path: string): string | null {
  if (value === null || value === undefined) return null;
  return text(value, path);
}
function positiveInteger(value: unknown, path: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw failure(
      "EVAVO_TILE_MAP_PROVIDER_TYPE",
      `${path} must be positive integer`,
    );
  }
  return value as number;
}
function booleanValue(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") {
    throw failure("EVAVO_TILE_MAP_PROVIDER_TYPE", `${path} must be boolean`);
  }
  return value;
}
function stringArray(value: unknown, path: string): string[] {
  const values = array(value, path).map((item, index) =>
    text(item, `${path}[${index}]`),
  );
  if (values.length === 0) {
    throw failure(
      "EVAVO_TILE_MAP_PROVIDER_TYPE",
      `${path} must not be empty`,
    );
  }
  return values;
}
function sha256Hex(value: unknown, path: string): string {
  const result = text(value, path).toLowerCase();
  if (!/^[0-9a-f]{64}$/u.test(result)) {
    throw failure("EVAVO_TILE_MAP_PROVIDER_HASH", `${path} must be SHA-256`);
  }
  return result;
}
function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
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
