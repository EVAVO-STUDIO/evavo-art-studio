import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { LocalArtifactStore } from "@evavo/art-artifacts";

import {
  FixtureImageProviderAdapter,
  ProviderRegistry,
  executeProviderCandidateRequest,
} from "../dist/index.js";

const SOURCE_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEAQH/3tmO9QAAAABJRU5ErkJggg==",
  "base64",
);

function request(overrides = {}) {
  return {
    schemaVersion: "1.0",
    operation: "generate",
    assetKind: "illustration",
    continuityPhase: "independent",
    assetId: "provider-provenance-test",
    candidateFamilyId: "provider-provenance-test",
    creativeIntent: "Create one bounded test candidate.",
    style: {
      styleName: "Fixture",
      intent: "Deterministic provider provenance test.",
    },
    shot: {
      subject: "One fixture subject.",
    },
    target: {
      width: 32,
      height: 32,
      transparency: "opaque",
      outputFormat: "png",
    },
    background: { strategy: "opaque-source" },
    candidateCount: 1,
    selection: { preferredAdapterId: "fixture-image", allowFallback: false },
    references: [],
    ...overrides,
  };
}

async function harness() {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-provider-provenance-"));
  return {
    store: new LocalArtifactStore({ root }),
    registry: new ProviderRegistry([new FixtureImageProviderAdapter()]),
  };
}

test("public provider execution emits a hash-bound provenance bundle automatically", async () => {
  const { store, registry } = await harness();
  const result = await executeProviderCandidateRequest(request(), {
    registry,
    artifacts: store,
    signal: new AbortController().signal,
  });

  assert.match(result.provenanceArtifact, /^artifact_[0-9a-f]{64}$/u);
  const candidate = await store.get(result.candidateArtifacts[0]);
  assert.ok(candidate);
  const provenance = await store.get(result.provenanceArtifact);
  assert.ok(provenance);
  assert.equal(provenance.storageClass, "evidence");
  assert.equal(provenance.labels.artifactRole, "provider-candidate-provenance");
  assert.equal(provenance.labels.approvalState, "unapproved");

  const body = JSON.parse((await store.read(result.provenanceArtifact)).toString("utf8"));
  assert.equal(body.contract, "evavo.provider-provenance-bundle.v1");
  assert.equal(body.providerEvidenceArtifactId, result.evidenceArtifact);
  assert.equal(body.candidateRecords.length, 1);
  assert.equal(body.candidateRecords[0].record.contract, "evavo.image-provenance-record.v1");
  assert.equal(body.candidateRecords[0].record.subjectSha256, candidate.contentSha256);
  assert.equal(body.candidateRecords[0].record.evidenceKind, "generation-record");
  assert.equal(body.candidateRecords[0].record.reportedOrigin, "unknown");
  assert.equal(body.candidateRecords[0].localBindingReview.status, "verified");
  assert.equal(body.candidateRecords[0].localBindingReview.hashBindingsVerified, 1);
  assert.equal(body.trustBoundary.providerOrContentCredentialSignatureVerifiedHere, false);
  assert.equal(body.trustBoundary.providerReportedOriginIsExternallyAuthenticated, false);
  assert.equal(body.trustBoundary.pixelOriginInferenceUsed, false);
  assert.equal(body.trustBoundary.automaticCreativeApproval, false);
  assert.equal(body.trustBoundary.publicationAllowed, false);
});

test("inpaint provenance binds only the actual base image as canonical parent", async () => {
  const { store, registry } = await harness();
  const base = await store.put(SOURCE_PNG, {
    mediaType: "image/png",
    storageClass: "source",
    fileName: "base.png",
  });
  const mask = await store.put(SOURCE_PNG, {
    mediaType: "image/png",
    storageClass: "source",
    fileName: "mask.png",
  });

  const result = await executeProviderCandidateRequest(request({
    operation: "inpaint",
    continuityPhase: "repair",
    references: [
      { artifactId: base.artifactId, role: "base-image", required: true },
      { artifactId: mask.artifactId, role: "mask", required: true },
    ],
  }), {
    registry,
    artifacts: store,
    signal: new AbortController().signal,
  });

  const body = JSON.parse((await store.read(result.provenanceArtifact)).toString("utf8"));
  assert.equal(body.operation, "inpaint");
  assert.equal(body.baseImageParentBinding.status, "single");
  assert.equal(body.baseImageParentBinding.parentSha256, base.contentSha256);
  assert.equal(body.candidateRecords[0].record.parentSha256, base.contentSha256);
  assert.equal(body.candidateRecords[0].record.evidenceKind, "transformation-receipt");
  assert.equal(body.referenceBindings.length, 2);
  assert.equal(body.referenceBindings.find((entry) => entry.role === "base-image").contentSha256, base.contentSha256);
  assert.equal(body.referenceBindings.find((entry) => entry.role === "mask").contentSha256, mask.contentSha256);
});

test("provider package no longer exposes the raw executor through its public index", async () => {
  const publicModule = await import("../dist/index.js");
  assert.equal(typeof publicModule.executeProviderCandidateRequest, "function");
  assert.equal(publicModule.executeProviderCandidateRequest.name, "executeProviderCandidateRequest");
  assert.equal("executeProviderCandidateRequestRaw" in publicModule, false);
});
