#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const checkPath = fileURLToPath(
  new URL("../../../scripts/check-animation-character-family-v1.mjs", import.meta.url),
);

test("the normal Art Direction suite verifies the complete character-family runtime", () => {
  const result = spawnSync(process.execPath, [checkPath], {
    encoding: "utf8",
    shell: false,
    maxBuffer: 32 * 1024 * 1024,
  });

  assert.equal(
    result.status,
    0,
    `${result.stdout ?? ""}${result.stderr ?? ""}`.trim(),
  );

  const lines = (result.stdout ?? "").trim().split(/\r?\n/u).filter(Boolean);
  const receipt = JSON.parse(lines.at(-1) ?? "{}");
  assert.equal(receipt.schema, "evavo.animation-character-family-check.v1");
  assert.equal(receipt.status, "passed");
  assert.equal(receipt.providerExecution, false);
  assert.equal(receipt.creativeApproval, false);
  assert.equal(receipt.runtimeActivation, false);
  assert.equal(receipt.publication, false);
});
