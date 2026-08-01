import { createHash } from "node:crypto";

import {
  PROFILE_CATALOG_VERSION,
  type DeliveryImageProfile,
  type DeliveryProfileId,
} from "./types.js";

const KiB = 1024;
const MiB = 1024 * KiB;

const PNG_TRUECOLOUR = Object.freeze({
  format: "png" as const,
  dither: 0,
});

function png(paletteColours: number, dither = 0): Readonly<{
  format: "png";
  paletteColours: number;
  dither: number;
}> {
  return Object.freeze({ format: "png", paletteColours, dither });
}

function webp(quality: number): Readonly<{
  format: "webp";
  quality: number;
  nearLossless: true;
}> {
  return Object.freeze({ format: "webp", quality, nearLossless: true });
}

const profiles: Readonly<Record<DeliveryProfileId, DeliveryImageProfile>> =
  Object.freeze({
    "retro-dialogue-portrait-384": Object.freeze({
      id: "retro-dialogue-portrait-384",
      title: "Retro dialogue portrait, 384px",
      description:
        "Opaque black-stage dialogue art at its actual runtime footprint, with deterministic grayscale palette selection and no background removal.",
      target: "godot-4.6.2",
      maxWidth: 384,
      maxHeight: 384,
      resizePolicy: "fit-inside",
      kernel: "lanczos3",
      colourPolicy: "grayscale",
      transparencyPolicy: "opaque",
      requireMeaningfulTransparency: false,
      flattenColour: "#000000",
      outputFormat: "png",
      candidates: Object.freeze([
        png(16),
        png(24),
        png(32),
        png(48),
        png(64),
        PNG_TRUECOLOUR,
      ]),
      quality: Object.freeze({
        minimumPsnr: 34,
        maximumMeanAbsoluteError: 5,
        maximumAlphaMeanAbsoluteError: 0,
        maximumAlphaDifference: 0,
      }),
      maximumOutputBytes: 96 * KiB,
      intendedRuntimeScale:
        "Native portrait source remains at or above the roughly 314px display frame; do not store a 720p or 1080p portrait.",
    }),
    "retro-standing-character-576": Object.freeze({
      id: "retro-standing-character-576",
      title: "Retro transparent standing character, 576px",
      description:
        "Transparent full-character room sprite with preserved canvas, grayscale engraving detail and bounded alpha quantisation.",
      target: "godot-4.6.2",
      maxWidth: 384,
      maxHeight: 576,
      resizePolicy: "fit-inside",
      kernel: "lanczos3",
      colourPolicy: "grayscale",
      transparencyPolicy: "required",
      requireMeaningfulTransparency: true,
      flattenColour: "#000000",
      outputFormat: "png",
      candidates: Object.freeze([
        png(24),
        png(32),
        png(48),
        png(64),
        png(96),
        png(128),
        PNG_TRUECOLOUR,
      ]),
      quality: Object.freeze({
        minimumPsnr: 33,
        maximumMeanAbsoluteError: 6,
        maximumAlphaMeanAbsoluteError: 1.5,
        maximumAlphaDifference: 24,
      }),
      maximumOutputBytes: 192 * KiB,
      intendedRuntimeScale:
        "384x576 maximum for a 1280x720 stage; preserve the authored placement canvas and do not upscale.",
    }),
    "retro-ui-icon-256": Object.freeze({
      id: "retro-ui-icon-256",
      title: "Retro transparent UI icon, 256px",
      description:
        "Small, high-contrast transparent UI token with economical grayscale palette and nearest-neighbour runtime use.",
      target: "godot-4.6.2",
      maxWidth: 256,
      maxHeight: 256,
      resizePolicy: "fit-inside",
      kernel: "lanczos3",
      colourPolicy: "grayscale",
      transparencyPolicy: "required",
      requireMeaningfulTransparency: true,
      flattenColour: "#000000",
      outputFormat: "png",
      candidates: Object.freeze([
        png(16),
        png(24),
        png(32),
        png(48),
        png(64),
        PNG_TRUECOLOUR,
      ]),
      quality: Object.freeze({
        minimumPsnr: 31,
        maximumMeanAbsoluteError: 8,
        maximumAlphaMeanAbsoluteError: 1.5,
        maximumAlphaDifference: 24,
      }),
      maximumOutputBytes: 96 * KiB,
      intendedRuntimeScale:
        "256x256 source maximum; display at integer or near-integer sizes with Godot texture filtering disabled where appropriate.",
    }),
    "retro-scene-720p": Object.freeze({
      id: "retro-scene-720p",
      title: "Retro opaque scene plate, 1280x720",
      description:
        "Full-screen fixed-camera runtime plate at the Brass & Brine native 720p surface, retaining engraved grayscale detail without carrying a redundant 1080p copy.",
      target: "godot-4.6.2",
      maxWidth: 1280,
      maxHeight: 720,
      resizePolicy: "fit-inside",
      kernel: "lanczos3",
      colourPolicy: "grayscale",
      transparencyPolicy: "opaque",
      requireMeaningfulTransparency: false,
      flattenColour: "#000000",
      outputFormat: "png",
      candidates: Object.freeze([
        png(32, 0.15),
        png(48, 0.1),
        png(64, 0.05),
        png(96),
        png(128),
        png(256),
        PNG_TRUECOLOUR,
      ]),
      quality: Object.freeze({
        minimumPsnr: 34,
        maximumMeanAbsoluteError: 5,
        maximumAlphaMeanAbsoluteError: 0,
        maximumAlphaDifference: 0,
      }),
      maximumOutputBytes: 1536 * KiB,
      intendedRuntimeScale:
        "1280x720 native plate for the game; Godot scales to larger windows, so do not store a redundant 1080p runtime copy. Retain higher-resolution originals outside the runtime derivative set.",
    }),
    "retro-overlay-720p": Object.freeze({
      id: "retro-overlay-720p",
      title: "Retro transparent overlay, 1280x720",
      description:
        "Full-stage rain, fog, light, prop or occlusion overlay with meaningful alpha and a bounded indexed grayscale palette.",
      target: "godot-4.6.2",
      maxWidth: 1280,
      maxHeight: 720,
      resizePolicy: "fit-inside",
      kernel: "lanczos3",
      colourPolicy: "grayscale",
      transparencyPolicy: "required",
      requireMeaningfulTransparency: true,
      flattenColour: "#000000",
      outputFormat: "png",
      candidates: Object.freeze([
        png(32, 0.1),
        png(48, 0.05),
        png(64),
        png(96),
        png(128),
        png(256),
        PNG_TRUECOLOUR,
      ]),
      quality: Object.freeze({
        minimumPsnr: 33,
        maximumMeanAbsoluteError: 6,
        maximumAlphaMeanAbsoluteError: 1.25,
        maximumAlphaDifference: 20,
      }),
      maximumOutputBytes: 1536 * KiB,
      intendedRuntimeScale:
        "Match the 1280x720 stage exactly when registration matters; do not trim or independently resize registered overlays.",
    }),
    "godot-sprite-lossless": Object.freeze({
      id: "godot-sprite-lossless",
      title: "General Godot lossless sprite",
      description:
        "Colour-preserving PNG sprite derivative for assets that do not use the retro grayscale delivery profiles.",
      target: "godot-4.6.2",
      maxWidth: 2048,
      maxHeight: 2048,
      resizePolicy: "fit-inside",
      kernel: "lanczos3",
      colourPolicy: "preserve",
      transparencyPolicy: "preserve",
      requireMeaningfulTransparency: false,
      flattenColour: "#000000",
      outputFormat: "png",
      candidates: Object.freeze([
        png(128),
        png(256),
        PNG_TRUECOLOUR,
      ]),
      quality: Object.freeze({
        minimumPsnr: 38,
        maximumMeanAbsoluteError: 3,
        maximumAlphaMeanAbsoluteError: 0.5,
        maximumAlphaDifference: 8,
      }),
      maximumOutputBytes: 4 * MiB,
      intendedRuntimeScale:
        "Keep the source close to its largest expected display footprint; do not enlarge low-resolution sprites during preparation.",
    }),
    "godot-background-1080p": Object.freeze({
      id: "godot-background-1080p",
      title: "General Godot opaque background, 1080p maximum",
      description:
        "Lossless WebP delivery for non-retro projects that genuinely require a 1920x1080 runtime background.",
      target: "godot-4.6.2",
      maxWidth: 1920,
      maxHeight: 1080,
      resizePolicy: "fit-inside",
      kernel: "lanczos3",
      colourPolicy: "preserve",
      transparencyPolicy: "opaque",
      requireMeaningfulTransparency: false,
      flattenColour: "#000000",
      outputFormat: "webp",
      candidates: Object.freeze([webp(100), webp(98), webp(96)]),
      quality: Object.freeze({
        minimumPsnr: 40,
        maximumMeanAbsoluteError: 2.5,
        maximumAlphaMeanAbsoluteError: 0,
        maximumAlphaDifference: 0,
      }),
      maximumOutputBytes: 6 * MiB,
      intendedRuntimeScale:
        "Use only when a project art-direction contract names 1080p as the actual runtime source size.",
    }),
    "web-raster-1080p": Object.freeze({
      id: "web-raster-1080p",
      title: "Web near-lossless raster, 1080p maximum",
      description:
        "High-quality near-lossless WebP derivative for web delivery, never used as the retained source master.",
      target: "web",
      maxWidth: 1920,
      maxHeight: 1080,
      resizePolicy: "fit-inside",
      kernel: "lanczos3",
      colourPolicy: "preserve",
      transparencyPolicy: "preserve",
      requireMeaningfulTransparency: false,
      flattenColour: "#000000",
      outputFormat: "webp",
      candidates: Object.freeze([webp(98), webp(96), webp(94), webp(92)]),
      quality: Object.freeze({
        minimumPsnr: 38,
        maximumMeanAbsoluteError: 3.5,
        maximumAlphaMeanAbsoluteError: 0.75,
        maximumAlphaDifference: 12,
      }),
      maximumOutputBytes: 4 * MiB,
      intendedRuntimeScale:
        "Responsive web derivative only; retain a lossless source and do not repeatedly recompress it.",
    }),
    "source-master-lossless": Object.freeze({
      id: "source-master-lossless",
      title: "Lossless source master",
      description:
        "Metadata-stripped true-colour PNG source preservation with no resize, palette reduction or background extraction.",
      target: "source",
      maxWidth: null,
      maxHeight: null,
      resizePolicy: "none",
      kernel: "lanczos3",
      colourPolicy: "preserve",
      transparencyPolicy: "preserve",
      requireMeaningfulTransparency: false,
      flattenColour: "#000000",
      outputFormat: "png",
      candidates: Object.freeze([PNG_TRUECOLOUR]),
      quality: Object.freeze({
        minimumPsnr: 99,
        maximumMeanAbsoluteError: 0,
        maximumAlphaMeanAbsoluteError: 0,
        maximumAlphaDifference: 0,
      }),
      maximumOutputBytes: 64 * MiB,
      intendedRuntimeScale:
        "Source retention only. Runtime derivatives must use a role-specific profile.",
    }),
  });

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const record = value as Readonly<Record<string, unknown>>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
    .join(",")}}`;
}

export function listDeliveryImageProfiles(): readonly DeliveryImageProfile[] {
  return Object.values(profiles);
}

export function resolveDeliveryImageProfile(
  profileId: DeliveryProfileId,
): DeliveryImageProfile {
  return profiles[profileId];
}

export function deliveryProfileSha256(profile: DeliveryImageProfile): string {
  return createHash("sha256")
    .update(canonical({ profileCatalogVersion: PROFILE_CATALOG_VERSION, profile }))
    .digest("hex");
}

export function isDeliveryProfileId(value: string): value is DeliveryProfileId {
  return Object.prototype.hasOwnProperty.call(profiles, value);
}
