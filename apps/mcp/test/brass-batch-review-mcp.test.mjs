import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  BRASS_ART_BATCH_REVIEW_SCHEMA,
  reviewArtBatchDirectory,
} from "../dist/batch-review.js";

const ALPHA_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAFklEQVR42mNgwAb+QwEDAwMDEwMhAABTQwf7ncptRgAAAABJRU5ErkJggg==",
  "base64",
);
const ALPHA_PNG_WITH_TRAILING_METADATA = Buffer.concat([
  ALPHA_PNG,
  Buffer.from("review-metadata", "utf8"),
]);
const OPAQUE_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAFklEQVR42mP8////fwYkwMSABggLAAAGXQQE3JAQuwAAAABJRU5ErkJggg==",
  "base64",
);

function temporaryRoots() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "evavo-art-batch-"));
  const game = path.join(root, "Brass_Brine");
  const evidence = path.join(root, "evidence");
  fs.mkdirSync(game);
  fs.mkdirSync(evidence);
  return {
    root,
    game,
    evidence,
    dispose() {
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

const expectations = {
  transparency: "alpha-required",
  expectedWidth: 4,
  expectedHeight: 4,
  safePadding: 1,
};

test("batch review analyses complete stable bytes and groups duplicates", async () => {
  const current = temporaryRoots();
  try {
    const batch = path.join(current.game, "RAW_ART", "icons");
    fs.mkdirSync(batch, { recursive: true });
    fs.writeFileSync(path.join(batch, "approved_a.png"), ALPHA_PNG);
    fs.writeFileSync(path.join(batch, "approved_b.png"), ALPHA_PNG);
    fs.writeFileSync(
      path.join(batch, "approved_visual_duplicate.png"),
      ALPHA_PNG_WITH_TRAILING_METADATA,
    );
    fs.writeFileSync(path.join(batch, "opaque_matte.png"), OPAQUE_PNG);

    const value = await reviewArtBatchDirectory({
      directoryPath: batch,
      roleId: "ui-icon",
      allowedRoots: [current.game, current.evidence],
      expectations,
      detail: "failures",
      maximumFiles: 10,
    });

    assert.equal(value.review, BRASS_ART_BATCH_REVIEW_SCHEMA);
    assert.equal(value.roleId, "ui-icon");
    assert.equal(value.technicalStatus, "blocked");
    assert.equal(value.discovery.supportedImageFiles, 4);
    assert.equal(value.discovery.truncated, false);
    assert.equal(value.summary.reviewedFiles, 4);
    assert.equal(value.summary.passedFiles, 3);
    assert.equal(value.summary.failedFiles, 1);
    assert.equal(value.summary.exactSourceDuplicateGroups, 1);
    assert.equal(value.summary.decodedPixelDuplicateGroups, 1);
    assert.deepEqual(value.duplicateGroups.exactSource[0].paths, [
      "approved_a.png",
      "approved_b.png",
    ]);
    assert.deepEqual(value.duplicateGroups.decodedPixels[0].paths, [
      "approved_a.png",
      "approved_b.png",
      "approved_visual_duplicate.png",
    ]);
    const opaque = value.items.find((item) => item.path === "opaque_matte.png");
    assert.ok(opaque);
    assert.equal(opaque.passed, false);
    assert.equal(
      opaque.technicalActions.includes("background-mastering-required"),
      true,
    );
    assert.ok(opaque.report);
    assert.equal(value.mutationPerformed, false);
    assert.equal(value.deletionAuthority, false);
    assert.match(value.batchIdentitySha256, /^[a-f0-9]{64}$/u);
  } finally {
    current.dispose();
  }
});

test("batch review retains exact source identity for decode failures", async () => {
  const current = temporaryRoots();
  try {
    const batch = path.join(current.game, "RAW_ART", "mixed-validity");
    fs.mkdirSync(batch, { recursive: true });
    fs.writeFileSync(path.join(batch, "good.png"), ALPHA_PNG);
    fs.writeFileSync(path.join(batch, "corrupt.png"), Buffer.from("not-a-png"));

    const value = await reviewArtBatchDirectory({
      directoryPath: batch,
      roleId: "ui-icon",
      allowedRoots: [current.game],
      expectations,
      maximumFiles: 10,
      detail: "failures",
    });

    assert.equal(value.summary.reviewedFiles, 2);
    assert.equal(value.summary.failedFiles, 1);
    const corrupt = value.items.find((item) => item.path === "corrupt.png");
    assert.ok(corrupt);
    assert.equal(corrupt.passed, false);
    assert.match(corrupt.sourceSha256, /^[a-f0-9]{64}$/u);
    assert.equal(corrupt.bytes, Buffer.byteLength("not-a-png"));
    assert.equal(corrupt.blockingGateIds.includes("file-review"), true);
  } finally {
    current.dispose();
  }
});

test("batch review fails closed on role, file limits and symbolic links", async (t) => {
  const current = temporaryRoots();
  try {
    const batch = path.join(current.game, "RAW_ART", "batch");
    fs.mkdirSync(batch, { recursive: true });
    fs.writeFileSync(path.join(batch, "one.png"), ALPHA_PNG);
    fs.writeFileSync(path.join(batch, "two.png"), ALPHA_PNG);

    await assert.rejects(
      () =>
        reviewArtBatchDirectory({
          directoryPath: batch,
          roleId: "Mixed Roles",
          allowedRoots: [current.game],
          expectations,
        }),
      /game-owned media role/iu,
    );
    await assert.rejects(
      () =>
        reviewArtBatchDirectory({
          directoryPath: batch,
          roleId: "ui-icon",
          allowedRoots: [current.game],
          expectations,
          maximumFiles: 1,
        }),
      /maximumFiles=1/iu,
    );

    const outside = path.join(current.evidence, "outside.png");
    fs.writeFileSync(outside, ALPHA_PNG);
    const link = path.join(batch, "linked.png");
    try {
      fs.symlinkSync(outside, link, "file");
    } catch (error) {
      if (error && typeof error === "object" && "code" in error) {
        t.skip(`symlinks unavailable: ${error.code}`);
        return;
      }
      throw error;
    }
    await assert.rejects(
      () =>
        reviewArtBatchDirectory({
          directoryPath: batch,
          roleId: "ui-icon",
          allowedRoots: [current.game, current.evidence],
          expectations,
          maximumFiles: 10,
        }),
      /symbolic-link entry/iu,
    );
  } finally {
    current.dispose();
  }
});
