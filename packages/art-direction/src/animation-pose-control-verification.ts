import { createHash } from "node:crypto";

import {
  ANIMATION_POSE_CONTROL_BINDING_KIND,
  ANIMATION_POSE_CONTROL_VERSION,
  type AnimationPoseControlBinding,
} from "./animation-pose-control.js";

const SHA256 = /^[a-f0-9]{64}$/;
const ARTIFACT_ID = /^artifact_[a-f0-9]{64}$/;

function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stable(object[key])}`)
    .join(",")}}`;
}

function digest(value: unknown): string {
  return createHash("sha256").update(stable(value)).digest("hex");
}

export function verifyAnimationPoseControlBinding(
  binding: AnimationPoseControlBinding,
): boolean {
  if (!binding || typeof binding !== "object") return false;
  if (
    binding.kind !== ANIMATION_POSE_CONTROL_BINDING_KIND ||
    binding.version !== ANIMATION_POSE_CONTROL_VERSION ||
    typeof binding.poseControlManifestSha256 !== "string" ||
    !SHA256.test(binding.poseControlManifestSha256) ||
    typeof binding.bindingSha256 !== "string" ||
    !SHA256.test(binding.bindingSha256) ||
    typeof binding.artifactId !== "string" ||
    !ARTIFACT_ID.test(binding.artifactId) ||
    typeof binding.contentSha256 !== "string" ||
    !SHA256.test(binding.contentSha256) ||
    binding.mediaType !== "image/png" ||
    !Number.isInteger(binding.frameNumber) ||
    binding.frameNumber < 1 ||
    !Number.isInteger(binding.width) ||
    binding.width < 1 ||
    !Number.isInteger(binding.height) ||
    binding.height < 1 ||
    !binding.clipId ||
    !binding.frameId
  ) {
    return false;
  }
  const body = {
    kind: binding.kind,
    version: binding.version,
    poseControlManifestSha256: binding.poseControlManifestSha256,
    clipId: binding.clipId,
    frameId: binding.frameId,
    frameNumber: binding.frameNumber,
    artifactId: binding.artifactId,
    contentSha256: binding.contentSha256,
    mediaType: binding.mediaType,
    width: binding.width,
    height: binding.height,
    authority: binding.authority,
  };
  return digest(body) === binding.bindingSha256;
}
