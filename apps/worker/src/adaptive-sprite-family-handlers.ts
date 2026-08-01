import type { ArtifactId, StoredArtifact } from "@evavo/art-artifacts";
import {
  SpriteFamilyError,
  validateSpriteFamilyManifest,
} from "@evavo/art-sprite-family";
import {
  PermanentRuntimeError,
  type RuntimeJobHandler,
} from "@evavo/art-runtime";

import {
  createSpriteFamilyHandlers,
  spriteFamilyWorkerCapabilities,
} from "./sprite-family-handlers.js";

const ARTIFACT_ID = /^artifact_[a-f0-9]{64}$/;
const MAXIMUM_LINEAGE_DEPTH = 10;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function adaptiveRequired(
  manifest: ReturnType<typeof validateSpriteFamilyManifest>,
): boolean {
  return (
    isRecord(manifest.metadata) &&
    isRecord(manifest.metadata.automaticFinalization)
  );
}

async function verifiedArtifact(
  artifactId: ArtifactId,
  context: Parameters<RuntimeJobHandler>[0],
): Promise<StoredArtifact> {
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
      "ADAPTIVE_FAMILY_LINEAGE_ARTIFACT_INVALID",
      `Adaptive family source failed immutable verification: ${artifactId}`,
    );
  }
  return artifact;
}

async function assertProofArtifact(
  proofArtifactId: ArtifactId,
  context: Parameters<RuntimeJobHandler>[0],
): Promise<void> {
  const proof = await verifiedArtifact(proofArtifactId, context);
  if (
    proof.mediaType !== "image/png" ||
    proof.storageClass !== "evidence" ||
    proof.labels.artifactRole !== "candidate-hostile-background-proof" ||
    proof.labels.qualityState !== "passed"
  ) {
    throw new PermanentRuntimeError(
      "ADAPTIVE_FAMILY_PROOF_ROLE_INVALID",
      `Adaptive proof artifact is not one passed hostile-background PNG: ${proofArtifactId}`,
    );
  }
}

async function findAdaptiveFinalization(
  sourceArtifactId: ArtifactId,
  context: Parameters<RuntimeJobHandler>[0],
): Promise<void> {
  const queue: Array<Readonly<{ artifactId: ArtifactId; depth: number }>> = [
    { artifactId: sourceArtifactId, depth: 0 },
  ];
  const visited = new Set<ArtifactId>();
  while (queue.length) {
    const current = queue.shift()!;
    if (visited.has(current.artifactId)) continue;
    visited.add(current.artifactId);
    const artifact = await verifiedArtifact(current.artifactId, context);
    const proofValue = artifact.labels.proofArtifactId;
    if (
      artifact.labels.adaptiveFinalized === "true" &&
      artifact.labels.finalizationReady === "true" &&
      artifact.labels.qualityState === "passed" &&
      artifact.labels.approvalState === "unapproved" &&
      proofValue !== undefined &&
      ARTIFACT_ID.test(proofValue)
    ) {
      await assertProofArtifact(proofValue as ArtifactId, context);
      return;
    }
    if (current.depth >= MAXIMUM_LINEAGE_DEPTH) continue;
    for (const parent of artifact.sourceArtifacts) {
      queue.push({ artifactId: parent, depth: current.depth + 1 });
    }
  }
  throw new PermanentRuntimeError(
    "ADAPTIVE_FAMILY_FINALIZATION_LINEAGE_MISSING",
    `Selected family source has no proof-backed adaptive finalization in bounded lineage: ${sourceArtifactId}`,
  );
}

function sourceArtifactIds(
  manifest: ReturnType<typeof validateSpriteFamilyManifest>,
): readonly ArtifactId[] {
  return [
    ...new Set(
      manifest.frames.flatMap((frame) => [
        ...frame.layers.map((layer) => layer.artifactId),
        ...(frame.declaredCompositeArtifactId
          ? [frame.declaredCompositeArtifactId]
          : []),
      ]),
    ),
  ].sort();
}

export function createAdaptiveSpriteFamilyHandlers(): Readonly<
  Record<string, RuntimeJobHandler>
> {
  const base = createSpriteFamilyHandlers()["sprite.family.verify"];
  if (!base) {
    throw new Error("Base sprite.family.verify handler is unavailable.");
  }
  const verify: RuntimeJobHandler = async (context) => {
    let manifest;
    try {
      manifest = validateSpriteFamilyManifest(context.job.spec.payload);
    } catch (error: unknown) {
      if (error instanceof SpriteFamilyError) {
        throw new PermanentRuntimeError(error.code, error.message, error.details);
      }
      throw error;
    }
    if (adaptiveRequired(manifest)) {
      await Promise.all(
        sourceArtifactIds(manifest).map((artifactId) =>
          findAdaptiveFinalization(artifactId, context),
        ),
      );
    }
    return base(context);
  };
  return Object.freeze({ "sprite.family.verify": verify });
}

export function adaptiveSpriteFamilyWorkerCapabilities(): readonly string[] {
  return spriteFamilyWorkerCapabilities();
}
