import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const suite = fileURLToPath(
  new URL("../../../scripts/test-animation-pipeline-doctor-v1.mjs", import.meta.url),
);

test("animation pipeline doctor contract suite", () => {
  const result = spawnSync(process.execPath, ["--test", suite], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
