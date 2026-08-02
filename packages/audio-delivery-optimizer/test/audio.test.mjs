import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  AUDIO_DELIVERY_SCHEMA,
  executeAudioBatch,
  listAudioDeliveryProfiles,
  optimizeAudioDelivery,
  validateAudioBatchManifest,
} from "../dist/index.js";

function run(command, args) {
  const result = spawnSync(command, args, {
    encoding: "buffer",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error || result.signal || result.status !== 0) {
    const detail = [
      result.error?.message,
      result.signal ? `signal=${result.signal}` : null,
      result.status === null ? "status=null" : `status=${result.status}`,
      result.stderr?.toString("utf8"),
      result.stdout?.toString("utf8"),
    ]
      .filter(Boolean)
      .join("\n")
      .slice(0, 8_000);
    assert.fail(`${command} ${args.join(" ")} failed:\n${detail || "no process diagnostics"}`);
  }
  return Buffer.from(result.stdout ?? Buffer.alloc(0));
}

function sourceWav({ duration = 1, leading = 0, trailing = 0, frequency = 440, channels = 2, sampleRate = 48000 } = {}) {
  const filter = [
    leading > 0 ? `aevalsrc=0:d=${leading}:s=${sampleRate}:c=${channels === 2 ? "stereo" : "mono"}` : null,
    `sine=frequency=${frequency}:duration=${duration}:sample_rate=${sampleRate}`,
    trailing > 0 ? `aevalsrc=0:d=${trailing}:s=${sampleRate}:c=${channels === 2 ? "stereo" : "mono"}` : null,
  ].filter(Boolean);
  const inputs = filter.flatMap((value) => ["-f", "lavfi", "-i", value]);
  const labels = filter.map((_, index) => `[${index}:a]`).join("");
  return run("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    ...inputs,
    "-filter_complex",
    `${labels}concat=n=${filter.length}:v=0:a=1,pan=${channels === 2 ? "stereo|c0=c0|c1=c0" : "mono|c0=c0"}`,
    "-c:a",
    "pcm_s24le",
    "-f",
    "wav",
    "pipe:1",
  ]);
}

