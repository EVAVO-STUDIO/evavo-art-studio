import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));

async function packageDocument() {
  return JSON.parse(
    await readFile(path.join(repositoryRoot, "package.json"), "utf8"),
  );
}

test("Art Studio exposes the governed Animation Source Bundle commands", async () => {
  const document = await packageDocument();
  assert.equal(
    document.scripts["animation-source"],
    "node scripts/animation-source-bundle.mjs",
  );
  assert.equal(
    document.scripts["animation-source:contract:check"],
    "node scripts/check-animation-source-contract-lock.mjs",
  );
  assert.equal(
    document.scripts["animation-source:check"],
    "node scripts/check-animation-source-bundle.mjs && node scripts/check-animation-source-contract-lock.mjs",
  );
});

test("the complete local check cannot skip animation source governance", async () => {
  const document = await packageDocument();
  assert.match(
    document.scripts.check,
    /pnpm run ci:media-tools:test && pnpm run animation-source:check/u,
  );
  assert.match(
    document.scripts["ci:media-tools:test"],
    /test-ci-media-tool-\*\.mjs/u,
  );
  for (const forbidden of [
    "workflow_dispatch",
    "vercel",
    "git push",
    "git commit",
    "--force",
  ]) {
    assert.doesNotMatch(
      document.scripts["animation-source:check"],
      new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "u"),
    );
  }
});
