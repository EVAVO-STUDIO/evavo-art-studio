import sharp from "sharp";

import { resolveDeliveryImageProfile } from "./profiles.js";
import { MAXIMUM_PIXELS } from "./raster.js";
import {
  type DeliveryCandidateEvidence,
  type DeliveryEncodingCandidate,
  type DeliveryImageRequest,
} from "./types.js";

export function candidateId(candidate: DeliveryEncodingCandidate): string {
  if (candidate.format === "png") {
    return candidate.paletteColours === undefined
      ? "png-truecolour"
      : `png-palette-${candidate.paletteColours}-dither-${candidate.dither}`;
  }
  return `webp-q${candidate.quality}-${candidate.nearLossless ? "near-lossless" : "lossy"}`;
}

export async function encodeCandidate(
  raw: Buffer,
  width: number,
  height: number,
  includeAlpha: boolean,
  candidate: DeliveryEncodingCandidate,
): Promise<Buffer> {
  let pipeline = sharp(raw, {
    raw: { width, height, channels: 4 },
    failOn: "error",
    limitInputPixels: MAXIMUM_PIXELS,
    sequentialRead: true,
  });
  if (!includeAlpha) pipeline = pipeline.removeAlpha();

  if (candidate.format === "png") {
    return pipeline
      .png({
        compressionLevel: 9,
        adaptiveFiltering: true,
        effort: 10,
        palette: candidate.paletteColours !== undefined,
        ...(candidate.paletteColours === undefined
          ? {}
          : {
              colours: candidate.paletteColours,
              dither: candidate.dither,
            }),
      })
      .toBuffer();
  }

  return pipeline
    .webp({
      quality: candidate.quality,
      alphaQuality: 100,
      effort: 6,
      nearLossless: candidate.nearLossless,
      smartSubsample: false,
    })
    .toBuffer();
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
  return failures;
}
