import assert from "node:assert/strict";
import {
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  compileHmfFrameBodySelectionDecision,
  materializeHmfFrameBodySelectionDecision,
  verifyHmfFrameBodySelectionDecision,
} from "./frame-body-selection-decision.mjs";
import {
  createHmfProductionReceipt,
  heavyMetalFightingProductionBatchResumePlan,
} from "./work-orders.mjs";
import {
  cleanup,
  humanDecisionFor,
  selectionFixture,
} from "./frame-body-selection-decision.test-support.mjs";

test("selection verification binds the explicit named-human outcome boundary", async () => {
  const verification = await verifyHmfFrameBodySelectionDecision();
  assert.equal(verification.status, "passed");
  assert.ok(verification.checks.every((entry) => entry.passed));
  assert.equal(verification.authority.mastering, false);
  assert.equal(verification.authority.automaticRepairAuthorization, false);
});

test("passing creative review compiles one selected receipt without mastering authority", async () => {
  const value = await selectionFixture();
  try {
    const decision = await compileHmfFrameBodySelectionDecision({
      creativeReviewDecision: value.creativeReviewDecision,
      workspaceRoot: value.root,
      humanDecision: humanDecisionFor(value.creativeReviewDecision),
    });
    assert.equal(decision.outcome, "selected");
    assert.equal(decision.receipt.state, "selected-or-repair-requested");
    assert.equal(decision.receipt.outcome, "selected");
    assert.equal(decision.receipt.actorClass, "human");
    assert.equal(decision.nextLegalAction, "master-selected-candidate");
    assert.equal(decision.boundedRepairTemplate, null);
    assert.equal(decision.authority.mastering, false);
    assert.equal(decision.authority.candidatePromotion, false);
  } finally {
    await cleanup(value);
  }
});

test("failed creative review compiles a bounded repair request without authorizing a provider", async () => {
  const value = await selectionFixture({ failedCriterionId: "frame-identity-silhouette" });
  try {
    const decision = await compileHmfFrameBodySelectionDecision({
      creativeReviewDecision: value.creativeReviewDecision,
      workspaceRoot: value.root,
      humanDecision: humanDecisionFor(value.creativeReviewDecision),
    });
    assert.equal(decision.outcome, "repair-requested");
    assert.equal(decision.receipt.outcome, "repair-requested");
    assert.equal(decision.nextLegalAction, "authorize-bounded-repair");
    assert.equal(decision.boundedRepairTemplate.failedCandidateSha256, value.candidateSha256);
    assert.deepEqual(decision.boundedRepairTemplate.failureCodes, value.creativeReviewDecision.reviewEvidence.failureCodes);
    assert.equal(decision.boundedRepairTemplate.authority.providerExecution, false);
    assert.equal(decision.authority.automaticRepairAuthorization, false);
  } finally {
    await cleanup(value);
  }
});

test("selected outcome persists once, advances to mastering and is idempotent", async () => {
  const value = await selectionFixture();
  try {
    const decision = await compileHmfFrameBodySelectionDecision({
      creativeReviewDecision: value.creativeReviewDecision,
      workspaceRoot: value.root,
      humanDecision: humanDecisionFor(value.creativeReviewDecision),
    });
    const first = await materializeHmfFrameBodySelectionDecision(decision);
    assert.equal(first.status, "selected-recorded");
    assert.equal(first.currentState, "selected-or-repair-requested");
    assert.equal(first.outcome, "selected");
    assert.equal(first.nextLegalAction, "master-selected-candidate");
    const persistedDecision = JSON.parse(await readFile(path.join(value.root, ...decision.target.split("/")), "utf8"));
    assert.equal(persistedDecision.selectionDecisionSha256, decision.selectionDecisionSha256);
    const receipts = JSON.parse(await readFile(path.join(value.root, ...value.receiptPath.split("/")), "utf8"));
    assert.equal(receipts.at(-1).state, "selected-or-repair-requested");
    assert.equal(receipts.at(-1).outcome, "selected");
    const resume = await heavyMetalFightingProductionBatchResumePlan(value.order.batchId, receipts);
    assert.equal(resume.unitStates.find((entry) => entry.unitId === value.order.unitId).nextAction, "master-selected-candidate");
    const second = await materializeHmfFrameBodySelectionDecision(decision);
    assert.equal(second.status, "already-selected-recorded");
    assert.equal(second.selectionDecisionSha256, first.selectionDecisionSha256);
  } finally {
    await cleanup(value);
  }
});

