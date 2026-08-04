import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { LocalArtifactStore } from "@evavo/art-artifacts";
import {
  LocalRuntimeRepository,
  RuntimeError,
  TransientRuntimeError,
} from "@evavo/art-runtime";
import {
  SPRITE_SUPERVISOR_CAPABILITIES,
  compileSpriteSupervisorWorkflow,
} from "@evavo/art-sprite-supervisor";

import {
  createSpriteSupervisorHandlers,
} from "../dist/sprite-supervisor-guarded-handlers.js";

const exampleUrl = new URL(
  "../../../examples/sprite-supervisor-protocol.json",
  import.meta.url,
);

async function request(runId) {
  const value = JSON.parse(await readFile(exampleUrl, "utf8"));
  value.runId = runId;
  value.policy.tickDelayMs = 250;
  return value;
}

async function fixture(runId, stateTick = 1) {
  const root = await mkdtemp(path.join(os.tmpdir(), "sprite-continuation-"));
  const runtime = new LocalRuntimeRepository({ root: path.join(root, "runtime") });
  const artifacts = new LocalArtifactStore({ root: path.join(root, "artifacts") });
  const workflow = compileSpriteSupervisorWorkflow(await request(runId));
  const rootJob = await runtime.submit(
    workflow.rootJob,
    "continuation-recovery-test",
    new Date("2026-08-04T04:00:00.000Z"),
  );
  const updatedAt = "2026-08-04T04:00:01.000Z";
  const state = {
    schemaVersion: "1.0",
    protocolVersion: workflow.request.protocolVersion,
    runId: workflow.runId,
    workflowSha256: workflow.workflowSha256,
    spritePlanId: workflow.request.spritePlan.planId,
    spritePlanSha256: workflow.request.spritePlan.planSha256,
    status: "running",
    tick: stateTick,
    startedAt: "2026-08-04T04:00:00.000Z",
    updatedAt,
    taskStates: {},
    artifactBindings: {},
    decisions: [],
    appliedReviewResolutions: [],
  };
  const stored = await artifacts.put(`${JSON.stringify(state)}\n`, {
    mediaType: "application/json",
    storageClass: "runtime",
    fileName: `${runId}.sprite-supervisor.state.json`,
    labels: {
      artifactRole: "sprite-supervisor-state",
      runId,
      workflowSha256: workflow.workflowSha256,
      supervisorStatus: "running",
      supervisorTick: String(stateTick),
    },
  });
  const reference = await artifacts.updateReference(
    `sprite-supervisor/${workflow.request.spritePlan.project.projectId}`,
    runId,
    stored.artifactId,
    { expectedGeneration: 0, actor: "continuation-recovery-test" },
  );
  const handler = createSpriteSupervisorHandlers(runtime)[
    "art.sprite-production.supervise"
  ];
  assert.ok(handler);
  return {
    root,
    runtime,
    artifacts,
    workflow,
    rootJob,
    state,
    stored,
    reference,
    handler,
  };
}

function handlerContext(fx, job) {
  return {
    job,
    signal: new AbortController().signal,
    artifacts: fx.artifacts,
    heartbeat: async () => {
      throw new Error("heartbeat should not run during stale replay");
    },
    cancellationRequested: async () => false,
    putArtifact: (content, descriptor) => fx.artifacts.put(content, descriptor),
  };
}

function continuationKey(fx, tick) {
  return `${fx.workflow.runId}:supervisor:${fx.workflow.workflowSha256}:tick-${tick}`;
}

function continuationFromSnapshot(snapshot, key) {
  return Object.values(snapshot.jobs).find(
    (job) =>
      job.spec.queue === "control" &&
      job.spec.idempotencyKey === key,
  );
}

