
import {
  normalizeJson,
  sha256,
  stableStringify,
  type ArtifactId,
  type JsonValue,
} from "@evavo/art-artifacts";
import type { AnimationPoseControlBinding } from "@evavo/art-direction";
import {
  providerRequiredCapabilities,
  validateComfyUIWorkflowCatalog,
  validateProviderCandidateRequest,
  type ComfyUIWorkflowCatalog,
  type NormalizedProviderCandidateReference,
  type NormalizedProviderCandidateRequest,
  type ProviderCandidateRequestInput,
  type ProviderStyleEnvelopeInput,
} from "@evavo/art-providers";
import type { CompiledSpriteProductionPlan } from "@evavo/art-sprite-planner";

import { compileSpriteSupervisorWorkflow } from "./compiler.js";
import {
  compileVerifiedAnimationProviderBatch,
  type VerifiedAnimationProviderBatchCompilation,
  type VerifiedAnimationProviderBatchCompileRequest,
} from "./verified-animation-provider-compiler.js";
import type {
  CompiledSpriteSupervisorWorkflow,
  SpriteSupervisorCompileRequestInput,
  SpriteSupervisorTaskInput,
} from "./types.js";

export const TWO_STAGE_ANIMATION_PROVIDER_COMPILER_VERSION =
  "2026-09-18.1" as const;

const DRAW_THINGS_SAMPLER = "DrawThingsSampler";
const DRAW_THINGS_CONTROL = "DrawThingsControlNet";
const ARTIFACT_ID = /^artifact_[a-f0-9]{64}$/u;
const SAFE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

export interface TwoStageAnimationProviderBatchCompileRequest {
  readonly spritePlan: CompiledSpriteProductionPlan;
  readonly plan: VerifiedAnimationProviderBatchCompileRequest["plan"];
  readonly batchId: string;
  readonly poseControlBindings: Readonly<
    Record<string, AnimationPoseControlBinding>
  >;
  readonly keyPoseArtifactIds?: Readonly<Record<string, ArtifactId>>;
  readonly style: ProviderStyleEnvelopeInput;
  readonly background: Readonly<{
    strategy: "chroma-key";
    matteColour: string;
  }>;
  readonly quality?: VerifiedAnimationProviderBatchCompileRequest["quality"];
  readonly finalCandidatesPerFrame?: number;
  readonly promotion?: Readonly<{
    namespace?: string;
    actor?: string;
    expectedGeneration?: number;
  }>;
  readonly requireFinalHumanApproval?: boolean;
  readonly drawThingsCatalog: ComfyUIWorkflowCatalog | unknown;
  readonly metadata?: JsonValue;
}

export interface TwoStageAnimationFrameCompilation {
  readonly frameId: string;
  readonly structuralAdapterId: string;
  readonly finalAdapterId: string;
  readonly structuralRequest: NormalizedProviderCandidateRequest;
  readonly finalValidationRequest: NormalizedProviderCandidateRequest;
  readonly structuralArtifactRole: string;
  readonly structuralMasterRole: string;
  readonly finalMasterRole: string;
  readonly taskIds: readonly string[];
}

export interface TwoStageAnimationProviderBatchCompilation {
  readonly schemaVersion: "1.0";
  readonly compilerVersion: typeof TWO_STAGE_ANIMATION_PROVIDER_COMPILER_VERSION;
  readonly batchId: string;
  readonly clipId: string;
  readonly phase: VerifiedAnimationProviderBatchCompilation["phase"];
  readonly animationDirectorPlanSha256: string;
  readonly drawThingsCatalogSha256: string;
  readonly frames: readonly TwoStageAnimationFrameCompilation[];
  readonly supervisorRequest: SpriteSupervisorCompileRequestInput;
  readonly supervisorWorkflow: CompiledSpriteSupervisorWorkflow;
  readonly authority: Readonly<{
    providerExecution: false;
    runtimeSubmission: false;
    creativeApproval: false;
    repositoryMutation: false;
    publication: false;
  }>;
}

type DrawThingsProfile = ComfyUIWorkflowCatalog["profiles"][number];

