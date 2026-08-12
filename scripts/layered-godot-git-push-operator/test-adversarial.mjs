import test from "node:test";

import {
  assert, access, chmod, path, writeFile, canonicalSha256, inspectOrigin,
  pushLayeredGodotCommit, runGit, REPOSITORY, git, bareGit, fixture,
  dependencies, input, cleanup, expectCode, competingRemoteCommit,
  makeCommitReceipt,
} from "./test-fixture.mjs";

test("rejects local HEAD drift after the commit receipt", async (t) => {
  const fx = await fixture();
  await cleanup(t, fx);
  await writeFile(path.join(fx.root, "extra.txt"), "drift\n", "utf8");
  git(fx.root, "add", "extra.txt");
  git(fx.root, "commit", "-q", "-m", "drift");
  await expectCode(
    pushLayeredGodotCommit(input(fx), dependencies(fx)),
    "LAYERED_GODOT_GIT_PUSH_LOCAL_DRIFT",
  );
});

test("rejects dirty local worktree state", async (t) => {
  const fx = await fixture();
  await cleanup(t, fx);
  await writeFile(path.join(fx.root, "README.md"), "dirty\n", "utf8");
  await expectCode(
    pushLayeredGodotCommit(input(fx), dependencies(fx)),
    "LAYERED_GODOT_GIT_PUSH_LOCAL_DRIFT",
  );
});

test("rejects a correctly rehashed commit receipt that escalates prior push authority", async (t) => {
  const fx = await fixture();
  await cleanup(t, fx);
  fx.receipt = makeCommitReceipt(fx, {
    authority: { ...makeCommitReceipt(fx).authority, gitPushPerformed: true },
  });
  await expectCode(
    pushLayeredGodotCommit(input(fx), dependencies(fx)),
    "LAYERED_GODOT_GIT_PUSH_COMMIT_RECEIPT_INVALID",
  );
});

test("rejects a rehashed commit receipt whose resource bytes do not match Git", async (t) => {
  const fx = await fixture();
  await cleanup(t, fx);
  const altered = makeCommitReceipt(fx);
  altered.stagedResources[0] = { ...altered.stagedResources[0], sha256: "0".repeat(64) };
  const { receiptSha256: _old, ...payload } = altered;
  fx.receipt = { ...payload, receiptSha256: canonicalSha256(payload) };
  await expectCode(
    pushLayeredGodotCommit(input(fx), dependencies(fx)),
    "LAYERED_GODOT_GIT_PUSH_LOCAL_DRIFT",
  );
});

test("default origin inspection rejects URL rewrites and push URLs", async (t) => {
  const fx = await fixture();
  await cleanup(t, fx);
  git(fx.root, "remote", "set-url", "origin", `https://github.com/${REPOSITORY}.git`);
  git(fx.root, "config", "url.file:///tmp/redirect.insteadOf", "https://github.com/");
  const root = { path: fx.root, realPath: fx.realRoot };
  await expectCode(
    inspectOrigin(root, REPOSITORY, { runGit }),
    "LAYERED_GODOT_GIT_PUSH_ORIGIN_UNSAFE",
  );
  git(fx.root, "config", "--unset-all", "url.file:///tmp/redirect.insteadOf");
  git(fx.root, "config", "remote.origin.pushurl", "https://github.com/EVAVO-STUDIO/Elsewhere.git");
  await expectCode(
    inspectOrigin(root, REPOSITORY, { runGit }),
    "LAYERED_GODOT_GIT_PUSH_ORIGIN_UNSAFE",
  );
});

test("commit receipts without a created commit cannot enter the push boundary", async (t) => {
  const fx = await fixture();
  await cleanup(t, fx);
  const base = makeCommitReceipt(fx);
  const payload = {
    ...base,
    outcome: "already-integrated",
    stagedResources: [],
    commit: null,
    authority: {
      ...base.authority,
      gitObjectWritePerformed: false,
      gitIndexMutationPerformed: false,
      gitCommitCreated: false,
      gitRefUpdated: false,
    },
  };
  delete payload.receiptSha256;
  fx.receipt = { ...payload, receiptSha256: canonicalSha256(payload) };
  await expectCode(
    pushLayeredGodotCommit(input(fx), dependencies(fx)),
    "LAYERED_GODOT_GIT_PUSH_NO_COMMIT",
  );
});
