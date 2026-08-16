#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { compileProjectArtAtlas } from "./project-art/atlas.mjs";

const temporary = await mkdtemp(path.join(os.tmpdir(), "evavo-atlas-contract-"));
try {
  const sourcePath = path.join(temporary, "frame.png");
  const sourceBytes = Buffer.from("compiler-contract-fixture", "utf8");
  await writeFile(sourcePath, sourceBytes);
  const expectedSha256 = createHash("sha256").update(sourceBytes).digest("hex");
  const request = {
    schema: "evavo.project-art-atlas-request.v1",
    atlasId: "alpha-safe-contract",
    projectId: "test-game",
    allowedSourceRoots: [temporary],
    frames: [{
      id: "frame/01",
      sourcePath,
      expectedSha256,
      expectedBytes: sourceBytes.length,
    }],
    options: {
      alphaThreshold: 4,
    },
  };
  const plan = await compileProjectArtAtlas(request, {
    compiledAt: "2026-08-16T00:00:00.000Z",
  });
  assert.equal(plan.frames[0].contentSha256, expectedSha256);
  assert.equal(plan.options.transparentRgbBleed, true);
  assert.equal(plan.options.transparentRgbBleedRadius, 8);
  assert.equal(plan.options.transparentRgbAlphaThreshold, 4);
  assert.match(plan.planSha256, /^[a-f0-9]{64}$/u);

  await assert.rejects(
    () => compileProjectArtAtlas(
      { ...request, options: { transparentRgbBleed: "yes" } },
      { compiledAt: "2026-08-16T00:00:00.000Z" },
    ),
    /options\.transparentRgbBleed must be boolean/u,
  );
  await assert.rejects(
    () => compileProjectArtAtlas(
      { ...request, options: { transparentRgbBleedRadius: 65 } },
      { compiledAt: "2026-08-16T00:00:00.000Z" },
    ),
    /options\.transparentRgbBleedRadius must be an integer between 0 and 64/u,
  );
  await assert.rejects(
    () => compileProjectArtAtlas(
      { ...request, options: { transparentRgbAlphaThreshold: 255 } },
      { compiledAt: "2026-08-16T00:00:00.000Z" },
    ),
    /options\.transparentRgbAlphaThreshold must be an integer between 0 and 254/u,
  );

  console.log("Project-art atlas compiler contract regressions passed");
} finally {
  await rm(temporary, { recursive: true, force: true });
}
