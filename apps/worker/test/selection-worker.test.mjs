import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { LocalArtifactStore } from "@evavo/art-artifacts";
import {
  LocalRuntimeRepository,
  RuntimeWorker,
} from "@evavo/art-runtime";
import sharp from "sharp";

import { createBuiltinHandlers } from "../dist/index.js";

async function image(x, colour) {
  const width = 32;
  const height = 32;
  const data = Buffer.alloc(width * height * 4);
  for (let y = 6; y < 26; y += 1) {
    for (let column = x; column < x + 14; column += 1) {
      const offset = (y * width + column) * 4;
      data[offset] = colour[0];
      data[offset + 1] = colour[1];
      data[offset + 2] = colour[2];
      data[offset + 3] = 255;
    }
  }
  return sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

async function artifactByRole(artifacts, artifactIds, role) {
  for (const artifactId of artifactIds) {
    const artifact = await artifacts.get(artifactId);
    if (artifact?.labels.artifactRole === role) return artifact;
  }
  return null;
}

function runtimeDiagnostic(run, job) {
  return JSON.stringify(
    {
      run,
      state: job?.state,
      failure: job?.failure,
      attempts: job?.attempts,
      outputArtifacts: job?.outputArtifacts,
    },
    null,
    2,
  );
}

test("durable worker selects and promotes only through separate governed jobs", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-selection-worker-"));
  const artifacts = new LocalArtifactStore({ root: path.join(root, "artifacts") });
  const runtime = new LocalRuntimeRepository({ root: path.join(root, "runtime") });
  const reference = await artifacts.put(await image(9, [220, 40, 48]), {
    mediaType: "image/png",
    storageClass: "source",
    fileName: "canonical.png",
    labels: { artifactRole: "canonical-identity", approvalState: "approved" },
  });
  const candidate = async (fileName, bytes) =>
    artifacts.put(bytes, {
      mediaType: "image/png",
      storageClass: "intermediate",
      fileName,
      sourceArtifacts: [reference.artifactId],
      labels: {
        artifactRole: "provider-candidate-alpha-master",
        approvalState: "unapproved",
        qualityState: "passed",
        finalDeliverable: "false",
      },
    });
  const good = await candidate("good.png", await image(10, [220, 40, 48]));
  const weak = await candidate("weak.png", await image(3, [30, 80, 220]));
  const selectionRequest = {
    schemaVersion: "1.0",
    selectionId: "worker-selection",
    candidateArtifactIds: [good.artifactId, weak.artifactId],
    referenceArtifactId: reference.artifactId,
    policy: {
      profile: "custom",
      allowAutomaticSelection: true,
      metrics: [
        { id: "silhouette-iou", weight: 0.45, minimum: 0.2, blocking: true },
        { id: "palette-similarity", weight: 0.35, minimum: 0.2, blocking: true },
        { id: "centroid-similarity", weight: 0.2, minimum: 0.3, blocking: true },
      ],
      externalEvidence: [],
      minimumOverallScore: 0.4,
      minimumWinnerMargin: 0.03,
      maximumTranslationPixels: 4,
    },
  };
  const selectionJob = await runtime.submit({
    queue: "selection",
    kind: "art.candidate.select",
    idempotencyKey: "worker-selection",
    payload: selectionRequest,
    inputArtifacts: [reference.artifactId, good.artifactId, weak.artifactId],
    requiredCapabilities: ["selection.compare", "evidence.bundle"],
    leaseDurationMs: 10_000,
    timeoutMs: 60_000,
  });
  const worker = new RuntimeWorker({
    runtime,
    artifacts,
    worker: {
      id: "selection-worker-fixture",
      queues: ["selection"],
      capabilities: [
        "selection.compare",
        "selection.promote",
        "artifacts.store",
        "evidence.bundle",
      ],
    },
    handlers: createBuiltinHandlers([root]),
  });
  const firstRun = await worker.runOnce();
  const selectedJob = await runtime.get(selectionJob.id);
  assert.equal(firstRun.succeeded, 1, runtimeDiagnostic(firstRun, selectedJob));
  assert.equal(selectedJob.state, "succeeded", runtimeDiagnostic(firstRun, selectedJob));
  assert.equal(selectedJob.outputArtifacts.length, 2);
  const selectionEvidence = await artifactByRole(
    artifacts,
    selectedJob.outputArtifacts,
    "candidate-selection-evidence",
  );
  assert.ok(selectionEvidence, "selection evidence artifact must be retained");
  const selectionEvidenceId = selectionEvidence.artifactId;
  const selectionBody = JSON.parse(
    (await artifacts.read(selectionEvidenceId)).toString("utf8"),
  );
  assert.equal(selectionBody.decision, "selected");
  assert.equal(selectionBody.selectedCandidateArtifactId, good.artifactId);
  assert.equal(
    await artifacts.resolveReference("projects/worker", "approved-master"),
    null,
    "selection itself must not mutate the approved reference",
  );

  const promotionJob = await runtime.submit({
    queue: "selection",
    kind: "art.candidate.promote",
    idempotencyKey: "worker-promotion",
    payload: {
      schemaVersion: "1.0",
      promotionId: "worker-promotion",
      selectionEvidenceArtifactId: selectionEvidenceId,
      candidateArtifactId: good.artifactId,
      target: {
        namespace: "projects/worker",
        name: "approved-master",
        expectedGeneration: 0,
      },
      approval: { mode: "automatic" },
      actor: "worker-fixture",
    },
    inputArtifacts: [selectionEvidenceId, good.artifactId],
    requiredCapabilities: [
      "selection.promote",
      "artifacts.store",
      "evidence.bundle",
    ],
    leaseDurationMs: 10_000,
    timeoutMs: 60_000,
  });
  const secondRun = await worker.runOnce();
  const promotedJob = await runtime.get(promotionJob.id);
  assert.equal(secondRun.succeeded, 1, runtimeDiagnostic(secondRun, promotedJob));
  assert.equal(promotedJob.state, "succeeded", runtimeDiagnostic(secondRun, promotedJob));
  assert.equal(promotedJob.outputArtifacts.length, 3);
  const approved = await artifacts.resolveReference(
    "projects/worker",
    "approved-master",
  );
  assert.equal(approved.generation, 1);
  assert.equal(approved.actor, "worker-fixture");
  const master = await artifacts.get(approved.artifactId);
  assert.equal(master.storageClass, "master");
  assert.equal(master.labels.artifactRole, "selected-art-master");
  assert.ok(master.sourceArtifacts.includes(selectionEvidenceId));
  const authorization = await artifactByRole(
    artifacts,
    promotedJob.outputArtifacts,
    "candidate-promotion-authorization",
  );
  assert.ok(authorization, "promotion authorization evidence must be retained");
});
