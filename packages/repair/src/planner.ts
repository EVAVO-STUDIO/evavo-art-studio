import {
  normalizeJson,
  type ArtifactId,
  type ArtifactStore,
  type StoredArtifact,
} from "@evavo/art-artifacts";
import { preflightInpaintMask } from "@evavo/art-media";
import {
  providerRequiredCapabilities,
  validateProviderCandidateRequest,
  type ProviderCandidateReferenceInput,
  type ProviderReferenceRole,
} from "@evavo/art-providers";
import {
  SPRITE_FAMILY_PROTOCOL_VERSION,
  type SpriteFamilyConsistencyEvidence,
  type SpriteFamilyFrameEvidence,
  type SpriteLayerEvidence,
} from "@evavo/art-sprite-family";

import {
  collectFrameRepairFailures,
  orderedStrategies,
} from "./classify.js";
import {
  TARGETED_REPAIR_PROTOCOL_VERSION,
  TargetedRepairError,
  type NormalizedTargetedRepairRequest,
  type PlanTargetedRepairOptions,
  type TargetedRepairFailure,
  type TargetedRepairPacket,
  type TargetedRepairProviderPlan,
  type TargetedRepairRunResult,
  type TargetedRepairStep,
  type TargetedRepairStrategy,
} from "./types.js";
import {
  targetedRepairRequestSha256,
  validateTargetedRepairRequest,
} from "./validation.js";

const IMAGE_MEDIA_TYPES = new Set(["image/png", "image/webp", "image/jpeg"]);

function nowIso(now: () => Date): string {
  const value = now();
  if (!Number.isFinite(value.getTime())) {
    throw new TargetedRepairError(
      "TARGETED_REPAIR_CLOCK_INVALID",
      "Targeted repair clock returned an invalid date.",
    );
  }
  return value.toISOString();
}

