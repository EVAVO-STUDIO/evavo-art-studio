import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { FixtureImageProviderAdapter } from "../dist/index.js";

const sha = (value) => createHash("sha256").update(value).digest("hex");

function pngDimensions(bytes) {
  assert.equal(bytes.subarray(1, 4).toString("ascii"), "PNG");
  assert.equal(bytes.subarray(12, 16).toString("ascii"), "IHDR");
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

function resolved(width, height, requestId, transparency = "required") {
  return {
    request: {
      requestId,
      seed: 1234,
      candidateCount: 1,
      candidateFamilyId: "fixture-family",
      target: { width, height, transparency, outputFormat: "png" },
    },
    compiledPrompt: "fixture test",
    references: [],
  };
}

const context = () => ({
  signal: new AbortController().signal,
  requestedAt: new Date("2026-08-30T00:00:00.000Z"),
});

test("fixture provider emits exact requested tile canvases", async () => {
  const adapter = new FixtureImageProviderAdapter();
  const small = await adapter.execute(
    resolved(16, 16, "fixture-16"),
    context(),
  );
  const iso = await adapter.execute(
    resolved(64, 32, "fixture-64x32"),
    context(),
  );
  assert.deepEqual(pngDimensions(small.outputs[0].bytes), {
    width: 16,
    height: 16,
  });
  assert.deepEqual(pngDimensions(iso.outputs[0].bytes), {
    width: 64,
    height: 32,
  });
});

test("fixture provider is deterministic for the same request identity", async () => {
  const adapter = new FixtureImageProviderAdapter();
  const first = await adapter.execute(
    resolved(16, 16, "fixture-repeat"),
    context(),
  );
  const second = await adapter.execute(
    resolved(16, 16, "fixture-repeat"),
    context(),
  );
  assert.equal(sha(first.outputs[0].bytes), sha(second.outputs[0].bytes));
});

test("different request identities produce distinct fixture candidate bytes", async () => {
  const adapter = new FixtureImageProviderAdapter();
  const first = await adapter.execute(
    resolved(16, 16, "fixture-a"),
    context(),
  );
  const second = await adapter.execute(
    resolved(16, 16, "fixture-b"),
    context(),
  );
  assert.notEqual(sha(first.outputs[0].bytes), sha(second.outputs[0].bytes));
});
