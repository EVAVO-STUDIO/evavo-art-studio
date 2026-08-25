import { createHash } from "node:crypto";

import type { ArtifactId, ArtifactStore, StoredArtifact } from "@evavo/art-artifacts";
import {
  bindAnimationPoseControlArtifact,
  compileAnimationDirectorPlan,
  compileSideViewBipedWalkPoseControls,
  type AnimationDirectorRequest,
  type AnimationPoseControlBinding,
} from "@evavo/art-direction";
import { renderAnimationPoseControlPng } from "@evavo/art-media";
import type {
  ProviderBackgroundStrategy,
  ProviderCandidateQuality,
  ProviderCandidateRequestInput,
  ProviderStyleEnvelopeInput,
} from "@evavo/art-providers";
import {
  compileVerifiedAnimationProviderBatch,
  type VerifiedAnimationProviderBatchCompilation,
} from "@evavo/art-sprite-supervisor";

export const WALK_GENERATION_PREPARATION_VERSION = "2026-08-26.2" as const;

export interface PrepareSideViewWalkGenerationRequest {
  readonly director: AnimationDirectorRequest;
  readonly artifacts: ArtifactStore;
  readonly style: ProviderStyleEnvelopeInput;
  readonly background: Readonly<{
    strategy: ProviderBackgroundStrategy;
    matteColour?: string;
  }>;
  readonly quality?: ProviderCandidateQuality;
  readonly candidateCount?: number;
  readonly selection?: ProviderCandidateRequestInput["selection"];
}

export interface SideViewWalkGenerationPreparation {
  readonly version: typeof WALK_GENERATION_PREPARATION_VERSION;
  readonly plan: ReturnType<typeof compileAnimationDirectorPlan>;
  readonly planSha256: string;
  readonly poseTemplateSha256: string;
  readonly poseControlBindings: Readonly<Record<string, AnimationPoseControlBinding>>;
  readonly poseControlArtifactIds: readonly ArtifactId[];
  readonly keyPoseBatch: VerifiedAnimationProviderBatchCompilation;
  readonly pendingInbetweenBatchIds: readonly [string, string];
  readonly preparationSha256: string;
  readonly authority: Readonly<{
    providerExecution: false;
    keyPoseSelection: false;
    creativeApproval: false;
    artifactPromotion: false;
    repositoryMutation: false;
    publication: false;
  }>;
}

export interface CompilePreparedWalkInbetweensRequest {
  readonly preparation: SideViewWalkGenerationPreparation;
  readonly keyPoseArtifactIds: Readonly<Record<"1" | "5", ArtifactId>>;
  readonly style: ProviderStyleEnvelopeInput;
  readonly background: Readonly<{
    strategy: ProviderBackgroundStrategy;
    matteColour?: string;
  }>;
  readonly quality?: ProviderCandidateQuality;
  readonly candidateCount?: number;
  readonly selection?: ProviderCandidateRequestInput["selection"];
}

function fail(message: string): never {
  throw new Error(`Walk generation preparation failed: ${message}`);
}

function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .filter((key) => key !== "artifacts")
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stable(object[key])}`)
    .join(",")}}`;
}

function digest(value: unknown): string {
  return createHash("sha256").update(stable(value)).digest("hex");
}

function verifyStoredPoseArtifact(
  stored: StoredArtifact,
  contentSha256: string,
  frameId: string,
): void {
  if (
    stored.contentSha256 !== contentSha256 ||
    stored.contentHash !== `sha256:${contentSha256}` ||
    !/^artifact_[a-f0-9]{64}$/.test(stored.artifactId) ||
    stored.mediaType !== "image/png" ||
    stored.storageClass !== "evidence"
  ) {
    fail(`stored pose-control artifact identity differs for ${frameId}.`);
  }
}

function preparationDigestInput(preparation: Omit<SideViewWalkGenerationPreparation, "preparationSha256">): unknown {
  return {
    version: preparation.version,
    plan: preparation.plan,
    planSha256: preparation.planSha256,
    poseTemplateSha256: preparation.poseTemplateSha256,
    poseControlBindings: preparation.poseControlBindings,
    poseControlArtifactIds: preparation.poseControlArtifactIds,
    keyPoseBatch: preparation.keyPoseBatch,
    pendingInbetweenBatchIds: preparation.pendingInbetweenBatchIds,
    authority: preparation.authority,
  };
}

function verifyPreparation(input: SideViewWalkGenerationPreparation): void {
  if (!input || typeof input !== "object" || input.version !== WALK_GENERATION_PREPARATION_VERSION) {
    fail("preparation kind/version is unsupported.");
  }
  const body = { ...input } as Record<string, unknown>;
  delete body.preparationSha256;
  if (digest(body) !== input.preparationSha256) {
    fail("preparation SHA-256 does not match canonical content.");
  }
}

