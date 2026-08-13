import test from "node:test";
import {
  expectCode,
  pushedFixture,
  rehashCommitReceipt,
  rehashPushReceipt,
  verifierDependencies,
  verifierInput,
  verifyLayeredGodotPushReceipt,
} from "./test-fixture.mjs";

const INPUT_INVALID = "LAYERED_GODOT_GIT_PUSH_VERIFIER_INPUT_INVALID";
const INVALID = "LAYERED_GODOT_GIT_PUSH_VERIFIER_PUSH_RECEIPT_INVALID";
const COMMIT_INVALID = "LAYERED_GODOT_GIT_PUSH_VERIFIER_COMMIT_RECEIPT_INVALID";

test("requires actual source commit receipt evidence", async (t) => {
  const { fx, receipt } = await pushedFixture(t);
  const missing = verifierInput(fx, receipt);
  delete missing.commitReceipt;
  await expectCode(
    verifyLayeredGodotPushReceipt(missing, verifierDependencies(fx)),
    INPUT_INVALID,
  );
  await expectCode(
    verifyLayeredGodotPushReceipt(
      verifierInput(fx, receipt, { commitReceipt: null }),
      verifierDependencies(fx),
    ),
    COMMIT_INVALID,
  );
});

test("rejects correctly rehashed unsupported commit receipt fields", async (t) => {
  const { fx, receipt } = await pushedFixture(t);
  const unsupported = rehashCommitReceipt(fx.receipt, (copy) => {
    copy.unsupported = true;
  });
  await expectCode(
    verifyLayeredGodotPushReceipt(
      verifierInput(fx, receipt, { commitReceipt: unsupported }),
      verifierDependencies(fx),
    ),
    COMMIT_INVALID,
  );
});

test("rejects correctly rehashed commit receipt authority escalation", async (t) => {
  const { fx, receipt } = await pushedFixture(t);
  const escalated = rehashCommitReceipt(fx.receipt, (copy) => {
    copy.authority.gitPushPerformed = true;
  });
  await expectCode(
    verifyLayeredGodotPushReceipt(
      verifierInput(fx, receipt, { commitReceipt: escalated }),
      verifierDependencies(fx),
    ),
    COMMIT_INVALID,
  );
});

test("rejects correctly rehashed invented upstream receipt lineage", async (t) => {
  const { fx, receipt } = await pushedFixture(t);
  for (const key of [
    "commitReceiptSha256",
    "requestSha256",
    "integrationSha256",
    "repositoryReviewSha256",
  ]) {
    const inconsistent = rehashPushReceipt(receipt, (copy) => {
      copy[key] = "0".repeat(64);
    });
    await expectCode(
      verifyLayeredGodotPushReceipt(
        verifierInput(fx, inconsistent),
        verifierDependencies(fx),
      ),
      INVALID,
    );
  }
});

test("rejects correctly rehashed commit and push Git identity disagreement", async (t) => {
  const { fx, receipt } = await pushedFixture(t);
  const alteredCommit = rehashCommitReceipt(fx.receipt, (copy) => {
    copy.commit.tree = "f".repeat(40);
  });
  const reboundPush = rehashPushReceipt(receipt, (copy) => {
    copy.commitReceiptSha256 = alteredCommit.receiptSha256;
  });
  await expectCode(
    verifyLayeredGodotPushReceipt(
      verifierInput(fx, reboundPush, { commitReceipt: alteredCommit }),
      verifierDependencies(fx),
    ),
    INVALID,
  );
});

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
