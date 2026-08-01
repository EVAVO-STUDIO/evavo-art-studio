import {
  normalizeJson,
  type ArtifactId,
  type JsonValue,
  type StoredArtifact,
} from "@evavo/art-artifacts";
import {
  SpriteFamilyError,
  validateSpriteFamilyManifest,
  verifySpriteFamily,
} from "@evavo/art-sprite-family";
import {
  PermanentRuntimeError,
  type RuntimeJobHandler,
} from "@evavo/art-runtime";

const REQUIRED_CAPABILITIES = Object.freeze([
  "sprite.family.verify",
  "media.layer-compose",
  "selection.compare",
  "evidence.bundle",
] as const);
const ARTIFACT_ID = /^artifact_[a-f0-9]{64}$/;
const MAXIMUM_LINEAGE_DEPTH = 6;

function inputArtifactIds(input: unknown): readonly ArtifactId[] {
  const manifest = validateSpriteFamilyManifest(input);
  return [
    ...new Set(
      manifest.frames.flatMap((frame) => [
        ...frame.layers.map((layer) => layer.artifactId),
        ...(frame.declaredCompositeArtifactId
          ? [frame.declaredCompositeArtifactId]
          : []),
      ]),
    ),
  ].sort() as readonly ArtifactId[];
}

function familyFailure(error: SpriteFamilyError): PermanentRuntimeError {
  return new PermanentRuntimeError(error.code, error.message, error.details);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
      "SPRITE_FAMILY_FINALIZATION_ARTIFACT_INVALID",
      `Finalization artifact failed immutable verification: ${artifactId}`,
    );
  }
  return artifact;
}

async function finalizationLineage(
  artifactId: ArtifactId,
  context: Parameters<RuntimeJobHandler>[0],
): Promise<Readonly<{
  selectedArtifactId: ArtifactId;
  finalizedCandidateArtifactId: ArtifactId;
  backgroundMode: string;
}>> {
  const queue: Array<{ artifactId: ArtifactId; depth: number }> = [
    { artifactId, depth: 0 },
  ];
  const visited = new Set<ArtifactId>();
  while (queue.length) {
    const current = queue.shift()!;
    if (visited.has(current.artifactId)) continue;
    visited.add(current.artifactId);
    const artifact = await verifiedArtifact(current.artifactId, context);
    if (
      artifact.labels.finalizationReady === "true" &&
      artifact.labels.qualityState === "passed" &&
      artifact.labels.approvalState === "unapproved"
    ) {
      return {
        selectedArtifactId: artifactId,
        finalizedCandidateArtifactId: artifact.artifactId,
        backgroundMode: artifact.labels.backgroundMode ?? "unknown",
      };
    }
    if (current.depth >= MAXIMUM_LINEAGE_DEPTH) continue;
    for (const sourceArtifactId of artifact.sourceArtifacts) {
      queue.push({ artifactId: sourceArtifactId, depth: current.depth + 1 });
    }
  }
  throw new PermanentRuntimeError(
    "SPRITE_FAMILY_FINALIZATION_LINEAGE_MISSING",
    `Selected family source ${artifactId} has no verified finalization-ready candidate in its bounded lineage.`,
  );
}

function automaticFinalizationMetadata(
  manifest: ReturnType<typeof validateSpriteFamilyManifest>,
): Record<string, unknown> | null {
  if (!isRecord(manifest.metadata)) return null;
  const value = manifest.metadata.automaticFinalization;
  return isRecord(value) ? value : null;
}

function artifactIdsFromUnknown(value: unknown): readonly ArtifactId[] {
  if (typeof value === "string") {
    return ARTIFACT_ID.test(value) ? [value as ArtifactId] : [];
  }
  if (Array.isArray(value)) {
    return [...new Set(value.flatMap(artifactIdsFromUnknown))].sort();
  }
  if (!isRecord(value)) return [];
  return [
    ...new Set(Object.values(value).flatMap(artifactIdsFromUnknown)),
  ].sort();
}

