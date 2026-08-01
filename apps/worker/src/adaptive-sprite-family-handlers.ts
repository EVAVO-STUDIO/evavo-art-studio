import {
  normalizeJson,
  type ArtifactId,
  type StoredArtifact,
} from "@evavo/art-artifacts";
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

interface AdaptiveProofLineage {
  readonly selectedSourceArtifactId: ArtifactId;
  readonly finalizedCandidateArtifactId: ArtifactId;
  readonly proofArtifactId: ArtifactId;
}

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
): Promise<StoredArtifact> {
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
  return proof;
}

async function findAdaptiveFinalization(
  sourceArtifactId: ArtifactId,
  context: Parameters<RuntimeJobHandler>[0],
): Promise<AdaptiveProofLineage> {
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
      const proofArtifactId = proofValue as ArtifactId;
      await assertProofArtifact(proofArtifactId, context);
      return {
        selectedSourceArtifactId: sourceArtifactId,
        finalizedCandidateArtifactId: artifact.artifactId,
        proofArtifactId,
      };
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
    if (!adaptiveRequired(manifest)) return base(context);

    const sourceIds = sourceArtifactIds(manifest);
    const lineage = await Promise.all(
      sourceIds.map((artifactId) =>
        findAdaptiveFinalization(artifactId, context),
      ),
    );
    const baseResult = await base(context);
    const proofArtifactIds = [
      ...new Set(lineage.map((entry) => entry.proofArtifactId)),
    ].sort();
    const evidenceBody = normalizeJson({
      schemaVersion: "1.0",
      familyId: manifest.familyId,
      adaptiveFinalizationPassed: true,
      selectedSourceCount: sourceIds.length,
      proofArtifactCount: proofArtifactIds.length,
      lineage,
      proofArtifactIds,
      baseOutputArtifactIds: baseResult.outputArtifacts,
      qualityThresholdsRelaxed: false,
    });
    const evidence = await context.putArtifact(
      `${JSON.stringify(evidenceBody, null, 2)}\n`,
      {
        mediaType: "application/json",
        storageClass: "evidence",
        fileName: `${manifest.familyId}.adaptive-family-proof.json`,
        sourceArtifacts: [
          ...new Set([
            ...sourceIds,
            ...lineage.map((entry) => entry.finalizedCandidateArtifactId),
            ...proofArtifactIds,
            ...baseResult.outputArtifacts,
          ]),
        ].sort(),
        labels: {
          artifactRole: "sprite-family-adaptive-proof-evidence",
          approvalState: "evidence-only",
          qualityState: "passed",
          releaseReady: "true",
          familyId: manifest.familyId,
        },
        metadata: normalizeJson({
          selectedSourceCount: sourceIds.length,
          proofArtifactCount: proofArtifactIds.length,
          qualityThresholdsRelaxed: false,
        }),
      },
    );
    return {
      outputArtifacts: [...baseResult.outputArtifacts, evidence.artifactId],
      result: normalizeJson({
        ...(isRecord(baseResult.result)
          ? baseResult.result
          : { baseResult: baseResult.result ?? null }),
        adaptiveProofEvidenceArtifactId: evidence.artifactId,
      }),
    };
  };
  return Object.freeze({ "sprite.family.verify": verify });
}

export function adaptiveSpriteFamilyWorkerCapabilities(): readonly string[] {
  return spriteFamilyWorkerCapabilities();
}