test("repair-requested outcome persists once and stops at separate repair authorization", async () => {
  const value = await selectionFixture({ failedCriterionId: "frame-identity-silhouette" });
  try {
    const decision = await compileHmfFrameBodySelectionDecision({
      creativeReviewDecision: value.creativeReviewDecision,
      workspaceRoot: value.root,
      humanDecision: humanDecisionFor(value.creativeReviewDecision),
    });
    const first = await materializeHmfFrameBodySelectionDecision(decision);
    assert.equal(first.status, "repair-request-recorded");
    assert.equal(first.currentState, "selected-or-repair-requested");
    assert.equal(first.outcome, "repair-requested");
    assert.equal(first.nextLegalAction, "authorize-bounded-repair");
    assert.ok(first.boundedRepairTemplateSha256);
    const second = await materializeHmfFrameBodySelectionDecision(decision);
    assert.equal(second.status, "already-repair-request-recorded");
  } finally {
    await cleanup(value);
  }
});

test("selection rejects contradictory outcomes, unsafe actors and attestation drift", async () => {
  const value = await selectionFixture();
  try {
    await assert.rejects(
      compileHmfFrameBodySelectionDecision({
        creativeReviewDecision: value.creativeReviewDecision,
        workspaceRoot: value.root,
        humanDecision: humanDecisionFor(value.creativeReviewDecision, { outcome: "repair-requested" }),
      }),
      /must match the completed creative recommendation selected/i,
    );
    await assert.rejects(
      compileHmfFrameBodySelectionDecision({
        creativeReviewDecision: value.creativeReviewDecision,
        workspaceRoot: value.root,
        humanDecision: humanDecisionFor(value.creativeReviewDecision, { actorId: "unsafe actor" }),
      }),
      /stable identifier/i,
    );
    await assert.rejects(
      compileHmfFrameBodySelectionDecision({
        creativeReviewDecision: value.creativeReviewDecision,
        workspaceRoot: value.root,
        humanDecision: humanDecisionFor(value.creativeReviewDecision, {
          attestations: { candidateSha256: "0".repeat(64) },
        }),
      }),
      /attestation candidate SHA drifted/i,
    );
  } finally {
    await cleanup(value);
  }
});

test("selection materialization rejects candidate drift after the human decision", async () => {
  const value = await selectionFixture();
  try {
    const decision = await compileHmfFrameBodySelectionDecision({
      creativeReviewDecision: value.creativeReviewDecision,
      workspaceRoot: value.root,
      humanDecision: humanDecisionFor(value.creativeReviewDecision),
    });
    await writeFile(path.join(value.root, ...value.candidatePath.split("/")), "changed-after-selection-decision");
    await assert.rejects(
      materializeHmfFrameBodySelectionDecision(decision),
      /candidate changed after creative review/i,
    );
  } finally {
    await cleanup(value);
  }
});

test("selection rejects a competing valid receipt and symlinked creative-review evidence", async () => {
  const value = await selectionFixture();
  try {
    const decision = await compileHmfFrameBodySelectionDecision({
      creativeReviewDecision: value.creativeReviewDecision,
      workspaceRoot: value.root,
      humanDecision: humanDecisionFor(value.creativeReviewDecision),
    });
    const competing = await createHmfProductionReceipt({
      unitId: value.order.unitId,
      state: "selected-or-repair-requested",
      attempt: 1,
      evidenceSha256: "7".repeat(64),
      candidateSha256: value.candidateSha256,
      outcome: "selected",
      actorClass: "human",
      actorId: "competing-human",
      occurredAt: "2026-08-13T08:06:00.000Z",
    }, value.creativeReviewDecision.receipt);
    await writeFile(path.join(value.root, ...value.receiptPath.split("/")), `${JSON.stringify([...value.receipts, competing], null, 2)}\n`);
    await assert.rejects(
      materializeHmfFrameBodySelectionDecision(decision),
      /selection predecessor receipts changed|persisted selection receipt differs/i,
    );
  } finally {
    await cleanup(value);
  }

  const symlinkValue = await selectionFixture();
  try {
    const creativePath = path.join(symlinkValue.root, ...symlinkValue.creativeReviewDecision.target.split("/"));
    const realPath = `${creativePath}.real`;
    await writeFile(realPath, await readFile(creativePath));
    await rm(creativePath);
    await symlink(realPath, creativePath);
    await assert.rejects(
      compileHmfFrameBodySelectionDecision({
        creativeReviewDecision: symlinkValue.creativeReviewDecision,
        workspaceRoot: symlinkValue.root,
        humanDecision: humanDecisionFor(symlinkValue.creativeReviewDecision),
      }),
      /non-symlink|symlinked component/i,
    );
  } finally {
    await cleanup(symlinkValue);
  }
});
