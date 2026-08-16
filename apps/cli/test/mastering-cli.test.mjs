import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  access,
  mkdtemp,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";

const cwd = new URL("..", import.meta.url);
const CHROMA_CANDIDATE = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAA4AAAAOCAYAAAAfSC3RAAAAV0lEQVR4nNWSwQ3AIAwDL1X3gtEYDSZLvy0kjRRe+OfI97AVQVESujLQFni/Te3/4V4dEKA1G5rvCwhQxtePsmbcjhJs7YIqSTCS2dHqFILeqrPknJd7AGinDiGIWd0pAAAAAElFTkSuQmCC",
  "base64",
);

test("CLI inspects transparency without writing a recovered file", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-inspect-alpha-cli-"));
  const input = path.join(root, "candidate.png");
  await writeFile(input, CHROMA_CANDIDATE);
  const result = spawnSync(
    process.execPath,
    ["dist/index.js", "inspect-alpha", "--input", input],
    { cwd, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
  );
  assert.equal(result.status, 0, result.stderr);
  const inspection = JSON.parse(result.stdout);
  assert.equal(inspection.writesPerformed, false);
  assert.equal(inspection.recoveryStrategy, "inferred-high-chroma-key");
  assert.deepEqual(await readdir(root), ["candidate.png"]);
});

test("CLI writes a deterministic unapproved alpha master and evidence", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-master-cli-"));
  const input = path.join(root, "candidate.png");
  const output = path.join(root, "candidate.alpha.png");
  const evidence = path.join(root, "candidate.alpha.evidence.json");
  const expectations = path.join(root, "frame-quality.json");
  const protectMask = path.join(root, "protect-mask.png");
  const proofPath = path.join(root, "candidate.alpha.proof.png");
  await writeFile(input, CHROMA_CANDIDATE);
  const maskPixels = Buffer.alloc(14 * 14 * 4);
  maskPixels[(7 * 14 + 7) * 4 + 3] = 255;
  await sharp(maskPixels, { raw: { width: 14, height: 14, channels: 4 } })
    .png()
    .toFile(protectMask);
  await writeFile(
    expectations,
    JSON.stringify({
      frameId: "hero-idle-down-001",
      safePadding: 1,
      maximumHaloFraction: 1,
      maximumUnexpectedTransparentRgbFraction: 1,
    }),
  );
  const result = spawnSync(
    process.execPath,
    [
      "dist/index.js",
      "master-alpha",
      "--input",
      input,
      "--output",
      output,
      "--evidence",
      evidence,
      "--expectations",
      expectations,
      "--protect-mask",
      protectMask,
      "--proof",
      proofPath,
      "--opaque-seed-distance",
      "300",
      "--edge-search-radius",
      "8",
      "--bleed-radius",
      "2",
      "--suppress-chroma-spill",
    ],
    { cwd, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
  );
  assert.equal(result.status, 0, result.stderr);
  const summary = JSON.parse(result.stdout);
  assert.equal(summary.approvalState, "unapproved");
  assert.equal(summary.qualityPassed, true);
  assert.equal(summary.outputSha256.length, 64);
  assert.equal(summary.chromaSpillSuppressed, true);
  assert.equal(summary.artistGuidanceApplied, true);
  assert.equal(summary.proofPath, proofPath);
  await access(output);
  await access(evidence);
  await access(proofPath);
  const proof = JSON.parse(await readFile(evidence, "utf8"));
  assert.equal(proof.schemaVersion, "2.0");
  assert.equal(proof.approvalState, "unapproved");
  assert.equal(proof.promotionEligible, true);
  assert.equal(proof.extraction.strategy, "inferred-high-chroma-key");
  assert.equal(proof.extraction.matte.hex, "#00ff00");
  assert.equal(proof.spillSuppression.matte.hex, "#00ff00");
  assert.equal(proof.guidance.protectMask.interpretation, "alpha");
  assert.equal(proof.transparencyProof.evidence.checkerboardUsed, false);
  assert.ok(proof.extraction.output.transparentPixels > 0);
  assert.ok(proof.extraction.output.partialPixels > 0);
  assert.equal(proof.quality.passed, true);
});

test("CLI carries a classifier-proven provider matte into spill suppression", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-master-inferred-cli-"));
  const input = path.join(root, "candidate.png");
  const output = path.join(root, "candidate.alpha.png");
  const evidence = path.join(root, "candidate.alpha.evidence.json");
  const expectations = path.join(root, "frame-quality.json");
  const pixels = Buffer.alloc(96 * 96 * 4);
  for (let y = 0; y < 96; y += 1) {
    for (let x = 0; x < 96; x += 1) {
      const offset = (y * 96 + x) * 4;
      const colour =
        x >= 31 && x <= 64 && y >= 20 && y <= 80
          ? [225, 95, 45, 255]
          : [33, 232, 28, 255];
      pixels.set(colour, offset);
    }
  }
  await sharp(pixels, { raw: { width: 96, height: 96, channels: 4 } })
    .png()
    .toFile(input);
  await writeFile(
    expectations,
    JSON.stringify({
      frameId: "provider-matte-inference",
      safePadding: 1,
      maximumHaloFraction: 1,
      maximumUnexpectedTransparentRgbFraction: 1,
    }),
  );
  const result = spawnSync(
    process.execPath,
    [
      "dist/index.js",
      "master-alpha",
      "--input",
      input,
      "--matte",
      "#13f00c",
      "--output",
      output,
      "--evidence",
      evidence,
      "--expectations",
      expectations,
      "--suppress-chroma-spill",
    ],
    { cwd, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
  );
  assert.equal(result.status, 0, result.stderr);
  const proof = JSON.parse(await readFile(evidence, "utf8"));
  assert.equal(proof.extraction.strategy, "inferred-high-chroma-key");
  assert.equal(proof.extraction.matte.hex, "#21e81c");
  assert.equal(proof.spillSuppression.matte.hex, "#21e81c");
  assert.equal(
    proof.spillSuppression.thresholds.inferredMatteAccepted,
    true,
  );
  assert.equal(proof.quality.passed, true);
});

test("CLI rejects an invalid declared matte before changing any pixels", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-master-cli-fail-"));
  const input = path.join(root, "candidate.png");
  const output = path.join(root, "candidate.alpha.png");
  await writeFile(input, CHROMA_CANDIDATE);
  const result = spawnSync(
    process.execPath,
    [
      "dist/index.js",
      "master-alpha",
      "--input",
      input,
      "--matte",
      "not-a-colour",
      "--output",
      output,
    ],
    { cwd, encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  const error = JSON.parse(result.stderr);
  assert.equal(error.error.code, "BACKGROUND_RECOVERY_MATTE_INVALID");
});

test("CLI refuses to overwrite its immutable source", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-master-cli-source-"));
  const input = path.join(root, "candidate.png");
  await writeFile(input, CHROMA_CANDIDATE);
  const before = await readFile(input);
  const result = spawnSync(
    process.execPath,
    ["dist/index.js", "master-alpha", "--input", input, "--output", input],
    { cwd, encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /non-destructive/u);
  assert.deepEqual(await readFile(input), before);
});
