import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const router = fileURLToPath(new URL("../dist/router-cli.js", import.meta.url));

test("router exposes the immutable targeted-repair protocol", () => {
  const result = spawnSync(process.execPath, [router, "repair-protocol"], {
    encoding: "utf8",
    shell: false,
  });
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.schemaVersion, "1.0");
  assert.ok(payload.strategies.includes("masked-provider-inpaint"));
  assert.ok(
    payload.rules.some((rule) =>
      rule.includes("Repair planning never approves assets"),
    ),
  );
});
