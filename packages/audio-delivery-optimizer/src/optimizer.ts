import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { comparePcm, pcmFrames, trimRelativeSilence } from "./pcm.js";
import { probeAudioFile } from "./probe.js";
import {
  audioDeliveryProfileSha256,
  resolveAudioDeliveryProfile,
} from "./profiles.js";
import { resolveAudioTools, runToolToFile } from "./tools.js";
import {
  AUDIO_DELIVERY_RECEIPT_SCHEMA,
  AUDIO_DELIVERY_VERSION,
  AUDIO_PROFILE_CATALOG_VERSION,
  AudioDeliveryError,
  type AudioCandidateEvidence,
  type AudioDeliveryRequest,
  type AudioDeliveryResult,
} from "./types.js";

const MiB = 1024 * 1024;
const MAXIMUM_SOURCE_BYTES = 256 * MiB;
const MAXIMUM_DECODED_BYTES = 512 * MiB;

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function exactSource(input: Buffer | Uint8Array): Buffer {
  const bytes = Buffer.from(input);
  if (bytes.byteLength < 1) {
    throw new AudioDeliveryError(
      "AUDIO_SOURCE_EMPTY",
      "Audio source is empty.",
    );
  }
  if (bytes.byteLength > MAXIMUM_SOURCE_BYTES) {
    throw new AudioDeliveryError(
      "AUDIO_SOURCE_TOO_LARGE",
      `Audio source exceeds ${MAXIMUM_SOURCE_BYTES} bytes.`,
    );
  }
  return bytes;
}

function candidateFailures(
  candidate: Omit<AudioCandidateEvidence, "passed" | "failures">,
  request: AudioDeliveryRequest,
  expectedSampleRateHz: number,
  expectedChannels: number,
): readonly string[] {
  const profile = resolveAudioDeliveryProfile(request.profileId);
  const failures: string[] = [];
  if (candidate.bytes > profile.maximumOutputBytes) {
    failures.push(`output-bytes:${candidate.bytes}>${profile.maximumOutputBytes}`);
  }
  if (candidate.sampleRateHz !== expectedSampleRateHz) {
    failures.push(`sample-rate:${candidate.sampleRateHz}!=${expectedSampleRateHz}`);
  }
  if (candidate.channels !== expectedChannels) {
    failures.push(`channels:${candidate.channels}!=${expectedChannels}`);
  }
  if (candidate.format !== profile.outputFormat) {
    failures.push(`format:${candidate.format}!=${profile.outputFormat}`);
  }
  if (
    profile.outputFormat === "wav" &&
    !candidate.codec.startsWith("pcm_s16le")
  ) {
    failures.push(`codec:${candidate.codec}!=pcm_s16le`);
  }
  if (profile.outputFormat === "ogg" && candidate.codec !== "vorbis") {
    failures.push(`codec:${candidate.codec}!=vorbis`);
  }
  if (candidate.metrics.snrDb < profile.minimumSnrDb) {
    failures.push(
      `snr:${candidate.metrics.snrDb.toFixed(4)}<${profile.minimumSnrDb}`,
    );
  }
  if (
    candidate.metrics.meanAbsoluteError >
    profile.maximumMeanAbsoluteError
  ) {
    failures.push(
      `mae:${candidate.metrics.meanAbsoluteError.toFixed(6)}>${profile.maximumMeanAbsoluteError}`,
    );
  }
  if (
    candidate.metrics.durationDeltaMilliseconds >
    profile.maximumDurationDeltaMilliseconds
  ) {
    failures.push(
      `duration-delta:${candidate.metrics.durationDeltaMilliseconds.toFixed(4)}>${profile.maximumDurationDeltaMilliseconds}`,
    );
  }
  return Object.freeze(failures);
}

function encodeCandidate(
  referencePath: string,
  outputPath: string,
  request: AudioDeliveryRequest,
  quality: number | null,
  ffmpegExecutable: string,
  targetSampleRateHz: number,
  targetChannels: number,
): void {
  const profile = resolveAudioDeliveryProfile(request.profileId);
  const base = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-nostdin",
    "-y",
    "-f",
    "f32le",
    "-ar",
    String(targetSampleRateHz),
    "-ac",
    String(targetChannels),
    "-i",
    referencePath,
    "-map_metadata",
    "-1",
  ];
  const codec =
    profile.outputFormat === "wav"
      ? ["-c:a", "pcm_s16le", "-f", "wav"]
      : [
          "-c:a",
          "libvorbis",
          "-q:a",
          String(quality),
          "-f",
          "ogg",
        ];
  runToolToFile(ffmpegExecutable, [...base, ...codec, outputPath], outputPath, {
    timeoutMilliseconds: 20 * 60 * 1_000,
    maxOutputBytes: Math.max(profile.maximumOutputBytes * 2, 4 * MiB),
  });
}

