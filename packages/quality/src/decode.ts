import { stat } from "node:fs/promises";

import sharp from "sharp";

import {
  SpriteQualityInputError,
  type DecodeSpriteFrameOptions,
  type DecodedSpriteFrame,
} from "./types.js";

const DEFAULT_MAXIMUM_PIXELS = 16_777_216;
const DEFAULT_MAXIMUM_INPUT_BYTES = 32 * 1024 * 1024;

async function assertInputSize(
  input: Buffer | Uint8Array | string,
  maximumInputBytes: number,
): Promise<void> {
  const size = typeof input === "string" ? (await stat(input)).size : input.byteLength;
  if (size <= 0) {
    throw new SpriteQualityInputError(
      "SPRITE_FRAME_EMPTY",
      "Sprite frame input is empty.",
    );
  }
  if (size > maximumInputBytes) {
    throw new SpriteQualityInputError(
      "SPRITE_FRAME_INPUT_TOO_LARGE",
      `Sprite frame input exceeds ${maximumInputBytes} bytes.`,
    );
  }
}

export async function decodeSpriteFrame(
  input: Buffer | Uint8Array | string,
  options: DecodeSpriteFrameOptions = {},
): Promise<DecodedSpriteFrame> {
  const maximumPixels = options.maximumPixels ?? DEFAULT_MAXIMUM_PIXELS;
  const maximumInputBytes = options.maximumInputBytes ?? DEFAULT_MAXIMUM_INPUT_BYTES;
  await assertInputSize(input, maximumInputBytes);

  const decoderOptions = {
    failOn: "error" as const,
    limitInputPixels: maximumPixels,
    sequentialRead: true,
  };
  const metadata = await sharp(input, decoderOptions).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  const pages = metadata.pages ?? 1;
  if (width <= 0 || height <= 0) {
    throw new SpriteQualityInputError(
      "SPRITE_FRAME_DIMENSIONS_INVALID",
      "Decoded sprite frame has no usable dimensions.",
    );
  }
  if (width * height > maximumPixels) {
    throw new SpriteQualityInputError(
      "SPRITE_FRAME_PIXEL_LIMIT_EXCEEDED",
      `Decoded sprite frame exceeds ${maximumPixels} pixels.`,
    );
  }
  if (pages !== 1) {
    throw new SpriteQualityInputError(
      "SPRITE_FRAME_MULTIPAGE_UNSUPPORTED",
      "Frame inspection accepts one decoded image page. Extract animation frames before inspection.",
    );
  }

  const result = await sharp(input, decoderOptions)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (result.info.channels !== 4) {
    throw new SpriteQualityInputError(
      "SPRITE_FRAME_CHANNELS_INVALID",
      `Expected four RGBA channels after decoding, received ${result.info.channels}.`,
    );
  }
  return {
    data: result.data,
    width: result.info.width,
    height: result.info.height,
    channels: 4,
    sourceFormat: metadata.format ?? "unknown",
    sourceHasAlpha: metadata.hasAlpha ?? false,
    sourcePages: pages,
  };
}
