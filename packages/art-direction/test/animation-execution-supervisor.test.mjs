import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const suites = [
  [
    "animation execution supervisor integrity",
    fileURLToPath(
      new URL(
        "../../../scripts/check-animation-execution-supervisor-v1.mjs",
        import.meta.url,
      ),
    ),
  ],
  [
    "animation execution supervisor lifecycle",
    fileURLToPath(
      new URL(
        "../../../scripts/test-animation-execution-supervisor-v1.mjs",
        import.meta.url,
      ),
    ),
  ],
  [
    "Art Studio animation drawing evidence",
    fileURLToPath(
      new URL(
        "../../../scripts/test-animation-execution-art-evidence-v1.mjs",
        import.meta.url,
      ),
    ),
  ],
];

for (const [name, suite] of suites) {
  test(name, () => {
    const result = spawnSync(process.execPath, [suite], {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        EVAVO_ANIMATION_EXECUTION_ENABLED: "disabled",
        EVAVO_ANIMATION_CREATIVE_APPROVAL_WRITE_ENABLED: "disabled",
      },
      shell: false,
      windowsHide: true,
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  });
}
