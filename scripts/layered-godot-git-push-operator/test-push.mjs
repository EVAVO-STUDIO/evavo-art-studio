import test from "node:test";

import {
  assert, access, chmod, path, writeFile,
  pushLayeredGodotCommit, REPOSITORY, git, bareGit, fixture,
  dependencies, input, cleanup, expectCode, competingRemoteCommit,
  runFixtureGit,
} from "./test-fixture.mjs";

test("pushes exactly one reviewed branch commit without hooks, tags or force", async (t) => {
  const fx = await fixture();
  await cleanup(t, fx);
  const hookSentinel = path.join(fx.root, "pre-push-ran.txt");
  const hook = path.join(fx.root, ".git", "hooks", "pre-push");
  await writeFile(hook, `#!/usr/bin/env sh\nprintf hook > '${hookSentinel}'\nexit 1\n`, "utf8");
  await chmod(hook, 0o755);
  git(fx.root, "tag", "should-not-push", fx.commit);

  const result = await pushLayeredGodotCommit(input(fx), dependencies(fx));
  assert.equal(result.outcome, "pushed");
  assert.equal(result.remote.before, fx.parent);
  assert.equal(result.remote.after, fx.commit);
  assert.equal(result.authority.gitPushPerformed, true);
  assert.equal(result.authority.forcePushPerformed, false);
  assert.equal(result.authority.gitTagPushPerformed, false);
  assert.equal(bareGit(fx.remote, "rev-parse", "refs/heads/main"), fx.commit);
  assert.throws(() => bareGit(fx.remote, "rev-parse", "refs/tags/should-not-push"));
  await assert.rejects(access(hookSentinel));
  assert.equal(git(fx.root, "status", "--porcelain=v1"), "");
});

test("is idempotent when the exact commit is already remote", async (t) => {
  const fx = await fixture();
  await cleanup(t, fx);
  await pushLayeredGodotCommit(input(fx), dependencies(fx));
  const result = await pushLayeredGodotCommit(input(fx), dependencies(fx));
  assert.equal(result.outcome, "already-pushed");
  assert.equal(result.pushCommand.attempted, false);
  assert.equal(result.authority.gitPushPerformed, false);
  assert.equal(result.remote.before, fx.commit);
});

test("rejects force or tag push authority before network mutation", async (t) => {
  const fx = await fixture();
  await cleanup(t, fx);
  await expectCode(
    pushLayeredGodotCommit(input(fx, { authorization: { push: true, forcePush: true, tags: false } }), dependencies(fx)),
    "LAYERED_GODOT_GIT_PUSH_AUTHORITY_INVALID",
  );
  await expectCode(
    pushLayeredGodotCommit(input(fx, { authorization: { push: true, forcePush: false, tags: true } }), dependencies(fx)),
    "LAYERED_GODOT_GIT_PUSH_AUTHORITY_INVALID",
  );
  assert.equal(bareGit(fx.remote, "rev-parse", "refs/heads/main"), fx.parent);
});

test("rejects a missing remote branch rather than creating one", async (t) => {
  const fx = await fixture();
  await cleanup(t, fx);
  bareGit(fx.remote, "update-ref", "-d", "refs/heads/main");
  await expectCode(
    pushLayeredGodotCommit(input(fx), dependencies(fx)),
    "LAYERED_GODOT_GIT_PUSH_REMOTE_BRANCH_MISSING",
  );
});

test("rejects remote drift from the reviewed parent", async (t) => {
  const fx = await fixture();
  await cleanup(t, fx);
  const competing = competingRemoteCommit(fx);
  await expectCode(
    pushLayeredGodotCommit(input(fx), dependencies(fx)),
    "LAYERED_GODOT_GIT_PUSH_REMOTE_DRIFT",
  );
  assert.equal(bareGit(fx.remote, "rev-parse", "refs/heads/main"), competing);
});

test("plain push rejects a remote race that occurs after preflight", async (t) => {
  const fx = await fixture();
  await cleanup(t, fx);
  let raced = false;
  const wrapped = async (root, args, settings) => {
    if (!raced && args.includes("push")) {
      raced = true;
      competingRemoteCommit(fx);
    }
    return runFixtureGit(fx, root, args, settings);
  };
  await expectCode(
    pushLayeredGodotCommit(input(fx), dependencies(fx, { runGit: wrapped })),
    "LAYERED_GODOT_GIT_PUSH_PUSH_VERIFY_FAILED",
  );
  assert.equal(raced, true);
  assert.notEqual(bareGit(fx.remote, "rev-parse", "refs/heads/main"), fx.commit);
});

test("accepts remote readback when the client reports a synthetic error after success", async (t) => {
  const fx = await fixture();
  await cleanup(t, fx);
  const wrapped = async (root, args, settings) => {
    const result = await runFixtureGit(fx, root, args, settings);
    if (args.includes("push")) return { ...result, exitCode: 1 };
    return result;
  };
  const result = await pushLayeredGodotCommit(input(fx), dependencies(fx, { runGit: wrapped }));
  assert.equal(result.outcome, "remote-confirmed-after-client-error");
  assert.equal(result.remote.after, fx.commit);
  assert.equal(result.authority.gitPushPerformed, false);
  assert.equal(result.authority.gitRemoteRefUpdatedToCommit, true);
});
