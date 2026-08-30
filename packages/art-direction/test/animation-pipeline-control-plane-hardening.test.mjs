import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  describeAnimationPipelineV1,
  executeAnimationPipelineOperationV1,
  nextAnimationPipelineActionV1,
} from "../../../tools/animation_pipeline_control_plane_v1_1_mcp.mjs";

const root = new URL("../../../", import.meta.url);
const serverPath = fileURLToPath(new URL("tools/animation_pipeline_control_plane_v1_1_mcp.mjs", root));

function run(messages, environment = {}) {
  return spawnSync(process.execPath, [serverPath], {
    encoding: "utf8",
    env: {...process.env, EVAVO_ANIMATION_PIPELINE_ROLE: "art-studio", ...environment},
    input: `${messages.map((message) => typeof message === "string" ? message : JSON.stringify(message)).join("\n")}\n`,
  });
}

test("locks the hardened shared implementation", () => {
  const source = readFileSync(new URL("tools/animation_pipeline_control_plane_v1_1_mcp.mjs", root));
  const lock = JSON.parse(readFileSync(new URL("contracts/animation-pipeline-control-plane-v1.lock.json", root), "utf8"));
  assert.equal(lock.implementationVersion, "1.1.0");
  assert.equal(lock.sha256, `sha256:${createHash("sha256").update(source).digest("hex")}`);
});

test("gives Art Studio production and delivery authority but not review-receipt issuance", async () => {
  const tools = describeAnimationPipelineV1("art-studio").operations;
  assert.ok(tools.includes("compile_animation_production_profile_v1"));
  assert.ok(tools.includes("compile_animation_sequence_delivery_v1"));
  assert.ok(!tools.includes("compile_animation_review_receipt_v1"));
  assert.ok(!tools.includes("create_video_studio_animation_intake_v1"));
  await assert.rejects(executeAnimationPipelineOperationV1("art-studio", "compile_animation_review_receipt_v1", {}), /OPERATION_NOT_ALLOWED_FOR_ROLE/);
});

test("rejects malformed state and preserves blocked destinations", () => {
  assert.throws(() => nextAnimationPipelineActionV1({profileStatus: "verifed"}), /PROFILE_STATUS_INVALID/);
  assert.throws(() => nextAnimationPipelineActionV1({profileStatus: "verified", pendingDrawingIds: ["frame-1", "frame-1"]}), /DUPLICATE/);
  const blocked = nextAnimationPipelineActionV1({
    profileStatus: "verified",
    reviewStatus: "accepted",
    reviewReceiptStatus: "verified",
    creativeApprovalStatus: "verified",
    deliveryStatus: "verified",
    targets: {godot: {required: true, runtimeAcceptanceStatus: "blocked"}},
  });
  assert.deepEqual({status: blocked.status, ownerRole: blocked.ownerRole}, {status: "blocked", ownerRole: "game-runtime"});
});

test("returns parse errors and refuses enabled side-effect authority", () => {
  const response = run([
    "{bad json",
    {jsonrpc: "2.0", id: 1, method: "initialize", params: {protocolVersion: "2025-03-26"}},
    {jsonrpc: "2.0", id: 2, method: "tools/list"},
  ]);
  assert.equal(response.status, 0, response.stderr);
  const messages = response.stdout.trim().split("\n").map(JSON.parse);
  assert.equal(messages[0].error.code, -32700);
  assert.equal(messages[1].result.serverInfo.version, "1.1.0");
  assert.ok(messages[2].result.tools.some((tool) => tool.name === "compile_animation_production_profile_v1"));
  const unsafe = run([], {EVAVO_ANIMATION_GIT_PUSH_ENABLED: "enabled"});
  assert.equal(unsafe.status, 1);
  assert.match(unsafe.stderr, /UNSAFE_AUTHORITY_ENABLED/);
});
