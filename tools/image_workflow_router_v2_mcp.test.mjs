import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const serverPath = fileURLToPath(new URL("./image_workflow_router_v2_mcp.mjs", import.meta.url));
const repoRoot = path.resolve(path.dirname(serverPath), "..");

async function call(name, args = {}) {
  const child = spawn(process.execPath, [serverPath], {
    cwd: repoRoot,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const stdout = [];
  const stderr = [];
  child.stdout.on("data", (chunk) => stdout.push(chunk));
  child.stderr.on("data", (chunk) => stderr.push(chunk));
  child.stdin.end(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } })}\n`);
  const exitCode = await new Promise((resolve) => child.on("close", resolve));
  assert.equal(exitCode, 0, Buffer.concat(stderr).toString("utf8"));
  return JSON.parse(Buffer.concat(stdout).toString("utf8").trim()).result;
}

test("capabilities expose fifteen goals without gaining image/write/execution authority", async () => {
  const response = await call("evavo_image_workflow_router_v2_capabilities");
  assert.equal(response.isError, false);
  assert.equal(response.structuredContent.goalCount, 15);
  assert.ok(response.structuredContent.goals.includes("delivery-preflight"));
  assert.ok(response.structuredContent.integrates.some((item) => /byte-bound provenance evidence/.test(item)));
  assert.equal(response.structuredContent.guarantees.readsImageBytes, false);
  assert.equal(response.structuredContent.guarantees.writesFiles, false);
  assert.equal(response.structuredContent.guarantees.executesProcesses, false);
  assert.equal(response.structuredContent.guarantees.carriesApprovalAuthority, false);
  assert.equal(response.structuredContent.guarantees.preservesV1RouterCompatibility, true);
  assert.equal(response.structuredContent.guarantees.claimsAiOriginDetection, false);
});

test("frame consistency resolves to the sequence finishing surface", async () => {
  const response = await call("evavo_route_image_workflow_v2", { goal: "frame-consistency" });
  assert.equal(response.isError, false);
  assert.equal(response.structuredContent.contract, "evavo.image-agent-route.v2");
  assert.equal(response.structuredContent.preferredSurface, "evavo-image-sequence-finishing");
  assert.equal(response.structuredContent.steps[0].tool, "evavo_review_image_sequence_finishing");
  assert.ok(response.structuredContent.steps.some((step) => step.tool === "evavo_create_image_finishing_batch_proof"));
});

test("artifact assessment routes actual origin evidence through the governed provenance surface", async () => {
  const response = await call("evavo_route_image_workflow_v2", { goal: "ai-artifact-assessment" });
  assert.equal(response.isError, false);
  const provenance = response.structuredContent.steps.find((step) => step.tool === "evavo_review_image_provenance");
  assert.ok(provenance);
  assert.equal(provenance.surface, "evavo-image-provenance");
  assert.equal(provenance.privilege, "read-only");
  assert.match(response.structuredContent.preferredSurface, /evavo-image-provenance/);
  assert.match(response.structuredContent.stopConditions.join(" "), /invalid or contradictory provenance/);
  assert.match(response.structuredContent.invariants.join(" "), /exact image SHA-256/);
  assert.ok(!response.structuredContent.steps.some((step) => step.tool === "review-origin-evidence"));
});

test("delivery preflight and finalization resolve to their modern dedicated surfaces", async () => {
  const delivery = await call("evavo_route_image_workflow_v2", { goal: "delivery-preflight" });
  assert.equal(delivery.isError, false);
  assert.equal(delivery.structuredContent.preferredSurface, "evavo-image-delivery-integrity");
  assert.equal(delivery.structuredContent.steps[0].tool, "evavo_review_image_delivery_integrity");

  const finalization = await call("evavo_route_image_workflow_v2", { goal: "finalize-image" });
  assert.equal(finalization.isError, false);
  assert.equal(finalization.structuredContent.preferredSurface, "evavo-image-finalization");
  assert.equal(finalization.structuredContent.steps[0].tool, "evavo_review_image_finalization");
  assert.match(finalization.structuredContent.invariants.join(" "), /not approval/);
});

test("texture native validation remains execution-gated", async () => {
  const response = await call("evavo_route_image_workflow_v2", { goal: "texture-review" });
  assert.equal(response.isError, false);
  const native = response.structuredContent.steps.find((step) => step.tool === "evavo_validate_godot_material_resource");
  assert.ok(native);
  assert.equal(native.privilege, "execution-gated");
});

test("unknown goals fail closed", async () => {
  const response = await call("evavo_route_image_workflow_v2", { goal: "invented-workflow" });
  assert.equal(response.isError, true);
  assert.match(response.structuredContent.message, /Unknown image agent v2 goal/);
});