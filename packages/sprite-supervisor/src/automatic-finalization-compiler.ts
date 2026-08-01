import {
  normalizeJson,
  type ArtifactId,
  type JsonValue,
} from "@evavo/art-artifacts";

import {
  AUTOMATIC_SPRITE_FINALIZATION_PROTOCOL_VERSION,
  type AutomaticSpriteFinalizationAnalysis,
  type AutomaticSpriteFinalizationCompileRequestInput,
  type CompiledAutomaticSpriteFinalizationWorkflow,
  type NormalizedAutomaticSpriteFinalizationRequest,
  type NormalizedAutomaticSpriteThreeDReference,
  type ResolvedAutomaticSpriteBackgroundPolicy,
} from "./automatic-finalization-types.js";
import {
  automaticSpriteFinalizationRequestSha256,
  compileAutomaticSpriteFinalizationBase,
} from "./automatic-finalization-validation.js";
import type { CompiledAutomaticSpriteWorkflow } from "./automatic-types.js";
import { compileSpriteSupervisorWorkflow } from "./compiler.js";
import type {
  SpriteSupervisorArtifactBindingInput,
  SpriteSupervisorCompileRequestInput,
  SpriteSupervisorTaskInput,
} from "./types.js";
import { SpriteSupervisorError } from "./types.js";

const THREE_D_ROLE_PREFIX = "automatic.3d";
const FAMILY_FINALIZATION_ROLE = "automatic.family-finalization-evidence";

function record(value: JsonValue): Record<string, JsonValue> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new SpriteSupervisorError(
      "AUTOMATIC_SPRITE_FINALIZATION_TASK_INVALID",
      "Expected one JSON object while compiling the finalization task graph.",
    );
  }
  return { ...(value as Readonly<Record<string, JsonValue>>) };
}

function role(suffix: string): string {
  return `${THREE_D_ROLE_PREFIX}.${suffix}`;
}

function binding(
  roleName: string,
  artifactId: ArtifactId | undefined,
): SpriteSupervisorArtifactBindingInput | undefined {
  return artifactId === undefined
    ? undefined
    : { role: roleName, artifactIds: [artifactId] };
}

function threeDArtifactIds(
  threeD: NormalizedAutomaticSpriteThreeDReference | undefined,
): readonly ArtifactId[] {
  if (!threeD) return [];
  return [
    ...new Set(
      [
        threeD.renderRigArtifactId,
        threeD.cameraManifestArtifactId,
        threeD.materialReferenceArtifactId,
        ...threeD.turntableArtifactIds,
        ...Object.values(threeD.directionReferenceArtifactIds),
        ...Object.values(threeD.depthReferenceArtifactIds),
        ...Object.values(threeD.normalReferenceArtifactIds),
      ].filter((entry): entry is ArtifactId => entry !== undefined),
    ),
  ].sort();
}

function threeDBindings(
  threeD: NormalizedAutomaticSpriteThreeDReference | undefined,
): readonly SpriteSupervisorArtifactBindingInput[] {
  if (!threeD) return [];
  const values: Array<SpriteSupervisorArtifactBindingInput | undefined> = [
    binding(role("render-rig"), threeD.renderRigArtifactId),
    binding(role("camera-manifest"), threeD.cameraManifestArtifactId),
    binding(role("material-reference"), threeD.materialReferenceArtifactId),
    ...(threeD.turntableArtifactIds.length
      ? [
          {
            role: role("turntable"),
            artifactIds: threeD.turntableArtifactIds,
          },
        ]
      : []),
    ...Object.entries(threeD.directionReferenceArtifactIds).map(
      ([direction, artifactId]) =>
        binding(role(`direction.${direction}`), artifactId),
    ),
    ...Object.entries(threeD.depthReferenceArtifactIds).map(
      ([direction, artifactId]) =>
        binding(role(`depth.${direction}`), artifactId),
    ),
    ...Object.entries(threeD.normalReferenceArtifactIds).map(
      ([direction, artifactId]) =>
        binding(role(`normal.${direction}`), artifactId),
    ),
  ];
  return values.filter(
    (entry): entry is SpriteSupervisorArtifactBindingInput => entry !== undefined,
  );
}

function providerBackground(
  background: ResolvedAutomaticSpriteBackgroundPolicy,
): JsonValue {
  if (background.providerStrategy === "chroma-key") {
    return normalizeJson({
      strategy: "chroma-key",
      matteColour: background.matteColour,
    });
  }
  return normalizeJson({ strategy: background.providerStrategy });
}

