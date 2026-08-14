import assert from "node:assert/strict";
import {
  lstat,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  compileHmfFrameBodyMasterApprovalDecision,
  materializeHmfFrameBodyMasterApprovalDecision,
  verifyHmfFrameBodyMasterApproval,
} from "./frame-body-master-approval.mjs";
import { hashValue } from "./frame-body-master-approval-common.mjs";
import {
  createHmfProductionReceipt,
  heavyMetalFightingProductionBatchResumePlan,
} from "./work-orders.mjs";
import {
  approvalFixture,
  approvalRequestFor,
  cleanup,
} from "./frame-body-master-approval.test-support.mjs";

test("master approval verification binds the exact mastered-to-approved boundary", async () => {
  const verification = await verifyHmfFrameBodyMasterApproval();
  assert.equal(verification.status, "passed");
  assert.ok(verification.checks.every((entry) => entry.passed));
  assert.equal(verification.authority.namedHumanDecisionRequired, true);
  assert.equal(verification.authority.automaticApproval, false);
  assert.equal(verification.authority.gameRepositoryPromotion, false);
});

test("mastered Frame body compiles one explicit named-human approval without delivery authority", async () => {
  const value = await approvalFixture();
  try {
    const decision = await compileHmfFrameBodyMasterApprovalDecision({
      masteringPlan: value.masteringPlan,
      workspaceRoot: value.root,
      humanApproval: approvalRequestFor(value.masteringPlan),
    });
    assert.equal(decision.completedApprovalState, "named-human-approved");
    assert.equal(decision.nextLegalAction, "compile-delivery-readiness");
    assert.equal(decision.decision, "approved");
    assert.equal(decision.receipt.state, "named-human-approved");
    assert.equal(decision.receipt.actorClass, "human");
    assert.equal(
      decision.receipt.candidateSha256,
      value.candidateSha256,
    );
    assert.equal(
      decision.approvalEvidence.master.sha256,
      value.candidateSha256,
    );
    assert.equal(decision.authority.automaticApproval, false);
    assert.equal(decision.authority.automaticDeliveryReadiness, false);
    assert.equal(decision.authority.gameRepositoryPromotion, false);
  } finally {
    await cleanup(value);
  }
});

test("master approval persists once, advances to named-human-approved and is idempotent", async () => {
  const value = await approvalFixture();
  try {
    const decision = await compileHmfFrameBodyMasterApprovalDecision({
      masteringPlan: value.masteringPlan,
      workspaceRoot: value.root,
      humanApproval: approvalRequestFor(value.masteringPlan),
    });
    const first = await materializeHmfFrameBodyMasterApprovalDecision(
      decision,
    );
    assert.equal(first.status, "approved");
    assert.equal(first.currentState, "named-human-approved");
    assert.equal(first.nextLegalAction, "compile-delivery-readiness");
    assert.equal(first.masterSha256, value.candidateSha256);
    assert.equal(first.authority.namedHumanApprovalRecorded, true);
    assert.equal(first.authority.gameRepositoryPromotion, false);

    const persisted = JSON.parse(
      await readFile(
        path.join(value.root, ...decision.target.split("/")),
        "utf8",
      ),
    );
    assert.equal(
      persisted.approvalDecisionSha256,
      decision.approvalDecisionSha256,
    );
    assert.equal(
      persisted.approvalEvidence.master.sha256,
      value.candidateSha256,
    );

    const receipts = JSON.parse(
      await readFile(
        path.join(value.root, ...value.receiptPath.split("/")),
        "utf8",
      ),
    );
    assert.equal(receipts.at(-1).state, "named-human-approved");
    assert.equal(receipts.at(-1).actorClass, "human");
    assert.equal(receipts.at(-1).candidateSha256, value.candidateSha256);
    const resume = await heavyMetalFightingProductionBatchResumePlan(
      value.order.batchId,
      receipts,
    );
    assert.equal(
      resume.unitStates.find(
        (entry) => entry.unitId === value.order.unitId,
      ).nextAction,
      "compile-delivery-readiness",
    );

    const second = await materializeHmfFrameBodyMasterApprovalDecision(
      decision,
    );
    assert.equal(second.status, "already-approved");
    assert.equal(second.materialization.approvalDecision, "reused");
    assert.equal(second.materialization.receiptChain, "reused");
  } finally {
    await cleanup(value);
  }
});

test("master approval refuses non-approved decisions and leaves the unit mastered", async () => {
  const value = await approvalFixture();
  try {
    await assert.rejects(
      compileHmfFrameBodyMasterApprovalDecision({
        masteringPlan: value.masteringPlan,
        workspaceRoot: value.root,
        humanApproval: approvalRequestFor(value.masteringPlan, {
          decision: "rejected",
        }),
      }),
      /must be approved|leaves the unit mastered/i,
    );
    const receipts = JSON.parse(
      await readFile(
        path.join(value.root, ...value.receiptPath.split("/")),
        "utf8",
      ),
    );
    assert.equal(receipts.at(-1).state, "mastered");
  } finally {
    await cleanup(value);
  }
});

