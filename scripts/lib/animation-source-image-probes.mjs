import {
  failObservation,
  readObservationExact,
  validObservationDimensions,
} from "./animation-source-observation-common.mjs";

export const SUPPORTED_ANIMATION_SOURCE_IMAGE_MEDIA_TYPES = Object.freeze([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

const IMAGE_MEDIA_TYPES = new Set(
  SUPPORTED_ANIMATION_SOURCE_IMAGE_MEDIA_TYPES,
);
const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const JPEG_SOF_MARKERS = new Set([
  0xc0,
  0xc1,
  0xc2,
  0xc3,
  0xc5,
  0xc6,
  0xc7,
  0xc9,
  0xca,
  0xcb,
  0xcd,
  0xce,
  0xcf,
]);

function probePng(header, detail) {
  if (
    header.length < 24 ||
    !header.subarray(0, 8).equals(PNG_SIGNATURE) ||
    header.readUInt32BE(8) !== 13 ||
    header.toString("ascii", 12, 16) !== "IHDR"
  ) {
    failObservation(
      "ANIMATION_SOURCE_BUNDLE_OBSERVATION_PNG_INVALID",
      detail,
    );
  }
  return validObservationDimensions(
    header.readUInt32BE(16),
    header.readUInt32BE(20),
    detail,
  );
}

function probeGif(header, detail) {
  const signature = header.toString("ascii", 0, 6);
  if (
    header.length < 10 ||
    (signature !== "GIF87a" && signature !== "GIF89a")
  ) {
    failObservation(
      "ANIMATION_SOURCE_BUNDLE_OBSERVATION_GIF_INVALID",
      detail,
    );
  }
  return validObservationDimensions(
    header.readUInt16LE(6),
    header.readUInt16LE(8),
    detail,
  );
}

function readUInt24LE(buffer, offset) {
  return (
    buffer[offset] |
    (buffer[offset + 1] << 8) |
    (buffer[offset + 2] << 16)
  );
}

function probeWebp(header, detail) {
  if (
    header.length < 30 ||
    header.toString("ascii", 0, 4) !== "RIFF" ||
    header.toString("ascii", 8, 12) !== "WEBP"
  ) {
    failObservation(
      "ANIMATION_SOURCE_BUNDLE_OBSERVATION_WEBP_INVALID",
      detail,
    );
  }

  const chunk = header.toString("ascii", 12, 16);
  if (chunk === "VP8X") {
    return validObservationDimensions(
      readUInt24LE(header, 24) + 1,
      readUInt24LE(header, 27) + 1,
      detail,
    );
  }
  if (chunk === "VP8L") {
    if (header[20] !== 0x2f) {
      failObservation(
        "ANIMATION_SOURCE_BUNDLE_OBSERVATION_WEBP_INVALID",
        detail,
      );
    }
    const b0 = header[21];
    const b1 = header[22];
    const b2 = header[23];
    const b3 = header[24];
    return validObservationDimensions(
      1 + b0 + ((b1 & 0x3f) << 8),
      1 + ((b1 >> 6) | (b2 << 2) | ((b3 & 0x0f) << 10)),
      detail,
    );
  }
  if (chunk === "VP8 ") {
    if (
      header[23] !== 0x9d ||
      header[24] !== 0x01 ||
      header[25] !== 0x2a
    ) {
      failObservation(
        "ANIMATION_SOURCE_BUNDLE_OBSERVATION_WEBP_INVALID",
        detail,
      );
    }
    return validObservationDimensions(
      header.readUInt16LE(26) & 0x3fff,
      header.readUInt16LE(28) & 0x3fff,
      detail,
    );
  }
  failObservation(
    "ANIMATION_SOURCE_BUNDLE_OBSERVATION_WEBP_UNSUPPORTED",
    detail,
  );
}

async function probeJpeg(handle, size, detail) {
  if (size < 4) {
    failObservation(
      "ANIMATION_SOURCE_BUNDLE_OBSERVATION_JPEG_INVALID",
      detail,
    );
  }
  const soi = await readObservationExact(
    handle,
    0,
    2,
    "ANIMATION_SOURCE_BUNDLE_OBSERVATION_JPEG_INVALID",
    detail,
  );
  if (soi[0] !== 0xff || soi[1] !== 0xd8) {
    failObservation(
      "ANIMATION_SOURCE_BUNDLE_OBSERVATION_JPEG_INVALID",
      detail,
    );
  }

  let position = 2;
  while (position < size) {
    const prefix = await readObservationExact(
      handle,
      position,
      1,
      "ANIMATION_SOURCE_BUNDLE_OBSERVATION_JPEG_TRUNCATED",
      detail,
    );
    if (prefix[0] !== 0xff) {
      failObservation(
        "ANIMATION_SOURCE_BUNDLE_OBSERVATION_JPEG_INVALID",
        detail,
      );
    }
    position += 1;

    let markerBuffer;
    do {
      markerBuffer = await readObservationExact(
        handle,
        position,
        1,
        "ANIMATION_SOURCE_BUNDLE_OBSERVATION_JPEG_TRUNCATED",
        detail,
      );
      position += 1;
    } while (markerBuffer[0] === 0xff && position < size);

    const marker = markerBuffer[0];
    if (marker === 0x00) {
      failObservation(
        "ANIMATION_SOURCE_BUNDLE_OBSERVATION_JPEG_INVALID",
        detail,
      );
    }
    if (
      marker === 0xd8 ||
      marker === 0x01 ||
      (marker >= 0xd0 && marker <= 0xd7)
    ) {
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) {
      failObservation(
        "ANIMATION_SOURCE_BUNDLE_OBSERVATION_JPEG_DIMENSIONS_MISSING",
        detail,
      );
    }

    const lengthBuffer = await readObservationExact(
      handle,
      position,
      2,
      "ANIMATION_SOURCE_BUNDLE_OBSERVATION_JPEG_TRUNCATED",
      detail,
    );
    const segmentLength = lengthBuffer.readUInt16BE(0);
    if (segmentLength < 2 || position + segmentLength > size) {
      failObservation(
        "ANIMATION_SOURCE_BUNDLE_OBSERVATION_JPEG_INVALID",
        detail,
      );
    }

    if (JPEG_SOF_MARKERS.has(marker)) {
      if (segmentLength < 7) {
        failObservation(
          "ANIMATION_SOURCE_BUNDLE_OBSERVATION_JPEG_INVALID",
          detail,
        );
      }
      const frame = await readObservationExact(
        handle,
        position + 2,
        5,
        "ANIMATION_SOURCE_BUNDLE_OBSERVATION_JPEG_TRUNCATED",
        detail,
      );
      return validObservationDimensions(
        frame.readUInt16BE(3),
        frame.readUInt16BE(1),
        detail,
      );
    }
    position += segmentLength;
  }

  failObservation(
    "ANIMATION_SOURCE_BUNDLE_OBSERVATION_JPEG_DIMENSIONS_MISSING",
    detail,
  );
}

export async function probeAnimationSourceImage(
  handle,
  header,
  size,
  mediaType,
  detail,
) {
  if (!mediaType.startsWith("image/")) return undefined;
  if (!IMAGE_MEDIA_TYPES.has(mediaType)) {
    failObservation(
      "ANIMATION_SOURCE_BUNDLE_OBSERVATION_IMAGE_TYPE_UNSUPPORTED",
      mediaType,
    );
  }
  if (mediaType === "image/png") return probePng(header, detail);
  if (mediaType === "image/gif") return probeGif(header, detail);
  if (mediaType === "image/webp") return probeWebp(header, detail);
  return await probeJpeg(handle, size, detail);
}