function appendUnique<T>(
  values: readonly T[],
  additions: readonly T[],
): readonly T[] {
  return [...new Set([...values, ...additions])];
}

function correctedLayerReferences(
  task: SpriteSupervisorTaskInput,
  payload: Readonly<Record<string, JsonValue>>,
): readonly JsonValue[] {
  const references = Array.isArray(payload.references)
    ? [...payload.references]
    : [];
  if (payload.assetKind !== "sprite-layer") return references;
  const frameId = typeof payload.frameId === "string" ? payload.frameId : undefined;
  const identityRoles = (task.requiredArtifactRoles ?? []).filter(
    (entry) =>
      entry.startsWith("automatic.frame-master.") &&
      entry.endsWith(".identity-core"),
  );
  const currentIdentityRole = frameId
    ? identityRoles.find((entry) =>
        entry.includes(`.${frameId}.identity-core`),
      )
    : identityRoles[0];
  if (!currentIdentityRole) {
    throw new SpriteSupervisorError(
      "AUTOMATIC_SPRITE_LAYER_BASE_FRAME_MISSING",
      `Layer task ${task.id} has no current selected identity frame binding.`,
    );
  }
  const output = references.filter((entry) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      return true;
    }
    const referenceRole = (entry as Readonly<Record<string, JsonValue>>).role;
    return (
      referenceRole !== "base-image" &&
      referenceRole !== "previous-key-pose" &&
      referenceRole !== "next-key-pose"
    );
  });
  output.push(
    normalizeJson({
      artifactId: { $artifact: currentIdentityRole },
      role: "base-image",
      strength: 1,
      required: true,
    }),
  );
  if (payload.continuityPhase === "in-between") {
    const neighbours = identityRoles.filter(
      (entry) => entry !== currentIdentityRole,
    );
    if (neighbours.length !== 2) {
      throw new SpriteSupervisorError(
        "AUTOMATIC_SPRITE_LAYER_NEIGHBOUR_BINDING_INVALID",
        `Layer in-between task ${task.id} requires exactly two neighbouring key-pose masters; found ${neighbours.length}.`,
        normalizeJson({
          taskId: task.id,
          frameId: frameId ?? null,
          identityRoles,
          currentIdentityRole,
          neighbours,
        }),
      );
    }
    output.push(
      normalizeJson({
        artifactId: { $artifact: neighbours[0]! },
        role: "previous-key-pose",
        strength: 1,
        required: true,
      }),
      normalizeJson({
        artifactId: { $artifact: neighbours[1]! },
        role: "next-key-pose",
        strength: 1,
        required: true,
      }),
    );
  }
  return output;
}

function threeDReferenceObjects(
  threeD: NormalizedAutomaticSpriteThreeDReference | undefined,
  direction: string | undefined,
): readonly JsonValue[] {
  if (!threeD) return [];
  const references: JsonValue[] = [];
  const directionRole = direction ? role(`direction.${direction}`) : undefined;
  if (directionRole && threeD.directionReferenceArtifactIds[direction!]) {
    references.push(
      normalizeJson({
        artifactId: { $artifact: directionRole },
        role: "pose-control",
        strength: 1,
        required: true,
        note: `Direction render from ${threeD.repository}@${threeD.revision}.`,
      }),
    );
  }
  const depthRole = direction ? role(`depth.${direction}`) : undefined;
  if (depthRole && threeD.depthReferenceArtifactIds[direction!]) {
    references.push(
      normalizeJson({
        artifactId: { $artifact: depthRole },
        role: "depth-control",
        strength: 1,
        required: true,
        note: `Depth render from ${threeD.repository}@${threeD.revision}.`,
      }),
    );
  }
  if (threeD.materialReferenceArtifactId) {
    references.push(
      normalizeJson({
        artifactId: { $artifact: role("material-reference") },
        role: "material-reference",
        strength: 0.9,
        required: true,
        note: `Material reference from ${threeD.repository}@${threeD.revision}.`,
      }),
    );
  }
  return references;
}

function threeDRequiredRoles(
  threeD: NormalizedAutomaticSpriteThreeDReference | undefined,
  direction: string | undefined,
): readonly string[] {
  if (!threeD) return [];
  return [
    ...(threeD.renderRigArtifactId ? [role("render-rig")] : []),
    ...(threeD.cameraManifestArtifactId ? [role("camera-manifest")] : []),
    ...(threeD.materialReferenceArtifactId
      ? [role("material-reference")]
      : []),
    ...(direction && threeD.directionReferenceArtifactIds[direction]
      ? [role(`direction.${direction}`)]
      : []),
    ...(direction && threeD.depthReferenceArtifactIds[direction]
      ? [role(`depth.${direction}`)]
      : []),
    ...(direction && threeD.normalReferenceArtifactIds[direction]
      ? [role(`normal.${direction}`)]
      : []),
  ];
}

