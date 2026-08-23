import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "evavo.tasks.json"), "utf8"));
const task = manifest.tasks?.["eva-premultiplied-alpha-interpolate"];
const toolPath = path.join(ROOT, "tools/premultiplied_alpha_interpolate.py");
const toolBytes = fs.readFileSync(toolPath);
const toolText = toolBytes.toString("utf8");

function gitBlobSha1(bytes) {
  const header = Buffer.from(`blob ${bytes.length}\0`, "utf8");
  return crypto.createHash("sha1").update(header).update(bytes).digest("hex");
}

test("EVA interpolation worker task stays exact, managed and network-disabled", () => {
  assert.ok(task);
  assert.equal(task.runtime, "python-script");
  assert.equal(task.pythonEnvironment, "image-finishing");
  assert.equal(task.entry, "tools/premultiplied_alpha_interpolate.py");
  assert.deepEqual(task.arguments, [
    "--workspace-root",
    "{{workspaceRoot}}",
    "--plan",
    "{{plan}}",
    "--plan-sha256",
    "{{planSha256}}",
    "--receipt",
    "{{receipt}}",
  ]);
  assert.equal(task.network, "disabled");
  assert.equal(task.timeoutSeconds, 3600);
  assert.deepEqual(task.parameterOutputs, ["receipt"]);
  assert.deepEqual(task.parameterSchema.required, ["workspaceRoot", "plan", "planSha256", "receipt"]);
  assert.deepEqual(task.parameterSchema.properties.workspaceRoot, {
    type: "compute-path",
    pathKind: "directory",
    access: "input",
  });
  assert.deepEqual(task.parameterSchema.properties.plan, {
    type: "compute-path",
    pathKind: "file",
    access: "input",
  });
  assert.deepEqual(task.parameterSchema.properties.receipt, {
    type: "compute-path",
    pathKind: "file",
    access: "output",
  });
  assert.equal(task.parameterSchema.properties.planSha256.pattern, "^[0-9a-f]{64}$");
});

test("EVA interpolation task stays bound to the reviewed deterministic tool bytes", () => {
  assert.equal(gitBlobSha1(toolBytes), "65232686ff5191316bb500f89fa4b955680a44d9");
  for (const marker of [
    'PLAN_SCHEMA = "evavo.premultiplied-alpha-interpolation-plan.v1"',
    'RECEIPT_SCHEMA = "evavo.premultiplied-alpha-interpolation-receipt.v1"',
    '"method": "premultiplied-alpha-linear-interpolation"',
    '"createOnlyOutput": True',
    '"sourceOverwrite": False',
    '"providerExecution": False',
    '"automaticApproval": False',
    '"candidatePromotion": False',
    '"repositoryMutation": False',
    '"publication": False',
    '"runtimeActivation": False',
    '"websiteActivation": False',
    '"forcePush": False',
  ]) {
    assert.ok(toolText.includes(marker), `missing fail-closed interpolation marker: ${marker}`);
  }
  assert.match(toolText, /Image\.blend\(before_pm, after_pm, amount\)\.convert\("RGBA"\)/u);
});
