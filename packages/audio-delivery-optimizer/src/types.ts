export const AUDIO_DELIVERY_SCHEMA = "evavo.art-audio-delivery.v1" as const;
export const AUDIO_DELIVERY_RECEIPT_SCHEMA =
  "evavo.art-audio-delivery-receipt.v1" as const;
export const AUDIO_DELIVERY_VERSION = "0.2.0" as const;
export const AUDIO_PROFILE_CATALOG_VERSION = "2026-08-01.2" as const;

export type AudioDeliveryFormat = "wav" | "ogg";
export type AudioDeliveryProfileId =
  | "godot-ui-sfx-wav"
  | "godot-short-sfx-wav"
  | "godot-long-sfx-ogg"
  | "godot-voice-ogg"
  | "godot-ambience-ogg"
  | "godot-music-ogg";

export interface AudioDeliveryProfile {
  readonly id: AudioDeliveryProfileId;
  readonly title: string;
  readonly description: string;
  readonly outputFormat: AudioDeliveryFormat;
  readonly codec: "pcm_s16le" | "libvorbis";
  readonly maximumChannels: 1 | 2;
  readonly maximumSampleRateHz: 22050 | 44100 | 48000;
  readonly sampleRatePolicy: "maximum-without-upsampling";
  readonly channelPolicy: "maximum-without-upmixing";
  readonly trimSilence: boolean;
  readonly trimThresholdDb: -50;
  readonly trimFadeSamples: 500;
  readonly vorbisQualities: readonly number[];
  readonly minimumSnrDb: number;
  readonly maximumMeanAbsoluteError: number;
  readonly maximumDurationDeltaMilliseconds: number;
  readonly maximumSourceDurationSeconds: number;
  readonly maximumOutputBytes: number;
  readonly loopPolicy: "allowed" | "forbidden";
  readonly intendedRuntimeUse: string;
}

export interface AudioLoopPolicy {
  readonly enabled: boolean;
  readonly beginSamples?: number;
}

export interface AudioSourceEvidence {
  readonly sha256: string;
  readonly bytes: number;
  readonly formatNames: readonly string[];
  readonly codec: string;
  readonly sampleRateHz: number;
  readonly channels: number;
  readonly durationSeconds: number;
  readonly bitRate: number | null;
}

export interface AudioPcmMetrics {
  readonly alignmentFrames: number;
  readonly comparedFrames: number;
  readonly meanAbsoluteError: number;
  readonly rootMeanSquareError: number;
  readonly snrDb: number;
  readonly peakAbsoluteError: number;
  readonly durationDeltaMilliseconds: number;
}

export interface AudioCandidateEvidence {
  readonly id: string;
  readonly format: AudioDeliveryFormat;
  readonly codec: string;
  readonly quality: number | null;
  readonly bytes: number;
  readonly sha256: string;
  readonly sampleRateHz: number;
  readonly channels: number;
  readonly durationSeconds: number;
  readonly metrics: AudioPcmMetrics;
  readonly passed: boolean;
  readonly failures: readonly string[];
}

export interface AudioDeliveryRequest {
  readonly profileId: AudioDeliveryProfileId;
  readonly loop: AudioLoopPolicy;
}

export interface AudioDeliveryEvidence {
  readonly schema: typeof AUDIO_DELIVERY_RECEIPT_SCHEMA;
  readonly optimizerVersion: typeof AUDIO_DELIVERY_VERSION;
  readonly profileCatalogVersion: typeof AUDIO_PROFILE_CATALOG_VERSION;
  readonly profileId: AudioDeliveryProfileId;
  readonly profileSha256: string;
  readonly tools: Readonly<{
    ffmpeg: Readonly<{ executable: string; version: string; sha256: string }>;
    ffprobe: Readonly<{ executable: string; version: string; sha256: string }>;
  }>;
  readonly source: AudioSourceEvidence;
  readonly reference: Readonly<{
    sourceSampleRateHz: number;
    targetSampleRateHz: number;
    sourceChannels: number;
    targetChannels: number;
    downsampled: boolean;
    downmixed: boolean;
    frames: number;
    durationSeconds: number;
    peak: number;
    trimmedLeadingFrames: number;
    trimmedTrailingFrames: number;
    fadeFrames: number;
    sha256: string;
  }>;
  readonly transformations: readonly string[];
  readonly loop: AudioLoopPolicy & Readonly<{ beginSeconds?: number }>;
  readonly candidates: readonly AudioCandidateEvidence[];
  readonly selectedCandidateId: string;
  readonly prepared: Readonly<{
    sha256: string;
    bytes: number;
    format: AudioDeliveryFormat;
    codec: string;
    sampleRateHz: number;
    channels: number;
    durationSeconds: number;
  }>;
  readonly savings: Readonly<{ bytes: number; fraction: number }>;
}

export interface AudioDeliveryResult {
  readonly bytes: Buffer;
  readonly evidence: AudioDeliveryEvidence;
}

export interface AudioBatchManifestItem {
  readonly id: string;
  readonly sourcePath: string;
  readonly targetPath: string;
  readonly sourceSha256: string;
  readonly sourceBytes: number;
  readonly profileId: AudioDeliveryProfileId;
  readonly loop: AudioLoopPolicy;
}

export interface AudioBatchManifest {
  readonly schema: typeof AUDIO_DELIVERY_SCHEMA;
  readonly batchId: string;
  readonly project: Readonly<{
    id: string;
    title: string;
    engine?: string;
    engineVersion?: string;
  }>;
  readonly items: readonly AudioBatchManifestItem[];
}

export interface AudioBatchReceipt {
  readonly schema: typeof AUDIO_DELIVERY_RECEIPT_SCHEMA;
  readonly optimizerVersion: typeof AUDIO_DELIVERY_VERSION;
  readonly profileCatalogVersion: typeof AUDIO_PROFILE_CATALOG_VERSION;
  readonly batchId: string;
  readonly batchSha256: string;
  readonly project: AudioBatchManifest["project"];
  readonly items: readonly Readonly<{
    id: string;
    sourcePath: string;
    targetPath: string;
    sourceSha256: string;
    sourceBytes: number;
    outputSha256: string;
    outputBytes: number;
    profileId: AudioDeliveryProfileId;
    evidence: AudioDeliveryEvidence;
  }>[];
  readonly totals: Readonly<{
    files: number;
    sourceBytes: number;
    outputBytes: number;
    savedBytes: number;
    savedFraction: number;
  }>;
  readonly exactOutputPaths: readonly string[];
  readonly mutationPerformed: boolean;
}

export class AudioDeliveryError extends Error {
  public readonly code: string;
  public readonly details: Readonly<Record<string, unknown>> | null;

  public constructor(
    code: string,
    message: string,
    details: Readonly<Record<string, unknown>> | null = null,
  ) {
    super(message);
    this.name = "AudioDeliveryError";
    this.code = code;
    this.details = details;
  }
}
