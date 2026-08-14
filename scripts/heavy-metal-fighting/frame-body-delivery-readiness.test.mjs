import assert from "node:assert/strict";
import { lstat, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  compileHmfFrameBodyNamedHumanApprovalPlan,
  materializeHmfFrameBodyNamedHumanApproval,
} from "./frame-body-named-human-approval.mjs";
import {
  approvalFixture,
  cleanup,
  humanApprovalFor,
} from "./frame-body-named-human-approval.test-support.mjs";
import {
  compileHmfFrameBodyDeliveryReadinessPlan,
  materializeHmfFrameBodyDeliveryReadiness,
  verifyHmfFrameBodyDeliveryReadiness,
} from "./frame-body-delivery-readiness.mjs";
import { hashValue } from "./frame-body-delivery-readiness-common.mjs";
import {
  createHmfProductionReceipt,
  heavyMetalFightingProductionBatchResumePlan,
} from "./work-orders.mjs";

async function readinessFixture() {
  const value = await approvalFixture();
  const approvalPlan = await compileHmfFrameBodyNamedHumanApprovalPlan({
    masteringPlan: value.masteringPlan,
    workspaceRoot: value.root,
    humanApproval: humanApprovalFor(value.masteringPlan),
  });
  const approvalResult = await materializeHmfFrameBodyNamedHumanApproval(approvalPlan);
  const receipts = JSON.parse(
    await readFile(path.join(value.root, ...value.receiptPath.split("/")), "utf8"),
  );
  return { ...value, approvalPlan, approvalResult, receipts };
}

function readinessRequestFor(approvalPlan, overrides = {}) {
  return {
    actorId: overrides.actorId ?? "evavo-art-studio-readiness",
    occurredAt: overrides.occurredAt ?? "2026-08-13T08:08:00.000Z",
    attestations: {
      approvalPlanSha256: approvalPlan.approvalPlanSha256,
      approvalRecordSha256: approvalPlan.approvalRecord.approvalRecordSha256,
      namedHumanApprovedReceiptSha256: approvalPlan.receipt.receiptSha256,
      masterSha256: approvalPlan.master.sha256,
      exactApprovedMasterRevalidated: true,
      deliveryMetadataRevalidated: true,
      noDeliveryPromotionAtlasGitOrPublicationPerformed: true,
      ...(overrides.attestations ?? {}),
    },
  };
}

test("delivery-readiness verification closes the post-approval internal lifecycle", async () => {
  const verification = await verifyHmfFrameBodyDeliveryReadiness();
  assert.equal(verification.status, "passed");
  assert.ok(verification.checks.every((entry) => entry.passed));
  assert.equal(verification.authority.automaticDelivery, false);
  assert.equal(verification.authority.gameRepositoryPromotion, false);
  assert.equal(verification.authority.finalAtlasCompilation, false);
});

test("approved master compiles one immutable delivery-readiness plan without delivery authority", async () => {
  const value = await readinessFixture();
  try {
    const plan = await compileHmfFrameBodyDeliveryReadinessPlan({
      approvalPlan: value.approvalPlan,
      workspaceRoot: value.root,
      readinessRequest: readinessRequestFor(value.approvalPlan),
    });
    assert.equal(plan.completedReadinessState, "delivery-ready");
    assert.equal(plan.nextLegalAction, "complete");
    assert.equal(plan.receipt.state, "delivery-ready");
    assert.equal(plan.receipt.actorClass, "system");
    assert.equal(plan.receipt.candidateSha256, value.candidateSha256);
    assert.equal(plan.readinessRecord.master.sha256, value.candidateSha256);
    assert.equal(plan.readinessRecord.deliveryContract.kind, "frame-body-cel");
    assert.ok(plan.readinessRecord.deliveryContract.runtimeDelivery);
    assert.equal(plan.readinessRecord.claims.deliveryPerformed, false);
    assert.equal(plan.authority.automaticDelivery, false);
    assert.equal(plan.authority.gameRepositoryPromotion, false);
  } finally {
    await cleanup(value);
  }
});

test("delivery readiness persists once, reaches terminal state and replays idempotently", async () => {
  const value = await readinessFixture();
  try {
    const plan = await compileHmfFrameBodyDeliveryReadinessPlan({
      approvalPlan: value.approvalPlan,
      workspaceRoot: value.root,
      readinessRequest: readinessRequestFor(value.approvalPlan),
    });
    const first = await materializeHmfFrameBodyDeliveryReadiness(plan);
    assert.equal(first.status, "delivery-ready");
    assert.equal(first.currentState, "delivery-ready");
    assert.equal(first.nextLegalAction, "complete");
    assert.equal(first.authority.gameRepositoryPromotion, false);

    const persisted = JSON.parse(
      await readFile(
        path.join(value.root, ...plan.targets.readinessRecord.split("/")),
        "utf8",
      ),
    );
    assert.equal(
      persisted.readinessRecordSha256,
      plan.readinessRecord.readinessRecordSha256,
    );
    assert.equal(persisted.master.sha256, value.candidateSha256);

    const receipts = JSON.parse(
      await readFile(path.join(value.root, ...value.receiptPath.split("/")), "utf8"),
    );
    assert.equal(receipts.at(-1).state, "delivery-ready");
    assert.equal(receipts.at(-1).actorClass, "system");
    const resume = await heavyMetalFightingProductionBatchResumePlan(
      value.order.batchId,
      receipts,
    );
    const state = resume.unitStates.find((entry) => entry.unitId === value.order.unitId);
    assert.equal(state.nextAction, "complete");
    assert.equal(state.complete, true);

    const second = await materializeHmfFrameBodyDeliveryReadiness(plan);
    assert.equal(second.status, "already-delivery-ready");
    assert.equal(second.materialization.readinessRecord, "reused");
    assert.equal(second.materialization.receiptChain, "reused");
  } finally {
    await cleanup(value);
  }
});

