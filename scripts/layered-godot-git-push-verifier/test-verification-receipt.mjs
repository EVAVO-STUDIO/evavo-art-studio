import path from "node:path";
import test from "node:test";

import {
  LayeredGodotGitPushVerifierError,
  canonicalSha256,
  validateVerificationReceipt,
} from "../layered-godot-git-push-verifier.mjs";
import {
  REPOSITORY,
  assert,
  pushedFixture,
  verifierDependencies,
  verifierInput,
  verifyLayeredGodotPushReceipt,
} from "./test-fixture.mjs";

function sameFilesystemPath(left, right) {
  return path.resolve(left) === path.resolve(right);
}

function rehashVerificationReceipt(receipt, mutate) {
  const copy = JSON.parse(JSON.stringify(receipt));
  mutate(copy);
  delete copy.verificationSha256;
  return { ...copy, verificationSha256: canonicalSha256(copy) };
}

function expectInvalid(action) {
  assert.throws(
    action,
    (error) =>
      error instanceof LayeredGodotGitPushVerifierError &&
      error.code ===
        "LAYERED_GODOT_GIT_PUSH_VERIFIER_VERIFICATION_RECEIPT_INVALID",
  );
}

async function verifiedFixture(t) {
  const { fx, receipt } = await pushedFixture(t);
  const verificationReceipt = await verifyLayeredGodotPushReceipt(
    verifierInput(fx, receipt),
    verifierDependencies(fx),
  );
  return { fx, receipt, verificationReceipt };
}

test("re-admits the generated verification receipt through one exact closed contract", async (t) => {
  const { fx, receipt, verificationReceipt } = await verifiedFixture(t);
  const admitted = validateVerificationReceipt(
    verificationReceipt,
    REPOSITORY,
    fx.root,
    sameFilesystemPath,
    fx.receipt,
    receipt,
  );
  assert.deepEqual(admitted, verificationReceipt);
  assert.equal(Object.isFrozen(admitted), true);
  assert.equal(admitted.verification.verificationReceiptContractAdmitted, true);
  assert.equal(admitted.commitReceiptSha256, fx.receipt.receiptSha256);
  assert.equal(admitted.pushReceiptSha256, receipt.receiptSha256);
});

test("rejects correctly rehashed unsupported verification receipt fields", async (t) => {
  const { fx, receipt, verificationReceipt } = await verifiedFixture(t);
  const tampered = rehashVerificationReceipt(
    verificationReceipt,
    (copy) => {
      copy.deliveryAuthority = true;
    },
  );
  expectInvalid(() =>
    validateVerificationReceipt(
      tampered,
      REPOSITORY,
      fx.root,
      sameFilesystemPath,
      fx.receipt,
      receipt,
    ),
  );
});

test("rejects correctly rehashed verification authority escalation", async (t) => {
  const { fx, receipt, verificationReceipt } = await verifiedFixture(t);
  const tampered = rehashVerificationReceipt(
    verificationReceipt,
    (copy) => {
      copy.authority.deploymentPerformed = true;
    },
  );
  expectInvalid(() =>
    validateVerificationReceipt(
      tampered,
      REPOSITORY,
      fx.root,
      sameFilesystemPath,
      fx.receipt,
      receipt,
    ),
  );
});

test("rejects correctly rehashed invented verification lineage", async (t) => {
  const { fx, receipt, verificationReceipt } = await verifiedFixture(t);
  const tampered = rehashVerificationReceipt(
    verificationReceipt,
    (copy) => {
      copy.lineage.repositoryReviewSha256 = "f".repeat(64);
    },
  );
  expectInvalid(() =>
    validateVerificationReceipt(
      tampered,
      REPOSITORY,
      fx.root,
      sameFilesystemPath,
      fx.receipt,
      receipt,
    ),
  );
});

test("rejects a correctly rehashed invented fresh local snapshot", async (t) => {
  const { fx, receipt, verificationReceipt } = await verifiedFixture(t);
  const tampered = rehashVerificationReceipt(
    verificationReceipt,
    (copy) => {
      copy.local.snapshotSha256 = "f".repeat(64);
    },
  );
  expectInvalid(() =>
    validateVerificationReceipt(
      tampered,
      REPOSITORY,
      fx.root,
      sameFilesystemPath,
      fx.receipt,
      receipt,
    ),
  );
});

test("requires explicit generated-receipt contract admission evidence", async (t) => {
  const { fx, receipt, verificationReceipt } = await verifiedFixture(t);
  const tampered = JSON.parse(JSON.stringify(verificationReceipt));
  delete tampered.verification.verificationReceiptContractAdmitted;
  delete tampered.verificationSha256;
  tampered.verificationSha256 = canonicalSha256(tampered);
  expectInvalid(() =>
    validateVerificationReceipt(
      tampered,
      REPOSITORY,
      fx.root,
      sameFilesystemPath,
      fx.receipt,
      receipt,
    ),
  );
});

test("rejects a correctly rehashed source-receipt substitution", async (t) => {
  const { fx, receipt, verificationReceipt } = await verifiedFixture(t);
  const tampered = rehashVerificationReceipt(
    verificationReceipt,
    (copy) => {
      copy.pushReceiptSha256 = "f".repeat(64);
    },
  );
  expectInvalid(() =>
    validateVerificationReceipt(
      tampered,
      REPOSITORY,
      fx.root,
      sameFilesystemPath,
      fx.receipt,
      receipt,
    ),
  );
});
