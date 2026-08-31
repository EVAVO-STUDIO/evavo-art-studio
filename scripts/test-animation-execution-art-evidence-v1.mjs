#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import {
  animationDrawingEvidenceSha256,
  assertAnimationDrawingInspectionEvidenceIntegrity,
  compileAnimationDrawingInspectionEvidence,
  writeAnimationDrawingInspectionEvidence,
} from "./compile-animation-drawing-inspection-evidence-v1.mjs";
import { consumeArtDrawingInspectionEvidence } from "./animation-execution-adapters/art-drawing-inspection-bridge-v1.mjs";

const ZERO = `sha256:${"0".repeat(64)}`;
const ONE = `sha256:${"1".repeat(64)}`;
const ARTIFACT = `artifact_${"2".repeat(64)}`;

function evidence() {
  return {
    drawingId: "drawing.1",
    artifactId: ARTIFACT,
    contentDigest: ONE,
    attempt: 1,
    width: 128,
    height: 128,
    meaningfulAlpha: true,
    unsafeEdgeContactPixels: 0,
    scores: {
      identity: 0.96,
      style: 0.95,
      silhouette: 0.94,
      camera: 0.99,
      anatomy: 0.95,
      palette: 0.96,
      motionReadability: 0.93,
    },
    findings: [],
  };
}

function input(workspaceRoot) {
  return {
    workspaceRoot,
    productionId: "production.test",
    profileDigest: ZERO,
    ledgerDigest: ONE,
    workOrderDigest: ZERO,
    drawingId: "drawing.1",
    attempt: 1,
    artifactId: ARTIFACT,
    contentDigest: ONE,
    reviewerId: "reviewer.art.test",
    reviewedAt: "2026-08-31T01:00:00.000Z",
    evidence: evidence(),
  };
}

async function main() {
  const root = await mkdtemp(resolve(tmpdir(), "evavo-art-animation-evidence-"));
  const workspaceRoot = resolve(root, "workspace");
  await mkdir(workspaceRoot, { recursive: true });
  try {
    const record = compileAnimationDrawingInspectionEvidence(input(workspaceRoot));
    assert.equal(
      record.evidenceDigest,
      animationDrawingEvidenceSha256(
        Object.fromEntries(
          Object.entries(record).filter(([key]) => key !== "evidenceDigest"),
        ),
      ),
    );
    assert.equal(assertAnimationDrawingInspectionEvidenceIntegrity(record), true);

    const writeResult = await writeAnimationDrawingInspectionEvidence(
      input(workspaceRoot),
    );
    assert.equal(writeResult.status, "written");

    const request = {
      phase: "drawing-inspector",
      productionId: "production.test",
      profileDigest: ZERO,
      ledgerDigest: ONE,
      workOrder: {
        workOrderDigest: ZERO,
        drawingId: "drawing.1",
        attempt: 1,
      },
      candidate: {
        artifactId: ARTIFACT,
        contentDigest: ONE,
      },
    };
    const result = await consumeArtDrawingInspectionEvidence(request, {
      workspaceRoot,
    });
    assert.equal(result.status, "inspected");
    assert.deepEqual(result.evidence, evidence());

    const path = resolve(
      workspaceRoot,
      "evidence/inbox/drawings/drawing.1-attempt-1.json",
    );
    const tampered = JSON.parse(await readFile(path, "utf8"));
    tampered.evidence.scores.identity = 0.1;
    await writeFile(path, `${JSON.stringify(tampered, null, 2)}\n`);
    await assert.rejects(
      consumeArtDrawingInspectionEvidence(request, { workspaceRoot }),
      /ANIMATION_DRAWING_INSPECTION_EVIDENCE_DIGEST_MISMATCH/u,
    );

    process.stdout.write("PASS Art Studio animation drawing evidence\n");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.stack ?? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
