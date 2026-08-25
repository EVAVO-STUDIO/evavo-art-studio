import assert from "node:assert/strict";
import test from "node:test";

import {
  compileAsepriteInterchangePlan,
  compileAsepriteInterchangeReceipt,
} from "../dist/index.js";

const sha = (hex) => hex.repeat(64);
const encoder = new TextEncoder();

function plan() {
  return compileAsepriteInterchangePlan({
    executable: {
      path: "C:\\Tools\\Aseprite\\aseprite.exe",
      version: "1.3.14.4",
      sha256: sha("a"),
    },
    sourcePath: "C:\\Art\\hero.aseprite",
    sourceSha256: sha("b"),
    sheetPath: "C:\\Art\\exports\\hero.png",
    dataPath: "C:\\Art\\exports\\hero.json",
    tag: "walk-right",
    sheetType: "packed",
    borderPadding: 2,
    shapePadding: 2,
    innerPadding: 1,
    trim: true,
    extrude: true,
  });
}

function metadata(overrides = {}) {
  return {
    frames: [
      { filename: "hero-000.png", duration: 125 },
      { filename: "hero-001.png", duration: 125 },
    ],
    meta: {
      frameTags: [
        { name: "walk-right", from: 0, to: 1, direction: "forward" },
      ],
      slices: [{ name: "pivot" }],
    },
    ...overrides,
  };
}

function evidence(overrides = {}) {
  return {
    executable: {
      path: "C:\\Tools\\Aseprite\\aseprite.exe",
      version: "1.3.14.4",
      sha256: sha("a"),
    },
    sourceSha256: sha("b"),
    sheet: {
      path: "C:\\Art\\exports\\hero.png",
      bytes: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]),
    },
    data: {
      path: "C:\\Art\\exports\\hero.json",
      bytes: encoder.encode(JSON.stringify(metadata())),
    },
    exitCode: 0,
    stdoutSha256: sha("c"),
    stderrSha256: sha("d"),
    ...overrides,
  };
}

test("binds exact Aseprite output bytes, durations, tags and slices", () => {
  const receipt = compileAsepriteInterchangeReceipt(plan(), evidence());
  assert.match(receipt.receiptSha256, /^[a-f0-9]{64}$/);
  assert.equal(receipt.sourceSha256, sha("b"));
  assert.deepEqual(receipt.frames, [
    { filename: "hero-000.png", durationMs: 125 },
    { filename: "hero-001.png", durationMs: 125 },
  ]);
  assert.equal(receipt.frameTags[0].name, "walk-right");
  assert.equal(receipt.slices[0].name, "pivot");
  assert.equal(receipt.outputs.sheet.bytes, 12);
  assert.equal(receipt.authority.creativeApproval, false);
});

test("rejects source substitution, wrong executable and malformed outputs", () => {
  assert.throws(
    () => compileAsepriteInterchangeReceipt(plan(), evidence({ sourceSha256: sha("e") })),
    /source bytes differ/,
  );
  assert.throws(
    () =>
      compileAsepriteInterchangeReceipt(
        plan(),
        evidence({ executable: { ...evidence().executable, version: "different" } }),
      ),
    /executable identity differs/,
  );
  assert.throws(
    () =>
      compileAsepriteInterchangeReceipt(
        plan(),
        evidence({ sheet: { ...evidence().sheet, bytes: new Uint8Array([1, 2, 3]) } }),
      ),
    /too short to be a PNG|PNG signature/,
  );
  assert.throws(
    () =>
      compileAsepriteInterchangeReceipt(
        plan(),
        evidence({ data: { ...evidence().data, bytes: encoder.encode("not-json") } }),
      ),
    /not valid UTF-8 JSON/,
  );
});

test("rejects missing planned tags and invalid frame duration metadata", () => {
  const missingTag = metadata({
    meta: { frameTags: [{ name: "idle", from: 0, to: 1 }], slices: [] },
  });
  assert.throws(
    () =>
      compileAsepriteInterchangeReceipt(
        plan(),
        evidence({ data: { ...evidence().data, bytes: encoder.encode(JSON.stringify(missingTag)) } }),
      ),
    /planned tag walk-right is absent/,
  );

  const badDuration = metadata();
  badDuration.frames[1].duration = 0;
  assert.throws(
    () =>
      compileAsepriteInterchangeReceipt(
        plan(),
        evidence({ data: { ...evidence().data, bytes: encoder.encode(JSON.stringify(badDuration)) } }),
      ),
    /duration.*positive integer/,
  );
});
