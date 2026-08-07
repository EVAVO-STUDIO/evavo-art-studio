#!/usr/bin/env node
import { readFile, realpath } from "node:fs/promises";
import { hostname } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  LocalArtifactStore,
  type ArtifactId,
  type JsonValue,
} from "@evavo/art-artifacts";
import { writeGodotSpriteFramesImporter } from "@evavo/art-godot";
import { buildSpriteAtlasPackage } from "@evavo/art-media";
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
): Promise<ArtifactId> {
  const artifact = await context.putArtifact(await readFile(filePath), {
    mediaType,
    storageClass,
    fileName: path.basename(filePath),
    labels,
    metadata: { generatedPath: filePath },
  });
  return artifact.artifactId;
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
    const manifestPath = requiredString(payload.manifestPath, "manifestPath");
    const outputDirectory = requiredString(
      payload.outputDirectory,
      "outputDirectory",
    );
    const atlas = await buildSpriteAtlasPackage(manifestPath, outputDirectory, {
      allowedRoots,
    });
    const outputArtifacts: ArtifactId[] = [];
    outputArtifacts.push(
      await ingestFile(context, atlas.imagePath, "image/png", "runtime", {
        atlasId: atlas.packageData.atlasId,
        artifactRole: "atlas-image",
      }),
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
