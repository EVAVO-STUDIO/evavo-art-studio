import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";
import test from "node:test";

import { FixtureImageProviderAdapter } from "../dist/index.js";

function chunks(png) {
  const rows = [];
  let offset = 8;
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.subarray(offset + 4, offset + 8).toString("ascii");
    const data = png.subarray(offset + 8, offset + 8 + length);
    rows.push({ type, data });
    offset += 12 + length;
  }
  return rows;
}

function decodeFixture(png) {
  assert.deepEqual(
    [...png.subarray(0, 8)],
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  );
  const rows = chunks(png);
  const ihdr = rows.find((entry) => entry.type === "IHDR")?.data;
  assert.ok(ihdr);
  const width = ihdr.readUInt32BE(0);
  const height = ihdr.readUInt32BE(4);
  assert.equal(ihdr[8], 8);
  assert.equal(ihdr[9], 6);
  const raw = inflateSync(
    Buffer.concat(
      rows.filter((entry) => entry.type === "IDAT").map((entry) => entry.data),
    ),
  );
  const rowBytes = width * 4;
  const pixel = (x, y) => {
    const rowOffset = y * (rowBytes + 1);
    assert.equal(raw[rowOffset], 0);
    const offset = rowOffset + 1 + x * 4;
    return [...raw.subarray(offset, offset + 4)];
  };
  return { width, height, pixel };
}

async function execute({ strategy, matteColour, transparency }) {
  const adapter = new FixtureImageProviderAdapter();
  const request = {
    requestId: `fixture-${strategy}-${transparency}`,
    seed: 42,
    candidateCount: 1,
    target: { width: 32, height: 16, transparency },
    background: {
      strategy,
      ...(matteColour ? { matteColour } : {}),
    },
  };
  const result = await adapter.execute(
    {
      request,
      requestSha256: "1".repeat(64),
      compiledPrompt: "Fixture background contract.",
      compiledPromptSha256: "2".repeat(64),
      references: [],
    },
    {
      signal: new AbortController().signal,
      requestedAt: new Date("2026-08-30T00:00:00.000Z"),
    },
  );
  return { result, decoded: decodeFixture(result.outputs[0].bytes) };
}

test("chroma-key fixture uses an opaque requested matte around the candidate", async () => {
  const { result, decoded } = await execute({
    strategy: "chroma-key",
    matteColour: "#00ff00",
    transparency: "required",
  });
  assert.equal(decoded.width, 32);
  assert.equal(decoded.height, 16);
  assert.deepEqual(decoded.pixel(0, 0), [0, 255, 0, 255]);
  assert.equal(decoded.pixel(16, 8)[3], 255);
  assert.notDeepEqual(decoded.pixel(16, 8).slice(0, 3), [0, 255, 0]);
  assert.equal(result.outputs[0].metadata.fixtureBackgroundMode, "chroma-key");
});

test("native-alpha fixture uses transparent borders and opaque subject pixels", async () => {
  const { result, decoded } = await execute({
    strategy: "native-alpha",
    transparency: "required",
  });
  assert.deepEqual(decoded.pixel(0, 0), [0, 0, 0, 0]);
  assert.equal(decoded.pixel(16, 8)[3], 255);
  assert.equal(result.outputs[0].metadata.fixtureBackgroundMode, "native-alpha");
});

test("opaque-source fixture never emits transparent pixels", async () => {
  const { result, decoded } = await execute({
    strategy: "opaque-source",
    transparency: "opaque",
  });
  for (let y = 0; y < decoded.height; y += 1) {
    for (let x = 0; x < decoded.width; x += 1) {
      assert.equal(decoded.pixel(x, y)[3], 255);
    }
  }
  assert.equal(result.outputs[0].metadata.fixtureBackgroundMode, "opaque");
});

test("fixture bytes are deterministic but change with candidate identity", async () => {
  const adapter = new FixtureImageProviderAdapter();
  const make = async (requestId) => {
    const result = await adapter.execute(
      {
        request: {
          requestId,
          seed: 42,
          candidateCount: 1,
          target: { width: 16, height: 16, transparency: "opaque" },
          background: { strategy: "opaque-source" },
        },
        requestSha256: "3".repeat(64),
        compiledPrompt: "Fixture identity.",
        compiledPromptSha256: "4".repeat(64),
        references: [],
      },
      {
        signal: new AbortController().signal,
        requestedAt: new Date("2026-08-30T00:00:00.000Z"),
      },
    );
    return result.outputs[0].bytes;
  };
  const first = await make("fixture-a");
  const repeated = await make("fixture-a");
  const second = await make("fixture-b");
  assert.deepEqual(first, repeated);
  assert.notDeepEqual(first, second);
});
