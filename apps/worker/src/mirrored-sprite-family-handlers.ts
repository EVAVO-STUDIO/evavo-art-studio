import {
  normalizeJson,
  type ArtifactId,
  type StoredArtifact,
} from "@evavo/art-artifacts";
import { decodeSpriteFrame } from "@evavo/art-quality";
import {
  SpriteFamilyError,
  validateSpriteFamilyManifest,
} from "@evavo/art-sprite-family";
import {
  PermanentRuntimeError,
  type RuntimeHandlerResult,
  type RuntimeJobHandler,
} from "@evavo/art-runtime";

import {
  createAdaptiveSpriteFamilyHandlers,
  adaptiveSpriteFamilyWorkerCapabilities,
} from "./adaptive-sprite-family-handlers.js";
import { mirrorHorizontalRgba } from "./deterministic-mirror-handlers.js";

const ARTIFACT_ID = /^artifact_[a-f0-9]{64}$/;
const MIRROR_OPERATION = "mirror-horizontal";

interface MirrorManifestUnit {
  readonly id: string;
  readonly unitKind: string;
  readonly sourceDirection: string;
  readonly targetDirection: string;
  readonly sourceFrameId?: string;
  readonly targetFrameId?: string;
  readonly layerRole: string;
  readonly sourceArtifactId: ArtifactId;
  readonly targetArtifactId: ArtifactId;
  readonly evidenceArtifactId: ArtifactId;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, name: string, maximum = 512): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > maximum ||
    value.includes("\0")
  ) {
    throw new PermanentRuntimeError(
      "MIRRORED_FAMILY_MANIFEST_INVALID",
      `${name} must be a non-empty string no longer than ${maximum} characters.`,
    );
  }
  return value.trim();
}

function optionalString(value: unknown, name: string): string | undefined {
  return value === null || value === undefined
    ? undefined
    : requiredString(value, name, 256);
}

function artifactId(value: unknown, name: string): ArtifactId {
  if (typeof value !== "string" || !ARTIFACT_ID.test(value)) {
    throw new PermanentRuntimeError(
      "MIRRORED_FAMILY_ARTIFACT_ID_INVALID",
      `${name} must use artifact_<sha256> format.`,
    );
  }
  return value as ArtifactId;
}

function deterministicMirrorMetadata(
  manifest: ReturnType<typeof validateSpriteFamilyManifest>,
): Record<string, unknown> | null {
  if (!isRecord(manifest.metadata)) return null;
  const value = manifest.metadata.deterministicMirroring;
  return isRecord(value) ? value : null;
}

function mirrorUnits(metadata: Record<string, unknown>): readonly MirrorManifestUnit[] {
  if (metadata.operation !== MIRROR_OPERATION) {
    throw new PermanentRuntimeError(
      "MIRRORED_FAMILY_OPERATION_INVALID",
      "deterministicMirroring.operation must be mirror-horizontal.",
    );
  }
  if (metadata.qualityThresholdsRelaxed !== false) {
    throw new PermanentRuntimeError(
      "MIRRORED_FAMILY_THRESHOLD_POLICY_INVALID",
      "Deterministic mirroring must declare qualityThresholdsRelaxed=false.",
    );
  }
  if (!Array.isArray(metadata.units) || metadata.units.length < 1 || metadata.units.length > 10_000) {
    throw new PermanentRuntimeError(
      "MIRRORED_FAMILY_UNITS_INVALID",
      "deterministicMirroring.units must contain 1 to 10000 units.",
    );
  }
  const ids = new Set<string>();
  return metadata.units.map((value, index) => {
    if (!isRecord(value)) {
      throw new PermanentRuntimeError(
        "MIRRORED_FAMILY_UNIT_INVALID",
        `deterministicMirroring.units[${index}] must be an object.`,
      );
    }
    const id = requiredString(value.id, `units[${index}].id`, 256);
    if (ids.has(id)) {
      throw new PermanentRuntimeError(
        "MIRRORED_FAMILY_UNIT_DUPLICATE",
        `Duplicate deterministic mirror unit ${id}.`,
      );
    }
    ids.add(id);
    const sourceFrameId = optionalString(
      value.sourceFrameId,
      `units[${index}].sourceFrameId`,
    );
    const targetFrameId = optionalString(
      value.targetFrameId,
      `units[${index}].targetFrameId`,
    );
    return {
      id,
      unitKind: requiredString(value.unitKind, `units[${index}].unitKind`, 64),
      sourceDirection: requiredString(
        value.sourceDirection,
        `units[${index}].sourceDirection`,
        128,
      ),
      targetDirection: requiredString(
        value.targetDirection,
        `units[${index}].targetDirection`,
        128,
      ),
      ...(sourceFrameId === undefined ? {} : { sourceFrameId }),
      ...(targetFrameId === undefined ? {} : { targetFrameId }),
      layerRole: requiredString(
        value.layerRole,
        `units[${index}].layerRole`,
        128,
      ),
      sourceArtifactId: artifactId(
        value.sourceArtifactId,
        `units[${index}].sourceArtifactId`,
      ),
      targetArtifactId: artifactId(
        value.targetArtifactId,
        `units[${index}].targetArtifactId`,
      ),
      evidenceArtifactId: artifactId(
        value.evidenceArtifactId,
        `units[${index}].evidenceArtifactId`,
      ),
    };
  });
}

