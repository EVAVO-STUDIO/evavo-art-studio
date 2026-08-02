import {
  extractChromaKeyAlpha,
  type ChromaKeyExtractionOptions,
} from "@evavo/art-media";
import sharp, { type Sharp } from "sharp";

import {
  candidateFailures,
  candidateId,
  encodeCandidate,
} from "./encoding.js";
import { deliveryProfileSha256, resolveDeliveryImageProfile } from "./profiles.js";
import {
  MAXIMUM_INPUT_BYTES,
  MAXIMUM_PIXELS,
  alphaCounts,
  applyColourPolicy,
  comparePixels,
  exactImageBytes,
  inspectEncodedRaster,
  inspectSource,
  normalizeRawRgba,
  sha256,
} from "./raster.js";
import {
  DELIVERY_OPTIMIZER_RECEIPT_SCHEMA,
  DELIVERY_OPTIMIZER_VERSION,
  PROFILE_CATALOG_VERSION,
  DeliveryOptimizerError,
  type DeliveryCandidateEvidence,
  type DeliveryImageRequest,
  type DeliveryImageResult,
} from "./types.js";

function backgroundOptions(
  request: DeliveryImageRequest,
): ChromaKeyExtractionOptions {
  if (request.background.mode !== "remove-border-matte") {
    throw new DeliveryOptimizerError(
      "DELIVERY_BACKGROUND_POLICY_INVALID",
      "Background extraction options require remove-border-matte mode.",
    );
  }
  const background = request.background;
  const blackMatte = background.matteColour.toLowerCase() === "#000000";
  return {
    matteColour: background.matteColour,
    connectionDistance:
      background.connectionDistance ?? (blackMatte ? 24 : 140),
    opaqueSeedDistance:
      background.opaqueSeedDistance ?? (blackMatte ? 64 : 220),
    edgeSearchRadius: background.edgeSearchRadius ?? 12,
    bleedRadius: background.bleedRadius ?? 2,
    minimumBorderMatteFraction:
      background.minimumBorderMatteFraction ?? 0.65,
    maximumInputBytes: MAXIMUM_INPUT_BYTES,
    maximumPixels: MAXIMUM_PIXELS,
  };
}

function transformedPipeline(
  input: Buffer,
  request: DeliveryImageRequest,
  transformations: string[],
): Sharp {
  const profile = resolveDeliveryImageProfile(request.profileId);
  let pipeline = sharp(input, {
    failOn: "error",
    limitInputPixels: MAXIMUM_PIXELS,
    sequentialRead: true,
  }).rotate();
  transformations.push("apply-orientation-and-strip-metadata");

  if (
    profile.resizePolicy === "fit-inside" &&
    profile.maxWidth !== null &&
    profile.maxHeight !== null
  ) {
    pipeline = pipeline.resize({
      width: profile.maxWidth,
      height: profile.maxHeight,
      fit: "inside",
      withoutEnlargement: true,
      kernel:
        profile.kernel === "nearest"
          ? sharp.kernel.nearest
          : sharp.kernel.lanczos3,
    });
    transformations.push(
      `fit-inside-${profile.maxWidth}x${profile.maxHeight}-${profile.kernel}`,
    );
  }

  if (profile.transparencyPolicy === "opaque") {
    pipeline = pipeline.flatten({ background: profile.flattenColour });
    transformations.push(`flatten-alpha-${profile.flattenColour.toLowerCase()}`);
  }
  return pipeline;
}

type CandidateResult = Readonly<{
  bytes: Buffer;
  evidence: DeliveryCandidateEvidence;
  hasAlpha: boolean;
  transformations: readonly string[];
}>;

function containsNonZeroTransparentRgb(data: Uint8Array): boolean {
  for (let offset = 0; offset < data.byteLength; offset += 4) {
    if (
      data[offset + 3] === 0 &&
      (data[offset] !== 0 || data[offset + 1] !== 0 || data[offset + 2] !== 0)
    ) {
      return true;
    }
  }
  return false;
}

function baseCandidateEvidence(
  id: string,
  format: "png" | "webp",
  bytes: Buffer,
  raw: Buffer,
  reference: Buffer,
  pngStorage: DeliveryCandidateEvidence["pngStorage"],
): Omit<DeliveryCandidateEvidence, "passed" | "failures"> {
  return {
    id,
    format,
    bytes: bytes.byteLength,
    sha256: sha256(bytes),
    pngStorage,
    metrics: comparePixels(reference, raw),
    alpha: alphaCounts(raw),
  };
}

