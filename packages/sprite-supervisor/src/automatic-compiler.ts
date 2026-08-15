import {
  normalizeJson,
  type ArtifactId,
  type JsonValue,
} from "@evavo/art-artifacts";
import type {
  CompiledArtDirectionContract,
  CompiledArtLayerDecision,
} from "@evavo/art-direction";
import type {
  CompiledSpriteMotionTopology,
  CompiledSpriteProductionPlan,
  SpritePlannedClip,
  SpritePlannedFrame,
} from "@evavo/art-sprite-planner";

import { resolveAutomaticArtDirection } from "./automatic-art-direction.js";
import {
  automaticMotionBindingForFrame,
  automaticMotionGroundContactRequired,
  automaticMotionPrompt,
  compileAutomaticSpriteMotionTopology,
} from "./automatic-motion-topology.js";
import {
  AUTOMATIC_SPRITE_WORKFLOW_PROTOCOL_VERSION,
  type AutomaticSpriteProductionUnit,
  type AutomaticSpriteWorkflowAnalysis,
  type AutomaticSpriteWorkflowBlocker,
  type AutomaticSpriteWorkflowCompileRequestInput,
  type AutomaticSpriteWorkflowWarning,
  type CompiledAutomaticSpriteWorkflow,
  type NormalizedAutomaticSpriteWorkflowCompileRequest,
  type ResolvedAutomaticSpriteWorkflowCompileRequest,
} from "./automatic-types.js";
import {
  automaticSpriteWorkflowRequestSha256,
  validateAutomaticSpriteWorkflowRequest,
} from "./automatic-validation.js";
import { compileSpriteSupervisorWorkflow } from "./compiler.js";
import type {
  SpriteSupervisorArtifactBindingInput,
  SpriteSupervisorCompileRequestInput,
  SpriteSupervisorTaskInput,
} from "./types.js";
import { SpriteSupervisorError } from "./types.js";
import { spriteSupervisorSha256 } from "./validation.js";

const SUPPORTED_FAMILY_LAYER_ROLES = new Set([
  "identity-core",
  "costume",
  "hair",
  "shadow",
  "equipment",
  "weapon",
  "effect",
  "emission",
  "normal",
  "collision",
  "occlusion",
  "guide",
]);

const FAMILY_VISIBLE_ROLES = new Set([
  "identity-core",
  "costume",
  "hair",
  "shadow",
  "equipment",
  "weapon",
  "effect",
  "emission",
]);

interface UnitDraft {
  readonly id: string;
  readonly kind: AutomaticSpriteProductionUnit["kind"];
  readonly phase: AutomaticSpriteProductionUnit["phase"];
  readonly frame?: SpritePlannedFrame;
  readonly clip?: SpritePlannedClip;
  readonly direction: string;
  readonly layerRole: string;
  readonly selectionReferenceRole: string;
  readonly dependencyMasterRoles: readonly string[];
  readonly masterArtifactRole: string;
  readonly motion?: AutomaticSpriteProductionUnit["motion"];
}

interface UnitPipeline {
  readonly unit: AutomaticSpriteProductionUnit;
  readonly candidateTaskIds: readonly string[];
  readonly masteringTaskIds: readonly string[];
  readonly selectionTaskId: string;
  readonly promotionTaskId: string;
  readonly candidateArtifactRoles: readonly string[];
  readonly masteredArtifactRole: string;
  readonly selectionEvidenceRole: string;
  readonly selectedCandidateRole: string;
  readonly tasks: readonly SpriteSupervisorTaskInput[];
}

function blocker(
  code: string,
  message: string,
  details?: JsonValue,
): AutomaticSpriteWorkflowBlocker {
  return { code, message, ...(details === undefined ? {} : { details }) };
}

function warning(
  code: string,
  message: string,
  details?: JsonValue,
): AutomaticSpriteWorkflowWarning {
  return { code, message, ...(details === undefined ? {} : { details }) };
}

