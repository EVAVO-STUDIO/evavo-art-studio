import test from "node:test";

import {
  LayeredGodotGitPushVerifierError,
  canonicalSha256,
  createDeliveryEvidenceBundle,
  validateDeliveryEvidenceBundle,
} from "../layered-godot-git-push-verifier.mjs";
import {
  REPOSITORY,
  assert,
  pushedFixture,
  verifierDependencies,
  verifierInput,
  verifyLayeredGodotPushReceipt,
} from "./test-fixture.mjs";

function rehashBundle(bundle, mutate) {
  const copy = JSON.parse(JSON.stringify(bundle));
  mutate(copy);
  delete copy.bundleSha256;
  return { ...copy, bundleSha256: canonicalSha256(copy) };
}

function rehashVerificationReceipt(receipt, mutate) {
  const copy = JSON.parse(JSON.stringify(receipt));
  mutate(copy);
  delete copy.verificationSha256;
  return { ...copy, verificationSha256: canonicalSha256(copy) };
}

function expectCode(action, code) {
  assert.throws(
    action,
    (error) => error instanceof LayeredGodotGitPushVerifierError && error.code === code,
  );
}

async function deliveryFixture(t, outcome = "pushed") {
  const { fx, receipt } = await pushedFixture(t, outcome);
  const verificationReceipt = await verifyLayeredGodotPushReceipt(
    verifierInput(fx, receipt),
    verifierDependencies(fx),
  );
  const bundle = createDeliveryEvidenceBundle({
    commitReceipt: fx.receipt,
    pushReceipt: receipt,
    verificationReceipt,
    expectedRepository: REPOSITORY,
    workspaceRoot: fx.root,
  });
  return { fx, receipt, verificationReceipt, bundle };
}

test("creates one self-contained delivery evidence bundle and re-admits it", async (t) => {
  const { fx, receipt, verificationReceipt, bundle } = await deliveryFixture(t);
  const admitted = validateDeliveryEvidenceBundle(bundle, REPOSITORY, fx.root);
  assert.deepEqual(admitted, bundle);
  assert.equal(Object.isFrozen(admitted), true);
  assert.equal(Object.isFrozen(admitted.sourceReceipts), true);
  assert.equal(admitted.sourceReceipts.commit.receiptSha256, fx.receipt.receiptSha256);
  assert.equal(admitted.sourceReceipts.push.receiptSha256, receipt.receiptSha256);
  assert.equal(
    admitted.sourceReceipts.verification.verificationSha256,
    verificationReceipt.verificationSha256,
  );
  assert.equal(admitted.lineage.commit, fx.receipt.commit.commit);
  assert.equal(admitted.lineage.remoteCurrent, fx.receipt.commit.commit);
  assert.equal(admitted.verification.deliveryEvidenceContractAdmitted, true);
  assert.equal(admitted.authority.deliveryEvidencePackagingPerformed, true);
  assert.equal(admitted.authority.gitPushPerformed, false);
  assert.equal(admitted.authority.deploymentPerformed, false);
});

test("supports every admitted push outcome without granting new authority", async (t) => {
  for (const outcome of [
    "pushed",
    "already-pushed",
    "remote-confirmed-after-client-error",
  ]) {
    const { bundle } = await deliveryFixture(t, outcome);
    assert.equal(bundle.lineage.pushOutcome, outcome);
    assert.equal(bundle.authority.gitNetworkReadPerformed, false);
    assert.equal(bundle.authority.releasePublicationPerformed, false);
  }
});

