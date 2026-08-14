import assert from "node:assert/strict";
import {
  lstat,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  compileHmfFrameBodyNamedHumanApprovalDecision,
  materializeHmfFrameBodyNamedHumanApproval,
  verifyHmfFrameBodyNamedHumanApproval,
} from "./frame-body-named-human-approval.mjs";
import { hashValue } from "./frame-body-named-human-approval-common.mjs";
import {
  createHmfProductionReceipt,
  heavyMetalFightingProductionBatchResumePlan,
} from "./work-orders.mjs";
import {
  approvalFixture,
  cleanup,
  humanApprovalFor,
} from "./frame-body-named-human-approval.test-support.mjs";

test("named-human approval verification binds the exact mastered review boundary", async () => {
  const verification = await verifyHmfFrameBodyNamedHumanApproval();
  assert.equal(verification.status, "passed");
  assert.ok(verification.checks.every((entry) => entry.passed));
  assert.equal(verification.authority.namedHumanApproval, true);
  assert.equal(verification.authority.automaticApproval, false);
  assert.equal(verification.authority.gameRepositoryPromotion, false);
});

test("mastered evidence compiles one explicit human approval without delivery authority", async () => {
  const value = await approvalFixture();
  try {
    const decision = await compileHmfFrameBodyNamedHumanApprovalDecision({
      masteringPlan: value.masteringPlan,
      workspaceRoot: value.root,
      humanApproval: humanApprovalFor(value.masteringPlan),
    });
    assert.equal(decision.completedApprovalState, "named-human-approved");
    assert.equal(decision.nextLegalAction, "compile-delivery-readiness");
    assert.equal(decision.receipt.state, "named-human-approved");
    assert.equal(decision.receipt.actorClass, "human");
    assert.equal(decision.receipt.actorId, "greg-parker");
    assert.equal(decision.receipt.candidateSha256, value.candidateSha256);
    assert.equal(decision.approvalEvidence.approved, true);
    assert.equal(decision.approvalEvidence.master.sha256, value.candidateSha256);
    assert.equal(decision.authority.namedHumanApproval, true);
    assert.equal(decision.authority.automaticApproval, false);
    assert.equal(decision.authority.gameRepositoryPromotion, false);
  } finally {
    await cleanup(value);
  }
});

test("approval persists once, advances to named-human-approved and is idempotent", async () => {
  const value = await approvalFixture();
  try {
    const decision = await compileHmfFrameBodyNamedHumanApprovalDecision({
      masteringPlan: value.masteringPlan,
      workspaceRoot: value.root,
      humanApproval: humanApprovalFor(value.masteringPlan),
    });
    const first = await materializeHmfFrameBodyNamedHumanApproval(decision);
    assert.equal(first.status, "approved");
    assert.equal(first.currentState, "named-human-approved");
    assert.equal(first.nextLegalAction, "compile-delivery-readiness");
    assert.equal(first.approverId, "greg-parker");
    assert.equal(first.authority.namedHumanApprovalPerformed, true);
    assert.equal(first.authority.gameRepositoryPromotion, false);

    const persisted = JSON.parse(
      await readFile(path.join(value.root, ...decision.target.split("/")), "utf8"),
    );
    assert.equal(
      persisted.approvalDecisionSha256,
      decision.approvalDecisionSha256,
    );
    const receipts = JSON.parse(
      await readFile(path.join(value.root, ...value.receiptPath.split("/")), "utf8"),
    );
    assert.equal(receipts.at(-1).state, "named-human-approved");
    assert.equal(receipts.at(-1).actorId, "greg-parker");
    const resume = await heavyMetalFightingProductionBatchResumePlan(
      value.order.batchId,
      receipts,
    );
    assert.equal(
      resume.unitStates.find((entry) => entry.unitId === value.order.unitId).nextAction,
      "compile-delivery-readiness",
    );

    const second = await materializeHmfFrameBodyNamedHumanApproval(decision);
    assert.equal(second.status, "already-approved");
    assert.equal(second.materialization.approvalDecision, "reused");
    assert.equal(second.materialization.receiptChain, "reused");
  } finally {
    await cleanup(value);
  }
});

