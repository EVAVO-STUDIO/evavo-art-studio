import sharp from "sharp";

import { reviewTextureMap, type TextureMapReviewEvidence } from "./texture-map-review.js";

export const TEXTURE_PREPROCESS_CONTRACT = "evavo.texture-preprocess.v1" as const;

export type TangentNormalConvention = "opengl" | "directx";
export type TextureDataChannel = "r" | "g" | "b" | "a";

export interface TangentNormalYConversionSpec {
  readonly sourceConvention: TangentNormalConvention;
  readonly targetConvention: TangentNormalConvention;
}

export interface TangentNormalYConversionResult {
  readonly png: Buffer;
  readonly evidence: Readonly<{
    contract: typeof TEXTURE_PREPROCESS_CONTRACT;
    operation: "tangent-normal-y-convention-conversion";
    sourceConvention: TangentNormalConvention;
    targetConvention: TangentNormalConvention;
    width: number;
    height: number;
    pixelCount: number;
    transformation: "G=255-G";
    preservedChannels: readonly ["r", "b", "a"];
    sourceMutationAllowed: false;
    sourceReview: TextureMapReviewEvidence;
    outputReview: TextureMapReviewEvidence;
  }>;
}

export interface OpacityAlphaCompositionSpec {
  readonly sourceChannel?: TextureDataChannel;
  readonly invertOpacity?: boolean;
  readonly strictOpacityValidation?: boolean;
}

export interface OpacityAlphaCompositionResult {
  readonly png: Buffer;
  readonly evidence: Readonly<{
    contract: typeof TEXTURE_PREPROCESS_CONTRACT;
    operation: "compose-opacity-into-albedo-alpha";
    width: number;
    height: number;
    pixelCount: number;
    sourceChannel: TextureDataChannel;
    invertOpacity: boolean;
    albedoRgbPreservedExactly: true;
    alphaReplaced: true;
    sourceMutationAllowed: false;
    opacityReview: TextureMapReviewEvidence;
  }>;
}

function channelOffset(channel: TextureDataChannel): number {
  if (channel === "r") return 0;
  if (channel === "g") return 1;
  if (channel === "b") return 2;
  return 3;
}

/**
 * Convert tangent-space normal Y convention by negating the encoded Y vector.
 * For an 8-bit normal channel this is exactly G := 255 - G; R/B/A are copied byte-for-byte.
 */
