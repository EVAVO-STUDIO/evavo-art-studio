import {
  normalizeJson,
  type ArtifactId,
  type JsonValue,
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

type ConcreteRuntimeHandlerResult = Readonly<{
  outputArtifacts: readonly ArtifactId[];
  result?: JsonValue;
}>;

interface AdaptiveProofLineage {
  readonly selectedSourceArtifactId: ArtifactId;
  readonly finalizedCandidateArtifactId: ArtifactId;
  readonly proofArtifactId: ArtifactId;
  readonly envelopeArtifactId: ArtifactId;
  readonly baseFinalizedCandidateArtifactId: ArtifactId;
  readonly baseEvidenceArtifactId: ArtifactId;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireBaseResult(
  value: Awaited<ReturnType<RuntimeJobHandler>>,
): ConcreteRuntimeHandlerResult {
  if (!value || value.outputArtifacts === undefined) {
    throw new PermanentRuntimeError(
      "ADAPTIVE_FAMILY_BASE_RESULT_MISSING",
      "The base sprite-family verifier returned no output artifact result.",
    );
  }
  return value as ConcreteRuntimeHandlerResult;
}

function requiredArtifactLabel(value: string | undefined, name: string): ArtifactId {
  if (value === undefined || !ARTIFACT_ID.test(value)) {
    throw new PermanentRuntimeError(
      "ADAPTIVE_FAMILY_ENVELOPE_LABEL_INVALID",
      `${name} must use artifact_<sha256> format.`,
    );
  }
  return value as ArtifactId;
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

async function assertEnvelopeArtifact(
  envelopeArtifactId: ArtifactId,
  candidate: StoredArtifact,
  proofArtifactId: ArtifactId,
  context: Parameters<RuntimeJobHandler>[0],
): Promise<Readonly<{
  baseFinalizedCandidateArtifactId: ArtifactId;
  baseEvidenceArtifactId: ArtifactId;
}>> {
  const envelope = await verifiedArtifact(envelopeArtifactId, context);
  if (
    envelope.mediaType !== "application/json" ||
    envelope.storageClass !== "evidence" ||
    envelope.labels.artifactRole !== "candidate-adaptive-finalization-envelope" ||
    envelope.labels.qualityState !== "passed" ||
    envelope.labels.finalizationReady !== "true"
  ) {
    throw new PermanentRuntimeError(
      "ADAPTIVE_FAMILY_ENVELOPE_ROLE_INVALID",
      `Adaptive finalization envelope has an invalid immutable role or state: ${envelopeArtifactId}`,
    );
  }
  if (
    candidate.labels.finalizationEnvelopeArtifactId !== envelopeArtifactId ||
    !candidate.sourceArtifacts.includes(envelopeArtifactId)
  ) {
    throw new PermanentRuntimeError(
      "ADAPTIVE_FAMILY_ENVELOPE_ANCESTRY_INVALID",
      "The normalized candidate must name the exact finalization envelope and retain it in source ancestry.",
    );
  }

  const sourceCandidateArtifactId = requiredArtifactLabel(
    envelope.labels.sourceCandidateArtifactId,
    "envelope.labels.sourceCandidateArtifactId",
  );
  const baseFinalizedCandidateArtifactId = requiredArtifactLabel(
    envelope.labels.baseFinalizedCandidateArtifactId,
    "envelope.labels.baseFinalizedCandidateArtifactId",
  );
  const labelledProofArtifactId = requiredArtifactLabel(
    envelope.labels.proofArtifactId,
    "envelope.labels.proofArtifactId",
  );
  const baseEvidenceArtifactId = requiredArtifactLabel(
    envelope.labels.baseEvidenceArtifactId,
    "envelope.labels.baseEvidenceArtifactId",
  );
  if (labelledProofArtifactId !== proofArtifactId) {
    throw new PermanentRuntimeError(
      "ADAPTIVE_FAMILY_ENVELOPE_PROOF_MISMATCH",
      "The candidate proof label and finalization envelope proof label do not match.",
    );
  }
  for (const artifactId of [
    sourceCandidateArtifactId,
    baseFinalizedCandidateArtifactId,
    proofArtifactId,
    baseEvidenceArtifactId,
  ]) {
    if (!envelope.sourceArtifacts.includes(artifactId)) {
      throw new PermanentRuntimeError(
        "ADAPTIVE_FAMILY_ENVELOPE_CLOSURE_INCOMPLETE",
        `The finalization envelope source closure is missing ${artifactId}.`,
      );
    }
  }

  const [baseFinalized, baseEvidence] = await Promise.all([
    verifiedArtifact(baseFinalizedCandidateArtifactId, context),
    verifiedArtifact(baseEvidenceArtifactId, context),
  ]);
  if (
    baseFinalized.mediaType !== "image/png" ||
    baseFinalized.labels.artifactRole !== "provider-candidate-alpha-master" ||
    baseFinalized.labels.qualityState !== "passed" ||
    baseFinalized.labels.finalizationReady !== "true"
  ) {
    throw new PermanentRuntimeError(
      "ADAPTIVE_FAMILY_BASE_FINALIZED_INVALID",
      "The envelope does not bind one passed finalization-ready base image.",
    );
  }
  if (
    baseEvidence.mediaType !== "application/json" ||
    baseEvidence.storageClass !== "evidence" ||
    baseEvidence.labels.artifactRole !==
      "candidate-adaptive-finalization-evidence" ||
    baseEvidence.labels.qualityState !== "passed"
  ) {
    throw new PermanentRuntimeError(
      "ADAPTIVE_FAMILY_BASE_EVIDENCE_INVALID",
      "The envelope does not bind one passed adaptive-finalization evidence artifact.",
    );
  }

  let body: unknown;
  try {
    body = JSON.parse(
      (await context.artifacts.read(envelopeArtifactId)).toString("utf8"),
    ) as unknown;
  } catch (error: unknown) {
    throw new PermanentRuntimeError(
      "ADAPTIVE_FAMILY_ENVELOPE_JSON_INVALID",
      `The finalization envelope could not be parsed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (
    !isRecord(body) ||
    body.sourceCandidateArtifactId !== sourceCandidateArtifactId ||
    body.baseFinalizedCandidateArtifactId !==
      baseFinalizedCandidateArtifactId ||
    body.proofArtifactId !== proofArtifactId ||
    body.baseEvidenceArtifactId !== baseEvidenceArtifactId ||
    body.finalizationReady !== true ||
    body.qualityThresholdsRelaxed !== false
  ) {
    throw new PermanentRuntimeError(
      "ADAPTIVE_FAMILY_ENVELOPE_BODY_MISMATCH",
      "The finalization envelope body does not match its immutable labels and release policy.",
    );
  }

  return {
    baseFinalizedCandidateArtifactId,
    baseEvidenceArtifactId,
  };
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
    const envelopeValue = artifact.labels.finalizationEnvelopeArtifactId;
    if (
      artifact.labels.adaptiveFinalized === "true" &&
      artifact.labels.finalizationReady === "true" &&
      artifact.labels.qualityState === "passed" &&
      artifact.labels.approvalState === "unapproved" &&
      artifact.labels.provenanceNormalized === "true" &&
      proofValue !== undefined &&
      ARTIFACT_ID.test(proofValue) &&
      envelopeValue !== undefined &&
      ARTIFACT_ID.test(envelopeValue)
    ) {
      const proofArtifactId = proofValue as ArtifactId;
      const envelopeArtifactId = envelopeValue as ArtifactId;
      await assertProofArtifact(proofArtifactId, context);
      const envelope = await assertEnvelopeArtifact(
        envelopeArtifactId,
        artifact,
        proofArtifactId,
        context,
      );
      return {
        selectedSourceArtifactId: sourceArtifactId,
        finalizedCandidateArtifactId: artifact.artifactId,
        proofArtifactId,
        envelopeArtifactId,
        baseFinalizedCandidateArtifactId:
          envelope.baseFinalizedCandidateArtifactId,
        baseEvidenceArtifactId: envelope.baseEvidenceArtifactId,
      };
    }
    if (current.depth >= MAXIMUM_LINEAGE_DEPTH) continue;
    for (const parent of artifact.sourceArtifacts) {
      queue.push({ artifactId: parent, depth: current.depth + 1 });
    }
  }
  throw new PermanentRuntimeError(
    "ADAPTIVE_FAMILY_FINALIZATION_LINEAGE_MISSING",
    `Selected family source has no envelope-bound adaptive finalization in bounded lineage: ${sourceArtifactId}`,
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
    const baseResult = requireBaseResult(await base(context));
    const proofArtifactIds = [
      ...new Set(lineage.map((entry) => entry.proofArtifactId)),
    ].sort();
    const envelopeArtifactIds = [
      ...new Set(lineage.map((entry) => entry.envelopeArtifactId)),
    ].sort();
    const evidenceBody = normalizeJson({
      schemaVersion: "1.0",
      familyId: manifest.familyId,
      adaptiveFinalizationPassed: true,
      selectedSourceCount: sourceIds.length,
      proofArtifactCount: proofArtifactIds.length,
      envelopeArtifactCount: envelopeArtifactIds.length,
      lineage,
      proofArtifactIds,
      envelopeArtifactIds,
      baseOutputArtifactIds: baseResult.outputArtifacts,
      everyEnvelopeVerified: true,
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
            ...lineage.map(
              (entry) => entry.baseFinalizedCandidateArtifactId,
            ),
            ...lineage.map((entry) => entry.baseEvidenceArtifactId),
            ...proofArtifactIds,
            ...envelopeArtifactIds,
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
          envelopeArtifactCount: envelopeArtifactIds.length,
          everyEnvelopeVerified: true,
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
