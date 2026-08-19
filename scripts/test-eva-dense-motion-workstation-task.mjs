import assert from "node:assert/strict";
import fs from "node:fs";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { validateTask } from "./check-eva-dense-motion-workstation-task.mjs";
import {
  gitBlobSha1,
  inspectPngHeader,
  preflightEvaDenseMotionSources,
} from "./project-art/eva-dense-motion-source-preflight.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const task = JSON.parse(
  fs.readFileSync(
    path.join(root, "config/eva-dense-motion-workstation-task-v1.json"),
    "utf8",
  ),
);
const script = fs.readFileSync(
  path.join(root, "scripts/Invoke-EvaDenseMotionWorkstationValidation.ps1"),
  "utf8",
);
const preflight = fs.readFileSync(
  path.join(root, "scripts/project-art/eva-dense-motion-source-preflight.mjs"),
  "utf8",
);
const v5 = JSON.parse(
  fs.readFileSync(path.join(root, "config/automation-fabric-client-v5.json"), "utf8"),
);
const clone = (value) => structuredClone(value);

test("accepts planner-bound task with seven-frame preflight and ten-master planning", () => {
  const result = validateTask(clone(task), script, clone(v5), preflight);
  assert.equal(result.ok, true);
  assert.equal(result.minimumLocalStorageVersion, "0.48.9");
  assert.equal(result.sourcePreflightRequired, true);
  assert.equal(result.pendingOrdinalCount, 7);
  assert.equal(result.tenMasterPlanningAvailable, true);
  assert.equal(result.requiredNewMasterCount, 10);
  assert.equal(result.fallbackRemasterCount, 3);
  assert.equal(result.tenMasterExecutionByTask, false);
});

test("rejects weakened ten-master workstation planning", () => {
  const incomplete = clone(task);
  incomplete.tenMasterPlanning.requiredNewMasterCount = 7;
  assert.throws(
    () => validateTask(incomplete, script, clone(v5), preflight),
    /ten-master final coverage/u,
  );

  const executable = clone(task);
  executable.tenMasterPlanning.executionByThisTask = true;
  assert.throws(
    () => validateTask(executable, script, clone(v5), preflight),
    /ten-master planning authority/u,
  );

  const legacyFinal = clone(task);
  legacyFinal.tenMasterPlanning.legacyFallbackMaySatisfyFinalMasterGate = true;
  assert.throws(
    () => validateTask(legacyFinal, script, clone(v5), preflight),
    /ten-master planning authority/u,
  );
});

test("rejects execution without planner receipt", () => {
  const candidate = clone(task);
  candidate.worker.plannerReceiptRequired = false;
  assert.throws(
    () => validateTask(candidate, script, clone(v5), preflight),
    /Planner receipt/u,
  );
});

test("rejects missing filesystem capability", () => {
  const candidate = clone(task);
  candidate.worker.requiredCapabilities = candidate.worker.requiredCapabilities.filter(
    (entry) => entry !== "filesystem",
  );
  assert.throws(
    () => validateTask(candidate, script, clone(v5), preflight),
    /filesystem/u,
  );
});

test("rejects weaker Local Storage floor", () => {
  const candidate = clone(task);
  candidate.minimumLocalStorageVersion = "0.48.8";
  assert.throws(
    () => validateTask(candidate, script, clone(v5), preflight),
    /0\.48\.9/u,
  );
});

test("rejects v5 floor mismatch", () => {
  const candidate = clone(v5);
  candidate.minimumLocalStorageVersion = "0.48.8";
  assert.throws(
    () => validateTask(clone(task), script, candidate, preflight),
    /floor differs/u,
  );
});

test("rejects source repo or preflight drift", () => {
  const wrongRepo = clone(task);
  wrongRepo.sourceRepository = "EVAVO-STUDIO/other";
  assert.throws(
    () => validateTask(wrongRepo, script, clone(v5), preflight),
    /source repository/u,
  );

  const wrongPreflight = clone(task);
  wrongPreflight.sourcePreflightScript = "scripts/other.mjs";
  assert.throws(
    () => validateTask(wrongPreflight, script, clone(v5), preflight),
    /preflight path/u,
  );
});

test("rejects missing source identity enforcement", () => {
  const weakened = preflight.replaceAll("gitBlobSha1", "removedIdentityFunction");
  assert.throws(
    () => validateTask(clone(task), script, clone(v5), weakened),
    /gitBlobSha1/u,
  );
});

