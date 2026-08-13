import test from "node:test";
import {
  expectCode,
  pushedFixture,
  rehashPushReceipt,
  verifierDependencies,
  verifierInput,
  verifyLayeredGodotPushReceipt,
} from "./test-fixture.mjs";

const INVALID = "LAYERED_GODOT_GIT_PUSH_VERIFIER_PUSH_RECEIPT_INVALID";

test("rejects correctly rehashed unsupported push receipt fields", async (t) => {
  const { fx, receipt } = await pushedFixture(t);
  const topLevel = rehashPushReceipt(receipt, (copy) => { copy.unsupported = true; });
  await expectCode(
    verifyLayeredGodotPushReceipt(verifierInput(fx, topLevel), verifierDependencies(fx)),
    INVALID,
  );
  const nested = rehashPushReceipt(receipt, (copy) => { copy.remote.unsupported = true; });
  await expectCode(
    verifyLayeredGodotPushReceipt(verifierInput(fx, nested), verifierDependencies(fx)),
    INVALID,
  );
});

test("rejects rehashed authority escalation", async (t) => {
  const { fx, receipt } = await pushedFixture(t);
  const escalated = rehashPushReceipt(receipt, (copy) => {
    copy.authority.deploymentPerformed = true;
  });
  await expectCode(
    verifyLayeredGodotPushReceipt(verifierInput(fx, escalated), verifierDependencies(fx)),
    INVALID,
  );
});

test("rejects rehashed outcome and command-evidence disagreement", async (t) => {
  const { fx, receipt } = await pushedFixture(t);
  const inconsistent = rehashPushReceipt(receipt, (copy) => {
    copy.outcome = "remote-confirmed-after-client-error";
  });
  await expectCode(
    verifyLayeredGodotPushReceipt(verifierInput(fx, inconsistent), verifierDependencies(fx)),
    INVALID,
  );
});
