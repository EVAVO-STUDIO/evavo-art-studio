import {
  compileSpriteMotionTopology,
  type CompiledSpriteMotionTopology,
  type CompiledSpriteProductionPlan,
} from "@evavo/art-sprite-planner";

import type { AutomaticSpriteMotionBinding } from "./automatic-types.js";
import { SpriteSupervisorError } from "./types.js";

export function compileAutomaticSpriteMotionTopology(
  plan: CompiledSpriteProductionPlan,
): CompiledSpriteMotionTopology {
  try {
    return compileSpriteMotionTopology(plan);
  } catch (error: unknown) {
    throw new SpriteSupervisorError(
      "AUTOMATIC_SPRITE_WORKFLOW_MOTION_TOPOLOGY_INVALID",
      error instanceof Error
        ? `The exact sprite plan could not compile a valid motion topology: ${error.message}`
        : "The exact sprite plan could not compile a valid motion topology.",
    );
  }
}

export function automaticMotionBindingForFrame(
  topology: CompiledSpriteMotionTopology,
  frameId: string,
): AutomaticSpriteMotionBinding {
  const binding = topology.frameBindings.find((entry) => entry.frameId === frameId);
  if (!binding) {
    throw new SpriteSupervisorError(
      "AUTOMATIC_SPRITE_WORKFLOW_MOTION_BINDING_MISSING",
      `Frame ${frameId} has no exact motion-topology binding.`,
    );
  }
  const clip = topology.clips.find((entry) => entry.clipId === binding.clipId);
  const phase = clip?.phases.find((entry) => entry.id === binding.phaseId);
  const direction = topology.directions.find(
    (entry) => entry.name === binding.direction,
  );
  if (!clip || !phase || !direction) {
    throw new SpriteSupervisorError(
      "AUTOMATIC_SPRITE_WORKFLOW_MOTION_BINDING_INCOMPLETE",
      `Frame ${frameId} motion topology is missing its clip phase or direction geometry.`,
    );
  }
  return {
    topologyProtocolVersion: topology.protocolVersion,
    topologySha256: topology.topologySha256,
    phase: {
      id: phase.id,
      label: phase.label,
      progress: binding.phaseProgress,
      keyFrame: phase.keyFrame,
      motionIntent: phase.motionIntent,
      groundContact: phase.groundContact,
    },
    direction: {
      ...(direction.worldAngleDegrees === undefined
        ? {}
        : { worldAngleDegrees: direction.worldAngleDegrees }),
      worldVector: direction.worldVector,
      screenVector: direction.screenVector,
      adjacentDirections: direction.adjacentDirections,
    },
    continuity: {
      ...(binding.previousFrameId === undefined
        ? {}
        : { previousFrameId: binding.previousFrameId }),
      ...(binding.nextFrameId === undefined
        ? {}
        : { nextFrameId: binding.nextFrameId }),
      ...(binding.clockwiseDirectionFrameId === undefined
        ? {}
        : { clockwiseDirectionFrameId: binding.clockwiseDirectionFrameId }),
      ...(binding.counterClockwiseDirectionFrameId === undefined
        ? {}
        : {
            counterClockwiseDirectionFrameId:
              binding.counterClockwiseDirectionFrameId,
          }),
      canonicalReferenceIds: binding.canonicalReferenceIds,
    },
  };
}

export function automaticMotionGroundContactRequired(
  binding: AutomaticSpriteMotionBinding | undefined,
): boolean {
  return binding?.phase.groundContact === "grounded";
}

export function automaticMotionPrompt(
  binding: AutomaticSpriteMotionBinding | undefined,
): string {
  if (!binding) return "";
  const percentage = Math.round(binding.phase.progress * 100);
  return ` Semantic motion phase: ${binding.phase.label} (${binding.phase.id}), ${percentage}% through the phase. ${binding.phase.motionIntent} Ground-contact state: ${binding.phase.groundContact}. Preserve the declared world/screen direction and continuity with its temporal and adjacent-direction neighbours.`;
}
