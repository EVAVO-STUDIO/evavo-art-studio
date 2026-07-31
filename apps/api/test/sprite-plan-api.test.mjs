import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createArtStudioApiServer } from "../dist/index.js";

async function withServer(run) {
  const server = createArtStudioApiServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

async function example() {
  return JSON.parse(
    await readFile(
      new URL("../../../examples/sprite-plan-isometric-playable-character.json", import.meta.url),
      "utf8",
    ),
  );
}

test("sprite planning protocol and compiler expose complete provider-free coverage", async () => {
  await withServer(async (base) => {
    const protocol = await fetch(`${base}/v1/sprite-plan-protocol`);
    assert.equal(protocol.status, 200);
    const protocolBody = await protocol.json();
    assert.equal(protocolBody.protocolVersion, "2026-07-31.1");
    assert.ok(protocolBody.roles.includes("playable-character"));
    assert.ok(protocolBody.directionRules.some((entry) => entry.includes("eight")));
    assert.ok(protocolBody.sourceRules.some((entry) => entry.includes("sole source")));

    const compiled = await fetch(`${base}/v1/sprite-plans/compile`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(await example()),
    });
    assert.equal(compiled.status, 200);
    const body = await compiled.json();
    assert.equal(body.compiledPlan.directions.length, 8);
    assert.equal(
      body.compiledPlan.directions.every((entry) => entry.authored),
      true,
    );
    assert.ok(
      body.compiledPlan.clips.some((entry) => entry.id === "ship-rigging-swing"),
    );
    assert.ok(body.compiledPlan.totals.runtimeFrames > 500);
    assert.ok(body.compiledPlan.sheets.length > body.compiledPlan.clips.length);
    assert.ok(body.compiledPlan.godot.animations.length > 0);
    assert.equal(body.compiledJob.runtimeJob.kind, "art.sprite-plan.compile");
    assert.equal(body.compiledJob.runtimeJob.queue, "control");
    assert.match(body.executionBoundary, /does not generate images/i);
  });
});

test("sprite planning validation rejects incomplete or incompatible requests", async () => {
  await withServer(async (base) => {
    const input = await example();
    input.artDirectionRequest.project.worldScale.tileWidthPixels = 60;
    const response = await fetch(`${base}/v1/sprite-plans/validate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    assert.equal(response.status, 422);
    const body = await response.json();
    assert.equal(body.error.code, "SPRITE_PLAN_ART_DIRECTION_COMPILE_FAILED");
    assert.match(body.error.message, /2:1/i);
  });
});
