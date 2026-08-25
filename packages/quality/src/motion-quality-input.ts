import type {
  AnimationAttachmentConstraint,
  AnimationMotionFrameEvidence,
  AnimationMotionQualityRequest,
} from "./analyse-motion.js";
import {
  verifyAnimationMotionEvidenceManifest,
  type AnimationMotionEvidenceManifest,
} from "./motion-evidence.js";
import { SpriteQualityInputError, type Point } from "./types.js";

export interface AnimationMotionQualityPolicy {
  readonly loop: boolean;
  readonly minimumLandmarkConfidence: number;
  readonly plantedLandmarkDriftTolerancePixels: number;
  readonly rootLandmarkId?: string;
  readonly maximumRootStepPixels?: number;
  readonly loopClosureTolerancePixels?: number;
  readonly loopClosureLandmarkIds?: readonly string[];
  readonly requiredLandmarkIds?: readonly string[];
  readonly attachmentConstraints?: readonly AnimationAttachmentConstraint[];
}

export interface AnimationMotionQualityInputCompilation {
  readonly request: AnimationMotionQualityRequest;
  readonly droppedLandmarks: readonly Readonly<{
    frameId: string;
    landmarkId: string;
    confidence: number;
  }>[];
  readonly evidenceManifestSha256: string;
}

function fail(message: string): never {
  throw new SpriteQualityInputError(
    "ANIMATION_MOTION_QUALITY_INPUT_INVALID",
    message,
  );
}

export function compileAnimationMotionQualityInput(
  manifest: AnimationMotionEvidenceManifest,
  policy: AnimationMotionQualityPolicy,
): AnimationMotionQualityInputCompilation {
  if (!verifyAnimationMotionEvidenceManifest(manifest)) {
    fail("Motion evidence manifest verification failed.");
  }
  if (!policy || typeof policy !== "object") {
    fail("Motion quality policy must be an object.");
  }
  if (
    typeof policy.minimumLandmarkConfidence !== "number" ||
    !Number.isFinite(policy.minimumLandmarkConfidence) ||
    policy.minimumLandmarkConfidence < 0 ||
    policy.minimumLandmarkConfidence > 1
  ) {
    fail("minimumLandmarkConfidence must be between zero and one.");
  }

  const droppedLandmarks: Array<{
    frameId: string;
    landmarkId: string;
    confidence: number;
  }> = [];
  const frames: AnimationMotionFrameEvidence[] = manifest.frames.map((frame) => {
    const landmarks: Record<string, Point> = {};
    for (const [landmarkId, landmark] of Object.entries(frame.landmarks)) {
      if (landmark.confidence < policy.minimumLandmarkConfidence) {
        droppedLandmarks.push({
          frameId: frame.frameId,
          landmarkId,
          confidence: landmark.confidence,
        });
        continue;
      }
      landmarks[landmarkId] = { x: landmark.x, y: landmark.y };
    }
    return {
      frameId: frame.frameId,
      frameIndex: frame.frameIndex,
      landmarks,
      ...(frame.plantedLandmarkId
        ? { plantedLandmarkId: frame.plantedLandmarkId }
        : {}),
    };
  });

  return {
    request: {
      sequenceId: manifest.sequenceId,
      loop: policy.loop,
      plantedLandmarkDriftTolerancePixels:
        policy.plantedLandmarkDriftTolerancePixels,
      ...(policy.rootLandmarkId
        ? { rootLandmarkId: policy.rootLandmarkId }
        : {}),
      ...(policy.maximumRootStepPixels === undefined
        ? {}
        : { maximumRootStepPixels: policy.maximumRootStepPixels }),
      ...(policy.loopClosureTolerancePixels === undefined
        ? {}
        : {
            loopClosureTolerancePixels: policy.loopClosureTolerancePixels,
          }),
      ...(policy.loopClosureLandmarkIds
        ? { loopClosureLandmarkIds: policy.loopClosureLandmarkIds }
        : {}),
      ...(policy.requiredLandmarkIds
        ? { requiredLandmarkIds: policy.requiredLandmarkIds }
        : {}),
      ...(policy.attachmentConstraints
        ? { attachmentConstraints: policy.attachmentConstraints }
        : {}),
      frames,
    },
    droppedLandmarks,
    evidenceManifestSha256: manifest.manifestSha256,
  };
}
