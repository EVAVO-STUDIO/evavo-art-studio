import {
  normalizeJson,
  type ArtifactId,
  type JsonValue,
  type StoredArtifact,
} from "@evavo/art-artifacts";
import {
  finalizeDecodedSpriteFrame,
  type SpriteFinalizationRepairOptions,
} from "@evavo/art-finalizer";
import { decodeSpriteFrame } from "@evavo/art-quality";
import {
  PermanentRuntimeError,
  type RuntimeJobHandler,
} from "@evavo/art-runtime";

import {
  adaptiveFinalizerWorkerCapabilities,
  createAdaptiveFinalizerHandlers,
} from "./adaptive-finalizer-handlers.js";

const ARTIFACT_ID = /^artifact_[a-f0-9]{64}$/;

const isRecord = (
  value: JsonValue | undefined,
): value is Readonly<Record<string, JsonValue>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function requiredArtifactId(value: JsonValue | undefined): ArtifactId {
  if (typeof value !== "string" || !ARTIFACT_ID.test(value)) {
    throw new PermanentRuntimeError(
      "ADAPTIVE_FINALIZER_ARTIFACT_ID_INVALID",
      "candidateArtifactId must use artifact_<sha256> format.",
    );
  }
  return value as ArtifactId;
}

function integer(
  value: JsonValue | undefined,
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
    throw new PermanentRuntimeError(
      "ADAPTIVE_FINALIZER_PAYLOAD_INVALID",
      `${name} must be an integer between ${minimum} and ${maximum}.`,
    );
  }
  return result;
}

function repairOptions(
  payload: Readonly<Record<string, JsonValue>>,
): SpriteFinalizationRepairOptions {
  return {
    maximumPasses: integer(
      payload.maximumRepairPasses,
      2,
      0,
      8,
      "maximumRepairPasses",
    ),
    transparentBleedRadius: integer(
      payload.transparentBleedRadius,
      2,
      0,
      16,
      "transparentBleedRadius",
    ),
    matteSearchRadius: integer(
      payload.matteSearchRadius,
      6,
      1,
      32,
      "matteSearchRadius",
    ),
    matteDistanceThreshold: integer(
      payload.matteDistanceThreshold,
      72,
      1,
      441,
      "matteDistanceThreshold",
    ),
  };
}

function expectations(
  payload: Readonly<Record<string, JsonValue>>,
  frameId: string,
): unknown {
  const quality = isRecord(payload.quality) ? payload.quality : {};
  return {
    ...quality,
    frameId:
      typeof quality.frameId === "string" && quality.frameId.trim()
        ? quality.frameId.trim()
        : frameId,
  };
}

function guardedContext(
  context: Parameters<RuntimeJobHandler>[0],
  payload: Readonly<Record<string, JsonValue>>,
): Parameters<RuntimeJobHandler>[0] {
  return {
    ...context,
    job: {
      ...context.job,
      spec: {
        ...context.job.spec,
        payload: normalizeJson({
          ...payload,
          deliveryProfileId: "godot-sprite-lossless",
        }),
      },
    },
  };
}

async function verifiedOutput(
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
      "ADAPTIVE_FINALIZER_OUTPUT_VERIFICATION_FAILED",
      `Adaptive finalization output failed immutable verification: ${artifactId}`,
    );
  }
  return artifact;
}

function outputByRole(
  artifacts: readonly StoredArtifact[],
  role: string,
): StoredArtifact {
  const matches = artifacts.filter(
    (artifact) => artifact.labels.artifactRole === role,
  );
  if (matches.length !== 1) {
    throw new PermanentRuntimeError(
      "ADAPTIVE_FINALIZER_OUTPUT_CARDINALITY_INVALID",
      `Adaptive finalization expected exactly one ${role} artifact; found ${matches.length}.`,
    );
  }
  return matches[0]!;
}