export async function optimizeDeliveryImage(
  input: Buffer | Uint8Array,
  request: DeliveryImageRequest,
): Promise<DeliveryImageResult> {
  const original = exactImageBytes(input);
  const profile = resolveDeliveryImageProfile(request.profileId);
  if (
    request.background.mode === "remove-border-matte" &&
    profile.transparencyPolicy === "opaque"
  ) {
    throw new DeliveryOptimizerError(
      "DELIVERY_BACKGROUND_REMOVAL_FOR_OPAQUE_PROFILE",
      `Profile ${profile.id} is opaque and cannot remove a matte background.`,
    );
  }

  const source = await inspectSource(original);
  const transformations: string[] = [];
  let working = original;
  let backgroundEvidence: unknown | null = null;

  if (request.background.mode === "remove-border-matte") {
    const extracted = await extractChromaKeyAlpha(
      original,
      backgroundOptions(request),
    );
    working = extracted.png;
    backgroundEvidence = extracted.evidence;
    transformations.push(
      `remove-border-connected-matte-${request.background.matteColour.toLowerCase()}`,
      "decontaminate-edge-and-bleed-transparent-rgb",
    );
  } else {
    transformations.push("preserve-authored-background");
  }

  const workingMetadata = await sharp(working, {
    failOn: "error",
    limitInputPixels: MAXIMUM_PIXELS,
    sequentialRead: true,
  }).metadata();
  const referenceDecoded = await transformedPipeline(
    working,
    request,
    transformations,
  )
    .raw()
    .toBuffer({ resolveWithObject: true });
  const width = referenceDecoded.info.width;
  const height = referenceDecoded.info.height;
  const referenceData = applyColourPolicy(
    normalizeRawRgba(
      referenceDecoded.data,
      width,
      height,
      referenceDecoded.info.channels,
    ),
    profile.colourPolicy,
    transformations,
  );
  const referenceAlpha = alphaCounts(referenceData);
  const requiresTransparentRgbPreservation =
    request.profileId === "godot-sprite-lossless" &&
    containsNonZeroTransparentRgb(referenceData);
  if (
    profile.requireMeaningfulTransparency &&
    referenceAlpha.transparentPixels + referenceAlpha.partialPixels === 0
  ) {
    throw new DeliveryOptimizerError(
      "DELIVERY_MEANINGFUL_TRANSPARENCY_REQUIRED",
      `Profile ${profile.id} requires transparent or feathered pixels.`,
    );
  }

  const includeAlpha =
    profile.transparencyPolicy === "required" ||
    (profile.transparencyPolicy === "preserve" &&
      (workingMetadata.hasAlpha ?? false));
  const candidates: CandidateResult[] = [];

  if (
    request.background.mode === "preserve" &&
    source.evidence.format === profile.outputFormat
  ) {
    const inspected = await inspectEncodedRaster(original);
    if (inspected.width === width && inspected.height === height) {
      const base = baseCandidateEvidence(
        "source-original",
        profile.outputFormat,
        original,
        inspected.raw,
        referenceData,
        inspected.pngStorage,
      );
      const failures = candidateFailures(base, request.profileId);
      candidates.push({
        bytes: original,
        evidence: {
          ...base,
          passed: failures.length === 0,
          failures,
        },
        hasAlpha: inspected.metadata.hasAlpha ?? false,
        transformations: Object.freeze([
          "preserve-authored-background",
          "reuse-source-bytes-after-decoded-policy-equivalence-check",
        ]),
      });
    }
  }

  for (const encoding of profile.candidates) {
    const encoded = await encodeCandidate(
      referenceData,
      width,
      height,
      includeAlpha,
      encoding,
      request.profileId,
    );
    const inspected = await inspectEncodedRaster(encoded);
    if (inspected.width !== width || inspected.height !== height) {
      throw new DeliveryOptimizerError(
        "DELIVERY_CANDIDATE_DIMENSIONS_CHANGED",
        `${candidateId(encoding)} decoded to ${inspected.width}x${inspected.height}, expected ${width}x${height}.`,
      );
    }
    const base = {
      ...baseCandidateEvidence(
        candidateId(encoding, request.profileId),
        encoding.format,
        encoded,
        inspected.raw,
        referenceData,
        inspected.pngStorage,
      ),
      ...(encoding.format === "png"
        ? {
            ...(encoding.paletteColours === undefined
              ? {}
              : { paletteColours: encoding.paletteColours }),
            dither: encoding.dither,
          }
        : {
            quality: encoding.quality,
            nearLossless: encoding.nearLossless,
          }),
    } satisfies Omit<DeliveryCandidateEvidence, "passed" | "failures">;
    const failures = [
      ...candidateFailures(base, request.profileId),
      ...(requiresTransparentRgbPreservation &&
      encoding.format === "png" &&
      encoding.paletteColours !== undefined
        ? ["transparent-rgb-preservation-requires-truecolour"]
        : []),
    ];
    candidates.push({
      bytes: encoded,
      evidence: {
        ...base,
        passed: failures.length === 0,
        failures,
      },
      hasAlpha: inspected.metadata.hasAlpha ?? false,
      transformations: Object.freeze([
        ...transformations,
        `encode-${base.id}`,
      ]),
    });
  }

  const selected = candidates
    .filter((value) => value.evidence.passed)
    .sort(
      (left, right) =>
        left.bytes.byteLength - right.bytes.byteLength ||
        Number(right.evidence.id === "source-original") -
          Number(left.evidence.id === "source-original") ||
        left.evidence.id.localeCompare(right.evidence.id),
    )[0];
  if (!selected) {
    throw new DeliveryOptimizerError(
      "DELIVERY_NO_ENCODING_CANDIDATE_PASSED",
      `No ${profile.id} encoding candidate satisfied the quality and byte budget.`,
      {
        profileId: profile.id,
        candidates: candidates.map((value) => value.evidence),
      },
    );
  }

  const savedBytes = original.byteLength - selected.bytes.byteLength;
  return {
    bytes: selected.bytes,
    evidence: {
      schema: DELIVERY_OPTIMIZER_RECEIPT_SCHEMA,
      optimizerVersion: DELIVERY_OPTIMIZER_VERSION,
      profileCatalogVersion: PROFILE_CATALOG_VERSION,
      profileId: profile.id,
      profileSha256: deliveryProfileSha256(profile),
      source: source.evidence,
      prepared: {
        sha256: selected.evidence.sha256,
        bytes: selected.bytes.byteLength,
        format: profile.outputFormat,
        width,
        height,
        hasAlpha: selected.hasAlpha,
        pngStorage: selected.evidence.pngStorage,
      },
      transformations: selected.transformations,
      background: {
        mode: request.background.mode,
        evidence: backgroundEvidence,
      },
      candidates: Object.freeze(candidates.map((value) => value.evidence)),
      selectedCandidateId: selected.evidence.id,
      savings: {
        bytes: savedBytes,
        fraction: savedBytes / original.byteLength,
      },
    },
  };
}
