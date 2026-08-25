import assert from "node:assert/strict";
import test from "node:test";

import { compileAsepriteInterchangePlan } from "../dist/index.js";

function request(overrides = {}) {
  return {
    executable: {
      path: "C:\\Tools\\Aseprite\\aseprite.exe",
      version: "1.3.14.4",
      sha256: "a".repeat(64),
    },
    sourcePath: "C:\\Art\\hero.aseprite",
    sheetPath: "C:\\Art\\exports\\hero.png",
    dataPath: "C:\\Art\\exports\\hero.json",
    sheetType: "packed",
    tag: "walk-right",
    borderPadding: 2,
    shapePadding: 2,
    innerPadding: 1,
    trim: true,
    extrude: true,
    mergeDuplicates: false,
    ...overrides,
  };
}

test("compiles a fixed batch-mode Aseprite sheet and metadata invocation", () => {
  const plan = compileAsepriteInterchangePlan(request());
  assert.match(plan.planSha256, /^[a-f0-9]{64}$/);
  assert.equal(plan.outputs.createOnly, true);
  assert.equal(plan.authority.processExecution, false);
  assert.equal(plan.authority.sourceOverwrite, false);
  assert.deepEqual(plan.arguments.slice(0, 6), [
    "-b",
    "--list-tags",
    "--list-slices",
    "--tag",
    "walk-right",
    "C:\\Art\\hero.aseprite",
  ]);
  for (const token of [
    "--tag",
    "--list-tags",
    "--list-slices",
    "--format",
    "json-array",
    "--sheet-type",
    "packed",
    "--trim",
    "--extrude",
    "--sheet",
    "--data",
  ]) {
    assert.ok(plan.arguments.includes(token), `missing ${token}`);
  }
  assert.equal(plan.arguments.includes("--script"), false);
  assert.equal(plan.arguments.includes("--shell"), false);
});

test("fails closed on unsafe identities, formats and arbitrary values", () => {
  assert.throws(
    () => compileAsepriteInterchangePlan(request({ executable: { ...request().executable, sha256: "bad" } })),
    /executable\.sha256/,
  );
  assert.throws(
    () => compileAsepriteInterchangePlan(request({ sourcePath: "C:\\Art\\hero.png" })),
    /\.ase or \.aseprite/,
  );
  assert.throws(
    () => compileAsepriteInterchangePlan(request({ sheetPath: "C:\\Art\\hero.webp" })),
    /sheetPath must end in \.png/,
  );
  assert.throws(
    () => compileAsepriteInterchangePlan(request({ sheetType: "magic" })),
    /sheetType is unsupported/,
  );
  assert.throws(
    () => compileAsepriteInterchangePlan(request({ innerPadding: 999 })),
    /integer from 0 to 256/,
  );
});

test("changes the plan identity when export semantics change", () => {
  const first = compileAsepriteInterchangePlan(request());
  const second = compileAsepriteInterchangePlan(request({ trim: false }));
  assert.notEqual(first.planSha256, second.planSha256);
});
