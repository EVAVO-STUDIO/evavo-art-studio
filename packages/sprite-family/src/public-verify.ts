import {
  normalizeJson,
  type ArtifactId,
  type ArtifactStore,
  type StoredArtifact,
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
import {
  spriteFamilyManifestSha256,
  validateSpriteFamilyManifest,
} from "./validation.js";
import { verifySpriteFamily as verifySpriteFamilyInternal } from "./verify.js";

const MAXIMUM_OCCLUSION_PIXEL_COMPARISONS = 50_000_000;

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

function manifestSourceArtifactIds(
  manifest: NormalizedSpriteFamilyManifest,
): readonly ArtifactId[] {
  return declaredArtifacts(manifest)
    .map((entry) => entry.artifactId)
    .sort();
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

function isAbove(
  candidate: NormalizedSpriteFamilyLayerDefinition,
  target: NormalizedSpriteFamilyLayerDefinition,
): boolean {
  return (
    candidate.zIndex > target.zIndex ||
    (candidate.zIndex === target.zIndex &&
      candidate.id.localeCompare(target.id) > 0)
  );
}

interface OcclusionLayer {
  readonly definition: NormalizedSpriteFamilyLayerDefinition;
  readonly instance: NormalizedSpriteFamilyManifest["frames"][number]["layers"][number];
  readonly features: SelectionImageFeatures;
}

function placedBounds(layer: OcclusionLayer): Readonly<{
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}> | null {
  if (layer.features.visiblePixels <= 0) return null;
  return {
    minX: layer.features.bounds.minX + layer.instance.offset.x,
    minY: layer.features.bounds.minY + layer.instance.offset.y,
    maxX: layer.features.bounds.maxX + layer.instance.offset.x,
    maxY: layer.features.bounds.maxY + layer.instance.offset.y,
  };
}

function visibleAlphaAt(
  layer: OcclusionLayer,
  canvasX: number,
  canvasY: number,
  alphaVisibleThreshold: number,
): boolean {
  const sourceX = canvasX - layer.instance.offset.x;
  const sourceY = canvasY - layer.instance.offset.y;
  if (
    sourceX < 0 ||
    sourceY < 0 ||
    sourceX >= layer.features.width ||
    sourceY >= layer.features.height
  ) {
    return false;
  }
  const sourcePixel = sourceY * layer.features.width + sourceX;
  const alpha =
    layer.features.rgba[sourcePixel * 4 + 3]! * layer.instance.opacity;
  return alpha >= alphaVisibleThreshold;
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

  let comparedPixels = 0;
  for (const frame of manifest.frames) {
    const layers: readonly OcclusionLayer[] = await Promise.all(
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
    const rendered = layers.filter(
      (layer) => layer.definition.contributesToComposite,
    );
    for (const lower of rendered) {
      const lowerBounds = placedBounds(lower);
      if (!lowerBounds) continue;
      const allowed = allowedOccluders(
        lower.definition,
        manifest.layerDefinitions,
      );
      for (const higher of rendered) {
        if (
          higher.definition.id === lower.definition.id ||
          !isAbove(higher.definition, lower.definition) ||
          allowed.has(higher.definition.id)
        ) {
          continue;
        }
        const higherBounds = placedBounds(higher);
        if (!higherBounds) continue;
        const minX = Math.max(lowerBounds.minX, higherBounds.minX, 0);
        const minY = Math.max(lowerBounds.minY, higherBounds.minY, 0);
        const maxX = Math.min(
          lowerBounds.maxX,
          higherBounds.maxX,
          manifest.canvas.width - 1,
        );
        const maxY = Math.min(
          lowerBounds.maxY,
          higherBounds.maxY,
          manifest.canvas.height - 1,
        );
        if (minX > maxX || minY > maxY) continue;
        for (let y = minY; y <= maxY; y += 1) {
          for (let x = minX; x <= maxX; x += 1) {
            comparedPixels += 1;
            if (comparedPixels > MAXIMUM_OCCLUSION_PIXEL_COMPARISONS) {
              throw new SpriteFamilyError(
                "SPRITE_FAMILY_OCCLUSION_PREFLIGHT_LIMIT_EXCEEDED",
                `Occlusion preflight exceeded ${MAXIMUM_OCCLUSION_PIXEL_COMPARISONS} pixel-pair comparisons. Reduce canvas or layer complexity, or declare intended occlusion relationships explicitly.`,
                { frameId: frame.id, comparedPixels },
              );
            }
            if (
              visibleAlphaAt(
                lower,
                x,
                y,
                manifest.policy.alphaVisibleThreshold,
              ) &&
              visibleAlphaAt(
                higher,
                x,
                y,
                manifest.policy.alphaVisibleThreshold,
              )
            ) {
              throw new SpriteFamilyError(
                "SPRITE_FAMILY_OCCLUSION_POLICY_VIOLATION",
                `${frame.id}.${lower.definition.id} is overlapped by undeclared higher layer ${higher.definition.id}. Declare allowedOccludedBy or the higher layer's occludes relationship explicitly.`,
                {
                  frameId: frame.id,
                  layerId: lower.definition.id,
                  occluderLayerId: higher.definition.id,
                  firstOverlappingPixel: { x, y },
                  allowedOccludedBy: [...allowed].sort(),
                  comparedPixels,
                },
              );
            }
          }
        }
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
  const kernel = await verifySpriteFamilyInternal(manifest, options);
  const manifestSha256 = spriteFamilyManifestSha256(manifest);
  const sourceArtifactIds = manifestSourceArtifactIds(manifest);
  const manifestArtifact = await options.artifacts.put(
    `${JSON.stringify(normalizeJson(manifest), null, 2)}\n`,
    {
      mediaType: "application/json",
      storageClass: "manifest",
      fileName: `${manifest.familyId}.sprite-family.manifest.json`,
      sourceArtifacts: sourceArtifactIds,
      labels: {
        artifactRole: "sprite-family-normalized-manifest",
        approvalState: "evidence-only",
        familyId: manifest.familyId,
        manifestSha256,
      },
      metadata: normalizeJson({
        schemaVersion: "1.0",
        protocolVersion: manifest.protocolVersion,
        manifestSha256,
        frameCount: manifest.frames.length,
        layerDefinitionCount: manifest.layerDefinitions.length,
        sourceArtifactCount: sourceArtifactIds.length,
      }),
    },
  );
  const evidence = {
    ...kernel.evidence,
    manifestArtifactId: manifestArtifact.artifactId,
    kernelEvidenceArtifactId: kernel.evidenceArtifactId,
  };
  const evidenceArtifact = await options.artifacts.put(
    `${JSON.stringify(normalizeJson(evidence), null, 2)}\n`,
    {
      mediaType: "application/json",
      storageClass: "evidence",
      fileName: `${manifest.familyId}.sprite-family.evidence.json`,
      sourceArtifacts: [
        manifestArtifact.artifactId,
        kernel.evidenceArtifactId,
        ...sourceArtifactIds,
        ...kernel.generatedCompositeArtifactIds,
      ].sort() as readonly ArtifactId[],
      labels: {
        artifactRole: "sprite-family-consistency-evidence",
        familyId: manifest.familyId,
        qualityState: evidence.passed ? "passed" : "rejected",
        approvalState: "evidence-only",
        evidenceEnvelope: "manifest-bound",
      },
      metadata: normalizeJson({
        schemaVersion: "1.0",
        protocolVersion: manifest.protocolVersion,
        manifestSha256,
        manifestArtifactId: manifestArtifact.artifactId,
        kernelEvidenceArtifactId: kernel.evidenceArtifactId,
        frameCount: evidence.frameEvidence.length,
        passedFrameCount: evidence.frameEvidence.filter((entry) => entry.passed)
          .length,
        familyGateCount: evidence.familyGates.length,
      }),
    },
  );
  return {
    manifestArtifactId: manifestArtifact.artifactId,
    kernelEvidenceArtifactId: kernel.evidenceArtifactId,
    evidenceArtifactId: evidenceArtifact.artifactId,
    generatedCompositeArtifactIds: kernel.generatedCompositeArtifactIds,
    evidence,
  };
}
