import { createHash } from "node:crypto";

import {
  verifyAnimationMotionEvidenceManifest,
  type AnimationMotionEvidenceManifest,
} from "./motion-evidence.js";
import { SpriteQualityInputError } from "./types.js";

export const ANIMATION_MOTION_EVIDENCE_LINEAGE_SCHEMA_VERSION = "1.0" as const;

export interface AnimationMotionEvidenceFrameLineageInput {
  readonly frameId: string;
  readonly providerRequestSha256: string;
}

export interface AnimationMotionEvidenceLineageInput {
  readonly evidence: AnimationMotionEvidenceManifest;
  readonly animationDirectorPlanSha256: string;
  readonly animationProviderCompilerVersion: string;
  readonly frames: readonly AnimationMotionEvidenceFrameLineageInput[];
}

export interface AnimationMotionEvidenceLineage {
  readonly schemaVersion: typeof ANIMATION_MOTION_EVIDENCE_LINEAGE_SCHEMA_VERSION;
  readonly sequenceId: string;
  readonly evidenceManifestSha256: string;
  readonly animationDirectorPlanSha256: string;
  readonly animationProviderCompilerVersion: string;
  readonly frames: readonly Readonly<{
    frameId: string;
    frameArtifactId: string;
    frameContentSha256: string;
    providerRequestSha256: string;
  }>[];
  readonly lineageSha256: string;
  readonly authority: Readonly<{
    creativeApproval: false;
    artifactPromotion: false;
    repositoryMutation: false;
    publication: false;
  }>;
}

const SHA256 = /^[a-f0-9]{64}$/;

function fail(message: string): never {
  throw new SpriteQualityInputError(
    "ANIMATION_MOTION_EVIDENCE_LINEAGE_INVALID",
    message,
  );
}

function sha(value: unknown, field: string): string {
  if (typeof value !== "string" || !SHA256.test(value)) {
    fail(`${field} must be 64 lowercase hexadecimal characters.`);
  }
  return value;
}

function nonBlank(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    fail(`${field} must be non-empty.`);
  }
  return value.trim();
}

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

export function compileAnimationMotionEvidenceLineage(
  input: AnimationMotionEvidenceLineageInput,
): AnimationMotionEvidenceLineage {
  if (!input || typeof input !== "object") {
    fail("Motion evidence lineage input must be an object.");
  }
  if (!verifyAnimationMotionEvidenceManifest(input.evidence)) {
    fail("Motion evidence manifest verification failed.");
  }
  if (!Array.isArray(input.frames)) {
    fail("frames must be an array.");
  }
  if (input.frames.length !== input.evidence.frames.length) {
    fail("frames must bind every motion-evidence frame exactly once.");
  }

  const submitted = new Map<string, string>();
  for (const [index, entry] of input.frames.entries()) {
    if (!entry || typeof entry !== "object") {
      fail(`frames[${index}] must be an object.`);
    }
    const frameId = nonBlank(entry.frameId, `frames[${index}].frameId`);
    if (submitted.has(frameId)) {
      fail(`Duplicate frame lineage for ${frameId}.`);
    }
    submitted.set(
      frameId,
      sha(entry.providerRequestSha256, `frames[${index}].providerRequestSha256`),
    );
  }

  const frames = input.evidence.frames.map((frame) => {
    const providerRequestSha256 = submitted.get(frame.frameId);
    if (!providerRequestSha256) {
      fail(`Missing provider request lineage for evidence frame ${frame.frameId}.`);
    }
    return {
      frameId: frame.frameId,
      frameArtifactId: frame.frameArtifactId,
      frameContentSha256: frame.frameContentSha256,
      providerRequestSha256,
    };
  });

  for (const frameId of submitted.keys()) {
    if (!input.evidence.frames.some((frame) => frame.frameId === frameId)) {
      fail(`Provider request lineage names unknown evidence frame ${frameId}.`);
    }
  }

  const body = {
    schemaVersion: ANIMATION_MOTION_EVIDENCE_LINEAGE_SCHEMA_VERSION,
    sequenceId: input.evidence.sequenceId,
    evidenceManifestSha256: input.evidence.manifestSha256,
    animationDirectorPlanSha256: sha(
      input.animationDirectorPlanSha256,
      "animationDirectorPlanSha256",
    ),
    animationProviderCompilerVersion: nonBlank(
      input.animationProviderCompilerVersion,
      "animationProviderCompilerVersion",
    ),
    frames,
    authority: {
      creativeApproval: false as const,
      artifactPromotion: false as const,
      repositoryMutation: false as const,
      publication: false as const,
    },
  };

  return {
    ...body,
    lineageSha256: digest(body),
  };
}

export function verifyAnimationMotionEvidenceLineage(
  lineage: AnimationMotionEvidenceLineage,
  evidence: AnimationMotionEvidenceManifest,
): boolean {
  if (!verifyAnimationMotionEvidenceManifest(evidence)) return false;
  try {
    const compiled = compileAnimationMotionEvidenceLineage({
      evidence,
      animationDirectorPlanSha256: lineage.animationDirectorPlanSha256,
      animationProviderCompilerVersion: lineage.animationProviderCompilerVersion,
      frames: lineage.frames.map((frame) => ({
        frameId: frame.frameId,
        providerRequestSha256: frame.providerRequestSha256,
      })),
    });
    return (
      compiled.lineageSha256 === lineage.lineageSha256 &&
      stable(compiled) === stable(lineage)
    );
  } catch {
    return false;
  }
}