export async function prepareSideViewWalkGeneration(
  request: PrepareSideViewWalkGenerationRequest,
): Promise<SideViewWalkGenerationPreparation> {
  if (!request || typeof request !== "object" || !request.artifacts) {
    fail("request and artifact store are required.");
  }
  const plan = compileAnimationDirectorPlan(request.director);
  if (plan.direction !== "left" && plan.direction !== "right") {
    fail("side-view walk generation requires a left or right Director plan.");
  }
  if (plan.motionStyle === "traditional-cel") {
    fail("traditional-cel plans must route to Cel Animation Studio.");
  }
  const poseSet = compileSideViewBipedWalkPoseControls(plan);
  const bindings: Record<string, AnimationPoseControlBinding> = {};
  const artifactIds: ArtifactId[] = [];

  for (const pose of poseSet.poses) {
    const rendered = await renderAnimationPoseControlPng(pose);
    const stored = await request.artifacts.put(rendered.bytes, {
      mediaType: "image/png",
      storageClass: "evidence",
      fileName: `${pose.frameId.replaceAll(":", "-")}.pose-control.png`,
      labels: {
        purpose: "animation-pose-control",
        clipId: pose.clipId,
        frameId: pose.frameId,
      },
      metadata: {
        poseControlManifestSha256: pose.manifestSha256,
        rendererId: rendered.renderer.id,
        rendererVersion: rendered.renderer.version,
        width: rendered.width,
        height: rendered.height,
      },
    });
    verifyStoredPoseArtifact(stored, rendered.contentSha256, pose.frameId);
    const binding = bindAnimationPoseControlArtifact(pose, {
      artifactId: stored.artifactId,
      contentSha256: stored.contentSha256,
      mediaType: "image/png",
      width: rendered.width,
      height: rendered.height,
    });
    bindings[String(pose.frameNumber)] = binding;
    artifactIds.push(stored.artifactId);
  }

  const keyBatchId = `${plan.clipId}:keys`;
  const keyPoseBatch = compileVerifiedAnimationProviderBatch({
    plan,
    batchId: keyBatchId,
    poseControlBindings: bindings,
    style: request.style,
    background: request.background,
    ...(request.quality ? { quality: request.quality } : {}),
    ...(request.candidateCount !== undefined ? { candidateCount: request.candidateCount } : {}),
    ...(request.selection ? { selection: request.selection } : {}),
  });

  const body = {
    version: WALK_GENERATION_PREPARATION_VERSION,
    plan,
    planSha256: keyPoseBatch.planSha256,
    poseTemplateSha256: poseSet.templateSha256,
    poseControlBindings: bindings,
    poseControlArtifactIds: artifactIds,
    keyPoseBatch,
    pendingInbetweenBatchIds: [
      `${plan.clipId}:inbetweens-a`,
      `${plan.clipId}:inbetweens-b`,
    ] as const,
    authority: {
      providerExecution: false as const,
      keyPoseSelection: false as const,
      creativeApproval: false as const,
      artifactPromotion: false as const,
      repositoryMutation: false as const,
      publication: false as const,
    },
  };
  return {
    ...body,
    preparationSha256: digest(preparationDigestInput(body)),
  };
}

export function compilePreparedWalkInbetweenBatches(
  request: CompilePreparedWalkInbetweensRequest,
): readonly [VerifiedAnimationProviderBatchCompilation, VerifiedAnimationProviderBatchCompilation] {
  if (!request || typeof request !== "object") fail("request must be an object.");
  verifyPreparation(request.preparation);
  const { preparation } = request;
  const keyOne = request.keyPoseArtifactIds?.["1"];
  const keyFive = request.keyPoseArtifactIds?.["5"];
  if (
    typeof keyOne !== "string" || !/^artifact_[a-f0-9]{64}$/.test(keyOne) ||
    typeof keyFive !== "string" || !/^artifact_[a-f0-9]{64}$/.test(keyFive) ||
    keyOne === keyFive
  ) {
    fail("retained key poses 1 and 5 require two distinct canonical artifact ids.");
  }

  const common = {
    plan: preparation.plan,
    poseControlBindings: preparation.poseControlBindings,
    keyPoseArtifactIds: { "1": keyOne, "5": keyFive },
    style: request.style,
    background: request.background,
    ...(request.quality ? { quality: request.quality } : {}),
    ...(request.candidateCount !== undefined ? { candidateCount: request.candidateCount } : {}),
    ...(request.selection ? { selection: request.selection } : {}),
  };
  const first = compileVerifiedAnimationProviderBatch({
    ...common,
    batchId: preparation.pendingInbetweenBatchIds[0],
  });
  const second = compileVerifiedAnimationProviderBatch({
    ...common,
    batchId: preparation.pendingInbetweenBatchIds[1],
  });
  if (first.planSha256 !== preparation.planSha256 || second.planSha256 !== preparation.planSha256) {
    fail("dependent in-between batches do not match the prepared Director plan identity.");
  }
  return [first, second];
}
