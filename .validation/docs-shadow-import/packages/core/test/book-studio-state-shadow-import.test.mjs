import assert from "node:assert/strict";
import test from "node:test";

import {
  BOOK_STATE_SHADOW_IMPORT_CONTRACT,
  BOOK_STATE_SHADOW_ROLLBACK_CONTRACT,
  compileBookStateMigrationBundle,
  compileBookStateShadowRollbackPlan,
  prepareBookStateShadowImport,
} from "../src/index.ts";
import {
  executor,
  fixture,
  sha,
} from "./book-studio-state-migration-bundle-fixtures.mjs";

async function request(overrides = {}) {
  const bundle = overrides.bundle ?? await fixture();
  const validation = await compileBookStateMigrationBundle(bundle, executor);
  return {
    outputKind: "evavo_docs_book_state_shadow_import_request",
    schemaVersion: 1,
    contract: BOOK_STATE_SHADOW_IMPORT_CONTRACT,
    authorityMode: "shadow_migration",
    importId: "shadow-import-1",
    idempotencyKey: "shadow-import-project-1-v1",
    bundle,
    expectedValidationFingerprint:
      overrides.expectedValidationFingerprint ?? validation.bundleFingerprint,
    expectedCurrentRevision: 0,
    expectedCurrentSnapshotFingerprint: null,
    requestedAt: "2026-08-04T02:00:00.000Z",
    requestedBy: "named-migration-operator",
    evidenceIds: ["migration-evidence-1"],
    authoritativeWritesAllowed: false,
    canonicalManuscriptMutationAllowed: false,
    runtimeCutoverApproved: false,
    sourceDeletionApproved: false,
    publicationPerformed: false,
    ...overrides,
  };
}

test("prepares one exact shadow import after rerunning current validators", async () => {
  const value = await request();
  const prepared = await prepareBookStateShadowImport(value, executor);
  assert.equal(prepared.plan.status, "ready_for_shadow_import");
  assert.equal(prepared.plan.bundleFingerprint, value.expectedValidationFingerprint);
  assert.equal(prepared.validationResult.status, "ready_for_cutover_review");
  assert.equal(prepared.plan.expectedCurrentRevision, 0);
  assert.equal(prepared.plan.expectedCurrentSnapshotFingerprint, null);
  assert.equal(prepared.plan.statePersisted, false);
  assert.equal(prepared.plan.docsSuiteCanonicalWriterEnabled, false);
  assert.equal(prepared.plan.runtimeCutoverApproved, false);
  assert.equal(prepared.plan.publicationPerformed, false);
});

test("rejects stale validation identity and incomplete production state", async () => {
  await assert.rejects(
    () => prepareBookStateShadowImport(
      request({ expectedValidationFingerprint: sha("f") }),
      executor,
    ),
    /VALIDATION_MISMATCH/,
  );

  const bundle = await fixture();
  bundle.items.pop();
  const validation = await compileBookStateMigrationBundle(bundle, executor);
  await assert.rejects(
    () => prepareBookStateShadowImport(
      request({ bundle, expectedValidationFingerprint: validation.bundleFingerprint }),
      executor,
    ),
    /BUNDLE_NOT_READY/,
  );
});

test("rejects duplicate validation payloads, unknown fields and authority escalation", async () => {
  const value = await request();
  await assert.rejects(
    () => prepareBookStateShadowImport(
      { ...value, validationResult: {} },
      executor,
    ),
    /unsupported fields/,
  );
  await assert.rejects(
    () => prepareBookStateShadowImport(
      { ...value, authoritativeWritesAllowed: true },
      executor,
    ),
    /AUTHORITY_INVALID/,
  );
});

test("requires coherent optimistic compare-and-swap expectations", async () => {
  await assert.rejects(
    () => prepareBookStateShadowImport(
      request({
        expectedCurrentRevision: 0,
        expectedCurrentSnapshotFingerprint: sha("1"),
      }),
      executor,
    ),
    /EXPECTATION_INCONSISTENT/,
  );
  const prepared = await prepareBookStateShadowImport(
    await request({
      expectedCurrentRevision: 3,
      expectedCurrentSnapshotFingerprint: sha("2"),
    }),
    executor,
  );
  assert.equal(prepared.plan.expectedCurrentRevision, 3);
  assert.equal(prepared.plan.expectedCurrentSnapshotFingerprint, sha("2"));
});

test("compiles a deterministic non-mutating rollback rehearsal plan", async () => {
  const input = {
    outputKind: "evavo_docs_book_state_shadow_rollback_request",
    schemaVersion: 1,
    contract: BOOK_STATE_SHADOW_ROLLBACK_CONTRACT,
    authorityMode: "shadow_migration",
    rehearsalId: "rollback-rehearsal-1",
    projectId: "project-1",
    expectedCurrentRevision: 2,
    expectedCurrentSnapshotFingerprint: sha("3"),
    expectedPreviousSnapshotFingerprint: sha("4"),
    requestedAt: "2026-08-04T02:30:00.000Z",
    requestedBy: "named-migration-operator",
    evidenceIds: ["rollback-evidence-1"],
    authoritativeWritesAllowed: false,
    canonicalManuscriptMutationAllowed: false,
    runtimeCutoverApproved: false,
    sourceDeletionApproved: false,
    publicationPerformed: false,
  };
  const first = await compileBookStateShadowRollbackPlan(input);
  const second = await compileBookStateShadowRollbackPlan({
    ...input,
    evidenceIds: [...input.evidenceIds].reverse(),
  });
  assert.equal(first.planFingerprint, second.planFingerprint);
  assert.equal(first.status, "ready_for_rollback_rehearsal");
  assert.equal(first.restoreEmptyState, false);
  assert.equal(first.statePersisted, false);
  assert.equal(first.docsSuiteCanonicalWriterEnabled, false);
  assert.equal(first.publicationPerformed, false);
});
