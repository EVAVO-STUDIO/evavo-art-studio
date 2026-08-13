import test from "node:test";
import { canonicalSha256 } from "../layered-godot-git-push-verifier.mjs";
import {
  VERIFIED_AT,
  assert,
  pushedFixture,
  verifierDependencies,
  verifierInput,
  verifyLayeredGodotPushReceipt,
} from "./test-fixture.mjs";

test("independently verifies a pushed receipt without mutation authority", async (t) => {
  const { fx, receipt } = await pushedFixture(t);
  const result = await verifyLayeredGodotPushReceipt(
    verifierInput(fx, receipt),
    verifierDependencies(fx),
  );
  assert.equal(result.pushReceiptSha256, receipt.receiptSha256);
  assert.equal(result.local.commit, fx.commit);
  assert.equal(result.remote.current, fx.commit);
  assert.equal(result.remote.stableAcrossVerification, true);
  assert.equal(result.verification.outcome, "pushed");
  assert.equal(result.verifiedAt, VERIFIED_AT);
  assert.equal(result.authority.gitPushAttempted, false);
  assert.equal(result.authority.gitPushPerformed, false);
  assert.equal(result.authority.gitRefUpdated, false);
  assert.equal(result.authority.deploymentPerformed, false);
  assert.equal(result.verificationSha256.length, 64);
  const { verificationSha256, ...payload } = result;
  assert.equal(verificationSha256, canonicalSha256(payload));
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.remote), true);
});

test("verifies an idempotent already-pushed receipt", async (t) => {
  const { fx, receipt } = await pushedFixture(t, "already-pushed");
  const result = await verifyLayeredGodotPushReceipt(
    verifierInput(fx, receipt),
    verifierDependencies(fx),
  );
  assert.equal(receipt.pushCommand.attempted, false);
  assert.equal(result.verification.outcome, "already-pushed");
  assert.equal(result.remote.current, fx.commit);
});

test("verifies remote-confirmed-after-client-error evidence", async (t) => {
  const { fx, receipt } = await pushedFixture(t, "remote-confirmed-after-client-error");
  const result = await verifyLayeredGodotPushReceipt(
    verifierInput(fx, receipt),
    verifierDependencies(fx),
  );
  assert.equal(receipt.pushCommand.exitCode, 1);
  assert.equal(receipt.authority.gitPushPerformed, false);
  assert.equal(result.verification.outcome, "remote-confirmed-after-client-error");
  assert.equal(result.remote.current, fx.commit);
});
