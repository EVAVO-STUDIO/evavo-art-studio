import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import {
  normalizeJson,
  type ArtifactId,
  type StoredArtifact,
} from "@evavo/art-artifacts";
import {
  runGodotSpriteFramesImport,
  toGodotResourcePath,
  writeGodotSpriteFramesImporter,
} from "@evavo/art-godot";
import { buildSpriteAtlasPackage } from "@evavo/art-media";
import {
  validateSpriteFamilyManifest,
  type NormalizedSpriteFamilyManifest,
} from "@evavo/art-sprite-family";
import {
  PermanentRuntimeError,
  type RuntimeJobHandler,
} from "@evavo/art-runtime";

const ARTIFACT_ID = /^artifact_[a-f0-9]{64}$/u;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const REQUIRED_CAPABILITIES = Object.freeze([
  "sprite.family.deliver",
  "media.atlas-build",
  "atlas.pack",
  "evidence.bundle",
] as const);
const GODOT_CAPABILITIES = Object.freeze([
  "godot.spriteframes-build",
  "godot.export",
] as const);

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(code: string, message: string): never {
  throw new PermanentRuntimeError(code, message);
}

function requiredString(
  value: unknown,
  name: string,
  maximum = 4096,
): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > maximum ||
    value.includes("\0")
  ) {
    fail(
      "SPRITE_FAMILY_DELIVERY_PAYLOAD_INVALID",
      `${name} must be a non-empty bounded string.`,
    );
  }
  return value.trim();
}

function artifactId(value: unknown, name: string): ArtifactId {
  const result = requiredString(value, name, 80);
  if (!ARTIFACT_ID.test(result)) {
    fail(
      "SPRITE_FAMILY_DELIVERY_PAYLOAD_INVALID",
      `${name} must use artifact_<sha256> format.`,
    );
  }
  return result as ArtifactId;
}

function boundedInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
  name: string,
): number {
  const result = value === undefined ? fallback : value;
  if (
    typeof result !== "number" ||
    !Number.isInteger(result) ||
    result < minimum ||
    result > maximum
  ) {
    fail(
      "SPRITE_FAMILY_DELIVERY_PAYLOAD_INVALID",
      `${name} must be an integer from ${minimum} to ${maximum}.`,
    );
  }
  return result;
}

function booleanValue(
  value: unknown,
  fallback: boolean,
  name: string,
): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") {
    fail(
      "SPRITE_FAMILY_DELIVERY_PAYLOAD_INVALID",
      `${name} must be boolean.`,
    );
  }
  return value;
}

