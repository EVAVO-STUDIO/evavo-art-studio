import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalJson } from "./intake.mjs";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export function run(executable, args, options = {}) {
  const result = spawnSync(executable, args, {
    cwd: root,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
    ...options,
  });
  if (options.expectFailure) {
    assert.notEqual(result.status, 0, `Expected failure: ${executable} ${args.join(" ")}`);
  } else {
    assert.equal(
      result.status,
      0,
      `${executable} ${args.join(" ")} failed\n${result.stdout}\n${result.stderr}`,
    );
  }
  return result;
}

export function python() {
  const candidates = process.platform === "win32"
    ? [["py", ["-3"]], ["python", []], ["python3", []]]
    : [["python3", []], ["python", []], ["py", ["-3"]]];
  for (const [executable, prefix] of candidates) {
    const result = spawnSync(executable, [...prefix, "-c", "import PIL"], {
      encoding: "utf8",
      shell: false,
      windowsHide: true,
    });
    if (result.status === 0) return { executable, prefix };
  }
  if (process.env.PROJECT_ART_REQUIRE_PILLOW === "1") {
    throw new Error("No Python 3 executable with Pillow is available.");
  }
  console.log(
    "Project-art chat intake and atlas regressions skipped: Pillow unavailable; the dedicated project-art workflow requires the exact backend.",
  );
  process.exit(0);
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function verifySelfHash(value, field) {
  const expected = value[field];
  assert.match(expected, /^[a-f0-9]{64}$/u);
  const body = structuredClone(value);
  delete body[field];
  assert.equal(sha256(canonicalJson(body)), expected);
}
