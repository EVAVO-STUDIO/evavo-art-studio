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
  compileHmfFrameBodySelectedCandidateMasteringPlan,
  materializeHmfFrameBodySelectedCandidateMaster,
  verifyHmfFrameBodySelectedCandidateMastering,
} from "./frame-body-selected-candidate-mastering.mjs";
import { hashValue } from "./frame-body-selected-candidate-mastering-common.mjs";
import {
  createHmfProductionReceipt,
  heavyMetalFightingProductionBatchResumePlan,
} from "./work-orders.mjs";
import {
  cleanup,
  masteringFixture,
  masteringRequestFor,
} from "./frame-body-selected-candidate-mastering.test-support.mjs";

test("selected-candidate mastering verification binds the exact-byte mastered boundary", async () => {
  const verification = await verifyHmfFrameBodySelectedCandidateMastering();
  assert.equal(verification.status, "passed");
  assert.ok(verification.checks.every((entry) => entry.passed));
  assert.equal(verification.authority.workspaceMasterCreation, true);
  assert.equal(verification.authority.namedHumanApproval, false);
  assert.equal(verification.authority.gameRepositoryPromotion, false);
});

test("selected outcome compiles one exact-byte mastering plan without approval authority", async () => {
  const value = await masteringFixture();
  try {
    const plan = await compileHmfFrameBodySelectedCandidateMasteringPlan({
      selectionDecision: value.selectionDecision,
      workspaceRoot: value.root,
      masteringRequest: masteringRequestFor(value.selectionDecision),
    });
    assert.equal(plan.completedMasteringState, "mastered");
    assert.equal(plan.nextLegalAction, "request-named-human-approval");
    assert.equal(plan.receipt.state, "mastered");
    assert.equal(plan.receipt.actorClass, "system");
    assert.equal(plan.receipt.candidateSha256, value.candidateSha256);
    assert.equal(plan.masteringRecord.master.sha256, value.candidateSha256);
    assert.equal(plan.masteringRecord.master.exactByteCopy, true);
    assert.equal(plan.targets.masterFile, value.order.assetContract.masterOutputPath);
    assert.equal(plan.authority.masterFileCreation, false);
    assert.equal(plan.authority.namedHumanApproval, false);
    assert.equal(plan.authority.gameRepositoryPromotion, false);
  } finally {
    await cleanup(value);
  }
});

test("mastering writes exact candidate bytes once, advances to mastered and is idempotent", async () => {
  const value = await masteringFixture();
  try {
    const candidateBytes = await readFile(
      path.join(value.root, ...value.candidatePath.split("/")),
    );
    const plan = await compileHmfFrameBodySelectedCandidateMasteringPlan({
      selectionDecision: value.selectionDecision,
      workspaceRoot: value.root,
      masteringRequest: masteringRequestFor(value.selectionDecision),
    });
    const first = await materializeHmfFrameBodySelectedCandidateMaster(plan);
    assert.equal(first.status, "mastered");
    assert.equal(first.currentState, "mastered");
    assert.equal(first.nextLegalAction, "request-named-human-approval");
    assert.equal(first.masterSha256, value.candidateSha256);
    assert.equal(first.authority.namedHumanApproval, false);
    assert.equal(first.authority.gameRepositoryPromotion, false);

    const masterBytes = await readFile(
      path.join(value.root, ...plan.targets.masterFile.split("/")),
    );
    assert.deepEqual(masterBytes, candidateBytes);
    const record = JSON.parse(
      await readFile(
        path.join(value.root, ...plan.targets.masteringRecord.split("/")),
        "utf8",
      ),
    );
    assert.equal(
      record.masteringRecordSha256,
      plan.masteringRecord.masteringRecordSha256,
    );
    assert.equal(record.master.sha256, value.candidateSha256);

    const receipts = JSON.parse(
      await readFile(path.join(value.root, ...value.receiptPath.split("/")), "utf8"),
    );
    assert.equal(receipts.at(-1).state, "mastered");
    assert.equal(receipts.at(-1).candidateSha256, value.candidateSha256);
    const resume = await heavyMetalFightingProductionBatchResumePlan(
      value.order.batchId,
      receipts,
    );
    assert.equal(
      resume.unitStates.find((entry) => entry.unitId === value.order.unitId).nextAction,
      "request-named-human-approval",
    );

    const second = await materializeHmfFrameBodySelectedCandidateMaster(plan);
    assert.equal(second.status, "already-mastered");
    assert.equal(second.materialization.masterFile, "reused");
    assert.equal(second.materialization.masteringRecord, "reused");
    assert.equal(second.materialization.receiptChain, "reused");
  } finally {
    await cleanup(value);
  }
});

test("repair-requested selections cannot enter the mastering boundary", async () => {
  const value = await masteringFixture({ failedCriterionId: "frame-identity-silhouette" });
  try {
    assert.equal(value.selectionDecision.outcome, "repair-requested");
    await assert.rejects(
      compileHmfFrameBodySelectedCandidateMasteringPlan({
        selectionDecision: value.selectionDecision,
        workspaceRoot: value.root,
        masteringRequest: masteringRequestFor(value.selectionDecision),
      }),
      /not the selected branch ready for mastering/i,
    );
  } finally {
    await cleanup(value);
  }
});

