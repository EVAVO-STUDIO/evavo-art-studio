#!/usr/bin/env node
import { mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  LocalArtifactStore,
  sha256,
  type ArtifactId,
  type JsonValue,
} from "@evavo/art-artifacts";
import { writeGodotSpriteFramesImporter } from "@evavo/art-godot";
import { buildSpriteAtlasPackage } from "@evavo/art-media";
import { validateSpriteFamilyManifest } from "@evavo/art-sprite-family";
import type { ProviderRegistry } from "@evavo/art-providers";
import {
  LocalRuntimeRepository,
  PermanentRuntimeError,
  RuntimeWorker,
  type RuntimeJobHandler,
  type RuntimeRepository,
  type RuntimeWorkerRunResult,
} from "@evavo/art-runtime";

export {
  BOOK_ART_PROVIDER_RUNTIME_CONTRACT,
  BOOK_ART_PROVIDER_RUNTIME_SCHEMA_VERSION,
  compileBookArtProviderShadowJob,
  submitBookArtProviderShadowJob,
} from "./book-art-provider-jobs.js";
export type {
  BookArtProviderAdapterPolicyV1,
  BookArtProviderShadowJobCompilationResultV1,
  BookArtProviderShadowJobInputV1,
  BookArtProviderShadowJobPlanV1,
  BookArtProviderShadowJobSubmissionResultV1,
} from "./book-art-provider-jobs.js";

import {
  createDeterministicMirrorAwareFinalizerHandlers,
  deterministicMirrorAwareFinalizerWorkerCapabilities,
} from "./deterministic-mirror-handlers.js";
import {
  candidateMasteringWorkerCapabilities,
  createCandidateMasteringHandlers,
} from "./mastering-handlers.js";
import {
  createMirroredSpriteFamilyHandlers,
  mirroredSpriteFamilyWorkerCapabilities,
} from "./mirrored-sprite-family-handlers.js";
import {
  createProviderHandlers,
  createProviderRegistryFromEnvironment,
  providerWorkerCapabilities,
  providerWorkerCapabilityProfiles,
} from "./provider-handlers.js";
import {
  createTargetedRepairHandlers,
  targetedRepairWorkerCapabilities,
} from "./repair-handlers.js";
import {
  createRepairedFamilyRevisionHandlers,
  repairedFamilyRevisionWorkerCapabilities,
} from "./revision-handlers.js";
import {
  createRepairedFamilySelectionHandlers,
  repairedFamilySelectionWorkerCapabilities,
} from "./revision-selection-handlers.js";
import {
  candidateSelectionWorkerCapabilities,
  createCandidateSelectionHandlers,
} from "./selection-handlers.js";
import {
  createSpriteSupervisorHandlers,
  spriteSupervisorWorkerCapabilities,
} from "./sprite-supervisor-guarded-handlers.js";

const isRecord = (
  value: unknown,
): value is Readonly<Record<string, JsonValue>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function requiredString(value: JsonValue | undefined, name: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new PermanentRuntimeError(
      "RUNTIME_HANDLER_PAYLOAD_INVALID",
      `${name} must be a non-empty string.`,
    );
  }
  return value.trim();
}

