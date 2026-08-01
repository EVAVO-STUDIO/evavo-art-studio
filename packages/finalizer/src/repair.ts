import {
  analyseDecodedSpriteFrame,
  normalizeSpriteFrameExpectations,
  type DecodedSpriteFrame,
  type NormalizedSpriteFrameQualityExpectations,
  type RgbaColour,
  type SpriteFrameQualityExpectations,
} from "@evavo/art-quality";

import { assessSpriteFinalization } from "./classify.js";
import {
  SPRITE_FINALIZER_PROTOCOL_VERSION,
  SpriteFinalizerError,
  type NormalizedSpriteFinalizationRepairOptions,
  type SpriteFinalizationAssessment,
  type SpriteFinalizationRepairOptions,
  type SpriteFinalizationRepairPass,
  type SpriteFinalizationResult,
} from "./types.js";

function boundedInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  name: string,
): number {
  const resolved = value ?? fallback;
  if (!Number.isInteger(resolved) || resolved < minimum || resolved > maximum) {
    throw new SpriteFinalizerError(
      "SPRITE_FINALIZER_OPTION_INVALID",
      `${name} must be an integer between ${minimum} and ${maximum}.`,
    );
  }
  return resolved;
}

export function normalizeSpriteFinalizationRepairOptions(
  input: SpriteFinalizationRepairOptions = {},
): NormalizedSpriteFinalizationRepairOptions {
  const visibleAlphaThreshold = boundedInteger(
    input.visibleAlphaThreshold,
    8,
    1,
    254,
    "visibleAlphaThreshold",
  );
  const opaqueAlphaThreshold = boundedInteger(
    input.opaqueAlphaThreshold,
    224,
    visibleAlphaThreshold,
    255,
    "opaqueAlphaThreshold",
  );
  return {
    maximumPasses: boundedInteger(
      input.maximumPasses,
      2,
      0,
      8,
      "maximumPasses",
    ),
    transparentBleedRadius: boundedInteger(
      input.transparentBleedRadius,
      2,
      0,
      16,
      "transparentBleedRadius",
    ),
    matteSearchRadius: boundedInteger(
      input.matteSearchRadius,
      6,
      1,
      32,
      "matteSearchRadius",
    ),
    matteDistanceThreshold: boundedInteger(
      input.matteDistanceThreshold,
      72,
      1,
      441,
      "matteDistanceThreshold",
    ),
    visibleAlphaThreshold,
    opaqueAlphaThreshold,
  };
}

function colourDistance(
  r: number,
  g: number,
  b: number,
  matte: RgbaColour,
): number {
  return Math.sqrt(
    (r - matte.r) ** 2 +
      (g - matte.g) ** 2 +
      (b - matte.b) ** 2,
  );
}

function nearestForegroundColour(
  frame: DecodedSpriteFrame,
  x: number,
  y: number,
  radius: number,
  minimumAlpha: number,
): Readonly<{ r: number; g: number; b: number }> | null {
  let best:
    | Readonly<{
        r: number;
        g: number;
        b: number;
        distance: number;
        alpha: number;
      }>
    | null = null;
  const minimumX = Math.max(0, x - radius);
  const maximumX = Math.min(frame.width - 1, x + radius);
  const minimumY = Math.max(0, y - radius);
  const maximumY = Math.min(frame.height - 1, y + radius);
  for (let sampleY = minimumY; sampleY <= maximumY; sampleY += 1) {
    for (let sampleX = minimumX; sampleX <= maximumX; sampleX += 1) {
      const dx = sampleX - x;
      const dy = sampleY - y;
      const distance = dx * dx + dy * dy;
      if (distance === 0 || distance > radius * radius) continue;
      const offset = (sampleY * frame.width + sampleX) * 4;
      const alpha = frame.data[offset + 3]!;
      if (alpha < minimumAlpha) continue;
      if (
        best === null ||
        distance < best.distance ||
        (distance === best.distance && alpha > best.alpha)
      ) {
        best = {
          r: frame.data[offset]!,
          g: frame.data[offset + 1]!,
          b: frame.data[offset + 2]!,
          distance,
          alpha,
        };
      }
    }
  }
  return best === null ? null : { r: best.r, g: best.g, b: best.b };
}

function matteLike(
  r: number,
  g: number,
  b: number,
  mattes: readonly RgbaColour[],
  maximumDistance: number,
): boolean {
  return mattes.some(
    (matte) => colourDistance(r, g, b, matte) <= maximumDistance,
  );
}

