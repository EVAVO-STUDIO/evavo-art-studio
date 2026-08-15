import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { LocalArtifactStore } from "@evavo/art-artifacts";
import { LocalRuntimeRepository, RuntimeWorker } from "@evavo/art-runtime";

import { createBuiltinHandlers } from "../dist/index.js";

const CHROMA_CANDIDATE = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAA4AAAAOCAYAAAAfSC3RAAAAV0lEQVR4nNWSwQ3AIAwDL1X3gtEYDSZLvy0kjRRe+OfI97AVQVESujLQFni/Te3/4V4dEKA1G5rvCwhQxtePsmbcjhJs7YIqSTCS2dHqFILeqrPknJd7AGinDiGIWd0pAAAAAElFTkSuQmCC",
  "base64",
);

async function descriptorByRole(artifacts, ids, role) {
  for (const id of ids) {
    const descriptor = await artifacts.get(id);
    if (descriptor?.labels.artifactRole === role) return descriptor;
  }
  return null;
}

test("mastering worker converts a chroma candidate into an unapproved QA-backed alpha intermediate", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-alpha-worker-"));
  const artifacts = new LocalArtifactStore({ root: path.join(root, "artifacts") });
  const runtime = new LocalRuntimeRepository({ root: path.join(root, "runtime") });
  const candidate = await artifacts.put(CHROMA_CANDIDATE, {
    mediaType: "image/png",
    storageClass: "intermediate",
    fileName: "hero-idle-down-001.candidate.png",
    labels: {
      artifactRole: "provider-candidate",
      approvalState: "unapproved",
      candidateFamilyId: "hero-idle-down",
      frameId: "down-001",
      requiresAlphaExtraction: "true",
    },
    metadata: {
      finalDeliverable: false,
      requiresMastering: true,
      requiresBlockingQa: true,
    },
  });
  const job = await runtime.submit({
    queue: "media",
    kind: "art.candidate.master-alpha",
    idempotencyKey: "hero-idle-down-001-alpha-v1",
    payload: {
      candidateArtifactId: candidate.artifactId,
      matteColour: "#00ff00",
      opaqueSeedDistance: 300,
      edgeSearchRadius: 8,
      bleedRadius: 2,
      frameId: "down-001",
      quality: {
        safePadding: 1,
        maximumHaloFraction: 0.1,
      },
    },
    inputArtifacts: [candidate.artifactId],
    requiredCapabilities: [
      "media.background-recovery",
      "media.chroma-extract",
      "media.raster",
      "quality.sprite-frame",
      "evidence.bundle",
    ],
    maximumAttempts: 1,
    leaseDurationMs: 10_000,
    timeoutMs: 60_000,
  });
  const worker = new RuntimeWorker({
    runtime,
    artifacts,
    worker: {
      id: "alpha-mastering-fixture",
      queues: ["media"],
      capabilities: [
        "media.background-recovery",
        "media.chroma-extract",
        "media.raster",
        "quality.sprite-frame",
        "evidence.bundle",
      ],
    },
    handlers: createBuiltinHandlers([root]),
  });

  const run = await worker.runOnce();
  assert.equal(run.succeeded, 1);
  const completed = await runtime.get(job.id);
  assert.equal(completed.state, "succeeded");

  const mastered = await descriptorByRole(
    artifacts,
    completed.outputArtifacts,
    "provider-candidate-alpha-master",
  );
  const evidence = await descriptorByRole(
    artifacts,
    completed.outputArtifacts,
    "candidate-finalization-evidence",
  );
  assert.ok(mastered, "missing mastered candidate artifact");
  assert.ok(evidence, "missing mastering evidence artifact");
  assert.equal(mastered.storageClass, "intermediate");
  assert.equal(mastered.mediaType, "image/png");
  assert.equal(mastered.labels.approvalState, "unapproved");
  assert.equal(mastered.labels.finalDeliverable, "false");
  assert.deepEqual(mastered.sourceArtifacts, [candidate.artifactId]);
  assert.equal((await artifacts.verify(mastered.artifactId)).contentValid, true);
  assert.equal((await artifacts.verify(evidence.artifactId)).contentValid, true);

  const proof = JSON.parse((await artifacts.read(evidence.artifactId)).toString("utf8"));
  assert.equal(proof.sourceCandidate.artifactId, candidate.artifactId);
  assert.equal(proof.masteredCandidate.artifactId, mastered.artifactId);
  assert.equal(proof.approvalState, "unapproved");
  assert.equal(proof.background.extraction.matte.hex, "#00ff00");
  assert.ok(proof.background.extraction.output.transparentPixels > 0);
  assert.ok(proof.background.extraction.output.partialPixels > 0);
  assert.equal(proof.quality.source.hasAlpha, true);
  assert.equal(proof.promotionEligible, proof.quality.passed);
  assert.deepEqual(await artifacts.listReferences("projects/fixture"), []);
});

test("mastering worker rejects candidates that are not declared as immutable inputs", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-alpha-lineage-"));
  const artifacts = new LocalArtifactStore({ root: path.join(root, "artifacts") });
  const runtime = new LocalRuntimeRepository({ root: path.join(root, "runtime") });
  const candidate = await artifacts.put(CHROMA_CANDIDATE, {
    mediaType: "image/png",
    storageClass: "intermediate",
    labels: {
      artifactRole: "provider-candidate",
      approvalState: "unapproved",
    },
  });
  const job = await runtime.submit({
    queue: "media",
    kind: "art.candidate.master-alpha",
    idempotencyKey: "missing-lineage",
    payload: {
      candidateArtifactId: candidate.artifactId,
      matteColour: "#00ff00",
    },
    inputArtifacts: [],
    requiredCapabilities: [
      "media.background-recovery",
      "media.chroma-extract",
      "media.raster",
      "quality.sprite-frame",
      "evidence.bundle",
    ],
    maximumAttempts: 1,
  });
  const worker = new RuntimeWorker({
    runtime,
    artifacts,
    worker: {
      id: "alpha-lineage-fixture",
      queues: ["media"],
      capabilities: [
        "media.background-recovery",
        "media.chroma-extract",
        "media.raster",
        "quality.sprite-frame",
        "evidence.bundle",
      ],
    },
    handlers: createBuiltinHandlers([root]),
  });
  const run = await worker.runOnce();
  assert.equal(run.failed, 1);
  const failed = await runtime.get(job.id);
  assert.equal(failed.state, "failed");
  assert.equal(failed.failure.code, "MASTERING_INPUT_LINEAGE_MISSING");
});
