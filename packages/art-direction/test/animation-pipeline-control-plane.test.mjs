import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  describeAnimationPipelineV1,
  executeAnimationPipelineOperationV1,
  nextAnimationPipelineActionV1,
} from "../../../tools/animation_pipeline_control_plane_v1_mcp.mjs";

const serverPath = fileURLToPath(
  new URL("../../../tools/animation_pipeline_control_plane_v1_mcp.mjs", import.meta.url),
);

function runMcp(messages, extraEnvironment = {}) {
  const result = spawnSync(process.execPath, [serverPath], {
    encoding: "utf8",
    env: {
      ...process.env,
      EVAVO_ANIMATION_PIPELINE_ROLE: "art-studio",
      ...extraEnvironment,
    },
    input: `${messages.map((message) => JSON.stringify(message)).join("\n")}\n`,
  });
  return {
    ...result,
    messages: result.stdout
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line)),
  };
}

test("routes Art Studio through production and stops at separate creative approval", () => {
  assert.equal(describeAnimationPipelineV1("art-studio").authority.gitPush, false);
  assert.equal(nextAnimationPipelineActionV1({}).action, "compile-animation-production-profile");
  assert.equal(
    nextAnimationPipelineActionV1({
      profileStatus: "verified",
      reviewStatus: "accepted",
      reviewReceiptStatus: "verified",
    }).status,
    "awaiting-authority",
  );
});

test("loads the real canonical Art Studio profile verifier", async () => {
  await assert.rejects(
    executeAnimationPipelineOperationV1(
      "art-studio",
      "verify_animation_production_profile_v1",
      { profile: { bad: true } },
    ),
    (error) => {
      assert.doesNotMatch(
        String(error?.message),
        /CANONICAL_(?:MODULE|FUNCTION)_MISSING/,
      );
      return true;
    },
  );
});

test("registers role-safe MCP tools in the default control plane", () => {
  const config = JSON.parse(
    readFileSync(new URL("../../../.mcp.json", import.meta.url), "utf8"),
  );
  const registration = config.mcpServers["evavo-animation-pipeline-v1"];
  assert.equal(registration.env.EVAVO_ANIMATION_PIPELINE_ROLE, "art-studio");
  assert.equal(registration.env.EVAVO_ANIMATION_GIT_PUSH_ENABLED, "disabled");
  const result = runMcp([
    {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-03-26" },
    },
    { jsonrpc: "2.0", id: 2, method: "tools/list" },
    {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "next_animation_pipeline_action_v1",
        arguments: { state: { profileStatus: "verified", reviewStatus: "missing" } },
      },
    },
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    result.messages[0].result.serverInfo.name,
    "evavo-animation-pipeline-art-studio",
  );
  assert.ok(
    result.messages[1].result.tools.some(
      (tool) => tool.name === "compile_animation_production_profile_v1",
    ),
  );
  assert.equal(
    result.messages[2].result.structuredContent.ownerRole,
    "cel-animation-studio",
  );
});

test("fails closed if provider or Git authority is enabled", () => {
  const result = runMcp([], {
    EVAVO_ANIMATION_PROVIDER_EXECUTION_ENABLED: "enabled",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /UNSAFE_AUTHORITY_ENABLED/);
});
