import {
  SpriteQualityInputError,
  type NormalizedSpriteFrameQualityExpectations,
  type Point,
  type RgbaColour,
  type SpriteFrameQualityExpectations,
  type SpriteSequenceFrameSpec,
  type SpriteSequenceManifest,
  type SpriteTransparencyExpectation,
} from "./types.js";

const DEFAULT_MATTES: readonly RgbaColour[] = Object.freeze([
  Object.freeze({ r: 255, g: 255, b: 255 }),
  Object.freeze({ r: 0, g: 0, b: 0 }),
  Object.freeze({ r: 128, g: 128, b: 128 }),
  Object.freeze({ r: 0, g: 255, b: 0 }),
  Object.freeze({ r: 255, g: 0, b: 255 }),
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const finiteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const finiteInteger = (value: unknown): value is number =>
  finiteNumber(value) && Number.isInteger(value);

function assertRange(name: string, value: number, minimum: number, maximum: number): void {
  if (value < minimum || value > maximum) {
    throw new SpriteQualityInputError(
      "SPRITE_QUALITY_EXPECTATION_INVALID",
      `${name} must be between ${minimum} and ${maximum}.`,
    );
  }
}

function point(value: unknown, name: string): Point {
  if (!isRecord(value) || !finiteNumber(value.x) || !finiteNumber(value.y)) {
    throw new SpriteQualityInputError(
      "SPRITE_SEQUENCE_MANIFEST_INVALID",
      `${name} must contain finite x and y coordinates.`,
    );
  }
  return { x: value.x, y: value.y };
}

function channel(value: unknown, name: string): number {
  if (!finiteInteger(value) || value < 0 || value > 255) {
    throw new SpriteQualityInputError(
      "SPRITE_QUALITY_EXPECTATION_INVALID",
      `${name} must be an integer between 0 and 255.`,
    );
  }
  return value;
}

export function parseColour(value: string | RgbaColour): RgbaColour {
  if (typeof value === "string") {
    const match = /^#?([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(value.trim());
    if (!match?.[1]) {
      throw new SpriteQualityInputError(
        "SPRITE_QUALITY_EXPECTATION_INVALID",
        `Unsupported colour value: ${value}`,
      );
    }
    return {
      r: Number.parseInt(match[1].slice(0, 2), 16),
      g: Number.parseInt(match[1].slice(2, 4), 16),
      b: Number.parseInt(match[1].slice(4, 6), 16),
      ...(match[2] ? { a: Number.parseInt(match[2], 16) } : {}),
    };
  }
  return {
    r: channel(value.r, "colour.r"),
    g: channel(value.g, "colour.g"),
    b: channel(value.b, "colour.b"),
    ...(value.a === undefined ? {} : { a: channel(value.a, "colour.a") }),
  };
}

function transparency(value: unknown): SpriteTransparencyExpectation {
  if (value === "opaque" || value === "alpha-required" || value === "alpha-preferred") {
    return value;
  }
  throw new SpriteQualityInputError(
    "SPRITE_QUALITY_EXPECTATION_INVALID",
    "transparency must be opaque, alpha-required or alpha-preferred.",
  );
}

export function normalizeSpriteFrameExpectations(
  input: unknown,
): NormalizedSpriteFrameQualityExpectations {
  if (!isRecord(input)) {
    throw new SpriteQualityInputError(
      "SPRITE_QUALITY_EXPECTATION_INVALID",
      "Frame quality expectations must be an object.",
    );
  }

  const raw = input as unknown as SpriteFrameQualityExpectations;
  const safePadding = raw.safePadding ?? 1;
  const alphaVisibleThreshold = raw.alphaVisibleThreshold ?? 8;
  const flatMatteBorderThreshold = raw.flatMatteBorderThreshold ?? 0.9;
  const checkerboardConfidenceThreshold = raw.checkerboardConfidenceThreshold ?? 0.86;
  const maximumHaloFraction = raw.maximumHaloFraction ?? 0.015;
  const maximumUnexpectedTransparentRgbFraction =
    raw.maximumUnexpectedTransparentRgbFraction ?? 0.02;

  if (!finiteInteger(safePadding) || safePadding < 0 || safePadding > 1024) {
    throw new SpriteQualityInputError(
      "SPRITE_QUALITY_EXPECTATION_INVALID",
      "safePadding must be an integer between 0 and 1024.",
    );
  }
  if (!finiteInteger(alphaVisibleThreshold)) {
    throw new SpriteQualityInputError(
      "SPRITE_QUALITY_EXPECTATION_INVALID",
      "alphaVisibleThreshold must be an integer.",
    );
  }
  assertRange("alphaVisibleThreshold", alphaVisibleThreshold, 1, 255);
  assertRange("flatMatteBorderThreshold", flatMatteBorderThreshold, 0, 1);
  assertRange("checkerboardConfidenceThreshold", checkerboardConfidenceThreshold, 0, 1);
  assertRange("maximumHaloFraction", maximumHaloFraction, 0, 1);
  assertRange(
    "maximumUnexpectedTransparentRgbFraction",
    maximumUnexpectedTransparentRgbFraction,
    0,
    1,
  );

  for (const [name, value] of [
    ["expectedWidth", raw.expectedWidth],
    ["expectedHeight", raw.expectedHeight],
  ] as const) {
    if (value !== undefined && (!finiteInteger(value) || value <= 0)) {
      throw new SpriteQualityInputError(
        "SPRITE_QUALITY_EXPECTATION_INVALID",
        `${name} must be a positive integer.`,
      );
    }
  }

  const knownMatteColours = (raw.knownMatteColours ?? DEFAULT_MATTES).map(parseColour);
  if (knownMatteColours.length === 0) {
    throw new SpriteQualityInputError(
      "SPRITE_QUALITY_EXPECTATION_INVALID",
      "knownMatteColours must contain at least one colour.",
    );
  }

  return {
    frameId: typeof raw.frameId === "string" && raw.frameId.trim() ? raw.frameId.trim() : "frame",
    transparency: transparency(raw.transparency),
    ...(raw.expectedWidth === undefined ? {} : { expectedWidth: raw.expectedWidth }),
    ...(raw.expectedHeight === undefined ? {} : { expectedHeight: raw.expectedHeight }),
    ...(typeof raw.expectedFormat === "string" && raw.expectedFormat.trim()
      ? { expectedFormat: raw.expectedFormat.trim().toLowerCase() }
      : {}),
    safePadding,
    alphaVisibleThreshold,
    knownMatteColours,
    flatMatteBorderThreshold,
    checkerboardConfidenceThreshold,
    maximumHaloFraction,
    maximumUnexpectedTransparentRgbFraction,
  };
}

function frameSpec(value: unknown, index: number): SpriteSequenceFrameSpec {
  const path = `frames[${index}]`;
  if (!isRecord(value)) {
    throw new SpriteQualityInputError(
      "SPRITE_SEQUENCE_MANIFEST_INVALID",
      `${path} must be an object.`,
    );
  }
  if (typeof value.id !== "string" || !value.id.trim()) {
    throw new SpriteQualityInputError(
      "SPRITE_SEQUENCE_MANIFEST_INVALID",
      `${path}.id is required.`,
    );
  }
  if (typeof value.path !== "string" || !value.path.trim()) {
    throw new SpriteQualityInputError(
      "SPRITE_SEQUENCE_MANIFEST_INVALID",
      `${path}.path is required.`,
    );
  }
  for (const key of ["frameIndex", "globalFrameIndex"] as const) {
    const numericValue = value[key];
    if (!finiteInteger(numericValue) || numericValue < 0) {
      throw new SpriteQualityInputError(
        "SPRITE_SEQUENCE_MANIFEST_INVALID",
        `${path}.${key} must be a non-negative integer.`,
      );
    }
  }
  if (!finiteNumber(value.durationMs) || value.durationMs <= 0) {
    throw new SpriteQualityInputError(
      "SPRITE_SEQUENCE_MANIFEST_INVALID",
      `${path}.durationMs must be greater than zero.`,
    );
  }
  if (value.baseline !== undefined && !finiteNumber(value.baseline)) {
    throw new SpriteQualityInputError(
      "SPRITE_SEQUENCE_MANIFEST_INVALID",
      `${path}.baseline must be finite.`,
    );
  }
  if (value.groundContact !== undefined && typeof value.groundContact !== "boolean") {
    throw new SpriteQualityInputError(
      "SPRITE_SEQUENCE_MANIFEST_INVALID",
      `${path}.groundContact must be boolean.`,
    );
  }
  return {
    id: value.id.trim(),
    path: value.path.trim(),
    ...(typeof value.direction === "string" && value.direction.trim()
      ? { direction: value.direction.trim() }
      : {}),
    frameIndex: value.frameIndex as number,
    globalFrameIndex: value.globalFrameIndex as number,
    durationMs: value.durationMs,
    pivot: point(value.pivot, `${path}.pivot`),
    ...(value.baseline === undefined ? {} : { baseline: value.baseline }),
    ...(value.groundContact === undefined ? {} : { groundContact: value.groundContact }),
    ...(typeof value.intentionalDuplicateOf === "string" && value.intentionalDuplicateOf.trim()
      ? { intentionalDuplicateOf: value.intentionalDuplicateOf.trim() }
      : {}),
  };
}

export function validateSpriteSequenceManifest(input: unknown): SpriteSequenceManifest {
  if (!isRecord(input)) {
    throw new SpriteQualityInputError(
      "SPRITE_SEQUENCE_MANIFEST_INVALID",
      "Sequence manifest must be an object.",
    );
  }
  if (input.schemaVersion !== "1.0") {
    throw new SpriteQualityInputError(
      "SPRITE_SEQUENCE_MANIFEST_INVALID",
      'schemaVersion must be "1.0".',
    );
  }
  if (typeof input.sequenceId !== "string" || !input.sequenceId.trim()) {
    throw new SpriteQualityInputError(
      "SPRITE_SEQUENCE_MANIFEST_INVALID",
      "sequenceId is required.",
    );
  }
  if (!finiteInteger(input.expectedWidth) || input.expectedWidth <= 0) {
    throw new SpriteQualityInputError(
      "SPRITE_SEQUENCE_MANIFEST_INVALID",
      "expectedWidth must be a positive integer.",
    );
  }
  if (!finiteInteger(input.expectedHeight) || input.expectedHeight <= 0) {
    throw new SpriteQualityInputError(
      "SPRITE_SEQUENCE_MANIFEST_INVALID",
      "expectedHeight must be a positive integer.",
    );
  }
  if (!Array.isArray(input.frames) || input.frames.length === 0) {
    throw new SpriteQualityInputError(
      "SPRITE_SEQUENCE_MANIFEST_INVALID",
      "frames must contain at least one frame.",
    );
  }

  const frames = input.frames.map(frameSpec);
  const ids = new Set<string>();
  for (const frame of frames) {
    if (ids.has(frame.id)) {
      throw new SpriteQualityInputError(
        "SPRITE_SEQUENCE_MANIFEST_INVALID",
        `Duplicate frame id: ${frame.id}`,
      );
    }
    ids.add(frame.id);
  }
  for (const frame of frames) {
    if (frame.intentionalDuplicateOf && !ids.has(frame.intentionalDuplicateOf)) {
      throw new SpriteQualityInputError(
        "SPRITE_SEQUENCE_MANIFEST_INVALID",
        `${frame.id}.intentionalDuplicateOf does not reference a frame in the manifest.`,
      );
    }
  }

  const safePadding = input.safePadding ?? 1;
  const groundContactTolerance = input.groundContactTolerance ?? 1;
  if (!finiteInteger(safePadding) || safePadding < 0) {
    throw new SpriteQualityInputError(
      "SPRITE_SEQUENCE_MANIFEST_INVALID",
      "safePadding must be a non-negative integer.",
    );
  }
  if (!finiteNumber(groundContactTolerance) || groundContactTolerance < 0) {
    throw new SpriteQualityInputError(
      "SPRITE_SEQUENCE_MANIFEST_INVALID",
      "groundContactTolerance must be a non-negative number.",
    );
  }

  return {
    schemaVersion: "1.0",
    sequenceId: input.sequenceId.trim(),
    transparency: transparency(input.transparency),
    expectedWidth: input.expectedWidth,
    expectedHeight: input.expectedHeight,
    safePadding,
    ...(input.expectedPivot === undefined
      ? {}
      : { expectedPivot: point(input.expectedPivot, "expectedPivot") }),
    ...(input.expectedBaseline === undefined
      ? {}
      : {
          expectedBaseline: finiteNumber(input.expectedBaseline)
            ? input.expectedBaseline
            : (() => {
                throw new SpriteQualityInputError(
                  "SPRITE_SEQUENCE_MANIFEST_INVALID",
                  "expectedBaseline must be finite.",
                );
              })(),
        }),
    groundContactTolerance,
    frames,
  };
}
