import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  compileHmfFrameBodyNamedHumanApprovalPlan,
  materializeHmfFrameBodyNamedHumanApproval,
} from "./frame-body-named-human-approval.mjs";
import { hashValue } from "./frame-body-named-human-approval-common.mjs";
import {
  approvalFixture,
  cleanup,
  humanApprovalFor,
} from "./frame-body-named-human-approval.test-support.mjs";

test("approval compiler snapshots caller-owned input before asynchronous workspace validation", async () => {
  const value = await approvalFixture();
  try {
    const humanApproval = humanApprovalFor(value.masteringPlan);
    const pending = compileHmfFrameBodyNamedHumanApprovalPlan({
      masteringPlan: value.masteringPlan,
      workspaceRoot: value.root,
      humanApproval,
    });
    humanApproval.actorId = "mutated-after-call";
    humanApproval.attestations.masterSha256 = "0".repeat(64);
    const plan = await pending;
    assert.equal(plan.approvalRecord.approver.actorId, "greg-parker");
    assert.equal(plan.approvalRecord.attestations.masterSha256, value.candidateSha256);
  } finally {
    await cleanup(value);
  }
});

test("approval compiler rejects accessors, proxies, symbols and unsupported fields without invoking getters", async () => {
  const value = await approvalFixture();
  try {
    let getterCalls = 0;
    const accessorApproval = humanApprovalFor(value.masteringPlan);
    Object.defineProperty(accessorApproval, "actorId", {
      enumerable: true,
      configurable: true,
      get() {
        getterCalls += 1;
        return "getter-actor";
      },
    });
    await assert.rejects(
      compileHmfFrameBodyNamedHumanApprovalPlan({
        masteringPlan: value.masteringPlan,
        workspaceRoot: value.root,
        humanApproval: accessorApproval,
      }),
      /may not be an accessor/i,
    );
    assert.equal(getterCalls, 0);

    await assert.rejects(
      compileHmfFrameBodyNamedHumanApprovalPlan({
        masteringPlan: value.masteringPlan,
        workspaceRoot: value.root,
        humanApproval: new Proxy(humanApprovalFor(value.masteringPlan), {}),
      }),
      /may not be a Proxy/i,
    );

    const symbolicApproval = humanApprovalFor(value.masteringPlan);
    symbolicApproval[Symbol("hidden-authority")] = true;
    await assert.rejects(
      compileHmfFrameBodyNamedHumanApprovalPlan({
        masteringPlan: value.masteringPlan,
        workspaceRoot: value.root,
        humanApproval: symbolicApproval,
      }),
      /symbolic properties/i,
    );

    const unknownApproval = humanApprovalFor(value.masteringPlan);
    unknownApproval.automaticPromotion = true;
    await assert.rejects(
      compileHmfFrameBodyNamedHumanApprovalPlan({
        masteringPlan: value.masteringPlan,
        workspaceRoot: value.root,
        humanApproval: unknownApproval,
      }),
      /fields must be exactly/i,
    );

    const unknownAttestation = humanApprovalFor(value.masteringPlan);
    unknownAttestation.attestations.gameRepositoryPromotion = true;
    await assert.rejects(
      compileHmfFrameBodyNamedHumanApprovalPlan({
        masteringPlan: value.masteringPlan,
        workspaceRoot: value.root,
        humanApproval: unknownAttestation,
      }),
      /humanApproval\.attestations fields must be exactly/i,
    );

    await assert.rejects(
      compileHmfFrameBodyNamedHumanApprovalPlan({
        masteringPlan: value.masteringPlan,
        workspaceRoot: value.root,
        humanApproval: humanApprovalFor(value.masteringPlan),
        unsupportedOption: true,
      }),
      /unsupported field unsupportedOption/i,
    );
  } finally {
    await cleanup(value);
  }
});

test("approval materializer owns its plan snapshot before persistence begins", async () => {
  const value = await approvalFixture();
  try {
    const plan = await compileHmfFrameBodyNamedHumanApprovalPlan({
      masteringPlan: value.masteringPlan,
      workspaceRoot: value.root,
      humanApproval: humanApprovalFor(value.masteringPlan),
    });
    const mutablePlan = structuredClone(plan);
    const pending = materializeHmfFrameBodyNamedHumanApproval(mutablePlan);
    mutablePlan.approvalRecord.approver.actorId = "mutated-after-materialize-call";
    mutablePlan.receipt.actorId = "mutated-after-materialize-call";
    const result = await pending;
    assert.equal(result.approverId, "greg-parker");
    const persisted = JSON.parse(
      await readFile(
        path.join(value.root, ...plan.targets.approvalRecord.split("/")),
        "utf8",
      ),
    );
    assert.equal(persisted.approver.actorId, "greg-parker");
  } finally {
    await cleanup(value);
  }
});

test("approval materializer rejects accessor plans and correctly rehashed unknown claims", async () => {
  const value = await approvalFixture();
  try {
    const plan = await compileHmfFrameBodyNamedHumanApprovalPlan({
      masteringPlan: value.masteringPlan,
      workspaceRoot: value.root,
      humanApproval: humanApprovalFor(value.masteringPlan),
    });

    let getterCalls = 0;
    const accessorPlan = structuredClone(plan);
    Object.defineProperty(accessorPlan, "approvalPlanSha256", {
      enumerable: true,
      configurable: true,
      get() {
        getterCalls += 1;
        return plan.approvalPlanSha256;
      },
    });
    await assert.rejects(
      materializeHmfFrameBodyNamedHumanApproval(accessorPlan),
      /may not be an accessor/i,
    );
    assert.equal(getterCalls, 0);

    const invented = structuredClone(plan);
    invented.deliveryPublicationAuthorized = true;
    delete invented.approvalPlanSha256;
    invented.approvalPlanSha256 = hashValue(invented);
    await assert.rejects(
      materializeHmfFrameBodyNamedHumanApproval(invented),
      /fields must be exactly/i,
    );
  } finally {
    await cleanup(value);
  }
});
