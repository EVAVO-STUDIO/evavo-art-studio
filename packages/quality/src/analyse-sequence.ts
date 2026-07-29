import { analyseDecodedSpriteFrame } from "./analyse-frame.js";
import { median } from "./math.js";
import { duplicateEvidence, frameOrderEvidence, samePoint, sequenceGate as gate } from "./sequence-evidence.js";
import {
  SPRITE_QUALITY_SCHEMA_VERSION,
  SpriteQualityInputError,
  type DecodedSpriteFrame,
  type SpriteFrameQualityReport,
  type SpriteQualityGateResult,
  type SpriteSequenceManifest,
  type SpriteSequenceQualityReport,
} from "./types.js";
import { validateSpriteSequenceManifest } from "./validation.js";

export async function analyseSpriteSequence(
  inputManifest: SpriteSequenceManifest | unknown,
  frames: ReadonlyMap<string, DecodedSpriteFrame>,
): Promise<SpriteSequenceQualityReport> {
  const manifest = validateSpriteSequenceManifest(inputManifest);
  const frameReports: SpriteFrameQualityReport[] = [];

  for (const frame of manifest.frames) {
    const decoded = frames.get(frame.id);
    if (!decoded) {
      throw new SpriteQualityInputError(
        "SPRITE_SEQUENCE_FRAME_MISSING",
        `Decoded frame was not supplied for ${frame.id}.`,
      );
    }
    frameReports.push(
      analyseDecodedSpriteFrame(decoded, {
        frameId: frame.id,
        transparency: manifest.transparency,
        expectedWidth: manifest.expectedWidth,
        expectedHeight: manifest.expectedHeight,
        safePadding: manifest.safePadding,
      }),
    );
  }

  const gates: SpriteQualityGateResult[] = [];
  const dimensionsValid = frameReports.every(
    (report) =>
      report.source.width === manifest.expectedWidth &&
      report.source.height === manifest.expectedHeight,
  );
  gates.push(
    gate(
      "frame-canvas",
      dimensionsValid ? "pass" : "fail",
      true,
      dimensionsValid
        ? "Every decoded frame uses the declared shared canvas."
        : "At least one decoded frame differs from the declared shared canvas.",
      {
        expectedWidth: manifest.expectedWidth,
        expectedHeight: manifest.expectedHeight,
        frames: frameReports.map((report) => ({
          id: report.frameId,
          width: report.source.width,
          height: report.source.height,
        })),
      },
    ),
  );

  const order = frameOrderEvidence(manifest);
  const orderValid = order.globalOrderValid && order.directionOrderValid;
  gates.push(
    gate(
      "frame-order",
      orderValid ? "pass" : "fail",
      true,
      orderValid
        ? "Global and per-direction frame indices are contiguous and ordered."
        : "Global or per-direction frame indices are missing, duplicated or out of order.",
      order,
    ),
  );

  const durationValid = manifest.frames.every((frame) => frame.durationMs > 0);
  gates.push(
    gate(
      "frame-duration",
      durationValid ? "pass" : "fail",
      true,
      durationValid
        ? "Every frame retains a positive exact millisecond duration."
        : "At least one frame duration is invalid.",
      {
        durations: manifest.frames.map((frame) => ({ id: frame.id, durationMs: frame.durationMs })),
      },
    ),
  );

  const expectedPivot = manifest.expectedPivot ?? manifest.frames[0]!.pivot;
  const pivotDrift = manifest.frames
    .filter((frame) => !samePoint(frame.pivot, expectedPivot))
    .map((frame) => ({ id: frame.id, pivot: frame.pivot }));
  gates.push(
    gate(
      "frame-anchor",
      pivotDrift.length === 0 ? "pass" : "fail",
      true,
      pivotDrift.length === 0
        ? "Every frame retains the declared pivot."
        : "One or more frames drift from the declared pivot.",
      { expectedPivot, drift: pivotDrift },
    ),
  );

  const baseline = manifest.expectedBaseline ?? manifest.frames.find((frame) => frame.baseline !== undefined)?.baseline;
  const baselineDrift =
    baseline === undefined
      ? []
      : manifest.frames
          .filter((frame) => frame.baseline !== baseline)
          .map((frame) => ({ id: frame.id, baseline: frame.baseline }));
  gates.push(
    gate(
      "frame-baseline",
      baseline === undefined ? "skipped" : baselineDrift.length === 0 ? "pass" : "fail",
      baseline !== undefined,
      baseline === undefined
        ? "No baseline lock was declared."
        : baselineDrift.length === 0
          ? "Every frame retains the declared baseline."
          : "One or more frames drift from the declared baseline.",
      { expectedBaseline: baseline ?? null, drift: baselineDrift },
    ),
  );

  const reportById = new Map(frameReports.map((report) => [report.frameId, report] as const));
  const groundContactFailures = manifest.frames
    .filter((frame) => frame.groundContact)
    .flatMap((frame) => {
      const report = reportById.get(frame.id);
      const expected = frame.baseline ?? baseline;
      const actual = report?.visibleBounds.maxY;
      if (
        report &&
        expected !== undefined &&
        actual !== null &&
        actual !== undefined &&
        Math.abs(actual - expected) <= (manifest.groundContactTolerance ?? 1)
      ) {
        return [];
      }
      return [{ id: frame.id, expectedBaseline: expected ?? null, visibleBottom: actual ?? null }];
    });
  gates.push(
    gate(
      "ground-contact",
      groundContactFailures.length === 0 ? "pass" : "fail",
      manifest.frames.some((frame) => frame.groundContact),
      groundContactFailures.length === 0
        ? "Declared ground-contact frames meet the baseline tolerance."
        : "One or more ground-contact frames do not meet the baseline tolerance.",
      {
        tolerance: manifest.groundContactTolerance ?? 1,
        failures: groundContactFailures,
      },
    ),
  );

  const duplicates = duplicateEvidence(manifest, frameReports);
  const undeclaredDuplicates = duplicates.filter((entry) => !entry.declared);
  gates.push(
    gate(
      "frame-duplicates",
      undeclaredDuplicates.length === 0 ? "pass" : "fail",
      true,
      undeclaredDuplicates.length === 0
        ? "Duplicate pixels are absent or explicitly declared as linked cels or holds."
        : "Undeclared exact duplicate frames were detected.",
      { groups: duplicates },
    ),
  );

  const areas = frameReports.map((report) => report.visibleBounds.visiblePixels);
  const medianArea = median(areas);
  const areaOutliers = frameReports
    .filter((report) => {
      if (medianArea === 0) return report.visibleBounds.visiblePixels !== 0;
      const ratio = report.visibleBounds.visiblePixels / medianArea;
      return ratio < 0.45 || ratio > 2.2;
    })
    .map((report) => ({ id: report.frameId, visiblePixels: report.visibleBounds.visiblePixels }));
  gates.push(
    gate(
      "frame-visible-area",
      areaOutliers.length === 0 ? "pass" : "warning",
      false,
      areaOutliers.length === 0
        ? "No gross visible-area outliers were detected."
        : "Some frames differ substantially from the sequence median visible area and require review.",
      { medianVisiblePixels: medianArea, outliers: areaOutliers },
    ),
  );

  const failedFrames = frameReports.filter((report) => !report.passed);
  const passed =
    failedFrames.length === 0 &&
    !gates.some((entry) => entry.blocking && entry.status === "fail");
  const directions = [...new Set(manifest.frames.map((frame) => frame.direction ?? "default"))];

  return {
    schemaVersion: SPRITE_QUALITY_SCHEMA_VERSION,
    sequenceId: manifest.sequenceId,
    passed,
    frameReports,
    duplicateGroups: duplicates,
    gates,
    summary: {
      frameCount: manifest.frames.length,
      passedFrames: manifest.frames.length - failedFrames.length,
      failedFrames: failedFrames.length,
      totalDurationMs: manifest.frames.reduce((total, frame) => total + frame.durationMs, 0),
      directions,
    },
  };
}