function transformCandidateTask(
  task: SpriteSupervisorTaskInput,
  background: ResolvedAutomaticSpriteBackgroundPolicy,
  threeD: NormalizedAutomaticSpriteThreeDReference | undefined,
): SpriteSupervisorTaskInput {
  const payload = record(task.payloadTemplate);
  const shot =
    typeof payload.shot === "object" &&
    payload.shot !== null &&
    !Array.isArray(payload.shot)
      ? (payload.shot as Readonly<Record<string, JsonValue>>)
      : {};
  const direction =
    typeof shot.direction === "string" ? shot.direction : undefined;
  const existingReferences = correctedLayerReferences(task, payload);
  const existingNegative =
    typeof payload.negativeIntent === "string" ? payload.negativeIntent : "";
  const metadata =
    typeof payload.metadata === "object" &&
    payload.metadata !== null &&
    !Array.isArray(payload.metadata)
      ? (payload.metadata as Readonly<Record<string, JsonValue>>)
      : {};
  const target =
    typeof payload.target === "object" &&
    payload.target !== null &&
    !Array.isArray(payload.target)
      ? (payload.target as Readonly<Record<string, JsonValue>>)
      : {};
  return {
    ...task,
    requiredArtifactRoles: appendUnique(
      task.requiredArtifactRoles ?? [],
      threeDRequiredRoles(threeD, direction),
    ),
    payloadTemplate: normalizeJson({
      ...payload,
      negativeIntent: [
        existingNegative,
        "Never draw a checkerboard, transparency grid, fake alpha pattern, watermark, contact sheet, or background that merely imitates transparency.",
        "Return exactly one production unit on the declared background strategy.",
      ]
        .filter(Boolean)
        .join(" "),
      target: {
        ...target,
        transparency:
          background.transparencyExpectation === "alpha-required"
            ? "required"
            : "opaque",
        outputFormat: "png",
      },
      background: providerBackground(background),
      references: [
        ...existingReferences,
        ...threeDReferenceObjects(threeD, direction),
      ],
      metadata: {
        ...metadata,
        automaticFinalization: {
          backgroundMode: background.resolvedMode,
          providerStrategy: background.providerStrategy,
          matteColour: background.matteColour ?? null,
          fakeTransparencyBlocking:
            background.requireFakeTransparencyRejection,
          threeDRepository: threeD?.repository ?? null,
          threeDRevision: threeD?.revision ?? null,
          threeDArtifactIds: threeDArtifactIds(threeD),
        },
      },
    }),
  };
}

function transformMasteringTask(
  task: SpriteSupervisorTaskInput,
  request: NormalizedAutomaticSpriteFinalizationRequest,
  background: ResolvedAutomaticSpriteBackgroundPolicy,
): SpriteSupervisorTaskInput {
  const payload = record(task.payloadTemplate);
  const quality =
    typeof payload.quality === "object" &&
    payload.quality !== null &&
    !Array.isArray(payload.quality)
      ? (payload.quality as Readonly<Record<string, JsonValue>>)
      : {};
  return {
    ...task,
    requiredCapabilities: appendUnique(task.requiredCapabilities, [
      "media.raster",
      "quality.sprite-frame",
    ]),
    payloadTemplate: normalizeJson({
      ...payload,
      backgroundMode: background.resolvedMode,
      ...(background.matteColour === undefined
        ? {}
        : { matteColour: background.matteColour }),
      deliveryProfileId: request.finalization.deliveryProfileId,
      proofBackgrounds: background.proofBackgrounds,
      requireFakeTransparencyRejection:
        background.requireFakeTransparencyRejection,
      requireMeaningfulAlpha: background.requireMeaningfulAlpha,
      quality: {
        ...quality,
        transparency: background.transparencyExpectation,
        knownMatteColours: [
          ...(Array.isArray(quality.knownMatteColours)
            ? quality.knownMatteColours
            : []),
          ...(background.matteColour ? [background.matteColour] : []),
        ],
      },
    }),
  };
}

