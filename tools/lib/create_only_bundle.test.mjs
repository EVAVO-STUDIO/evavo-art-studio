import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { writeCreateOnlyBundle } from "./create_only_bundle.mjs";

async function fixture() {
  return mkdtemp(path.join(os.tmpdir(), "evavo-create-only-bundle-"));
}

test("publishes every output without overwriting", async () => {
  const root = await fixture();
  try {
    const a = path.join(root, "a.txt");
    const b = path.join(root, "nested", "b.txt");
    const result = await writeCreateOnlyBundle([
      { path: a, data: "alpha", encoding: "utf8" },
      { path: b, data: Buffer.from("beta") },
    ]);
    assert.equal(result.createOnly, true);
    assert.equal(result.rollbackSafe, true);
    assert.equal(await readFile(a, "utf8"), "alpha");
    assert.equal(await readFile(b, "utf8"), "beta");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("refuses a bundle before publishing when any final output already exists", async () => {
  const root = await fixture();
  try {
    const a = path.join(root, "a.txt");
    const b = path.join(root, "b.txt");
    await writeFile(b, "existing", "utf8");
    await assert.rejects(() => writeCreateOnlyBundle([
      { path: a, data: "alpha", encoding: "utf8" },
      { path: b, data: "beta", encoding: "utf8" },
    ]), /refusing to overwrite existing evidence output/u);
    await assert.rejects(() => readFile(a, "utf8"), /ENOENT/u);
    assert.equal(await readFile(b, "utf8"), "existing");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
