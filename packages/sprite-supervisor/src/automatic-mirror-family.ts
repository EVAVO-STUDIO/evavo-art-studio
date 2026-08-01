import { normalizeJson, type JsonValue } from "@evavo/art-artifacts";

import { AUTOMATIC_SPRITE_WORKFLOW_PROTOCOL_VERSION, type AutomaticSpriteProductionUnit, type AutomaticSpriteWorkflowAnalysis, type CompiledAutomaticSpriteWorkflow } from "./automatic-types.js";
import { FAMILY_MIRROR_PROOF_ROLE, MIRROR_OPERATION, mirrorManifestUnits, mirrorTaskId, type MirrorDraft } from "./automatic-mirror-drafts.js";
import { DERIVED_DIRECTION_CODE } from "./automatic-mirror-policy.js";
import type { SpriteSupervisorTaskInput } from "./types.js";
import { SpriteSupervisorError } from "./types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jsonRecord(value: JsonValue, name: string): Record<string, JsonValue> {
  if (!isRecord(value)) {
    throw new SpriteSupervisorError(
      "AUTOMATIC_SPRITE_MIRROR_TASK_INVALID",
      `${name} must be an object.`,
    );
  }
  return { ...(value as Readonly<Record<string, JsonValue>>) };
}

function token(value: string, maximum = 96): string {
  const normalized = value
    .replace(/[^A-Za-z0-9._:-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maximum);
  return normalized || "unit";
}

export function transformMirrorFamilyTask(
  base: CompiledAutomaticSpriteWorkflow,
  familyTask: SpriteSupervisorTaskInput,
  drafts: readonly MirrorDraft[],
): SpriteSupervisorTaskInput {
  const payload = jsonRecord(familyTask.payloadTemplate, "family payload");
  const existingFrames = Array.isArray(payload.frames) ? [...payload.frames] : [];
  const existingMetadata = isRecord(payload.metadata)
    ? (payload.metadata as Readonly<Record<string, JsonValue>>)
    : {};
  const plan = base.request.spritePlan;
  const frameDrafts = drafts.filter(
    (draft) => draft.targetFrameId !== undefined,
  );
  const appendedFrames = plan.frames
    .filter((frame) => !frame.authored)
    .map((frame) => {
      const units = frameDrafts.filter(
        (draft) => draft.targetFrameId === frame.id,
      );
      if (!units.length) {
        throw new SpriteSupervisorError(
          "AUTOMATIC_SPRITE_MIRROR_TARGET_FRAME_EMPTY",
          `Derived frame ${frame.id} has no mirrored layers.`,
        );
      }
      return normalizeJson({
        id: frame.id,
        animation: frame.clipId,
        direction: frame.direction,
        frameIndex: frame.frameIndex,
        globalFrameIndex: frame.globalFrameIndex,
        durationMs: frame.durationMs,
        pivot: base.request.artDirectionContract.production.pivot,
        baseline: base.request.artDirectionContract.production.baseline,
        groundContact: true,
        layers: units.map((draft) => ({
          layerId: token(draft.layerRole, 128),
          artifactId: { $artifact: draft.targetMasterArtifactRole },
          offset: { x: 0, y: 0 },
          opacity: 1,
        })),
      });
    });
  const mirrorTaskIds = drafts.map((draft) => mirrorTaskId(draft.id));
  const mirrorRoles = drafts.flatMap((draft) => [
    draft.sourceMasterArtifactRole,
    draft.targetMasterArtifactRole,
    draft.evidenceArtifactRole,
  ]);
  return {
    ...familyTask,
    dependencyTaskIds: [
      ...new Set([...(familyTask.dependencyTaskIds ?? []), ...mirrorTaskIds]),
    ],
    requiredArtifactRoles: [
      ...new Set([...(familyTask.requiredArtifactRoles ?? []), ...mirrorRoles]),
    ],
    requiredCapabilities: [
      ...new Set([
        ...familyTask.requiredCapabilities,
        "media.sprite-mirror",
      ]),
    ],
    payloadTemplate: normalizeJson({
      ...payload,
      frames: [...existingFrames, ...appendedFrames].sort((left, right) => {
        const leftIndex = isRecord(left) && typeof left.globalFrameIndex === "number"
          ? left.globalFrameIndex
          : 0;
        const rightIndex = isRecord(right) && typeof right.globalFrameIndex === "number"
          ? right.globalFrameIndex
          : 0;
        return leftIndex - rightIndex;
      }),
      metadata: {
        ...existingMetadata,
        deterministicMirroring: {
          protocolVersion: AUTOMATIC_SPRITE_WORKFLOW_PROTOCOL_VERSION,
          operation: MIRROR_OPERATION,
          axis: "full-canvas-horizontal",
          preserveCanvas: true,
          preserveAlpha: true,
          preserveTransparentRgb: true,
          qualityThresholdsRelaxed: false,
          units: mirrorManifestUnits(drafts),
        },
      },
    }),
    outputBindings: [
      ...(familyTask.outputBindings ?? []),
      {
        role: FAMILY_MIRROR_PROOF_ROLE,
        source: "output-artifact-labels",
        labels: {
          artifactRole: "sprite-family-horizontal-mirror-proof-evidence",
          qualityState: "passed",
          releaseReady: "true",
        },
        cardinality: "one",
        required: true,
      },
    ],
  };
}

function derivedMirrorUnits(
  drafts: readonly MirrorDraft[],
): readonly AutomaticSpriteProductionUnit[] {
  return drafts.map((draft) => ({
    id: draft.id,
    kind: draft.unitKind,
    phase:
      draft.unitKind === "direction-master"
        ? "direction-master"
        : draft.phase,
    ...(draft.targetFrameId ? { frameId: draft.targetFrameId } : {}),
    ...(draft.clipId ? { clipId: draft.clipId } : {}),
    direction: draft.targetDirection,
    ...(draft.frameIndex === undefined
      ? {}
      : { frameIndex: draft.frameIndex }),
    layerRole: draft.layerRole,
    referenceRole: draft.sourceMasterArtifactRole,
    masterArtifactRole: draft.targetMasterArtifactRole,
    dependencyMasterRoles: [draft.sourceMasterArtifactRole],
    dependencyTaskIds: [draft.sourceProducerTaskId],
    derivation: {
      kind: "horizontal-mirror",
      sourceDirection: draft.sourceDirection,
      ...(draft.sourceFrameId ? { sourceFrameId: draft.sourceFrameId } : {}),
      sourceMasterArtifactRole: draft.sourceMasterArtifactRole,
      evidenceArtifactRole: draft.evidenceArtifactRole,
    },
  }));
}

export function updatedMirrorAnalysis(
  base: CompiledAutomaticSpriteWorkflow,
  drafts: readonly MirrorDraft[],
): AutomaticSpriteWorkflowAnalysis {
  const warnings = base.analysis.warnings.filter(
    (entry) => entry.code !== DERIVED_DIRECTION_CODE,
  );
  const disposition = warnings.length || base.analysis.deferredLayerRoles.length
    ? "review-required"
    : "ready";
  const derivedDirectionNames = new Set(
    drafts
      .filter((draft) => draft.unitKind === "direction-master")
      .map((draft) => draft.targetDirection),
  );
  const derivedFrameIds = new Set(
    drafts
      .map((draft) => draft.targetFrameId)
      .filter((value): value is string => value !== undefined),
  );
  return {
    ...base.analysis,
    disposition,
    warnings,
    productionUnits: [
      ...base.analysis.productionUnits,
      ...derivedMirrorUnits(drafts),
    ],
    totals: {
      ...base.analysis.totals,
      productionUnits: base.analysis.totals.productionUnits + drafts.length,
      tasks: base.analysis.totals.tasks + drafts.length,
      derivedDirections: derivedDirectionNames.size,
      derivedFrames: derivedFrameIds.size,
      mirrorJobs: drafts.length,
    },
  };
}