function probe(bytes, extension) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "evavo-audio-probe-"));
  try {
    const file = path.join(root, `audio.${extension}`);
    fs.writeFileSync(file, bytes);
    return JSON.parse(
      run("ffprobe", [
        "-v",
        "error",
        "-show_entries",
        "format=format_name,duration:stream=codec_name,sample_rate,channels",
        "-of",
        "json",
        file,
      ]).toString("utf8"),
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test("publishes Godot role-aware audio profiles", () => {
  const profiles = listAudioDeliveryProfiles();
  assert.equal(profiles.find((value) => value.id === "godot-ui-sfx-wav")?.maximumSampleRateHz, 22050);
  assert.equal(profiles.find((value) => value.id === "godot-voice-ogg")?.maximumChannels, 1);
  assert.equal(profiles.find((value) => value.id === "godot-music-ogg")?.outputFormat, "ogg");
});

test("prepares a trimmed mono PCM16 UI WAV", async () => {
  const source = sourceWav({ duration: 0.35, leading: 0.15, trailing: 0.2 });
  const result = await optimizeAudioDelivery(source, {
    profileId: "godot-ui-sfx-wav",
    loop: { enabled: false },
  });
  const metadata = probe(result.bytes, "wav");
  const stream = metadata.streams[0];
  assert.equal(stream.codec_name, "pcm_s16le");
  assert.equal(Number(stream.sample_rate), 22050);
  assert.equal(stream.channels, 1);
  assert.ok(result.evidence.reference.trimmedLeadingFrames > 0);
  assert.ok(result.evidence.reference.trimmedTrailingFrames > 0);
  assert.ok(Number(metadata.format.duration) < 0.5);
  assert.ok(result.evidence.candidates[0].metrics.snrDb > 70);
});

test("prepares compact mono voice Ogg and selects a passing quality", async () => {
  const source = sourceWav({ duration: 2.5, leading: 0.05, trailing: 0.05, frequency: 260 });
  const result = await optimizeAudioDelivery(source, {
    profileId: "godot-voice-ogg",
    loop: { enabled: false },
  });
  const metadata = probe(result.bytes, "ogg");
  const stream = metadata.streams[0];
  assert.equal(stream.codec_name, "vorbis");
  assert.equal(Number(stream.sample_rate), 22050);
  assert.equal(stream.channels, 1);
  assert.match(result.evidence.selectedCandidateId, /^ogg-vorbis-q/u);
  assert.ok(result.bytes.length < source.length / 4);
  assert.ok(result.evidence.candidates.some((candidate) => candidate.passed));
});

test("rejects trim-enabled profiles for looped assets", async () => {
  const source = sourceWav({ duration: 0.5 });
  await assert.rejects(
    optimizeAudioDelivery(source, {
      profileId: "godot-short-sfx-wav",
      loop: { enabled: true },
    }),
    /does not permit looping/i,
  );
});


test("never upsamples or upmixes a lower-rate mono voice source", async () => {
  const source = sourceWav({
    duration: 1.1,
    leading: 0.02,
    trailing: 0.02,
    frequency: 220,
    channels: 1,
    sampleRate: 16000,
  });
  const result = await optimizeAudioDelivery(source, {
    profileId: "godot-voice-ogg",
    loop: { enabled: false },
  });
  const metadata = probe(result.bytes, "ogg");
  const stream = metadata.streams[0];
  assert.equal(Number(stream.sample_rate), 16000);
  assert.equal(stream.channels, 1);
  assert.equal(result.evidence.reference.downsampled, false);
  assert.equal(result.evidence.reference.downmixed, false);
  assert.ok(result.evidence.transformations.includes("preserve-source-sample-rate-16000hz"));
  assert.match(result.evidence.tools.ffmpeg.sha256, /^[0-9a-f]{64}$/u);
  assert.match(result.evidence.tools.ffprobe.sha256, /^[0-9a-f]{64}$/u);
});

test("rejects a loop begin outside the prepared frame range", async () => {
  const source = sourceWav({ duration: 0.5, channels: 2, sampleRate: 44100 });
  await assert.rejects(
    optimizeAudioDelivery(source, {
      profileId: "godot-ambience-ogg",
      loop: { enabled: true, beginSamples: 999999 },
    }),
    /must be less than .* prepared frames/i,
  );
});

test("batch dry-run and atomic apply preserve exact hashes", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "evavo-audio-batch-"));
  try {
    const sourceRoot = path.join(root, "source");
    const outputRoot = path.join(root, "prepared");
    fs.mkdirSync(sourceRoot);
    const source = sourceWav({ duration: 0.25 });
    fs.writeFileSync(path.join(sourceRoot, "click.wav"), source);
    const manifest = validateAudioBatchManifest({
      schema: AUDIO_DELIVERY_SCHEMA,
      batchId: "audio-test",
      project: { id: "brass-brine", title: "Brass & Brine" },
      items: [
        {
          id: "ui-click",
          sourcePath: "click.wav",
          targetPath: "assets/audio/sfx/ui/click.wav",
          sourceSha256: createHash("sha256").update(source).digest("hex"),
          sourceBytes: source.length,
          profileId: "godot-ui-sfx-wav",
          loop: { enabled: false },
        },
      ],
    });
    const dryRun = await executeAudioBatch({
      manifest,
      sourceRoot,
      outputRoot,
      apply: false,
    });
    assert.equal(dryRun.mutationPerformed, false);
    assert.equal(fs.existsSync(outputRoot), false);
    const applied = await executeAudioBatch({
      manifest,
      sourceRoot,
      outputRoot,
      apply: true,
    });
    assert.equal(applied.mutationPerformed, true);
    const output = fs.readFileSync(path.join(outputRoot, "assets/audio/sfx/ui/click.wav"));
    assert.equal(createHash("sha256").update(output).digest("hex"), applied.items[0].outputSha256);
    assert.equal(fs.existsSync(path.join(outputRoot, "audio-delivery-receipt.json")), true);
    await assert.rejects(
      executeAudioBatch({ manifest, sourceRoot, outputRoot, apply: true }),
      /already exists/i,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
