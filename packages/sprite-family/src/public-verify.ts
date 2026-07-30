import type {
  ArtifactId,
  ArtifactStore,
  StoredArtifact,
} from "@evavo/art-artifacts";

import {
  SpriteFamilyError,
  type NormalizedSpriteFamilyManifest,
  type SpriteFamilyExecutionOptions,
  type SpriteFamilyRunResult,
} from "./types.js";
import { validateSpriteFamilyManifest } from "./validation.js";
import { verifySpriteFamily as verifySpriteFamilyInternal } from "./verify.js";

async function verifiedArtifact(
  artifacts: ArtifactStore,
  artifactId: ArtifactId,
  role: string,
): Promise<StoredArtifact> {
  const [artifact, verification] = await Promise.all([
    artifacts.get(artifactId),
    artifacts.verify(artifactId),
  ]);
  if (!artifact || !verification.exists) {
    throw new SpriteFamilyError(
      "SPRITE_FAMILY_ARTIFACT_NOT_FOUND",
      `${role} artifact was not found: ${artifactId}`,
    );
  }
  if (!verification.descriptorValid || !verification.contentValid) {
    throw new SpriteFamilyError(
      "SPRITE_FAMILY_ARTIFACT_VERIFICATION_FAILED",
      `${role} artifact failed immutable verification: ${artifactId}`,
    );
  }
  return artifact;
}

function qualityStatePass(artifact: StoredArtifact): boolean {
  const qualityState = artifact.labels.qualityState;
  if (qualityState !== undefined) return qualityState === "passed";
  return (
    artifact.labels.approvalState === "approved" ||
    artifact.labels.approvalState === "selected"
  );
}

function declaredArtifacts(
  manifest: NormalizedSpriteFamilyManifest,
): readonly Readonly<{ artifactId: ArtifactId; role: string }>[] {
  const values: Array<Readonly<{ artifactId: ArtifactId; role: string }>> = [];
  for (const frame of manifest.frames) {
    for (const layer of frame.layers) {
      values.push({
        artifactId: layer.artifactId,
        role: `${frame.id}.${layer.layerId}`,
      });
    }
    if (frame.declaredCompositeArtifactId) {
      values.push({
        artifactId: frame.declaredCompositeArtifactId,
        role: `${frame.id}.declaredComposite`,
      });
    }
  }
  const unique = new Map<ArtifactId, string>();
  for (const value of values) {
    if (!unique.has(value.artifactId)) unique.set(value.artifactId, value.role);
  }
  return [...unique.entries()].map(([artifactId, role]) => ({ artifactId, role }));
}

async function assertStrictArtifactStates(
  manifest: NormalizedSpriteFamilyManifest,
  artifacts: ArtifactStore,
): Promise<void> {
  if (!manifest.policy.requireQualityPassed) return;
  for (const declared of declaredArtifacts(manifest)) {
    const artifact = await verifiedArtifact(
      artifacts,
      declared.artifactId,
      declared.role,
    );
    if (!qualityStatePass(artifact)) {
      throw new SpriteFamilyError(
        "SPRITE_FAMILY_ARTIFACT_QUALITY_REJECTED",
        `${declared.role} carries an explicit rejected or incomplete quality state. Approval labels cannot override rejected quality evidence.`,
        {
          artifactId: artifact.artifactId,
          role: declared.role,
          qualityState: artifact.labels.qualityState ?? null,
          approvalState: artifact.labels.approvalState ?? null,
        },
      );
    }
  }
}

export async function verifySpriteFamily(
  input: unknown,
  options: SpriteFamilyExecutionOptions,
): Promise<SpriteFamilyRunResult> {
  const manifest = validateSpriteFamilyManifest(input);
  await assertStrictArtifactStates(manifest, options.artifacts);
  return verifySpriteFamilyInternal(manifest, options);
}
