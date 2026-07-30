import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { validateSpriteFamilyManifest } from "../dist/index.js";

test("published runtime sprite-family example stays executable and lineage-complete", async () => {
  const job = JSON.parse(
    await readFile(
      new URL("../../../examples/runtime-sprite-family-job.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(job.queue, "selection");
  assert.equal(job.kind, "sprite.family.verify");
  const manifest = validateSpriteFamilyManifest(job.payload);
  const declared = new Set(job.inputArtifacts);
  const required = new Set(
    manifest.frames.flatMap((frame) => [
      ...frame.layers.map((layer) => layer.artifactId),
      ...(frame.declaredCompositeArtifactId
        ? [frame.declaredCompositeArtifactId]
        : []),
    ]),
  );
  assert.deepEqual([...declared].sort(), [...required].sort());
  assert.deepEqual(job.requiredCapabilities, [
    "sprite.family.verify",
    "media.layer-compose",
    "selection.compare",
    "evidence.bundle",
  ]);
  const normal = manifest.layerDefinitions.find((layer) => layer.id === "normal");
  assert.equal(normal.sourcePolicy, "engine-sidecar");
  assert.equal(normal.contributesToComposite, false);
  assert.equal(normal.contributesToIdentity, false);
});
