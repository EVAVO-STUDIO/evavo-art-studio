import { createHash } from "node:crypto";
import fs from "node:fs";

import { runTool, type AudioToolIdentity } from "./tools.js";
import { AudioDeliveryError, type AudioSourceEvidence } from "./types.js";

interface ProbeStream {
  readonly codec_type?: string;
  readonly codec_name?: string;
  readonly sample_rate?: string;
  readonly channels?: number;
  readonly duration?: string;
}
interface ProbeFormat {
  readonly format_name?: string;
  readonly duration?: string;
  readonly bit_rate?: string;
}
interface ProbePayload {
  readonly streams?: readonly ProbeStream[];
  readonly format?: ProbeFormat;
}

function finite(value: string | number | undefined, label: string): number {
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0) {
    throw new AudioDeliveryError(
      "AUDIO_PROBE_VALUE_INVALID",
      `${label} is missing or invalid.`,
    );
  }
  return result;
}

export function probeAudioFile(
  filename: string,
  ffprobe: AudioToolIdentity,
): AudioSourceEvidence {
  const bytes = fs.readFileSync(filename);
  const output = runTool(ffprobe.executable, [
    "-v",
    "error",
    "-show_entries",
    "format=format_name,duration,bit_rate:stream=codec_type,codec_name,sample_rate,channels,duration",
    "-of",
    "json",
    filename,
  ], { maxBufferBytes: 4 * 1024 * 1024 });
  let payload: ProbePayload;
  try {
    payload = JSON.parse(output.toString("utf8")) as ProbePayload;
  } catch {
    throw new AudioDeliveryError(
      "AUDIO_PROBE_JSON_INVALID",
      "ffprobe did not return valid JSON.",
    );
  }
  const stream = payload.streams?.find((value) => value.codec_type === "audio");
  if (!stream) {
    throw new AudioDeliveryError(
      "AUDIO_STREAM_MISSING",
      "Source does not contain an audio stream.",
    );
  }
  const durationSeconds = finite(
    stream.duration ?? payload.format?.duration,
    "Audio duration",
  );
  if (durationSeconds <= 0) {
    throw new AudioDeliveryError(
      "AUDIO_DURATION_EMPTY",
      "Audio duration must be greater than zero.",
    );
  }
  const channels = finite(stream.channels, "Audio channels");
  const sampleRateHz = finite(stream.sample_rate, "Audio sample rate");
  return Object.freeze({
    sha256: createHash("sha256").update(bytes).digest("hex"),
    bytes: bytes.byteLength,
    formatNames: Object.freeze(
      String(payload.format?.format_name ?? "unknown")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    ),
    codec: String(stream.codec_name ?? "unknown"),
    sampleRateHz,
    channels,
    durationSeconds,
    bitRate:
      payload.format?.bit_rate === undefined
        ? null
        : finite(payload.format.bit_rate, "Audio bit rate"),
  });
}