test("master approval rejects unsafe actors, short rationale and attestation drift", async () => {
  const value = await approvalFixture();
  try {
    await assert.rejects(
      compileHmfFrameBodyMasterApprovalDecision({
        masteringPlan: value.masteringPlan,
        workspaceRoot: value.root,
        humanApproval: approvalRequestFor(value.masteringPlan, {
          actorId: "unsafe actor",
        }),
      }),
      /stable identifier/i,
    );
    await assert.rejects(
      compileHmfFrameBodyMasterApprovalDecision({
        masteringPlan: value.masteringPlan,
        workspaceRoot: value.root,
        humanApproval: approvalRequestFor(value.masteringPlan, {
          rationale: "too short",
        }),
      }),
      /20-2000 characters/i,
    );
    await assert.rejects(
      compileHmfFrameBodyMasterApprovalDecision({
        masteringPlan: value.masteringPlan,
        workspaceRoot: value.root,
        humanApproval: approvalRequestFor(value.masteringPlan, {
          attestations: {
            masterSha256: "0".repeat(64),
          },
        }),
      }),
      /attestation masterSha256 drifted/i,
    );
  } finally {
    await cleanup(value);
  }
});

test("master approval rejects master drift after decision compilation and leaves no approval record", async () => {
  const value = await approvalFixture();
  try {
    const decision = await compileHmfFrameBodyMasterApprovalDecision({
      masteringPlan: value.masteringPlan,
      workspaceRoot: value.root,
      humanApproval: approvalRequestFor(value.masteringPlan),
    });
    await writeFile(
      path.join(
        value.root,
        ...value.masteringPlan.targets.masterFile.split("/"),
      ),
      "changed-after-approval-plan",
    );
    await assert.rejects(
      materializeHmfFrameBodyMasterApprovalDecision(decision),
      /persisted master differs|master changed after approval/i,
    );
    assert.equal(
      await lstat(
        path.join(value.root, ...decision.target.split("/")),
      ).catch(() => null),
      null,
    );
  } finally {
    await cleanup(value);
  }
});

test("master approval refuses a conflicting existing decision and preserves the mastered receipt", async () => {
  const value = await approvalFixture();
  try {
    const decision = await compileHmfFrameBodyMasterApprovalDecision({
      masteringPlan: value.masteringPlan,
      workspaceRoot: value.root,
      humanApproval: approvalRequestFor(value.masteringPlan),
    });
    const decisionPath = path.join(
      value.root,
      ...decision.target.split("/"),
    );
    await mkdir(path.dirname(decisionPath), { recursive: true });
    await writeFile(decisionPath, "conflicting-existing-approval");
    await assert.rejects(
      materializeHmfFrameBodyMasterApprovalDecision(decision),
      /existing Frame body master approval decision conflicts/i,
    );
    assert.equal(
      await readFile(decisionPath, "utf8"),
      "conflicting-existing-approval",
    );
    const receipts = JSON.parse(
      await readFile(
        path.join(value.root, ...value.receiptPath.split("/")),
        "utf8",
      ),
    );
    assert.equal(receipts.at(-1).state, "mastered");
  } finally {
    await cleanup(value);
  }
});

test("master approval rejects competing receipts, symlinked masters and rehashed authority escalation", async () => {
  const value = await approvalFixture();
  try {
    const decision = await compileHmfFrameBodyMasterApprovalDecision({
      masteringPlan: value.masteringPlan,
      workspaceRoot: value.root,
      humanApproval: approvalRequestFor(value.masteringPlan),
    });
    const competing = await createHmfProductionReceipt({
      unitId: value.order.unitId,
      state: "named-human-approved",
      attempt: value.masteringPlan.attempt,
      evidenceSha256: "7".repeat(64),
      candidateSha256: value.candidateSha256,
      actorClass: "human",
      actorId: "competing-human-reviewer",
      occurredAt: "2026-08-13T08:08:00.000Z",
    }, value.masteringPlan.receipt);
    await writeFile(
      path.join(value.root, ...value.receiptPath.split("/")),
      `${JSON.stringify([...value.receipts, competing], null, 2)}\n`,
    );
    await assert.rejects(
      materializeHmfFrameBodyMasterApprovalDecision(decision),
      /receipt chain does not match|receipt chain differs/i,
    );

    const escalated = structuredClone(decision);
    escalated.authority.automaticDeliveryReadiness = true;
    delete escalated.approvalDecisionSha256;
    escalated.approvalDecisionSha256 = hashValue(escalated);
    await assert.rejects(
      materializeHmfFrameBodyMasterApprovalDecision(escalated),
      /gained forbidden authority: automaticDeliveryReadiness/i,
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
      compileHmfFrameBodyMasterApprovalDecision({
        masteringPlan: symlinkValue.masteringPlan,
        workspaceRoot: symlinkValue.root,
        humanApproval: approvalRequestFor(
          symlinkValue.masteringPlan,
        ),
      }),
      /one-link regular|symlinked component|non-symlink/i,
    );
  } finally {
    await cleanup(symlinkValue);
  }
});
