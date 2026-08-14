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
  compileHmfFrameBodyNamedHumanApprovalPlan,
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

test("named-human approval verification binds the exact mastered human gate", async () => {
  const verification = await verifyHmfFrameBodyNamedHumanApproval();
  assert.equal(verification.status, "passed");
  assert.ok(verification.checks.every((entry) => entry.passed));
  assert.equal(verification.authority.namedHumanApproverRequired, true);
  assert.equal(verification.authority.automaticApproval, false);
  assert.equal(verification.authority.gameRepositoryPromotion, false);
});

test("completed mastering compiles one explicit human approval without delivery authority", async () => {
  const value = await approvalFixture();
  try {
    const plan = await compileHmfFrameBodyNamedHumanApprovalPlan({
      masteringPlan: value.masteringPlan,
      workspaceRoot: value.root,
      humanApproval: humanApprovalFor(value.masteringPlan),
    });
    assert.equal(plan.completedApprovalState, "named-human-approved");
    assert.equal(plan.nextLegalAction, "compile-delivery-readiness");
    assert.equal(plan.receipt.state, "named-human-approved");
    assert.equal(plan.receipt.actorClass, "human");
    assert.equal(plan.receipt.actorId, "greg-parker");
    assert.equal(plan.receipt.candidateSha256, value.candidateSha256);
    assert.equal(plan.approvalRecord.master.sha256, value.candidateSha256);
    assert.equal(plan.approvalRecord.decision, "approved");
    assert.equal(plan.authority.approvalRecordPersistence, false);
    assert.equal(plan.authority.deliveryReadinessCompilation, false);
    assert.equal(plan.authority.gameRepositoryPromotion, false);
  } finally {
    await cleanup(value);
  }
});

test("named-human approval persists once, advances to approval and is idempotent", async () => {
  const value = await approvalFixture();
  try {
    const plan = await compileHmfFrameBodyNamedHumanApprovalPlan({
      masteringPlan: value.masteringPlan,
      workspaceRoot: value.root,
      humanApproval: humanApprovalFor(value.masteringPlan),
    });
    const first = await materializeHmfFrameBodyNamedHumanApproval(plan);
    assert.equal(first.status, "approved");
    assert.equal(first.currentState, "named-human-approved");
    assert.equal(first.nextLegalAction, "compile-delivery-readiness");
    assert.equal(first.approverId, "greg-parker");
    assert.equal(first.authority.masterMutation, false);
    assert.equal(first.authority.gameRepositoryPromotion, false);

    const approvalRecord = JSON.parse(
      await readFile(
        path.join(value.root, ...plan.targets.approvalRecord.split("/")),
        "utf8",
      ),
    );
    assert.equal(
      approvalRecord.approvalRecordSha256,
      plan.approvalRecord.approvalRecordSha256,
    );
    assert.equal(approvalRecord.master.sha256, value.candidateSha256);

    const receipts = JSON.parse(
      await readFile(path.join(value.root, ...value.receiptPath.split("/")), "utf8"),
    );
    assert.equal(receipts.at(-1).state, "named-human-approved");
    assert.equal(receipts.at(-1).actorClass, "human");
    const resume = await heavyMetalFightingProductionBatchResumePlan(
      value.order.batchId,
      receipts,
    );
    assert.equal(
      resume.unitStates.find((entry) => entry.unitId === value.order.unitId).nextAction,
      "compile-delivery-readiness",
    );

    const second = await materializeHmfFrameBodyNamedHumanApproval(plan);
    assert.equal(second.status, "already-approved");
    assert.equal(second.materialization.approvalRecord, "reused");
    assert.equal(second.materialization.receiptChain, "reused");
  } finally {
    await cleanup(value);
  }
});

test("named-human approval rejects unsafe actors, premature decisions and attestation drift", async () => {
  const value = await approvalFixture();
  try {
    await assert.rejects(
      compileHmfFrameBodyNamedHumanApprovalPlan({
        masteringPlan: value.masteringPlan,
        workspaceRoot: value.root,
        humanApproval: humanApprovalFor(value.masteringPlan, { actorId: "unsafe actor" }),
      }),
      /stable identifier/i,
    );
    await assert.rejects(
      compileHmfFrameBodyNamedHumanApprovalPlan({
        masteringPlan: value.masteringPlan,
        workspaceRoot: value.root,
        humanApproval: humanApprovalFor(value.masteringPlan, {
          occurredAt: "2026-08-13T08:05:00.000Z",
        }),
      }),
      /may not occur before mastering completed/i,
    );
    await assert.rejects(
      compileHmfFrameBodyNamedHumanApprovalPlan({
        masteringPlan: value.masteringPlan,
        workspaceRoot: value.root,
        humanApproval: humanApprovalFor(value.masteringPlan, { decision: "rejected" }),
      }),
      /decision must be approved/i,
    );
    await assert.rejects(
      compileHmfFrameBodyNamedHumanApprovalPlan({
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

test("approval materialization rejects master drift and leaves no approval record", async () => {
  const value = await approvalFixture();
  try {
    const plan = await compileHmfFrameBodyNamedHumanApprovalPlan({
      masteringPlan: value.masteringPlan,
      workspaceRoot: value.root,
      humanApproval: humanApprovalFor(value.masteringPlan),
    });
    await writeFile(
      path.join(value.root, ...value.masteringPlan.targets.masterFile.split("/")),
      "changed-after-human-approval-plan",
    );
    await assert.rejects(
      materializeHmfFrameBodyNamedHumanApproval(plan),
      /master no longer matches|master bytes differ|master changed after/i,
    );
    assert.equal(
      await lstat(
        path.join(value.root, ...plan.targets.approvalRecord.split("/")),
      ).catch(() => null),
      null,
    );
  } finally {
    await cleanup(value);
  }
});

test("approval rejects competing receipts, symlinked master evidence and authority escalation", async () => {
  const value = await approvalFixture();
  try {
    const plan = await compileHmfFrameBodyNamedHumanApprovalPlan({
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
      actorId: "competing-approver",
      occurredAt: "2026-08-13T08:08:00.000Z",
    }, value.masteringPlan.receipt);
    await writeFile(
      path.join(value.root, ...value.receiptPath.split("/")),
      `${JSON.stringify([...value.receipts, competing], null, 2)}\n`,
    );
    await assert.rejects(
      materializeHmfFrameBodyNamedHumanApproval(plan),
      /receipt chain does not match|receipt chain differs/i,
    );

    const escalated = structuredClone(plan);
    escalated.authority.gameRepositoryPromotion = true;
    delete escalated.approvalPlanSha256;
    escalated.approvalPlanSha256 = hashValue(escalated);
    await assert.rejects(
      materializeHmfFrameBodyNamedHumanApproval(escalated),
      /gained forbidden authority: gameRepositoryPromotion/i,
    );
  } finally {
    await cleanup(value);
  }

  const symlinkValue = await approvalFixture();
  try {
    const masterPath = path.join(
      symlinkValue.root,
      ...symlinkValue.masteringPlan.targets.masterFile.split("/"),
    );
    const realPath = `${masterPath}.real`;
    await writeFile(realPath, await readFile(masterPath));
    await rm(masterPath);
    await symlink(realPath, masterPath);
    await assert.rejects(
      compileHmfFrameBodyNamedHumanApprovalPlan({
        masteringPlan: symlinkValue.masteringPlan,
        workspaceRoot: symlinkValue.root,
        humanApproval: humanApprovalFor(symlinkValue.masteringPlan),
      }),
      /non-symlink|symlinked component/i,
    );
  } finally {
    await cleanup(symlinkValue);
  }
});
