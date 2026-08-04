import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  BOOK_STATE_SHADOW_IMPORT_CONTRACT,
  BOOK_STATE_SHADOW_ROLLBACK_CONTRACT,
  compileBookStateMigrationBundle,
  compileBookStateShadowRollbackPlan,
  prepareBookStateShadowImport,
} from "../../../packages/core/src/index.ts";
import {
  executor,
  fixture,
} from "../../../packages/core/test/book-studio-state-migration-bundle-fixtures.mjs";
import {
  FileBookStudioShadowStatePersistence,
} from "../src/lib/book-studio-shadow-state-persistence.ts";

async function prepared(overrides = {}) {
  const bundle = overrides.bundle ?? await fixture();
  const validation = await compileBookStateMigrationBundle(bundle, executor);
  const request = {
    outputKind: "evavo_docs_book_state_shadow_import_request",
    schemaVersion: 1,
    contract: BOOK_STATE_SHADOW_IMPORT_CONTRACT,
    authorityMode: "shadow_migration",
    importId: overrides.importId ?? "shadow-import-1",
    idempotencyKey: overrides.idempotencyKey ?? "shadow-import-project-1-v1",
    bundle,
    expectedValidationFingerprint: validation.bundleFingerprint,
    expectedCurrentRevision: overrides.expectedCurrentRevision ?? 0,
    expectedCurrentSnapshotFingerprint:
      overrides.expectedCurrentSnapshotFingerprint ?? null,
    requestedAt: overrides.requestedAt ?? "2026-08-04T02:00:00.000Z",
    requestedBy: "named-migration-operator",
    evidenceIds: ["migration-evidence-1"],
    authoritativeWritesAllowed: false,
    canonicalManuscriptMutationAllowed: false,
    runtimeCutoverApproved: false,
    sourceDeletionApproved: false,
    publicationPerformed: false,
  };
  return prepareBookStateShadowImport(request, executor);
}

async function onlyProjectDirectory(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const projects = entries.filter((entry) =>
    entry.isDirectory() && entry.name.startsWith("project-")
  );
  assert.equal(projects.length, 1);
  return path.join(root, projects[0].name);
}

test("atomically imports, replays and advances exact shadow revisions", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "book-shadow-import-"));
  const store = new FileBookStudioShadowStatePersistence(root);

  const firstPrepared = await prepared();
  const first = await store.importPrepared(firstPrepared);
  assert.equal(first.disposition, "written");
  assert.equal(first.receipt.revision, 1);
  assert.equal(first.receipt.previousSnapshotFingerprint, null);
  assert.equal(first.receipt.statePersisted, true);
  assert.equal(first.receipt.canonicalWriterEnabled, false);
  assert.equal(first.receipt.runtimeCutoverApproved, false);

  const replay = await store.importPrepared(firstPrepared);
  assert.equal(replay.disposition, "idempotent_replay");
  assert.equal(
    replay.receipt.receiptFingerprint,
    first.receipt.receiptFingerprint,
  );

  const secondBundle = await fixture();
  secondBundle.bundleId = "bundle-2";
  secondBundle.compiledAt = "2026-08-04T02:05:00.000Z";
  const secondPrepared = await prepared({
    bundle: secondBundle,
    importId: "shadow-import-2",
    idempotencyKey: "shadow-import-project-1-v2",
    expectedCurrentRevision: 1,
    expectedCurrentSnapshotFingerprint: first.receipt.snapshotFingerprint,
    requestedAt: "2026-08-04T02:06:00.000Z",
  });
  const second = await store.importPrepared(secondPrepared);
  assert.equal(second.disposition, "written");
  assert.equal(second.receipt.revision, 2);
  assert.equal(
    second.receipt.previousSnapshotFingerprint,
    first.receipt.snapshotFingerprint,
  );
});

test("recovers an exact receipt after pointer commit without a second state write", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "book-shadow-recovery-"));
  const store = new FileBookStudioShadowStatePersistence(root);
  const input = await prepared();
  const first = await store.importPrepared(input);
  const project = await onlyProjectDirectory(root);
  const receiptFiles = await readdir(path.join(project, "receipts"));
  assert.equal(receiptFiles.length, 1);
  await unlink(path.join(project, "receipts", receiptFiles[0]));

  const recovered = await store.importPrepared(input);
  assert.equal(recovered.disposition, "idempotent_replay");
  assert.equal(recovered.receipt.revision, first.receipt.revision);
  assert.equal(
    recovered.receipt.snapshotFingerprint,
    first.receipt.snapshotFingerprint,
  );
  assert.equal((await readdir(path.join(project, "snapshots"))).length, 1);
  assert.equal((await readdir(path.join(project, "receipts"))).length, 1);
});

