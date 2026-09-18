
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

interface RuntimeTemporalBinding {
  readonly previousRole?: string;
  readonly nextRole?: string;
  readonly dependencyTaskIds?: readonly string[];
}

function finalTemplate(
  request: NormalizedProviderCandidateRequest,
  structuralRole: string,
  candidateOrdinal: number,
  runtimeTemporal?: RuntimeTemporalBinding,
): JsonValue {
  const input = requestInput(request) as unknown as Record<string, unknown>;
  const references = request.references.map((reference) => {
    if (reference.role === "base-image") {
      return {
        ...reference,
        artifactId: { $artifact: structuralRole },
        note:
          "Supervisor-bound structural draft from the pose-control stage.",
      };
    }
    if (
      reference.role === "previous-key-pose" &&
      runtimeTemporal?.previousRole
    ) {
      return {
        ...reference,
        artifactId: { $artifact: runtimeTemporal.previousRole },
        note: "Supervisor-bound promoted previous key-pose master.",
      };
    }
    if (
      reference.role === "next-key-pose" &&
      runtimeTemporal?.nextRole
    ) {
      return {
        ...reference,
        artifactId: { $artifact: runtimeTemporal.nextRole },
        note: "Supervisor-bound promoted next key-pose master.",
      };
    }
    return reference;
  });
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

function identitySelectionPolicy(): JsonValue {
  return normalizeJson({
    profile: "custom",
    allowAutomaticSelection: true,
    requireReferenceLineage: false,
    requireQualityPassed: true,
    allowedCandidateRoles: ["provider-candidate-alpha-master"],
    alphaVisibleThreshold: 8,
    maximumTranslationPixels: 12,
    maximumEdgeDistancePixels: 24,
    minimumOverallScore: 0.5,
    minimumWinnerMargin: 0,
    metrics: [
      {
        id: "palette-similarity",
        weight: 0.3,
        minimum: 0.42,
        blocking: true,
      },
      {
        id: "visible-area-similarity",
        weight: 0.2,
        minimum: 0.42,
        blocking: true,
      },
      {
        id: "luminance-similarity",
        weight: 0.15,
        minimum: 0.35,
        blocking: false,
      },
      {
        id: "bounds-aspect-similarity",
        weight: 0.1,
        minimum: 0.42,
        blocking: false,
      },
      {
        id: "centroid-similarity",
        weight: 0.1,
        minimum: 0.4,
        blocking: false,
      },
      {
        id: "edge-similarity",
        weight: 0.05,
        minimum: 0.2,
        blocking: false,
      },
      {
        id: "silhouette-iou",
        weight: 0.05,
        minimum: 0.15,
        blocking: false,
      },
      {
        id: "overlap-colour-similarity",
        weight: 0.05,
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
  runtimeTemporal?: RuntimeTemporalBinding,
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
  const poseSelectionEvidenceRole = artifactRole(
    "pose-selection-evidence",
    frameId,
  );
  const poseSelectedRole = artifactRole("pose-selected", frameId);
  const identitySelectionEvidenceRole = artifactRole(
    "identity-selection-evidence",
    frameId,
  );
  const selectedRole = artifactRole("identity-selected", frameId);
  const finalMasterRole = artifactRole("frame-master", frameId);

  const structuralTaskId = taskToken("structure", frameId);
  const structuralMasterTaskId = taskToken("structure-master", frameId);
  const selectionTaskId = taskToken("pose-select", frameId);
  const identitySelectionTaskId = taskToken("identity-select", frameId);
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
      dependencyTaskIds: [
        structuralTaskId,
        ...(runtimeTemporal?.dependencyTaskIds ?? []),
      ],
      requiredArtifactRoles: [
        structuralRole,
        ...(runtimeTemporal?.previousRole
          ? [runtimeTemporal.previousRole]
          : []),
        ...(runtimeTemporal?.nextRole
          ? [runtimeTemporal.nextRole]
          : []),
      ],
      staticInputArtifacts: uniqueArtifactIds(
        finalProxy.references.filter((reference) => {
          if (reference.role === "base-image") return false;
          if (
            reference.role === "previous-key-pose" &&
            runtimeTemporal?.previousRole
          ) {
            return false;
          }
          if (
            reference.role === "next-key-pose" &&
            runtimeTemporal?.nextRole
          ) {
            return false;
          }
          return true;
        }),
      ),
      payloadTemplate: finalTemplate(
        finalProxy,
        structuralRole,
        candidate,
        runtimeTemporal,
      ),
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
        role: poseSelectionEvidenceRole,
        source: "runtime-result-json",
        pointer: "/evidenceArtifactId",
        cardinality: "one",
        required: true,
      },
      {
        role: poseSelectedRole,
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

  const identityReference =
    referenceByRole(finalProxy, "direction-master") ??
    referenceByRole(finalProxy, "canonical-identity");
  if (!identityReference) {
    fail("final refinement request has no identity reference for " + frameId);
  }
  tasks.push({
    id: identitySelectionTaskId,
    stage: "family-verification",
    title: "Verify identity/style lock for " + frameId,
    queue: "selection",
    kind: "art.candidate.select",
    dependencyTaskIds: [selectionTaskId],
    requiredArtifactRoles: [poseSelectedRole],
    staticInputArtifacts: [identityReference.artifactId],
    payloadTemplate: normalizeJson({
      schemaVersion: "1.0",
      selectionId: token(
        "two-stage-identity-" + shortHash(frameId),
        128,
      ),
      candidateArtifactIds: { $artifacts: poseSelectedRole },
      referenceArtifactId: identityReference.artifactId,
      referenceRole:
        identityReference.role === "direction-master"
          ? "direction-identity-lock"
          : "canonical-identity-lock",
      policy: identitySelectionPolicy(),
      metadata: {
        compilerVersion: TWO_STAGE_ANIMATION_PROVIDER_COMPILER_VERSION,
        frameId,
        clipId: request.plan.clipId,
        batchId: request.batchId,
        gate: "identity-style",
      },
    }),
    requiredCapabilities: ["selection.compare", "evidence.bundle"],
    outputBindings: [
      {
        role: identitySelectionEvidenceRole,
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
    dependencyTaskIds: [identitySelectionTaskId],
    requiredArtifactRoles: [identitySelectionEvidenceRole, selectedRole],
    payloadTemplate: normalizeJson({
      schemaVersion: "1.0",
      promotionId: token("two-stage-promote-" + shortHash(frameId), 128),
      selectionEvidenceArtifactId: {
        $artifact: identitySelectionEvidenceRole,
      },
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
        identitySelectionTaskId,
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


export interface TwoStageAnimationClipCompileRequest
  extends Omit<
    TwoStageAnimationProviderBatchCompileRequest,
    "batchId" | "keyPoseArtifactIds" | "finalCandidatesPerFrame"
  > {
  readonly keyPoseCandidatesPerFrame?: number;
  readonly inBetweenCandidatesPerFrame?: number;
  readonly delivery?: Readonly<{
    outputDirectory: string;
    atlasId?: string;
    godotProjectPath?: string;
  }>;
}

export interface TwoStageAnimationClipCompilation {
  readonly schemaVersion: "1.0";
  readonly compilerVersion: typeof TWO_STAGE_ANIMATION_PROVIDER_COMPILER_VERSION;
  readonly clipId: string;
  readonly animationDirectorPlanSha256: string;
  readonly drawThingsCatalogSha256: string;
  readonly frames: readonly TwoStageAnimationFrameCompilation[];
  readonly familyEvidenceRole: string;
  readonly familyManifestRole: string;
  readonly familyCompositeRole: string;
  readonly atlasImageRole?: string;
  readonly atlasDataRole?: string;
  readonly atlasEvidenceRole?: string;
  readonly godotDescriptorRole?: string;
  readonly godotImporterRole?: string;
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

function exactArtifactId(value: string, name: string): ArtifactId {
  if (!ARTIFACT_ID.test(value)) {
    fail(name + " must be a canonical artifact_[sha256] id");
  }
  return value as ArtifactId;
}

function phaseCandidateCount(
  requested: number | undefined,
  maximum: number,
  label: string,
): number {
  const value = requested ?? maximum;
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    fail(label + " must be an integer from 1 to " + maximum);
  }
  return value;
}

function batchRequestForClip(
  request: TwoStageAnimationClipCompileRequest,
  batchId: string,
  keyPoseArtifactIds: Readonly<Record<string, ArtifactId>> | undefined,
): TwoStageAnimationProviderBatchCompileRequest {
  return {
    spritePlan: request.spritePlan,
    plan: request.plan,
    batchId,
    poseControlBindings: request.poseControlBindings,
    ...(keyPoseArtifactIds ? { keyPoseArtifactIds } : {}),
    style: request.style,
    background: request.background,
    ...(request.quality ? { quality: request.quality } : {}),
    drawThingsCatalog: request.drawThingsCatalog,
    ...(request.promotion ? { promotion: request.promotion } : {}),
    ...(request.requireFinalHumanApproval !== undefined
      ? { requireFinalHumanApproval: request.requireFinalHumanApproval }
      : {}),
    ...(request.metadata === undefined ? {} : { metadata: request.metadata }),
  };
}

function frameIdForNumber(
  request: TwoStageAnimationClipCompileRequest,
  frameNumber: number,
): string {
  return (
    request.plan.clipId +
    ":f" +
    String(frameNumber).padStart(3, "0")
  );
}

function familyManifestForClip(
  request: TwoStageAnimationClipCompileRequest,
  frameRoles: ReadonlyMap<number, string>,
): JsonValue {
  const pivot = request.spritePlan.godot.pivot;
  const frames = request.plan.frames.map((frame) => {
    const frameId = frameIdForNumber(request, frame.frame);
    const masterRole = frameRoles.get(frame.frame);
    if (!masterRole) {
      fail("family manifest is missing promoted frame role for " + frameId);
    }
    return {
      id: frameId,
      animation: request.plan.clipId,
      direction: request.plan.direction,
      frameIndex: frame.frame - 1,
      globalFrameIndex: frame.frame - 1,
      durationMs: frame.duration.numeratorMs / frame.duration.denominator,
      pivot,
      baseline: request.spritePlan.godot.ySortOrigin.y,
      groundContact: frame.groundContactRequired,
      layers: [
        {
          layerId: "identity-core",
          artifactId: { $artifact: masterRole },
          offset: { x: 0, y: 0 },
          opacity: 1,
        },
      ],
    };
  });
  const identityFrameId = frameIdForNumber(request, 1);
  return normalizeJson({
    schemaVersion: "1.0",
    familyId: token(
      request.spritePlan.asset.assetId +
        "-" +
        request.plan.clipId +
        "-" +
        request.plan.direction +
        "-two-stage-family",
      128,
    ),
    canvas: request.plan.canvas,
    layerDefinitions: [
      {
        id: "identity-core",
        role: "identity-core",
        sourcePolicy: "per-frame",
        required: true,
        contributesToComposite: true,
        contributesToIdentity: true,
        mustRemainSeparate: false,
        zIndex: 0,
        blendMode: "normal",
        minimumVisibleFraction: 0.001,
        registrationTolerancePixels:
          request.plan.qualityRequirements.maximumRootStepPixels,
        allowedOccludedBy: [],
        occludes: [],
      },
    ],
    frames,
    policy: {
      identityReferenceFrameId: identityFrameId,
      requireDeclaredComposite: false,
      requireReferenceLineage: false,
      requireQualityPassed: true,
      alphaVisibleThreshold: 8,
      maximumInputBytes: 64 * 1024 * 1024,
      maximumPixels:
        request.plan.canvas.width * request.plan.canvas.height,
      maximumFrames: 64,
      decodeConcurrency: 4,
      maximumTranslationPixels:
        request.plan.qualityRequirements.maximumRootStepPixels,
      maximumEdgeDistancePixels: 16,
      pivotTolerancePixels: 0,
      groundContactTolerancePixels:
        request.plan.qualityRequirements.plantedFootDriftTolerancePixels,
      minimumCanonicalVisibleAreaSimilarity: 0.58,
      minimumCanonicalPaletteSimilarity: 0.5,
      minimumCanonicalCentroidSimilarity: 0.58,
      minimumAdjacentVisibleAreaSimilarity: 0.52,
      minimumAdjacentPaletteSimilarity: 0.46,
      minimumAdjacentCentroidSimilarity: 0.52,
      minimumLoopClosureSimilarity:
        request.plan.qualityRequirements.loopClosureRequired ? 0.5 : 0,
      compositeChannelTolerance: 0,
      maximumCompositeMeanError: 0,
      maximumCompositeMismatchFraction: 0,
    },
    metadata: {
      compilerVersion: TWO_STAGE_ANIMATION_PROVIDER_COMPILER_VERSION,
      spritePlanId: request.spritePlan.planId,
      spritePlanSha256: request.spritePlan.planSha256,
      clipId: request.plan.clipId,
      direction: request.plan.direction,
      motionStyle: request.plan.motionStyle,
      fps: request.plan.fps,
      loop: request.plan.loop,
      localOnly: true,
    },
  });
}

export function compileTwoStageAnimationClip(
  request: TwoStageAnimationClipCompileRequest,
): TwoStageAnimationClipCompilation {
  if (!request || typeof request !== "object") {
    fail("request must be an object");
  }
  verifySpritePlanCompatibility(request as TwoStageAnimationProviderBatchCompileRequest);
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
  const keyBatch = request.plan.generationBatches.find(
    (batch) => batch.phase === "key-pose",
  );
  if (!keyBatch) {
    fail("Animation Director plan contains no key-pose batch");
  }
  const inBetweenBatches = request.plan.generationBatches.filter(
    (batch) => batch.phase === "in-between",
  );
  if (!inBetweenBatches.length) {
    fail("Animation Director plan contains no in-between batches");
  }

  const keyRequest = batchRequestForClip(request, keyBatch.id, undefined);
  const verifiedKeys = verifiedBatch(keyRequest);
  const keyCandidateCount = phaseCandidateCount(
    request.keyPoseCandidatesPerFrame,
    keyBatch.maximumCandidatesPerFrame,
    "keyPoseCandidatesPerFrame",
  );
  const compiledKeys = verifiedKeys.requests.map((source) =>
    tasksForFrame(
      keyRequest,
      source,
      catalog,
      keyCandidateCount,
    ),
  );

  const compiledByFrameNumber = new Map<
    number,
    Readonly<{
      frame: TwoStageAnimationFrameCompilation;
      tasks: readonly SpriteSupervisorTaskInput[];
    }>
  >();
  for (const compiled of compiledKeys) {
    const frameNumber = Number(
      compiled.frame.frameId.split(":f").at(-1),
    );
    if (!Number.isInteger(frameNumber)) {
      fail("compiled key frame id is invalid: " + compiled.frame.frameId);
    }
    compiledByFrameNumber.set(frameNumber, compiled);
  }

  const placeholder = exactArtifactId(
    request.plan.canonicalIdentityArtifactId,
    "canonicalIdentityArtifactId",
  );
  for (const batch of inBetweenBatches) {
    const placeholderKeyPoses = Object.fromEntries(
      batch.dependsOnFrames.map((frameNumber) => [
        String(frameNumber),
        placeholder,
      ]),
    ) as Readonly<Record<string, ArtifactId>>;
    const batchRequest = batchRequestForClip(
      request,
      batch.id,
      placeholderKeyPoses,
    );
    const verified = verifiedBatch(batchRequest);
    const candidateCount = phaseCandidateCount(
      request.inBetweenCandidatesPerFrame,
      batch.maximumCandidatesPerFrame,
      "inBetweenCandidatesPerFrame",
    );
    const previousFrame = batch.dependsOnFrames[0];
    const nextFrame = batch.dependsOnFrames[1];
    if (previousFrame === undefined || nextFrame === undefined) {
      fail("in-between batch " + batch.id + " must declare two key-pose dependencies");
    }
    const previousCompiled = compiledByFrameNumber.get(previousFrame);
    const nextCompiled = compiledByFrameNumber.get(nextFrame);
    if (!previousCompiled || !nextCompiled) {
      fail(
        "in-between batch " +
          batch.id +
          " depends on key poses that were not compiled first",
      );
    }
    const runtimeTemporal: RuntimeTemporalBinding = {
      previousRole: previousCompiled.frame.finalMasterRole,
      nextRole: nextCompiled.frame.finalMasterRole,
      dependencyTaskIds: [
        taskToken("promote", previousCompiled.frame.frameId),
        taskToken("promote", nextCompiled.frame.frameId),
      ],
    };
    for (const source of verified.requests) {
      const compiled = tasksForFrame(
        batchRequest,
        source,
        catalog,
        candidateCount,
        runtimeTemporal,
      );
      const frameNumber = Number(
        compiled.frame.frameId.split(":f").at(-1),
      );
      if (!Number.isInteger(frameNumber)) {
        fail("compiled in-between frame id is invalid: " + compiled.frame.frameId);
      }
      compiledByFrameNumber.set(frameNumber, compiled);
    }
  }

  const ordered = [...compiledByFrameNumber.entries()]
    .sort((left, right) => left[0] - right[0])
    .map((entry) => entry[1]);
  if (ordered.length !== request.plan.frames.length) {
    fail(
      "compiled clip frame count " +
        ordered.length +
        " does not match Animation Director frame count " +
        request.plan.frames.length,
    );
  }

  const frameRoles = new Map(
    ordered.map((entry, index) => [
      index + 1,
      entry.frame.finalMasterRole,
    ]),
  );
  const familyEvidenceRole = "two-stage.family-evidence";
  const familyManifestRole = "two-stage.family-manifest";
  const familyCompositeRole = "two-stage.family-composites";
  const familyTaskId = taskToken("family", request.plan.clipId);
  const familyTask: SpriteSupervisorTaskInput = {
    id: familyTaskId,
    stage: "family-verification",
    title:
      "Verify the complete two-stage " +
      request.plan.clipId +
      " animation family",
    queue: "selection",
    kind: "sprite.family.verify",
    dependencyTaskIds: ordered.map((entry) =>
      taskToken("promote", entry.frame.frameId),
    ),
    requiredArtifactRoles: ordered.map(
      (entry) => entry.frame.finalMasterRole,
    ),
    payloadTemplate: familyManifestForClip(request, frameRoles),
    requiredCapabilities: [
      "sprite.family.verify",
      "media.layer-compose",
      "selection.compare",
      "evidence.bundle",
    ],
    outputBindings: [
      {
        role: familyEvidenceRole,
        source: "output-artifact-labels",
        labels: {
          artifactRole: "sprite-family-consistency-evidence",
          qualityState: "passed",
        },
        cardinality: "one",
        required: true,
      },
      {
        role: familyManifestRole,
        source: "output-artifact-labels",
        labels: {
          artifactRole: "sprite-family-normalized-manifest",
        },
        cardinality: "one",
        required: true,
      },
      {
        role: familyCompositeRole,
        source: "output-artifact-labels",
        labels: {
          artifactRole: "layered-frame-composite",
          qualityState: "passed",
        },
        cardinality: "many",
        required: true,
      },
    ],
    maximumAttempts: 1,
    failurePolicy: {
      reviewCodePrefixes: ["SPRITE_FAMILY_"],
      maxRedrives: 0,
      reviewOnUnclassified: true,
    },
  };

  const tasks: SpriteSupervisorTaskInput[] = [
    ...ordered.flatMap((entry) => entry.tasks),
    familyTask,
  ];
  const atlasImageRole = "two-stage.atlas-image";
  const atlasDataRole = "two-stage.atlas-data";
  const atlasEvidenceRole = "two-stage.atlas-evidence";
  const godotDescriptorRole = "two-stage.godot-descriptor";
  const godotImporterRole = "two-stage.godot-importer";
  if (request.delivery) {
    if (
      typeof request.delivery.outputDirectory !== "string" ||
      !request.delivery.outputDirectory.trim() ||
      request.delivery.outputDirectory.includes("\\0")
    ) {
      fail("delivery.outputDirectory must be one non-empty safe path string");
    }
    if (
      request.delivery.atlasId !== undefined &&
      (typeof request.delivery.atlasId !== "string" ||
        !request.delivery.atlasId.trim())
    ) {
      fail("delivery.atlasId must be a non-empty string when supplied");
    }
    if (
      request.delivery.godotProjectPath !== undefined &&
      (typeof request.delivery.godotProjectPath !== "string" ||
        !request.delivery.godotProjectPath.trim() ||
        request.delivery.godotProjectPath.includes("\\0"))
    ) {
      fail("delivery.godotProjectPath must be one non-empty safe path when supplied");
    }
    tasks.push({
      id: taskToken("atlas", request.plan.clipId),
      stage: "atlas",
      title:
        "Build deterministic verified-family atlas for " +
        request.plan.clipId,
      queue: "media",
      kind: "sprite.atlas.build",
      dependencyTaskIds: [familyTaskId],
      requiredArtifactRoles: [
        familyManifestRole,
        familyEvidenceRole,
        familyCompositeRole,
      ],
      payloadTemplate: normalizeJson({
        familyManifestArtifactId: { $artifact: familyManifestRole },
        familyEvidenceArtifactId: { $artifact: familyEvidenceRole },
        outputDirectory: request.delivery.outputDirectory.trim(),
        ...(request.delivery.atlasId
          ? { atlasId: request.delivery.atlasId.trim() }
          : {}),
        ...(request.delivery.godotProjectPath
          ? { godotProjectPath: request.delivery.godotProjectPath.trim() }
          : {}),
      }),
      requiredCapabilities: [
        "atlas.pack",
        "media.raster",
        "evidence.bundle",
        ...(request.delivery.godotProjectPath ? ["godot.export"] : []),
      ],
      outputBindings: [
        {
          role: atlasImageRole,
          source: "output-artifact-labels",
          labels: {
            artifactRole: "atlas-image",
            qualityState: "passed",
          },
          cardinality: "one",
          required: true,
        },
        {
          role: atlasDataRole,
          source: "output-artifact-labels",
          labels: {
            artifactRole: "atlas-data",
            qualityState: "passed",
          },
          cardinality: "one",
          required: true,
        },
        {
          role: atlasEvidenceRole,
          source: "output-artifact-labels",
          labels: {
            artifactRole: "atlas-evidence",
            qualityState: "passed",
          },
          cardinality: "one",
          required: true,
        },
        ...(request.delivery.godotProjectPath
          ? [
              {
                role: godotDescriptorRole,
                source: "output-artifact-labels" as const,
                labels: {
                  artifactRole: "godot-descriptor",
                  qualityState: "passed",
                },
                cardinality: "one" as const,
                required: true,
              },
              {
                role: godotImporterRole,
                source: "output-artifact-labels" as const,
                labels: {
                  artifactRole: "godot-importer",
                  qualityState: "passed",
                },
                cardinality: "one" as const,
                required: true,
              },
            ]
          : []),
      ],
      maximumAttempts: 1,
      failurePolicy: {
        reviewCodePrefixes: ["SPRITE_ATLAS_", "GODOT_", "ATLAS_FAMILY_"],
        maxRedrives: 0,
        reviewOnUnclassified: true,
      },
    });
  }
  const initialArtifactIds = new Set<ArtifactId>([
    exactArtifactId(
      request.plan.canonicalIdentityArtifactId,
      "canonicalIdentityArtifactId",
    ),
    ...Object.values(request.poseControlBindings).map((binding) =>
      exactArtifactId(binding.artifactId, "poseControlBindings.artifactId"),
    ),
  ]);
  if (request.plan.directionMasterArtifactId) {
    initialArtifactIds.add(
      exactArtifactId(
        request.plan.directionMasterArtifactId,
        "directionMasterArtifactId",
      ),
    );
  }

  const planSha256 = verifiedKeys.planSha256;
  const bindingSha256s = [
    ...new Set(
      Object.values(request.poseControlBindings).map(
        (binding) => binding.bindingSha256,
      ),
    ),
  ].sort();
  const supervisorRequest: SpriteSupervisorCompileRequestInput = {
    schemaVersion: "1.0",
    runId: token(
      "two-stage-clip-" +
        request.plan.clipId +
        "-" +
        shortHash({
          planSha256,
          catalogSha256: catalog.catalogSha256,
          bindingSha256s,
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
      maximumTicks: Math.max(2_000, tasks.length * 10),
      maximumActiveChildren: 1,
      defaultMaximumRedrives: 2,
      defaultMaximumRepairCycles: 0,
      cancelChildrenOnAbort: true,
      reviewOnUnclassifiedFailure: true,
      requireAllPlanStagesCovered: false,
      requireFinalHumanApproval:
        request.requireFinalHumanApproval ?? false,
      requiredReleaseArtifactRoles: [
        familyEvidenceRole,
        familyManifestRole,
        ...(request.delivery
          ? [atlasImageRole, atlasDataRole, atlasEvidenceRole]
          : []),
        ...(request.delivery?.godotProjectPath
          ? [godotDescriptorRole, godotImporterRole]
          : []),
      ],
    },
    metadata: normalizeJson({
      compilerVersion: TWO_STAGE_ANIMATION_PROVIDER_COMPILER_VERSION,
      mode: "full-clip",
      animationDirectorPlanSha256: planSha256,
      verifiedPoseControlBindingSha256s: bindingSha256s,
      drawThingsCatalogId: catalog.catalogId,
      drawThingsCatalogVersion: catalog.catalogVersion,
      drawThingsCatalogSha256: catalog.catalogSha256,
      clipId: request.plan.clipId,
      direction: request.plan.direction,
      frameCount: ordered.length,
      localOnly: true,
      maximumActiveChildren: 1,
      familyVerificationRequired: true,
      atlasDeliveryRequested: request.delivery !== undefined,
      godotDeliveryRequested:
        request.delivery?.godotProjectPath !== undefined,
      structuralStage: "SDXL-or-compatible pose-control",
      finalStage: "Kontext edit refinement",
      temporalDependencySource: "promoted-key-pose-masters",
      ...(request.metadata === undefined
        ? {}
        : { sourceMetadata: request.metadata }),
    }),
  };
  const supervisorWorkflow =
    compileSpriteSupervisorWorkflow(supervisorRequest);
  return {
    schemaVersion: "1.0",
    compilerVersion: TWO_STAGE_ANIMATION_PROVIDER_COMPILER_VERSION,
    clipId: request.plan.clipId,
    animationDirectorPlanSha256: planSha256,
    drawThingsCatalogSha256: catalog.catalogSha256,
    frames: ordered.map((entry) => entry.frame),
    familyEvidenceRole,
    familyManifestRole,
    familyCompositeRole,
    ...(request.delivery
      ? {
          atlasImageRole,
          atlasDataRole,
          atlasEvidenceRole,
        }
      : {}),
    ...(request.delivery?.godotProjectPath
      ? {
          godotDescriptorRole,
          godotImporterRole,
        }
      : {}),
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
