import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const cwd = new URL("..", import.meta.url);
const example = new URL(
  "../../../examples/sprite-supervisor-protocol.json",
  import.meta.url,
);

function run(args) {
  return spawnSync(process.execPath, ["dist/index.js", ...args], {
    cwd,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

test("CLI exposes the closed-loop sprite supervision protocol", () => {
  const result = run(["sprite-supervisor-protocol"]);
  assert.equal(result.status, 0, result.stderr);
  const body = JSON.parse(result.stdout);
  assert.equal(body.protocolVersion, "2026-08-01.2");
  assert.ok(body.schedulingRules.some((entry) => entry.includes("idempotency")));
  assert.ok(body.failureRules.some((entry) => entry.includes("review-required")));
  assert.ok(body.reviewRules.some((entry) => entry.includes("expectedStateTick")));
  assert.ok(body.reviewRules.some((entry) => entry.includes("resolutionId")));
  assert.ok(body.releaseRules.some((entry) => entry.includes("verified")));
});

test("CLI compiles a source sprite-plan request into a durable root job", () => {
  const result = run([
    "sprite-supervisor-compile",
    "--input",
    decodeURIComponent(example.pathname),
  ]);
  assert.equal(result.status, 0, result.stderr);
  const body = JSON.parse(result.stdout);
  assert.equal(body.workflow.request.spritePlan.directions.length, 8);
  assert.equal(body.workflow.rootJob.kind, "art.sprite-production.supervise");
  assert.equal(body.workflow.rootJob.queue, "control");
  assert.equal(body.workflow.rootJob.payload.requestSha256, body.workflow.requestSha256);
  assert.deepEqual(body.workflow.rootJob.requiredCapabilities, [
    "sprite.supervisor.run",
    "runtime.jobs",
    "artifacts.store",
    "evidence.bundle",
  ]);
  assert.match(body.executionBoundary, /does not execute providers/i);
});

test("CLI starts supervision only through explicit durable submission", async () => {
  const runtimeRoot = await mkdtemp(
    path.join(os.tmpdir(), "evavo-supervisor-cli-"),
  );
  try {
    const result = run([
      "sprite-supervisor-start",
      "--input",
      decodeURIComponent(example.pathname),
      "--runtime-root",
      runtimeRoot,
      "--actor",
      "cli-test",
    ]);
    assert.equal(result.status, 0, result.stderr);
    const body = JSON.parse(result.stdout);
    assert.equal(body.rootJob.spec.kind, "art.sprite-production.supervise");
    assert.equal(body.rootJob.spec.queue, "control");
    assert.equal(body.rootJob.state, "queued");
    assert.equal(body.rootJob.attempts.length, 0);
    assert.match(body.executionBoundary, /root durable supervisor job was submitted/i);
  } finally {
    await rm(runtimeRoot, { recursive: true, force: true });
  }
});