function token(value: string, maximum = 96): string {
  const normalized = value
    .replace(/[^A-Za-z0-9._:-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maximum);
  return normalized || "unit";
}

function shortHash(value: string): string {
  return spriteSupervisorSha256(value).slice(0, 14);
}

function taskId(prefix: string, unitId: string, suffix = ""): string {
  return token(
    `auto-${prefix}-${shortHash(unitId)}${suffix ? `-${suffix}` : ""}`,
    128,
  );
}

function role(prefix: string, value: string): string {
  return token(`automatic.${prefix}.${value}`, 255);
}

function initialRole(name: string): string {
  return `automatic.${name}`;
}

function masterRoleFor(
  kind: UnitDraft["kind"],
  direction: string,
  frameId: string | undefined,
  layerRole: string,
): string {
  if (kind === "direction-master") {
    return role("direction-master", direction);
  }
  return role("frame-master", `${frameId ?? direction}.${layerRole}`);
}

function promotionNamespace(
  request: ResolvedAutomaticSpriteWorkflowCompileRequest,
  unit: AutomaticSpriteProductionUnit,
): string {
  const segments = [
    request.promotion.namespace,
    token(request.spritePlan.project.projectId),
    token(request.spritePlan.asset.assetId),
    request.promotion.referencePrefix,
    unit.kind,
    ...(unit.clipId ? [token(unit.clipId)] : []),
    token(unit.direction),
    token(unit.layerRole),
  ];
  return segments.join("/");
}

function promotionName(unit: AutomaticSpriteProductionUnit): string {
  if (unit.kind === "direction-master") return "master";
  return token(`frame-${String(unit.frameIndex ?? 0).padStart(4, "0")}`);
}

function artLayerDecision(
  contract: CompiledArtDirectionContract,
  roleName: string,
): CompiledArtLayerDecision | undefined {
  return contract.production.layers.find((entry) => entry.role === roleName);
}

function includedLayerDecisions(
  request: ResolvedAutomaticSpriteWorkflowCompileRequest,
  blockers: AutomaticSpriteWorkflowBlocker[],
  warnings: AutomaticSpriteWorkflowWarning[],
): Readonly<{
  included: readonly CompiledArtLayerDecision[];
  deferred: readonly string[];
}> {
  const decisions = request.artDirectionContract.production.layers;
  const included: CompiledArtLayerDecision[] = [];
  const deferred = new Set<string>();
  const identity = decisions.find((entry) => entry.role === "identity-core");
  included.push(
    identity ?? {
      id: "identity-core",
      role: "identity-core",
      treatment: "separate-per-frame",
      required: true,
      contributesToColour: true,
      contributesToIdentity: true,
      interchangeable: false,
      timingIndependent: false,
      zOrder: 0,
      reason: "The complete authored character frame is the automatic workflow identity source.",
      exportPolicy: "source-and-runtime",
    },
  );

  for (const decision of decisions) {
    if (decision.role === "identity-core") continue;
    const renderable =
      decision.contributesToColour &&
      decision.treatment !== "baked" &&
      decision.treatment !== "guide-only" &&
      decision.treatment !== "engine-sidecar" &&
      decision.treatment !== "runtime-rig";
    if (!renderable) {
      if (decision.required) deferred.add(decision.role);
      continue;
    }
    if (!request.policy.includeSeparateVisibleLayers) {
      deferred.add(decision.role);
      continue;
    }
    if (!SUPPORTED_FAMILY_LAYER_ROLES.has(decision.role)) {
      const issue = blocker(
        "AUTOMATIC_SPRITE_WORKFLOW_LAYER_ROLE_UNSUPPORTED",
        `Visible layer role ${decision.role} is not supported by the current layered-family verifier.`,
        normalizeJson({ role: decision.role, treatment: decision.treatment }),
      );
      if (decision.required || request.policy.failOnMissingLayerReferences) {
        blockers.push(issue);
      } else {
        warnings.push(warning(issue.code, issue.message, issue.details));
        deferred.add(decision.role);
      }
      continue;
    }
    const reference =
      request.references.layerReferenceArtifactIds[decision.role];
    if (!reference) {
      const issue = blocker(
        "AUTOMATIC_SPRITE_WORKFLOW_LAYER_REFERENCE_MISSING",
        `Separate layer ${decision.role} requires one approved layer reference artifact.`,
        normalizeJson({ role: decision.role, required: decision.required }),
      );
      if (decision.required || request.policy.failOnMissingLayerReferences) {
        blockers.push(issue);
      } else {
        warnings.push(warning(issue.code, issue.message, issue.details));
        deferred.add(decision.role);
      }
      continue;
    }
    included.push(decision);
  }

  if (deferred.size) {
    warnings.push(
      warning(
        "AUTOMATIC_SPRITE_WORKFLOW_LAYERS_DEFERRED",
        "Engine sidecars, guides, rigs or unsupported visible layers remain outside this automatic image-family run.",
        normalizeJson({ roles: [...deferred].sort() }),
      ),
    );
  }
  return { included, deferred: [...deferred].sort() };
}

function groupFrames(
  plan: CompiledSpriteProductionPlan,
): ReadonlyMap<string, readonly SpritePlannedFrame[]> {
  const groups = new Map<string, SpritePlannedFrame[]>();
  for (const frame of plan.frames.filter((entry) => entry.authored)) {
    const key = `${frame.clipId}\0${frame.direction}`;
    const values = groups.get(key) ?? [];
    values.push(frame);
    groups.set(key, values);
  }
  for (const [key, values] of groups) {
    groups.set(
      key,
      [...values].sort((left, right) => left.frameIndex - right.frameIndex),
    );
  }
  return groups;
}

function previousAndNextKeyPoses(
  frame: SpritePlannedFrame,
  group: readonly SpritePlannedFrame[],
): Readonly<{ previous?: SpritePlannedFrame; next?: SpritePlannedFrame }> {
  const keys = group.filter((entry) => entry.keyPose);
  const previous = [...keys]
    .reverse()
    .find((entry) => entry.frameIndex < frame.frameIndex);
  const next = keys.find((entry) => entry.frameIndex > frame.frameIndex);
  return {
    ...(previous === undefined ? {} : { previous }),
    ...(next === undefined ? {} : { next }),
  };
}

function createUnitDrafts(
  request: ResolvedAutomaticSpriteWorkflowCompileRequest,
  motionTopology: CompiledSpriteMotionTopology,
  layerDecisions: readonly CompiledArtLayerDecision[],
  blockers: AutomaticSpriteWorkflowBlocker[],
  warnings: AutomaticSpriteWorkflowWarning[],
): readonly UnitDraft[] {
  const plan = request.spritePlan;
  const units: UnitDraft[] = [];
  const directionMasterRoles = new Map<string, string>();
  const directionMasterUnitIds = new Map<string, string>();
  const authoredDirections = plan.directions.filter((entry) => entry.authored);
  const derivedDirections = plan.directions.filter((entry) => !entry.authored);
  if (derivedDirections.length) {
    const issue = blocker(
      "AUTOMATIC_SPRITE_WORKFLOW_DERIVED_DIRECTION_UNSUPPORTED",
      "The current automatic workflow authors image units and does not silently mirror runtime directions. Author every direction or add the deterministic mirror worker before execution.",
      normalizeJson({
        directions: derivedDirections.map((entry) => ({
          name: entry.name,
          mirrorOf: entry.mirrorOf ?? null,
        })),
      }),
    );
    if (request.policy.failOnDerivedDirections) blockers.push(issue);
    else warnings.push(warning(issue.code, issue.message, issue.details));
  }
  if (!request.policy.includeDirectionMasters) {
    blockers.push(
      blocker(
        "AUTOMATIC_SPRITE_WORKFLOW_DIRECTION_MASTERS_REQUIRED",
        "Executable key-pose and in-between generation requires approved direction masters.",
      ),
    );
  } else {
    for (const direction of authoredDirections) {
      const unitId = `direction:${direction.name}:identity-core`;
      const masterArtifactRole = masterRoleFor(
        "direction-master",
        direction.name,
        undefined,
        "identity-core",
      );
      directionMasterRoles.set(direction.name, masterArtifactRole);
      directionMasterUnitIds.set(direction.name, unitId);
      units.push({
        id: unitId,
        kind: "direction-master",
        phase: "direction-master",
        direction: direction.name,
        layerRole: "identity-core",
        selectionReferenceRole: initialRole("canonical-identity"),
        dependencyMasterRoles: [],
        masterArtifactRole,
      });
    }
  }

  const clipById = new Map(plan.clips.map((clip) => [clip.id, clip]));
  const groups = groupFrames(plan);
  const identityUnitByFrame = new Map<string, UnitDraft>();
  const authoredFrames = plan.frames.filter((entry) => entry.authored);
  for (const frame of authoredFrames) {
    const clip = clipById.get(frame.clipId);
    if (!clip) {
      blockers.push(
        blocker(
          "AUTOMATIC_SPRITE_WORKFLOW_CLIP_MISSING",
          `Frame ${frame.id} references missing clip ${frame.clipId}.`,
        ),
      );
      continue;
    }
    if (frame.keyPose && !request.policy.includeKeyPoses) continue;
    if (!frame.keyPose && !request.policy.includeInBetweens) continue;
    const directionRole = directionMasterRoles.get(frame.direction);
    const directionUnitId = directionMasterUnitIds.get(frame.direction);
    if (!directionRole || !directionUnitId) continue;
    const motion = automaticMotionBindingForFrame(motionTopology, frame.id);
    const dependencies = [directionRole];
    let selectionReferenceRole = directionRole;
    const phase = frame.keyPose ? "key-pose" : "in-between";
    if (!frame.keyPose) {
      const group = groups.get(`${frame.clipId}\0${frame.direction}`) ?? [];
      const neighbours = previousAndNextKeyPoses(frame, group);
      if (!neighbours.previous || !neighbours.next) {
        blockers.push(
          blocker(
            "AUTOMATIC_SPRITE_WORKFLOW_NEIGHBOUR_KEY_POSE_MISSING",
            `In-between frame ${frame.id} requires approved previous and next key poses.`,
            normalizeJson({
              clipId: frame.clipId,
              direction: frame.direction,
              frameIndex: frame.frameIndex,
            }),
          ),
        );
        continue;
      }
      const previousRole = masterRoleFor(
        "frame",
        frame.direction,
        neighbours.previous.id,
        "identity-core",
      );
      const nextRole = masterRoleFor(
        "frame",
        frame.direction,
        neighbours.next.id,
        "identity-core",
      );
      dependencies.push(previousRole, nextRole);
      selectionReferenceRole = previousRole;
    }
    const unit: UnitDraft = {
      id: `frame:${frame.id}:identity-core`,
      kind: "frame",
      phase,
      frame,
      clip,
      direction: frame.direction,
      layerRole: "identity-core",
      selectionReferenceRole,
      dependencyMasterRoles: [...new Set(dependencies)],
      motion,
      masterArtifactRole: masterRoleFor(
        "frame",
        frame.direction,
        frame.id,
        "identity-core",
      ),
    };
    identityUnitByFrame.set(frame.id, unit);
    units.push(unit);
  }

  for (const decision of layerDecisions) {
    if (decision.role === "identity-core") continue;
    const layerReferenceRole = role("layer-reference", decision.role);
    for (const frame of authoredFrames) {
      const identityUnit = identityUnitByFrame.get(frame.id);
      if (!identityUnit) continue;
      units.push({
        id: `layer:${frame.id}:${decision.role}`,
        kind: "layer",
        phase: identityUnit.phase,
        frame,
        ...(identityUnit.clip === undefined ? {} : { clip: identityUnit.clip }),
        direction: frame.direction,
        layerRole: decision.role,
        selectionReferenceRole: layerReferenceRole,
        dependencyMasterRoles: [
          identityUnit.masterArtifactRole,
          ...identityUnit.dependencyMasterRoles,
        ],
        ...(identityUnit.motion === undefined ? {} : { motion: identityUnit.motion }),
        masterArtifactRole: masterRoleFor(
          "layer",
          frame.direction,
          frame.id,
          decision.role,
        ),
      });
    }
  }

  if (!request.policy.includeKeyPoses && !request.policy.includeInBetweens) {
    blockers.push(
      blocker(
        "AUTOMATIC_SPRITE_WORKFLOW_FRAME_PRODUCTION_DISABLED",
        "At least one of key-pose or in-between production must be enabled.",
      ),
    );
  }
  if (!request.policy.includeFamilyVerification) {
    blockers.push(
      blocker(
        "AUTOMATIC_SPRITE_WORKFLOW_FAMILY_VERIFICATION_REQUIRED",
        "Automatic release requires complete layered-family verification.",
      ),
    );
  }
  return units;
}

function styleEnvelope(contract: CompiledArtDirectionContract): JsonValue {
  return normalizeJson({
    styleName: contract.preset.title,
    intent: contract.style.intent,
    mustHave: contract.style.mustHave,
    mustAvoid: contract.style.mustAvoid,
    identityLocks: contract.provider.immutableLocks,
    palette: [
      `mode:${contract.style.palette.mode}`,
      `maximum-colours:${contract.style.palette.maxColours}`,
      ...contract.style.palette.colours,
    ],
    lineTreatment: contract.style.lineTreatment,
    materials: contract.style.materialLanguage,
    cameraRules: [
      `projection:${contract.style.camera.projection}`,
      `yaw:${contract.style.camera.yawDegrees}`,
      `pitch:${contract.style.camera.pitchDegrees}`,
      `roll:${contract.style.camera.rollDegrees}`,
      `mirroring:${contract.style.camera.mirroring}`,
    ],
    compositionRules: [
      ...contract.style.compositionRules,
      ...contract.production.shot.framing,
    ],
    eraRules: [
      contract.style.era,
      ...(contract.style.antiGeneric.requireHistoricalPlausibility
        ? ["Historical plausibility is blocking."]
        : []),
    ],
  });
}

function providerReferences(
  request: ResolvedAutomaticSpriteWorkflowCompileRequest,
  unit: AutomaticSpriteProductionUnit,
): JsonValue[] {
  const references: JsonValue[] = [
    {
      artifactId: { $artifact: initialRole("canonical-identity") },
      role: "canonical-identity",
      strength: 1,
      required: true,
    },
  ];
  const dependencyRoles = new Set(unit.dependencyMasterRoles);
  const directionRole = [...dependencyRoles].find((entry) =>
    entry.startsWith("automatic.direction-master."),
  );
  if (directionRole) {
    references.push({
      artifactId: { $artifact: directionRole },
      role: "direction-master",
      strength: 1,
      required: true,
    });
  }
  const keyRoles = [...dependencyRoles].filter((entry) =>
    entry.startsWith("automatic.frame-master."),
  );
  if (unit.phase === "in-between") {
    const keyPoseRoles = keyRoles.filter((entry) =>
      entry.endsWith(".identity-core"),
    );
    if (keyPoseRoles[0]) {
      references.push({
        artifactId: { $artifact: keyPoseRoles[0] },
        role: "previous-key-pose",
        strength: 1,
        required: true,
      });
    }
    if (keyPoseRoles[1]) {
      references.push({
        artifactId: { $artifact: keyPoseRoles[1] },
        role: "next-key-pose",
        strength: 1,
        required: true,
      });
    }
  }
  if (unit.kind === "layer") {
    const identityFrameRole = keyRoles.find((entry) =>
      entry.endsWith(".identity-core"),
    );
    if (identityFrameRole) {
      references.push({
        artifactId: { $artifact: identityFrameRole },
        role: "base-image",
        strength: 1,
        required: true,
      });
    }
    references.push({
      artifactId: { $artifact: unit.referenceRole },
      role: "layer-context",
      strength: 1,
      required: true,
    });
  }
  if (request.references.paletteReferenceArtifactId) {
    references.push({
      artifactId: { $artifact: initialRole("palette-reference") },
      role: "palette-reference",
      strength: 1,
      required: true,
    });
  }
  if (request.references.lineReferenceArtifactId) {
    references.push({
      artifactId: { $artifact: initialRole("line-reference") },
      role: "line-reference",
      strength: 0.9,
      required: true,
    });
  }
  if (request.references.materialReferenceArtifactId) {
    references.push({
      artifactId: { $artifact: initialRole("material-reference") },
      role: "material-reference",
      strength: 0.9,
      required: true,
    });
  }
  return references;
}

function customSelectionPolicy(unit: AutomaticSpriteProductionUnit): JsonValue {
  const motion = unit.phase === "in-between" || unit.kind === "layer";
  return normalizeJson({
    profile: "custom",
    allowAutomaticSelection: true,
    requireReferenceLineage: true,
    requireQualityPassed: true,
    allowedCandidateRoles: ["provider-candidate-alpha-master"],
    alphaVisibleThreshold: 8,
    maximumTranslationPixels: motion ? 8 : 5,
    maximumEdgeDistancePixels: motion ? 16 : 10,
    minimumOverallScore: motion ? 0.58 : 0.64,
    minimumWinnerMargin: 0.025,
    metrics: [
      {
        id: "silhouette-iou",
        weight: motion ? 0.12 : 0.2,
        minimum: motion ? 0.24 : 0.4,
        blocking: !motion,
      },
      {
        id: "edge-similarity",
        weight: 0.14,
        minimum: motion ? 0.28 : 0.4,
        blocking: !motion,
      },
      {
        id: "visible-area-similarity",
        weight: 0.13,
        minimum: motion ? 0.58 : 0.68,
        blocking: true,
      },
      {
        id: "centroid-similarity",
        weight: 0.11,
        minimum: motion ? 0.56 : 0.68,
        blocking: true,
      },
      {
        id: "bounds-aspect-similarity",
        weight: 0.07,
        minimum: 0.58,
        blocking: false,
      },
      {
        id: "palette-similarity",
        weight: 0.2,
        minimum: 0.5,
        blocking: true,
      },
      {
        id: "luminance-similarity",
        weight: 0.08,
        minimum: 0.46,
        blocking: false,
      },
      {
        id: "edge-orientation-similarity",
        weight: 0.07,
        minimum: 0.28,
        blocking: false,
      },
      {
        id: "overlap-colour-similarity",
        weight: 0.08,
        minimum: 0.25,
        blocking: false,
      },
    ],
    externalEvidence: [],
  });
}

function pipelineForUnit(
  request: ResolvedAutomaticSpriteWorkflowCompileRequest,
  unit: AutomaticSpriteProductionUnit,
  dependencyTaskIds: readonly string[],
): UnitPipeline {
  const candidates = request.provider.candidatesPerUnit;
  const candidateTaskIds: string[] = [];
  const masteringTaskIds: string[] = [];
  const candidateArtifactRoles: string[] = [];
  const masteredArtifactRole = role("mastered-candidates", unit.id);
  const tasks: SpriteSupervisorTaskInput[] = [];
  const contract = request.artDirectionContract;
  const referenceRoles = [
    initialRole("canonical-identity"),
    ...unit.dependencyMasterRoles,
    ...(unit.kind === "layer" ? [unit.referenceRole] : []),
    ...(request.references.paletteReferenceArtifactId
      ? [initialRole("palette-reference")]
      : []),
    ...(request.references.lineReferenceArtifactId
      ? [initialRole("line-reference")]
      : []),
    ...(request.references.materialReferenceArtifactId
      ? [initialRole("material-reference")]
      : []),
  ];
  for (let index = 0; index < candidates; index += 1) {
    const candidateTaskId = taskId(
      "candidate",
      unit.id,
      String(index + 1).padStart(2, "0"),
    );
    const masteringTaskId = taskId(
      "master",
      unit.id,
      String(index + 1).padStart(2, "0"),
    );
    const candidateRole = role(
      "candidate",
      `${unit.id}.${String(index + 1).padStart(2, "0")}`,
    );
    candidateTaskIds.push(candidateTaskId);
    masteringTaskIds.push(masteringTaskId);
    candidateArtifactRoles.push(candidateRole);
    tasks.push({
      id: candidateTaskId,
      stage:
        unit.phase === "direction-master"
          ? "direction-masters"
          : unit.phase === "key-pose"
            ? "key-poses"
            : "inbetweens",
      title: `Generate ${unit.layerRole} ${unit.phase} candidate ${index + 1} for ${unit.id}`,
      queue: "provider",
      kind: "art.candidate.generate",
      dependencyTaskIds,
      requiredArtifactRoles: [...new Set(referenceRoles)],
      payloadTemplate: normalizeJson({
        schemaVersion: "1.0",
        operation: "generate",
        assetKind: unit.kind === "layer" ? "sprite-layer" : "sprite-frame",
        continuityPhase: unit.phase,
        assetId: request.spritePlan.asset.assetId,
        candidateFamilyId: token(
          `${request.spritePlan.asset.assetId}-${shortHash(unit.id)}`,
          128,
        ),
        frameId:
          unit.frameId ?? token(`direction-master-${unit.direction}`, 128),
        ...(unit.kind === "layer" ? { layerId: token(unit.layerRole, 128) } : {}),
        creativeIntent:
          (unit.phase === "direction-master"
            ? `Author the canonical ${unit.direction} direction master before any clip frames. Preserve exact identity, projection, palette, materials and ground registration.`
            : unit.phase === "key-pose"
              ? `Author approved key pose ${unit.frameIndex} for ${unit.clipId}/${unit.direction}. Preserve the canonical identity and direction master while making the action silhouette unmistakable.`
              : `Interpolate frame ${unit.frameIndex} for ${unit.clipId}/${unit.direction} between its approved neighbouring key poses without redesigning identity, costume, equipment, light or camera.`) +
          automaticMotionPrompt(unit.motion),
        negativeIntent: [
          ...contract.style.mustAvoid,
          ...contract.provider.prohibitedChanges,
          "Do not create a sprite sheet, contact sheet, grid or multiple-panel image.",
          "Never paint a checkerboard or transparency-preview grid; it is fake transparency and invalid output.",
          `Every background pixel outside the subject must remain the exact flat ${request.provider.matteColour} extraction matte with no shadow, gradient, texture, scenery or colour variation.`,
          "Do not relight the silhouette or add matte spill, a complementary rim, coloured outline, glow, halo or chromatic aberration. Keep safe matte clearance on every canvas side.",
          "Do not add scenery, UI, labels, watermarks, unrelated props or extra characters.",
        ].join(" "),
        style: styleEnvelope(contract),
        shot: {
          subject: contract.asset.purpose,
          action:
            unit.phase === "direction-master"
              ? "Neutral readable contact pose."
              : unit.motion
                ? `${unit.clipId ?? "authored sprite motion"}: ${unit.motion.phase.label}. ${unit.motion.phase.motionIntent}`
                : unit.clipId ?? "authored sprite motion",
          direction: unit.direction,
          include: contract.production.shot.include,
          exclude: contract.production.shot.exclude,
          separateAssets: contract.production.layers
            .filter((entry) => entry.treatment !== "baked")
            .map((entry) => entry.role),
          framing: contract.production.shot.framing,
        },
        target: {
          width: contract.asset.dimensions.width,
          height: contract.asset.dimensions.height,
          transparency: "required",
          outputFormat: "png",
        },
        background: {
          strategy: "chroma-key",
          matteColour: request.provider.matteColour,
        },
        quality: request.provider.quality,
        candidateCount: 1,
        references: providerReferences(request, unit),
        selection: {
          ...(request.provider.preferredAdapterId
            ? { preferredAdapterId: request.provider.preferredAdapterId }
            : {}),
          ...(request.provider.preferredModel
            ? { preferredModel: request.provider.preferredModel }
            : {}),
          allowedAdapterIds: request.provider.allowedAdapterIds,
          allowFallback: request.provider.allowFallback,
          requireSeed: false,
        },
        metadata: {
          automaticWorkflowProtocol:
            AUTOMATIC_SPRITE_WORKFLOW_PROTOCOL_VERSION,
          runId: request.runId,
          spritePlanId: request.spritePlan.planId,
          unitId: unit.id,
          direction: unit.direction,
          clipId: unit.clipId ?? null,
          frameIndex: unit.frameIndex ?? null,
          layerRole: unit.layerRole,
          candidateOrdinal: index + 1,
          ...(unit.motion === undefined ? {} : { motionTopology: unit.motion }),
        },
      }),
      requiredCapabilities: [
        "provider.generate",
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
        reviewCodePrefixes: ["PROVIDER_INCOMPATIBLE", "PROVIDER_REFERENCE"],
        abortCodePrefixes: ["ARTIFACT_CONTENT_CORRUPT"],
        reviewOnUnclassified: true,
      },
    });
    tasks.push({
      id: masteringTaskId,
      stage: "mastering",
      title: `Master ${unit.id} candidate ${index + 1} to the exact sprite canvas`,
      queue: "media",
      kind: "art.candidate.master-alpha",
      dependencyTaskIds: [candidateTaskId],
      requiredArtifactRoles: [candidateRole],
      payloadTemplate: normalizeJson({
        candidateArtifactId: { $artifact: candidateRole },
        backgroundMode: "chroma-key",
        matteColour: request.provider.matteColour,
        frameId: unit.frameId ?? token(`direction-master-${unit.direction}`),
        targetWidth: contract.asset.dimensions.width,
        targetHeight: contract.asset.dimensions.height,
        resampling: request.provider.resampling,
        quality: {
          expectedWidth: contract.asset.dimensions.width,
          expectedHeight: contract.asset.dimensions.height,
          expectedFormat: "png",
          safePadding: contract.production.shot.safePaddingPixels,
          maximumHaloFraction: 0.02,
          maximumUnexpectedTransparentRgbFraction: 0.02,
        },
      }),
      requiredCapabilities: [
        "media.background-recovery",
        "media.chroma-extract",
        "media.raster",
        "quality.sprite-frame",
        "evidence.bundle",
      ],
      outputBindings: [
        {
          role: masteredArtifactRole,
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

  const selectionTaskId = taskId("select", unit.id);
  const selectionEvidenceRole = role("selection-evidence", unit.id);
  const selectedCandidateRole = role("selected-candidate", unit.id);
  tasks.push({
    id: selectionTaskId,
    stage: "family-verification",
    title: `Rank mastered candidates for ${unit.id}`,
    queue: "selection",
    kind: "art.candidate.select",
    dependencyTaskIds: masteringTaskIds,
    requiredArtifactRoles: [
      masteredArtifactRole,
      unit.referenceRole,
    ],
    payloadTemplate: normalizeJson({
      schemaVersion: "1.0",
      selectionId: token(`select-${shortHash(unit.id)}`, 128),
      candidateArtifactIds: { $artifacts: masteredArtifactRole },
      referenceArtifactId: { $artifact: unit.referenceRole },
      referenceRole:
        unit.kind === "layer" ? `layer-reference/${unit.layerRole}` : unit.phase,
      policy: customSelectionPolicy(unit),
      metadata: {
        runId: request.runId,
        spritePlanId: request.spritePlan.planId,
        unitId: unit.id,
        ...(unit.motion === undefined ? {} : { motionTopology: unit.motion }),
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
        role: selectedCandidateRole,
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

  const promotionTaskId = taskId("promote", unit.id);
  tasks.push({
    id: promotionTaskId,
    stage: "family-verification",
    title: `Promote the selected ${unit.id} master through compare-and-swap`,
    queue: "selection",
    kind: "art.candidate.promote",
    dependencyTaskIds: [selectionTaskId],
    requiredArtifactRoles: [selectionEvidenceRole, selectedCandidateRole],
    payloadTemplate: normalizeJson({
      schemaVersion: "1.0",
      promotionId: token(`promote-${shortHash(unit.id)}`, 128),
      selectionEvidenceArtifactId: { $artifact: selectionEvidenceRole },
      candidateArtifactId: { $artifact: selectedCandidateRole },
      target: {
        namespace: promotionNamespace(request, unit),
        name: promotionName(unit),
        expectedGeneration: request.promotion.expectedGeneration,
      },
      approval: { mode: "automatic" },
      actor: request.promotion.actor,
      metadata: {
        runId: request.runId,
        spritePlanId: request.spritePlan.planId,
        unitId: unit.id,
        ...(unit.motion === undefined ? {} : { motionTopology: unit.motion }),
      },
    }),
    requiredCapabilities: [
      "selection.promote",
      "artifacts.store",
      "evidence.bundle",
    ],
    outputBindings: [
      {
        role: unit.masterArtifactRole,
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
    unit,
    candidateTaskIds,
    masteringTaskIds,
    selectionTaskId,
    promotionTaskId,
    candidateArtifactRoles,
    masteredArtifactRole,
    selectionEvidenceRole,
    selectedCandidateRole,
    tasks,
  };
}

function familyBlendMode(roleName: string): string {
  if (roleName === "shadow") return "multiply";
  if (roleName === "effect" || roleName === "emission") return "add";
  return "normal";
}

function familyManifest(
  request: ResolvedAutomaticSpriteWorkflowCompileRequest,
  motionTopology: CompiledSpriteMotionTopology,
  layerDecisions: readonly CompiledArtLayerDecision[],
  units: readonly AutomaticSpriteProductionUnit[],
): JsonValue {
  const includedRoles = new Set<string>(
    layerDecisions.map((entry) => entry.role),
  );
  const definitions = [...layerDecisions]
    .sort((left, right) => left.zOrder - right.zOrder || left.role.localeCompare(right.role))
    .map((decision, index, sorted) => ({
      id: token(decision.role, 128),
      role: decision.role,
      sourcePolicy: "per-frame",
      required: true,
      zIndex: decision.zOrder,
      contributesToComposite: decision.contributesToColour,
      contributesToIdentity: decision.contributesToIdentity,
      retainSeparateAsset: decision.role !== "identity-core",
      blendMode: familyBlendMode(decision.role),
      minimumVisibleFraction:
        decision.role === "effect" || decision.role === "emission" ? 0 : 0.001,
      registrationTolerancePixels:
        request.artDirectionContract.style.motion.maximumAnchorDriftPixels,
      occludes: [],
      allowedOccludedBy: sorted
        .filter((candidate) => candidate.zOrder > decision.zOrder)
        .map((candidate) => token(candidate.role, 128)),
    }));
  const frames = request.spritePlan.frames
    .filter((frame) => frame.authored)
    .map((frame) => {
      const frameUnits = units.filter(
        (unit) => unit.frameId === frame.id && includedRoles.has(unit.layerRole),
      );
      const motion = automaticMotionBindingForFrame(motionTopology, frame.id);
      return {
        id: frame.id,
        animation: frame.clipId,
        direction: frame.direction,
        frameIndex: frame.frameIndex,
        globalFrameIndex: frame.globalFrameIndex,
        durationMs: frame.durationMs,
        pivot: request.artDirectionContract.production.pivot,
        baseline: request.artDirectionContract.production.baseline,
        groundContact: automaticMotionGroundContactRequired(motion),
        layers: frameUnits.map((unit) => ({
          layerId: token(unit.layerRole, 128),
          artifactId: { $artifact: unit.masterArtifactRole },
          offset: { x: 0, y: 0 },
          opacity: 1,
        })),
      };
    });
  const identityReference = frames.find((frame) => frame.frameIndex === 0) ?? frames[0];
  if (!identityReference) {
    throw new SpriteSupervisorError(
      "AUTOMATIC_SPRITE_WORKFLOW_FAMILY_EMPTY",
      "No authored runtime frames are available for family verification.",
    );
  }
  return normalizeJson({
    schemaVersion: "1.0",
    familyId: token(
      `${request.spritePlan.asset.assetId}-automatic-family`,
      128,
    ),
    canvas: request.artDirectionContract.asset.dimensions,
    layerDefinitions: definitions,
    frames,
    policy: {
      identityReferenceFrameId: identityReference.id,
      requireQualityPassed: true,
      requireReferenceLineage: false,
      requireDeclaredComposite: false,
      alphaVisibleThreshold: 8,
      maximumTranslationPixels: Math.max(
        1,
        request.artDirectionContract.style.motion.maximumAnchorDriftPixels,
      ),
      maximumEdgeDistancePixels: 16,
      minimumCanonicalVisibleAreaSimilarity: 0.58,
      minimumAdjacentVisibleAreaSimilarity: 0.52,
      minimumCanonicalPaletteSimilarity: 0.5,
      minimumAdjacentPaletteSimilarity: 0.46,
      minimumCanonicalCentroidSimilarity: 0.58,
      minimumAdjacentCentroidSimilarity: 0.52,
      minimumLoopClosureSimilarity: 0.5,
      maximumCompositeMeanError: 0,
      maximumCompositeMismatchFraction: 0,
      compositeChannelTolerance: 0,
      maximumInputBytes: 64 * 1024 * 1024,
      maximumPixels:
        request.artDirectionContract.asset.dimensions.width *
        request.artDirectionContract.asset.dimensions.height,
      decodeConcurrency: 4,
    },
    metadata: {
      automaticWorkflowProtocol:
        AUTOMATIC_SPRITE_WORKFLOW_PROTOCOL_VERSION,
      runId: request.runId,
      spritePlanId: request.spritePlan.planId,
      spritePlanSha256: request.spritePlan.planSha256,
      artDirectionContractId: request.artDirectionContract.contractId,
      artDirectionContractSha256:
        request.artDirectionContract.contractSha256,
      motionTopologyProtocolVersion: motionTopology.protocolVersion,
      motionTopologySha256: motionTopology.topologySha256,
      groundContactPolicy: "semantic-phase-grounded-only",
    },
  });
}

function initialBindings(
  request: ResolvedAutomaticSpriteWorkflowCompileRequest,
): readonly SpriteSupervisorArtifactBindingInput[] {
  return [
    {
      role: initialRole("canonical-identity"),
      artifactIds: [request.references.canonicalIdentityArtifactId],
    },
    ...(request.references.paletteReferenceArtifactId
      ? [
          {
            role: initialRole("palette-reference"),
            artifactIds: [request.references.paletteReferenceArtifactId],
          },
        ]
      : []),
    ...(request.references.lineReferenceArtifactId
      ? [
          {
            role: initialRole("line-reference"),
            artifactIds: [request.references.lineReferenceArtifactId],
          },
        ]
      : []),
    ...(request.references.materialReferenceArtifactId
      ? [
          {
            role: initialRole("material-reference"),
            artifactIds: [request.references.materialReferenceArtifactId],
          },
        ]
      : []),
    ...Object.entries(request.references.layerReferenceArtifactIds).map(
      ([layerRole, artifact]) => ({
        role: role("layer-reference", layerRole),
        artifactIds: [artifact],
      }),
    ),
  ];
}

export function analyseAutomaticSpriteWorkflow(
  input: AutomaticSpriteWorkflowCompileRequestInput | unknown,
): Readonly<{
  request: ResolvedAutomaticSpriteWorkflowCompileRequest;
  motionTopology: CompiledSpriteMotionTopology;
  analysis: AutomaticSpriteWorkflowAnalysis;
  layerDecisions: readonly CompiledArtLayerDecision[];
}> {
  const normalized = validateAutomaticSpriteWorkflowRequest(input);
  const request: ResolvedAutomaticSpriteWorkflowCompileRequest = {
    ...normalized,
    artDirectionContract: resolveAutomaticArtDirection(
      input,
      normalized.spritePlan,
    ),
  };
  const motionTopology = compileAutomaticSpriteMotionTopology(request.spritePlan);
  const blockers: AutomaticSpriteWorkflowBlocker[] = [];
  const warnings: AutomaticSpriteWorkflowWarning[] = motionTopology.warnings.map(
    (message) =>
      warning(
        "AUTOMATIC_SPRITE_WORKFLOW_MOTION_TOPOLOGY_WARNING",
        message,
        normalizeJson({
          motionTopologyProtocolVersion: motionTopology.protocolVersion,
          motionTopologySha256: motionTopology.topologySha256,
        }),
      ),
  );
  if (request.artDirectionContract.asset.transparency !== "required") {
    blockers.push(
      blocker(
        "AUTOMATIC_SPRITE_WORKFLOW_TRANSPARENCY_REQUIRED",
        "The current executable mastering path requires transparent PNG sprite targets.",
      ),
    );
  }
  if (!request.promotion.automatic) {
    blockers.push(
      blocker(
        "AUTOMATIC_SPRITE_WORKFLOW_AUTOMATIC_PROMOTION_REQUIRED",
        "The compiled task graph requires automatic promotion; named-human promotion remains a separate selection workflow.",
      ),
    );
  }
  if (request.promotion.expectedGeneration !== 0) {
    blockers.push(
      blocker(
        "AUTOMATIC_SPRITE_WORKFLOW_EXISTING_REFERENCE_UNSUPPORTED",
        "Fresh automatic production currently requires expectedGeneration=0. Existing approved families must use the revision and compare-and-swap repair workflow.",
      ),
    );
  }
  const layers = includedLayerDecisions(request, blockers, warnings);
  const drafts = createUnitDrafts(
    request,
    motionTopology,
    layers.included,
    blockers,
    warnings,
  );
  const provisionalTaskIds = new Map(
    drafts.map((draft) => [
      draft.masterArtifactRole,
      taskId("promote", draft.id),
    ]),
  );
  const units: AutomaticSpriteProductionUnit[] = drafts.map((draft) => ({
    id: draft.id,
    kind: draft.kind,
    phase: draft.phase,
    ...(draft.frame ? { frameId: draft.frame.id } : {}),
    ...(draft.clip ? { clipId: draft.clip.id } : {}),
    direction: draft.direction,
    ...(draft.frame ? { frameIndex: draft.frame.frameIndex } : {}),
    layerRole: draft.layerRole,
    referenceRole: draft.selectionReferenceRole,
    masterArtifactRole: draft.masterArtifactRole,
    dependencyMasterRoles: draft.dependencyMasterRoles,
    ...(draft.motion === undefined ? {} : { motion: draft.motion }),
    dependencyTaskIds: draft.dependencyMasterRoles
      .map((masterRole) => provisionalTaskIds.get(masterRole))
      .filter((entry): entry is string => entry !== undefined),
  }));
  if (units.length > request.policy.maximumProductionUnits) {
    blockers.push(
      blocker(
        "AUTOMATIC_SPRITE_WORKFLOW_UNIT_LIMIT_EXCEEDED",
        `The workflow requires ${units.length} production units; the configured maximum is ${request.policy.maximumProductionUnits}.`,
      ),
    );
  }
  const perUnitTasks = request.provider.candidatesPerUnit * 2 + 2;
  const totalTasks =
    units.length * perUnitTasks +
    (request.policy.includeFamilyVerification ? 1 : 0);
  if (totalTasks > request.policy.maximumTasks) {
    blockers.push(
      blocker(
        "AUTOMATIC_SPRITE_WORKFLOW_TASK_LIMIT_EXCEEDED",
        `The workflow requires ${totalTasks} tasks; the configured maximum is ${request.policy.maximumTasks}. Reduce candidates, layers or frame coverage, or split the family by clip category.`,
        normalizeJson({
          units: units.length,
          candidatesPerUnit: request.provider.candidatesPerUnit,
          tasksPerUnit: perUnitTasks,
        }),
      ),
    );
  }
  const disposition = blockers.length
    ? "blocked"
    : warnings.length || layers.deferred.length
      ? "review-required"
      : "ready";
  return {
    request,
    motionTopology,
    layerDecisions: layers.included,
    analysis: {
      disposition,
      blockers,
      warnings,
      productionUnits: units,
      separateLayerRoles: layers.included
        .filter((entry) => entry.role !== "identity-core")
        .map((entry) => entry.role),
      deferredLayerRoles: layers.deferred,
      totals: {
        authoredDirections: request.spritePlan.directions.filter(
          (entry) => entry.authored,
        ).length,
        authoredFrames: request.spritePlan.frames.filter(
          (entry) => entry.authored,
        ).length,
        productionUnits: units.length,
        candidateJobs: units.length * request.provider.candidatesPerUnit,
        masteringJobs: units.length * request.provider.candidatesPerUnit,
        selectionJobs: units.length,
        promotionJobs: units.length,
        familyVerificationJobs: request.policy.includeFamilyVerification ? 1 : 0,
        tasks: totalTasks,
      },
    },
  };
}

export function compileAutomaticSpriteWorkflow(
  input: AutomaticSpriteWorkflowCompileRequestInput | unknown,
): CompiledAutomaticSpriteWorkflow {
  const analysed = analyseAutomaticSpriteWorkflow(input);
  if (analysed.analysis.blockers.length) {
    throw new SpriteSupervisorError(
      "AUTOMATIC_SPRITE_WORKFLOW_BLOCKED",
      "The automatic sprite workflow has blocking requirements and was not compiled for execution.",
      normalizeJson({ blockers: analysed.analysis.blockers }),
    );
  }
  const request = analysed.request;
  const promotionTaskByMasterRole = new Map(
    analysed.analysis.productionUnits.map((unit) => [
      unit.masterArtifactRole,
      taskId("promote", unit.id),
    ]),
  );
  const pipelines = analysed.analysis.productionUnits.map((unit) =>
    pipelineForUnit(
      request,
      unit,
      unit.dependencyMasterRoles
        .map((masterRole) => promotionTaskByMasterRole.get(masterRole))
        .filter((entry): entry is string => entry !== undefined),
    ),
  );
  const tasks: SpriteSupervisorTaskInput[] = pipelines.flatMap(
    (pipeline) => pipeline.tasks,
  );
  const frameMasterRoles = analysed.analysis.productionUnits
    .filter((unit) => unit.kind !== "direction-master")
    .map((unit) => unit.masterArtifactRole);
  const familyTaskId = "automatic-family-verification";
  if (request.policy.includeFamilyVerification) {
    tasks.push({
      id: familyTaskId,
      stage: "family-verification",
      title: "Verify every selected authored frame and retained visible layer as one family",
      queue: "selection",
      kind: "sprite.family.verify",
      dependencyTaskIds: pipelines
        .filter((pipeline) => pipeline.unit.kind !== "direction-master")
        .map((pipeline) => pipeline.promotionTaskId),
      requiredArtifactRoles: frameMasterRoles,
      payloadTemplate: familyManifest(
        request,
        analysed.motionTopology,
        analysed.layerDecisions,
        analysed.analysis.productionUnits,
      ),
      requiredCapabilities: [
        "sprite.family.verify",
        "media.layer-compose",
        "selection.compare",
        "evidence.bundle",
      ],
      outputBindings: [
        {
          role: initialRole("family-evidence"),
          source: "output-artifact-labels",
          labels: {
            artifactRole: "sprite-family-consistency-evidence",
            qualityState: "passed",
          },
          cardinality: "one",
          required: true,
        },
        {
          role: initialRole("family-manifest"),
          source: "output-artifact-labels",
          labels: {
            artifactRole: "sprite-family-normalized-manifest",
          },
          cardinality: "one",
          required: true,
        },
        {
          role: initialRole("family-composites"),
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
    });
  }
  const supervisorRequest: SpriteSupervisorCompileRequestInput = {
    schemaVersion: "1.0",
    runId: request.runId,
    spritePlan: request.spritePlan,
    initialArtifactBindings: initialBindings(request),
    tasks,
    policy: {
      tickDelayMs: 1_000,
      maximumTicks: Math.max(1_000, tasks.length * 6),
      maximumActiveChildren: Math.min(64, Math.max(4, request.provider.candidatesPerUnit * 4)),
      defaultMaximumRedrives: 2,
      defaultMaximumRepairCycles: 0,
      cancelChildrenOnAbort: true,
      reviewOnUnclassifiedFailure: true,
      requireAllPlanStagesCovered: false,
      requireFinalHumanApproval:
        request.policy.requireFinalHumanApproval ||
        analysed.analysis.disposition === "review-required",
      requiredReleaseArtifactRoles: [
        initialRole("family-evidence"),
        initialRole("family-manifest"),
      ],
    },
    metadata: normalizeJson({
      automaticWorkflowProtocol:
        AUTOMATIC_SPRITE_WORKFLOW_PROTOCOL_VERSION,
      automaticRequestSha256:
        automaticSpriteWorkflowRequestSha256(request),
      disposition: analysed.analysis.disposition,
      deferredLayerRoles: analysed.analysis.deferredLayerRoles,
      sourceSpritePlanSha256: request.spritePlan.planSha256,
      sourceArtDirectionSha256:
        request.artDirectionContract.contractSha256,
      motionTopologyProtocolVersion: analysed.motionTopology.protocolVersion,
      motionTopologySha256: analysed.motionTopology.topologySha256,
      ...(request.metadata === undefined ? {} : { sourceMetadata: request.metadata }),
    }),
  };
  const supervisorWorkflow = compileSpriteSupervisorWorkflow(
    supervisorRequest,
  );
  return {
    schemaVersion: "1.0",
    protocolVersion: AUTOMATIC_SPRITE_WORKFLOW_PROTOCOL_VERSION,
    request,
    requestSha256: automaticSpriteWorkflowRequestSha256(request),
    motionTopology: analysed.motionTopology,
    analysis: analysed.analysis,
    supervisorRequest,
    supervisorWorkflow,
  };
}