async function verifiedArtifact(
  artifactIdValue: ArtifactId,
  context: Parameters<RuntimeJobHandler>[0],
): Promise<StoredArtifact> {
  const [artifact, verification] = await Promise.all([
    context.artifacts.get(artifactIdValue),
    context.artifacts.verify(artifactIdValue),
  ]);
  if (
    !artifact ||
    !verification.exists ||
    !verification.descriptorValid ||
    !verification.contentValid
  ) {
    throw new PermanentRuntimeError(
      "MIRRORED_FAMILY_ARTIFACT_INVALID",
      `Deterministic mirror artifact failed immutable verification: ${artifactIdValue}`,
    );
  }
  return artifact;
}

function ensureDeclaredInputs(
  units: readonly MirrorManifestUnit[],
  context: Parameters<RuntimeJobHandler>[0],
): void {
  const declared = new Set<ArtifactId>(context.job.spec.inputArtifacts);
  const missing = [
    ...new Set(
      units.flatMap((unit) => [
        unit.sourceArtifactId,
        unit.targetArtifactId,
        unit.evidenceArtifactId,
      ]),
    ),
  ].filter((value) => !declared.has(value));
  if (missing.length) {
    throw new PermanentRuntimeError(
      "MIRRORED_FAMILY_INPUT_LINEAGE_MISSING",
      `sprite.family.verify inputArtifacts is missing deterministic mirror inputs: ${missing.join(", ")}`,
      normalizeJson({ artifactIds: missing }),
    );
  }
  if (!context.job.spec.requiredCapabilities.includes("media.sprite-mirror")) {
    throw new PermanentRuntimeError(
      "MIRRORED_FAMILY_CAPABILITY_MISSING",
      "Mirrored family verification must require media.sprite-mirror.",
    );
  }
}

