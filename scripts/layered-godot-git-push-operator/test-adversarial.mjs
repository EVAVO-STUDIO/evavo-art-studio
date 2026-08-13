import test from "node:test";

import {
  assert, path, writeFile, canonicalSha256, inspectOrigin,
  pushLayeredGodotCommit, runGit, REPOSITORY, SAFE_ORIGIN, git, bareGit, fixture,
  dependencies, input, cleanup, expectCode, makeCommitReceipt,
  runFixtureGit, sha,
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

test("rejects dependency accessors without invoking them", async (t) => {
  const fx = await fixture();
  await cleanup(t, fx);
  const deps = dependencies(fx);
  let invoked = false;
  Object.defineProperty(deps, "runGit", {
    enumerable: true,
    get() {
      invoked = true;
      return () => undefined;
    },
  });
  await expectCode(
    pushLayeredGodotCommit(input(fx), deps),
    "LAYERED_GODOT_GIT_PUSH_INPUT_INVALID",
  );
  assert.equal(invoked, false);
  assert.equal(bareGit(fx.remote, "rev-parse", "refs/heads/main"), fx.parent);
});

test("rejects unsupported and symbolic dependency fields", async (t) => {
  const fx = await fixture();
  await cleanup(t, fx);
  const withUnknown = { ...dependencies(fx), unexpected: true };
  await expectCode(
    pushLayeredGodotCommit(input(fx), withUnknown),
    "LAYERED_GODOT_GIT_PUSH_INPUT_INVALID",
  );
  const withSymbol = dependencies(fx);
  withSymbol[Symbol("unexpected")] = true;
  await expectCode(
    pushLayeredGodotCommit(input(fx), withSymbol),
    "LAYERED_GODOT_GIT_PUSH_INPUT_INVALID",
  );
});

test("rejects Proxy dependency functions before repository or network work", async (t) => {
  const fx = await fixture();
  await cleanup(t, fx);
  const deps = dependencies(fx);
  deps.runGit = new Proxy(deps.runGit, {});
  await expectCode(
    pushLayeredGodotCommit(input(fx), deps),
    "LAYERED_GODOT_GIT_PUSH_INPUT_INVALID",
  );
  assert.equal(bareGit(fx.remote, "rev-parse", "refs/heads/main"), fx.parent);
});

test("rejects Proxy workspace-root results", async (t) => {
  const fx = await fixture();
  await cleanup(t, fx);
  const deps = dependencies(fx);
  deps.inspectWorkspaceRoot = async () => new Proxy({
    path: fx.root,
    realPath: fx.realRoot,
  }, {});
  await expectCode(
    pushLayeredGodotCommit(input(fx), deps),
    "LAYERED_GODOT_GIT_PUSH_INPUT_INVALID",
  );
});

test("rejects workspace-root accessors without invoking them", async (t) => {
  const fx = await fixture();
  await cleanup(t, fx);
  const deps = dependencies(fx);
  let invoked = false;
  deps.inspectWorkspaceRoot = async () => {
    const root = { realPath: fx.realRoot };
    Object.defineProperty(root, "path", {
      enumerable: true,
      get() {
        invoked = true;
        return fx.root;
      },
    });
    return root;
  };
  await expectCode(
    pushLayeredGodotCommit(input(fx), deps),
    "LAYERED_GODOT_GIT_PUSH_INPUT_INVALID",
  );
  assert.equal(invoked, false);
});

test("rejects an injected origin whose URL identity differs from the selected repository", async (t) => {
  const fx = await fixture();
  await cleanup(t, fx);
  const deps = dependencies(fx);
  deps.resolveOrigin = async () => ({
    url: "https://github.com/EVAVO-STUDIO/Elsewhere.git",
    repository: REPOSITORY,
  });
  await expectCode(
    pushLayeredGodotCommit(input(fx), deps),
    "LAYERED_GODOT_GIT_PUSH_ORIGIN_MISMATCH",
  );
});

test("rejects origin-result accessors without invoking them", async (t) => {
  const fx = await fixture();
  await cleanup(t, fx);
  const deps = dependencies(fx);
  let invoked = false;
  deps.resolveOrigin = async () => {
    const origin = { repository: REPOSITORY };
    Object.defineProperty(origin, "url", {
      enumerable: true,
      get() {
        invoked = true;
        return SAFE_ORIGIN;
      },
    });
    return origin;
  };
  await expectCode(
    pushLayeredGodotCommit(input(fx), deps),
    "LAYERED_GODOT_GIT_PUSH_INPUT_INVALID",
  );
  assert.equal(invoked, false);
});

test("captures each validated origin result before later dependency mutation", async (t) => {
  const fx = await fixture();
  await cleanup(t, fx);
  const deps = dependencies(fx);
  let latestOrigin = null;
  let armed = false;
  let mutations = 0;
  deps.resolveOrigin = async () => {
    latestOrigin = { url: SAFE_ORIGIN, repository: REPOSITORY };
    armed = true;
    return latestOrigin;
  };
  deps.runGit = async (root, args, settings) => {
    if (armed && args[0] === "ls-remote") {
      latestOrigin.url = "https://github.com/EVAVO-STUDIO/Elsewhere.git";
      latestOrigin.repository = "EVAVO-STUDIO/Elsewhere";
      armed = false;
      mutations += 1;
    }
    return runFixtureGit(fx, root, args, settings);
  };
  const result = await pushLayeredGodotCommit(input(fx), deps);
  assert.equal(mutations, 2);
  assert.equal(result.outcome, "pushed");
  assert.equal(result.remote.url, SAFE_ORIGIN);
  assert.equal(result.remote.repository, REPOSITORY);
});

test("rejects Proxy Git subprocess results", async (t) => {
  const fx = await fixture();
  await cleanup(t, fx);
  let injected = false;
  const wrapped = async (root, args, settings) => {
    const result = await runFixtureGit(fx, root, args, settings);
    if (!injected) {
      injected = true;
      return new Proxy({
        exitCode: result.exitCode,
        signal: result.signal,
        stdout: result.stdout,
        stderr: result.stderr,
      }, {});
    }
    return result;
  };
  await expectCode(
    pushLayeredGodotCommit(input(fx), dependencies(fx, { runGit: wrapped })),
    "LAYERED_GODOT_GIT_PUSH_INPUT_INVALID",
  );
});

test("rejects Git-result accessors without invoking them", async (t) => {
  const fx = await fixture();
  await cleanup(t, fx);
  let invoked = false;
  let injected = false;
  const wrapped = async (root, args, settings) => {
    const result = await runFixtureGit(fx, root, args, settings);
    if (injected) return result;
    injected = true;
    const hostile = {
      exitCode: result.exitCode,
      signal: result.signal,
      stderr: result.stderr,
    };
    Object.defineProperty(hostile, "stdout", {
      enumerable: true,
      get() {
        invoked = true;
        return result.stdout;
      },
    });
    return hostile;
  };
  await expectCode(
    pushLayeredGodotCommit(input(fx), dependencies(fx, { runGit: wrapped })),
    "LAYERED_GODOT_GIT_PUSH_INPUT_INVALID",
  );
  assert.equal(invoked, false);
});

test("rejects Git subprocess results with unsupported fields", async (t) => {
  const fx = await fixture();
  await cleanup(t, fx);
  let injected = false;
  const wrapped = async (root, args, settings) => {
    const result = await runFixtureGit(fx, root, args, settings);
    if (!injected) {
      injected = true;
      return { ...result, untrusted: true };
    }
    return result;
  };
  await expectCode(
    pushLayeredGodotCommit(input(fx), dependencies(fx, { runGit: wrapped })),
    "LAYERED_GODOT_GIT_PUSH_INPUT_INVALID",
  );
});

test("rejects shared-memory Git output buffers", async (t) => {
  const fx = await fixture();
  await cleanup(t, fx);
  if (typeof SharedArrayBuffer === "undefined") {
    t.skip("SharedArrayBuffer is unavailable");
    return;
  }
  let injected = false;
  const wrapped = async (root, args, settings) => {
    const result = await runFixtureGit(fx, root, args, settings);
    if (injected) return result;
    injected = true;
    const shared = Buffer.from(new SharedArrayBuffer(result.stdout.byteLength));
    result.stdout.copy(shared);
    return { ...result, stdout: shared };
  };
  await expectCode(
    pushLayeredGodotCommit(input(fx), dependencies(fx, { runGit: wrapped })),
    "LAYERED_GODOT_GIT_PUSH_INPUT_INVALID",
  );
});

test("rejects injected Git output beyond the bounded byte limit", async (t) => {
  const fx = await fixture();
  await cleanup(t, fx);
  let injected = false;
  const wrapped = async (root, args, settings) => {
    const result = await runFixtureGit(fx, root, args, settings);
    if (!injected) {
      injected = true;
      return {
        ...result,
        stdout: Buffer.alloc(2 * 1024 * 1024 + 1),
        stderr: Buffer.alloc(0),
      };
    }
    return result;
  };
  await expectCode(
    pushLayeredGodotCommit(input(fx), dependencies(fx, { runGit: wrapped })),
    "LAYERED_GODOT_GIT_PUSH_INPUT_INVALID",
  );
});

test("owns push-result status and buffers before later dependency mutation", async (t) => {
  const fx = await fixture();
  await cleanup(t, fx);
  let mutablePushResult = null;
  let expectedStdout = null;
  let expectedStderr = null;
  let mutated = false;
  const wrapped = async (root, args, settings) => {
    if (mutablePushResult !== null && !mutated) {
      mutablePushResult.exitCode = 19;
      mutablePushResult.stdout = Buffer.from("mutated stdout\n", "utf8");
      mutablePushResult.stderr = Buffer.from("mutated stderr\n", "utf8");
      mutated = true;
    }
    const result = await runFixtureGit(fx, root, args, settings);
    if (args.includes("push")) {
      mutablePushResult = {
        exitCode: result.exitCode,
        signal: result.signal,
        stdout: Buffer.from(result.stdout),
        stderr: Buffer.from(result.stderr),
      };
      expectedStdout = Buffer.from(mutablePushResult.stdout);
      expectedStderr = Buffer.from(mutablePushResult.stderr);
      return mutablePushResult;
    }
    return result;
  };
  const result = await pushLayeredGodotCommit(
    input(fx),
    dependencies(fx, { runGit: wrapped }),
  );
  assert.equal(mutated, true);
  assert.equal(result.outcome, "pushed");
  assert.equal(result.pushCommand.exitCode, 0);
  assert.equal(result.pushCommand.stdoutBytes, expectedStdout.byteLength);
  assert.equal(result.pushCommand.stderrBytes, expectedStderr.byteLength);
  assert.equal(result.pushCommand.stdoutSha256, sha(expectedStdout));
  assert.equal(result.pushCommand.stderrSha256, sha(expectedStderr));
});