test("approval rejects withholding, unsafe actors and attestation drift before persistence", async () => {
  const value = await approvalFixture();
  try {
    await assert.rejects(
      compileHmfFrameBodyNamedHumanApprovalDecision({
        masteringPlan: value.masteringPlan,
        workspaceRoot: value.root,
        humanApproval: humanApprovalFor(value.masteringPlan, { approved: false }),
      }),
      /approved must be explicitly true/i,
    );
    await assert.rejects(
      compileHmfFrameBodyNamedHumanApprovalDecision({
        masteringPlan: value.masteringPlan,
        workspaceRoot: value.root,
        humanApproval: humanApprovalFor(value.masteringPlan, { actorId: "unsafe actor" }),
      }),
      /stable identifier/i,
    );
    await assert.rejects(
      compileHmfFrameBodyNamedHumanApprovalDecision({
        masteringPlan: value.masteringPlan,
        workspaceRoot: value.root,
        humanApproval: humanApprovalFor(value.masteringPlan, {
          attestations: { masterSha256: "0".repeat(64) },
        }),
      }),
      /attestation master SHA drifted/i,
    );
  } finally {
    await cleanup(value);
  }
});

test("approval rejects master drift after decision compilation and leaves no approval file", async () => {
  const value = await approvalFixture();
  try {
    const decision = await compileHmfFrameBodyNamedHumanApprovalDecision({
      masteringPlan: value.masteringPlan,
      workspaceRoot: value.root,
      humanApproval: humanApprovalFor(value.masteringPlan),
    });
    await writeFile(
      path.join(value.root, ...value.masteringPlan.targets.masterFile.split("/")),
      "changed-after-human-approval-decision",
    );
    await assert.rejects(
      materializeHmfFrameBodyNamedHumanApproval(decision),
      /persisted master differs|master changed after named-human approval/i,
    );
    assert.equal(
      await lstat(path.join(value.root, ...decision.target.split("/"))).catch(() => null),
      null,
    );
  } finally {
    await cleanup(value);
  }
});

test("approval rejects competing receipts and rehashed authority escalation", async () => {
  const value = await approvalFixture();
  try {
    const decision = await compileHmfFrameBodyNamedHumanApprovalDecision({
      masteringPlan: value.masteringPlan,
      workspaceRoot: value.root,
      humanApproval: humanApprovalFor(value.masteringPlan),
    });
    const competing = await createHmfProductionReceipt({
      unitId: value.order.unitId,
      state: "named-human-approved",
      attempt: value.masteringPlan.attempt,
      evidenceSha256: "7".repeat(64),
      candidateSha256: value.candidateSha256,
      actorClass: "human",
      actorId: "competing-reviewer",
      occurredAt: "2026-08-13T08:08:00.000Z",
    }, value.masteringPlan.receipt);
    await writeFile(
      path.join(value.root, ...value.receiptPath.split("/")),
      `${JSON.stringify([...value.receipts, competing], null, 2)}\n`,
    );
    await assert.rejects(
      materializeHmfFrameBodyNamedHumanApproval(decision),
      /receipt chain does not match|persisted receipt chain differs/i,
    );

    const escalated = structuredClone(decision);
    escalated.authority.gameRepositoryPromotion = true;
    delete escalated.approvalDecisionSha256;
    escalated.approvalDecisionSha256 = hashValue(escalated);
    await assert.rejects(
      materializeHmfFrameBodyNamedHumanApproval(escalated),
      /gained forbidden authority: gameRepositoryPromotion/i,
    );
  } finally {
    await cleanup(value);
  }
});

test("approval rejects symlinked mastering evidence", async () => {
  const value = await approvalFixture();
  try {
    const recordPath = path.join(
      value.root,
      ...value.masteringPlan.targets.masteringRecord.split("/"),
    );
    const realPath = `${recordPath}.real`;
    await writeFile(realPath, await readFile(recordPath));
    await rm(recordPath);
    await symlink(realPath, recordPath);
    await assert.rejects(
      compileHmfFrameBodyNamedHumanApprovalDecision({
        masteringPlan: value.masteringPlan,
        workspaceRoot: value.root,
        humanApproval: humanApprovalFor(value.masteringPlan),
      }),
      /non-symlink|symlinked component/i,
    );
  } finally {
    await cleanup(value);
  }
});
