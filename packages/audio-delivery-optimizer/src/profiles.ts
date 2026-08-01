import { createHash } from "node:crypto";

import {
  AUDIO_PROFILE_CATALOG_VERSION,
  type AudioDeliveryProfile,
  type AudioDeliveryProfileId,
} from "./types.js";

const KiB = 1024;
const MiB = 1024 * KiB;

const profiles: Readonly<Record<AudioDeliveryProfileId, AudioDeliveryProfile>> =
  Object.freeze({
    "godot-ui-sfx-wav": Object.freeze({
      id: "godot-ui-sfx-wav",
      title: "Godot UI sound effect WAV",
      description:
        "Very short, frequently repeated interface sounds stored as low-CPU PCM16 mono WAV.",
      outputFormat: "wav",
      codec: "pcm_s16le",
      maximumChannels: 1,
      maximumSampleRateHz: 22050,
      sampleRatePolicy: "maximum-without-upsampling",
      channelPolicy: "maximum-without-upmixing",
      trimSilence: true,
      trimThresholdDb: -50,
      trimFadeSamples: 500,
      vorbisQualities: Object.freeze([]),
      minimumSnrDb: 70,
      maximumMeanAbsoluteError: 0.0001,
      maximumDurationDeltaMilliseconds: 2,
      maximumSourceDurationSeconds: 3,
      maximumOutputBytes: 256 * KiB,
      loopPolicy: "forbidden",
      intendedRuntimeUse:
        "Clicks, page turns, cursor moves and compact UI feedback that may overlap often.",
    }),
    "godot-short-sfx-wav": Object.freeze({
      id: "godot-short-sfx-wav",
      title: "Godot short gameplay sound effect WAV",
      description:
        "Short, repetitive gameplay sounds stored as low-CPU PCM16 mono WAV at 44.1 kHz.",
      outputFormat: "wav",
      codec: "pcm_s16le",
      maximumChannels: 1,
      maximumSampleRateHz: 44100,
      sampleRatePolicy: "maximum-without-upsampling",
      channelPolicy: "maximum-without-upmixing",
      trimSilence: true,
      trimThresholdDb: -50,
      trimFadeSamples: 500,
      vorbisQualities: Object.freeze([]),
      minimumSnrDb: 70,
      maximumMeanAbsoluteError: 0.0001,
      maximumDurationDeltaMilliseconds: 2,
      maximumSourceDurationSeconds: 12,
      maximumOutputBytes: 2 * MiB,
      loopPolicy: "forbidden",
      intendedRuntimeUse:
        "Weapons, impacts, footsteps, doors and other frequently triggered one-shot effects.",
    }),
    "godot-long-sfx-ogg": Object.freeze({
      id: "godot-long-sfx-ogg",
      title: "Godot long sound effect Ogg Vorbis",
      description:
        "Longer one-shot effects encoded as bounded high-quality Ogg Vorbis.",
      outputFormat: "ogg",
      codec: "libvorbis",
      maximumChannels: 1,
      maximumSampleRateHz: 44100,
      sampleRatePolicy: "maximum-without-upsampling",
      channelPolicy: "maximum-without-upmixing",
      trimSilence: true,
      trimThresholdDb: -50,
      trimFadeSamples: 500,
      vorbisQualities: Object.freeze([8, 7, 6, 5]),
      minimumSnrDb: 20,
      maximumMeanAbsoluteError: 0.06,
      maximumDurationDeltaMilliseconds: 35,
      maximumSourceDurationSeconds: 180,
      maximumOutputBytes: 8 * MiB,
      loopPolicy: "forbidden",
      intendedRuntimeUse:
        "Long machinery, weather events, crashes and narrative sound effects that do not overlap heavily.",
    }),
    "godot-voice-ogg": Object.freeze({
      id: "godot-voice-ogg",
      title: "Godot voice Ogg Vorbis",
      description:
        "Mono speech delivery capped at 22.05 kHz without upsampling lower-rate sources, with bounded Vorbis quality and duration preservation.",
      outputFormat: "ogg",
      codec: "libvorbis",
      maximumChannels: 1,
      maximumSampleRateHz: 22050,
      sampleRatePolicy: "maximum-without-upsampling",
      channelPolicy: "maximum-without-upmixing",
      trimSilence: true,
      trimThresholdDb: -50,
      trimFadeSamples: 500,
      vorbisQualities: Object.freeze([8, 7, 6, 5, 4]),
      minimumSnrDb: 18,
      maximumMeanAbsoluteError: 0.075,
      maximumDurationDeltaMilliseconds: 40,
      maximumSourceDurationSeconds: 900,
      maximumOutputBytes: 16 * MiB,
      loopPolicy: "forbidden",
      intendedRuntimeUse:
        "Dialogue, barks and narration where human voice bandwidth does not require a 44.1/48 kHz runtime source.",
    }),
    "godot-ambience-ogg": Object.freeze({
      id: "godot-ambience-ogg",
      title: "Godot ambience Ogg Vorbis",
      description:
        "Stereo environmental beds encoded as high-quality Ogg without automatic trimming so loop boundaries remain stable.",
      outputFormat: "ogg",
      codec: "libvorbis",
      maximumChannels: 2,
      maximumSampleRateHz: 44100,
      sampleRatePolicy: "maximum-without-upsampling",
      channelPolicy: "maximum-without-upmixing",
      trimSilence: false,
      trimThresholdDb: -50,
      trimFadeSamples: 500,
      vorbisQualities: Object.freeze([9, 8, 7, 6]),
      minimumSnrDb: 22,
      maximumMeanAbsoluteError: 0.05,
      maximumDurationDeltaMilliseconds: 35,
      maximumSourceDurationSeconds: 1800,
      maximumOutputBytes: 32 * MiB,
      loopPolicy: "allowed",
      intendedRuntimeUse:
        "Harbour, storm, crowd, interior and ocean beds; use Godot buses for reverb instead of baking long tails into every SFX.",
    }),
    "godot-music-ogg": Object.freeze({
      id: "godot-music-ogg",
      title: "Godot music Ogg Vorbis",
      description:
        "Music encoded as high-quality Ogg, capped at stereo 48 kHz without upsampling or upmixing, with preserved timing and loop metadata evidence.",
      outputFormat: "ogg",
      codec: "libvorbis",
      maximumChannels: 2,
      maximumSampleRateHz: 48000,
      sampleRatePolicy: "maximum-without-upsampling",
      channelPolicy: "maximum-without-upmixing",
      trimSilence: false,
      trimThresholdDb: -50,
      trimFadeSamples: 500,
      vorbisQualities: Object.freeze([9, 8, 7, 6]),
      minimumSnrDb: 24,
      maximumMeanAbsoluteError: 0.045,
      maximumDurationDeltaMilliseconds: 35,
      maximumSourceDurationSeconds: 1800,
      maximumOutputBytes: 48 * MiB,
      loopPolicy: "allowed",
      intendedRuntimeUse:
        "Score and long-form musical cues; retained masters stay lossless outside the runtime derivative set.",
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

export function listAudioDeliveryProfiles(): readonly AudioDeliveryProfile[] {
  return Object.values(profiles);
}

export function resolveAudioDeliveryProfile(
  id: AudioDeliveryProfileId,
): AudioDeliveryProfile {
  return profiles[id];
}

export function isAudioDeliveryProfileId(
  value: string,
): value is AudioDeliveryProfileId {
  return Object.prototype.hasOwnProperty.call(profiles, value);
}

export function audioDeliveryProfileSha256(
  profile: AudioDeliveryProfile,
): string {
  return createHash("sha256")
    .update(
      canonical({
        profileCatalogVersion: AUDIO_PROFILE_CATALOG_VERSION,
        profile,
      }),
    )
    .digest("hex");
}