async function normalizeSuccessfulLineage(
  context: Parameters<RuntimeJobHandler>[0],
  sourceId: ArtifactId,
  baseResult: Awaited<ReturnType<RuntimeJobHandler>>,
): Promise<Awaited<ReturnType<RuntimeJobHandler>>> {
  const artifacts = await Promise.all(
    baseResult.outputArtifacts.map((artifactId) =>
      verifiedOutput(artifactId, context),
    ),
  );
  const finalized = outputByRole(
    artifacts,
    "provider-candidate-alpha-master",
  );
  const proof = outputByRole(
    artifacts,
    "candidate-hostile-background-proof",
  );
  const baseEvidence = outputByRole(
    artifacts,
    "candidate-adaptive-finalization-evidence",
  );
  if (
    finalized.labels.finalizationReady !== "true" ||
    finalized.labels.adaptiveFinalized !== "true" ||
    finalized.labels.qualityState !== "passed" ||
    proof.labels.qualityState !== "passed" ||
    baseEvidence.labels.qualityState !== "passed"
  ) {
    throw new PermanentRuntimeError(
      "ADAPTIVE_FINALIZER_SUCCESS_STATE_INVALID",
      "A successful adaptive result did not contain passed candidate, proof, and evidence artifacts.",
    );
  }

  const envelopeBody = normalizeJson({
    schemaVersion: "1.0",
    sourceCandidateArtifactId: sourceId,
    baseFinalizedCandidateArtifactId: finalized.artifactId,
    proofArtifactId: proof.artifactId,
    baseEvidenceArtifactId: baseEvidence.artifactId,
    qualityState: "passed",
    finalizationReady: true,
    qualityThresholdsRelaxed: false,
    provenanceRule:
      "The envelope binds the mastered source, base finalized image, hostile-background proof, and base evidence. The normalized selected candidate points to this immutable envelope from its own ancestry.",
  });
  const envelope = await context.putArtifact(
    `${JSON.stringify(envelopeBody, null, 2)}\n`,
    {
      mediaType: "application/json",
      storageClass: "evidence",
      fileName: `${finalized.artifactId}.adaptive-finalization-envelope.json`,
      sourceArtifacts: [
        sourceId,
        finalized.artifactId,
        proof.artifactId,
        baseEvidence.artifactId,
      ],
      labels: {
        artifactRole: "candidate-adaptive-finalization-envelope",
        approvalState: "evidence-only",
        qualityState: "passed",
        finalizationReady: "true",
        sourceCandidateArtifactId: sourceId,
        baseFinalizedCandidateArtifactId: finalized.artifactId,
        proofArtifactId: proof.artifactId,
        baseEvidenceArtifactId: baseEvidence.artifactId,
      },
      metadata: normalizeJson({
        qualityThresholdsRelaxed: false,
        provenanceNormalized: true,
      }),
    },
  );

  const normalizedCandidate = await context.putArtifact(
    await context.artifacts.read(finalized.artifactId),
    {
      mediaType: finalized.mediaType,
      storageClass: "intermediate",
      ...(finalized.fileName === undefined
        ? {}
        : { fileName: finalized.fileName }),
      sourceArtifacts: [sourceId, envelope.artifactId],
      labels: {
        ...finalized.labels,
        proofArtifactId: proof.artifactId,
        finalizationEnvelopeArtifactId: envelope.artifactId,
        provenanceNormalized: "true",
      },
      metadata: normalizeJson({
        ...(isRecord(finalized.metadata) ? finalized.metadata : {}),
        baseFinalizedArtifactId: finalized.artifactId,
        proofArtifactId: proof.artifactId,
        baseEvidenceArtifactId: baseEvidence.artifactId,
        finalizationEnvelopeArtifactId: envelope.artifactId,
        provenanceRule:
          "The finalized candidate descends from the mastered source and an immutable envelope that binds its base finalized pixels, proof, and evidence.",
      }),
    },
  );

  return {
    outputArtifacts: [
      normalizedCandidate.artifactId,
      proof.artifactId,
      baseEvidence.artifactId,
      envelope.artifactId,
    ],
    result: normalizeJson({
      ...(isRecord(baseResult.result) ? baseResult.result : {}),
      sourceCandidateArtifactId: sourceId,
      finalizedCandidateArtifactId: normalizedCandidate.artifactId,
      baseFinalizedCandidateArtifactId: finalized.artifactId,
      proofArtifactId: proof.artifactId,
      baseEvidenceArtifactId: baseEvidence.artifactId,
      finalizationEnvelopeArtifactId: envelope.artifactId,
      evidenceArtifactId: envelope.artifactId,
      provenanceNormalized: true,
    }),
  };
}

export function createGuardedAdaptiveFinalizerHandlers(): Readonly<
  Record<string, RuntimeJobHandler>
> {
  const base = createAdaptiveFinalizerHandlers()[
    "art.candidate.finalize-adaptive"
  ];
  if (!base) {
    throw new Error("Base adaptive finalizer handler is unavailable.");
  }

  const guarded: RuntimeJobHandler = async (context) => {
    if (!isRecord(context.job.spec.payload)) return base(context);
    const payload = context.job.spec.payload;
    const sourceId = requiredArtifactId(payload.candidateArtifactId);
    if (!context.job.spec.inputArtifacts.includes(sourceId)) return base(context);

    const [source, verification] = await Promise.all([
      context.artifacts.get(sourceId),
      context.artifacts.verify(sourceId),
    ]);
    if (
      !source ||
      !verification.exists ||
      !verification.descriptorValid ||
      !verification.contentValid ||
      source.mediaType !== "image/png"
    ) {
      return base(context);
    }

    const decoded = await decodeSpriteFrame(await context.artifacts.read(sourceId));
    const result = finalizeDecodedSpriteFrame(
      decoded,
      expectations(
        payload,
        source.labels.frameId ?? source.artifactId,
      ),
      repairOptions(payload),
    );

    if (result.ready) {
      return normalizeSuccessfulLineage(
        context,
        sourceId,
        await base(context),
      );
    }

    // A strict runtime delivery profile may reject the still-failing image before
    // the base handler can persist its proof and repair-plan artifacts. Re-run
    // only that evidence path through the tolerant lossless sprite profile.
    // The candidate remains rejected and can never enter selection.
    return base(guardedContext(context, payload));
  };

  return Object.freeze({
    "art.candidate.finalize-adaptive": guarded,
  });
}

export function guardedAdaptiveFinalizerWorkerCapabilities(): readonly string[] {
  return adaptiveFinalizerWorkerCapabilities();
}
