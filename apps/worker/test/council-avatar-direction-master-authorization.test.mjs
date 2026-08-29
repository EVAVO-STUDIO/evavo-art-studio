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

const tinyPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAFklEQVR4nGNgoBo4YaPxHxkPhAKyAQDgPyKxKv0aXwAAAABJRU5ErkJggg==",
  "base64",
);

async function setup({ authorization } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-council-direction-auth-"));
  const runtime = new LocalRuntimeRepository({ root: path.join(root, "runtime") });
  const artifacts = new LocalArtifactStore({ root: path.join(root, "artifacts") });
  const canonical = await artifacts.put(tinyPng, {
    mediaType: "image/png",
    storageClass: "master",
    fileName: "veyra-approved.png",
    labels: { artifactRole: "canonical-identity", approvalState: "approved" },
  });
  const registry = new ProviderRegistry([new FixtureImageProviderAdapter()]);
  const request = validateProviderCandidateRequest({
    schemaVersion: "1.0",
    operation: "generate",
    assetKind: "illustration",
    continuityPhase: "direction-master",
    assetId: "council-avatar:council-critic:direction-master:full-body-right",
    candidateFamilyId: "council-avatar:council-critic:direction-master:full-body-right",
    creativeIntent: "Preserve the exact approved Veyra identity in a slight right three-quarter direction master.",
    style: {
      styleName: "EVAVO Council approved-identity direction master",
      intent: "Same exact approved individual.",
      identityLocks: ["exactly four eyes", "exactly four digits per hand"],
    },
    shot: { subject: "Veyra, exact approved individual." },
    target: { width: 1024, height: 1536, transparency: "required", outputFormat: "png" },
    background: { strategy: "provider-auto" },
    quality: "high",
    candidateCount: 1,
    references: [{
      artifactId: canonical.artifactId,
      role: "canonical-identity",
      strength: 1,
      required: true,
    }],
    selection: { preferredAdapterId: "fixture-image", allowFallback: false },
    metadata: {
      schema: "evavo.project-art-council-avatar-direction-master-request.v1",
      characterId: "council-critic",
      viewId: "full-body-right",
      providerExecutionAuthorized: false,
      directionMasterApprovalEstablished: false,
      candidatePromotionEstablished: false,
      runtimeActivationEstablished: false,
      websiteActivationEstablished: false,
    },
  });
  const job = await runtime.submit({
    queue: "provider",
    kind: "art.candidate.generate",
    idempotencyKey: "council-direction-auth-test",
    payload: request,
    inputArtifacts: [canonical.artifactId],
    requiredCapabilities: [
      "provider.generate",
      "provider.reference-lock",
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
      id: "council-direction-auth-worker",
      capabilities: [...providerWorkerCapabilities(registry), COUNCIL_AVATAR_PROVIDER_EXECUTION_CAPABILITY],
      capabilityProfiles: providerWorkerCapabilityProfiles(registry),
      queues: ["provider"],
    },
    handlers: createProviderHandlers(registry, authorization),
  });
  return { runtime, artifacts, canonical, request, job, worker };
}

test("direction-master Council request cannot execute without Council authorization", async () => {
  const { runtime, job, worker } = await setup();
  const run = await worker.runOnce();
  assert.equal(run.failed, 1);
  const failed = await runtime.get(job.id);
  assert.equal(failed.state, "failed");
  assert.equal(failed.failure.code, "COUNCIL_AVATAR_PROVIDER_EXECUTION_UNAUTHORIZED");
});

test("direction-master Council request executes only after exact Council authorizer accepts it", async () => {
  let checks = 0;
  const authorization = Object.freeze({
    authorizationSha256: "a".repeat(64),
    allowedAdapterIds: Object.freeze(["fixture-image"]),
    queues: Object.freeze(["provider"]),
    requiredCapability: COUNCIL_AVATAR_PROVIDER_EXECUTION_CAPABILITY,
    adapterAllowed: (id) => id === "fixture-image",
    assertJobAuthorized(job, request) {
      checks += 1;
      assert.equal(job.spec.maximumAttempts, 1);
      assert.equal(request.continuityPhase, "direction-master");
      assert.equal(request.metadata.schema, "evavo.project-art-council-avatar-direction-master-request.v1");
      assert.equal(request.references[0].role, "canonical-identity");
      assert.equal(request.references[0].strength, 1);
      return true;
    },
  });
  const { runtime, artifacts, job, worker } = await setup({ authorization });
  const run = await worker.runOnce();
  assert.equal(checks, 1);
  assert.equal(run.succeeded, 1);
  const completed = await runtime.get(job.id);
  assert.equal(completed.state, "succeeded");
  const descriptors = await Promise.all(completed.outputArtifacts.map((id) => artifacts.get(id)));
  const candidate = descriptors.find((entry) => entry?.labels.artifactRole === "provider-candidate");
  assert.ok(candidate);
  assert.equal(candidate.labels.approvalState, "unapproved");
});

test("unknown Council-like metadata does not satisfy the exact governed schema allowlist", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-council-direction-unknown-"));
  const runtime = new LocalRuntimeRepository({ root: path.join(root, "runtime") });
  const artifacts = new LocalArtifactStore({ root: path.join(root, "artifacts") });
  const registry = new ProviderRegistry([new FixtureImageProviderAdapter()]);
  const request = validateProviderCandidateRequest({
    schemaVersion: "1.0",
    operation: "generate",
    assetKind: "illustration",
    continuityPhase: "independent",
    assetId: "unknown-council-schema",
    candidateFamilyId: "unknown-council-schema",
    creativeIntent: "Test exact governance schema matching.",
    style: { styleName: "Fixture", intent: "Test." },
    shot: { subject: "Fixture." },
    target: { width: 1024, height: 1024, transparency: "opaque" },
    background: { strategy: "opaque-source" },
    candidateCount: 1,
    metadata: { schema: "evavo.project-art-council-avatar-not-a-real-governed-schema.v1" },
  });
  const job = await runtime.submit({
    queue: "provider",
    kind: "art.candidate.generate",
    idempotencyKey: "unknown-council-schema",
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
      id: "unknown-council-schema-worker",
      capabilities: [...providerWorkerCapabilities(registry), COUNCIL_AVATAR_PROVIDER_EXECUTION_CAPABILITY],
      capabilityProfiles: providerWorkerCapabilityProfiles(registry),
      queues: ["provider"],
    },
    handlers: createProviderHandlers(registry),
  });
  const run = await worker.runOnce();
  assert.equal(run.failed, 1);
  const failed = await runtime.get(job.id);
  assert.equal(failed.failure.code, "COUNCIL_AVATAR_PROVIDER_EXECUTION_CONTRACT_MISMATCH");
});
