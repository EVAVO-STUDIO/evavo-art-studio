import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(ROOT);

function replaceExact(source, before, after, expectedCount, label) {
  const count = source.split(before).length - 1;
  assert.equal(count, expectedCount, `${label}: expected ${expectedCount}, found ${count}`);
  return source.split(before).join(after);
}

async function rewritePublisher({
  path: workflowPath,
  oldName,
  newName,
  oldTrigger,
  confirmation,
  checkoutName,
}) {
  const before = await readFile(workflowPath, "utf8");
  let after = before;
  after = replaceExact(after, `name: ${oldName}`, `name: ${newName}`, 1, `${workflowPath} name`);

  const trigger = `on:\n  workflow_dispatch:\n    inputs:\n      expected_sha:\n        description: Exact current main commit SHA to authorize\n        required: true\n        type: string\n      confirmation:\n        description: Type ${confirmation} to authorize repository publication\n        required: true\n        type: string`;
  after = replaceExact(after, oldTrigger, trigger, 1, `${workflowPath} trigger`);

  const oldSteps = `    steps:\n      - name: ${checkoutName}`;
  const newSteps = `    steps:\n      - name: Require explicit manual authorization\n        shell: bash\n        env:\n          EXPECTED_SHA: \${{ inputs.expected_sha }}\n          CONFIRMATION: \${{ inputs.confirmation }}\n        run: |\n          set -euo pipefail\n          test "\${GITHUB_REF}" = "refs/heads/main"\n          [[ "\${EXPECTED_SHA}" =~ ^[0-9a-f]{40}$ ]]\n          test "\${EXPECTED_SHA}" = "\${GITHUB_SHA}"\n          test "\${CONFIRMATION}" = "${confirmation}"\n\n      - name: ${checkoutName}`;
  after = replaceExact(after, oldSteps, newSteps, 1, `${workflowPath} authorization step`);

  const oldCheckout = `        with:\n          fetch-depth: 0\n          persist-credentials: true`;
  const newCheckout = `        with:\n          ref: \${{ inputs.expected_sha }}\n          fetch-depth: 0\n          persist-credentials: true`;
  after = replaceExact(after, oldCheckout, newCheckout, 1, `${workflowPath} checkout binding`);

  assert.equal(/^  push:/mu.test(after), false, `${workflowPath}: push trigger remains`);
  assert.ok(after.includes(`test "\${CONFIRMATION}" = "${confirmation}"`));
  assert.ok(after.includes("ref: ${{ inputs.expected_sha }}"));
  assert.notEqual(after, before);
  await writeFile(workflowPath, after, "utf8");
}

await rewritePublisher({
  path: ".github/workflows/finalize-pixel-typography-review.yml",
  oldName: "Finalize Pixel Typography native review tooling",
  newName: "Manual Pixel Typography native review finalization",
  oldTrigger: `on:\n  push:\n    branches: [main]\n    paths:\n      - ".github/workflows/finalize-pixel-typography-review.yml"\n  workflow_dispatch:`,
  confirmation: "FINALIZE_PIXEL_TYPOGRAPHY_REVIEW",
  checkoutName: "Check out exact staging commit",
});

await rewritePublisher({
  path: ".github/workflows/repair-pixel-typography-review.yml",
  oldName: "Ensure Pixel Typography native review publication",
  newName: "Manual Pixel Typography native review reconciliation",
  oldTrigger: `on:\n  push:\n    branches: [main]\n    paths:\n      - ".github/workflows/repair-pixel-typography-review.yml"\n  workflow_dispatch:`,
  confirmation: "RECONCILE_PIXEL_TYPOGRAPHY_REVIEW",
  checkoutName: "Check out exact source",
});

const testPath = "scripts/test-ci-media-tool-workflow-write-authority.mjs";
let testSource = await readFile(testPath, "utf8");
testSource = replaceExact(
  testSource,
  'events: ["push", "workflow_dispatch"],',
  'events: ["workflow_dispatch"],',
  2,
  "finalizer event allowlists",
);
testSource = replaceExact(
  testSource,
  '        "persist-credentials: true",\n        "git push origin HEAD:main",',
  '        "persist-credentials: true",\n        "expected_sha:",\n        "FINALIZE_PIXEL_TYPOGRAPHY_REVIEW",\n        "git push origin HEAD:main",',
  1,
  "finalizer write evidence",
);
testSource = replaceExact(
  testSource,
  '        "persist-credentials: true",\n        "git push origin HEAD:main",\n        \'test "$remote" = "$published"\',',
  '        "persist-credentials: true",\n        "expected_sha:",\n        "RECONCILE_PIXEL_TYPOGRAPHY_REVIEW",\n        "git push origin HEAD:main",\n        \'test "$remote" = "$published"\',',
  1,
  "reconciliation write evidence",
);
testSource = replaceExact(
  testSource,
  '        "persist-credentials: true",\n        "git push origin HEAD:main",\n        "Require exact current main and reviewed baseline files",',
  '        "persist-credentials: true",\n        "expected_sha:",\n        "FINALIZE_PIXEL_TYPOGRAPHY_REVIEW",\n        "git push origin HEAD:main",\n        "Require exact current main and reviewed baseline files",',
  1,
  "finalizer privileged evidence",
);
testSource = replaceExact(
  testSource,
  '        "persist-credentials: true",\n        "git push origin HEAD:main",\n        "Require explicit publication confirmation and token",',
  '        "persist-credentials: true",\n        "expected_sha:",\n        "RECONCILE_PIXEL_TYPOGRAPHY_REVIEW",\n        "git push origin HEAD:main",\n        "Require explicit manual authorization",',
  1,
  "reconciliation privileged evidence",
);

const appendedTest = `\n\ntest("repository write workflows are manual-only and SHA-confirmed", async () => {\n  const violations = [];\n  for (const workflow of await workflowSources()) {\n    if (writePermissions(workflow.source).length === 0) continue;\n    const events = exactSorted(workflowEvents(workflow.source));\n    if (events.length !== 1 || events[0] !== "workflow_dispatch") {\n      violations.push(\n        \`\${workflow.path}: write workflow events \${events.join(", ")}\`,\n      );\n    }\n    for (const evidence of [\n      "expected_sha:",\n      "confirmation:",\n      "Require explicit manual authorization",\n      "ref: \\${{ inputs.expected_sha }}",\n    ]) {\n      if (!workflow.source.includes(evidence)) {\n        violations.push(\`\${workflow.path}: missing manual guard \${evidence}\`);\n      }\n    }\n  }\n  assert.deepEqual(\n    violations,\n    [],\n    \`Repository write workflows must be manual and SHA-bound:\\n\${violations.join("\\n")}\`,\n  );\n});\n`;
assert.equal(testSource.includes('test("repository write workflows are manual-only and SHA-confirmed"'), false);
testSource += appendedTest;
await writeFile(testPath, testSource, "utf8");

process.stdout.write(
  `${JSON.stringify(
    {
      schema: "evavo.workflow-write-authority-hardening.v1",
      workflows: [
        ".github/workflows/finalize-pixel-typography-review.yml",
        ".github/workflows/repair-pixel-typography-review.yml",
      ],
      scanner: testPath,
      automaticPushTriggersRemoved: 2,
      manualShaConfirmationsAdded: 2,
    },
    null,
    2,
  )}\n`,
);
