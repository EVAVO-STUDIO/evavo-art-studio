import sharp, { type WebpOptions } from "sharp";

import { resolveDeliveryImageProfile } from "./profiles.js";
import { MAXIMUM_PIXELS } from "./raster.js";
import {
  type DeliveryCandidateEvidence,
  type DeliveryEncodingCandidate,
  type DeliveryImageRequest,
  type DeliveryProfileId,
} from "./types.js";

const pngStorageId = (colourType: number): string => {
  switch (colourType) {
    case 0:
      return "png-grayscale8";
    case 2:
      return "png-rgb8";
    case 4:
      return "png-grayscale-alpha8";
    case 6:
      return "png-rgba8";
    default:
      return `png-colour-type-${colourType}`;
  }
};

export function candidateId(
  candidate: DeliveryEncodingCandidate,
  profileId?: DeliveryProfileId,
): string {
  if (candidate.format === "png") {
    const storage = profileId
      ? resolveDeliveryImageProfile(profileId).pngStorage
      : null;
    if (storage) return pngStorageId(storage.colourType);
    return candidate.paletteColours === undefined
      ? "png-truecolour"
      : `png-palette-${candidate.paletteColours}-dither-${candidate.dither}`;
  }
  if (candidate.lossless === true) return "webp-lossless";
  return `webp-q${candidate.quality}-${candidate.nearLossless ? "near-lossless" : "lossy"}`;
}

export async function encodeCandidate(
  raw: Buffer,
  width: number,
  height: number,
  includeAlpha: boolean,
  candidate: DeliveryEncodingCandidate,
  profileId: DeliveryProfileId,
): Promise<Buffer> {
  const profile = resolveDeliveryImageProfile(profileId);
  let pipeline = sharp(raw, {
    raw: { width, height, channels: 4 },
    failOn: "error",
    limitInputPixels: MAXIMUM_PIXELS,
    sequentialRead: true,
  });

  if (candidate.format === "png" && profile.pngStorage) {
    switch (profile.pngStorage.colourType) {
      case 0:
        pipeline = pipeline.toColourspace("b-w").removeAlpha();
        break;
      case 2:
        pipeline = pipeline.toColourspace("srgb").removeAlpha();
        break;
      case 4:
        pipeline = pipeline.toColourspace("b-w").ensureAlpha();
        break;
      case 6:
        pipeline = pipeline.toColourspace("srgb").ensureAlpha();
        break;
    }
  } else if (!includeAlpha) {
    pipeline = pipeline.removeAlpha();
  }

  if (candidate.format === "png") {
    const governedStorage = profile.pngStorage !== null;
    return pipeline
      .png({
        compressionLevel: 9,
        adaptiveFiltering: true,
        effort: 10,
        palette: governedStorage ? false : candidate.paletteColours !== undefined,
        ...(governedStorage || candidate.paletteColours === undefined
          ? {}
          : {
              colours: candidate.paletteColours,
              dither: candidate.dither,
            }),
      })
      .toBuffer();
  }

  const webpOptions: WebpOptions & { readonly exact: boolean } = {
    quality: candidate.quality,
    alphaQuality: 100,
    effort: 6,
    lossless: candidate.lossless === true,
    nearLossless:
      candidate.lossless === true ? false : candidate.nearLossless,
    exact: candidate.lossless === true,
    smartSubsample: false,
  };
  return pipeline.webp(webpOptions).toBuffer();
}

export function candidateFailures(
  evidence: Omit<DeliveryCandidateEvidence, "passed" | "failures">,
  profileId: DeliveryImageRequest["profileId"],
): readonly string[] {
  const profile = resolveDeliveryImageProfile(profileId);
  const failures: string[] = [];
  if (evidence.bytes > profile.maximumOutputBytes) {
    failures.push(`output-bytes:${evidence.bytes}>${profile.maximumOutputBytes}`);
  }
  if (evidence.metrics.psnr < profile.quality.minimumPsnr) {
    failures.push(
      `psnr:${evidence.metrics.psnr.toFixed(4)}<${profile.quality.minimumPsnr}`,
    );
  }
  if (
    evidence.metrics.meanAbsoluteError >
    profile.quality.maximumMeanAbsoluteError
  ) {
    failures.push(
      `mae:${evidence.metrics.meanAbsoluteError.toFixed(4)}>${profile.quality.maximumMeanAbsoluteError}`,
    );
  }
  if (
    evidence.metrics.alphaMeanAbsoluteError >
    profile.quality.maximumAlphaMeanAbsoluteError
  ) {
    failures.push(
      `alpha-mae:${evidence.metrics.alphaMeanAbsoluteError.toFixed(4)}>${profile.quality.maximumAlphaMeanAbsoluteError}`,
    );
  }
  if (
    evidence.metrics.alphaMaximumDifference >
    profile.quality.maximumAlphaDifference
  ) {
    failures.push(
      `alpha-max:${evidence.metrics.alphaMaximumDifference}>${profile.quality.maximumAlphaDifference}`,
    );
  }
  if (profile.pngStorage) {
    if (!evidence.pngStorage) {
      failures.push("png-storage-missing");
    } else {
      if (evidence.pngStorage.bitDepth !== profile.pngStorage.bitDepth) {
        failures.push(
          `png-bit-depth:${evidence.pngStorage.bitDepth}!=${profile.pngStorage.bitDepth}`,
        );
      }
      if (evidence.pngStorage.colourType !== profile.pngStorage.colourType) {
        failures.push(
          `png-colour-type:${evidence.pngStorage.colourType}!=${profile.pngStorage.colourType}`,
        );
      }
      if (evidence.pngStorage.interlace !== profile.pngStorage.interlace) {
        failures.push(
          `png-interlace:${evidence.pngStorage.interlace}!=${profile.pngStorage.interlace}`,
        );
      }
    }
  }
  if (
    profile.transparencyPolicy === "required" &&
    profile.requireMeaningfulTransparency &&
    evidence.alpha.transparentPixels + evidence.alpha.partialPixels === 0
  ) {
    failures.push("meaningful-transparency-required");
  }
  if (
    profile.transparencyPolicy === "opaque" &&
    evidence.alpha.transparentPixels + evidence.alpha.partialPixels > 0
  ) {
    failures.push("opaque-profile-retained-transparency");
  }
  if (
    profileId === "godot-cutout-webp-1080p" &&
    evidence.format === "webp" &&
    evidence.metrics.transparentRgbDifferingPixels > 0
  ) {
    failures.push("transparent-rgb-not-preserved");
  }
  return failures;
}
