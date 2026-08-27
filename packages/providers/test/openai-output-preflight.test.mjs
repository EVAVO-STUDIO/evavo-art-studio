import assert from "node:assert/strict";
import test from "node:test";
import { deflateSync } from "node:zlib";

import {
  OpenAIImageProviderAdapter,
  ProviderError,
  compileProviderCandidatePrompt,
  providerRequestSha256,
  validateProviderCandidateRequest,
} from "../dist/index.js";

const CRC_TABLE = Object.freeze(
  Array.from({ length: 256 }, (_, value) => {
    let crc = value;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) === 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
    return crc >>> 0;
  }),
);

function crc32(input) {
  let crc = 0xffffffff;
  for (const value of input) {
    crc = CRC_TABLE[(crc ^ value) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const name = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

function rgbaPng(width, height) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const stride = 1 + width * 4;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * stride;
    raw[row] = 0;
    for (let x = 0; x < width; x += 1) {
      const pixel = row + 1 + x * 4;
      raw[pixel] = 0;
      raw[pixel + 1] = 255;
      raw[pixel + 2] = 0;
      raw[pixel + 3] = x === 0 && y === 0 ? 0 : 255;
    }
  }
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

const VALID_1024_PNG_BASE64 = rgbaPng(1024, 1024).toString("base64");
const SMALL_PNG_BASE64 = rgbaPng(8, 8).toString("base64");

function resolved() {
  const normalized = validateProviderCandidateRequest({
    schemaVersion: "1.0",
    operation: "generate",
    assetKind: "illustration",
    continuityPhase: "independent",
    assetId: "strict-output-admission",
    candidateFamilyId: "strict-output-admission-candidates",
    creativeIntent: "Generate one bounded opaque production candidate.",
    style: {
      styleName: "Output admission fixture",
      intent: "Prove the exact provider response contract.",
      mustHave: ["single bounded image"],
      mustAvoid: ["format substitution"],
    },
    shot: {
      subject: "One isolated test composition.",
      include: ["complete frame"],
      exclude: ["extra panels"],
      separateAssets: [],
    },
    target: {
      width: 1024,
      height: 1024,
      transparency: "opaque",
      outputFormat: "png",
    },
    sourceCanvas: { width: 1024, height: 1024 },
    background: { strategy: "opaque-source" },
    quality: "standard",
    candidateCount: 1,
    references: [],
    selection: {
      preferredModel: "gpt-image-2",
      allowedAdapterIds: ["openai-gpt-image"],
      allowFallback: false,
    },
  });
  const prompt = compileProviderCandidatePrompt(normalized);
  return {
    request: normalized,
    requestSha256: providerRequestSha256(normalized),
    compiledPrompt: prompt.text,
    compiledPromptSha256: prompt.sha256,
    references: [],
  };
}

function adapter(data, outputValidationMode = "strict") {
  return new OpenAIImageProviderAdapter({
    apiKey: "test-key-abcdefghijklmnopqrstuvwxyz0123456789",
    baseUrl: "https://example.test/v1",
    outputValidationMode,
    fetch: async () =>
      new Response(JSON.stringify({ data }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  });
}

const context = {
  signal: new AbortController().signal,
  requestedAt: new Date("2026-08-28T00:00:00Z"),
};

test("strict OpenAI output admission proves every candidate before storage", async () => {
  const result = await adapter([
    { b64_json: VALID_1024_PNG_BASE64 },
  ]).execute(resolved(), context);

  assert.equal(result.outputs.length, 1);
  assert.equal(result.metadata.outputPreflight.mode, "strict");
  assert.equal(result.metadata.outputPreflight.compatible, true);
  assert.equal(result.metadata.outputPreflight.expectedWidth, 1024);
  assert.equal(result.metadata.outputPreflight.expectedHeight, 1024);
  assert.equal(result.outputs[0].metadata.rasterPreflight.compatible, true);
  assert.equal(result.outputs[0].metadata.rasterPreflight.actual.width, 1024);
  assert.equal(result.outputs[0].metadata.rasterPreflight.actual.height, 1024);
  assert.equal(result.outputs[0].metadata.rasterPreflight.actual.sha256.length, 64);
});

test("strict OpenAI output admission rejects wrong decoded dimensions", async () => {
  await assert.rejects(
    () => adapter([{ b64_json: SMALL_PNG_BASE64 }]).execute(resolved(), context),
    (error) =>
      error instanceof ProviderError &&
      error.code === "OPENAI_RASTER_OUTPUT_DIMENSIONS_MISMATCH" &&
      error.classification === "transient",
  );
});

test("OpenAI output admission rejects undecodable image bytes", async () => {
  await assert.rejects(
    () =>
      adapter([{ b64_json: Buffer.from("not an image").toString("base64") }]).execute(
        resolved(),
        context,
      ),
    (error) =>
      error instanceof ProviderError &&
      error.code === "OPENAI_RASTER_PREFLIGHT_DECODE_FAILED",
  );
});

test("OpenAI output admission rejects candidate count drift", async () => {
  await assert.rejects(
    () =>
      adapter([
        { b64_json: VALID_1024_PNG_BASE64 },
        { b64_json: VALID_1024_PNG_BASE64 },
      ]).execute(resolved(), context),
    (error) =>
      error instanceof ProviderError &&
      error.code === "OPENAI_IMAGE_OUTPUT_COUNT_MISMATCH",
  );
});

test("evidence mode preserves custom transport fixtures while exposing mismatches", async () => {
  const result = await adapter(
    [{ b64_json: SMALL_PNG_BASE64 }],
    "evidence",
  ).execute(resolved(), context);

  assert.equal(result.outputs.length, 1);
  assert.equal(result.metadata.outputPreflight.mode, "evidence");
  assert.equal(result.metadata.outputPreflight.compatible, false);
  assert.deepEqual(result.outputs[0].metadata.rasterPreflight.issues, [
    "RASTER_OUTPUT_DIMENSIONS_MISMATCH",
  ]);
});
