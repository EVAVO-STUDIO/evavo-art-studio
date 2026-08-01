import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const cli = new URL("../dist/cli.js", import.meta.url);

function run(arguments_) {
  return spawnSync(process.execPath, [cli.pathname, ...arguments_], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 60_000,
  });
}

const request = {
  schema: "evavo.art-godot-sprite-effect-pack.v1",
  packId: "test-effects",
  project: {
    id: "test",
    title: "Test",
    engine: "Godot",
    engineVersion: "4.6.2",
    renderer: "gl_compatibility"
  },
  effects: ["sprite_feedback", "sprite_dissolve"],
  targetRoot: ".",
  csharpNamespace: "Example.UI",
  binderClassName: "TestSpriteEffectParameters",
  binderPath: "src/UI/TestSpriteEffectParameters.cs"
};

test("CLI lists the governed effect catalog", () => {
  const result = run(["catalog"]);
  assert.equal(result.status, 0, result.stderr);
  const body = JSON.parse(result.stdout);
  assert.equal(body.schema, "evavo.art-godot-sprite-effect-catalog.v1");
  assert.ok(body.effects.some((effect) => effect.id === "sprite_feedback"));
});

test("CLI compiles without mutation in dry-run mode", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "evavo-sprite-effect-cli-"));
  try {
    const requestPath = path.join(root, "request.json");
    writeFileSync(requestPath, JSON.stringify(request));
    const result = run([
      "compile",
      "--request",
      requestPath,
      "--output-root",
      path.join(root, "output"),
      "--dry-run",
    ]);
    assert.equal(result.status, 0, result.stderr);
    const body = JSON.parse(result.stdout);
    assert.equal(body.status, "dry-run-ready");
    assert.equal(body.mutationPerformed, false);
    assert.ok(body.receipt.exactOutputPaths.includes("src/UI/TestSpriteEffectParameters.cs"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("CLI rejects ambiguous mutation mode", () => {
  const result = run([
    "compile",
    "--request",
    "missing.json",
    "--output-root",
    "missing-output",
    "--dry-run",
    "--apply",
  ]);
  assert.equal(result.status, 1);
  assert.equal(
    JSON.parse(result.stderr).error.code,
    "SPRITE_EFFECT_CLI_MODE_INVALID",
  );
});
