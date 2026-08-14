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
  compileHmfFrameBodyDeliveryReadinessPlan,
  materializeHmfFrameBodyDeliveryReadiness,
  verifyHmfFrameBodyDeliveryReadiness,
} from "./frame-body-delivery-readiness.mjs";
import { hashValue } from "./frame-body-delivery-readiness-common.mjs";
import {
  createHmfProductionReceipt,
  heavyMetalFightingProductionBatchResumePlan,
} from "./work-orders.mjs";
import {
  cleanup,
  deliveryReadinessFixture,
  deliveryReadinessRequestFor,
} from "./frame-body-delivery-readiness.test-support.mjs";

test("delivery-readiness verification binds the terminal approved-master boundary", async () => {
  const verification = await verifyHmfFrameBodyDeliveryReadiness();
  assert.equal(verification.status, "passed");
  assert.ok(verification.checks.every((entry) => entry.passed));
  assert.equal(verification.authority.deliveryReadinessCompilation, true);
  assert.equal(verification.authority.gameRepositoryPromotion, false);
  assert.equal(verification.authority.finalAtlasCompilation, false);
});

test("named-human approval compiles one terminal readiness plan without promotion authority", async () => {
  const value = await deliveryReadinessFixture();
  try {
    const plan = await compileHmfFrameBodyDeliveryReadinessPlan({
      approvalPlan: value.approvalPlan,
      workspaceRoot: value.root,
      readinessRequest: deliveryReadinessRequestFor(value.approvalPlan),
    });
    assert.equal(plan.completedReadinessState, "delivery-ready");
    assert.equal(plan.nextLegalAction, "complete");
    assert.equal(plan.receipt.state, "delivery-ready");
    assert.equal(plan.receipt.actorClass, "system");
    assert.equal(plan.receipt.candidateSha256, value.candidateSha256);
    assert.equal(plan.readinessRecord.master.sha256, value.candidateSha256);
    assert.equal(plan.readinessRecord.deliveryDescriptor.terminalWorkspaceState, "delivery-ready");
    assert.equal(plan.authority.deliveryReadinessRecordPersistence, false);
    assert.equal(plan.authority.gameRepositoryPromotion, false);
    assert.equal(plan.authority.finalAtlasCompilation, false);
  } finally {
    await cleanup(value);
  }
});