test("rejects worker repository push and provider authority", () => {
  for (const key of [
    "repositoryPush",
    "publication",
    "forcePush",
    "candidatePromotion",
    "providerExecution",
    "cloudinaryUpload",
    "runtimeActivation",
  ]) {
    const candidate = clone(task);
    candidate.authority[key] = true;
    assert.throws(
      () => validateTask(candidate, script, clone(v5), preflight),
      new RegExp(key, "u"),
    );
  }
});

test("rejects unsafe PowerShell primitives", () => {
  for (const injected of [
    "\nInvoke-Expression 'whoami'\n",
    "\ngit push origin main\n",
    "\nRemove-Item -Recurse .git\n",
    "\nexecutionByThisTask = $true\n",
  ]) {
    assert.throws(
      () => validateTask(clone(task), script + injected, clone(v5), preflight),
      /forbidden material/u,
    );
  }
});

function pngHeader({ width = 1024, height = 1536, colorType = 6 } = {}) {
  const buffer = Buffer.alloc(33);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(buffer);
  buffer.writeUInt32BE(13, 8);
  buffer.write("IHDR", 12, "ascii");
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  buffer[24] = 8;
  buffer[25] = colorType;
  buffer[26] = 0;
  buffer[27] = 0;
  buffer[28] = 0;
  return buffer;
}

async function sourceFixture() {
  const runtimeRoot = await mkdtemp(path.join(os.tmpdir(), "eva-dense-preflight-"));
  await mkdir(path.join(runtimeRoot, "assets", "eva-female"), { recursive: true });
  const frames = [];
  for (const ordinal of [1, 2, 3, 7, 8, 9, 10]) {
    const relativePath = `assets/eva-female/frame-${ordinal}.png`;
    const bytes = Buffer.concat([
      pngHeader({ colorType: ordinal % 2 === 0 ? 2 : 6 }),
      Buffer.from(`frame-${ordinal}`),
    ]);
    await writeFile(path.join(runtimeRoot, relativePath), bytes);
    frames.push({
      ordinal,
      frameId: `eva-20260809-153620-frame-${String(ordinal).padStart(2, "0")}`,
      relativePath,
      sourceGitBlobSha1: gitBlobSha1(bytes),
    });
  }
  return { runtimeRoot, frames };
}

test("source preflight parses the production canvas", () => {
  const value = inspectPngHeader(pngHeader());
  assert.equal(value.width, 1024);
  assert.equal(value.height, 1536);
  assert.equal(value.alphaChannelDeclared, true);
});

test("source preflight verifies all seven pending frames read-only", async () => {
  const fixture = await sourceFixture();
  const result = await preflightEvaDenseMotionSources(fixture);
  assert.equal(result.pendingFrameCount, 7);
  assert.deepEqual(result.pendingOrdinals, [1, 2, 3, 7, 8, 9, 10]);
  assert.equal(result.exactSourceIdentityVerified, true);
  assert.equal(result.exactCanvasVerified, true);
  assert.equal(result.sourceMutation, false);
  assert.equal(result.providerExecution, false);
  assert.equal(result.publication, false);
  assert.equal(new Set(result.sourceFrames.map((frame) => frame.sha256)).size, 7);
});

test("source preflight rejects byte identity drift", async () => {
  const fixture = await sourceFixture();
  fixture.frames[0] = {
    ...fixture.frames[0],
    sourceGitBlobSha1: "0".repeat(40),
  };
  await assert.rejects(
    () => preflightEvaDenseMotionSources(fixture),
    /GIT_BLOB_MISMATCH:1/u,
  );
});

test("source preflight rejects wrong canvas or palette encoding", () => {
  assert.throws(() => inspectPngHeader(pngHeader({ width: 512 })), /PNG_ENCODING_INVALID/u);
  assert.throws(() => inspectPngHeader(pngHeader({ colorType: 3 })), /PNG_ENCODING_INVALID/u);
});

test("source preflight rejects incomplete or reordered pending sets", async () => {
  const fixture = await sourceFixture();
  await assert.rejects(
    () =>
      preflightEvaDenseMotionSources({
        runtimeRoot: fixture.runtimeRoot,
        frames: fixture.frames.slice(0, 6),
      }),
    /PENDING_SET_INVALID/u,
  );
  const reordered = [...fixture.frames];
  [reordered[0], reordered[1]] = [reordered[1], reordered[0]];
  await assert.rejects(
    () => preflightEvaDenseMotionSources({ runtimeRoot: fixture.runtimeRoot, frames: reordered }),
    /PENDING_ORDER_INVALID/u,
  );
});
