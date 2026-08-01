import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { AudioDeliveryError } from "./types.js";

export interface AudioToolIdentity {
  readonly executable: string;
  readonly version: string;
  readonly sha256: string;
}

function boundedDetail(value: unknown): string {
  return String(value ?? "")
    .replace(/[\r\n]+/gu, " ")
    .trim()
    .slice(0, 2_000);
}

function locate(requested: string | undefined, fallback: string): string {
  const candidate = requested?.trim();
  if (candidate && /[\r\n\0]/u.test(candidate)) {
    throw new AudioDeliveryError(
      "AUDIO_TOOL_PATH_INVALID",
      `${fallback} executable path is invalid.`,
    );
  }
  if (candidate) {
    const resolved = fs.realpathSync(path.resolve(candidate));
    if (!fs.statSync(resolved).isFile()) {
      throw new AudioDeliveryError(
        "AUDIO_TOOL_PATH_INVALID",
        `${resolved} is not a regular file.`,
      );
    }
    return resolved;
  }
  const locator = process.platform === "win32" ? "where.exe" : "which";
  const result = spawnSync(locator, [fallback], {
    encoding: "utf8",
    shell: false,
    windowsHide: true,
    timeout: 30_000,
    maxBuffer: 2 * 1024 * 1024,
  });
  const found = String(result.stdout ?? "")
    .split(/\r?\n/u)
    .map((entry) => entry.trim())
    .find(Boolean);
  if (result.error || result.signal || result.status !== 0 || !found) {
    throw new AudioDeliveryError(
      "AUDIO_TOOL_NOT_FOUND",
      `${fallback} is not available on PATH.`,
    );
  }
  return fs.realpathSync(found);
}

export function runTool(
  command: string,
  args: readonly string[],
  options: Readonly<{
    input?: Buffer;
    cwd?: string;
    timeoutMilliseconds?: number;
    maxBufferBytes?: number;
  }> = {},
): Buffer {
  const result = spawnSync(command, [...args], {
    ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
    env: process.env,
    encoding: "buffer",
    ...(options.input === undefined ? {} : { input: options.input }),
    shell: false,
    windowsHide: true,
    timeout: options.timeoutMilliseconds ?? 10 * 60 * 1_000,
    maxBuffer: options.maxBufferBytes ?? 64 * 1024 * 1024,
  });
  if (result.error || result.signal || result.status !== 0) {
    throw new AudioDeliveryError(
      "AUDIO_TOOL_COMMAND_FAILED",
      `${path.basename(command)} ${args.join(" ")} failed: ${boundedDetail(result.error?.message || result.stderr || result.stdout || result.signal || result.status)}`,
      {
        executable: command,
        args: [...args],
        status: result.status,
        signal: result.signal,
      },
    );
  }
  return Buffer.from(result.stdout ?? Buffer.alloc(0));
}

function identity(command: string, label: string): AudioToolIdentity {
  const output = runTool(command, ["-version"], {
    timeoutMilliseconds: 30_000,
    maxBufferBytes: 2 * 1024 * 1024,
  })
    .toString("utf8")
    .split(/\r?\n/u)[0]
    ?.trim();
  if (!output || !output.toLowerCase().startsWith(label)) {
    throw new AudioDeliveryError(
      "AUDIO_TOOL_IDENTITY_INVALID",
      `${command} did not report a recognizable ${label} identity.`,
    );
  }
  return Object.freeze({
    executable: command,
    version: output,
    sha256: createHash("sha256").update(fs.readFileSync(command)).digest("hex"),
  });
}

export function resolveAudioTools(): Readonly<{
  ffmpeg: AudioToolIdentity;
  ffprobe: AudioToolIdentity;
}> {
  const ffmpeg = locate(process.env.FFMPEG_BIN, "ffmpeg");
  const ffprobe = locate(process.env.FFPROBE_BIN, "ffprobe");
  return Object.freeze({
    ffmpeg: identity(ffmpeg, "ffmpeg version"),
    ffprobe: identity(ffprobe, "ffprobe version"),
  });
}

export function runToolToFile(
  command: string,
  args: readonly string[],
  outputPath: string,
  options: Readonly<{
    timeoutMilliseconds?: number;
    maxOutputBytes?: number;
  }> = {},
): void {
  runTool(command, args, {
    ...(options.timeoutMilliseconds === undefined
      ? {}
      : { timeoutMilliseconds: options.timeoutMilliseconds }),
    maxBufferBytes: 8 * 1024 * 1024,
  });
  const details = fs.statSync(outputPath);
  if (!details.isFile() || details.size < 1) {
    throw new AudioDeliveryError(
      "AUDIO_TOOL_OUTPUT_MISSING",
      `${outputPath} was not produced as a regular file.`,
    );
  }
  if (
    options.maxOutputBytes !== undefined &&
    details.size > options.maxOutputBytes
  ) {
    throw new AudioDeliveryError(
      "AUDIO_TOOL_OUTPUT_EXCESSIVE",
      `${outputPath} exceeds ${options.maxOutputBytes} bytes.`,
    );
  }
}