function safeToken(value: string, maximum = 128): string {
  const normalized = value
    .replace(/[^A-Za-z0-9._-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, maximum);
  if (!normalized || !SAFE_ID.test(normalized)) {
    fail(
      "SPRITE_FAMILY_DELIVERY_ID_INVALID",
      `Value cannot be normalized to a safe atlas identifier: ${value}`,
    );
  }
  return normalized;
}

function safeRelativeDirectory(
  value: unknown,
  fallback: string,
  name: string,
): string {
  const raw =
    value === undefined
      ? fallback
      : requiredString(value, name, 1024).replace(/\\/gu, "/");
  if (
    raw.startsWith("/") ||
    /^[A-Za-z]:/u.test(raw) ||
    raw.split("/").some((part) => !part || part === "." || part === "..")
  ) {
    fail(
      "SPRITE_FAMILY_DELIVERY_PATH_INVALID",
      `${name} must be one safe relative directory path.`,
    );
  }
  return raw;
}

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

async function canonicalAllowedRoots(
  roots: readonly string[],
): Promise<readonly string[]> {
  if (!roots.length) {
    fail(
      "SPRITE_FAMILY_DELIVERY_ROOT_MISSING",
      "At least one EVAVO allowed root is required for family delivery.",
    );
  }
  const result = await Promise.all(
    roots.map(async (root) => {
      const resolved = await realpath(path.resolve(root));
      const info = await lstat(resolved);
      if (!info.isDirectory() || info.isSymbolicLink()) {
        fail(
          "SPRITE_FAMILY_DELIVERY_ROOT_INVALID",
          `Allowed root must be a real directory: ${root}`,
        );
      }
      return resolved;
    }),
  );
  return [...new Set(result)];
}

async function canonicalPathInsideRoots(
  value: string,
  roots: readonly string[],
  name: string,
): Promise<string> {
  let resolved: string;
  try {
    resolved = await realpath(path.resolve(value));
  } catch (error: unknown) {
    fail(
      "SPRITE_FAMILY_DELIVERY_PATH_INVALID",
      `${name} could not be resolved: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!roots.some((root) => isWithin(root, resolved))) {
    fail(
      "SPRITE_FAMILY_DELIVERY_PATH_FORBIDDEN",
      `${name} resolves outside EVAVO_ART_ALLOWED_ROOTS.`,
    );
  }
  return resolved;
}

function ensureCapabilities(
  required: readonly string[],
  context: Parameters<RuntimeJobHandler>[0],
): void {
  for (const capability of required) {
    if (!context.job.spec.requiredCapabilities.includes(capability)) {
      fail(
        "SPRITE_FAMILY_DELIVERY_CAPABILITY_MISSING",
        `sprite.family.deliver job must require ${capability}.`,
      );
    }
  }
}

function ensureDeclaredInputs(
  required: readonly ArtifactId[],
  context: Parameters<RuntimeJobHandler>[0],
): void {
  const declared = new Set(context.job.spec.inputArtifacts);
  const missing = [...new Set(required)].filter(
    (entry) => !declared.has(entry),
  );
  if (missing.length) {
    fail(
      "SPRITE_FAMILY_DELIVERY_INPUT_LINEAGE_MISSING",
      `sprite.family.deliver inputArtifacts is missing: ${missing.join(", ")}`,
    );
  }
}

async function verifiedArtifact(
  id: ArtifactId,
  context: Parameters<RuntimeJobHandler>[0],
  role: string,
): Promise<StoredArtifact> {
  const [artifact, verification] = await Promise.all([
    context.artifacts.get(id),
    context.artifacts.verify(id),
  ]);
  if (
    !artifact ||
    !verification.exists ||
    !verification.descriptorValid ||
    !verification.contentValid
  ) {
    fail(
      "SPRITE_FAMILY_DELIVERY_ARTIFACT_INVALID",
      `${role} failed immutable verification: ${id}`,
    );
  }
  return artifact;
}

async function jsonArtifact(
  id: ArtifactId,
  context: Parameters<RuntimeJobHandler>[0],
  role: string,
): Promise<Readonly<{ artifact: StoredArtifact; body: unknown }>> {
  const artifact = await verifiedArtifact(id, context, role);
  if (artifact.mediaType !== "application/json") {
    fail(
      "SPRITE_FAMILY_DELIVERY_ARTIFACT_INVALID",
      `${role} must be JSON: ${id}`,
    );
  }
  try {
    return {
      artifact,
      body: JSON.parse(
        (await context.artifacts.read(id)).toString("utf8"),
      ) as unknown,
    };
  } catch {
    fail(
      "SPRITE_FAMILY_DELIVERY_ARTIFACT_INVALID",
      `${role} is not valid JSON: ${id}`,
    );
  }
}

function compositeIds(value: unknown): readonly ArtifactId[] {
  if (!Array.isArray(value) || !value.length || value.length > 4096) {
    fail(
      "SPRITE_FAMILY_DELIVERY_PAYLOAD_INVALID",
      "familyCompositeArtifactIds must contain 1 to 4096 artifact IDs.",
    );
  }
  const values = value.map((entry, index) =>
    artifactId(entry, `familyCompositeArtifactIds[${index}]`),
  );
  if (new Set(values).size !== values.length) {
    fail(
      "SPRITE_FAMILY_DELIVERY_PAYLOAD_INVALID",
      "familyCompositeArtifactIds may not contain duplicates.",
    );
  }
  return values;
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  const a = [...left].sort();
  const b = [...right].sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

interface DeliveryPayload {
  readonly familyManifestArtifactId: ArtifactId;
  readonly familyEvidenceArtifactId: ArtifactId;
  readonly familyCompositeArtifactIds: readonly ArtifactId[];
  readonly atlas: Readonly<{
    atlasId: string;
    maximumWidth: number;
    maximumHeight: number;
    padding: number;
    extrusion: number;
    trim: boolean;
    powerOfTwo: "required" | "preferred" | "not-required";
    textureFiltering: "nearest" | "linear";
    pngCompressionLevel: number;
    loopMode: "none" | "linear" | "ping-pong";
  }>;
  readonly godot?: Readonly<{
    projectPath: string;
    outputRelativeDirectory: string;
    runImporter: boolean;
    timeoutMs: number;
  }>;
}

function parsePayload(value: unknown): DeliveryPayload {
  if (!isRecord(value) || value.schemaVersion !== "1.0") {
    fail(
      "SPRITE_FAMILY_DELIVERY_PAYLOAD_INVALID",
      'sprite.family.deliver payload must use schemaVersion "1.0".',
    );
  }
  const atlasInput = isRecord(value.atlas) ? value.atlas : {};
  const atlasId = safeToken(
    requiredString(
      atlasInput.atlasId,
      "atlas.atlasId",
      128,
    ),
  );
  const powerOfTwo =
    atlasInput.powerOfTwo === undefined
      ? "preferred"
      : atlasInput.powerOfTwo;
  if (
    powerOfTwo !== "required" &&
    powerOfTwo !== "preferred" &&
    powerOfTwo !== "not-required"
  ) {
    fail(
      "SPRITE_FAMILY_DELIVERY_PAYLOAD_INVALID",
      "atlas.powerOfTwo is invalid.",
    );
  }
  const textureFiltering =
    atlasInput.textureFiltering === undefined
      ? "nearest"
      : atlasInput.textureFiltering;
  if (textureFiltering !== "nearest" && textureFiltering !== "linear") {
    fail(
      "SPRITE_FAMILY_DELIVERY_PAYLOAD_INVALID",
      "atlas.textureFiltering is invalid.",
    );
  }
  const loopMode =
    atlasInput.loopMode === undefined ? "linear" : atlasInput.loopMode;
  if (
    loopMode !== "none" &&
    loopMode !== "linear" &&
    loopMode !== "ping-pong"
  ) {
    fail(
      "SPRITE_FAMILY_DELIVERY_PAYLOAD_INVALID",
      "atlas.loopMode is invalid.",
    );
  }

  let godot: DeliveryPayload["godot"];
  if (value.godot !== undefined) {
    if (!isRecord(value.godot)) {
      fail(
        "SPRITE_FAMILY_DELIVERY_PAYLOAD_INVALID",
        "godot must be an object when supplied.",
      );
    }
    godot = {
      projectPath: requiredString(
        value.godot.projectPath,
        "godot.projectPath",
      ),
      outputRelativeDirectory: safeRelativeDirectory(
        value.godot.outputRelativeDirectory,
        "generated/evavo-art",
        "godot.outputRelativeDirectory",
      ),
      runImporter: booleanValue(
        value.godot.runImporter,
        false,
        "godot.runImporter",
      ),
      timeoutMs: boundedInteger(
        value.godot.timeoutMs,
        120_000,
        1_000,
        600_000,
        "godot.timeoutMs",
      ),
    };
  }

  return {
    familyManifestArtifactId: artifactId(
      value.familyManifestArtifactId,
      "familyManifestArtifactId",
    ),
    familyEvidenceArtifactId: artifactId(
      value.familyEvidenceArtifactId,
      "familyEvidenceArtifactId",
    ),
    familyCompositeArtifactIds: compositeIds(
      value.familyCompositeArtifactIds,
    ),
    atlas: {
      atlasId,
      maximumWidth: boundedInteger(
        atlasInput.maximumWidth,
        4096,
        16,
        16384,
        "atlas.maximumWidth",
      ),
      maximumHeight: boundedInteger(
        atlasInput.maximumHeight,
        4096,
        16,
        16384,
        "atlas.maximumHeight",
      ),
      padding: boundedInteger(
        atlasInput.padding,
        2,
        0,
        128,
        "atlas.padding",
      ),
      extrusion: boundedInteger(
        atlasInput.extrusion,
        1,
        0,
        32,
        "atlas.extrusion",
      ),
      trim: booleanValue(atlasInput.trim, true, "atlas.trim"),
      powerOfTwo,
      textureFiltering,
      pngCompressionLevel: boundedInteger(
        atlasInput.pngCompressionLevel,
        9,
        0,
        9,
        "atlas.pngCompressionLevel",
      ),
      loopMode,
    },
    ...(godot ? { godot } : {}),
  };
}

function quantizedDurations(
  frames: readonly NormalizedSpriteFamilyManifest["frames"][number][],
): readonly number[] {
  let cumulative = 0;
  let emitted = 0;
  return frames.map((frame) => {
    cumulative += frame.durationMs;
    const target = Math.round(cumulative);
    const duration = Math.max(1, target - emitted);
    emitted += duration;
    return duration;
  });
}

function atlasFrameId(index: number): string {
  return `frame-${String(index).padStart(4, "0")}`;
}

function animationId(animation: string, direction: string): string {
  return safeToken(`${animation}-${direction}`);
}

async function assertFamilyArtifacts(
  payload: DeliveryPayload,
  context: Parameters<RuntimeJobHandler>[0],
): Promise<
  Readonly<{
    manifest: NormalizedSpriteFamilyManifest;
    manifestArtifact: StoredArtifact;
    evidenceArtifact: StoredArtifact;
    composites: ReadonlyMap<string, StoredArtifact>;
  }>
> {
  ensureDeclaredInputs(
    [
      payload.familyManifestArtifactId,
      payload.familyEvidenceArtifactId,
      ...payload.familyCompositeArtifactIds,
    ],
    context,
  );

  const [{ artifact: manifestArtifact, body: manifestBody }, evidence] =
    await Promise.all([
      jsonArtifact(
        payload.familyManifestArtifactId,
        context,
        "family manifest",
      ),
      jsonArtifact(
        payload.familyEvidenceArtifactId,
        context,
        "family evidence",
      ),
    ]);

  if (
    manifestArtifact.storageClass !== "manifest" ||
    manifestArtifact.labels.artifactRole !==
      "sprite-family-normalized-manifest"
  ) {
    fail(
      "SPRITE_FAMILY_DELIVERY_MANIFEST_STATE_INVALID",
      "Family manifest does not have the normalized sprite-family manifest role.",
    );
  }
  if (
    evidence.artifact.storageClass !== "evidence" ||
    evidence.artifact.labels.artifactRole !==
      "sprite-family-consistency-evidence" ||
    evidence.artifact.labels.qualityState !== "passed"
  ) {
    fail(
      "SPRITE_FAMILY_DELIVERY_EVIDENCE_STATE_INVALID",
      "Family evidence must be one quality-passed sprite-family-consistency-evidence artifact.",
    );
  }

  const manifest = validateSpriteFamilyManifest(manifestBody);
  if (!isRecord(evidence.body)) {
    fail(
      "SPRITE_FAMILY_DELIVERY_EVIDENCE_INVALID",
      "Family evidence body must be an object.",
    );
  }
  if (
    evidence.body.passed !== true ||
    evidence.body.familyId !== manifest.familyId ||
    evidence.body.manifestArtifactId !==
      payload.familyManifestArtifactId ||
    !Array.isArray(evidence.body.generatedCompositeArtifactIds)
  ) {
    fail(
      "SPRITE_FAMILY_DELIVERY_EVIDENCE_INVALID",
      "Family evidence does not bind the supplied passed manifest/composites.",
    );
  }
  const evidenceCompositeIds = evidence.body.generatedCompositeArtifactIds.map(
    (entry, index) =>
      artifactId(
        entry,
        `familyEvidence.generatedCompositeArtifactIds[${index}]`,
      ),
  );
  if (
    !sameSet(
      evidenceCompositeIds,
      payload.familyCompositeArtifactIds,
    )
  ) {
    fail(
      "SPRITE_FAMILY_DELIVERY_COMPOSITE_SET_MISMATCH",
      "Supplied family composites differ from the manifest-bound family evidence.",
    );
  }

  const composites = new Map<string, StoredArtifact>();
  for (const compositeId of payload.familyCompositeArtifactIds) {
    const composite = await verifiedArtifact(
      compositeId,
      context,
      "family composite",
    );
    if (
      composite.mediaType !== "image/png" ||
      composite.labels.artifactRole !== "layered-frame-composite" ||
      composite.labels.qualityState !== "passed" ||
      composite.labels.familyId !== manifest.familyId ||
      typeof composite.labels.frameId !== "string"
    ) {
      fail(
        "SPRITE_FAMILY_DELIVERY_COMPOSITE_STATE_INVALID",
        `Family composite has an invalid role/state: ${compositeId}`,
      );
    }
    const frameId = composite.labels.frameId;
    if (composites.has(frameId)) {
      fail(
        "SPRITE_FAMILY_DELIVERY_COMPOSITE_DUPLICATE",
        `Multiple composites identify frame ${frameId}.`,
      );
    }
    composites.set(frameId, composite);
  }

  const manifestFrameIds = manifest.frames.map((frame) => frame.id);
  if (
    !sameSet(
      manifestFrameIds,
      [...composites.keys()],
    )
  ) {
    fail(
      "SPRITE_FAMILY_DELIVERY_FRAME_COVERAGE_INVALID",
      "Verified composites do not cover every manifest frame exactly once.",
    );
  }

  return {
    manifest,
    manifestArtifact,
    evidenceArtifact: evidence.artifact,
    composites,
  };
}

async function ingestFile(
  context: Parameters<RuntimeJobHandler>[0],
  filePath: string,
  mediaType: string,
  storageClass: "runtime" | "manifest" | "evidence" | "source",
  labels: Readonly<Record<string, string>>,
  sourceArtifacts: readonly ArtifactId[],
): Promise<ArtifactId> {
  const artifact = await context.putArtifact(await readFile(filePath), {
    mediaType,
    storageClass,
    fileName: path.basename(filePath),
    sourceArtifacts,
    labels,
    metadata: normalizeJson({
      generatedPath: filePath,
      sourceArtifactCount: sourceArtifacts.length,
    }),
  });
  return artifact.artifactId;
}

export function createFamilyDeliveryHandlers(
  allowedRoots: readonly string[],
): Readonly<Record<string, RuntimeJobHandler>> {
  const deliver: RuntimeJobHandler = async (context) => {
    const payload = parsePayload(context.job.spec.payload);
    ensureCapabilities(REQUIRED_CAPABILITIES, context);
    if (payload.godot) {
      ensureCapabilities(GODOT_CAPABILITIES, context);
    }

    const roots = await canonicalAllowedRoots(allowedRoots);
    const family = await assertFamilyArtifacts(payload, context);

    const workBase = path.join(
      roots[0]!,
      ".art-studio",
      "family-delivery",
    );
    await mkdir(workBase, { recursive: true });
    const staging = await mkdtemp(
      path.join(workBase, payload.atlas.atlasId + "-"),
    );
    let cleanupStaging = true;
    try {
      const frameDirectory = path.join(staging, "frames");
      await mkdir(frameDirectory, { recursive: true });

      const orderedFrames = [...family.manifest.frames].sort(
        (left, right) =>
          left.globalFrameIndex - right.globalFrameIndex ||
          left.id.localeCompare(right.id),
      );
      const atlasFrameIds = new Map<string, string>();
      for (let index = 0; index < orderedFrames.length; index += 1) {
        const frame = orderedFrames[index]!;
        const composite = family.composites.get(frame.id)!;
        const id = atlasFrameId(index);
        atlasFrameIds.set(frame.id, id);
        await writeFile(
          path.join(frameDirectory, id + ".png"),
          await context.artifacts.read(composite.artifactId),
        );
      }

      const groups = new Map<
        string,
        Array<NormalizedSpriteFamilyManifest["frames"][number]>
      >();
      for (const frame of orderedFrames) {
        const key = frame.animation + "\0" + frame.direction;
        const group = groups.get(key) ?? [];
        group.push(frame);
        groups.set(key, group);
      }

      const animations = [...groups.entries()]
        .map(([key, values]) => {
          const ordered = [...values].sort(
            (left, right) =>
              left.frameIndex - right.frameIndex ||
              left.globalFrameIndex - right.globalFrameIndex,
          );
          const durations = quantizedDurations(ordered);
          const [animation, direction] = key.split("\0");
          return {
            name: animationId(animation!, direction!),
            loopMode: payload.atlas.loopMode,
            frames: ordered.map((frame, index) => ({
              frameId: atlasFrameIds.get(frame.id)!,
              durationMs: durations[index]!,
            })),
          };
        })
        .sort((left, right) => left.name.localeCompare(right.name));

      const atlasManifest = {
        schemaVersion: "1.0",
        atlasId: payload.atlas.atlasId,
        frames: orderedFrames.map((frame, index) => ({
          id: atlasFrameIds.get(frame.id)!,
          path: path
            .relative(
              staging,
              path.join(frameDirectory, atlasFrameId(index) + ".png"),
            )
            .split(path.sep)
            .join("/"),
          pivot: frame.pivot,
          allowEmpty: false,
          tags: [frame.animation, frame.direction, frame.id],
        })),
        animations,
        settings: {
          alphaPolicy: "required",
          maximumWidth: payload.atlas.maximumWidth,
          maximumHeight: payload.atlas.maximumHeight,
          padding: payload.atlas.padding,
          extrusion: payload.atlas.extrusion,
          trim: payload.atlas.trim,
          alphaThreshold: 8,
          powerOfTwo: payload.atlas.powerOfTwo,
          textureFiltering: payload.atlas.textureFiltering,
          pngCompressionLevel: payload.atlas.pngCompressionLevel,
        },
        output: {
          imageFileName: payload.atlas.atlasId + ".png",
          dataFileName: payload.atlas.atlasId + ".atlas.json",
          evidenceFileName: payload.atlas.atlasId + ".evidence.json",
        },
      };
      const manifestPath = path.join(staging, "atlas-manifest.json");
      await writeFile(
        manifestPath,
        JSON.stringify(atlasManifest, null, 2) + "\n",
        "utf8",
      );

      let outputDirectory = path.join(staging, "output");
      let projectPath: string | undefined;
      if (payload.godot) {
        projectPath = await canonicalPathInsideRoots(
          payload.godot.projectPath,
          roots,
          "godot.projectPath",
        );
        outputDirectory = path.resolve(
          projectPath,
          payload.godot.outputRelativeDirectory,
          payload.atlas.atlasId,
        );
        if (!isWithin(projectPath, outputDirectory)) {
          fail(
            "SPRITE_FAMILY_DELIVERY_PATH_FORBIDDEN",
            "Godot output directory escaped the project root.",
          );
        }
        await mkdir(outputDirectory, { recursive: true });
      } else {
        await mkdir(outputDirectory, { recursive: true });
      }

      const atlas = await buildSpriteAtlasPackage(
        manifestPath,
        outputDirectory,
        {
          allowedRoots: roots,
        },
      );
      const sourceArtifacts = [
        payload.familyManifestArtifactId,
        payload.familyEvidenceArtifactId,
        ...payload.familyCompositeArtifactIds,
      ].sort() as readonly ArtifactId[];

      const outputArtifacts: ArtifactId[] = [];
      const atlasImageArtifactId = await ingestFile(
        context,
        atlas.imagePath,
        "image/png",
        "runtime",
        {
          artifactRole: "verified-family-atlas-image",
          atlasId: atlas.packageData.atlasId,
          familyId: family.manifest.familyId,
          qualityState: "passed",
        },
        sourceArtifacts,
      );
      outputArtifacts.push(atlasImageArtifactId);

      const atlasDataArtifactId = await ingestFile(
        context,
        atlas.dataPath,
        "application/json",
        "manifest",
        {
          artifactRole: "verified-family-atlas-data",
          atlasId: atlas.packageData.atlasId,
          familyId: family.manifest.familyId,
        },
        [atlasImageArtifactId, ...sourceArtifacts],
      );
      outputArtifacts.push(atlasDataArtifactId);

      const atlasEvidenceArtifactId = await ingestFile(
        context,
        atlas.evidencePath,
        "application/json",
        "evidence",
        {
          artifactRole: "verified-family-atlas-evidence",
          atlasId: atlas.packageData.atlasId,
          familyId: family.manifest.familyId,
          qualityState: "passed",
        },
        [atlasImageArtifactId, atlasDataArtifactId, ...sourceArtifacts],
      );
      outputArtifacts.push(atlasEvidenceArtifactId);

      let godot:
        | Readonly<{
            descriptorArtifactId: ArtifactId;
            importerArtifactId: ArtifactId;
            resourceArtifactId?: ArtifactId;
            resourcePath: string;
            importerExecuted: boolean;
          }>
        | undefined;

      if (payload.godot && projectPath) {
        const generated = await writeGodotSpriteFramesImporter(
          atlas,
          projectPath,
        );
        const descriptorArtifactId = await ingestFile(
          context,
          generated.descriptorPath,
          "application/json",
          "manifest",
          {
            artifactRole: "godot-spriteframes-descriptor",
            atlasId: atlas.packageData.atlasId,
            familyId: family.manifest.familyId,
          },
          [atlasDataArtifactId, atlasEvidenceArtifactId],
        );
        const importerArtifactId = await ingestFile(
          context,
          generated.importerPath,
          "text/x-gdscript",
          "source",
          {
            artifactRole: "godot-spriteframes-importer",
            atlasId: atlas.packageData.atlasId,
            familyId: family.manifest.familyId,
          },
          [descriptorArtifactId],
        );
        outputArtifacts.push(descriptorArtifactId, importerArtifactId);

        let resourceArtifactId: ArtifactId | undefined;
        if (payload.godot.runImporter) {
          const godotExecutable =
            process.env.EVAVO_GODOT_EXECUTABLE?.trim();
          if (!godotExecutable) {
            fail(
              "SPRITE_FAMILY_DELIVERY_GODOT_EXECUTABLE_MISSING",
              "godot.runImporter=true requires EVAVO_GODOT_EXECUTABLE. The payload may not select an executable.",
            );
          }
          await runGodotSpriteFramesImport({
            godotExecutable,
            projectPath,
            importerPath: toGodotResourcePath(
              projectPath,
              generated.importerPath,
            ),
            descriptorResourcePath: toGodotResourcePath(
              projectPath,
              generated.descriptorPath,
            ),
            timeoutMs: payload.godot.timeoutMs,
          });
          const resourceInfo = await lstat(generated.resourcePath);
          if (
            !resourceInfo.isFile() ||
            resourceInfo.isSymbolicLink()
          ) {
            fail(
              "SPRITE_FAMILY_DELIVERY_GODOT_RESOURCE_INVALID",
              "Godot importer did not create one regular SpriteFrames resource.",
            );
          }
          resourceArtifactId = await ingestFile(
            context,
            generated.resourcePath,
            "text/plain",
            "runtime",
            {
              artifactRole: "godot-spriteframes-resource",
              atlasId: atlas.packageData.atlasId,
              familyId: family.manifest.familyId,
              qualityState: "passed",
            },
            [
              atlasImageArtifactId,
              atlasDataArtifactId,
              descriptorArtifactId,
              importerArtifactId,
            ],
          );
          outputArtifacts.push(resourceArtifactId);
        }
        godot = {
          descriptorArtifactId,
          importerArtifactId,
          ...(resourceArtifactId
            ? { resourceArtifactId }
            : {}),
          resourcePath: generated.resourcePath,
          importerExecuted: payload.godot.runImporter,
        };
      }

      const deliveryEvidenceBody = normalizeJson({
        schemaVersion: "1.0",
        familyId: family.manifest.familyId,
        familyManifestArtifactId:
          payload.familyManifestArtifactId,
        familyEvidenceArtifactId:
          payload.familyEvidenceArtifactId,
        familyCompositeArtifactIds:
          payload.familyCompositeArtifactIds,
        atlas: {
          atlasId: atlas.packageData.atlasId,
          imageArtifactId: atlasImageArtifactId,
          dataArtifactId: atlasDataArtifactId,
          evidenceArtifactId: atlasEvidenceArtifactId,
          atlasImageSha256: atlas.packageData.atlasImage.sha256,
          atlasDataSha256: atlas.atlasDataSha256,
          frameCount: atlas.packageData.frames.length,
          animationCount: atlas.packageData.animations.length,
          frameIds: atlas.packageData.frames.map(
            (frame) => frame.id,
          ),
          deterministicBuilderVersion:
            atlas.packageData.builderVersion,
        },
        ...(godot ? { godot } : {}),
        proof: {
          sourceFamilyPassed: true,
          sourceCompositeSetExact: true,
          nativeAlphaRequired: true,
          rotationForbidden: true,
          textureFiltering: payload.atlas.textureFiltering,
          callerSelectedExecutable: false,
          localOnly: true,
        },
      });
      const deliveryEvidence = await context.putArtifact(
        JSON.stringify(deliveryEvidenceBody, null, 2) + "\n",
        {
          mediaType: "application/json",
          storageClass: "evidence",
          fileName:
            payload.atlas.atlasId +
            ".verified-family-delivery.json",
          sourceArtifacts: [...new Set(outputArtifacts)].sort(),
          labels: {
            artifactRole:
              "verified-family-delivery-evidence",
            familyId: family.manifest.familyId,
            atlasId: atlas.packageData.atlasId,
            qualityState: "passed",
            releaseReady: "true",
          },
          metadata: normalizeJson({
            frameCount: atlas.packageData.frames.length,
            animationCount:
              atlas.packageData.animations.length,
            godotRequested: Boolean(payload.godot),
            godotImporterExecuted:
              godot?.importerExecuted ?? false,
          }),
        },
      );
      outputArtifacts.push(deliveryEvidence.artifactId);

      if (!payload.godot) {
        cleanupStaging = true;
      }
      return {
        outputArtifacts,
        result: normalizeJson({
          schemaVersion: "1.0",
          familyId: family.manifest.familyId,
          atlasId: atlas.packageData.atlasId,
          atlasImageArtifactId,
          atlasDataArtifactId,
          atlasEvidenceArtifactId,
          deliveryEvidenceArtifactId:
            deliveryEvidence.artifactId,
          ...(godot ? { godot } : {}),
          outputDirectory:
            payload.godot ? outputDirectory : null,
          temporaryFilesRetained: Boolean(payload.godot),
        }),
      };
    } finally {
      if (cleanupStaging) {
        await rm(staging, {
          recursive: true,
          force: true,
        }).catch(() => undefined);
      }
    }
  };

  return Object.freeze({
    "sprite.family.deliver": deliver,
  });
}

export function familyDeliveryWorkerCapabilities(): readonly string[] {
  return [
    ...REQUIRED_CAPABILITIES,
    ...GODOT_CAPABILITIES,
  ].sort();
}