async function verifiedArtifact(
  artifacts: ArtifactStore,
  artifactId: ArtifactId,
  role: string,
): Promise<StoredArtifact> {
  const [artifact, verification] = await Promise.all([
    artifacts.get(artifactId),
    artifacts.verify(artifactId),
  ]);
  if (!artifact || !verification.exists) {
    throw new TargetedRepairError(
      "TARGETED_REPAIR_ARTIFACT_NOT_FOUND",
      `${role} artifact was not found: ${artifactId}`,
    );
  }
  if (!verification.descriptorValid || !verification.contentValid) {
    throw new TargetedRepairError(
      "TARGETED_REPAIR_ARTIFACT_VERIFICATION_FAILED",
      `${role} artifact failed immutable verification: ${artifactId}`,
    );
  }
  return artifact;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseFamilyEvidence(value: unknown): SpriteFamilyConsistencyEvidence {
  if (!isRecord(value)) {
    throw new TargetedRepairError(
      "TARGETED_REPAIR_EVIDENCE_INVALID",
      "Sprite family evidence must be a JSON object.",
    );
  }
  if (
    value.schemaVersion !== "1.0" ||
    value.protocolVersion !== SPRITE_FAMILY_PROTOCOL_VERSION ||
    typeof value.familyId !== "string" ||
    typeof value.manifestSha256 !== "string" ||
    typeof value.passed !== "boolean" ||
    !isRecord(value.canvas) ||
    !Array.isArray(value.layerDefinitions) ||
    !Array.isArray(value.frameEvidence) ||
    !Array.isArray(value.familyGates) ||
    !Array.isArray(value.generatedCompositeArtifactIds) ||
    !Array.isArray(value.sourceArtifactIds)
  ) {
    throw new TargetedRepairError(
      "TARGETED_REPAIR_EVIDENCE_INVALID",
      "Sprite family evidence is missing required protocol fields.",
    );
  }
  return value as unknown as SpriteFamilyConsistencyEvidence;
}

async function readFamilyEvidence(
  artifacts: ArtifactStore,
  artifactId: ArtifactId,
): Promise<Readonly<{ artifact: StoredArtifact; evidence: SpriteFamilyConsistencyEvidence }>> {
  const artifact = await verifiedArtifact(
    artifacts,
    artifactId,
    "sprite family evidence",
  );
  if (
    artifact.mediaType !== "application/json" ||
    artifact.storageClass !== "evidence" ||
    artifact.labels.artifactRole !== "sprite-family-consistency-evidence"
  ) {
    throw new TargetedRepairError(
      "TARGETED_REPAIR_EVIDENCE_ROLE_INVALID",
      "familyEvidenceArtifactId must reference immutable sprite-family-consistency-evidence JSON.",
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse((await artifacts.read(artifactId)).toString("utf8"));
  } catch (error: unknown) {
    throw new TargetedRepairError(
      "TARGETED_REPAIR_EVIDENCE_JSON_INVALID",
      `Sprite family evidence could not be parsed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return { artifact, evidence: parseFamilyEvidence(parsed) };
}

function targetFrame(
  evidence: SpriteFamilyConsistencyEvidence,
  frameId: string,
): SpriteFamilyFrameEvidence {
  const frame = evidence.frameEvidence.find((entry) => entry.frameId === frameId);
  if (!frame) {
    throw new TargetedRepairError(
      "TARGETED_REPAIR_FRAME_NOT_FOUND",
      `Target frame ${frameId} is not present in family evidence ${evidence.familyId}.`,
    );
  }
  return frame;
}

function targetLayer(
  frame: SpriteFamilyFrameEvidence,
  layerId: string | undefined,
): SpriteLayerEvidence | undefined {
  if (layerId === undefined) return undefined;
  const layer = frame.layers.find((entry) => entry.layerId === layerId);
  if (!layer) {
    throw new TargetedRepairError(
      "TARGETED_REPAIR_LAYER_NOT_FOUND",
      `Target layer ${layerId} is not present in frame ${frame.frameId}.`,
    );
  }
  return layer;
}

function impactedFrames(
  evidence: SpriteFamilyConsistencyEvidence,
  frame: SpriteFamilyFrameEvidence,
  layer: SpriteLayerEvidence | undefined,
  request: NormalizedTargetedRepairRequest,
): readonly string[] {
  if (!layer) return [frame.frameId];
  const definition = evidence.layerDefinitions.find(
    (entry) => entry.id === layer.layerId,
  );
  if (!definition) {
    throw new TargetedRepairError(
      "TARGETED_REPAIR_LAYER_DEFINITION_MISSING",
      `Layer definition ${layer.layerId} is missing from family evidence.`,
    );
  }
  const impacted =
    definition.sourcePolicy === "per-frame"
      ? [frame.frameId]
      : evidence.frameEvidence
          .filter((candidateFrame) =>
            candidateFrame.layers.some(
              (candidateLayer) =>
                candidateLayer.layerId === layer.layerId &&
                candidateLayer.artifactId === layer.artifactId,
            ),
          )
          .map((entry) => entry.frameId)
          .sort();
  if (impacted.length > request.policy.maximumImpactedFrames) {
    throw new TargetedRepairError(
      "TARGETED_REPAIR_IMPACT_LIMIT_EXCEEDED",
      `Repair would affect ${impacted.length} frames, exceeding policy.maximumImpactedFrames ${request.policy.maximumImpactedFrames}.`,
      { impactedFrameIds: impacted },
    );
  }
  return impacted;
}

function mutableAndProtected(
  evidence: SpriteFamilyConsistencyEvidence,
  frame: SpriteFamilyFrameEvidence,
  layer: SpriteLayerEvidence | undefined,
): Readonly<{
  mutableArtifactIds: readonly ArtifactId[];
  protectedArtifactIds: readonly ArtifactId[];
  baseArtifactId: ArtifactId | undefined;
}> {
  const baseArtifactId = layer?.artifactId ?? frame.generatedCompositeArtifactId;
  const mutableArtifactIds = [baseArtifactId];
  const protectedArtifactIds = evidence.sourceArtifactIds
    .filter((artifactId) => !mutableArtifactIds.includes(artifactId))
    .sort();
  return { mutableArtifactIds, protectedArtifactIds, baseArtifactId };
}

function strategyDescription(
  strategy: TargetedRepairStrategy,
  layerId: string | undefined,
): string {
  const target = layerId ? `layer ${layerId}` : "the target frame";
  switch (strategy) {
    case "source-replace":
      return `Replace or re-ingest the immutable source for ${target}; do not regenerate unaffected artwork.`;
    case "metadata-adjustment":
      return `Correct timing, pivot, baseline or ground-contact metadata for ${target} without changing pixels.`;
    case "layer-transform":
      return `Adjust only the declared offset, registration or canvas placement for ${target}.`;
    case "layer-recompose":
      return `Correct layer ownership, z-order, opacity, blend or declared composite parity for ${target}.`;
    case "alpha-remaster":
      return `Re-run deterministic alpha and edge mastering for ${target} without redesigning its subject.`;
    case "masked-provider-inpaint":
      return `Inpaint only the explicit repair mask for ${target} while preserving every protected artifact.`;
    default:
      return `Escalate ${target} for evidence-backed manual review; automatic mutation is not justified.`;
  }
}

function stepPrerequisites(strategy: TargetedRepairStrategy): readonly string[] {
  switch (strategy) {
    case "source-replace":
      return ["verified replacement source", "matching canonical lineage"];
    case "metadata-adjustment":
      return ["approved anchor or timing value"];
    case "layer-transform":
      return ["approved offset or registration correction"];
    case "layer-recompose":
      return ["corrected manifest ownership and occlusion contract"];
    case "alpha-remaster":
      return ["verified source pixels", "declared transparency strategy"];
    case "masked-provider-inpaint":
      return ["matching base and alpha mask", "canonical identity reference"];
    default:
      return ["named reviewer decision"];
  }
}

function buildSteps(
  failures: readonly TargetedRepairFailure[],
  impactedFrameIds: readonly string[],
  layerId: string | undefined,
  mutableArtifactIds: readonly ArtifactId[],
  protectedArtifactIds: readonly ArtifactId[],
): readonly TargetedRepairStep[] {
  return orderedStrategies(failures).map((strategy, index) => ({
    order: index + 1,
    strategy,
    blocking: true,
    description: strategyDescription(strategy, layerId),
    targetFrameIds: impactedFrameIds,
    ...(layerId === undefined ? {} : { targetLayerId: layerId }),
    mutableArtifactIds,
    protectedArtifactIds,
    gateIds: [
      ...new Set(
        failures
          .filter((failure) =>
            orderedStrategies([failure]).includes(strategy),
          )
          .map((failure) => failure.gate.id),
      ),
    ].sort(),
    prerequisites: stepPrerequisites(strategy),
  }));
}

function providerRole(role: string): ProviderReferenceRole {
  return role as ProviderReferenceRole;
}

async function buildProviderPlan(
  request: NormalizedTargetedRepairRequest,
  evidence: SpriteFamilyConsistencyEvidence,
  frame: SpriteFamilyFrameEvidence,
  layer: SpriteLayerEvidence | undefined,
  baseArtifactId: ArtifactId,
  failures: readonly TargetedRepairFailure[],
  artifacts: ArtifactStore,
  blockers: string[],
): Promise<TargetedRepairProviderPlan | undefined> {
  if (!request.provider.enabled) {
    blockers.push("provider-repair-disabled");
    return undefined;
  }
  if (!layer && !request.policy.allowWholeFramePixelRepair) {
    blockers.push("whole-frame-pixel-repair-disabled");
    return undefined;
  }
  if (!request.style || !request.shot) {
    blockers.push("provider-style-and-shot-required");
    return undefined;
  }
  if (!request.provider.backgroundStrategy) {
    blockers.push("provider-background-strategy-required");
    return undefined;
  }
  const canonical = request.references.find(
    (entry) => entry.role === "canonical-identity",
  );
  if (!canonical) {
    blockers.push("canonical-identity-reference-required");
    return undefined;
  }
  if (request.policy.requireMaskForPixelRepair && !request.maskArtifactId) {
    blockers.push("repair-mask-required");
    return undefined;
  }
  if (!request.maskArtifactId) {
    blockers.push("whole-image-provider-repair-not-supported");
    return undefined;
  }

  const [base, mask] = await Promise.all([
    verifiedArtifact(artifacts, baseArtifactId, "repair base"),
    verifiedArtifact(artifacts, request.maskArtifactId, "repair mask"),
  ]);
  if (!IMAGE_MEDIA_TYPES.has(base.mediaType) || !IMAGE_MEDIA_TYPES.has(mask.mediaType)) {
    throw new TargetedRepairError(
      "TARGETED_REPAIR_IMAGE_REQUIRED",
      "Provider repair base and mask must contain supported raster images.",
    );
  }
  const maskEvidence = await preflightInpaintMask(
    await artifacts.read(baseArtifactId),
    await artifacts.read(request.maskArtifactId),
  );
  for (const reference of request.references) {
    await verifiedArtifact(artifacts, reference.artifactId, reference.role);
  }

  const providerReferences: ProviderCandidateReferenceInput[] = [
    {
      artifactId: baseArtifactId,
      role: "base-image",
      required: true,
      note: "Only pixels inside the separate mask may change.",
    },
    {
      artifactId: request.maskArtifactId,
      role: "mask",
      required: true,
      note: `Editable fraction ${(maskEvidence.mask.editableFraction * 100).toFixed(3)}%.`,
    },
    ...request.references.map((reference) => ({
      artifactId: reference.artifactId,
      role: providerRole(reference.role),
      strength: reference.strength,
      required: true,
      ...(reference.note === undefined ? {} : { note: reference.note }),
    })),
  ];
  const failedGateIds = [...new Set(failures.map((failure) => failure.gate.id))].sort();
  const normalized = validateProviderCandidateRequest({
    schemaVersion: "1.0",
    requestId: request.repairId,
    operation: "inpaint",
    assetKind: layer ? "sprite-layer" : "sprite-frame",
    continuityPhase: "repair",
    assetId: evidence.familyId,
    candidateFamilyId: `${evidence.familyId}:${frame.frameId}:${layer?.layerId ?? "frame"}:repair`,
    frameId: frame.frameId,
    ...(layer ? { layerId: layer.layerId } : {}),
    creativeIntent: `${request.intent} Correct only these blocking failures: ${failedGateIds.join(", ")}. Preserve all pixels outside the supplied mask and preserve every protected layer by immutable artifact ID.`,
    negativeIntent: `Do not redesign identity, costume, equipment, pose, camera, palette, line treatment, canvas, pivot, or unaffected layers. Do not create a sheet, contact sheet, alternate frame, extra prop, background, shadow, effect, UI, or text.`,
    style: request.style,
    shot: {
      ...request.shot,
      include: [
        ...(request.shot.include ?? []),
        `only the approved ${layer?.layerId ?? "frame"} repair target`,
      ],
      exclude: [
        ...(request.shot.exclude ?? []),
        ...request.preserve.map((entry) => `changes to ${entry}`),
      ],
      separateAssets: [
        ...(request.shot.separateAssets ?? []),
        ...evidence.layerDefinitions
          .filter((definition) => definition.id !== layer?.layerId)
          .map((definition) => definition.id),
      ],
    },
    target: {
      width: layer?.width ?? evidence.canvas.width,
      height: layer?.height ?? evidence.canvas.height,
      transparency: "required",
      outputFormat: "png",
    },
    sourceCanvas: {
      width: maskEvidence.base.width,
      height: maskEvidence.base.height,
    },
    background: {
      strategy: request.provider.backgroundStrategy,
      ...(request.provider.matteColour === undefined
        ? {}
        : { matteColour: request.provider.matteColour }),
    },
    quality: "high",
    candidateCount: request.provider.candidateCount,
    ...(request.provider.seed === undefined ? {} : { seed: request.provider.seed }),
    references: providerReferences,
    selection: {
      ...(request.provider.preferredAdapterId === undefined
        ? {}
        : { preferredAdapterId: request.provider.preferredAdapterId }),
      ...(request.provider.preferredModel === undefined
        ? {}
        : { preferredModel: request.provider.preferredModel }),
      allowedAdapterIds: request.provider.allowedAdapterIds,
      allowFallback: request.provider.allowFallback,
      requireSeed: request.provider.seed !== undefined,
    },
    metadata: {
      repairId: request.repairId,
      familyEvidenceArtifactId: request.familyEvidenceArtifactId,
      familyManifestSha256: evidence.manifestSha256,
      targetFrameId: frame.frameId,
      targetLayerId: layer?.layerId ?? null,
      protectedArtifactIds: evidence.sourceArtifactIds.filter(
        (artifactId) => artifactId !== baseArtifactId,
      ),
      failedGateIds,
      maskPreflight: maskEvidence,
    },
  });
  const inputArtifacts = [
    ...new Set(providerReferences.map((reference) => reference.artifactId)),
  ].sort() as readonly ArtifactId[];
  return {
    request: normalized,
    inputArtifacts,
    runtimeJob: {
      queue: "provider",
      kind: "art.candidate.inpaint",
      idempotencyKey: `repair-provider:${request.repairId}`,
      payload: normalized,
      inputArtifacts,
      requiredCapabilities: [
        "provider.inpaint",
        "provider.reference-lock",
        "provider.candidate-store",
        "quality.inpaint-mask",
        "evidence.bundle",
      ],
      requiredCapabilityProfile: providerRequiredCapabilities(normalized),
      maximumAttempts: 3,
      leaseDurationMs: 300_000,
      timeoutMs: 1_800_000,
      labels: {
        repairId: request.repairId,
        familyId: evidence.familyId,
        frameId: frame.frameId,
        ...(layer ? { layerId: layer.layerId } : {}),
      },
    },
  };
}

export async function planTargetedRepair(
  input: NormalizedTargetedRepairRequest | unknown,
  options: PlanTargetedRepairOptions,
): Promise<TargetedRepairRunResult> {
  const request =
    isRecord(input) && input.protocolVersion === TARGETED_REPAIR_PROTOCOL_VERSION
      ? (input as unknown as NormalizedTargetedRepairRequest)
      : validateTargetedRepairRequest(input);
  const now = options.now ?? (() => new Date());
  nowIso(now);
  const family = await readFamilyEvidence(
    options.artifacts,
    request.familyEvidenceArtifactId,
  );
  const frame = targetFrame(family.evidence, request.target.frameId);
  const layer = targetLayer(frame, request.target.layerId);
  const failures = collectFrameRepairFailures(
    frame,
    layer,
    request.target.gateIds,
  );
  if (!failures.length) {
    throw new TargetedRepairError(
      "TARGETED_REPAIR_NO_BLOCKING_FAILURE",
      "The requested frame, layer and gate selection contains no blocking failed evidence.",
    );
  }
  const impactedFrameIds = impactedFrames(
    family.evidence,
    frame,
    layer,
    request,
  );
  const definition = layer
    ? family.evidence.layerDefinitions.find((entry) => entry.id === layer.layerId)
    : undefined;
  const blockers: string[] = [];
  if (
    definition &&
    definition.sourcePolicy !== "per-frame" &&
    impactedFrameIds.length > 1 &&
    !request.policy.allowSharedLayerRepair
  ) {
    blockers.push("shared-layer-repair-not-authorized");
  }
  const artifacts = mutableAndProtected(family.evidence, frame, layer);
  const strategies = orderedStrategies(failures);
  if (strategies.includes("source-replace")) {
    blockers.push("verified-replacement-source-required");
  }
  if (strategies.includes("manual-review")) {
    blockers.push("unclassified-failure-requires-review");
  }
  const providerPlan = strategies.includes("masked-provider-inpaint")
    ? await buildProviderPlan(
        request,
        family.evidence,
        frame,
        layer,
        artifacts.baseArtifactId!,
        failures,
        options.artifacts,
        blockers,
      )
    : undefined;
  const disposition = blockers.includes("verified-replacement-source-required")
    ? "manual-source-required"
    : blockers.length
      ? "blocked"
      : "ready";
  const packet: TargetedRepairPacket = {
    schemaVersion: "1.0",
    protocolVersion: TARGETED_REPAIR_PROTOCOL_VERSION,
    repairId: request.repairId,
    requestSha256: targetedRepairRequestSha256(request),
    familyEvidenceArtifactId: request.familyEvidenceArtifactId,
    familyId: family.evidence.familyId,
    familyManifestSha256: family.evidence.manifestSha256,
    disposition,
    target: {
      frameId: frame.frameId,
      ...(layer
        ? {
            layerId: layer.layerId,
            layerRole: layer.role,
            sourcePolicy: definition?.sourcePolicy,
            baseArtifactId: layer.artifactId,
          }
        : { baseArtifactId: frame.generatedCompositeArtifactId }),
    },
    impactedFrameIds,
    failures,
    steps: buildSteps(
      failures,
      impactedFrameIds,
      layer?.layerId,
      artifacts.mutableArtifactIds,
      artifacts.protectedArtifactIds,
    ),
    mutableArtifactIds: artifacts.mutableArtifactIds,
    protectedArtifactIds: artifacts.protectedArtifactIds,
    ...(providerPlan ? { providerPlan } : {}),
    blockers: [...new Set(blockers)].sort(),
    continuation: [
      ...(request.provider.backgroundStrategy === "chroma-key"
        ? [
            {
              stage: "alpha-master" as const,
              description:
                "Run deterministic chroma alpha mastering over each provider candidate before comparison.",
              requiredCapabilities: [
                "media.chroma-extract",
                "quality.sprite-frame",
                "evidence.bundle",
              ],
            },
          ]
        : []),
      {
        stage: "manifest-update",
        description:
          "Replace only the target layer artifact binding and retain every protected binding unchanged.",
        requiredCapabilities: ["artifacts.store", "evidence.bundle"],
      },
      {
        stage: "family-reverify",
        description:
          "Re-run layered family verification for every impacted frame before selection or promotion.",
        requiredCapabilities: [
          "sprite.family.verify",
          "media.layer-compose",
          "selection.compare",
          "evidence.bundle",
        ],
      },
      {
        stage: "candidate-select",
        description:
          "Compare repaired candidates with the approved reference and retain ambiguous results for review.",
        requiredCapabilities: ["selection.compare", "evidence.bundle"],
      },
      {
        stage: "candidate-promote",
        description:
          "Promote only after fresh family and selection evidence passes through compare-and-swap governance.",
        requiredCapabilities: [
          "selection.promote",
          "artifacts.store",
          "evidence.bundle",
        ],
      },
    ],
    sourceEvidence: family.evidence,
    ...(request.metadata === undefined ? {} : { metadata: request.metadata }),
  };
  const sourceArtifacts = [
    request.familyEvidenceArtifactId,
    ...artifacts.mutableArtifactIds,
    ...artifacts.protectedArtifactIds,
    ...(request.maskArtifactId ? [request.maskArtifactId] : []),
    ...request.references.map((entry) => entry.artifactId),
  ];
  const stored = await options.artifacts.put(
    `${JSON.stringify(normalizeJson(packet), null, 2)}\n`,
    {
      mediaType: "application/json",
      storageClass: "evidence",
      fileName: `${request.repairId}.targeted-repair.json`,
      sourceArtifacts: [...new Set(sourceArtifacts)].sort() as readonly ArtifactId[],
      labels: {
        artifactRole: "targeted-repair-packet",
        approvalState: "evidence-only",
        repairDisposition: disposition,
        familyId: family.evidence.familyId,
        frameId: frame.frameId,
        ...(layer ? { layerId: layer.layerId } : {}),
      },
      metadata: normalizeJson({
        schemaVersion: "1.0",
        protocolVersion: TARGETED_REPAIR_PROTOCOL_VERSION,
        requestSha256: packet.requestSha256,
        familyManifestSha256: packet.familyManifestSha256,
        impactedFrameCount: impactedFrameIds.length,
        blockerCount: packet.blockers.length,
        providerPlanReady: providerPlan !== undefined,
      }),
    },
  );
  return { packetArtifactId: stored.artifactId, packet };
}