function finalizationMetadata(
  request: NormalizedAutomaticSpriteFinalizationRequest,
  background: ResolvedAutomaticSpriteBackgroundPolicy,
): JsonValue {
  const threeD = request.threeDReference;
  return normalizeJson({
    protocolVersion: AUTOMATIC_SPRITE_FINALIZATION_PROTOCOL_VERSION,
    background,
    deliveryProfileId: request.finalization.deliveryProfileId,
    requireHostileMatteProof:
      request.finalization.requireHostileMatteProof,
    requireNoRejectedArtifacts:
      request.finalization.requireNoRejectedArtifacts,
    requireExactDimensions: request.finalization.requireExactDimensions,
    threeD: threeD
      ? {
          repository: threeD.repository,
          revision: threeD.revision,
          renderRigArtifactId: threeD.renderRigArtifactId ?? null,
          cameraManifestArtifactId:
            threeD.cameraManifestArtifactId ?? null,
          materialReferenceArtifactId:
            threeD.materialReferenceArtifactId ?? null,
          turntableArtifactIds: threeD.turntableArtifactIds,
          directionReferenceArtifactIds:
            threeD.directionReferenceArtifactIds,
          depthReferenceArtifactIds: threeD.depthReferenceArtifactIds,
          normalReferenceArtifactIds: threeD.normalReferenceArtifactIds,
        }
      : null,
  });
}

function transformFamilyTask(
  task: SpriteSupervisorTaskInput,
  request: NormalizedAutomaticSpriteFinalizationRequest,
  background: ResolvedAutomaticSpriteBackgroundPolicy,
): SpriteSupervisorTaskInput {
  const payload = record(task.payloadTemplate);
  const metadata =
    typeof payload.metadata === "object" &&
    payload.metadata !== null &&
    !Array.isArray(payload.metadata)
      ? (payload.metadata as Readonly<Record<string, JsonValue>>)
      : {};
  return {
    ...task,
    staticInputArtifacts: appendUnique(
      task.staticInputArtifacts ?? [],
      threeDArtifactIds(request.threeDReference),
    ),
    payloadTemplate: normalizeJson({
      ...payload,
      metadata: {
        ...metadata,
        automaticFinalization: finalizationMetadata(request, background),
      },
    }),
    outputBindings: [
      ...(task.outputBindings ?? []),
      {
        role: FAMILY_FINALIZATION_ROLE,
        source: "output-artifact-labels",
        labels: {
          artifactRole: "sprite-family-finalization-evidence",
          qualityState: "passed",
          releaseReady: "true",
        },
        cardinality: "one",
        required: true,
      },
    ],
  };
}

function transformTasks(
  base: CompiledAutomaticSpriteWorkflow,
  request: NormalizedAutomaticSpriteFinalizationRequest,
  background: ResolvedAutomaticSpriteBackgroundPolicy,
): readonly SpriteSupervisorTaskInput[] {
  return base.supervisorRequest.tasks.map((task) => {
    if (task.kind === "art.candidate.generate") {
      return transformCandidateTask(
        task,
        background,
        request.threeDReference,
      );
    }
    if (task.kind === "art.candidate.master-alpha") {
      return transformMasteringTask(task, request, background);
    }
    if (task.kind === "sprite.family.verify") {
      return transformFamilyTask(task, request, background);
    }
    return task;
  });
}

function analyseThreeD(
  request: NormalizedAutomaticSpriteFinalizationRequest,
  base: CompiledAutomaticSpriteWorkflow,
): AutomaticSpriteFinalizationAnalysis["threeD"] {
  const threeD = request.threeDReference;
  if (!threeD) {
    return {
      enabled: false,
      directionCoverage: [],
      missingDirectionReferences: [],
      artifactCount: 0,
    };
  }
  const directions = base.request.spritePlan.directions
    .filter((entry) => entry.authored)
    .map((entry) => entry.name);
  const directionCoverage = directions.filter(
    (direction) =>
      threeD.directionReferenceArtifactIds[direction] !== undefined,
  );
  const missingDirectionReferences = directions.filter(
    (direction) =>
      threeD.directionReferenceArtifactIds[direction] === undefined,
  );
  return {
    enabled: true,
    repository: threeD.repository,
    revision: threeD.revision,
    directionCoverage,
    missingDirectionReferences,
    artifactCount: threeDArtifactIds(threeD).length,
  };
}