function supervisorSubmission(fx, tick, payload, overrides = {}) {
  return {
    queue: "control",
    kind: "art.sprite-production.supervise",
    idempotencyKey: continuationKey(fx, tick),
    payload,
    requiredCapabilities: SPRITE_SUPERVISOR_CAPABILITIES,
    maximumAttempts: 3,
    leaseDurationMs: 120_000,
    timeoutMs: 300_000,
    labels: {
      runId: fx.workflow.runId,
      spritePlanId: fx.workflow.request.spritePlan.planId,
      workflowSha256: fx.workflow.workflowSha256,
      supervisorTick: String(tick),
    },
    ...overrides,
  };
}

test("recovers one missing continuation from persisted running state", async () => {
  const fx = await fixture("restart-safe-missing-continuation");
  try {
    const first = await fx.handler(handlerContext(fx, fx.rootJob));
    assert.equal(first.result.replayDisposition, "stale-supervisor-job");
    assert.equal(first.result.expectedStateTick, 0);
    assert.equal(first.result.tick, 1);
    const snapshot = await fx.runtime.snapshot();
    const continuation = continuationFromSnapshot(
      snapshot,
      continuationKey(fx, 1),
    );
    assert.ok(continuation);
    assert.equal(first.result.nextTickJobId, continuation.id);
    assert.deepEqual(continuation.spec.dependencyJobIds, [fx.rootJob.id]);
    assert.deepEqual(continuation.spec.inputArtifacts, [fx.stored.artifactId]);
    assert.equal(continuation.spec.labels.supervisorTick, "1");
    assert.equal(
      continuation.spec.notBefore,
      new Date(Date.parse(fx.state.updatedAt) + 250).toISOString(),
    );

    const replay = await fx.handler(handlerContext(fx, fx.rootJob));
    assert.equal(replay.result.nextTickJobId, continuation.id);
    const jobs = await fx.runtime.list({
      kinds: ["art.sprite-production.supervise"],
      limit: 100,
    });
    assert.equal(jobs.length, 2, "replay must not create a second continuation");
  } finally {
    await rm(fx.root, { recursive: true, force: true });
  }
});

test("reuses an existing exact continuation after a post-submit crash", async () => {
  const fx = await fixture("restart-safe-existing-continuation");
  try {
    const key = continuationKey(fx, 1);
    const existing = await fx.runtime.submit(
      {
        queue: "control",
        kind: "art.sprite-production.supervise",
        idempotencyKey: key,
        payload: {
          schemaVersion: "1.0",
          workflowSha256: fx.workflow.workflowSha256,
          request: fx.workflow.request,
        },
        requiredCapabilities: SPRITE_SUPERVISOR_CAPABILITIES,
        dependencyJobIds: [fx.rootJob.id],
        inputArtifacts: [fx.stored.artifactId],
        maximumAttempts: 3,
        leaseDurationMs: 120_000,
        timeoutMs: 300_000,
        notBefore: new Date(
          Date.parse(fx.state.updatedAt) + 250,
        ).toISOString(),
        labels: {
          runId: fx.workflow.runId,
          spritePlanId: fx.workflow.request.spritePlan.planId,
          workflowSha256: fx.workflow.workflowSha256,
          supervisorTick: "1",
        },
      },
      `sprite-supervisor:${fx.workflow.runId}`,
    );
    const result = await fx.handler(handlerContext(fx, fx.rootJob));
    assert.equal(result.result.nextTickJobId, existing.id);
    const jobs = await fx.runtime.list({
      kinds: ["art.sprite-production.supervise"],
      limit: 100,
    });
    assert.equal(jobs.length, 2);
  } finally {
    await rm(fx.root, { recursive: true, force: true });
  }
});

