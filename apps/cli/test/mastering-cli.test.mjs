import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { access, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const cwd = new URL("..", import.meta.url);
const CHROMA_CANDIDATE = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAA4AAAAOCAYAAAAfSC3RAAAAV0lEQVR4nNWSwQ3AIAwDL1X3gtEYDSZLvy0kjRRe+OfI97AVQVESujLQFni/Te3/4V4dEKA1G5rvCwhQxtePsmbcjhJs7YIqSTCS2dHqFILeqrPknJd7AGinDiGIWd0pAAAAAElFTkSuQmCC",
  "base64",
);

test("CLI writes a deterministic unapproved alpha master and evidence", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-master-cli-"));
  const input = path.join(root, "candidate.png");
  const output = path.join(root, "candidate.alpha.png");
  const evidence = path.join(root, "candidate.alpha.evidence.json");
  const expectations = path.join(root, "frame-quality.json");
  await writeFile(input, CHROMA_CANDIDATE);
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
      "--matte",
      "#00ff00",
      "--output",
      output,
      "--evidence",
      evidence,
      "--expectations",
      expectations,
      "--opaque-seed-distance",
      "300",
      "--edge-search-radius",
      "8",
      "--bleed-radius",
      "2",
    ],
    { cwd, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
  );
  assert.equal(result.status, 0, result.stderr);
  const summary = JSON.parse(result.stdout);
  assert.equal(summary.approvalState, "unapproved");
  assert.equal(summary.qualityPassed, true);
  assert.equal(summary.outputSha256.length, 64);
  await access(output);
  await access(evidence);
  const proof = JSON.parse(await readFile(evidence, "utf8"));
  assert.equal(proof.approvalState, "unapproved");
  assert.equal(proof.promotionEligible, true);
  assert.equal(proof.extraction.matte.hex, "#00ff00");
  assert.ok(proof.extraction.output.transparentPixels > 0);
  assert.ok(proof.extraction.output.partialPixels > 0);
  assert.equal(proof.quality.passed, true);
});

test("CLI fails closed when the declared matte is absent", async () => {
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
      "#0000ff",
      "--output",
      output,
    ],
    { cwd, encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  const error = JSON.parse(result.stderr);
  assert.equal(error.error.code, "CHROMA_KEY_BORDER_MATTE_INSUFFICIENT");
});
