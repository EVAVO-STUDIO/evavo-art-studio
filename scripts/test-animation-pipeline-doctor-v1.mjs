import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  inspectAnimationPipelineV1,
  planAnimationPipelineRepairsV1,
  verifyAnimationPipelineV1,
} from "../tools/animation_pipeline_doctor_v1.mjs";

const mcpPath = fileURLToPath(new URL("../tools/animation_pipeline_doctor_v1_mcp.mjs", import.meta.url));
const flags = [
  "EVAVO_ANIMATION_PROVIDER_EXECUTION_ENABLED",
  "EVAVO_ANIMATION_AUTOMATIC_CREATIVE_APPROVAL_ENABLED",
  "EVAVO_ANIMATION_ARTIFACT_PROMOTION_ENABLED",
  "EVAVO_ANIMATION_TARGET_REPOSITORY_MUTATION_ENABLED",
  "EVAVO_ANIMATION_GIT_COMMIT_ENABLED",
  "EVAVO_ANIMATION_GIT_PUSH_ENABLED",
  "EVAVO_ANIMATION_RUNTIME_ACTIVATION_ENABLED",
  "EVAVO_ANIMATION_PUBLICATION_ENABLED",
];
const sha = (value) => createHash("sha256").update(value).digest("hex");
async function put(root, path, value) {
  const absolute = join(root, path);
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`);
}
function config(role) {
  return { mcpServers: { "evavo-animation-pipeline-v1": { command: "node", args: ["tools/animation_pipeline_control_plane_v1_1_mcp.mjs"], env: { EVAVO_ANIMATION_PIPELINE_ROLE: role, ...Object.fromEntries(flags.map((flag) => [flag, "disabled"])) } } } };
}
async function fixture() {
  const base = await mkdtemp(join(tmpdir(), "evavo-animation-doctor-"));
  const roots = { artStudioRoot: join(base, "art"), celAnimationStudioRoot: join(base, "cel"), videoStudioRoot: join(base, "video") };
  const byRole = { "art-studio": roots.artStudioRoot, "cel-animation-studio": roots.celAnimationStudioRoot, "video-studio": roots.videoStudioRoot };
  const v1 = "export const legacy = true;\n";
  const v11 = "export const hardened = true;\n";
  const delivery = "export const delivery = true;\n";
  const receipt = "export const receipt = true;\n";
  const ledger = "export const ledger = true;\n";
  for (const [role, root] of Object.entries(byRole)) {
    await put(root, ".mcp.json", config(role));
    await put(root, ".mcp.animation-pipeline-v1.json", config(role));
    await put(root, "tools/animation_pipeline_control_plane_v1_mcp.mjs", v1);
    await put(root, "tools/animation_pipeline_control_plane_v1_1_mcp.mjs", v11);
    await put(root, "tools/animation_sequence_delivery_canonical_v1.mjs", delivery);
    await put(root, "contracts/animation-pipeline-control-plane-v1.lock.json", { implementationPath: "tools/animation_pipeline_control_plane_v1_1_mcp.mjs", sha256: `sha256:${sha(v11)}` });
  }
  await put(roots.artStudioRoot, "tools/animation_production_profile_canonical_v1.mjs", "export {};\n");
  await put(roots.artStudioRoot, "tools/animation_production_review_receipt_canonical_v1.mjs", receipt);
  await put(roots.artStudioRoot, "tools/animation_frame_work_ledger_v1.mjs", ledger);
  await put(roots.celAnimationStudioRoot, "tools/animation_production_profile_review_canonical_v1.mjs", "export {};\n");
  await put(roots.celAnimationStudioRoot, "tools/animation_production_review_receipt_canonical_v1.mjs", receipt);
  await put(roots.celAnimationStudioRoot, "tools/animation_frame_work_ledger_v1.mjs", ledger);
  return { base, roots };
}
async function usingFixture(callback) {
  const value = await fixture();
  try { return await callback(value); }
  finally { await rm(value.base, { recursive: true, force: true }); }
}

test("reports a locked cross-studio fixture as ready", async () => {
  await usingFixture(async ({ roots }) => {
    const report = await inspectAnimationPipelineV1({ repositoryRoots: roots });
    assert.equal(report.status, "ready");
    assert.equal(report.summary.blocking, 0);
    assert.equal((await verifyAnimationPipelineV1({ repositoryRoots: roots })).reportDigest, report.reportDigest);
    assert.equal(planAnimationPipelineRepairsV1(report).status, "no-repair-required");
  });
});

test("detects shared drift and stale locks", async () => {
  await usingFixture(async ({ roots }) => {
    await put(roots.celAnimationStudioRoot, "tools/animation_pipeline_control_plane_v1_1_mcp.mjs", "export const hardened = false;\n");
    const report = await inspectAnimationPipelineV1({ repositoryRoots: roots });
    assert.equal(report.status, "blocked");
    assert.ok(report.findings.some((item) => item.code === "SHARED_IMPLEMENTATION_DRIFT"));
    assert.ok(report.findings.some((item) => item.code === "ANIMATION_LOCK_DIGEST_MISMATCH"));
    await assert.rejects(verifyAnimationPipelineV1({ repositoryRoots: roots }), /ANIMATION_PIPELINE_DOCTOR_BLOCKED/);
  });
});

test("detects unsafe MCP authority", async () => {
  await usingFixture(async ({ roots }) => {
    const bad = config("video-studio");
    bad.mcpServers["evavo-animation-pipeline-v1"].env.EVAVO_ANIMATION_GIT_PUSH_ENABLED = "enabled";
    await put(roots.artStudioRoot, ".mcp.json", bad);
    const report = await inspectAnimationPipelineV1({ repositoryRoots: roots });
    assert.ok(report.findings.some((item) => item.code === "PIPELINE_MCP_ROLE_INVALID"));
    assert.ok(report.findings.some((item) => item.code === "PIPELINE_MCP_AUTHORITY_NOT_DISABLED"));
  });
});

test("MCP exposes read-only tools and refuses side-effect authority", () => {
  const messages = [
    { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } },
    { jsonrpc: "2.0", id: 2, method: "tools/list" },
  ];
  const run = spawnSync(process.execPath, [mcpPath], { encoding: "utf8", input: `${messages.map(JSON.stringify).join("\n")}\n` });
  assert.equal(run.status, 0, run.stderr);
  const output = run.stdout.trim().split("\n").map(JSON.parse);
  assert.deepEqual(output[1].result.tools.map((item) => item.name), ["inspect_animation_pipeline_v1", "verify_animation_pipeline_v1", "plan_animation_pipeline_repairs_v1"]);
  const unsafe = spawnSync(process.execPath, [mcpPath], { encoding: "utf8", env: { ...process.env, EVAVO_ANIMATION_GIT_PUSH_ENABLED: "enabled" } });
  assert.equal(unsafe.status, 1);
  assert.match(unsafe.stderr, /UNSAFE_AUTHORITY_ENABLED/);
});
