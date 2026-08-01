import { createHash } from "node:crypto";

import { AudioDeliveryError, type AudioPcmMetrics } from "./types.js";

const FLOAT_BYTES = 4;

export function pcmFrames(bytes: Buffer, channels: number): number {
  const frameBytes = channels * FLOAT_BYTES;
  if (bytes.byteLength % frameBytes !== 0) {
    throw new AudioDeliveryError(
      "AUDIO_PCM_SHAPE_INVALID",
      `PCM byte length ${bytes.byteLength} is not divisible by ${frameBytes}.`,
    );
  }
  return bytes.byteLength / frameBytes;
}

function floats(bytes: Buffer): Float32Array {
  const copy = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
  return new Float32Array(copy);
}

export interface TrimmedPcm {
  readonly bytes: Buffer;
  readonly frames: number;
  readonly peak: number;
  readonly trimmedLeadingFrames: number;
  readonly trimmedTrailingFrames: number;
  readonly sha256: string;
}

export function trimRelativeSilence(
  input: Buffer,
  channels: number,
  enabled: boolean,
  thresholdDb: number,
  fadeSamples: number,
): TrimmedPcm {
  const samples = floats(input);
  const frames = pcmFrames(input, channels);
  let peak = 0;
  for (const value of samples) peak = Math.max(peak, Math.abs(value));
  if (peak <= 1e-9) {
    throw new AudioDeliveryError(
      "AUDIO_SOURCE_SILENT",
      "Audio contains no measurable signal.",
    );
  }
  if (!enabled) {
    return Object.freeze({
      bytes: Buffer.from(input),
      frames,
      peak,
      trimmedLeadingFrames: 0,
      trimmedTrailingFrames: 0,
      sha256: createHash("sha256").update(input).digest("hex"),
    });
  }
  const threshold = peak * 10 ** (thresholdDb / 20);
  const audible = (frame: number): boolean => {
    const start = frame * channels;
    for (let channel = 0; channel < channels; channel += 1) {
      if (Math.abs(samples[start + channel] ?? 0) >= threshold) return true;
    }
    return false;
  };
  let first = 0;
  while (first < frames && !audible(first)) first += 1;
  let last = frames - 1;
  while (last >= first && !audible(last)) last -= 1;
  if (last < first) {
    throw new AudioDeliveryError(
      "AUDIO_TRIM_REMOVED_ALL_SIGNAL",
      "Silence trimming found no retained audible frames.",
    );
  }
  const retainedFrames = last - first + 1;
  const output = Buffer.alloc(retainedFrames * channels * FLOAT_BYTES);
  input.copy(
    output,
    0,
    first * channels * FLOAT_BYTES,
    (last + 1) * channels * FLOAT_BYTES,
  );
  const values = floats(output);
  const fade = Math.min(fadeSamples, Math.floor(retainedFrames / 2));
  for (let frame = 0; frame < fade; frame += 1) {
    const fadeIn = (frame + 1) / fade;
    const fadeOut = (fade - frame) / fade;
    const lastFrame = retainedFrames - 1 - frame;
    for (let channel = 0; channel < channels; channel += 1) {
      const firstIndex = frame * channels + channel;
      const lastIndex = lastFrame * channels + channel;
      const firstValue = values[firstIndex] ?? 0;
      const lastValue = values[lastIndex] ?? 0;
      values.set([firstValue * fadeIn], firstIndex);
      values.set([lastValue * fadeOut], lastIndex);
    }
  }
  return Object.freeze({
    bytes: output,
    frames: retainedFrames,
    peak,
    trimmedLeadingFrames: first,
    trimmedTrailingFrames: frames - 1 - last,
    sha256: createHash("sha256").update(output).digest("hex"),
  });
}

function monoAt(values: Float32Array, frame: number, channels: number): number {
  const start = frame * channels;
  let total = 0;
  for (let channel = 0; channel < channels; channel += 1) {
    total += values[start + channel] ?? 0;
  }
  return total / channels;
}

