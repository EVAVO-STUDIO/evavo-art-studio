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

import { createBuiltinHandlers } from "../dist/index.js";
import {
  providerWorkerCapabilities,
  providerWorkerCapabilityProfiles,
} from "../dist/provider-handlers.js";

const spritePng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAFklEQVR4nGNgoBo4YaPxHxkPhAKyAQDgPyKxKv0aXwAAAABJRU5ErkJggg==",
  "base64",
);

test("durable provider worker preserves identity lineage and stores only unapproved candidates", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-provider-worker-"));
  const runtime = new LocalRuntimeRepository({ root: path.join(root, "runtime") });
  const artifacts = new LocalArtifactStore({ root: path.join(root, "artifacts") });
  const canonical = await artifacts.put(spritePng, {
    mediaType: "image/png",
    storageClass: "master",
    fileName: "hero-canonical.png",
    labels: {
      artifactRole: "canonical-identity",
      approvalState: "approved",
      assetId: "hero",
    },
  });
  const registry = new ProviderRegistry([new FixtureImageProviderAdapter()]);
  const request = {
    schemaVersion: "1.0",
    operation: "generate",
    assetKind: "sprite-frame",
    continuityPhase: "key-pose",
    assetId: "hero-idle",
    candidateFamilyId: "hero-idle-down",
    frameId: "down-001",
    creativeIntent:
      "Author the first readable idle key pose while preserving the approved hero identity.",
    negativeIntent:
      "No costume redesign, no unrelated props, no scenery and no cropped silhouette.",
    style: {
      styleName: "Authentic 1990s adventure sprite",
      intent: "Hand-authored pixel clusters and a deliberate period palette.",
      mustHave: ["stable identity", "clear silhouette"],
      mustAvoid: ["generic AI rendering", "modern gloss"],
      identityLocks: ["same face", "same coat", "same handedness"],
      palette: ["locked indexed palette"],
      lineTreatment: ["consistent one-pixel contour hierarchy"],
      cameraRules: ["fixed side-stage projection"],
    },
    shot: {
      subject: "The approved hero only.",
      action: "Neutral idle contact pose.",
      direction: "Down-facing three-quarter view.",
      include: ["complete silhouette", "declared coat and boots"],
      exclude: ["background", "UI", "unrelated particles"],
      separateAssets: ["cast shadow", "held weapon", "action effect"],
      framing: ["minimum eight-pixel clear margin", "feet aligned to baseline"],
    },
    target: {
      width: 128,
      height: 128,
      transparency: "required",
      outputFormat: "png",
    },
    background: { strategy: "native-alpha" },
    quality: "high",
    candidateCount: 2,
    selection: {
      preferredAdapterId: "fixture-image",
      allowFallback: false,
    },
    references: [
      {
        artifactId: canonical.artifactId,
        role: "canonical-identity",
        strength: 1,
        required: true,
      },
    ],
  };
  const normalizedRequest = validateProviderCandidateRequest(request);
  const job = await runtime.submit({
    queue: "provider",
    kind: "art.candidate.generate",
    idempotencyKey: "hero-idle-down-key-pose-v1",
    payload: normalizedRequest,
    requiredCapabilities: [
      "provider.generate",
      "provider.reference-lock",
      "provider.candidate-store",
      "evidence.bundle",
    ],
    requiredCapabilityProfile: providerRequiredCapabilities(normalizedRequest),
    leaseDurationMs: 10_000,
    timeoutMs: 60_000,
  });
  const capabilities = providerWorkerCapabilities(registry);
  const worker = new RuntimeWorker({
    runtime,
    artifacts,
    worker: {
      id: "provider-worker-fixture",
      capabilities,
      capabilityProfiles: providerWorkerCapabilityProfiles(registry),
      queues: ["provider"],
    },
    handlers: createBuiltinHandlers([root], registry),
  });

  const run = await worker.runOnce();
  assert.equal(run.succeeded, 1);
  assert.equal(run.failed, 0);

  const completed = await runtime.get(job.id);
  assert.equal(completed.state, "succeeded");
  assert.ok(completed.outputArtifacts.length >= 4, "two candidates, provider evidence and runtime result are retained");

  const descriptors = [];
  for (const artifactId of completed.outputArtifacts) {
    const verification = await artifacts.verify(artifactId);
    assert.equal(verification.descriptorValid, true);
    assert.equal(verification.contentValid, true);
    const descriptor = await artifacts.get(artifactId);
    assert.ok(descriptor);
    descriptors.push(descriptor);
  }

  const candidates = descriptors.filter(
    (entry) => entry.labels.artifactRole === "provider-candidate",
  );
  assert.equal(candidates.length, 2);
  for (const candidate of candidates) {
    assert.equal(candidate.storageClass, "intermediate");
    assert.equal(candidate.labels.approvalState, "unapproved");
    assert.equal(candidate.labels.continuityPhase, "key-pose");
    assert.deepEqual(candidate.sourceArtifacts, [canonical.artifactId]);
    assert.equal(candidate.metadata.finalDeliverable, false);
    assert.equal(candidate.metadata.requiresMastering, true);
    assert.equal(candidate.metadata.requiresBlockingQa, true);
  }

  const evidence = descriptors.find(
    (entry) => entry.labels.artifactRole === "provider-candidate-evidence",
  );
  assert.ok(evidence);
  assert.equal(evidence.storageClass, "evidence");
  const evidenceBody = JSON.parse(
    (await artifacts.read(evidence.artifactId)).toString("utf8"),
  );
  assert.equal(evidenceBody.outcome, "candidate-produced");
  assert.equal(evidenceBody.selection.adapter.id, "fixture-image");
  assert.equal(evidenceBody.resolvedReferences[0].role, "canonical-identity");
  assert.equal(evidenceBody.candidateArtifacts.length, 2);
  assert.ok(evidenceBody.compiledPrompt.includes("KEEP AS SEPARATE ASSETS OR LAYERS"));
});

