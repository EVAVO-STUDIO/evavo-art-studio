import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const cwd = new URL("..", import.meta.url);

const request = {
  schemaVersion: "1.0",
  operation: "generate",
  assetKind: "environment",
  continuityPhase: "independent",
  assetId: "harbour-background",
  candidateFamilyId: "harbour-background-dusk",
  creativeIntent: "Create one horizontally staged harbour environment candidate.",
  style: {
    styleName: "1990s painted adventure background",
    intent: "Deliberate hand-painted forms and era-authentic value grouping.",
    mustHave: ["clear interaction lane"],
    mustAvoid: ["generic AI clutter"],
  },
  shot: {
    subject: "A nineteenth-century harbour viewed side-on.",
    include: ["broad walkable lane", "period ships"],
    exclude: ["modern containers", "readable signs"],
    separateAssets: ["foreground characters", "weather particles"],
  },
  target: {
    width: 1280,
    height: 720,
    transparency: "opaque",
    outputFormat: "png",
  },
  background: { strategy: "opaque-source" },
  candidateCount: 3,
};

test("CLI prints the provider protocol", () => {
  const result = spawnSync(process.execPath, ["dist/index.js", "provider-protocol"], {
    cwd,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.ok(parsed.operations.includes("generate"));
  assert.ok(parsed.referenceRoles.includes("canonical-identity"));
  assert.ok(parsed.capabilityVocabulary.includes("depth-control"));
  assert.equal(
    parsed.requiredReferenceCapabilities["layer-context"],
    "layer-context-reference",
  );
  assert.ok(parsed.rules.some((entry) => entry.includes("intermediate candidates")));
});

test("CLI compiles a deterministic worker-only provider contract", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-provider-cli-"));
  const input = path.join(root, "request.json");
  await writeFile(input, JSON.stringify(request));
  const first = spawnSync(
    process.execPath,
    ["dist/index.js", "provider-compile", "--input", input],
    { cwd, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
  );
  const second = spawnSync(
    process.execPath,
    ["dist/index.js", "provider-compile", "--input", input],
    { cwd, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
  );
  assert.equal(first.status, 0, first.stderr);
  assert.equal(second.status, 0, second.stderr);
  const left = JSON.parse(first.stdout);
  const right = JSON.parse(second.stdout);
  assert.equal(left.executionMode, "durable-worker-only");
  assert.deepEqual(left.requiredAdapterCapabilities, [
    "cancellation",
    "candidate-count",
    "generate",
  ]);
  assert.deepEqual(
    left.requiredAdapterCapabilities,
    right.requiredAdapterCapabilities,
  );
  assert.equal(left.requestSha256, right.requestSha256);
  assert.equal(left.compiledPromptSha256, right.compiledPromptSha256);
  assert.ok(left.compiledPrompt.includes("KEEP AS SEPARATE ASSETS OR LAYERS"));
});