test("fails transiently when a continuation outruns durable state", async () => {
  const fx = await fixture("restart-safe-state-not-ready");
  try {
    const continuation = await fx.runtime.submit(
      {
        queue: "control",
        kind: "art.sprite-production.supervise",
        idempotencyKey: continuationKey(fx, 2),
        payload: {
          schemaVersion: "1.0",
          workflowSha256: fx.workflow.workflowSha256,
          request: fx.workflow.request,
        },
        requiredCapabilities: SPRITE_SUPERVISOR_CAPABILITIES,
        dependencyJobIds: [fx.rootJob.id],
        inputArtifacts: [fx.stored.artifactId],
        maximumAttempts: 3,
        leaseDurationMs: 120_000,
        timeoutMs: 300_000,
        labels: {
          runId: fx.workflow.runId,
          spritePlanId: fx.workflow.request.spritePlan.planId,
          workflowSha256: fx.workflow.workflowSha256,
          supervisorTick: "2",
        },
      },
      "continuation-recovery-test",
    );
    await assert.rejects(
      () => fx.handler(handlerContext(fx, continuation)),
      (error) =>
        error instanceof TransientRuntimeError &&
        error.code === "SPRITE_SUPERVISOR_STATE_NOT_READY",
    );
  } finally {
    await rm(fx.root, { recursive: true, force: true });
  }
});

test("rejects an incompatible control-queue idempotency entry", async () => {
  const fx = await fixture("restart-safe-idempotency-conflict");
  try {
    await fx.runtime.submit(
      {
        queue: "control",
        kind: "art.candidate.generate",
        idempotencyKey: continuationKey(fx, 1),
        payload: { schemaVersion: "1.0", operation: "generate" },
        labels: { supervisorTick: "1" },
      },
      "continuation-recovery-test",
    );
    await assert.rejects(
      () => fx.handler(handlerContext(fx, fx.rootJob)),
      (error) =>
        error instanceof RuntimeError &&
        error.code === "RUNTIME_IDEMPOTENCY_CONFLICT",
    );
  } finally {
    await rm(fx.root, { recursive: true, force: true });
  }
});

test("rejects a tick-zero root job that omits the exact request hash", async () => {
  const fx = await fixture("restart-safe-root-request-hash-required");
  try {
    const forged = await fx.runtime.submit(
      supervisorSubmission(fx, 0, {
        schemaVersion: "1.0",
        workflowSha256: fx.workflow.workflowSha256,
        request: fx.workflow.request,
      }),
      "continuation-recovery-test",
    );
    await assert.rejects(
      () => fx.handler(handlerContext(fx, forged)),
      (error) =>
        error instanceof RuntimeError &&
        error.code === "SPRITE_SUPERVISOR_REQUEST_HASH_MISSING",
    );
  } finally {
    await rm(fx.root, { recursive: true, force: true });
  }
});

test("rejects a continuation that carries root request-hash authority", async () => {
  const fx = await fixture("restart-safe-continuation-request-hash-forbidden");
  try {
    const forged = await fx.runtime.submit(
      supervisorSubmission(fx, 1, {
        schemaVersion: "1.0",
        workflowSha256: fx.workflow.workflowSha256,
        requestSha256: fx.workflow.requestSha256,
        request: fx.workflow.request,
      }),
      "continuation-recovery-test",
    );
    await assert.rejects(
      () => fx.handler(handlerContext(fx, forged)),
      (error) =>
        error instanceof RuntimeError &&
        error.code ===
          "SPRITE_SUPERVISOR_CONTINUATION_REQUEST_HASH_FORBIDDEN",
    );
  } finally {
    await rm(fx.root, { recursive: true, force: true });
  }
});

test("rejects supervisor labels that drift from the compiled workflow", async () => {
  const fx = await fixture("restart-safe-label-identity-required");
  try {
    const forged = await fx.runtime.submit(
      supervisorSubmission(
        fx,
        1,
        {
          schemaVersion: "1.0",
          workflowSha256: fx.workflow.workflowSha256,
          request: fx.workflow.request,
        },
        {
          labels: {
            runId: "different-run",
            spritePlanId: fx.workflow.request.spritePlan.planId,
            workflowSha256: fx.workflow.workflowSha256,
            supervisorTick: "1",
          },
        },
      ),
      "continuation-recovery-test",
    );
    await assert.rejects(
      () => fx.handler(handlerContext(fx, forged)),
      (error) =>
        error instanceof RuntimeError &&
        error.code === "SPRITE_SUPERVISOR_JOB_LABEL_MISMATCH",
    );
  } finally {
    await rm(fx.root, { recursive: true, force: true });
  }
});