function fail(message: string): never {
  throw new Error("Two-stage animation provider compile failed: " + message);
}

function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function metadataObject(value: JsonValue | undefined): Record<string, JsonValue> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, JsonValue>) }
    : {};
}

function token(value: string, maximum = 128): string {
  const normalized = value
    .replace(/[^A-Za-z0-9._:-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, maximum);
  if (!normalized || !/^[A-Za-z0-9]/u.test(normalized)) {
    fail("value cannot be normalized to a safe token: " + value);
  }
  return normalized;
}

function shortHash(value: unknown): string {
  return sha256(stableStringify(normalizeJson(value))).slice(0, 14);
}

function uniqueArtifactIds(
  references: readonly NormalizedProviderCandidateReference[],
): readonly ArtifactId[] {
  return [
    ...new Set(
      references.map((reference) => {
        if (!ARTIFACT_ID.test(reference.artifactId)) {
          fail("reference " + reference.role + " has a non-canonical artifact id");
        }
        return reference.artifactId;
      }),
    ),
  ].sort() as readonly ArtifactId[];
}

function requestInput(
  request: NormalizedProviderCandidateRequest,
): ProviderCandidateRequestInput {
  const { protocolVersion: _protocolVersion, ...input } = request;
  return jsonClone(input) as ProviderCandidateRequestInput;
}

function referenceByRole(
  request: NormalizedProviderCandidateRequest,
  role: NormalizedProviderCandidateReference["role"],
): NormalizedProviderCandidateReference | undefined {
  return request.references.find((reference) => reference.role === role);
}

function canonicalReference(
  request: NormalizedProviderCandidateRequest,
): NormalizedProviderCandidateReference {
  const reference = referenceByRole(request, "canonical-identity");
  if (!reference) {
    fail("frame " + (request.frameId ?? request.assetId) + " is missing canonical identity");
  }
  return reference;
}

function structuralRequest(
  source: NormalizedProviderCandidateRequest,
): NormalizedProviderCandidateRequest {
  const canonical = canonicalReference(source);
  const pose = referenceByRole(source, "pose-control");
  if (!pose) {
    fail("frame " + (source.frameId ?? source.assetId) + " is missing pose-control");
  }
  const input = requestInput(source);
  return validateProviderCandidateRequest({
    ...input,
    requestId: source.requestId + ":structural",
    creativeIntent:
      source.creativeIntent +
      " Produce a structural pose-locked draft only. Prioritise the exact pose map, body proportions, baseline, planted-foot contact and canonical silhouette over surface rendering. Do not redesign the pose.",
    candidateCount: 1,
    references: [canonical, pose],
    selection: {
      allowedAdapterIds: [],
      allowFallback: false,
      requireSeed: source.selection.requireSeed,
    },
    metadata: {
      ...metadataObject(source.metadata),
      twoStageAnimation: {
        compilerVersion: TWO_STAGE_ANIMATION_PROVIDER_COMPILER_VERSION,
        stage: "structural",
      },
    },
  });
}

function finalProxyRequest(
  source: NormalizedProviderCandidateRequest,
): NormalizedProviderCandidateRequest {
  const canonical = canonicalReference(source);
  const finalReferences: NormalizedProviderCandidateReference[] = [
    {
      artifactId: canonical.artifactId,
      role: "base-image",
      strength: 1,
      required: true,
      note:
        "Validation-only base-image stand-in. Supervisor materialization replaces this slot with the structural draft artifact.",
    },
    ...source.references.filter((reference) => reference.role !== "pose-control"),
  ];
  const input = requestInput(source);
  return validateProviderCandidateRequest({
    ...input,
    requestId: source.requestId + ":final",
    operation: "edit",
    creativeIntent:
      source.creativeIntent +
      " Refine the pose-locked structural draft without moving the pose, pivot, baseline or ground contact. Restore the approved character identity, costume, direction, palette, line treatment and authored motion continuity while preserving structural geometry.",
    candidateCount: 1,
    references: finalReferences,
    selection: {
      allowedAdapterIds: [],
      allowFallback: false,
      requireSeed: source.selection.requireSeed,
    },
    metadata: {
      ...metadataObject(source.metadata),
      twoStageAnimation: {
        compilerVersion: TWO_STAGE_ANIMATION_PROVIDER_COMPILER_VERSION,
        stage: "final-refinement",
      },
    },
  });
}

function drawThingsProfiles(
  catalog: ComfyUIWorkflowCatalog,
): readonly DrawThingsProfile[] {
  return catalog.profiles.filter((profile) =>
    profile.nodeInventory.some((node) => node.classType === DRAW_THINGS_SAMPLER),
  );
}

function resolveProfile(
  catalog: ComfyUIWorkflowCatalog,
  request: NormalizedProviderCandidateRequest,
  stage: "structural" | "final",
): DrawThingsProfile {
  const required = providerRequiredCapabilities(request);
  const profiles = drawThingsProfiles(catalog)
    .filter((profile) => profile.operations.includes(request.operation))
    .filter((profile) => profile.assetKinds.includes(request.assetKind))
    .filter((profile) =>
      profile.continuityPhases.includes(request.continuityPhase),
    )
    .filter((profile) =>
      required.every((capability) => profile.capabilities.includes(capability)),
    )
    .filter(
      (profile) =>
        profile.limits.maximumCandidates >= request.candidateCount,
    )
    .filter(
      (profile) =>
        profile.limits.maximumReferenceImages >= request.references.length,
    )
    .filter((profile) =>
      stage === "structural"
        ? profile.nodeInventory.some(
            (node) => node.classType === DRAW_THINGS_CONTROL,
          )
        : true,
    )
    .sort(
      (left, right) =>
        right.priority - left.priority ||
        left.profileId.localeCompare(right.profileId),
    );
  if (!profiles.length) {
    fail(
      "no governed Draw Things " +
        stage +
        " profile satisfies " +
        request.operation +
        " " +
        request.continuityPhase +
        " with capabilities " +
        required.join(", "),
    );
  }
  return profiles[0]!;
}

function lockRequestToProfile(
  request: NormalizedProviderCandidateRequest,
  profile: DrawThingsProfile,
  requestId: string,
): NormalizedProviderCandidateRequest {
  const input = requestInput(request);
  const adapterId = "draw-things:" + profile.profileId;
  return validateProviderCandidateRequest({
    ...input,
    requestId,
    selection: {
      preferredAdapterId: adapterId,
      preferredModel: profile.modelId,
      allowedAdapterIds: [adapterId],
      allowFallback: false,
      requireSeed: request.selection.requireSeed,
    },
  });
}

function finalTemplate(
  request: NormalizedProviderCandidateRequest,
  structuralRole: string,
  candidateOrdinal: number,
): JsonValue {
  const input = requestInput(request) as unknown as Record<string, unknown>;
  const references = request.references.map((reference) =>
    reference.role === "base-image"
      ? {
          ...reference,
          artifactId: { $artifact: structuralRole },
          note:
            "Supervisor-bound structural draft from the pose-control stage.",
        }
      : reference,
  );
  return normalizeJson({
    ...input,
    requestId:
      request.requestId +
      ":candidate-" +
      String(candidateOrdinal).padStart(2, "0"),
    references,
    metadata: {
      ...metadataObject(request.metadata),
      finalCandidateOrdinal: candidateOrdinal,
    },
  });
}

function masterPayload(
  candidateRole: string,
  request: NormalizedProviderCandidateRequest,
  matteColour: string,
): JsonValue {
  return normalizeJson({
    candidateArtifactId: { $artifact: candidateRole },
    backgroundMode: "chroma-key",
    matteColour,
    frameId: request.frameId ?? request.assetId,
    targetWidth: request.target.width,
    targetHeight: request.target.height,
    resampling: "nearest",
    quality: {
      expectedWidth: request.target.width,
      expectedHeight: request.target.height,
      expectedFormat: "png",
      safePadding: 2,
      maximumHaloFraction: 0.02,
      maximumUnexpectedTransparentRgbFraction: 0.02,
    },
  });
}

function selectionPolicy(): JsonValue {
  return normalizeJson({
    profile: "custom",
    allowAutomaticSelection: true,
    requireReferenceLineage: false,
    requireQualityPassed: true,
    allowedCandidateRoles: ["provider-candidate-alpha-master"],
    alphaVisibleThreshold: 8,
    maximumTranslationPixels: 6,
    maximumEdgeDistancePixels: 12,
    minimumOverallScore: 0.6,
    minimumWinnerMargin: 0.02,
    metrics: [
      { id: "silhouette-iou", weight: 0.22, minimum: 0.36, blocking: true },
      {
        id: "edge-similarity",
        weight: 0.16,
        minimum: 0.34,
        blocking: true,
      },
      {
        id: "visible-area-similarity",
        weight: 0.16,
        minimum: 0.62,
        blocking: true,
      },
      {
        id: "centroid-similarity",
        weight: 0.14,
        minimum: 0.66,
        blocking: true,
      },
      {
        id: "bounds-aspect-similarity",
        weight: 0.08,
        minimum: 0.64,
        blocking: false,
      },
      {
        id: "palette-similarity",
        weight: 0.08,
        minimum: 0.35,
        blocking: false,
      },
      {
        id: "luminance-similarity",
        weight: 0.05,
        minimum: 0.35,
        blocking: false,
      },
      {
        id: "edge-orientation-similarity",
        weight: 0.07,
        minimum: 0.3,
        blocking: false,
      },
      {
        id: "overlap-colour-similarity",
        weight: 0.04,
        minimum: 0.2,
        blocking: false,
      },
    ],
    externalEvidence: [],
  });
}

function promotionNamespace(
  request: TwoStageAnimationProviderBatchCompileRequest,
  frameId: string,
): string {
  const root = request.promotion?.namespace
    ? request.promotion.namespace
        .split("/")
        .map((part) => token(part, 64))
        .join("/")
    : "two-stage-animation";
  return [
    root,
    token(request.spritePlan.project.projectId, 64),
    token(request.spritePlan.asset.assetId, 64),
    token(request.plan.clipId, 64),
    token(request.plan.direction, 64),
    token(frameId, 96),
  ].join("/");
}

function finalCandidates(
  request: TwoStageAnimationProviderBatchCompileRequest,
  verified: VerifiedAnimationProviderBatchCompilation,
): number {
  const batch = request.plan.generationBatches.find(
    (entry) => entry.id === request.batchId,
  );
  if (!batch) {
    fail("batch " + request.batchId + " is absent from the Animation Director plan");
  }
  const requested = request.finalCandidatesPerFrame ?? 3;
  if (
    !Number.isInteger(requested) ||
    requested < 1 ||
    requested > batch.maximumCandidatesPerFrame
  ) {
    fail(
      "finalCandidatesPerFrame must be 1 to " +
        batch.maximumCandidatesPerFrame +
        " for " +
        verified.phase,
    );
  }
  return requested;
}

function verifySpritePlanCompatibility(
  request: TwoStageAnimationProviderBatchCompileRequest,
): void {
  if (!request.spritePlan || typeof request.spritePlan !== "object") {
    fail("spritePlan must be a compiled sprite-production plan");
  }
  if (!SAFE_TOKEN.test(request.spritePlan.planId)) {
    fail("spritePlan.planId is invalid");
  }
  const dimensions = request.spritePlan.asset.dimensions;
  if (
    dimensions.width !== request.plan.canvas.width ||
    dimensions.height !== request.plan.canvas.height
  ) {
    fail(
      "spritePlan canvas " +
        dimensions.width +
        "x" +
        dimensions.height +
        " differs from Animation Director " +
        request.plan.canvas.width +
        "x" +
        request.plan.canvas.height,
    );
  }
}

function verifiedBatch(
  request: TwoStageAnimationProviderBatchCompileRequest,
): VerifiedAnimationProviderBatchCompilation {
  return compileVerifiedAnimationProviderBatch({
    plan: request.plan,
    batchId: request.batchId,
    poseControlBindings: request.poseControlBindings,
    ...(request.keyPoseArtifactIds
      ? { keyPoseArtifactIds: request.keyPoseArtifactIds }
      : {}),
    style: request.style,
    background: request.background,
    ...(request.quality ? { quality: request.quality } : {}),
    candidateCount: 1,
    selection: {
      allowedAdapterIds: [],
      allowFallback: false,
      requireSeed: false,
    },
  });
}

function taskToken(prefix: string, frameId: string, suffix = ""): string {
  return token(
    "two-" +
      prefix +
      "-" +
      shortHash(frameId) +
      (suffix ? "-" + suffix : ""),
    128,
  );
}

function artifactRole(prefix: string, frameId: string): string {
  return token("two-stage." + prefix + "." + frameId, 255);
}

function tasksForFrame(
  request: TwoStageAnimationProviderBatchCompileRequest,
  source: NormalizedProviderCandidateRequest,
  catalog: ComfyUIWorkflowCatalog,
  candidateCount: number,
): Readonly<{
  frame: TwoStageAnimationFrameCompilation;
  tasks: readonly SpriteSupervisorTaskInput[];
}> {
  const structuralUnlocked = structuralRequest(source);
  const structuralProfile = resolveProfile(
    catalog,
    structuralUnlocked,
    "structural",
  );
  const structural = lockRequestToProfile(
    structuralUnlocked,
    structuralProfile,
    structuralUnlocked.requestId + ":locked",
  );

  const finalUnlocked = finalProxyRequest(source);
  const finalProfile = resolveProfile(catalog, finalUnlocked, "final");
  const finalProxy = lockRequestToProfile(
    finalUnlocked,
    finalProfile,
    finalUnlocked.requestId + ":locked",
  );

  const frameId = source.frameId ?? source.assetId;
  const structuralRole = artifactRole("structural-raw", frameId);
  const structuralMasterRole = artifactRole("structural-master", frameId);
  const finalMasteredRole = artifactRole("final-mastered", frameId);
  const selectionEvidenceRole = artifactRole("selection-evidence", frameId);
  const selectedRole = artifactRole("selected", frameId);
  const finalMasterRole = artifactRole("frame-master", frameId);

  const structuralTaskId = taskToken("structure", frameId);
  const structuralMasterTaskId = taskToken("structure-master", frameId);
  const selectionTaskId = taskToken("select", frameId);
  const promotionTaskId = taskToken("promote", frameId);
  const tasks: SpriteSupervisorTaskInput[] = [];

  tasks.push({
    id: structuralTaskId,
    stage:
      source.continuityPhase === "in-between" ? "inbetweens" : "key-poses",
    title: "Generate pose-locked structural draft for " + frameId,
    queue: "provider",
    kind: "art.candidate.generate",
    payloadTemplate: normalizeJson(requestInput(structural)),
    requiredCapabilities: [
      "provider.generate",
      "provider.reference-lock",
      "provider.candidate-store",
      "evidence.bundle",
    ],
    staticInputArtifacts: uniqueArtifactIds(structural.references),
    outputBindings: [
      {
        role: structuralRole,
        source: "runtime-result-json",
        pointer: "/candidateArtifacts/0",
        cardinality: "one",
        required: true,
      },
    ],
    maximumAttempts: 3,
    failurePolicy: {
      redriveClassifications: ["transient", "lease-expired", "timeout"],
      maxRedrives: 2,
      reviewCodePrefixes: ["PROVIDER_", "COMFYUI_", "DRAW_THINGS_"],
      abortCodePrefixes: ["ARTIFACT_CONTENT_CORRUPT"],
      reviewOnUnclassified: true,
    },
  });

  tasks.push({
    id: structuralMasterTaskId,
    stage: "mastering",
    title: "Master pose-locked structural draft for " + frameId,
    queue: "media",
    kind: "art.candidate.master-alpha",
    dependencyTaskIds: [structuralTaskId],
    requiredArtifactRoles: [structuralRole],
    payloadTemplate: masterPayload(
      structuralRole,
      structural,
      request.background.matteColour,
    ),
    requiredCapabilities: [
      "media.background-recovery",
      "media.chroma-extract",
      "media.raster",
      "quality.sprite-frame",
      "evidence.bundle",
    ],
    outputBindings: [
      {
        role: structuralMasterRole,
        source: "output-artifact-labels",
        labels: {
          artifactRole: "provider-candidate-alpha-master",
          approvalState: "unapproved",
          qualityState: "passed",
        },
        cardinality: "one",
        required: true,
      },
    ],
    maximumAttempts: 2,
    failurePolicy: {
      redriveClassifications: ["transient", "lease-expired", "timeout"],
      maxRedrives: 1,
      reviewCodePrefixes: ["MASTERING_", "SPRITE_QUALITY_"],
      abortCodePrefixes: ["ARTIFACT_CONTENT_CORRUPT"],
      reviewOnUnclassified: true,
    },
  });

  const finalTaskIds: string[] = [];
  const finalMasterTaskIds: string[] = [];
  for (let candidate = 1; candidate <= candidateCount; candidate += 1) {
    const suffix = String(candidate).padStart(2, "0");
    const finalTaskId = taskToken("final", frameId, suffix);
    const finalMasterTaskId = taskToken("final-master", frameId, suffix);
    const candidateRole = artifactRole(
      "final-candidate-" + suffix,
      frameId,
    );
    finalTaskIds.push(finalTaskId);
    finalMasterTaskIds.push(finalMasterTaskId);
    tasks.push({
      id: finalTaskId,
      stage:
        source.continuityPhase === "in-between" ? "inbetweens" : "key-poses",
      title: "Refine final " + frameId + " candidate " + candidate,
      queue: "provider",
      kind: "art.candidate.edit",
      dependencyTaskIds: [structuralTaskId],
      requiredArtifactRoles: [structuralRole],
      staticInputArtifacts: uniqueArtifactIds(
        finalProxy.references.filter(
          (reference) => reference.role !== "base-image",
        ),
      ),
      payloadTemplate: finalTemplate(finalProxy, structuralRole, candidate),
      requiredCapabilities: [
        "provider.edit",
        "provider.reference-lock",
        "provider.candidate-store",
        "evidence.bundle",
      ],
      outputBindings: [
        {
          role: candidateRole,
          source: "output-artifact-labels",
          labels: {
            artifactRole: "provider-candidate",
            approvalState: "unapproved",
          },
          cardinality: "one",
          required: true,
        },
      ],
      maximumAttempts: 3,
      failurePolicy: {
        redriveClassifications: ["transient", "lease-expired", "timeout"],
        maxRedrives: 2,
        reviewCodePrefixes: ["PROVIDER_", "COMFYUI_", "DRAW_THINGS_"],
        abortCodePrefixes: ["ARTIFACT_CONTENT_CORRUPT"],
        reviewOnUnclassified: true,
      },
    });
    tasks.push({
      id: finalMasterTaskId,
      stage: "mastering",
      title: "Alpha-master final " + frameId + " candidate " + candidate,
      queue: "media",
      kind: "art.candidate.master-alpha",
      dependencyTaskIds: [finalTaskId],
      requiredArtifactRoles: [candidateRole],
      payloadTemplate: masterPayload(
        candidateRole,
        finalProxy,
        request.background.matteColour,
      ),
      requiredCapabilities: [
        "media.background-recovery",
        "media.chroma-extract",
        "media.raster",
        "quality.sprite-frame",
        "evidence.bundle",
      ],
      outputBindings: [
        {
          role: finalMasteredRole,
          source: "output-artifact-labels",
          labels: {
            artifactRole: "provider-candidate-alpha-master",
            approvalState: "unapproved",
            qualityState: "passed",
          },
          cardinality: "one",
          required: true,
        },
      ],
      maximumAttempts: 2,
      failurePolicy: {
        redriveClassifications: ["transient", "lease-expired", "timeout"],
        maxRedrives: 1,
        reviewCodePrefixes: ["MASTERING_", "SPRITE_QUALITY_"],
        abortCodePrefixes: ["ARTIFACT_CONTENT_CORRUPT"],
        reviewOnUnclassified: true,
      },
    });
  }

  tasks.push({
    id: selectionTaskId,
    stage: "family-verification",
    title: "Rank final pose-preserving candidates for " + frameId,
    queue: "selection",
    kind: "art.candidate.select",
    dependencyTaskIds: [structuralMasterTaskId, ...finalMasterTaskIds],
    requiredArtifactRoles: [structuralMasterRole, finalMasteredRole],
    payloadTemplate: normalizeJson({
      schemaVersion: "1.0",
      selectionId: token("two-stage-select-" + shortHash(frameId), 128),
      candidateArtifactIds: { $artifacts: finalMasteredRole },
      referenceArtifactId: { $artifact: structuralMasterRole },
      referenceRole: "pose-locked-structural-draft",
      policy: selectionPolicy(),
      metadata: {
        compilerVersion: TWO_STAGE_ANIMATION_PROVIDER_COMPILER_VERSION,
        frameId,
        clipId: request.plan.clipId,
        batchId: request.batchId,
      },
    }),
    requiredCapabilities: ["selection.compare", "evidence.bundle"],
    outputBindings: [
      {
        role: selectionEvidenceRole,
        source: "runtime-result-json",
        pointer: "/evidenceArtifactId",
        cardinality: "one",
        required: true,
      },
      {
        role: selectedRole,
        source: "runtime-result-json",
        pointer: "/evidence/selectedCandidateArtifactId",
        cardinality: "one",
        required: true,
      },
    ],
    maximumAttempts: 1,
    failurePolicy: {
      reviewCodePrefixes: ["CANDIDATE_SELECTION_"],
      maxRedrives: 0,
      reviewOnUnclassified: true,
    },
  });

  tasks.push({
    id: promotionTaskId,
    stage: "family-verification",
    title: "Promote selected two-stage frame master for " + frameId,
    queue: "selection",
    kind: "art.candidate.promote",
    dependencyTaskIds: [selectionTaskId],
    requiredArtifactRoles: [selectionEvidenceRole, selectedRole],
    payloadTemplate: normalizeJson({
      schemaVersion: "1.0",
      promotionId: token("two-stage-promote-" + shortHash(frameId), 128),
      selectionEvidenceArtifactId: { $artifact: selectionEvidenceRole },
      candidateArtifactId: { $artifact: selectedRole },
      target: {
        namespace: promotionNamespace(request, frameId),
        name: "master",
        expectedGeneration: request.promotion?.expectedGeneration ?? 0,
      },
      approval: { mode: "automatic" },
      actor: request.promotion?.actor ?? "evavo-two-stage-animation",
      metadata: {
        compilerVersion: TWO_STAGE_ANIMATION_PROVIDER_COMPILER_VERSION,
        frameId,
        clipId: request.plan.clipId,
        batchId: request.batchId,
        structuralAdapterId: "draw-things:" + structuralProfile.profileId,
        finalAdapterId: "draw-things:" + finalProfile.profileId,
      },
    }),
    requiredCapabilities: [
      "selection.promote",
      "artifacts.store",
      "evidence.bundle",
    ],
    outputBindings: [
      {
        role: finalMasterRole,
        source: "runtime-result-json",
        pointer: "/masterArtifactId",
        cardinality: "one",
        required: true,
      },
    ],
    maximumAttempts: 1,
    failurePolicy: {
      reviewCodePrefixes: ["CANDIDATE_PROMOTION_"],
      maxRedrives: 0,
      reviewOnUnclassified: true,
    },
  });

  return {
    frame: {
      frameId,
      structuralAdapterId: "draw-things:" + structuralProfile.profileId,
      finalAdapterId: "draw-things:" + finalProfile.profileId,
      structuralRequest: structural,
      finalValidationRequest: finalProxy,
      structuralArtifactRole: structuralRole,
      structuralMasterRole,
      finalMasterRole,
      taskIds: [
        structuralTaskId,
        structuralMasterTaskId,
        ...finalTaskIds,
        ...finalMasterTaskIds,
        selectionTaskId,
        promotionTaskId,
      ],
    },
    tasks,
  };
}

export function compileTwoStageAnimationProviderBatch(
  request: TwoStageAnimationProviderBatchCompileRequest,
): TwoStageAnimationProviderBatchCompilation {
  if (!request || typeof request !== "object") {
    fail("request must be an object");
  }
  verifySpritePlanCompatibility(request);
  if (
    request.background.strategy !== "chroma-key" ||
    typeof request.background.matteColour !== "string" ||
    !/^#[a-fA-F0-9]{6}$/u.test(request.background.matteColour)
  ) {
    fail(
      "two-stage Draw Things animation requires one exact #RRGGBB chroma-key matte",
    );
  }
  const catalog = validateComfyUIWorkflowCatalog(request.drawThingsCatalog);
  const verified = verifiedBatch(request);
  const candidateCount = finalCandidates(request, verified);
  const compiledFrames = verified.requests.map((source) =>
    tasksForFrame(request, source, catalog, candidateCount),
  );
  const tasks = compiledFrames.flatMap((entry) => entry.tasks);
  const releaseRoles = compiledFrames.map(
    (entry) => entry.frame.finalMasterRole,
  );
  const initialArtifactIds = new Set<ArtifactId>();
  for (const source of verified.requests) {
    for (const reference of source.references) {
      initialArtifactIds.add(reference.artifactId);
    }
  }
  const supervisorRequest: SpriteSupervisorCompileRequestInput = {
    schemaVersion: "1.0",
    runId: token(
      "two-stage-" +
        request.plan.clipId +
        "-" +
        shortHash({
          batchId: request.batchId,
          planSha256: verified.planSha256,
          catalogSha256: catalog.catalogSha256,
        }),
      128,
    ),
    spritePlan: request.spritePlan,
    initialArtifactBindings: [
      {
        role: "two-stage.source-artifacts",
        artifactIds: [...initialArtifactIds].sort(),
      },
    ],
    tasks,
    policy: {
      tickDelayMs: 1_000,
      maximumTicks: Math.max(1_000, tasks.length * 8),
      maximumActiveChildren: Math.min(
        32,
        Math.max(2, Math.min(8, candidateCount * 2)),
      ),
      defaultMaximumRedrives: 2,
      defaultMaximumRepairCycles: 0,
      cancelChildrenOnAbort: true,
      reviewOnUnclassifiedFailure: true,
      requireAllPlanStagesCovered: false,
      requireFinalHumanApproval: request.requireFinalHumanApproval ?? false,
      requiredReleaseArtifactRoles: releaseRoles,
    },
    metadata: normalizeJson({
      compilerVersion: TWO_STAGE_ANIMATION_PROVIDER_COMPILER_VERSION,
      animationDirectorPlanSha256: verified.planSha256,
      verifiedPoseControlBindingSha256s:
        verified.poseControlBindingSha256s,
      drawThingsCatalogId: catalog.catalogId,
      drawThingsCatalogVersion: catalog.catalogVersion,
      drawThingsCatalogSha256: catalog.catalogSha256,
      clipId: request.plan.clipId,
      batchId: request.batchId,
      phase: verified.phase,
      localOnly: true,
      structuralStage: "SDXL-or-compatible pose-control",
      finalStage: "Kontext edit refinement",
      ...(request.metadata === undefined
        ? {}
        : { sourceMetadata: request.metadata }),
    }),
  };
  const supervisorWorkflow = compileSpriteSupervisorWorkflow(
    supervisorRequest,
  );
  return {
    schemaVersion: "1.0",
    compilerVersion: TWO_STAGE_ANIMATION_PROVIDER_COMPILER_VERSION,
    batchId: request.batchId,
    clipId: request.plan.clipId,
    phase: verified.phase,
    animationDirectorPlanSha256: verified.planSha256,
    drawThingsCatalogSha256: catalog.catalogSha256,
    frames: compiledFrames.map((entry) => entry.frame),
    supervisorRequest,
    supervisorWorkflow,
    authority: {
      providerExecution: false,
      runtimeSubmission: false,
      creativeApproval: false,
      repositoryMutation: false,
      publication: false,
    },
  };
}
