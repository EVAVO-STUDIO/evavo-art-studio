import path from "node:path";

import {
  SPRITE_ATLAS_SCHEMA_VERSION,
  SpriteAtlasInputError,
  type AtlasLoopMode,
  type NormalizedSpriteAtlasManifest,
  type Point,
  type PowerOfTwoPolicy,
  type SpriteAtlasAnimation,
  type SpriteAtlasAnimationFrame,
  type SpriteAtlasManifest,
  type SpriteAtlasSourceFrame,
  type TextureFiltering,
} from "./types.js";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const nonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const finiteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const integer = (value: unknown): value is number =>
  finiteNumber(value) && Number.isInteger(value);

function fail(code: string, message: string): never {
  throw new SpriteAtlasInputError(code, message);
}

function safeId(value: unknown, name: string): string {
  if (!nonEmptyString(value) || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value.trim())) {
    fail(
      "SPRITE_ATLAS_MANIFEST_INVALID",
      `${name} must start with a letter or number and contain only letters, numbers, dot, underscore or hyphen.`,
    );
  }
  return value.trim();
}

function safeOutputName(value: unknown, fallback: string, extension: string, name: string): string {
  const result = nonEmptyString(value) ? value.trim() : fallback;
  if (path.basename(result) !== result || result.includes("..") || !result.toLowerCase().endsWith(extension)) {
    fail(
      "SPRITE_ATLAS_OUTPUT_INVALID",
      `${name} must be one file name ending in ${extension}.`,
    );
  }
  return result;
}

function point(value: unknown, name: string): Point | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value) || !finiteNumber(value.x) || !finiteNumber(value.y)) {
    fail("SPRITE_ATLAS_MANIFEST_INVALID", `${name} must contain finite x and y values.`);
  }
  return { x: value.x, y: value.y };
}

function sourceFrame(value: unknown, index: number): SpriteAtlasSourceFrame {
  const name = `frames[${index}]`;
  if (!isRecord(value)) fail("SPRITE_ATLAS_MANIFEST_INVALID", `${name} must be an object.`);
  const id = safeId(value.id, `${name}.id`);
  if (!nonEmptyString(value.path) || value.path.includes("\0")) {
    fail("SPRITE_ATLAS_MANIFEST_INVALID", `${name}.path is required.`);
  }
  if (value.allowEmpty !== undefined && typeof value.allowEmpty !== "boolean") {
    fail("SPRITE_ATLAS_MANIFEST_INVALID", `${name}.allowEmpty must be boolean.`);
  }
  if (
    value.tags !== undefined &&
    (!Array.isArray(value.tags) || !value.tags.every(nonEmptyString))
  ) {
    fail("SPRITE_ATLAS_MANIFEST_INVALID", `${name}.tags must contain strings.`);
  }
  const pivot = point(value.pivot, `${name}.pivot`);
  return {
    id,
    path: value.path.trim(),
    ...(pivot === undefined ? {} : { pivot }),
    ...(value.allowEmpty === undefined ? {} : { allowEmpty: value.allowEmpty }),
    ...(value.tags === undefined
      ? {}
      : { tags: [...new Set(value.tags.map((entry) => entry.trim()))] }),
  };
}

function animationFrame(value: unknown, animationIndex: number, frameIndex: number): SpriteAtlasAnimationFrame {
  const name = `animations[${animationIndex}].frames[${frameIndex}]`;
  if (!isRecord(value)) fail("SPRITE_ATLAS_MANIFEST_INVALID", `${name} must be an object.`);
  const frameId = safeId(value.frameId, `${name}.frameId`);
  if (!integer(value.durationMs) || value.durationMs <= 0 || value.durationMs > 86_400_000) {
    fail(
      "SPRITE_ATLAS_MANIFEST_INVALID",
      `${name}.durationMs must be a positive integer no greater than one day.`,
    );
  }
  return { frameId, durationMs: value.durationMs };
}

function loopMode(value: unknown, name: string): AtlasLoopMode {
  if (value === "none" || value === "linear" || value === "ping-pong") return value;
  return fail(
    "SPRITE_ATLAS_MANIFEST_INVALID",
    `${name} must be none, linear or ping-pong.`,
  );
}

function animation(value: unknown, index: number): SpriteAtlasAnimation {
  const name = `animations[${index}]`;
  if (!isRecord(value)) fail("SPRITE_ATLAS_MANIFEST_INVALID", `${name} must be an object.`);
  const animationName = safeId(value.name, `${name}.name`);
  if (!Array.isArray(value.frames) || value.frames.length === 0) {
    fail("SPRITE_ATLAS_MANIFEST_INVALID", `${name}.frames must contain at least one frame.`);
  }
  return {
    name: animationName,
    loopMode: loopMode(value.loopMode, `${name}.loopMode`),
    frames: value.frames.map((entry, frameIndex) => animationFrame(entry, index, frameIndex)),
  };
}

function boundedInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
  name: string,
): number {
  const result = value === undefined ? fallback : value;
  if (!integer(result) || result < minimum || result > maximum) {
    fail(
      "SPRITE_ATLAS_MANIFEST_INVALID",
      `${name} must be an integer between ${minimum} and ${maximum}.`,
    );
  }
  return result;
}

function powerOfTwo(value: unknown): PowerOfTwoPolicy {
  if (value === undefined) return "preferred";
  if (value === "required" || value === "preferred" || value === "not-required") {
    return value;
  }
  return fail(
    "SPRITE_ATLAS_MANIFEST_INVALID",
    "settings.powerOfTwo must be required, preferred or not-required.",
  );
}

function textureFiltering(value: unknown): TextureFiltering {
  if (value === undefined) return "nearest";
  if (value === "nearest" || value === "linear") return value;
  return fail(
    "SPRITE_ATLAS_MANIFEST_INVALID",
    "settings.textureFiltering must be nearest or linear.",
  );
}

export function validateSpriteAtlasManifest(input: unknown): NormalizedSpriteAtlasManifest {
  if (!isRecord(input)) {
    fail("SPRITE_ATLAS_MANIFEST_INVALID", "Atlas manifest must be an object.");
  }
  if (input.schemaVersion !== SPRITE_ATLAS_SCHEMA_VERSION) {
    fail(
      "SPRITE_ATLAS_MANIFEST_INVALID",
      `schemaVersion must be ${SPRITE_ATLAS_SCHEMA_VERSION}.`,
    );
  }

  const atlasId = safeId(input.atlasId, "atlasId");
  if (!Array.isArray(input.frames) || input.frames.length === 0) {
    fail("SPRITE_ATLAS_MANIFEST_INVALID", "frames must contain at least one source frame.");
  }
  if (input.frames.length > 4096) {
    fail("SPRITE_ATLAS_MANIFEST_INVALID", "frames may not exceed 4096 entries.");
  }
  if (!Array.isArray(input.animations) || input.animations.length === 0) {
    fail("SPRITE_ATLAS_MANIFEST_INVALID", "animations must contain at least one animation.");
  }

  const frames = input.frames.map(sourceFrame);
  const frameIds = new Set<string>();
  for (const frame of frames) {
    if (frameIds.has(frame.id)) {
      fail("SPRITE_ATLAS_MANIFEST_INVALID", `Duplicate source frame id: ${frame.id}`);
    }
    frameIds.add(frame.id);
  }

  const animations = input.animations.map(animation);
  const animationNames = new Set<string>();
  for (const item of animations) {
    if (animationNames.has(item.name)) {
      fail("SPRITE_ATLAS_MANIFEST_INVALID", `Duplicate animation name: ${item.name}`);
    }
    animationNames.add(item.name);
    for (const frame of item.frames) {
      if (!frameIds.has(frame.frameId)) {
        fail(
          "SPRITE_ATLAS_MANIFEST_INVALID",
          `${item.name} references missing source frame ${frame.frameId}.`,
        );
      }
    }
  }

  const settings = isRecord(input.settings) ? input.settings : {};
  const maximumWidth = boundedInteger(settings.maximumWidth, 4096, 16, 16384, "settings.maximumWidth");
  const maximumHeight = boundedInteger(settings.maximumHeight, 4096, 16, 16384, "settings.maximumHeight");
  const padding = boundedInteger(settings.padding, 2, 0, 128, "settings.padding");
  const extrusion = boundedInteger(settings.extrusion, 1, 0, 32, "settings.extrusion");
  const alphaThreshold = boundedInteger(
    settings.alphaThreshold,
    8,
    1,
    255,
    "settings.alphaThreshold",
  );
  const pngCompressionLevel = boundedInteger(
    settings.pngCompressionLevel,
    9,
    0,
    9,
    "settings.pngCompressionLevel",
  );
  if (settings.trim !== undefined && typeof settings.trim !== "boolean") {
    fail("SPRITE_ATLAS_MANIFEST_INVALID", "settings.trim must be boolean.");
  }

  const output = isRecord(input.output) ? input.output : {};
  return {
    schemaVersion: SPRITE_ATLAS_SCHEMA_VERSION,
    atlasId,
    frames,
    animations,
    settings: {
      maximumWidth,
      maximumHeight,
      padding,
      extrusion,
      trim: settings.trim ?? true,
      alphaThreshold,
      powerOfTwo: powerOfTwo(settings.powerOfTwo),
      textureFiltering: textureFiltering(settings.textureFiltering),
      pngCompressionLevel,
    },
    output: {
      imageFileName: safeOutputName(
        output.imageFileName,
        `${atlasId}.png`,
        ".png",
        "output.imageFileName",
      ),
      dataFileName: safeOutputName(
        output.dataFileName,
        `${atlasId}.atlas.json`,
        ".json",
        "output.dataFileName",
      ),
      evidenceFileName: safeOutputName(
        output.evidenceFileName,
        `${atlasId}.evidence.json`,
        ".json",
        "output.evidenceFileName",
      ),
    },
  };
}

export function assertSpriteAtlasManifest(input: unknown): SpriteAtlasManifest {
  return validateSpriteAtlasManifest(input);
}