function repairedFrame(
  frame: DecodedSpriteFrame,
  expectations: NormalizedSpriteFrameQualityExpectations,
  options: NormalizedSpriteFinalizationRepairOptions,
  repairTransparentRgb: boolean,
  repairHalo: boolean,
): Readonly<{ frame: DecodedSpriteFrame; changedPixels: number }> {
  const data = new Uint8Array(frame.data);
  let changedPixels = 0;
  for (let y = 0; y < frame.height; y += 1) {
    for (let x = 0; x < frame.width; x += 1) {
      const offset = (y * frame.width + x) * 4;
      const alpha = data[offset + 3]!;
      const originalR = data[offset]!;
      const originalG = data[offset + 1]!;
      const originalB = data[offset + 2]!;
      let nextR = originalR;
      let nextG = originalG;
      let nextB = originalB;

      if (repairTransparentRgb && alpha === 0) {
        const neighbour =
          options.transparentBleedRadius > 0
            ? nearestForegroundColour(
                frame,
                x,
                y,
                options.transparentBleedRadius,
                options.visibleAlphaThreshold,
              )
            : null;
        nextR = neighbour?.r ?? 0;
        nextG = neighbour?.g ?? 0;
        nextB = neighbour?.b ?? 0;
      } else if (
        repairHalo &&
        alpha > 0 &&
        alpha < 255 &&
        matteLike(
          originalR,
          originalG,
          originalB,
          expectations.knownMatteColours,
          options.matteDistanceThreshold,
        )
      ) {
        const neighbour =
          nearestForegroundColour(
            frame,
            x,
            y,
            options.matteSearchRadius,
            options.opaqueAlphaThreshold,
          ) ??
          nearestForegroundColour(
            frame,
            x,
            y,
            options.matteSearchRadius,
            options.visibleAlphaThreshold,
          );
        if (neighbour) {
          nextR = neighbour.r;
          nextG = neighbour.g;
          nextB = neighbour.b;
        }
      }

      if (
        nextR !== originalR ||
        nextG !== originalG ||
        nextB !== originalB
      ) {
        data[offset] = nextR;
        data[offset + 1] = nextG;
        data[offset + 2] = nextB;
        changedPixels += 1;
      }
    }
  }
  return {
    frame: {
      ...frame,
      data,
    },
    changedPixels,
  };
}

function escalationAssessment(
  assessment: SpriteFinalizationAssessment,
): SpriteFinalizationAssessment {
  return {
    ...assessment,
    disposition: "provider-repair",
    repairableGateIds: [],
    nonRepairableGateIds: assessment.failedBlockingGateIds,
    actions: assessment.actions.map((action) => ({
      ...action,
      automatic: false,
      description: `${action.description} The bounded deterministic pass made no further safe pixel changes, so a provider repair or named review is required.`,
    })),
  };
}

export function finalizeDecodedSpriteFrame(
  inputFrame: DecodedSpriteFrame,
  inputExpectations: SpriteFrameQualityExpectations | unknown,
  inputOptions: SpriteFinalizationRepairOptions = {},
): SpriteFinalizationResult {
  if (inputFrame.data.length !== inputFrame.width * inputFrame.height * 4) {
    throw new SpriteFinalizerError(
      "SPRITE_FINALIZER_FRAME_INVALID",
      "Decoded sprite frame does not contain one complete RGBA buffer.",
    );
  }
  const expectations = normalizeSpriteFrameExpectations(inputExpectations);
  const options = normalizeSpriteFinalizationRepairOptions(inputOptions);
  let frame: DecodedSpriteFrame = {
    ...inputFrame,
    data: new Uint8Array(inputFrame.data),
  };
  let report = analyseDecodedSpriteFrame(frame, expectations);
  let assessment = assessSpriteFinalization(report);
  const passes: SpriteFinalizationRepairPass[] = [
    {
      pass: 0,
      inputRawRgbaSha256: report.rawRgbaSha256,
      outputRawRgbaSha256: report.rawRgbaSha256,
      changedPixels: 0,
      actions: [],
      report,
      assessment,
    },
  ];
  let totalChangedPixels = 0;

  for (
    let pass = 1;
    pass <= options.maximumPasses &&
    assessment.disposition === "deterministic-repair";
    pass += 1
  ) {
    const inputHash = report.rawRgbaSha256;
    const repair = repairedFrame(
      frame,
      expectations,
      options,
      assessment.failedBlockingGateIds.includes("transparent-pixel-colour"),
      assessment.failedBlockingGateIds.includes("edge-halo"),
    );
    if (repair.changedPixels === 0) {
      assessment = escalationAssessment(assessment);
      break;
    }
    frame = repair.frame;
    totalChangedPixels += repair.changedPixels;
    report = analyseDecodedSpriteFrame(frame, expectations);
    assessment = assessSpriteFinalization(report);
    passes.push({
      pass,
      inputRawRgbaSha256: inputHash,
      outputRawRgbaSha256: report.rawRgbaSha256,
      changedPixels: repair.changedPixels,
      actions: [
        ...(passes[passes.length - 1]!.assessment.failedBlockingGateIds.includes(
          "transparent-pixel-colour",
        )
          ? (["transparent-rgb-normalize"] as const)
          : []),
        ...(passes[passes.length - 1]!.assessment.failedBlockingGateIds.includes(
          "edge-halo",
        )
          ? (["matte-edge-decontaminate"] as const)
          : []),
      ],
      report,
      assessment,
    });
  }

  return {
    schemaVersion: "1.0",
    protocolVersion: SPRITE_FINALIZER_PROTOCOL_VERSION,
    ready: report.passed && assessment.disposition === "ready",
    changed: totalChangedPixels > 0,
    frame,
    expectations,
    report,
    assessment,
    passes,
    changedPixels: totalChangedPixels,
  };
}
