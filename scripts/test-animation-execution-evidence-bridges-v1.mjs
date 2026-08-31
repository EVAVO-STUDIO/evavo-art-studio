#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

async function discoverRoots() {
  const ownRoot = await realpath(resolve(HERE, ".."));
  const name = basename(ownRoot).toLowerCase();
  if (name === "evavo-art-studio") {
    return {
      ownRoot,
      artRoot: ownRoot,
      celRoot: resolve(ownRoot, "..", "cel-animation-studio"),
    };
  }
  if (name === "cel-animation-studio") {
    return {
      ownRoot,
      artRoot: resolve(ownRoot, "..", "evavo-art-studio"),
      celRoot: ownRoot,
    };
  }
  if (name === "shared") {
    const patchRoot = resolve(ownRoot, "..");
    return {
      ownRoot,
      artRoot: resolve(patchRoot, "art-studio"),
      celRoot: resolve(patchRoot, "cel-animation-studio"),
    };
  }
  throw new Error("ANIMATION_EXECUTION_TEST_REPOSITORY_IDENTITY_UNKNOWN");
}

const ZERO = `sha256:${"0".repeat(64)}`;
const ONE = `sha256:${"1".repeat(64)}`;
const ARTIFACT = `artifact_${"2".repeat(64)}`;

function drawingEvidence() {
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

function drawingInput(workspaceRoot) {
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
    evidence: drawingEvidence(),
  };
}

function sequenceInput(workspaceRoot) {
  return {
    workspaceRoot,
    productionId: "production.test",
    profileDigest: ZERO,
    ledgerDigest: ONE,
    ledgerRevision: 2,
    reviewCycle: 1,
    reviewerId: "reviewer.cel.test",
    reviewedAt: "2026-08-31T01:05:00.000Z",
    drawingEvidence: [drawingEvidence()],
    sequenceEvidence: {
      normalSpeedReviewed: true,
      frameByFrameReviewed: true,
      timingReadabilityScore: 0.95,
      motionReadabilityScore: 0.94,
      styleContinuityScore: 0.96,
      cameraContinuityScore: 0.98,
      loopSeamScore: 0.93,
      affectedDrawingIds: [],
      findings: [],
    },
  };
}

async function command(path, message, environment) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [path], {
      cwd: process.cwd(),
      env: environment,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", rejectPromise);
    child.on("close", (code) => {
      if (code !== 0) {
        rejectPromise(new Error(Buffer.concat(stderr).toString("utf8")));
        return;
      }
      resolvePromise(JSON.parse(Buffer.concat(stdout).toString("utf8")));
    });
    child.stdin.end(`${JSON.stringify(message)}\n`);
  });
}

