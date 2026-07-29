import { createHash } from "node:crypto";

import { alphaEvidence, visibleBounds } from "./frame-basic.js";
import { haloEvidence, transparentRgbEvidence } from "./frame-edge.js";
import { fakeTransparencyEvidence } from "./frame-fake-transparency.js";
import { gate } from "./frame-shared.js";
import {
  SPRITE_QUALITY_SCHEMA_VERSION,
  type DecodedSpriteFrame,
  type SpriteFrameQualityExpectations,
  type SpriteFrameQualityReport,
  type SpriteQualityGateResult,
} from "./types.js";
import { normalizeSpriteFrameExpectations } from "./validation.js";

function frameHash(frame: DecodedSpriteFrame): string {
  return createHash("sha256")
    .update(`${frame.width}x${frame.height}x${frame.channels}\0`)
    .update(frame.data)
    .digest("hex");
}

export function analyseDecodedSpriteFrame(
  frame: DecodedSpriteFrame,
  inputExpectations: SpriteFrameQualityExpectations | unknown,
): SpriteFrameQualityReport {
  const expectations = normalizeSpriteFrameExpectations(inputExpectations);
  if (frame.data.length !== frame.width * frame.height * 4) {
    throw new Error(
      `Decoded RGBA buffer length ${frame.data.length} does not match ${frame.width}×${frame.height}.`,
    );
  }

  const alpha = alphaEvidence(frame, expectations.alphaVisibleThreshold);
  const bounds = visibleBounds(frame, expectations.alphaVisibleThreshold);
  const fakeTransparency = fakeTransparencyEvidence(frame, expectations, alpha);
  const halo = haloEvidence(frame, expectations);
  const transparentRgb = transparentRgbEvidence(frame);
  const gates: SpriteQualityGateResult[] = [];

  const dimensionsPass =
    (expectations.expectedWidth === undefined || frame.width === expectations.expectedWidth) &&
    (expectations.expectedHeight === undefined || frame.height === expectations.expectedHeight);
  gates.push(
    gate(
      "dimensions",
      dimensionsPass ? "pass" : "fail",
      true,
      dimensionsPass
        ? "Decoded dimensions match the declared frame contract."
        : "Decoded dimensions do not match the declared frame contract.",
      { width: frame.width, height: frame.height },
      `${frame.width}x${frame.height}`,
      `${expectations.expectedWidth ?? frame.width}x${expectations.expectedHeight ?? frame.height}`,
    ),
  );

  const formatPass =
    expectations.expectedFormat === undefined ||
    frame.sourceFormat.toLowerCase() === expectations.expectedFormat;
  gates.push(
    gate(
      "file-format",
      formatPass ? "pass" : "fail",
      true,
      formatPass
        ? "Decoded source format matches the declared output profile."
        : "Decoded source format differs from the declared output profile.",
      { sourceFormat: frame.sourceFormat },
      frame.sourceFormat,
      expectations.expectedFormat ?? frame.sourceFormat,
    ),
  );

  const alphaPass =
    expectations.transparency === "opaque" ||
    (frame.sourceHasAlpha && alpha.transparentPixels + alpha.partialPixels > 0);
  gates.push(
    gate(
      "alpha-channel",
      alphaPass
        ? "pass"
        : expectations.transparency === "alpha-preferred"
          ? "warning"
          : "fail",
      expectations.transparency === "alpha-required",
      alphaPass
        ? "The decoded source contains usable alpha for the declared transparency policy."
        : "The declared transparency policy is not supported by the decoded source alpha.",
      { sourceHasAlpha: frame.sourceHasAlpha, ...alpha },
      frame.sourceHasAlpha,
      expectations.transparency,
    ),
  );

  const fakePass =
    expectations.transparency === "opaque" ||
    (!fakeTransparency.flatMatteDetected && !fakeTransparency.checkerboardDetected);
  gates.push(
    gate(
      "fake-transparency",
      fakePass ? "pass" : "fail",
      expectations.transparency !== "opaque",
      fakePass
        ? "No baked matte or checkerboard transparency imitation was detected."
        : "A baked matte or checkerboard transparency imitation was detected.",
      { ...fakeTransparency },
      Math.max(
        fakeTransparency.flatMatteConfidence,
        fakeTransparency.checkerboardConfidence,
      ),
      Math.min(
        expectations.flatMatteBorderThreshold,
        expectations.checkerboardConfidenceThreshold,
      ),
    ),
  );

  const cropClearances = Object.values(bounds.clearance);
  const cropPass =
    bounds.visiblePixels > 0 &&
    cropClearances.every((clearance) => clearance >= expectations.safePadding);
  gates.push(
    gate(
      "frame-crop",
      cropPass ? "pass" : "fail",
      true,
      cropPass
        ? "Visible subject bounds retain the declared transparent safety margin."
        : bounds.visiblePixels === 0
          ? "No visible subject pixels were found."
          : "Visible pixels touch or enter the declared safety margin.",
      { ...bounds },
      Math.min(...cropClearances),
      expectations.safePadding,
    ),
  );

  const haloPass = halo.haloFraction <= expectations.maximumHaloFraction;
  gates.push(
    gate(
      "edge-halo",
      haloPass ? "pass" : "fail",
      expectations.transparency !== "opaque",
      haloPass
        ? "Partially transparent edges remain consistent with neighbouring subject colour."
        : "Partially transparent edges contain likely matte-colour contamination.",
      { ...halo },
      halo.haloFraction,
      expectations.maximumHaloFraction,
    ),
  );

  const transparentRgbPass =
    transparentRgb.unexpectedFraction <=
    expectations.maximumUnexpectedTransparentRgbFraction;
  gates.push(
    gate(
      "transparent-pixel-colour",
      transparentRgbPass ? "pass" : "fail",
      expectations.transparency !== "opaque",
      transparentRgbPass
        ? "Transparent RGB is clean or agrees with nearby subject edge bleed."
        : "Unexpected colour remains beneath fully transparent pixels.",
      { ...transparentRgb },
      transparentRgb.unexpectedFraction,
      expectations.maximumUnexpectedTransparentRgbFraction,
    ),
  );

  const passed = !gates.some((entry) => entry.blocking && entry.status === "fail");
  return {
    schemaVersion: SPRITE_QUALITY_SCHEMA_VERSION,
    frameId: expectations.frameId,
    passed,
    rawRgbaSha256: frameHash(frame),
    source: {
      format: frame.sourceFormat,
      hasAlpha: frame.sourceHasAlpha,
      pages: frame.sourcePages,
      width: frame.width,
      height: frame.height,
      channels: 4,
    },
    alpha,
    visibleBounds: bounds,
    fakeTransparency,
    halo,
    transparentRgb,
    gates,
  };
}
