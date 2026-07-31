import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  compileArtDirectionContract,
  compileArtDirectionJob,
} from "../dist/index.js";

const EXAMPLES = [
  "art-direction-isometric-character.json",
  "art-direction-isometric-tile-atlas.json",
  "art-direction-prerendered-2.5d-creature.json",
  "art-direction-engraved-1871-cinematic.json",
];

async function load(name) {
  return JSON.parse(
    await readFile(new URL(`../../../examples/${name}`, import.meta.url), "utf8"),
  );
}

for (const name of EXAMPLES) {
  test(`published example compiles: ${name}`, async () => {
    const request = await load(name);
    const contract = compileArtDirectionContract(request);
    const job = compileArtDirectionJob(request);
    assert.equal(contract.schemaVersion, "1.0");
    assert.match(contract.requestSha256, /^[a-f0-9]{64}$/);
    assert.match(contract.contractSha256, /^[a-f0-9]{64}$/);
    assert.ok(contract.qualityGates.some((gate) => gate.severity === "blocking"));
    assert.ok(contract.production.layers.length >= 2);
    assert.equal(job.runtimeJob.kind, "art.direction.compile");
    assert.equal(job.executionMode, "deterministic-compile-only");
  });
}

test("isometric tile example retains collision, occlusion and terrain sidecars", async () => {
  const contract = compileArtDirectionContract(
    await load("art-direction-isometric-tile-atlas.json"),
  );
  const treatments = new Map(
    contract.production.layers.map((layer) => [layer.role, layer.treatment]),
  );
  assert.equal(treatments.get("collision"), "engine-sidecar");
  assert.equal(treatments.get("occlusion"), "engine-sidecar");
  assert.equal(treatments.get("tile-mask"), "engine-sidecar");
  assert.equal(contract.project.worldScale.tileWidthPixels, 64);
  assert.equal(contract.project.worldScale.tileHeightPixels, 32);
});

test("pre-rendered 2.5d example locks engine sidecars and render rig QA", async () => {
  const contract = compileArtDirectionContract(
    await load("art-direction-prerendered-2.5d-creature.json"),
  );
  assert.equal(contract.style.renderingMode, "pre-rendered-2.5d");
  assert.ok(contract.qualityGates.some((gate) => gate.id === "render-rig-lock"));
  for (const role of ["normal", "depth", "emission", "collision"]) {
    assert.equal(
      contract.production.layers.find((layer) => layer.role === role)?.treatment,
      "engine-sidecar",
    );
  }
});

test("engraved cinematic keeps exact monochrome and historical gates", async () => {
  const contract = compileArtDirectionContract(
    await load("art-direction-engraved-1871-cinematic.json"),
  );
  assert.equal(contract.style.palette.mode, "monochrome");
  assert.equal(contract.style.palette.maxColours, 2);
  assert.equal(contract.production.method, "cinematic-sequence");
  assert.ok(contract.qualityGates.some((gate) => gate.id === "historical-plausibility"));
  assert.ok(contract.style.references.some((reference) => reference.role === "historical"));
});
