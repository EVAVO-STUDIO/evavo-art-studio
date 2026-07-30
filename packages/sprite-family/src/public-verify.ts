import type {
  ArtifactId,
  ArtifactStore,
  StoredArtifact,
} from "@evavo/art-artifacts";
import {
  decodeSelectionImage,
  type SelectionImageFeatures,
} from "@evavo/art-selection";

import {
  SpriteFamilyError,
  type NormalizedSpriteFamilyLayerDefinition,
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

function allowedOccluders(
  definition: NormalizedSpriteFamilyLayerDefinition,
  definitions: readonly NormalizedSpriteFamilyLayerDefinition[],
): ReadonlySet<string> {
  const allowed = new Set(definition.allowedOccludedBy);
  for (const other of definitions) {
    if (other.occludes.includes(definition.id)) allowed.add(other.id);
  }
  return allowed;
}

async function assertOcclusionPolicy(
  manifest: NormalizedSpriteFamilyManifest,
  artifacts: ArtifactStore,
): Promise<void> {
  const canvasPixels = manifest.canvas.width * manifest.canvas.height;
  if (canvasPixels > manifest.policy.maximumPixels) {
    throw new SpriteFamilyError(
      "SPRITE_FAMILY_CANVAS_PIXEL_LIMIT_EXCEEDED",
      `Family canvas contains ${canvasPixels} pixels, exceeding policy.maximumPixels ${manifest.policy.maximumPixels}.`,
    );
  }
  const definitions = new Map(
    manifest.layerDefinitions.map((definition) => [definition.id, definition]),
  );
  const featureCache = new Map<ArtifactId, Promise<SelectionImageFeatures>>();
  const featuresFor = (
    artifactId: ArtifactId,
    role: string,
  ): Promise<SelectionImageFeatures> => {
    const existing = featureCache.get(artifactId);
    if (existing) return existing;
    const created = (async () => {
      const artifact = await verifiedArtifact(artifacts, artifactId, role);
      const features = await decodeSelectionImage(await artifacts.read(artifactId), {
        alphaVisibleThreshold: manifest.policy.alphaVisibleThreshold,
        maximumInputBytes: manifest.policy.maximumInputBytes,
        maximumPixels: manifest.policy.maximumPixels,
      });
      if (features.encodedSha256 !== artifact.contentSha256) {
        throw new SpriteFamilyError(
          "SPRITE_FAMILY_LAYER_HASH_MISMATCH",
          `${role} decoded bytes differ from the immutable artifact descriptor.`,
        );
      }
      return features;
    })();
    featureCache.set(artifactId, created);
    return created;
  };

  for (const frame of manifest.frames) {
    const layers = await Promise.all(
      frame.layers.map(async (instance) => {
        const definition = definitions.get(instance.layerId);
        if (!definition) {
          throw new SpriteFamilyError(
            "SPRITE_FAMILY_LAYER_DEFINITION_MISSING",
            `${frame.id}.${instance.layerId} has no layer definition.`,
          );
        }
        return {
          definition,
          instance,
          features: await featuresFor(
            instance.artifactId,
            `${frame.id}.${instance.layerId}`,
          ),
        };
      }),
    );
    const ordered = layers
      .filter((layer) => layer.definition.contributesToComposite)
      .sort(
        (left, right) =>
          right.definition.zIndex - left.definition.zIndex ||
          right.definition.id.localeCompare(left.definition.id),
      );
    const topLayer = new Int16Array(canvasPixels);
    topLayer.fill(-1);
    for (let layerIndex = 0; layerIndex < ordered.length; layerIndex += 1) {
      const layer = ordered[layerIndex]!;
      const allowed = allowedOccluders(
        layer.definition,
        manifest.layerDefinitions,
      );
      const unexpected = new Map<string, number>();
      for (let y = 0; y < layer.features.height; y += 1) {
        for (let x = 0; x < layer.features.width; x += 1) {
          const sourcePixel = y * layer.features.width + x;
          const sourceAlpha =
            (layer.features.rgba[sourcePixel * 4 + 3]! / 255) *
            layer.instance.opacity;
          if (
            sourceAlpha * 255 < manifest.policy.alphaVisibleThreshold
          ) {
            continue;
          }
          const targetX = x + layer.instance.offset.x;
          const targetY = y + layer.instance.offset.y;
          if (
            targetX < 0 ||
            targetY < 0 ||
            targetX >= manifest.canvas.width ||
            targetY >= manifest.canvas.height
          ) {
            continue;
          }
          const targetPixel = targetY * manifest.canvas.width + targetX;
          const occluderIndex = topLayer[targetPixel]!;
          if (occluderIndex >= 0) {
            const occluderId = ordered[occluderIndex]!.definition.id;
            if (!allowed.has(occluderId)) {
              unexpected.set(
                occluderId,
                (unexpected.get(occluderId) ?? 0) + 1,
              );
            }
          } else {
            topLayer[targetPixel] = layerIndex;
          }
        }
      }
      if (unexpected.size) {
        throw new SpriteFamilyError(
          "SPRITE_FAMILY_OCCLUSION_POLICY_VIOLATION",
          `${frame.id}.${layer.definition.id} is overlapped by undeclared higher layers. Declare allowedOccludedBy or the higher layer's occludes relationship explicitly.`,
          {
            frameId: frame.id,
            layerId: layer.definition.id,
            allowedOccludedBy: [...allowed].sort(),
            unexpectedOccluders: [...unexpected.entries()]
              .sort(([left], [right]) => left.localeCompare(right))
              .map(([layerId, pixels]) => ({ layerId, pixels })),
          },
        );
      }
    }
  }
}

export async function verifySpriteFamily(
  input: unknown,
  options: SpriteFamilyExecutionOptions,
): Promise<SpriteFamilyRunResult> {
  const manifest = validateSpriteFamilyManifest(input);
  await assertStrictArtifactStates(manifest, options.artifacts);
  await assertOcclusionPolicy(manifest, options.artifacts);
  return verifySpriteFamilyInternal(manifest, options);
}
