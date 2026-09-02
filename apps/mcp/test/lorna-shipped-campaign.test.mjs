import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const MANIFEST_PATH = path.join(REPO_ROOT, "examples", "local-generation-campaign.lorna.json");

test("shipped Lorna strip-poker campaign remains an exact ten-frame local acceptance fixture", async () => {
  const document = JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
  assert.equal(document.schema, "evavo.local-generation-campaign.v1");
  assert.equal(document.campaignId, "lorna-strip-poker-test");
  assert.equal(document.contentClass, "mature-nonexplicit");
  assert.equal(document.subject.minimumAge, 28);
  assert.equal(document.provider.baseUrl, "http://127.0.0.1:8188");
  assert.equal(document.defaults.candidateCount, 1);
  assert.equal(document.defaults.target.outputFormat, "png");
  assert.equal(document.scenes.length, 10);

  const ids = document.scenes.map((scene) => scene.id);
  assert.equal(new Set(ids).size, 10, "scene IDs must remain unique");
  assert.deepEqual(
    document.scenes.map((scene) => scene.seed),
    Array.from({ length: 10 }, (_, index) => 187100 + index),
  );
  for (const scene of document.scenes) {
    assert.match(scene.negativePrompt, /minor|teen/u);
    assert.match(scene.negativePrompt, /nipple|areola/u);
    assert.match(scene.negativePrompt, /genital/u);
    assert.match(scene.negativePrompt, /explicit/u);
  }

  const boundary = document.scenes.slice(3, 6).map((scene) => scene.prompt).join("\n");
  assert.match(boundary, /tiny opaque .*pasties/u);
  assert.match(boundary, /tassels/u);
  assert.match(boundary, /sideboob/u);
  assert.match(boundary, /underboob/u);
  assert.match(boundary, /micro-thong|coverage panel/u);
  assert.match(boundary, /nipples and areolae remain completely covered|covering nipple and areola areas|fully covers all genital anatomy/u);

  const finalStages = document.scenes.slice(6);
  assert.equal(finalStages.length, 4);
  for (const scene of finalStages) {
    assert.match(scene.prompt, /implied|obscure|hide/u);
    assert.match(scene.exclude.join(" "), /visible nipple/u);
    assert.match(scene.exclude.join(" "), /visible genital/u);
  }
});
