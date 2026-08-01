import { normalizeJson, type JsonValue } from "@evavo/art-artifacts";
import type { SpritePlannedFrame } from "@evavo/art-sprite-planner";

import {
  AUTOMATIC_SPRITE_WORKFLOW_PROTOCOL_VERSION,
  type CompiledAutomaticSpriteWorkflow,
} from "./automatic-types.js";
import type { SpriteSupervisorTaskInput } from "./types.js";
import { SpriteSupervisorError } from "./types.js";
import { spriteSupervisorSha256 } from "./validation.js";

export const MIRROR_OPERATION = "mirror-horizontal";
export const FAMILY_MIRROR_PROOF_ROLE =
  "automatic.family-horizontal-mirror-proof-evidence";

export interface MirrorDraft {
  readonly id: string;
  readonly unitKind: "direction-master" | "frame" | "layer";
  readonly sourceDirection: string;
  readonly targetDirection: string;
  readonly sourceFrameId?: string;
  readonly targetFrameId?: string;
  readonly clipId?: string;
  readonly frameIndex?: number;
  readonly phase: "key-pose" | "in-between";
  readonly layerRole: string;
  readonly sourceMasterArtifactRole: string;
  readonly targetMasterArtifactRole: string;
  readonly evidenceArtifactRole: string;
  readonly sourceProducerTaskId: string;
}

