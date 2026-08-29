import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { LocalArtifactStore } from "@evavo/art-artifacts";
import {
  FixtureImageProviderAdapter,
  ProviderRegistry,
  providerRequiredCapabilities,
  validateProviderCandidateRequest,
} from "@evavo/art-providers";
import { LocalRuntimeRepository, RuntimeWorker } from "@evavo/art-runtime";

import {
  COUNCIL_AVATAR_PROVIDER_EXECUTION_CAPABILITY,
  createProviderHandlers,
  providerWorkerCapabilities,
  providerWorkerCapabilityProfiles,
} from "../dist/provider-handlers.js";

function councilRequest() {
  return validateProviderCandidateRequest({
    schemaVersion: "1.0",
    operation: "generate",
    assetKind: "illustration",
    continuityPhase: "identity-master",
    assetId: "council-avatar:council-critic:identity-master",
    candidateFamilyId: "council-avatar:council-critic:identity",
    creativeIntent: "Create one isolated Council identity candidate.",
    style: {
      styleName: "EVAVO Council editorial character identity",
      intent: "Stable authored identity suitable for later animation.",
    },
    shot: { subject: "Veyra only." },
    target: {
      width: 1024,
      height: 1536,
      transparency: "required",
      outputFormat: "png",
    },
    background: { strategy: "provider-auto" },
    quality: "high",
    candidateCount: 1,
    selection: {
      preferredAdapterId: "fixture-image",
      allowFallback: false,
    },
    metadata: {
      schema: "evavo.project-art-council-avatar-provider-request.v1",
      characterId: "council-critic",
      providerExecutionAuthorized: false,
      candidateApprovalEstablished: false,
      candidatePromotionEstablished: false,
      runtimeActivationEstablished: false,
    },
  });
}

async function harness({ authorization } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-council-provider-auth-"));
  const runtime = new LocalRuntimeRepository({ root: path.join(root, "runtime") });
  const artifacts = new LocalArtifactStore({ root: path.join(root, "artifacts") });
  const registry = new ProviderRegistry([new FixtureImageProviderAdapter()]);
  const request = councilRequest();
  const job = await runtime.submit({
    queue: "provider",
    kind: "art.candidate.generate",
    idempotencyKey: "council-avatar-provider-auth-test",
    payload: request,
    requiredCapabilities: [
      "provider.generate",
      "provider.reference-lock",
      "provider.candidate-store",
      "evidence.bundle",
      COUNCIL_AVATAR_PROVIDER_EXECUTION_CAPABILITY,
    ],
    requiredCapabilityProfile: providerRequiredCapabilities(request),
    maximumAttempts: 1,
    leaseDurationMs: 10_000,
    timeoutMs: 60_000,
  });
  const worker = new RuntimeWorker({
    runtime,
    artifacts,
    worker: {
      id: "council-avatar-provider-auth-worker",
      capabilities: [
        ...providerWorkerCapabilities(registry),
        COUNCIL_AVATAR_PROVIDER_EXECUTION_CAPABILITY,
      ],
      capabilityProfiles: providerWorkerCapabilityProfiles(registry),
      queues: ["provider"],
    },
    handlers: createProviderHandlers(registry, authorization),
  });
  return { runtime, artifacts, registry, request, job, worker };
}

test("Council provider job fails before provider execution when authorization is absent", async () => {
  const { runtime, job, worker } = await harness();
  const run = await worker.runOnce();

  assert.equal(run.claimed, 1);
  assert.equal(run.succeeded, 0);
  assert.equal(run.failed, 1);
  const failed = await runtime.get(job.id);
  assert.equal(failed.state, "failed");
  assert.equal(
    failed.failure.code,
    "COUNCIL_AVATAR_PROVIDER_EXECUTION_UNAUTHORIZED",
  );
  assert.equal(failed.attempts.length, 1);
});

test("Council provider job executes only after the dedicated authorizer accepts the exact job", async () => {
  let checked = 0;
  const authorization = Object.freeze({
    authorizationSha256: "a".repeat(64),
    allowedAdapterIds: Object.freeze(["fixture-image"]),
    queues: Object.freeze(["provider"]),
    requiredCapability: COUNCIL_AVATAR_PROVIDER_EXECUTION_CAPABILITY,
    adapterAllowed: (adapterId) => adapterId === "fixture-image",
    assertJobAuthorized(job, request) {
      checked += 1;
      assert.equal(job.spec.maximumAttempts, 1);
      assert.ok(
        job.spec.requiredCapabilities.includes(
          COUNCIL_AVATAR_PROVIDER_EXECUTION_CAPABILITY,
        ),
      );
      assert.equal(
        request.metadata.schema,
        "evavo.project-art-council-avatar-provider-request.v1",
      );
      return true;
    },
  });
  const { runtime, artifacts, job, worker } = await harness({ authorization });
  const run = await worker.runOnce();

  assert.equal(checked, 1);
  assert.equal(run.claimed, 1);
  assert.equal(run.succeeded, 1);
  assert.equal(run.failed, 0);
  const completed = await runtime.get(job.id);
  assert.equal(completed.state, "succeeded");
  const descriptors = await Promise.all(
    completed.outputArtifacts.map((artifactId) => artifacts.get(artifactId)),
  );
  const candidates = descriptors.filter(
    (entry) => entry?.labels.artifactRole === "provider-candidate",
  );
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].labels.approvalState, "unapproved");
});

test("Council execution capability without Council metadata fails closed", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-council-provider-mismatch-"));
  const runtime = new LocalRuntimeRepository({ root: path.join(root, "runtime") });
  const artifacts = new LocalArtifactStore({ root: path.join(root, "artifacts") });
  const registry = new ProviderRegistry([new FixtureImageProviderAdapter()]);
  const request = validateProviderCandidateRequest({
    schemaVersion: "1.0",
    operation: "generate",
    assetKind: "illustration",
    continuityPhase: "independent",
    assetId: "governance-mismatch",
    candidateFamilyId: "governance-mismatch",
    creativeIntent: "Fixture request with deliberately incomplete governance.",
    style: { styleName: "Fixture", intent: "Test only." },
    shot: { subject: "Fixture." },
    target: { width: 1024, height: 1024, transparency: "opaque" },
    background: { strategy: "opaque-source" },
    candidateCount: 1,
  });
  const job = await runtime.submit({
    queue: "provider",
    kind: "art.candidate.generate",
    idempotencyKey: "council-avatar-provider-mismatch",
    payload: request,
    requiredCapabilities: [
      "provider.generate",
      "provider.candidate-store",
      "evidence.bundle",
      COUNCIL_AVATAR_PROVIDER_EXECUTION_CAPABILITY,
    ],
    requiredCapabilityProfile: providerRequiredCapabilities(request),
    maximumAttempts: 1,
  });
  const worker = new RuntimeWorker({
    runtime,
    artifacts,
    worker: {
      id: "council-avatar-provider-mismatch-worker",
      capabilities: [
        ...providerWorkerCapabilities(registry),
        COUNCIL_AVATAR_PROVIDER_EXECUTION_CAPABILITY,
      ],
      capabilityProfiles: providerWorkerCapabilityProfiles(registry),
      queues: ["provider"],
    },
    handlers: createProviderHandlers(registry),
  });

  const run = await worker.runOnce();
  assert.equal(run.failed, 1);
  const failed = await runtime.get(job.id);
  assert.equal(
    failed.failure.code,
    "COUNCIL_AVATAR_PROVIDER_EXECUTION_CONTRACT_MISMATCH",
  );
});