test("rejects rehashed unsupported fields and authority escalation", async (t) => {
  const { fx, bundle } = await deliveryFixture(t);
  const unknown = rehashBundle(bundle, (copy) => {
    copy.releaseCandidate = true;
  });
  expectCode(
    () => validateDeliveryEvidenceBundle(unknown, REPOSITORY, fx.root),
    "LAYERED_GODOT_GIT_PUSH_VERIFIER_DELIVERY_EVIDENCE_INVALID",
  );

  const escalated = rehashBundle(bundle, (copy) => {
    copy.authority.deploymentPerformed = true;
  });
  expectCode(
    () => validateDeliveryEvidenceBundle(escalated, REPOSITORY, fx.root),
    "LAYERED_GODOT_GIT_PUSH_VERIFIER_DELIVERY_EVIDENCE_INVALID",
  );
});

test("rejects rehashed source-hash and lineage substitution", async (t) => {
  const { fx, bundle } = await deliveryFixture(t);
  const wrongHash = rehashBundle(bundle, (copy) => {
    copy.sourceHashes.verificationReceiptSha256 = "f".repeat(64);
  });
  expectCode(
    () => validateDeliveryEvidenceBundle(wrongHash, REPOSITORY, fx.root),
    "LAYERED_GODOT_GIT_PUSH_VERIFIER_DELIVERY_EVIDENCE_INVALID",
  );

  const wrongLineage = rehashBundle(bundle, (copy) => {
    copy.lineage.repositoryReviewSha256 = "f".repeat(64);
  });
  expectCode(
    () => validateDeliveryEvidenceBundle(wrongLineage, REPOSITORY, fx.root),
    "LAYERED_GODOT_GIT_PUSH_VERIFIER_DELIVERY_EVIDENCE_INVALID",
  );
});

test("re-admits embedded verification evidence instead of trusting its hash", async (t) => {
  const { fx, bundle } = await deliveryFixture(t);
  const tampered = rehashBundle(bundle, (copy) => {
    copy.sourceReceipts.verification = rehashVerificationReceipt(
      copy.sourceReceipts.verification,
      (verification) => {
        verification.authority.releasePublicationPerformed = true;
      },
    );
    copy.sourceHashes.verificationReceiptSha256 =
      copy.sourceReceipts.verification.verificationSha256;
  });
  expectCode(
    () => validateDeliveryEvidenceBundle(tampered, REPOSITORY, fx.root),
    "LAYERED_GODOT_GIT_PUSH_VERIFIER_DELIVERY_EVIDENCE_SOURCE_INVALID",
  );
});

test("requires the explicitly selected repository and workspace", async (t) => {
  const { fx, bundle } = await deliveryFixture(t);
  expectCode(
    () => validateDeliveryEvidenceBundle(bundle, "EVAVO-STUDIO/other", fx.root),
    "LAYERED_GODOT_GIT_PUSH_VERIFIER_DELIVERY_EVIDENCE_INVALID",
  );
  expectCode(
    () => validateDeliveryEvidenceBundle(bundle, REPOSITORY, `${fx.root}-other`),
    "LAYERED_GODOT_GIT_PUSH_VERIFIER_DELIVERY_EVIDENCE_INVALID",
  );
});

test("rejects accessors before invoking them and rejects extra create fields", async (t) => {
  const { fx, receipt, verificationReceipt } = await deliveryFixture(t);
  let invoked = 0;
  const hostile = {
    get commitReceipt() {
      invoked += 1;
      return fx.receipt;
    },
    pushReceipt: receipt,
    verificationReceipt,
    expectedRepository: REPOSITORY,
    workspaceRoot: fx.root,
  };
  expectCode(
    () => createDeliveryEvidenceBundle(hostile),
    "LAYERED_GODOT_GIT_PUSH_VERIFIER_DELIVERY_EVIDENCE_INPUT_INVALID",
  );
  assert.equal(invoked, 0);

  expectCode(
    () => createDeliveryEvidenceBundle({
      commitReceipt: fx.receipt,
      pushReceipt: receipt,
      verificationReceipt,
      expectedRepository: REPOSITORY,
      workspaceRoot: fx.root,
      publish: true,
    }),
    "LAYERED_GODOT_GIT_PUSH_VERIFIER_DELIVERY_EVIDENCE_INPUT_INVALID",
  );
});