test("delivery readiness persists once, completes the unit and is idempotent", async () => {
  const value = await deliveryReadinessFixture();
  try {
    const plan = await compileHmfFrameBodyDeliveryReadinessPlan({
      approvalPlan: value.approvalPlan,
      workspaceRoot: value.root,
      readinessRequest: deliveryReadinessRequestFor(value.approvalPlan),
    });
    const first = await materializeHmfFrameBodyDeliveryReadiness(plan);
    assert.equal(first.status, "delivery-ready");
    assert.equal(first.currentState, "delivery-ready");
    assert.equal(first.nextLegalAction, "complete");
    assert.equal(first.complete, true);
    assert.equal(first.masterSha256, value.candidateSha256);
    assert.equal(first.authority.gameRepositoryPromotion, false);

    const readinessRecord = JSON.parse(
      await readFile(
        path.join(value.root, ...plan.targets.readinessRecord.split("/")),
        "utf8",
      ),
    );
    assert.equal(
      readinessRecord.readinessRecordSha256,
      plan.readinessRecord.readinessRecordSha256,
    );
    assert.equal(readinessRecord.master.sha256, value.candidateSha256);

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
    assert.equal(state.currentState, "delivery-ready");
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

test("delivery readiness rejects unsafe actors, premature compilation and attestation drift", async () => {
  const value = await deliveryReadinessFixture();
  try {
    await assert.rejects(
      compileHmfFrameBodyDeliveryReadinessPlan({
        approvalPlan: value.approvalPlan,
        workspaceRoot: value.root,
        readinessRequest: deliveryReadinessRequestFor(value.approvalPlan, {
          actorId: "unsafe actor",
        }),
      }),
      /stable identifier/i,
    );
    await assert.rejects(
      compileHmfFrameBodyDeliveryReadinessPlan({
        approvalPlan: value.approvalPlan,
        workspaceRoot: value.root,
        readinessRequest: deliveryReadinessRequestFor(value.approvalPlan, {
          occurredAt: "2026-08-13T08:06:00.000Z",
        }),
      }),
      /may not compile before named-human approval completed/i,
    );
    await assert.rejects(
      compileHmfFrameBodyDeliveryReadinessPlan({
        approvalPlan: value.approvalPlan,
        workspaceRoot: value.root,
        readinessRequest: deliveryReadinessRequestFor(value.approvalPlan, {
          attestations: { masterSha256: "0".repeat(64) },
        }),
      }),
      /attestation master SHA drifted/i,
    );
  } finally {
    await cleanup(value);
  }
});

test("delivery-readiness materialization rejects approved-master drift and leaves no readiness record", async () => {
  const value = await deliveryReadinessFixture();
  try {
    const plan = await compileHmfFrameBodyDeliveryReadinessPlan({
      approvalPlan: value.approvalPlan,
      workspaceRoot: value.root,
      readinessRequest: deliveryReadinessRequestFor(value.approvalPlan),
    });
    await writeFile(
      path.join(value.root, ...value.approvalPlan.master.path.split("/")),
      "changed-after-delivery-readiness-plan",
    );
    await assert.rejects(
      materializeHmfFrameBodyDeliveryReadiness(plan),
      /approved master no longer matches|master changed after|approved master bytes differ/i,
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

test("delivery readiness rejects competing receipts, symlinked approval evidence and authority escalation", async () => {
  const value = await deliveryReadinessFixture();
  try {
    const plan = await compileHmfFrameBodyDeliveryReadinessPlan({
      approvalPlan: value.approvalPlan,
      workspaceRoot: value.root,
      readinessRequest: deliveryReadinessRequestFor(value.approvalPlan),
    });
    const competing = await createHmfProductionReceipt({
      unitId: value.order.unitId,
      state: "delivery-ready",
      attempt: value.approvalPlan.attempt,
      evidenceSha256: "7".repeat(64),
      candidateSha256: value.candidateSha256,
      actorClass: "system",
      actorId: "competing-readiness-compiler",
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

  const symlinkValue = await deliveryReadinessFixture();
  try {
    const approvalRecordPath = path.join(
      symlinkValue.root,
      ...symlinkValue.approvalPlan.targets.approvalRecord.split("/"),
    );
    const realPath = `${approvalRecordPath}.real`;
    await writeFile(realPath, await readFile(approvalRecordPath));
    await rm(approvalRecordPath);
    await symlink(realPath, approvalRecordPath);
    await assert.rejects(
      compileHmfFrameBodyDeliveryReadinessPlan({
        approvalPlan: symlinkValue.approvalPlan,
        workspaceRoot: symlinkValue.root,
        readinessRequest: deliveryReadinessRequestFor(symlinkValue.approvalPlan),
      }),
      /non-symlink|symlinked component/i,
    );
  } finally {
    await cleanup(symlinkValue);
  }
});

test("delivery-readiness APIs snapshot caller input and reject hostile or unsupported structures", async () => {
  const value = await deliveryReadinessFixture();
  try {
    const request = deliveryReadinessRequestFor(value.approvalPlan);
    const pending = compileHmfFrameBodyDeliveryReadinessPlan({
      approvalPlan: value.approvalPlan,
      workspaceRoot: value.root,
      readinessRequest: request,
    });
    request.actorId = "mutated-after-call";
    request.attestations.masterSha256 = "0".repeat(64);
    const plan = await pending;
    assert.equal(plan.readinessRecord.compiler.actorId, "evavo-art-studio-delivery-readiness");
    assert.equal(plan.readinessRecord.attestations.masterSha256, value.candidateSha256);

    let getterCalls = 0;
    const accessorRequest = deliveryReadinessRequestFor(value.approvalPlan);
    Object.defineProperty(accessorRequest, "actorId", {
      enumerable: true,
      configurable: true,
      get() {
        getterCalls += 1;
        return "getter-actor";
      },
    });
    await assert.rejects(
      compileHmfFrameBodyDeliveryReadinessPlan({
        approvalPlan: value.approvalPlan,
        workspaceRoot: value.root,
        readinessRequest: accessorRequest,
      }),
      /may not be an accessor/i,
    );
    assert.equal(getterCalls, 0);

    await assert.rejects(
      compileHmfFrameBodyDeliveryReadinessPlan({
        approvalPlan: value.approvalPlan,
        workspaceRoot: value.root,
        readinessRequest: new Proxy(
          deliveryReadinessRequestFor(value.approvalPlan),
          {},
        ),
      }),
      /may not be a Proxy/i,
    );

    const unknownRequest = deliveryReadinessRequestFor(value.approvalPlan);
    unknownRequest.automaticPromotion = true;
    await assert.rejects(
      compileHmfFrameBodyDeliveryReadinessPlan({
        approvalPlan: value.approvalPlan,
        workspaceRoot: value.root,
        readinessRequest: unknownRequest,
      }),
      /fields must be exactly/i,
    );

    const mutablePlan = structuredClone(plan);
    const materializing = materializeHmfFrameBodyDeliveryReadiness(mutablePlan);
    mutablePlan.readinessRecord.compiler.actorId = "mutated-after-materialize-call";
    mutablePlan.receipt.actorId = "mutated-after-materialize-call";
    const result = await materializing;
    assert.equal(result.compilerId, "evavo-art-studio-delivery-readiness");

    const invented = structuredClone(plan);
    invented.targetRepositoryWriteAuthorized = true;
    delete invented.readinessPlanSha256;
    invented.readinessPlanSha256 = hashValue(invented);
    await assert.rejects(
      materializeHmfFrameBodyDeliveryReadiness(invented),
      /fields must be exactly/i,
    );
  } finally {
    await cleanup(value);
  }
});
