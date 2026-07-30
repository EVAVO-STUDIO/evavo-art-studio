import { createHash } from "node:crypto";

import sharp from "sharp";

import type {
  NormalizedSpriteFamilyFrameLayer,
  NormalizedSpriteFamilyLayerDefinition,
  SpriteCompositeParityEvidence,
  SpriteLayerBlendMode,
} from "./types.js";
import { SpriteFamilyError } from "./types.js";
import type { SelectionImageFeatures } from "@evavo/art-selection";

export interface ResolvedSpriteLayer {
  readonly definition: NormalizedSpriteFamilyLayerDefinition;
  readonly instance: NormalizedSpriteFamilyFrameLayer;
  readonly features: SelectionImageFeatures;
  readonly descriptorSha256: string;
  readonly contentSha256: string;
}

export interface LayerRenderEvidence {
  readonly layerId: string;
  readonly visiblePixels: number;
  readonly clippedVisiblePixels: number;
  readonly contributionPixels: number;
  readonly occludedPixels: number;
  readonly contributionFraction: number;
  readonly centroid: Readonly<{ x: number; y: number }>;
}

export interface RenderedSpriteComposite {
  readonly rgba: Uint8Array;
  readonly png: Buffer;
  readonly sha256: string;
  readonly layerEvidence: readonly LayerRenderEvidence[];
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function blendChannel(
  mode: SpriteLayerBlendMode,
  backdrop: number,
  source: number,
): number {
  if (mode === "add") return Math.min(1, backdrop + source);
  if (mode === "multiply") return backdrop * source;
  if (mode === "screen") return 1 - (1 - backdrop) * (1 - source);
  return source;
}

function compositePixel(
  output: Uint8Array,
  targetOffset: number,
  source: Uint8Array,
  sourceOffset: number,
  opacity: number,
  blendMode: SpriteLayerBlendMode,
): void {
  const sourceAlpha = (source[sourceOffset + 3]! / 255) * opacity;
  if (sourceAlpha <= 0) return;
  const backdropAlpha = output[targetOffset + 3]! / 255;
  const resultAlpha = sourceAlpha + backdropAlpha - sourceAlpha * backdropAlpha;
  const sourceR = source[sourceOffset]! / 255;
  const sourceG = source[sourceOffset + 1]! / 255;
  const sourceB = source[sourceOffset + 2]! / 255;
  const backdropR = output[targetOffset]! / 255;
  const backdropG = output[targetOffset + 1]! / 255;
  const backdropB = output[targetOffset + 2]! / 255;
  const channel = (backdrop: number, foreground: number): number => {
    if (resultAlpha <= 0) return 0;
    const blended = blendChannel(blendMode, backdrop, foreground);
    const premultiplied =
      (1 - sourceAlpha) * backdrop * backdropAlpha +
      (1 - backdropAlpha) * foreground * sourceAlpha +
      backdropAlpha * sourceAlpha * blended;
    return clamp01(premultiplied / resultAlpha);
  };
  output[targetOffset] = Math.round(channel(backdropR, sourceR) * 255);
  output[targetOffset + 1] = Math.round(channel(backdropG, sourceG) * 255);
  output[targetOffset + 2] = Math.round(channel(backdropB, sourceB) * 255);
  output[targetOffset + 3] = Math.round(clamp01(resultAlpha) * 255);
}

function layerOrdering(
  left: ResolvedSpriteLayer,
  right: ResolvedSpriteLayer,
): number {
  return (
    left.definition.zIndex - right.definition.zIndex ||
    left.definition.id.localeCompare(right.definition.id)
  );
}

function placedIndex(
  x: number,
  y: number,
  layer: ResolvedSpriteLayer,
  canvas: Readonly<{ width: number; height: number }>,
): number | null {
  const targetX = x + layer.instance.offset.x;
  const targetY = y + layer.instance.offset.y;
  if (
    targetX < 0 ||
    targetY < 0 ||
    targetX >= canvas.width ||
    targetY >= canvas.height
  ) {
    return null;
  }
  return targetY * canvas.width + targetX;
}

function layerVisibility(
  layers: readonly ResolvedSpriteLayer[],
  canvas: Readonly<{ width: number; height: number }>,
  alphaVisibleThreshold: number,
): readonly LayerRenderEvidence[] {
  const ordered = [...layers].sort(layerOrdering);
  const alphaAbove = new Float32Array(canvas.width * canvas.height);
  const results = new Map<string, LayerRenderEvidence>();
  for (let layerIndex = ordered.length - 1; layerIndex >= 0; layerIndex -= 1) {
    const layer = ordered[layerIndex]!;
    let visiblePixels = 0;
    let clippedVisiblePixels = 0;
    let contributionPixels = 0;
    let centroidX = 0;
    let centroidY = 0;
    let centroidWeight = 0;
    for (let y = 0; y < layer.features.height; y += 1) {
      for (let x = 0; x < layer.features.width; x += 1) {
        const sourcePixel = y * layer.features.width + x;
        const sourceOffset = sourcePixel * 4;
        const rawAlpha = layer.features.rgba[sourceOffset + 3]!;
        const alpha = (rawAlpha / 255) * layer.instance.opacity;
        if (rawAlpha < alphaVisibleThreshold || alpha <= 0) continue;
        visiblePixels += 1;
        const targetPixel = placedIndex(x, y, layer, canvas);
        if (targetPixel === null) {
          clippedVisiblePixels += 1;
          continue;
        }
        const targetX = targetPixel % canvas.width;
        const targetY = Math.floor(targetPixel / canvas.width);
        centroidX += targetX * alpha;
        centroidY += targetY * alpha;
        centroidWeight += alpha;
        const effective = alpha * (1 - alphaAbove[targetPixel]!);
        if (effective * 255 >= alphaVisibleThreshold) contributionPixels += 1;
      }
    }
    for (let y = 0; y < layer.features.height; y += 1) {
      for (let x = 0; x < layer.features.width; x += 1) {
        const sourcePixel = y * layer.features.width + x;
        const sourceOffset = sourcePixel * 4;
        const alpha =
          (layer.features.rgba[sourceOffset + 3]! / 255) *
          layer.instance.opacity;
        if (alpha <= 0) continue;
        const targetPixel = placedIndex(x, y, layer, canvas);
        if (targetPixel === null) continue;
        alphaAbove[targetPixel] =
          alpha + alphaAbove[targetPixel]! - alpha * alphaAbove[targetPixel]!;
      }
    }
    const inCanvasVisible = Math.max(0, visiblePixels - clippedVisiblePixels);
    const occludedPixels = Math.max(0, inCanvasVisible - contributionPixels);
    results.set(layer.definition.id, {
      layerId: layer.definition.id,
      visiblePixels,
      clippedVisiblePixels,
      contributionPixels,
      occludedPixels,
      contributionFraction:
        visiblePixels > 0 ? contributionPixels / visiblePixels : 0,
      centroid:
        centroidWeight > 0
          ? { x: centroidX / centroidWeight, y: centroidY / centroidWeight }
          : { x: 0, y: 0 },
    });
  }
  return ordered.map((layer) => results.get(layer.definition.id)!);
}

export async function renderSpriteComposite(
  canvas: Readonly<{ width: number; height: number }>,
  layers: readonly ResolvedSpriteLayer[],
  alphaVisibleThreshold: number,
): Promise<RenderedSpriteComposite> {
  const ordered = [...layers]
    .filter((layer) => layer.definition.contributesToComposite)
    .sort(layerOrdering);
  if (!ordered.length) {
    throw new SpriteFamilyError(
      "SPRITE_FAMILY_COMPOSITE_EMPTY",
      "A frame has no layers contributing to its colour composite.",
    );
  }
  const output = new Uint8Array(canvas.width * canvas.height * 4);
  for (const layer of ordered) {
    for (let y = 0; y < layer.features.height; y += 1) {
      for (let x = 0; x < layer.features.width; x += 1) {
        const targetPixel = placedIndex(x, y, layer, canvas);
        if (targetPixel === null) continue;
        compositePixel(
          output,
          targetPixel * 4,
          layer.features.rgba,
          (y * layer.features.width + x) * 4,
          layer.instance.opacity,
          layer.definition.blendMode,
        );
      }
    }
  }
  const png = await sharp(Buffer.from(output), {
    raw: { width: canvas.width, height: canvas.height, channels: 4 },
  })
    .png({ compressionLevel: 9, adaptiveFiltering: false })
    .toBuffer();
  return {
    rgba: output,
    png,
    sha256: createHash("sha256").update(png).digest("hex"),
    layerEvidence: layerVisibility(
      ordered,
      canvas,
      alphaVisibleThreshold,
    ),
  };
}

export async function renderIdentityComposite(
  canvas: Readonly<{ width: number; height: number }>,
  layers: readonly ResolvedSpriteLayer[],
  alphaVisibleThreshold: number,
): Promise<RenderedSpriteComposite> {
  return renderSpriteComposite(
    canvas,
    layers.map((layer) => ({
      ...layer,
      definition: {
        ...layer.definition,
        contributesToComposite: layer.definition.contributesToIdentity,
      },
    })),
    alphaVisibleThreshold,
  );
}

export function compareCompositeParity(
  generated: Uint8Array,
  declared: Uint8Array | undefined,
  declaredCompositeArtifactId: string | undefined,
  generatedSha256: string,
  declaredSha256: string | undefined,
  channelTolerance: number,
): SpriteCompositeParityEvidence {
  if (!declared) {
    return {
      ...(declaredCompositeArtifactId
        ? { declaredCompositeArtifactId: declaredCompositeArtifactId as never }
        : {}),
      generatedSha256,
      ...(declaredSha256 ? { declaredSha256 } : {}),
      exact: false,
      comparedChannels: 0,
      mismatchedChannels: 0,
      mismatchFraction: 0,
      meanAbsoluteError: 0,
      maximumAbsoluteError: 0,
    };
  }
  const comparedChannels = Math.max(generated.length, declared.length);
  let mismatchedChannels = 0;
  let totalError = 0;
  let maximumAbsoluteError = 0;
  for (let index = 0; index < comparedChannels; index += 1) {
    const error = Math.abs((generated[index] ?? 0) - (declared[index] ?? 0));
    totalError += error;
    maximumAbsoluteError = Math.max(maximumAbsoluteError, error);
    if (error > channelTolerance) mismatchedChannels += 1;
  }
  return {
    ...(declaredCompositeArtifactId
      ? { declaredCompositeArtifactId: declaredCompositeArtifactId as never }
      : {}),
    generatedSha256,
    ...(declaredSha256 ? { declaredSha256 } : {}),
    exact: generated.length === declared.length && maximumAbsoluteError === 0,
    comparedChannels,
    mismatchedChannels,
    mismatchFraction:
      comparedChannels > 0 ? mismatchedChannels / comparedChannels : 0,
    meanAbsoluteError:
      comparedChannels > 0 ? totalError / comparedChannels : 0,
    maximumAbsoluteError,
  };
}