async function storeFinalizationEvidence(
  manifest: ReturnType<typeof validateSpriteFamilyManifest>,
  result: Awaited<ReturnType<typeof verifySpriteFamily>>,
  context: Parameters<RuntimeJobHandler>[0],
): Promise<ArtifactId | undefined> {
  const metadata = automaticFinalizationMetadata(manifest);
  if (!metadata) return undefined;
  const lineage = await Promise.all(
    result.evidence.sourceArtifactIds.map((artifactId) =>
      finalizationLineage(artifactId, context),
    ),
  );
  const threeD = isRecord(metadata.threeD) ? metadata.threeD : null;
  const declaredThreeDArtifactIds = artifactIdsFromUnknown(threeD);
  const verifiedThreeD = await Promise.all(
    declaredThreeDArtifactIds.map(async (artifactId) => {
      const artifact = await verifiedArtifact(artifactId, context);
      return {
        artifactId: artifact.artifactId,
        descriptorSha256: artifact.descriptorSha256,
        contentSha256: artifact.contentSha256,
        mediaType: artifact.mediaType,
      };
    }),
  );
  const blockingFamilyFailures = [
    ...result.evidence.familyGates,
    ...result.evidence.frameEvidence.flatMap((frame) => frame.gates),
    ...result.evidence.frameEvidence.flatMap((frame) =>
      frame.layers.flatMap((layer) => layer.gates),
    ),
  ].filter((gate) => gate.blocking && gate.status === "fail");
  if (!result.evidence.passed || blockingFamilyFailures.length) {
    throw new PermanentRuntimeError(
      "SPRITE_FAMILY_FINALIZATION_BLOCKED",
      "Family finalization cannot pass while any blocking family, frame, or layer gate fails.",
      normalizeJson({
        blockingFailures: blockingFamilyFailures.map((gate) => ({
          id: gate.id,
          message: gate.message,
        })),
      }),
    );
  }
  const body = normalizeJson({
    schemaVersion: "1.0",
    protocolVersion: metadata.protocolVersion ?? null,
    familyId: result.evidence.familyId,
    releaseReady: true,
    manifestArtifactId: result.manifestArtifactId,
    kernelEvidenceArtifactId: result.kernelEvidenceArtifactId,
    familyEvidenceArtifactId: result.evidenceArtifactId,
    generatedCompositeArtifactIds: result.generatedCompositeArtifactIds,
    background: metadata.background ?? null,
    deliveryProfileId: metadata.deliveryProfileId ?? null,
    requireHostileMatteProof: metadata.requireHostileMatteProof ?? null,
    requireNoRejectedArtifacts: metadata.requireNoRejectedArtifacts ?? null,
    requireExactDimensions: metadata.requireExactDimensions ?? null,
    selectedSourceLineage: lineage,
    threeD: {
      declaration: threeD,
      verifiedArtifacts: verifiedThreeD,
    },
    proof: {
      familyPassed: result.evidence.passed,
      passedFrames: result.evidence.frameEvidence.filter((frame) => frame.passed)
        .length,
      frameCount: result.evidence.frameEvidence.length,
      blockingFailureCount: blockingFamilyFailures.length,
      everySelectedSourceFinalized: true,
      everyDeclaredThreeDArtifactVerified: true,
      fakeTransparencyRemainsBlocking: true,
      qualityThresholdsRelaxed: false,
    },
  });
  const sourceArtifacts = [
    result.manifestArtifactId,
    result.kernelEvidenceArtifactId,
    result.evidenceArtifactId,
    ...result.generatedCompositeArtifactIds,
    ...result.evidence.sourceArtifactIds,
    ...declaredThreeDArtifactIds,
  ].filter((value): value is ArtifactId => value !== undefined);
  const stored = await context.putArtifact(
    `${JSON.stringify(body, null, 2)}\n`,
    {
      mediaType: "application/json",
      storageClass: "evidence",
      fileName: `${result.evidence.familyId}.sprite-family.finalization.json`,
      sourceArtifacts: [...new Set(sourceArtifacts)].sort(),
      labels: {
        artifactRole: "sprite-family-finalization-evidence",
        approvalState: "evidence-only",
        qualityState: "passed",
        releaseReady: "true",
        familyId: result.evidence.familyId,
      },
      metadata: normalizeJson({
        manifestSha256: result.evidence.manifestSha256,
        selectedSourceCount: lineage.length,
        threeDArtifactCount: verifiedThreeD.length,
        generatedCompositeCount: result.generatedCompositeArtifactIds.length,
      }),
    },
  );
  return stored.artifactId;
}