export async function convertTangentNormalYConvention(
  encoded: Buffer,
  spec: TangentNormalYConversionSpec,
): Promise<TangentNormalYConversionResult> {
  if (!Buffer.isBuffer(encoded) || !encoded.byteLength) throw new Error("Normal-map input must be a non-empty Buffer.");
  if (!spec || (spec.sourceConvention !== "opengl" && spec.sourceConvention !== "directx")) {
    throw new Error("sourceConvention must be opengl or directx.");
  }
  if (spec.targetConvention !== "opengl" && spec.targetConvention !== "directx") {
    throw new Error("targetConvention must be opengl or directx.");
  }
  if (spec.sourceConvention === spec.targetConvention) {
    throw new Error("Normal convention conversion requires different source and target conventions.");
  }

  const sourceReview = await reviewTextureMap(encoded, { kind: "normal-tangent" });
  if (sourceReview.grade === "fail") {
    throw new Error(`Source normal map failed admission: ${sourceReview.blockers.join(", ") || "normal-review-failed"}`);
  }

  const decoded = await sharp(encoded, { failOn: "error" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const width = decoded.info.width;
  const height = decoded.info.height;
  if (!width || !height) throw new Error("Normal-map input has no dimensions.");
  const raw = Buffer.from(decoded.data);
  for (let offset = 0; offset < raw.length; offset += 4) raw[offset + 1] = 255 - raw[offset + 1]!;

  const png = await sharp(raw, { raw: { width, height, channels: 4 } })
    .png({ compressionLevel: 9, adaptiveFiltering: false })
    .toBuffer();
  const outputReview = await reviewTextureMap(png, { kind: "normal-tangent" });
  if (outputReview.grade === "fail") {
    throw new Error(`Converted normal map failed post-conversion review: ${outputReview.blockers.join(", ") || "normal-review-failed"}`);
  }

  return Object.freeze({
    png,
    evidence: Object.freeze({
      contract: TEXTURE_PREPROCESS_CONTRACT,
      operation: "tangent-normal-y-convention-conversion" as const,
      sourceConvention: spec.sourceConvention,
      targetConvention: spec.targetConvention,
      width,
      height,
      pixelCount: width * height,
      transformation: "G=255-G" as const,
      preservedChannels: Object.freeze(["r", "b", "a"] as const),
      sourceMutationAllowed: false as const,
      sourceReview,
      outputReview,
    }),
  });
}

/**
 * Compose an admitted scalar opacity map into albedo alpha while preserving
 * the albedo RGB bytes exactly. No resizing, colour conversion or RGB filtering occurs.
 */
export async function composeOpacityIntoAlbedoAlpha(
  albedoEncoded: Buffer,
  opacityEncoded: Buffer,
  spec: OpacityAlphaCompositionSpec = {},
): Promise<OpacityAlphaCompositionResult> {
  if (!Buffer.isBuffer(albedoEncoded) || !albedoEncoded.byteLength) throw new Error("Albedo input must be a non-empty Buffer.");
  if (!Buffer.isBuffer(opacityEncoded) || !opacityEncoded.byteLength) throw new Error("Opacity input must be a non-empty Buffer.");
  const sourceChannel = spec.sourceChannel ?? "r";
  if (sourceChannel !== "r" && sourceChannel !== "g" && sourceChannel !== "b" && sourceChannel !== "a") {
    throw new Error("sourceChannel must be r, g, b or a.");
  }
  const strictOpacityValidation = spec.strictOpacityValidation !== false;
  const opacityReview = await reviewTextureMap(opacityEncoded, { kind: "opacity" });
  if (strictOpacityValidation && opacityReview.blockers.some((value) => value.startsWith("scalar-map-has-colour-contamination"))) {
    throw new Error(`Opacity input failed scalar validation: ${opacityReview.blockers.join(", ")}`);
  }

  const [albedo, opacity] = await Promise.all([
    sharp(albedoEncoded, { failOn: "error" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
    sharp(opacityEncoded, { failOn: "error" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
  ]);
  const width = albedo.info.width;
  const height = albedo.info.height;
  if (!width || !height || !opacity.info.width || !opacity.info.height) throw new Error("Albedo/opacity input has no dimensions.");
  if (opacity.info.width !== width || opacity.info.height !== height) {
    throw new Error(`Opacity dimensions must match albedo exactly; albedo=${width}x${height}, opacity=${opacity.info.width}x${opacity.info.height}.`);
  }

  const output = Buffer.from(albedo.data);
  const component = channelOffset(sourceChannel);
  const invertOpacity = spec.invertOpacity === true;
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const sourceValue = opacity.data[pixel * 4 + component]!;
    output[pixel * 4 + 3] = invertOpacity ? 255 - sourceValue : sourceValue;
  }
  const png = await sharp(output, { raw: { width, height, channels: 4 } })
    .png({ compressionLevel: 9, adaptiveFiltering: false })
    .toBuffer();

  return Object.freeze({
    png,
    evidence: Object.freeze({
      contract: TEXTURE_PREPROCESS_CONTRACT,
      operation: "compose-opacity-into-albedo-alpha" as const,
      width,
      height,
      pixelCount: width * height,
      sourceChannel,
      invertOpacity,
      albedoRgbPreservedExactly: true as const,
      alphaReplaced: true as const,
      sourceMutationAllowed: false as const,
      opacityReview,
    }),
  });
}