function decodeSourceToPcm(
  sourcePath: string,
  outputPath: string,
  targetSampleRateHz: number,
  targetChannels: number,
  ffmpegExecutable: string,
  maximumDecodedBytes: number,
): void {
  runToolToFile(
    ffmpegExecutable,
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-nostdin",
      "-y",
      "-i",
      sourcePath,
      "-vn",
      "-sn",
      "-dn",
      "-ac",
      String(targetChannels),
      "-ar",
      String(targetSampleRateHz),
      "-f",
      "f32le",
      "-c:a",
      "pcm_f32le",
      outputPath,
    ],
    outputPath,
    {
      timeoutMilliseconds: 30 * 60 * 1_000,
      maxOutputBytes: maximumDecodedBytes,
    },
  );
}

function decodeCandidateToPcm(
  candidatePath: string,
  outputPath: string,
  targetSampleRateHz: number,
  targetChannels: number,
  ffmpegExecutable: string,
  maximumDecodedBytes: number,
): void {
  decodeSourceToPcm(
    candidatePath,
    outputPath,
    targetSampleRateHz,
    targetChannels,
    ffmpegExecutable,
    maximumDecodedBytes,
  );
}

export async function optimizeAudioDelivery(
  input: Buffer | Uint8Array,
  request: AudioDeliveryRequest,
): Promise<AudioDeliveryResult> {
  const sourceBytes = exactSource(input);
  const profile = resolveAudioDeliveryProfile(request.profileId);
  if (request.loop.enabled && profile.loopPolicy === "forbidden") {
    throw new AudioDeliveryError(
      "AUDIO_LOOP_FORBIDDEN",
      `${profile.id} does not permit looping.`,
    );
  }
  if (request.loop.enabled && profile.trimSilence) {
    throw new AudioDeliveryError(
      "AUDIO_LOOP_TRIM_CONFLICT",
      `${profile.id} trims silence and cannot be used for a looped asset.`,
    );
  }
  if (
    request.loop.beginSamples !== undefined &&
    (!request.loop.enabled ||
      !Number.isSafeInteger(request.loop.beginSamples) ||
      request.loop.beginSamples < 0)
  ) {
    throw new AudioDeliveryError(
      "AUDIO_LOOP_BEGIN_INVALID",
      "loop.beginSamples requires an enabled loop and a non-negative integer.",
    );
  }

  const tools = resolveAudioTools();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `evavo-audio-${randomUUID()}-`));
  try {
    const sourcePath = path.join(root, "source.bin");
    fs.writeFileSync(sourcePath, sourceBytes, { flag: "wx" });
    const source = probeAudioFile(sourcePath, tools.ffprobe);
    const targetSampleRateHz = Math.min(
      source.sampleRateHz,
      profile.maximumSampleRateHz,
    );
    const targetChannels = Math.min(
      source.channels,
      profile.maximumChannels,
    );
    if (targetSampleRateHz < 1 || targetChannels < 1) {
      throw new AudioDeliveryError(
        "AUDIO_TARGET_FORMAT_INVALID",
        "Audio source cannot produce a positive target sample rate and channel count.",
      );
    }
    if (source.durationSeconds > profile.maximumSourceDurationSeconds) {
      throw new AudioDeliveryError(
        "AUDIO_DURATION_EXCESSIVE",
        `${source.durationSeconds.toFixed(3)} seconds exceeds ${profile.maximumSourceDurationSeconds} for ${profile.id}.`,
      );
    }
    const decodedLimit = Math.min(
      MAXIMUM_DECODED_BYTES,
      Math.ceil(
        (profile.maximumSourceDurationSeconds + 2) *
          targetSampleRateHz *
          targetChannels *
          4,
      ),
    );
    const decodedPath = path.join(root, "decoded.f32");
    decodeSourceToPcm(
      sourcePath,
      decodedPath,
      targetSampleRateHz,
      targetChannels,
      tools.ffmpeg.executable,
      decodedLimit,
    );
    const decoded = fs.readFileSync(decodedPath);
    const fadeFrames = Math.min(
      profile.trimFadeSamples,
      Math.max(1, Math.round(targetSampleRateHz * 0.012)),
    );
    const trimmed = trimRelativeSilence(
      decoded,
      targetChannels,
      profile.trimSilence,
      profile.trimThresholdDb,
      fadeFrames,
    );
    const referencePath = path.join(root, "reference.f32");
    fs.writeFileSync(referencePath, trimmed.bytes, { flag: "wx" });
    const transformations = [
      `decode-f32le-${targetSampleRateHz}hz-${targetChannels}ch`,
      targetSampleRateHz < source.sampleRateHz
        ? `downsample-${source.sampleRateHz}hz-to-${targetSampleRateHz}hz`
        : `preserve-source-sample-rate-${targetSampleRateHz}hz`,
      targetChannels < source.channels
        ? `downmix-${source.channels}ch-to-${targetChannels}ch`
        : `preserve-source-channel-count-${targetChannels}ch`,
      profile.trimSilence
        ? `trim-relative-silence-${profile.trimThresholdDb}db-fade-${fadeFrames}-frames`
        : "preserve-leading-and-trailing-timing",
      profile.outputFormat === "wav"
        ? "encode-pcm-s16le-wav"
        : "encode-vorbis-candidates",
      "strip-container-metadata",
    ];
    const qualities =
      profile.outputFormat === "wav" ? [null] : profile.vorbisQualities;
    const candidates: Array<{
      bytes: Buffer;
      evidence: AudioCandidateEvidence;
    }> = [];
    for (const quality of qualities) {
      const id =
        quality === null ? "wav-pcm-s16le" : `ogg-vorbis-q${quality}`;
      const candidatePath = path.join(
        root,
        `${id}.${profile.outputFormat}`,
      );
      encodeCandidate(
        referencePath,
        candidatePath,
        request,
        quality,
        tools.ffmpeg.executable,
        targetSampleRateHz,
        targetChannels,
      );
      const candidateBytes = fs.readFileSync(candidatePath);
      const candidateProbe = probeAudioFile(candidatePath, tools.ffprobe);
      const candidatePcmPath = path.join(root, `${id}.f32`);
      decodeCandidateToPcm(
        candidatePath,
        candidatePcmPath,
        targetSampleRateHz,
        targetChannels,
        tools.ffmpeg.executable,
        decodedLimit,
      );
      const candidatePcm = fs.readFileSync(candidatePcmPath);
      const base = {
        id,
        format: profile.outputFormat,
        codec: candidateProbe.codec,
        quality,
        bytes: candidateBytes.byteLength,
        sha256: sha256(candidateBytes),
        sampleRateHz: candidateProbe.sampleRateHz,
        channels: candidateProbe.channels,
        durationSeconds: candidateProbe.durationSeconds,
        metrics: comparePcm(
          trimmed.bytes,
          candidatePcm,
          targetChannels,
          targetSampleRateHz,
        ),
      } as const;
      const failures = candidateFailures(
        base,
        request,
        targetSampleRateHz,
        targetChannels,
      );
      candidates.push({
        bytes: candidateBytes,
        evidence: Object.freeze({
          ...base,
          passed: failures.length === 0,
          failures,
        }),
      });
    }
    const selected = candidates
      .filter((candidate) => candidate.evidence.passed)
      .sort(
        (left, right) =>
          left.bytes.byteLength - right.bytes.byteLength ||
          left.evidence.id.localeCompare(right.evidence.id),
      )[0];
    if (!selected) {
      throw new AudioDeliveryError(
        "AUDIO_NO_CANDIDATE_PASSED",
        `No ${profile.id} candidate satisfied codec, timing, quality and byte gates.`,
        { candidates: candidates.map((candidate) => candidate.evidence) },
      );
    }
    const referenceFrames = pcmFrames(trimmed.bytes, targetChannels);
    if (
      request.loop.beginSamples !== undefined &&
      request.loop.beginSamples >= referenceFrames
    ) {
      throw new AudioDeliveryError(
        "AUDIO_LOOP_BEGIN_OUT_OF_RANGE",
        `loop.beginSamples ${request.loop.beginSamples} must be less than ${referenceFrames} prepared frames.`,
      );
    }
    const savedBytes = sourceBytes.byteLength - selected.bytes.byteLength;
    return Object.freeze({
      bytes: selected.bytes,
      evidence: Object.freeze({
        schema: AUDIO_DELIVERY_RECEIPT_SCHEMA,
        optimizerVersion: AUDIO_DELIVERY_VERSION,
        profileCatalogVersion: AUDIO_PROFILE_CATALOG_VERSION,
        profileId: profile.id,
        profileSha256: audioDeliveryProfileSha256(profile),
        tools,
        source,
        reference: Object.freeze({
          sourceSampleRateHz: source.sampleRateHz,
          targetSampleRateHz,
          sourceChannels: source.channels,
          targetChannels,
          downsampled: targetSampleRateHz < source.sampleRateHz,
          downmixed: targetChannels < source.channels,
          frames: referenceFrames,
          durationSeconds: referenceFrames / targetSampleRateHz,
          peak: trimmed.peak,
          trimmedLeadingFrames: trimmed.trimmedLeadingFrames,
          trimmedTrailingFrames: trimmed.trimmedTrailingFrames,
          fadeFrames,
          sha256: trimmed.sha256,
        }),
        transformations: Object.freeze(transformations),
        loop: Object.freeze({
          ...request.loop,
          ...(request.loop.beginSamples === undefined
            ? {}
            : { beginSeconds: request.loop.beginSamples / targetSampleRateHz }),
        }),
        candidates: Object.freeze(candidates.map((candidate) => candidate.evidence)),
        selectedCandidateId: selected.evidence.id,
        prepared: Object.freeze({
          sha256: selected.evidence.sha256,
          bytes: selected.evidence.bytes,
          format: selected.evidence.format,
          codec: selected.evidence.codec,
          sampleRateHz: selected.evidence.sampleRateHz,
          channels: selected.evidence.channels,
          durationSeconds: selected.evidence.durationSeconds,
        }),
        savings: Object.freeze({
          bytes: savedBytes,
          fraction: savedBytes / sourceBytes.byteLength,
        }),
      }),
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
