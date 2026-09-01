import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const check = fileURLToPath(
  new URL("../../../scripts/check-animation-character-family-v1.mjs", import.meta.url),
);

test("character animation family gate passes from the Art Direction package", () => {
  const result = spawnSync(process.execPath, [check], {
    cwd: root,
    encoding: "utf8",
    shell: false,
    maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(result.status, 0, `${result.stdout ?? ""}${result.stderr ?? ""}`);
});