test("delivery readiness rejects premature timestamps, unsafe actors and attestation drift", async () => {
  const value = await readinessFixture();
  try {
    await assert.rejects(
      compileHmfFrameBodyDeliveryReadinessPlan({
        approvalPlan: value.approvalPlan,
        workspaceRoot: value.root,
        readinessRequest: readinessRequestFor(value.approvalPlan, { actorId: "unsafe actor" }),
      }),
      /stable identifier/i,
    );
    await assert.rejects(
      compileHmfFrameBodyDeliveryReadinessPlan({
        approvalPlan: value.approvalPlan,
        workspaceRoot: value.root,
        readinessRequest: readinessRequestFor(value.approvalPlan, {
          occurredAt: "2026-08-13T08:06:00.000Z",
        }),
      }),
      /may not be compiled before named-human approval/i,
    );
    await assert.rejects(
      compileHmfFrameBodyDeliveryReadinessPlan({
        approvalPlan: value.approvalPlan,
        workspaceRoot: value.root,
        readinessRequest: readinessRequestFor(value.approvalPlan, {
          attestations: { masterSha256: "0".repeat(64) },
        }),
      }),
      /attestation masterSha256 drifted/i,
    );
    const unknown = readinessRequestFor(value.approvalPlan);
    unknown.autoDeliver = true;
    await assert.rejects(
      compileHmfFrameBodyDeliveryReadinessPlan({
        approvalPlan: value.approvalPlan,
        workspaceRoot: value.root,
        readinessRequest: unknown,
      }),
      /fields must be exactly/i,
    );
  } finally {
    await cleanup(value);
  }
});

test("delivery-readiness compiler snapshots caller-owned request before asynchronous workspace validation", async () => {
  const value = await readinessFixture();
  try {
    const request = readinessRequestFor(value.approvalPlan);
    const pending = compileHmfFrameBodyDeliveryReadinessPlan({
      approvalPlan: value.approvalPlan,
      workspaceRoot: value.root,
      readinessRequest: request,
    });
    request.actorId = "mutated-after-call";
    request.attestations.masterSha256 = "0".repeat(64);
    const plan = await pending;
    assert.equal(plan.readinessRecord.executor.actorId, "evavo-art-studio-readiness");
    assert.equal(plan.readinessRecord.attestations.masterSha256, value.candidateSha256);
  } finally {
    await cleanup(value);
  }
});

test("delivery-readiness materialization rejects master drift and leaves no readiness record", async () => {
  const value = await readinessFixture();
  try {
    const plan = await compileHmfFrameBodyDeliveryReadinessPlan({
      approvalPlan: value.approvalPlan,
      workspaceRoot: value.root,
      readinessRequest: readinessRequestFor(value.approvalPlan),
    });
    await writeFile(
      path.join(value.root, ...value.approvalPlan.master.path.split("/")),
      "changed-after-readiness-plan",
    );
    await assert.rejects(
      materializeHmfFrameBodyDeliveryReadiness(plan),
      /master no longer matches|approved master changed|selected candidate/i,
    );
    assert.equal(
      await lstat(
        path.join(value.root, ...plan.targets.readinessRecord.split("/")),
      ).catch(() => null),
      null,
    );
  } finally {
    await cleanup(value);
  }
});

test("delivery readiness rejects competing terminal receipts and rehashed authority escalation", async () => {
  const value = await readinessFixture();
  try {
    const plan = await compileHmfFrameBodyDeliveryReadinessPlan({
      approvalPlan: value.approvalPlan,
      workspaceRoot: value.root,
      readinessRequest: readinessRequestFor(value.approvalPlan),
    });
    const competing = await createHmfProductionReceipt({
      unitId: value.order.unitId,
      state: "delivery-ready",
      attempt: value.approvalPlan.attempt,
      evidenceSha256: "7".repeat(64),
      candidateSha256: value.candidateSha256,
      actorClass: "system",
      actorId: "competing-readiness",
      occurredAt: "2026-08-13T08:09:00.000Z",
    }, value.approvalPlan.receipt);
    await writeFile(
      path.join(value.root, ...value.receiptPath.split("/")),
      `${JSON.stringify([...value.receipts, competing], null, 2)}\n`,
    );
    await assert.rejects(
      materializeHmfFrameBodyDeliveryReadiness(plan),
      /receipt chain does not match|receipt chain differs/i,
    );

    const escalated = structuredClone(plan);
    escalated.authority.gameRepositoryPromotion = true;
    delete escalated.readinessPlanSha256;
    escalated.readinessPlanSha256 = hashValue(escalated);
    await assert.rejects(
      materializeHmfFrameBodyDeliveryReadiness(escalated),
      /gained forbidden authority: gameRepositoryPromotion/i,
    );
  } finally {
    await cleanup(value);
  }
});