async function parsedEvidence(
  evidence: StoredArtifact,
  context: Parameters<RuntimeJobHandler>[0],
): Promise<Record<string, unknown>> {
  if (
    evidence.mediaType !== "application/json" ||
    evidence.storageClass !== "evidence" ||
    evidence.labels.artifactRole !== "sprite-horizontal-mirror-evidence" ||
    evidence.labels.qualityState !== "passed" ||
    evidence.labels.releaseReady !== "true"
  ) {
    throw new PermanentRuntimeError(
      "MIRRORED_FAMILY_EVIDENCE_STATE_INVALID",
      `Mirror evidence has an invalid role or state: ${evidence.artifactId}`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(
      (await context.artifacts.read(evidence.artifactId)).toString("utf8"),
    ) as unknown;
  } catch (error: unknown) {
    throw new PermanentRuntimeError(
      "MIRRORED_FAMILY_EVIDENCE_JSON_INVALID",
      `Mirror evidence could not be parsed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!isRecord(parsed)) {
    throw new PermanentRuntimeError(
      "MIRRORED_FAMILY_EVIDENCE_BODY_INVALID",
      "Mirror evidence body must be one JSON object.",
    );
  }
  return parsed;
}

async function verifyUnit(
  unit: MirrorManifestUnit,
  context: Parameters<RuntimeJobHandler>[0],
): Promise<Record<string, unknown>> {
  const [source, target, evidence] = await Promise.all([
    verifiedArtifact(unit.sourceArtifactId, context),
    verifiedArtifact(unit.targetArtifactId, context),
    verifiedArtifact(unit.evidenceArtifactId, context),
  ]);
  if (source.mediaType !== "image/png" || target.mediaType !== "image/png") {
    throw new PermanentRuntimeError(
      "MIRRORED_FAMILY_IMAGE_FORMAT_INVALID",
      `Mirror unit ${unit.id} requires PNG source and target artifacts.`,
    );
  }
  if (
    target.storageClass !== "master" ||
    target.labels.artifactRole !== "deterministic-mirrored-sprite-master" ||
    target.labels.approvalState !== "selected" ||
    target.labels.qualityState !== "passed" ||
    target.labels.deterministicMirror !== "true" ||
    target.labels.sourceArtifactId !== source.artifactId ||
    target.labels.mirrorEvidenceArtifactId !== evidence.artifactId ||
    !target.sourceArtifacts.includes(evidence.artifactId)
  ) {
    throw new PermanentRuntimeError(
      "MIRRORED_FAMILY_TARGET_STATE_INVALID",
      `Mirror target has an invalid immutable role, state, or ancestry: ${target.artifactId}`,
    );
  }
  if (!evidence.sourceArtifacts.includes(source.artifactId)) {
    throw new PermanentRuntimeError(
      "MIRRORED_FAMILY_EVIDENCE_ANCESTRY_INVALID",
      `Mirror evidence does not descend from its source: ${evidence.artifactId}`,
    );
  }
  const body = await parsedEvidence(evidence, context);
  const bodySource = isRecord(body.sourceArtifact)
    ? body.sourceArtifact
    : null;
  const bodyBase = isRecord(body.mirroredBaseArtifact)
    ? body.mirroredBaseArtifact
    : null;
  const proof = isRecord(body.proof) ? body.proof : null;
  if (
    body.operation !== MIRROR_OPERATION ||
    body.sourceDirection !== unit.sourceDirection ||
    body.targetDirection !== unit.targetDirection ||
    body.layerRole !== unit.layerRole ||
    bodySource?.artifactId !== source.artifactId ||
    typeof bodyBase?.artifactId !== "string" ||
    !target.sourceArtifacts.includes(bodyBase.artifactId as ArtifactId) ||
    proof?.roundTripExact !== true ||
    proof?.encodedPixelsExact !== true ||
    proof?.qualityPassed !== true ||
    proof?.qualityThresholdsRelaxed !== false
  ) {
    throw new PermanentRuntimeError(
      "MIRRORED_FAMILY_EVIDENCE_BODY_MISMATCH",
      `Mirror evidence body does not match unit ${unit.id}.`,
    );
  }

  const [sourceDecoded, targetDecoded] = await Promise.all([
    decodeSpriteFrame(await context.artifacts.read(source.artifactId), {
      maximumInputBytes: 64 * 1024 * 1024,
    }),
    decodeSpriteFrame(await context.artifacts.read(target.artifactId), {
      maximumInputBytes: 64 * 1024 * 1024,
    }),
  ]);
  if (
    sourceDecoded.width !== targetDecoded.width ||
    sourceDecoded.height !== targetDecoded.height
  ) {
    throw new PermanentRuntimeError(
      "MIRRORED_FAMILY_DIMENSIONS_MISMATCH",
      `Mirror unit ${unit.id} changed canvas dimensions.`,
    );
  }
  const expected = mirrorHorizontalRgba(
    sourceDecoded.data,
    sourceDecoded.width,
    sourceDecoded.height,
  );
  const exact = expected.equals(Buffer.from(targetDecoded.data));
  const roundTripExact = mirrorHorizontalRgba(
    targetDecoded.data,
    targetDecoded.width,
    targetDecoded.height,
  ).equals(Buffer.from(sourceDecoded.data));
  if (!exact || !roundTripExact) {
    throw new PermanentRuntimeError(
      "MIRRORED_FAMILY_PIXEL_PROOF_FAILED",
      `Mirror unit ${unit.id} is not an exact full-canvas horizontal reflection.`,
    );
  }
  return {
    id: unit.id,
    unitKind: unit.unitKind,
    sourceDirection: unit.sourceDirection,
    targetDirection: unit.targetDirection,
    sourceFrameId: unit.sourceFrameId ?? null,
    targetFrameId: unit.targetFrameId ?? null,
    layerRole: unit.layerRole,
    sourceArtifactId: source.artifactId,
    sourceDescriptorSha256: source.descriptorSha256,
    sourceContentSha256: source.contentSha256,
    targetArtifactId: target.artifactId,
    targetDescriptorSha256: target.descriptorSha256,
    targetContentSha256: target.contentSha256,
    evidenceArtifactId: evidence.artifactId,
    width: sourceDecoded.width,
    height: sourceDecoded.height,
    exact,
    roundTripExact,
  };
}

function requireBaseResult(
  value: RuntimeHandlerResult | void,
): RuntimeHandlerResult {
  if (!value) {
    throw new PermanentRuntimeError(
      "MIRRORED_FAMILY_BASE_RESULT_MISSING",
      "The base sprite-family verifier returned no result.",
    );
  }
  return value;
}

export function createMirroredSpriteFamilyHandlers(): Readonly<
  Record<string, RuntimeJobHandler>
> {
  const base = createAdaptiveSpriteFamilyHandlers()["sprite.family.verify"];
  if (!base) {
    throw new Error("Adaptive sprite.family.verify handler is unavailable.");
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
    const metadata = deterministicMirrorMetadata(manifest);
    if (!metadata) return base(context);
    const units = mirrorUnits(metadata);
    ensureDeclaredInputs(units, context);
    const proof = await Promise.all(
      units.map((unit) => verifyUnit(unit, context)),
    );
    const baseResult = requireBaseResult(await base(context));
    const body = normalizeJson({
      schemaVersion: "1.0",
      operation: MIRROR_OPERATION,
      familyId: manifest.familyId,
      unitCount: units.length,
      units: proof,
      baseOutputArtifactIds: baseResult.outputArtifacts ?? [],
      everyUnitExact: true,
      everyRoundTripExact: true,
      qualityThresholdsRelaxed: false,
    });
    const sourceArtifacts = [
      ...new Set([
        ...units.flatMap((unit) => [
          unit.sourceArtifactId,
          unit.targetArtifactId,
          unit.evidenceArtifactId,
        ]),
        ...(baseResult.outputArtifacts ?? []),
      ]),
    ].sort();
    const evidence = await context.putArtifact(
      `${JSON.stringify(body, null, 2)}\n`,
      {
        mediaType: "application/json",
        storageClass: "evidence",
        fileName: `${manifest.familyId}.horizontal-mirror-proof.json`,
        sourceArtifacts,
        labels: {
          artifactRole: "sprite-family-horizontal-mirror-proof-evidence",
          approvalState: "evidence-only",
          qualityState: "passed",
          releaseReady: "true",
          familyId: manifest.familyId,
        },
        metadata: normalizeJson({
          unitCount: units.length,
          everyUnitExact: true,
          everyRoundTripExact: true,
          qualityThresholdsRelaxed: false,
        }),
      },
    );
    return {
      outputArtifacts: [
        ...(baseResult.outputArtifacts ?? []),
        evidence.artifactId,
      ],
      result: normalizeJson({
        ...(isRecord(baseResult.result)
          ? baseResult.result
          : { baseResult: baseResult.result ?? null }),
        horizontalMirrorProofEvidenceArtifactId: evidence.artifactId,
      }),
    };
  };
  return Object.freeze({ "sprite.family.verify": verify });
}

export function mirroredSpriteFamilyWorkerCapabilities(): readonly string[] {
  return [
    ...new Set([
      ...adaptiveSpriteFamilyWorkerCapabilities(),
      "media.sprite-mirror",
    ]),
  ].sort();
}
