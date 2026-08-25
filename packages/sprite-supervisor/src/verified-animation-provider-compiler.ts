import {
  verifyAnimationPoseControlBinding,
  type AnimationPoseControlBinding,
} from "@evavo/art-direction";

import {
  compileAnimationProviderBatch,
  type AnimationProviderBatchCompilation,
  type AnimationProviderBatchCompileRequest,
} from "./animation-provider-compiler.js";

export const VERIFIED_ANIMATION_PROVIDER_COMPILER_VERSION = "2026-08-26.1" as const;

export interface VerifiedAnimationProviderBatchCompileRequest
  extends Omit<AnimationProviderBatchCompileRequest, "poseControlArtifactIds"> {
  readonly poseControlBindings: Readonly<Record<string, AnimationPoseControlBinding>>;
}

export interface VerifiedAnimationProviderBatchCompilation
  extends AnimationProviderBatchCompilation {
  readonly verifiedCompilerVersion: typeof VERIFIED_ANIMATION_PROVIDER_COMPILER_VERSION;
  readonly poseControlBindingSha256s: readonly string[];
}

function fail(message: string): never {
  throw new Error(`Verified animation provider compile failed: ${message}`);
}

function expectedFrameId(clipId: string, frameNumber: number): string {
  return `${clipId}:f${String(frameNumber).padStart(3, "0")}`;
}

export function compileVerifiedAnimationProviderBatch(
  request: VerifiedAnimationProviderBatchCompileRequest,
): VerifiedAnimationProviderBatchCompilation {
  if (!request || typeof request !== "object") fail("request must be an object.");
  if (!request.poseControlBindings || typeof request.poseControlBindings !== "object") {
    fail("poseControlBindings must be an object.");
  }
  const batch = request.plan.generationBatches.find((entry) => entry.id === request.batchId);
  if (!batch) fail(`batchId ${request.batchId} is not present in the Animation Director plan.`);

  const poseControlArtifactIds: Record<string, `artifact_${string}`> = {};
  const bindingSha256s: string[] = [];
  for (const frameNumber of batch.frames) {
    const binding = request.poseControlBindings[String(frameNumber)];
    if (!binding) fail(`poseControlBindings.${frameNumber} is required for this batch.`);
    if (!verifyAnimationPoseControlBinding(binding)) {
      fail(`poseControlBindings.${frameNumber} failed canonical binding verification.`);
    }
    const frameId = expectedFrameId(request.plan.clipId, frameNumber);
    if (
      binding.clipId !== request.plan.clipId ||
      binding.frameId !== frameId ||
      binding.frameNumber !== frameNumber
    ) {
      fail(`poseControlBindings.${frameNumber} does not identify ${frameId}.`);
    }
    if (
      binding.width !== request.plan.canvas.width ||
      binding.height !== request.plan.canvas.height
    ) {
      fail(`poseControlBindings.${frameNumber} canvas differs from the Director plan.`);
    }
    if (binding.artifactId !== `artifact_${binding.contentSha256}`) {
      fail(`poseControlBindings.${frameNumber} artifact id is not bound to its content SHA-256.`);
    }
    poseControlArtifactIds[String(frameNumber)] = binding.artifactId;
    bindingSha256s.push(binding.bindingSha256);
  }

  const compiled = compileAnimationProviderBatch({
    plan: request.plan,
    batchId: request.batchId,
    poseControlArtifactIds,
    ...(request.keyPoseArtifactIds ? { keyPoseArtifactIds: request.keyPoseArtifactIds } : {}),
    style: request.style,
    background: request.background,
    ...(request.quality ? { quality: request.quality } : {}),
    ...(request.candidateCount !== undefined ? { candidateCount: request.candidateCount } : {}),
    ...(request.selection ? { selection: request.selection } : {}),
  });

  return {
    ...compiled,
    verifiedCompilerVersion: VERIFIED_ANIMATION_PROVIDER_COMPILER_VERSION,
    poseControlBindingSha256s: bindingSha256s,
  };
}