export function compileAutomaticSpriteFinalizationWorkflow(
  input: AutomaticSpriteFinalizationCompileRequestInput | unknown,
): CompiledAutomaticSpriteFinalizationWorkflow {
  const compiled = compileAutomaticSpriteFinalizationBase(input);
  const { request, baseWorkflow, background } = compiled;
  const blockers: AutomaticSpriteFinalizationAnalysis["blockers"][number][] =
    [];
  const warnings: AutomaticSpriteFinalizationAnalysis["warnings"][number][] =
    [];
  const threeD = analyseThreeD(request, baseWorkflow);
  const contract = baseWorkflow.request.artDirectionContract;
  const requiresThreeD =
    contract.style.renderingMode === "pre-rendered-2.5d" ||
    contract.style.projection === "orthographic-billboard" ||
    contract.style.projection === "perspective-2.5d";
  if (requiresThreeD && !threeD.enabled) {
    blockers.push({
      code: "AUTOMATIC_SPRITE_3D_REFERENCE_REQUIRED",
      message:
        "Pre-rendered 2.5D production requires an exact 3D repository revision and immutable render-rig reference artifacts.",
    });
  }
  if (
    threeD.enabled &&
    requiresThreeD &&
    (!request.threeDReference?.renderRigArtifactId ||
      !request.threeDReference.cameraManifestArtifactId)
  ) {
    blockers.push({
      code: "AUTOMATIC_SPRITE_3D_RIG_INCOMPLETE",
      message:
        "Pre-rendered 2.5D production requires renderRigArtifactId and cameraManifestArtifactId.",
    });
  }
  if (threeD.enabled && threeD.missingDirectionReferences.length) {
    const issue = {
      code: "AUTOMATIC_SPRITE_3D_DIRECTION_COVERAGE_INCOMPLETE",
      message:
        "The 3D reference set does not cover every authored sprite direction.",
      details: normalizeJson({
        missingDirections: threeD.missingDirectionReferences,
      }),
    };
    if (requiresThreeD) blockers.push(issue);
    else warnings.push(issue);
  }
  if (
    request.finalization.requireFamilyVerification &&
    !baseWorkflow.request.policy.includeFamilyVerification
  ) {
    blockers.push({
      code: "AUTOMATIC_SPRITE_FINALIZATION_FAMILY_VERIFY_REQUIRED",
      message:
        "Finalization requires complete family verification before release.",
    });
  }
  if (blockers.length) {
    throw new SpriteSupervisorError(
      "AUTOMATIC_SPRITE_FINALIZATION_BLOCKED",
      "The finalization workflow has blocking requirements.",
      normalizeJson({ blockers }),
    );
  }
  const transformedTasks = transformTasks(
    baseWorkflow,
    request,
    background,
  );
  const supervisorRequest: SpriteSupervisorCompileRequestInput = {
    ...baseWorkflow.supervisorRequest,
    initialArtifactBindings: [
      ...(baseWorkflow.supervisorRequest.initialArtifactBindings ?? []),
      ...threeDBindings(request.threeDReference),
    ],
    tasks: transformedTasks,
    policy: {
      ...(baseWorkflow.supervisorRequest.policy ?? {}),
      requiredReleaseArtifactRoles: [
        "automatic.family-manifest",
        FAMILY_FINALIZATION_ROLE,
      ],
      requireFinalHumanApproval:
        baseWorkflow.supervisorRequest.policy?.requireFinalHumanApproval ===
          true || warnings.length > 0,
    },
    metadata: normalizeJson({
      ...(typeof baseWorkflow.supervisorRequest.metadata === "object" &&
      baseWorkflow.supervisorRequest.metadata !== null &&
      !Array.isArray(baseWorkflow.supervisorRequest.metadata)
        ? (baseWorkflow.supervisorRequest.metadata as Readonly<
            Record<string, JsonValue>
          >)
        : {}),
      automaticFinalization: finalizationMetadata(request, background),
    }),
  };
  const supervisorWorkflow =
    compileSpriteSupervisorWorkflow(supervisorRequest);
  const analysis: AutomaticSpriteFinalizationAnalysis = {
    base: baseWorkflow.analysis,
    background,
    threeD,
    finalization: {
      deliveryProfileId: request.finalization.deliveryProfileId,
      candidateFinalizationTasks: transformedTasks.filter(
        (task) => task.kind === "art.candidate.master-alpha",
      ).length,
      familyFinalizationEvidenceRequired: true,
      fakeTransparencyIsBlocking:
        background.requireFakeTransparencyRejection,
      hostileMatteProofRequired:
        request.finalization.requireHostileMatteProof,
    },
    blockers,
    warnings,
  };
  return {
    schemaVersion: "1.0",
    protocolVersion: AUTOMATIC_SPRITE_FINALIZATION_PROTOCOL_VERSION,
    request,
    requestSha256: automaticSpriteFinalizationRequestSha256(request),
    baseWorkflow,
    analysis,
    supervisorRequest,
    supervisorWorkflow,
  };
}