test("rejects stale compare-and-swap and reused idempotency identity", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "book-shadow-conflict-"));
  const store = new FileBookStudioShadowStatePersistence(root);
  const firstPrepared = await prepared();
  await store.importPrepared(firstPrepared);

  const staleBundle = await fixture();
  staleBundle.bundleId = "bundle-stale";
  const stale = await prepared({
    bundle: staleBundle,
    importId: "shadow-import-stale",
    idempotencyKey: "shadow-import-stale-v1",
  });
  await assert.rejects(
    () => store.importPrepared(stale),
    /COMPARE_AND_SWAP_CONFLICT/,
  );

  const changedBundle = await fixture();
  changedBundle.bundleId = "bundle-changed";
  const reused = await prepared({
    bundle: changedBundle,
    importId: "shadow-import-reused",
    idempotencyKey: "shadow-import-project-1-v1",
  });
  await assert.rejects(
    () => store.importPrepared(reused),
    /IDEMPOTENCY_CONFLICT/,
  );
});

test("rejects a tampered current snapshot before advancing the chain", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "book-shadow-tamper-"));
  const store = new FileBookStudioShadowStatePersistence(root);
  const first = await store.importPrepared(await prepared());
  const project = await onlyProjectDirectory(root);
  const snapshotPath = path.join(
    project,
    "snapshots",
    `${first.receipt.snapshotFingerprint.slice("sha256:".length)}.json`,
  );
  const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
  snapshot.importedBy = "tampered-operator";
  await writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);

  const nextBundle = await fixture();
  nextBundle.bundleId = "bundle-after-tamper";
  const next = await prepared({
    bundle: nextBundle,
    importId: "shadow-import-after-tamper",
    idempotencyKey: "shadow-import-after-tamper-v1",
    expectedCurrentRevision: 1,
    expectedCurrentSnapshotFingerprint: first.receipt.snapshotFingerprint,
    requestedAt: "2026-08-04T02:08:00.000Z",
  });
  await assert.rejects(
    () => store.importPrepared(next),
    /SNAPSHOT_INVALID/,
  );
});

test("rehearses the exact current and prior snapshots without changing state", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "book-shadow-rollback-"));
  const store = new FileBookStudioShadowStatePersistence(root);
  const first = await store.importPrepared(await prepared());

  const secondBundle = await fixture();
  secondBundle.bundleId = "bundle-rollback-2";
  const second = await store.importPrepared(await prepared({
    bundle: secondBundle,
    importId: "shadow-import-rollback-2",
    idempotencyKey: "shadow-import-rollback-v2",
    expectedCurrentRevision: 1,
    expectedCurrentSnapshotFingerprint: first.receipt.snapshotFingerprint,
    requestedAt: "2026-08-04T02:10:00.000Z",
  }));

  const plan = await compileBookStateShadowRollbackPlan({
    outputKind: "evavo_docs_book_state_shadow_rollback_request",
    schemaVersion: 1,
    contract: BOOK_STATE_SHADOW_ROLLBACK_CONTRACT,
    authorityMode: "shadow_migration",
    rehearsalId: "rollback-rehearsal-1",
    projectId: "project-1",
    expectedCurrentRevision: 2,
    expectedCurrentSnapshotFingerprint: second.receipt.snapshotFingerprint,
    expectedPreviousSnapshotFingerprint: first.receipt.snapshotFingerprint,
    requestedAt: "2026-08-04T02:11:00.000Z",
    requestedBy: "named-migration-operator",
    evidenceIds: ["rollback-evidence-1"],
    authoritativeWritesAllowed: false,
    canonicalManuscriptMutationAllowed: false,
    runtimeCutoverApproved: false,
    sourceDeletionApproved: false,
    publicationPerformed: false,
  });
  const rehearsed = await store.rehearseRollback(plan);
  assert.equal(rehearsed.disposition, "written");
  assert.equal(rehearsed.receipt.status, "rehearsal_passed");
  assert.equal(rehearsed.receipt.currentSnapshotVerified, true);
  assert.equal(rehearsed.receipt.previousSnapshotVerified, true);
  assert.equal(rehearsed.receipt.stateChanged, false);
  assert.equal(rehearsed.receipt.canonicalWriterEnabled, false);

  const replay = await store.rehearseRollback(plan);
  assert.equal(replay.disposition, "idempotent_replay");
  assert.equal(
    replay.receipt.receiptFingerprint,
    rehearsed.receipt.receiptFingerprint,
  );
});

test("rejects a symbolic-link persistence root", async (t) => {
  if (process.platform === "win32") {
    t.skip("Symbolic-link creation is not reliably available on Windows CI.");
    return;
  }
  const parent = await mkdtemp(path.join(os.tmpdir(), "book-shadow-link-"));
  const real = path.join(parent, "real");
  const linked = path.join(parent, "linked");
  await mkdir(real);
  await symlink(real, linked, "dir");
  const store = new FileBookStudioShadowStatePersistence(linked);
  await assert.rejects(
    async () => store.importPrepared(await prepared()),
    /DIRECTORY_UNSAFE/,
  );
});
