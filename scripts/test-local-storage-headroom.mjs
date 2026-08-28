import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  DEFAULT_MINIMUM_FREE_BYTES,
  DEFAULT_MINIMUM_FREE_PERCENT,
  evaluateStorageHeadroom,
  inspectArtStudioStorage,
  storageThresholds,
} from "./check-local-storage-headroom.mjs";

test("storage thresholds use conservative defaults and validate overrides", () => {
  const defaults = storageThresholds({});
  assert.equal(defaults.minimumFreeBytes, DEFAULT_MINIMUM_FREE_BYTES);
  assert.equal(defaults.minimumFreePercent, DEFAULT_MINIMUM_FREE_PERCENT);
  assert.equal(storageThresholds({ EVAVO_ART_MIN_FREE_BYTES: "0", EVAVO_ART_MIN_FREE_PERCENT: "0" }).minimumFreeBytes, 0);
  assert.throws(
    () => storageThresholds({ EVAVO_ART_MIN_FREE_BYTES: "-1" }),
    /must be an integer/u,
  );
  assert.throws(
    () => storageThresholds({ EVAVO_ART_MIN_FREE_PERCENT: "101" }),
    /must be a number/u,
  );
});

test("headroom evaluation requires both absolute bytes and percentage", () => {
  const thresholds = { minimumFreeBytes: 1_000, minimumFreePercent: 10 };
  const passed = evaluateStorageHeadroom(
    { blockSize: 100n, availableBlocks: 20n, totalBlocks: 100n },
    thresholds,
  );
  assert.equal(passed.passed, true);
  assert.equal(passed.freeBytes, "2000");
  assert.equal(passed.freePercent, 20);

  const byteFailure = evaluateStorageHeadroom(
    { blockSize: 100n, availableBlocks: 5n, totalBlocks: 10n },
    thresholds,
  );
  assert.equal(byteFailure.byteHeadroomPassed, false);
  assert.equal(byteFailure.percentHeadroomPassed, true);
  assert.equal(byteFailure.passed, false);

  const percentFailure = evaluateStorageHeadroom(
    { blockSize: 1_000n, availableBlocks: 5n, totalBlocks: 100n },
    thresholds,
  );
  assert.equal(percentFailure.byteHeadroomPassed, true);
  assert.equal(percentFailure.percentHeadroomPassed, false);
  assert.equal(percentFailure.passed, false);
});

test("real local roots are inspected without creating runtime or artifact directories", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "evavo-storage-headroom-"));
  try {
    const runtimeRoot = path.join(root, "not-created", "runtime");
    const artifactRoot = path.join(root, "not-created", "artifacts");
    const report = inspectArtStudioStorage({
      root,
      runtimeRoot,
      artifactRoot,
      minimumFreeBytes: 0,
      minimumFreePercent: 0,
    });
    assert.equal(report.status, "passed");
    assert.equal(fs.existsSync(runtimeRoot), false);
    assert.equal(fs.existsSync(artifactRoot), false);
    assert.equal(report.authority.storageMutation, false);
    assert.equal(report.authority.providerExecution, false);
    assert.equal(report.volumes.length, 2);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("low storage is blocking and retains the complete report as evidence", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "evavo-storage-low-"));
  try {
    assert.throws(
      () =>
        inspectArtStudioStorage({
          root,
          minimumFreeBytes: Number.MAX_SAFE_INTEGER,
          minimumFreePercent: 100,
        }),
      (error) =>
        error?.code === "ART_STUDIO_STORAGE_HEADROOM_LOW" &&
        error.details?.status === "failed" &&
        error.details?.volumes?.length === 2,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