async function main() {
  const roots = await discoverRoots();
  const drawingCompiler = await import(
    pathToFileURL(
      resolve(
        roots.artRoot,
        "scripts/compile-animation-drawing-inspection-evidence-v1.mjs",
      ),
    ).href
  );
  const drawingBridge = await import(
    pathToFileURL(
      resolve(
        roots.artRoot,
        "scripts/animation-execution-adapters/art-drawing-inspection-bridge-v1.mjs",
      ),
    ).href
  );
  const sequenceCompiler = await import(
    pathToFileURL(
      resolve(
        roots.celRoot,
        "scripts/compile-animation-independent-sequence-evidence-v1.mjs",
      ),
    ).href
  );
  const sequenceBridge = await import(
    pathToFileURL(
      resolve(
        roots.celRoot,
        "scripts/animation-execution-adapters/cel-sequence-review-bridge-v1.mjs",
      ),
    ).href
  );
  const {
    animationDrawingEvidenceSha256,
    compileAnimationDrawingInspectionEvidence,
    writeAnimationDrawingInspectionEvidence,
  } = drawingCompiler;
  const { consumeArtDrawingInspectionEvidence } = drawingBridge;
  const {
    animationSequenceEvidenceSha256,
    compileAnimationIndependentSequenceEvidence,
    writeAnimationIndependentSequenceEvidence,
  } = sequenceCompiler;
  const { consumeCelIndependentSequenceEvidence } = sequenceBridge;

  const root = await mkdtemp(resolve(tmpdir(), "evavo-animation-evidence-"));
  const workspaceRoot = resolve(root, "workspace");
  await mkdir(workspaceRoot, { recursive: true });
  try {
    const drawingRecord = compileAnimationDrawingInspectionEvidence(
      drawingInput(workspaceRoot),
    );
    assert.equal(
      drawingRecord.evidenceDigest,
      animationDrawingEvidenceSha256(
        Object.fromEntries(
          Object.entries(drawingRecord).filter(([key]) => key !== "evidenceDigest"),
        ),
      ),
    );
    const drawingWrite = await writeAnimationDrawingInspectionEvidence(
      drawingInput(workspaceRoot),
    );
    assert.equal(drawingWrite.status, "written");
    const drawingResult = await consumeArtDrawingInspectionEvidence(
      {
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
      },
      { workspaceRoot },
    );
    assert.equal(drawingResult.status, "inspected");
    assert.deepEqual(drawingResult.evidence, drawingEvidence());

    const drawingPath = resolve(
      workspaceRoot,
      "evidence/inbox/drawings/drawing.1-attempt-1.json",
    );
    const tampered = JSON.parse(await readFile(drawingPath, "utf8"));
    tampered.evidence.scores.identity = 0.1;
    await writeFile(drawingPath, `${JSON.stringify(tampered, null, 2)}\n`);
    await assert.rejects(
      consumeArtDrawingInspectionEvidence(
        {
          phase: "drawing-inspector",
          productionId: "production.test",
          profileDigest: ZERO,
          ledgerDigest: ONE,
          workOrder: {
            workOrderDigest: ZERO,
            drawingId: "drawing.1",
            attempt: 1,
          },
          candidate: { artifactId: ARTIFACT, contentDigest: ONE },
        },
        { workspaceRoot },
      ),
      /ANIMATION_DRAWING_INSPECTION_EVIDENCE_DIGEST_MISMATCH/u,
    );
    await writeFile(drawingPath, `${JSON.stringify(drawingRecord, null, 2)}\n`);

    const sequenceRecord = compileAnimationIndependentSequenceEvidence(
      sequenceInput(workspaceRoot),
    );
    assert.equal(
      sequenceRecord.evidenceDigest,
      animationSequenceEvidenceSha256(
        Object.fromEntries(
          Object.entries(sequenceRecord).filter(([key]) => key !== "evidenceDigest"),
        ),
      ),
    );
    const sequenceWrite = await writeAnimationIndependentSequenceEvidence(
      sequenceInput(workspaceRoot),
    );
    assert.equal(sequenceWrite.status, "written");
    const sequenceResult = await consumeCelIndependentSequenceEvidence(
      {
        phase: "sequence-reviewer",
        productionId: "production.test",
        profileDigest: ZERO,
        ledgerDigest: ONE,
        ledgerRevision: 2,
        reviewCycle: 1,
      },
      { workspaceRoot },
    );
    assert.equal(sequenceResult.status, "reviewed");
    assert.equal(sequenceResult.drawingEvidence.length, 1);

    const providerBridge = resolve(
      roots.artRoot,
      "scripts/animation-execution-adapters/art-provider-bridge-v1.mjs",
    );
    const providerResult = await command(
      providerBridge,
      {
        schema: "evavo.animation-execution-adapter-input.v1",
        phase: "frame-provider",
        productionId: "production.test",
        profileDigest: ZERO,
        ledgerDigest: ONE,
        ledgerRevision: 0,
        workOrder: {
          workOrderDigest: ZERO,
          drawingId: "drawing.1",
          attempt: 1,
        },
        runtime: {
          artifactOutputPath: resolve(workspaceRoot, "candidate.png"),
          artifactRoot: resolve(workspaceRoot, "artifacts"),
          workspaceRoot,
        },
      },
      {
        ...process.env,
        EVAVO_ART_ARTIFACT_ROOT: resolve(workspaceRoot, "provider-artifacts"),
        EVAVO_ANIMATION_ALLOWED_PROVIDER_ADAPTERS: "local.comfyui",
      },
    );
    assert.equal(providerResult.status, "unavailable");
    assert.equal(providerResult.reason, "ART_PROVIDER_RUNTIME_BUILD_REQUIRED");

    const report = {
      schema: "evavo.animation-execution-evidence-bridge-test-report.v1",
      status: "passed",
      checks: [
        "drawing evidence compiler and exact bridge binding",
        "drawing evidence tamper rejection",
        "independent sequence evidence compiler and bridge binding",
        "provider command bridge graceful unbuilt-runtime result",
      ],
    };
    if (process.env.EVAVO_ANIMATION_EVIDENCE_TEST_REPORT_PATH) {
      await writeFile(
        resolve(process.env.EVAVO_ANIMATION_EVIDENCE_TEST_REPORT_PATH),
        `${JSON.stringify(report, null, 2)}\n`,
      );
    }
    process.stdout.write("PASS animation execution evidence bridges\n");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