function envInteger(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}.`);
  }
  return value;
}

function envList(name: string): string[] {
  return (process.env[name] ?? "")
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

async function createDirectoryWithinRoots(
  candidate: string,
  roots: readonly string[],
  name: string,
): Promise<string> {
  const lexical = path.resolve(candidate);
  const canonicalRoots = await Promise.all(
    roots.map((root) => realpath(path.resolve(root))),
  );
  if (!canonicalRoots.some((root) => isWithin(root, lexical))) {
    throw new PermanentRuntimeError(
      "RUNTIME_HANDLER_PATH_REJECTED",
      `${name} is outside EVAVO_ART_ALLOWED_ROOTS.`,
    );
  }
  await mkdir(lexical, { recursive: true });
  const canonical = await realpath(lexical);
  if (!canonicalRoots.some((root) => isWithin(root, canonical))) {
    throw new PermanentRuntimeError(
      "RUNTIME_HANDLER_PATH_REJECTED",
      `${name} resolves outside EVAVO_ART_ALLOWED_ROOTS.`,
    );
  }
  return canonical;
}

async function assertExistingPathWithinRoots(
  candidate: string,
  roots: readonly string[],
  name: string,
): Promise<string> {
  const resolved = await realpath(path.resolve(candidate));
  const canonicalRoots = await Promise.all(
    roots.map((root) => realpath(path.resolve(root))),
  );
  if (!canonicalRoots.some((root) => isWithin(root, resolved))) {
    throw new PermanentRuntimeError(
      "RUNTIME_HANDLER_PATH_REJECTED",
      `${name} resolves outside EVAVO_ART_ALLOWED_ROOTS.`,
    );
  }
  return resolved;
}

async function ingestFile(
  context: Parameters<RuntimeJobHandler>[0],
  filePath: string,
  mediaType: string,
  storageClass: "runtime" | "manifest" | "evidence" | "source",
  labels: Readonly<Record<string, string>>,
  sourceArtifacts: readonly ArtifactId[] = [],
): Promise<ArtifactId> {
  const artifact = await context.putArtifact(await readFile(filePath), {
    mediaType,
    storageClass,
    fileName: path.basename(filePath),
    sourceArtifacts,
    labels,
    metadata: { generatedPath: filePath },
  });
  return artifact.artifactId;
}

const ARTIFACT_ID = /^artifact_[a-f0-9]{64}$/u;

function requiredArtifactId(value: JsonValue | undefined, name: string): ArtifactId {
  if (typeof value !== "string" || !ARTIFACT_ID.test(value)) {
    throw new PermanentRuntimeError(
      "RUNTIME_HANDLER_PAYLOAD_INVALID",
      `${name} must use artifact_<sha256> format.`,
    );
  }
  return value as ArtifactId;
}

async function verifiedStoredArtifact(
  context: Parameters<RuntimeJobHandler>[0],
  artifactId: ArtifactId,
  label: string,
) {
  const [artifact, verification] = await Promise.all([
    context.artifacts.get(artifactId),
    context.artifacts.verify(artifactId),
  ]);
  if (
    !artifact ||
    !verification.exists ||
    !verification.descriptorValid ||
    !verification.contentValid
  ) {
    throw new PermanentRuntimeError(
      "RUNTIME_HANDLER_ARTIFACT_INVALID",
      `${label} failed immutable artifact verification: ${artifactId}`,
    );
  }
  return artifact;
}

function jsonObject(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new PermanentRuntimeError(
      "RUNTIME_HANDLER_PAYLOAD_INVALID",
      `${label} must contain one JSON object.`,
    );
  }
  return value as Record<string, unknown>;
}

async function parsedJsonArtifact(
  context: Parameters<RuntimeJobHandler>[0],
  artifactId: ArtifactId,
  label: string,
): Promise<Readonly<{ artifact: Awaited<ReturnType<typeof verifiedStoredArtifact>>; body: Record<string, unknown> }>> {
  const artifact = await verifiedStoredArtifact(context, artifactId, label);
  if (artifact.mediaType !== "application/json") {
    throw new PermanentRuntimeError(
      "RUNTIME_HANDLER_ARTIFACT_MEDIA_INVALID",
      `${label} must be application/json.`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse((await context.artifacts.read(artifactId)).toString("utf8"));
  } catch {
    throw new PermanentRuntimeError(
      "RUNTIME_HANDLER_ARTIFACT_JSON_INVALID",
      `${label} is not valid JSON.`,
    );
  }
  return { artifact, body: jsonObject(parsed, label) };
}

function atlasSafeId(value: string, fallback: string): string {
  const result = value
    .replace(/[^A-Za-z0-9._-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 128);
  return result && /^[A-Za-z0-9]/u.test(result) ? result : fallback;
}

async function buildAtlasFromVerifiedFamily(
  context: Parameters<RuntimeJobHandler>[0],
  payload: Readonly<Record<string, JsonValue>>,
  allowedRoots: readonly string[],
) {
  const manifestArtifactId = requiredArtifactId(
    payload.familyManifestArtifactId,
    "familyManifestArtifactId",
  );
  const evidenceArtifactId = requiredArtifactId(
    payload.familyEvidenceArtifactId,
    "familyEvidenceArtifactId",
  );
  const declaredInputs = new Set(context.job.spec.inputArtifacts);
  for (const artifactId of [manifestArtifactId, evidenceArtifactId]) {
    if (!declaredInputs.has(artifactId)) {
      throw new PermanentRuntimeError(
        "ATLAS_FAMILY_INPUT_LINEAGE_MISSING",
        `sprite.atlas.build inputArtifacts is missing ${artifactId}.`,
      );
    }
  }

  const manifestArtifact = await parsedJsonArtifact(
    context,
    manifestArtifactId,
    "family manifest",
  );
  if (
    manifestArtifact.artifact.storageClass !== "manifest" ||
    manifestArtifact.artifact.labels.artifactRole !==
      "sprite-family-normalized-manifest"
  ) {
    throw new PermanentRuntimeError(
      "ATLAS_FAMILY_MANIFEST_STATE_INVALID",
      "familyManifestArtifactId must identify a normalized sprite-family manifest artifact.",
    );
  }
  const familyManifest = validateSpriteFamilyManifest(manifestArtifact.body);

  const evidenceArtifact = await parsedJsonArtifact(
    context,
    evidenceArtifactId,
    "family evidence",
  );
  if (
    evidenceArtifact.artifact.storageClass !== "evidence" ||
    evidenceArtifact.artifact.labels.artifactRole !==
      "sprite-family-consistency-evidence" ||
    evidenceArtifact.artifact.labels.qualityState !== "passed" ||
    evidenceArtifact.body.passed !== true ||
    evidenceArtifact.body.manifestArtifactId !== manifestArtifactId ||
    !evidenceArtifact.artifact.sourceArtifacts.includes(manifestArtifactId)
  ) {
    throw new PermanentRuntimeError(
      "ATLAS_FAMILY_EVIDENCE_STATE_INVALID",
      "familyEvidenceArtifactId must be one passed manifest-bound sprite-family consistency artifact.",
    );
  }

  const frameEvidenceRaw = evidenceArtifact.body.frameEvidence;
  if (!Array.isArray(frameEvidenceRaw) || frameEvidenceRaw.length !== familyManifest.frames.length) {
    throw new PermanentRuntimeError(
      "ATLAS_FAMILY_EVIDENCE_FRAME_SET_INVALID",
      "Family evidence frame set does not match the normalized family manifest.",
    );
  }
  const evidenceByFrame = new Map<string, Record<string, unknown>>();
  for (const [index, raw] of frameEvidenceRaw.entries()) {
    const item = jsonObject(raw, `family evidence frameEvidence[${index}]`);
    if (typeof item.frameId !== "string" || item.passed !== true) {
      throw new PermanentRuntimeError(
        "ATLAS_FAMILY_EVIDENCE_FRAME_INVALID",
        "Every family evidence frame must identify a passed frame.",
      );
    }
    evidenceByFrame.set(item.frameId, item);
  }

  const outputDirectory = requiredString(
    payload.outputDirectory,
    "outputDirectory",
  );
  const canonicalOutput = await createDirectoryWithinRoots(
    outputDirectory,
    allowedRoots,
    "outputDirectory",
  );
  const workspace = path.join(
    canonicalOutput,
    ".evavo-family-atlas-" +
      sha256(manifestArtifactId + evidenceArtifactId).slice(0, 16),
  );
  await rm(workspace, { recursive: true, force: true });
  await mkdir(workspace, { recursive: true });

  const sourceArtifactIds: ArtifactId[] = [
    manifestArtifactId,
    evidenceArtifactId,
  ];
  const atlasFrames: Array<{
    id: string;
    path: string;
    pivot: { x: number; y: number };
    tags: string[];
  }> = [];
  const animationGroups = new Map<
    string,
    Array<{ frameId: string; durationMs: number; sourceFrameIndex: number }>
  >();

  try {
    for (const [index, frame] of familyManifest.frames.entries()) {
      const evidence = evidenceByFrame.get(frame.id);
      const compositeValue = evidence?.generatedCompositeArtifactId;
      const compositeId = requiredArtifactId(
        typeof compositeValue === "string" ? compositeValue : undefined,
        `frameEvidence[${frame.id}].generatedCompositeArtifactId`,
      );
      if (!declaredInputs.has(compositeId)) {
        throw new PermanentRuntimeError(
          "ATLAS_FAMILY_INPUT_LINEAGE_MISSING",
          `sprite.atlas.build inputArtifacts is missing verified composite ${compositeId}.`,
        );
      }
      const composite = await verifiedStoredArtifact(
        context,
        compositeId,
        `verified family composite ${frame.id}`,
      );
      if (
        composite.mediaType !== "image/png" ||
        composite.labels.artifactRole !== "layered-frame-composite" ||
        composite.labels.qualityState !== "passed"
      ) {
        throw new PermanentRuntimeError(
          "ATLAS_FAMILY_COMPOSITE_STATE_INVALID",
          `Verified composite ${frame.id} is not one quality-passed layered-frame-composite PNG.`,
        );
      }
      sourceArtifactIds.push(compositeId);
      const atlasFrameId = "frame-" + String(index).padStart(4, "0");
      const fileName = atlasFrameId + ".png";
      await writeFile(
        path.join(workspace, fileName),
        await context.artifacts.read(compositeId),
      );
      atlasFrames.push({
        id: atlasFrameId,
        path: fileName,
        pivot: frame.pivot,
        tags: [frame.animation, frame.direction, frame.id],
      });
      const groupName = atlasSafeId(
        frame.animation + "-" + frame.direction,
        "animation-" + String(animationGroups.size + 1),
      );
      const group = animationGroups.get(groupName) ?? [];
      group.push({
        frameId: atlasFrameId,
        durationMs: Math.max(1, Math.round(frame.durationMs)),
        sourceFrameIndex: frame.frameIndex,
      });
      animationGroups.set(groupName, group);
    }

    const loopFlag =
      typeof familyManifest.metadata === "object" &&
      familyManifest.metadata !== null &&
      !Array.isArray(familyManifest.metadata) &&
      (familyManifest.metadata as Record<string, JsonValue>).loop === true;
    const atlasId = atlasSafeId(
      typeof payload.atlasId === "string"
        ? payload.atlasId
        : familyManifest.familyId + "-atlas",
      "verified-family-atlas",
    );
    const atlasManifest = {
      schemaVersion: "1.0",
      atlasId,
      frames: atlasFrames,
      animations: [...animationGroups.entries()].map(([name, frames]) => ({
        name,
        loopMode: loopFlag ? "linear" : "none",
        frames: [...frames]
          .sort((left, right) => left.sourceFrameIndex - right.sourceFrameIndex)
          .map(({ frameId, durationMs }) => ({ frameId, durationMs })),
      })),
      settings: {
        alphaPolicy: "required",
        maximumWidth: 4096,
        maximumHeight: 4096,
        padding: 2,
        extrusion: 1,
        trim: false,
        alphaThreshold: 8,
        powerOfTwo: "preferred",
        textureFiltering: "nearest",
        pngCompressionLevel: 9,
      },
      output: {
        imageFileName: atlasId + ".png",
        dataFileName: atlasId + ".atlas.json",
        evidenceFileName: atlasId + ".evidence.json",
      },
    };
    const manifestPath = path.join(workspace, "atlas-manifest.json");
    await writeFile(
      manifestPath,
      JSON.stringify(atlasManifest, null, 2) + "\n",
      "utf8",
    );
    const atlas = await buildSpriteAtlasPackage(
      manifestPath,
      canonicalOutput,
      { allowedRoots },
    );
    return {
      atlas,
      sourceArtifactIds: [...new Set(sourceArtifactIds)].sort(),
      familyManifestArtifactId: manifestArtifactId,
      familyEvidenceArtifactId: evidenceArtifactId,
    };
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

export function createBuiltinHandlers(
  allowedRoots: readonly string[],
  providerRegistry: ProviderRegistry = createProviderRegistryFromEnvironment({}),
  runtime?: RuntimeRepository,
): Readonly<Record<string, RuntimeJobHandler>> {
  const atlasBuild: RuntimeJobHandler = async (context) => {
    if (!isRecord(context.job.spec.payload)) {
      throw new PermanentRuntimeError(
        "RUNTIME_HANDLER_PAYLOAD_INVALID",
        "sprite.atlas.build payload must be an object.",
      );
    }
    const payload = context.job.spec.payload;
    const familyMode =
      typeof payload.familyManifestArtifactId === "string" ||
      typeof payload.familyEvidenceArtifactId === "string";
    let atlas;
    let atlasSourceArtifacts: readonly ArtifactId[] = [];
    let familyBinding:
      | Readonly<{
          familyManifestArtifactId: ArtifactId;
          familyEvidenceArtifactId: ArtifactId;
        }>
      | undefined;
    if (familyMode) {
      const built = await buildAtlasFromVerifiedFamily(
        context,
        payload,
        allowedRoots,
      );
      atlas = built.atlas;
      atlasSourceArtifacts = built.sourceArtifactIds;
      familyBinding = {
        familyManifestArtifactId: built.familyManifestArtifactId,
        familyEvidenceArtifactId: built.familyEvidenceArtifactId,
      };
    } else {
      const manifestPath = requiredString(payload.manifestPath, "manifestPath");
      const outputDirectory = requiredString(
        payload.outputDirectory,
        "outputDirectory",
      );
      atlas = await buildSpriteAtlasPackage(manifestPath, outputDirectory, {
        allowedRoots,
      });
    }
    const outputArtifacts: ArtifactId[] = [];
    outputArtifacts.push(
      await ingestFile(context, atlas.imagePath, "image/png", "runtime", {
        atlasId: atlas.packageData.atlasId,
        artifactRole: "atlas-image",
        ...(familyBinding
          ? { familyEvidenceArtifactId: familyBinding.familyEvidenceArtifactId }
          : {}),
      }, atlasSourceArtifacts),
      await ingestFile(
        context,
        atlas.dataPath,
        "application/json",
        "manifest",
        {
          atlasId: atlas.packageData.atlasId,
          artifactRole: "atlas-data",
        },
      ),
      await ingestFile(
        context,
        atlas.evidencePath,
        "application/json",
        "evidence",
        {
          atlasId: atlas.packageData.atlasId,
          artifactRole: "atlas-evidence",
        },
      ),
    );

    let godot:
      | Awaited<ReturnType<typeof writeGodotSpriteFramesImporter>>
      | undefined;
    if (
      typeof payload.godotProjectPath === "string" &&
      payload.godotProjectPath.trim()
    ) {
      const projectPath = await assertExistingPathWithinRoots(
        payload.godotProjectPath,
        allowedRoots,
        "godotProjectPath",
      );
      godot = await writeGodotSpriteFramesImporter(atlas, projectPath);
      outputArtifacts.push(
        await ingestFile(
          context,
          godot.descriptorPath,
          "application/json",
          "manifest",
          {
            atlasId: atlas.packageData.atlasId,
            artifactRole: "godot-descriptor",
          },
        ),
        await ingestFile(
          context,
          godot.importerPath,
          "text/x-gdscript",
          "source",
          {
            atlasId: atlas.packageData.atlasId,
            artifactRole: "godot-importer",
          },
        ),
      );
    }

    return {
      outputArtifacts,
      result: {
        atlasId: atlas.packageData.atlasId,
        atlasImageSha256: atlas.packageData.atlasImage.sha256,
        atlasDataSha256: atlas.atlasDataSha256,
        frameCount: atlas.packageData.frames.length,
        animationCount: atlas.packageData.animations.length,
        imagePath: atlas.imagePath,
        dataPath: atlas.dataPath,
        evidencePath: atlas.evidencePath,
        ...(familyBinding
          ? {
              familyManifestArtifactId:
                familyBinding.familyManifestArtifactId,
              familyEvidenceArtifactId:
                familyBinding.familyEvidenceArtifactId,
              sourceArtifactCount: atlasSourceArtifacts.length,
            }
          : {}),
        ...(godot
          ? {
              godotDescriptorPath: godot.descriptorPath,
              godotImporterPath: godot.importerPath,
              godotResourcePath: godot.resourcePath,
              nativeResourceCreated: false,
            }
          : {}),
      },
    };
  };

  return Object.freeze({
    "sprite.atlas.build": atlasBuild,
    ...createProviderHandlers(providerRegistry),
    ...createCandidateMasteringHandlers(),
    ...createDeterministicMirrorAwareFinalizerHandlers(),
    ...createCandidateSelectionHandlers(),
    ...createMirroredSpriteFamilyHandlers(),
    ...createTargetedRepairHandlers(providerRegistry),
    ...createRepairedFamilyRevisionHandlers(),
    ...createRepairedFamilySelectionHandlers(),
    ...(runtime ? createSpriteSupervisorHandlers(runtime) : {}),
  });
}

async function sleep(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, milliseconds);
    timer.unref?.();
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

async function main(): Promise<void> {
  const command = process.argv[2] ?? "once";
  if (!new Set(["once", "until-idle", "daemon"]).has(command)) {
    throw new Error("Worker command must be once, until-idle or daemon.");
  }
  const allowedRoots = envList("EVAVO_ART_ALLOWED_ROOTS");
  const roots = allowedRoots.length ? allowedRoots : [process.cwd()];
  const runtimeRoot = path.resolve(
    process.env.EVAVO_ART_RUNTIME_ROOT ?? ".art-studio/runtime",
  );
  const artifactRoot = path.resolve(
    process.env.EVAVO_ART_ARTIFACT_ROOT ?? ".art-studio/artifacts",
  );
  const concurrency = envInteger("EVAVO_ART_WORKER_CONCURRENCY", 1, 1, 64);
  const pollMs = envInteger("EVAVO_ART_WORKER_POLL_MS", 1_000, 50, 60_000);
  const workerId =
    process.env.EVAVO_ART_WORKER_ID?.trim() ||
    `${hostname().replace(/[^A-Za-z0-9._:-]+/g, "-")}:${process.pid}`;
  const configuredQueues = envList("EVAVO_ART_WORKER_QUEUES");
  const providerRegistry = createProviderRegistryFromEnvironment();
  const providerCapabilities = providerWorkerCapabilities(providerRegistry);
  const providerCapabilityProfiles =
    providerWorkerCapabilityProfiles(providerRegistry);
  const masteringCapabilities = candidateMasteringWorkerCapabilities();
  const adaptiveCapabilities =
    deterministicMirrorAwareFinalizerWorkerCapabilities();
  const selectionCapabilities = candidateSelectionWorkerCapabilities();
  const familyCapabilities = mirroredSpriteFamilyWorkerCapabilities();
  const repairCapabilities = targetedRepairWorkerCapabilities(providerRegistry);
  const revisionCapabilities = repairedFamilyRevisionWorkerCapabilities();
  const revisionSelectionCapabilities =
    repairedFamilySelectionWorkerCapabilities();
  const supervisorCapabilities = spriteSupervisorWorkerCapabilities();
  const defaultQueues = [
    "control",
    "media",
    "selection",
    ...(providerRegistry.list().length ? ["provider"] : []),
  ];
  const runtime = new LocalRuntimeRepository({ root: runtimeRoot });
  const artifacts = new LocalArtifactStore({ root: artifactRoot });
  const worker = new RuntimeWorker({
    runtime,
    artifacts,
    worker: {
      id: workerId,
      capabilities: [
        "atlas.pack",
        "media.raster",
        "godot.export",
        "evidence.bundle",
        ...supervisorCapabilities,
        ...masteringCapabilities,
        ...adaptiveCapabilities,
        ...selectionCapabilities,
        ...familyCapabilities,
        ...repairCapabilities,
        ...revisionCapabilities,
        ...revisionSelectionCapabilities,
        ...providerCapabilities,
      ],
      ...(providerCapabilityProfiles.length
        ? { capabilityProfiles: providerCapabilityProfiles }
        : {}),
      queues: configuredQueues.length ? configuredQueues : defaultQueues,
    },
    handlers: createBuiltinHandlers(roots, providerRegistry, runtime),
    concurrency,
  });

  const emit = (result: RuntimeWorkerRunResult): void => {
    process.stdout.write(
      `${JSON.stringify({
        service: "evavo-art-studio-worker",
        workerId,
        command,
        providerAdapters: providerRegistry.list().map((entry) => ({
          id: entry.id,
          version: entry.version,
          models: entry.models,
          capabilities: entry.capabilities,
        })),
        ...result,
      })}\n`,
    );
  };

  if (command === "once") {
    emit(await worker.runOnce());
    return;
  }
  if (command === "until-idle") {
    emit(await worker.runUntilIdle());
    return;
  }

  const controller = new AbortController();
  const stop = (): void => controller.abort();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  while (!controller.signal.aborted) {
    const result = await worker.runOnce();
    emit(result);
    if (result.claimed === 0) await sleep(pollMs, controller.signal);
  }
}

const isEntryPoint =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isEntryPoint) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `${JSON.stringify({
        error: {
          code: "EVAVO_ART_WORKER_ERROR",
          message: error instanceof Error ? error.message : String(error),
        },
      })}\n`,
    );
    process.exitCode = 1;
  });
}
