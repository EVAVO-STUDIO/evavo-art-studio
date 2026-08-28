import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import test from "node:test";

import {
  STACK_LOCK_RELATIVE_PATH,
  acquireStackLock,
  buildStackPlan,
  inspectStackLock,
  parseServiceSelection,
  portAvailable,
  processIdentity,
  releaseStackLock,
  responseMatchesReadiness,
  runLocalStack,
  workerOutputMatches,
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
  assert.equal(plan.schema, "evavo.art-studio.local-stack-plan.v2");
  assert.equal(plan.buildCommands.filter((entry) => entry.args.includes("build:domain")).length, 1);
  assert.ok(
    plan.buildCommands.some(
      (entry) =>
        entry.executable === process.execPath &&
        entry.args.join(" ") === "scripts/check-local-storage-headroom.mjs",
    ),
  );
  assert.equal(plan.authority.githubActionsRequired, false);
  assert.equal(plan.authority.vercelRequired, false);
  assert.equal(plan.authority.deployment, false);
  assert.deepEqual(
    plan.servicePlans.map((entry) => entry.id),
    ["web", "api", "worker"],
  );
  assert.equal(plan.servicePlans.find((entry) => entry.id === "web").readiness.type, "web-health");
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

test("process identity distinguishes a live process from a reused PID token", () => {
  const identity = processIdentity(process.pid);
  assert.equal(typeof identity, "string");
  assert.ok(identity.length > 5);

  const root = fixture();
  try {
    const lockPath = path.join(root, STACK_LOCK_RELATIVE_PATH);
    fs.mkdirSync(path.dirname(lockPath), { recursive: true });
    fs.writeFileSync(
      lockPath,
      `${JSON.stringify({
        schema: "evavo.art-studio.local-stack-lock.v2",
        runId: "reused-pid",
        pid: process.pid,
        ownerIdentity: `${identity}-different`,
        startedAt: "2026-08-28T00:00:00.000Z",
        services: ["api"],
        children: {},
      })}\n`,
    );
    const inspection = inspectStackLock(root);
    assert.equal(inspection.active, false);
    assert.equal(inspection.stale, true);
    assert.equal(inspection.identityVerified, true);
    const replacement = acquireStackLock(root, ["worker"]);
    assert.notEqual(replacement.runId, "reused-pid");
    assert.equal(releaseStackLock(root, replacement.runId), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("stack locks reject a second active supervisor and release only by ownership", () => {
  const root = fixture();
  try {
    const lock = acquireStackLock(root, ["api"]);
    const inspection = inspectStackLock(root);
    assert.equal(inspection.active, true);
    assert.equal(inspection.identityVerified, true);
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

test("HTTP readiness proves exact API and web service identity", async () => {
  assert.equal(
    await responseMatchesReadiness(
      new Response(JSON.stringify({ status: "ok", service: "evavo-art-studio-api" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
      { type: "api-health" },
    ),
    true,
  );
  assert.equal(
    await responseMatchesReadiness(
      new Response(JSON.stringify({ status: "ok", service: "unrelated-api" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
      { type: "api-health" },
    ),
    false,
  );
  assert.equal(
    await responseMatchesReadiness(
      new Response("<html><head><title>EVAVO Art Studio</title></head></html>", {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
      { type: "web-health", bodyMarker: "EVAVO Art Studio" },
    ),
    true,
  );
  assert.equal(
    await responseMatchesReadiness(
      new Response("<html><title>Different service</title></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
      { type: "web-health", bodyMarker: "EVAVO Art Studio" },
    ),
    false,
  );
});

test("worker readiness ignores package-manager noise and requires a structured heartbeat", () => {
  assert.equal(workerOutputMatches("> @evavo/art-studio-worker start"), false);
  assert.equal(workerOutputMatches('{"service":"evavo-art-studio-worker"}'), false);
  assert.equal(
    workerOutputMatches(
      JSON.stringify({
        service: "evavo-art-studio-worker",
        workerId: "host:123",
        claimed: 0,
        completed: 0,
        failed: 0,
      }),
    ),
    true,
  );
});

test("partial startup failure rolls back every launched child and releases the lock", async () => {
  const root = fixture();
  const launched = [];
  let stopped = [];
  const fakeRecord = (plan, pid) => {
    const child = new EventEmitter();
    child.pid = pid;
    child.exitCode = null;
    child.signalCode = null;
    child.kill = () => {};
    return {
      plan,
      child,
      stdout: { close() {} },
      stderr: { close() {} },
      log: { close() {} },
      outputReady: false,
      readyOutput: new Promise(() => {}),
    };
  };
  try {
    const plan = buildStackPlan({ services: "web,api", build: false });
    await assert.rejects(
      runLocalStack(plan, {
        root,
        maximumLogBytes: 64 * 1024,
        portAvailable: async () => true,
        spawnService(servicePlan) {
          const record = fakeRecord(servicePlan, 10_000 + launched.length);
          launched.push(record);
          return record;
        },
        waitForReadiness(record) {
          if (record.plan.id === "api") {
            throw Object.assign(new Error("injected readiness failure"), {
              code: "TEST_READINESS_FAILURE",
            });
          }
        },
        async stopRecords(records) {
          stopped = [...records];
        },
      }),
      /injected readiness failure/u,
    );
    assert.equal(launched.length, 2);
    assert.equal(stopped.length, 2);
    assert.equal(inspectStackLock(root).exists, false);
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
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