function token(value: string, maximum = 96): string {
  const normalized = value
    .replace(/[^A-Za-z0-9._:-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maximum);
  return normalized || "unit";
}

function role(prefix: string, value: string): string {
  return token(`automatic.${prefix}.${value}`, 255);
}

export function mirrorTaskId(value: string): string {
  return token(
    `auto-mirror-${spriteSupervisorSha256(value).slice(0, 16)}`,
    128,
  );
}

function masterRole(
  kind: MirrorDraft["unitKind"],
  direction: string,
  frameId: string | undefined,
  layerRole: string,
): string {
  return kind === "direction-master"
    ? role("direction-master", direction)
    : role("frame-master", `${frameId ?? direction}.${layerRole}`);
}

function producerTaskByRole(
  tasks: readonly SpriteSupervisorTaskInput[],
): ReadonlyMap<string, string> {
  const output = new Map<string, string>();
  for (const task of tasks) {
    for (const binding of task.outputBindings ?? []) {
      output.set(binding.role, task.id);
    }
  }
  return output;
}

function sourceFrame(
  frames: readonly SpritePlannedFrame[],
  target: SpritePlannedFrame,
): SpritePlannedFrame | undefined {
  return frames.find(
    (candidate) =>
      candidate.authored &&
      candidate.clipId === target.clipId &&
      candidate.direction === target.sourceDirection &&
      candidate.frameIndex === target.frameIndex,
  );
}

export function createMirrorDrafts(
  base: CompiledAutomaticSpriteWorkflow,
  producerTasks: readonly SpriteSupervisorTaskInput[],
): readonly MirrorDraft[] {
  const plan = base.request.spritePlan;
  const producers = producerTaskByRole(producerTasks);
  const sourceUnits = base.analysis.productionUnits;
  const drafts: MirrorDraft[] = [];

  for (const direction of plan.directions.filter((entry) => !entry.authored)) {
    const sourceDirection = direction.mirrorOf;
    if (!sourceDirection) continue;
    const sourceUnit = sourceUnits.find(
      (unit) =>
        unit.kind === "direction-master" &&
        unit.direction === sourceDirection &&
        unit.layerRole === "identity-core",
    );
    if (!sourceUnit) {
      throw new SpriteSupervisorError(
        "AUTOMATIC_SPRITE_MIRROR_SOURCE_UNIT_MISSING",
        `No authored direction-master unit exists for ${sourceDirection}.`,
      );
    }
    const producer = producers.get(sourceUnit.masterArtifactRole);
    if (!producer) {
      throw new SpriteSupervisorError(
        "AUTOMATIC_SPRITE_MIRROR_SOURCE_PRODUCER_MISSING",
        `No producer task exists for ${sourceUnit.masterArtifactRole}.`,
      );
    }
    const id = `direction:${direction.name}:identity-core:mirror`;
    drafts.push({
      id,
      unitKind: "direction-master",
      sourceDirection,
      targetDirection: direction.name,
      phase: "in-between",
      layerRole: "identity-core",
      sourceMasterArtifactRole: sourceUnit.masterArtifactRole,
      targetMasterArtifactRole: masterRole(
        "direction-master",
        direction.name,
        undefined,
        "identity-core",
      ),
      evidenceArtifactRole: role("mirror-evidence", id),
      sourceProducerTaskId: producer,
    });
  }

  for (const frame of plan.frames.filter((entry) => !entry.authored)) {
    const source = sourceFrame(plan.frames, frame);
    if (!source) {
      throw new SpriteSupervisorError(
        "AUTOMATIC_SPRITE_MIRROR_SOURCE_FRAME_MISSING",
        `Derived frame ${frame.id} has no authored source frame.`,
      );
    }
    const frameUnits = sourceUnits.filter(
      (unit) => unit.frameId === source.id && unit.kind !== "direction-master",
    );
    if (!frameUnits.length) {
      throw new SpriteSupervisorError(
        "AUTOMATIC_SPRITE_MIRROR_SOURCE_UNIT_MISSING",
        `Derived frame ${frame.id} has no authored source production units.`,
      );
    }
    for (const sourceUnit of frameUnits) {
      const producer = producers.get(sourceUnit.masterArtifactRole);
      if (!producer) {
        throw new SpriteSupervisorError(
          "AUTOMATIC_SPRITE_MIRROR_SOURCE_PRODUCER_MISSING",
          `No producer task exists for ${sourceUnit.masterArtifactRole}.`,
        );
      }
      const unitKind = sourceUnit.kind === "layer" ? "layer" : "frame";
      const id = `${unitKind}:${frame.id}:${sourceUnit.layerRole}:mirror`;
      drafts.push({
        id,
        unitKind,
        sourceDirection: source.direction,
        targetDirection: frame.direction,
        sourceFrameId: source.id,
        targetFrameId: frame.id,
        clipId: frame.clipId,
        frameIndex: frame.frameIndex,
        phase: frame.keyPose ? "key-pose" : "in-between",
        layerRole: sourceUnit.layerRole,
        sourceMasterArtifactRole: sourceUnit.masterArtifactRole,
        targetMasterArtifactRole: masterRole(
          unitKind,
          frame.direction,
          frame.id,
          sourceUnit.layerRole,
        ),
        evidenceArtifactRole: role("mirror-evidence", id),
        sourceProducerTaskId: producer,
      });
    }
  }
  return drafts;
}

export function createMirrorTask(
  base: CompiledAutomaticSpriteWorkflow,
  draft: MirrorDraft,
): SpriteSupervisorTaskInput {
  const contract = base.request.artDirectionContract;
  return {
    id: mirrorTaskId(draft.id),
    stage:
      draft.unitKind === "direction-master"
        ? "direction-masters"
        : draft.unitKind === "layer"
          ? "layers"
          : draft.phase === "key-pose"
            ? "key-poses"
            : "inbetweens",
    title: `Derive ${draft.targetDirection} ${draft.layerRole} by exact horizontal reflection`,
    queue: "media",
    kind: "art.candidate.finalize-adaptive",
    dependencyTaskIds: [draft.sourceProducerTaskId],
    requiredArtifactRoles: [draft.sourceMasterArtifactRole],
    payloadTemplate: normalizeJson({
      schemaVersion: "1.0",
      operation: MIRROR_OPERATION,
      sourceArtifactId: { $artifact: draft.sourceMasterArtifactRole },
      sourceDirection: draft.sourceDirection,
      targetDirection: draft.targetDirection,
      unitKind: draft.unitKind,
      layerRole: draft.layerRole,
      sourceFrameId: draft.sourceFrameId ?? null,
      targetFrameId: draft.targetFrameId ?? null,
      clipId: draft.clipId ?? null,
      frameIndex: draft.frameIndex ?? null,
      expectedWidth: contract.asset.dimensions.width,
      expectedHeight: contract.asset.dimensions.height,
      pivot: contract.production.pivot,
      baseline: contract.production.baseline,
      quality: {
        frameId:
          draft.targetFrameId ?? `direction-master-${draft.targetDirection}`,
        transparency: "alpha-required",
        expectedWidth: contract.asset.dimensions.width,
        expectedHeight: contract.asset.dimensions.height,
        expectedFormat: "png",
        safePadding: contract.production.shot.safePaddingPixels,
        maximumHaloFraction: 0.02,
        maximumUnexpectedTransparentRgbFraction: 0.02,
      },
      policy: {
        axis: "full-canvas-horizontal",
        preserveCanvas: true,
        preserveAlpha: true,
        preserveTransparentRgb: true,
        prohibitTrim: true,
        prohibitResample: true,
        requireExactRoundTrip: true,
      },
      metadata: {
        automaticWorkflowProtocol:
          AUTOMATIC_SPRITE_WORKFLOW_PROTOCOL_VERSION,
        runId: base.request.runId,
        spritePlanId: base.request.spritePlan.planId,
        mirrorUnitId: draft.id,
      },
    }),
    requiredCapabilities: [
      "media.adaptive-finalize",
      "media.sprite-mirror",
      "media.raster",
      "quality.sprite-frame",
      "evidence.bundle",
    ],
    outputBindings: [
      {
        role: draft.targetMasterArtifactRole,
        source: "runtime-result-json",
        pointer: "/masterArtifactId",
        cardinality: "one",
        required: true,
      },
      {
        role: draft.evidenceArtifactRole,
        source: "runtime-result-json",
        pointer: "/evidenceArtifactId",
        cardinality: "one",
        required: true,
      },
    ],
    maximumAttempts: 1,
    leaseDurationMs: 120_000,
    timeoutMs: 900_000,
    failurePolicy: {
      maxRedrives: 0,
      maxRepairCycles: 0,
      reviewCodePrefixes: ["DETERMINISTIC_MIRROR_"],
      abortCodePrefixes: [
        "DETERMINISTIC_MIRROR_SOURCE_TAMPERED",
        "DETERMINISTIC_MIRROR_INPUT_LINEAGE_MISSING",
        "DETERMINISTIC_MIRROR_ROUND_TRIP_FAILED",
      ],
      reviewOnUnclassified: true,
    },
  };
}

export function mirrorManifestUnits(
  drafts: readonly MirrorDraft[],
): readonly JsonValue[] {
  return drafts.map((draft) =>
    normalizeJson({
      id: draft.id,
      unitKind: draft.unitKind,
      sourceDirection: draft.sourceDirection,
      targetDirection: draft.targetDirection,
      sourceFrameId: draft.sourceFrameId ?? null,
      targetFrameId: draft.targetFrameId ?? null,
      clipId: draft.clipId ?? null,
      frameIndex: draft.frameIndex ?? null,
      layerRole: draft.layerRole,
      sourceArtifactId: { $artifact: draft.sourceMasterArtifactRole },
      targetArtifactId: { $artifact: draft.targetMasterArtifactRole },
      evidenceArtifactId: { $artifact: draft.evidenceArtifactRole },
    }),
  );
}