test("provider handler rejects a claim whose runtime profile was under-declared", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-provider-profile-"));
  const runtime = new LocalRuntimeRepository({ root: path.join(root, "runtime") });
  const artifacts = new LocalArtifactStore({ root: path.join(root, "artifacts") });
  const canonical = await artifacts.put(spritePng, {
    mediaType: "image/png",
    storageClass: "master",
    fileName: "hero-canonical.png",
    labels: { artifactRole: "canonical-identity", approvalState: "approved" },
  });
  const registry = new ProviderRegistry([new FixtureImageProviderAdapter()]);
  const normalizedRequest = validateProviderCandidateRequest({
    schemaVersion: "1.0",
    operation: "generate",
    assetKind: "sprite-frame",
    continuityPhase: "key-pose",
    assetId: "hero-idle",
    candidateFamilyId: "hero-idle-profile-guard",
    creativeIntent: "Preserve the approved identity in one idle key pose.",
    style: { styleName: "Pixel art", intent: "Stable authored sprite identity." },
    shot: { subject: "The approved hero only." },
    target: { width: 128, height: 128, transparency: "required" },
    background: { strategy: "native-alpha" },
    candidateCount: 1,
    references: [
      {
        artifactId: canonical.artifactId,
        role: "canonical-identity",
        required: true,
      },
    ],
  });
  const job = await runtime.submit({
    queue: "provider",
    kind: "art.candidate.generate",
    idempotencyKey: "provider-profile-under-declared",
    payload: normalizedRequest,
    requiredCapabilities: [
      "provider.generate",
      "provider.reference-lock",
      "provider.candidate-store",
      "evidence.bundle",
    ],
    requiredCapabilityProfile: ["generate"],
  });
  const worker = new RuntimeWorker({
    runtime,
    artifacts,
    worker: {
      id: "provider-worker-profile-guard",
      capabilities: providerWorkerCapabilities(registry),
      capabilityProfiles: providerWorkerCapabilityProfiles(registry),
      queues: ["provider"],
    },
    handlers: createBuiltinHandlers([root], registry),
  });
  const run = await worker.runOnce();
  assert.equal(run.claimed, 1);
  assert.equal(run.failed, 1);
  const failed = await runtime.get(job.id);
  assert.equal(failed.state, "failed");
  assert.equal(
    failed.failure.code,
    "PROVIDER_RUNTIME_CAPABILITY_PROFILE_MISMATCH",
  );
});


test("provider handler rejects a legacy job that omits its adapter capability profile", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-provider-profile-missing-"));
  const runtime = new LocalRuntimeRepository({ root: path.join(root, "runtime") });
  const artifacts = new LocalArtifactStore({ root: path.join(root, "artifacts") });
  const registry = new ProviderRegistry([new FixtureImageProviderAdapter()]);
  const normalizedRequest = validateProviderCandidateRequest({
    schemaVersion: "1.0",
    operation: "generate",
    assetKind: "illustration",
    continuityPhase: "independent",
    assetId: "profile-missing",
    candidateFamilyId: "profile-missing-v1",
    creativeIntent: "Create one bounded fixture candidate.",
    style: { styleName: "Fixture", intent: "Deterministic test output." },
    shot: { subject: "One fixture subject." },
    target: { width: 128, height: 128, transparency: "opaque" },
    background: { strategy: "opaque-source" },
    candidateCount: 1,
  });
  const job = await runtime.submit({
    queue: "provider",
    kind: "art.candidate.generate",
    idempotencyKey: "provider-profile-missing",
    payload: normalizedRequest,
    requiredCapabilities: [
      "provider.generate",
      "provider.candidate-store",
      "evidence.bundle",
    ],
  });
  const worker = new RuntimeWorker({
    runtime,
    artifacts,
    worker: {
      id: "provider-worker-profile-missing",
      capabilities: providerWorkerCapabilities(registry),
      capabilityProfiles: providerWorkerCapabilityProfiles(registry),
      queues: ["provider"],
    },
    handlers: createBuiltinHandlers([root], registry),
  });
  const run = await worker.runOnce();
  assert.equal(run.claimed, 1);
  assert.equal(run.failed, 1);
  const failed = await runtime.get(job.id);
  assert.equal(
    failed.failure.code,
    "PROVIDER_RUNTIME_CAPABILITY_PROFILE_MISSING",
  );
});