test("mastering rejects unsafe actors and attestation drift before any write", async () => {
  const value = await masteringFixture();
  try {
    await assert.rejects(
      compileHmfFrameBodySelectedCandidateMasteringPlan({
        selectionDecision: value.selectionDecision,
        workspaceRoot: value.root,
        masteringRequest: masteringRequestFor(value.selectionDecision, {
          actorId: "unsafe actor",
        }),
      }),
      /stable identifier/i,
    );
    await assert.rejects(
      compileHmfFrameBodySelectedCandidateMasteringPlan({
        selectionDecision: value.selectionDecision,
        workspaceRoot: value.root,
        masteringRequest: masteringRequestFor(value.selectionDecision, {
          attestations: { candidateSha256: "0".repeat(64) },
        }),
      }),
      /attestation candidate SHA drifted/i,
    );
  } finally {
    await cleanup(value);
  }
});

test("mastering rejects candidate drift after plan compilation and leaves no master", async () => {
  const value = await masteringFixture();
  try {
    const plan = await compileHmfFrameBodySelectedCandidateMasteringPlan({
      selectionDecision: value.selectionDecision,
      workspaceRoot: value.root,
      masteringRequest: masteringRequestFor(value.selectionDecision),
    });
    await writeFile(
      path.join(value.root, ...value.candidatePath.split("/")),
      "changed-after-mastering-plan",
    );
    await assert.rejects(
      materializeHmfFrameBodySelectedCandidateMaster(plan),
      /selected candidate changed before mastering|candidate changed after mastering plan/i,
    );
    assert.equal(
      await lstat(path.join(value.root, ...plan.targets.masterFile.split("/"))).catch(() => null),
      null,
    );
  } finally {
    await cleanup(value);
  }
});

test("mastering refuses a conflicting existing master and preserves its exact bytes", async () => {
  const value = await masteringFixture();
  try {
    const plan = await compileHmfFrameBodySelectedCandidateMasteringPlan({
      selectionDecision: value.selectionDecision,
      workspaceRoot: value.root,
      masteringRequest: masteringRequestFor(value.selectionDecision),
    });
    const masterPath = path.join(value.root, ...plan.targets.masterFile.split("/"));
    await mkdir(path.dirname(masterPath), { recursive: true });
    await writeFile(masterPath, "conflicting-existing-master");
    await assert.rejects(
      materializeHmfFrameBodySelectedCandidateMaster(plan),
      /existing selected-candidate master conflicts/i,
    );
    assert.equal(await readFile(masterPath, "utf8"), "conflicting-existing-master");
  } finally {
    await cleanup(value);
  }
});

test("mastering rejects competing receipts, symlinked selection evidence and rehashed authority escalation", async () => {
  const value = await masteringFixture();
  try {
    const plan = await compileHmfFrameBodySelectedCandidateMasteringPlan({
      selectionDecision: value.selectionDecision,
      workspaceRoot: value.root,
      masteringRequest: masteringRequestFor(value.selectionDecision),
    });
    const competing = await createHmfProductionReceipt({
      unitId: value.order.unitId,
      state: "mastered",
      attempt: value.selectionDecision.attempt,
      evidenceSha256: "7".repeat(64),
      candidateSha256: value.candidateSha256,
      actorClass: "system",
      actorId: "competing-mastering-system",
      occurredAt: "2026-08-13T08:07:00.000Z",
    }, value.selectionDecision.receipt);
    await writeFile(
      path.join(value.root, ...value.receiptPath.split("/")),
      `${JSON.stringify([...value.receipts, competing], null, 2)}\n`,
    );
    await assert.rejects(
      materializeHmfFrameBodySelectedCandidateMaster(plan),
      /receipt chain does not match|persisted receipt chain differs/i,
    );

    const escalated = structuredClone(plan);
    escalated.authority.namedHumanApproval = true;
    delete escalated.masteringPlanSha256;
    escalated.masteringPlanSha256 = hashValue(escalated);
    await assert.rejects(
      materializeHmfFrameBodySelectedCandidateMaster(escalated),
      /gained forbidden authority: namedHumanApproval/i,
    );
  } finally {
    await cleanup(value);
  }

  const symlinkValue = await masteringFixture();
  try {
    const selectionPath = path.join(
      symlinkValue.root,
      ...symlinkValue.selectionDecision.target.split("/"),
    );
    const realPath = `${selectionPath}.real`;
    await writeFile(realPath, await readFile(selectionPath));
    await rm(selectionPath);
    await symlink(realPath, selectionPath);
    await assert.rejects(
      compileHmfFrameBodySelectedCandidateMasteringPlan({
        selectionDecision: symlinkValue.selectionDecision,
        workspaceRoot: symlinkValue.root,
        masteringRequest: masteringRequestFor(symlinkValue.selectionDecision),
      }),
      /non-symlink|symlinked component/i,
    );
  } finally {
    await cleanup(symlinkValue);
  }
});
