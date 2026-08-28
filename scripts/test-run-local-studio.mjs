import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  STACK_LOCK_RELATIVE_PATH,
  acquireStackLock,
  buildStackPlan,
  inspectStackLock,
  parseServiceSelection,
  portAvailable,
  releaseStackLock,
} from "./run-local-studio.mjs";

function fixture() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "evavo-local-stack-"));
}

test("service selection defaults to the complete local stack and rejects ambiguity", () => {
  assert.deepEqual(parseServiceSelection(), ["web", "api", "worker"]);
  assert.deepEqual(parseServiceSelection("worker,web"), ["web", "worker"]);
  assert.throws(() => parseServiceSelection("web,web"), /duplicates/u);
  assert.throws(() => parseServiceSelection("web,cloud"), /unsupported local service/u);
  assert.throws(() => parseServiceSelection(","), /at least one local service/u);
});

test("stack planning builds shared packages once and does not require hosted execution", () => {
  const plan = buildStackPlan({ services: "web,api,worker" });
  assert.equal(plan.buildCommands.filter((entry) => entry.args.includes("build:domain")).length, 1);
  assert.ok(
    plan.buildCommands.some(
      (entry) => entry.executable === process.execPath && entry.args.join(" ") === "scripts/check-local-storage-headroom.mjs",
    ),
  );
  assert.equal(plan.authority.githubActionsRequired, false);
  assert.equal(plan.authority.vercelRequired, false);
  assert.equal(plan.authority.deployment, false);
  assert.deepEqual(
    plan.servicePlans.map((entry) => entry.id),
    ["web", "api", "worker"],
  );
  assert.equal(plan.servicePlans.find((entry) => entry.id === "web").readiness.port, 4200);
  assert.equal(plan.servicePlans.find((entry) => entry.id === "api").readiness.port, 4100);
  assert.deepEqual(plan.servicePlans.find((entry) => entry.id === "worker").command, [
    process.execPath,
    "scripts/run-local-worker.mjs",
    "daemon",
  ]);
});

test("no-build planning is explicit and leaves service commands intact", () => {
  const plan = buildStackPlan({ services: "api", build: false });
  assert.equal(plan.build, false);
  assert.deepEqual(plan.buildCommands, []);
  assert.deepEqual(plan.servicePlans[0].command, [
    "pnpm",
    "--filter",
    "@evavo/art-studio-api",
    "dev",
  ]);
});

test("stack locks reject a second active supervisor and release only by ownership", () => {
  const root = fixture();
  try {
    const lock = acquireStackLock(root, ["api"]);
    assert.equal(inspectStackLock(root).active, true);
    assert.throws(() => acquireStackLock(root, ["worker"]), /already active/u);
    assert.equal(releaseStackLock(root, "not-owner"), false);
    assert.equal(releaseStackLock(root, lock.runId), true);
    assert.equal(inspectStackLock(root).exists, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("stale locks are replaced safely without accepting linked lock files", () => {
  const root = fixture();
  try {
    const lockPath = path.join(root, STACK_LOCK_RELATIVE_PATH);
    fs.mkdirSync(path.dirname(lockPath), { recursive: true });
    fs.writeFileSync(
      lockPath,
      `${JSON.stringify({
        schema: "evavo.art-studio.local-stack-lock.v1",
        runId: "stale",
        pid: 2_147_483_647,
        startedAt: "2026-08-28T00:00:00.000Z",
        services: ["api"],
        children: {},
      })}\n`,
    );
    assert.equal(inspectStackLock(root).stale, true);
    const replacement = acquireStackLock(root, ["worker"]);
    assert.notEqual(replacement.runId, "stale");
    assert.equal(releaseStackLock(root, replacement.runId), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("port preflight distinguishes an occupied local port", async () => {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.equal(typeof address, "object");
    assert.equal(await portAvailable("127.0.0.1", address.port), false);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});