export function createSpriteFamilyHandlers(): Readonly<
  Record<string, RuntimeJobHandler>
> {
  const verify: RuntimeJobHandler = async (context) => {
    let manifest;
    try {
      manifest = validateSpriteFamilyManifest(context.job.spec.payload);
    } catch (error: unknown) {
      if (error instanceof SpriteFamilyError) throw familyFailure(error);
      throw error;
    }
    for (const capability of REQUIRED_CAPABILITIES) {
      if (!context.job.spec.requiredCapabilities.includes(capability)) {
        throw new PermanentRuntimeError(
          "SPRITE_FAMILY_RUNTIME_CAPABILITY_MISSING",
          `sprite.family.verify job must require ${capability}.`,
        );
      }
    }
    const declaredInputs = new Set<ArtifactId>(context.job.spec.inputArtifacts);
    const missing = inputArtifactIds(manifest).filter(
      (artifactId) => !declaredInputs.has(artifactId),
    );
    if (missing.length) {
      throw new PermanentRuntimeError(
        "SPRITE_FAMILY_RUNTIME_INPUT_LINEAGE_MISSING",
        `sprite.family.verify inputArtifacts is missing: ${missing.join(", ")}`,
      );
    }
    try {
      const result = await verifySpriteFamily(manifest, {
        artifacts: context.artifacts,
      });
      const manifestArtifactId = result.manifestArtifactId;
      const kernelEvidenceArtifactId = result.kernelEvidenceArtifactId;
      if (
        manifestArtifactId === undefined ||
        kernelEvidenceArtifactId === undefined ||
        result.evidence.manifestArtifactId !== manifestArtifactId ||
        result.evidence.kernelEvidenceArtifactId !== kernelEvidenceArtifactId
      ) {
        throw new PermanentRuntimeError(
          "SPRITE_FAMILY_MANIFEST_EVIDENCE_MISSING",
          "Public sprite-family verification did not return a manifest-bound evidence result.",
          normalizeJson({
            manifestArtifactId: manifestArtifactId ?? null,
            kernelEvidenceArtifactId: kernelEvidenceArtifactId ?? null,
            evidenceManifestArtifactId:
              result.evidence.manifestArtifactId ?? null,
            evidenceKernelArtifactId:
              result.evidence.kernelEvidenceArtifactId ?? null,
          }),
        );
      }
      if (!result.evidence.passed) {
        throw new PermanentRuntimeError(
          "SPRITE_FAMILY_BLOCKING_GATES_FAILED",
          "Layered sprite family failed one or more blocking consistency gates.",
          normalizeJson({
            manifestArtifactId,
            evidenceArtifactId: result.evidenceArtifactId,
            generatedCompositeArtifactIds: result.generatedCompositeArtifactIds,
          }),
        );
      }
      const finalizationEvidenceArtifactId = await storeFinalizationEvidence(
        manifest,
        result,
        context,
      );
      return {
        outputArtifacts: [
          manifestArtifactId,
          ...result.generatedCompositeArtifactIds,
          result.evidenceArtifactId,
          ...(finalizationEvidenceArtifactId
            ? [finalizationEvidenceArtifactId]
            : []),
        ],
        result: normalizeJson({
          ...result,
          ...(finalizationEvidenceArtifactId
            ? { finalizationEvidenceArtifactId }
            : {}),
        }),
      };
    } catch (error: unknown) {
      if (error instanceof SpriteFamilyError) throw familyFailure(error);
      throw error;
    }
  };
  return Object.freeze({
    "sprite.family.verify": verify,
  });
}

export function spriteFamilyWorkerCapabilities(): readonly string[] {
  return [...REQUIRED_CAPABILITIES];
}
