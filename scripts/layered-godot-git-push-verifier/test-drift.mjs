import test from "node:test";
import {
  assert,
  bareGit,
  competingRemoteCommit,
  expectCode,
  pushedFixture,
  verifierDependencies,
  verifierInput,
  verifyLayeredGodotPushReceipt,
} from "./test-fixture.mjs";

test("rejects local repository drift after the push receipt", async (t) => {
  const { fx, receipt } = await pushedFixture(t);
  await import("node:fs/promises").then(({ writeFile }) =>
    writeFile(`${fx.root}/unrelated.txt`, "drift\n", "utf8"));
  await expectCode(
    verifyLayeredGodotPushReceipt(verifierInput(fx, receipt), verifierDependencies(fx)),
    "LAYERED_GODOT_GIT_PUSH_VERIFIER_LOCAL_DRIFT",
  );
});

test("rejects remote drift after the push receipt", async (t) => {
  const { fx, receipt } = await pushedFixture(t);
  const competing = competingRemoteCommit(fx);
  await expectCode(
    verifyLayeredGodotPushReceipt(verifierInput(fx, receipt), verifierDependencies(fx)),
    "LAYERED_GODOT_GIT_PUSH_VERIFIER_REMOTE_DRIFT",
  );
  assert.equal(bareGit(fx.remote, "rev-parse", "refs/heads/main"), competing);
});

test("detects remote movement during the two-phase verification window", async (t) => {
  const { fx, receipt } = await pushedFixture(t);
  let reads = 0;
  await expectCode(
    verifyLayeredGodotPushReceipt(verifierInput(fx, receipt), verifierDependencies(fx, {
      readRemoteHead: async () => {
        reads += 1;
        return reads === 1 ? receipt.local.commit : receipt.local.parent;
      },
    })),
    "LAYERED_GODOT_GIT_PUSH_VERIFIER_REMOTE_DRIFT",
  );
  assert.equal(reads, 2);
});