function bestAlignmentFrames(
  reference: Float32Array,
  candidate: Float32Array,
  channels: number,
  maximumLagFrames = 1_024,
): number {
  const referenceFrames = Math.floor(reference.length / channels);
  const candidateFrames = Math.floor(candidate.length / channels);
  const windowFrames = Math.min(8_192, referenceFrames, candidateFrames);
  if (windowFrames < 16) return 0;
  let bestLag = 0;
  let bestError = Number.POSITIVE_INFINITY;
  const score = (lag: number): number => {
    const referenceStart = Math.max(0, -lag);
    const candidateStart = Math.max(0, lag);
    const available = Math.min(
      windowFrames,
      referenceFrames - referenceStart,
      candidateFrames - candidateStart,
    );
    if (available < 16) return Number.POSITIVE_INFINITY;
    const stride = Math.max(1, Math.floor(available / 2_048));
    let error = 0;
    let count = 0;
    for (let frame = 0; frame < available; frame += stride) {
      const difference =
        monoAt(reference, referenceStart + frame, channels) -
        monoAt(candidate, candidateStart + frame, channels);
      error += difference * difference;
      count += 1;
    }
    return count === 0 ? Number.POSITIVE_INFINITY : error / count;
  };
  for (let lag = -maximumLagFrames; lag <= maximumLagFrames; lag += 16) {
    const error = score(lag);
    if (error < bestError) {
      bestError = error;
      bestLag = lag;
    }
  }
  const coarse = bestLag;
  for (let lag = coarse - 16; lag <= coarse + 16; lag += 1) {
    const error = score(lag);
    if (error < bestError) {
      bestError = error;
      bestLag = lag;
    }
  }
  return bestLag;
}

export function comparePcm(
  referenceBytes: Buffer,
  candidateBytes: Buffer,
  channels: number,
  sampleRateHz: number,
): AudioPcmMetrics {
  const reference = floats(referenceBytes);
  const candidate = floats(candidateBytes);
  const referenceFrames = pcmFrames(referenceBytes, channels);
  const candidateFrames = pcmFrames(candidateBytes, channels);
  const alignmentFrames = bestAlignmentFrames(reference, candidate, channels);
  const referenceStart = Math.max(0, -alignmentFrames);
  const candidateStart = Math.max(0, alignmentFrames);
  const comparedFrames = Math.min(
    referenceFrames - referenceStart,
    candidateFrames - candidateStart,
  );
  if (comparedFrames < 1) {
    throw new AudioDeliveryError(
      "AUDIO_PCM_OVERLAP_EMPTY",
      "Reference and candidate have no comparable PCM frames.",
    );
  }
  let absolute = 0;
  let squared = 0;
  let signalSquared = 0;
  let peakAbsoluteError = 0;
  const samples = comparedFrames * channels;
  for (let frame = 0; frame < comparedFrames; frame += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const referenceValue =
        reference[(referenceStart + frame) * channels + channel] ?? 0;
      const candidateValue =
        candidate[(candidateStart + frame) * channels + channel] ?? 0;
      const difference = referenceValue - candidateValue;
      const magnitude = Math.abs(difference);
      absolute += magnitude;
      squared += difference * difference;
      signalSquared += referenceValue * referenceValue;
      peakAbsoluteError = Math.max(peakAbsoluteError, magnitude);
    }
  }
  const meanAbsoluteError = absolute / samples;
  const rootMeanSquareError = Math.sqrt(squared / samples);
  const snrDb =
    squared <= 1e-30
      ? 999
      : 10 * Math.log10(Math.max(signalSquared, 1e-30) / squared);
  return Object.freeze({
    alignmentFrames,
    comparedFrames,
    meanAbsoluteError,
    rootMeanSquareError,
    snrDb,
    peakAbsoluteError,
    durationDeltaMilliseconds:
      (Math.abs(referenceFrames - candidateFrames) / sampleRateHz) * 1_000,
  });
}
