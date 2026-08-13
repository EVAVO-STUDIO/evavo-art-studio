import test from "node:test";
import {
  REPOSITORY,
  SAFE_ORIGIN,
  assert,
  expectCode,
  pushedFixture,
  verifierDependencies,
  verifierInput,
  verifyLayeredGodotPushReceipt,
} from "./test-fixture.mjs";

test("input snapshot rejects accessors without invoking them", async (t) => {
  const { fx, receipt } = await pushedFixture(t);
  let invoked = false;
  const value = verifierInput(fx, receipt);
  Object.defineProperty(value, "pushReceipt", {
    enumerable: true,
    get() { invoked = true; return receipt; },
  });
  await expectCode(
    verifyLayeredGodotPushReceipt(value, verifierDependencies(fx)),
    "LAYERED_GODOT_GIT_PUSH_VERIFIER_INPUT_INVALID",
  );
  assert.equal(invoked, false);
});

test("dependency capture rejects accessors and Proxy functions without invocation", async (t) => {
  const { fx, receipt } = await pushedFixture(t);
  let invoked = false;
  const accessorDependencies = {};
  Object.defineProperty(accessorDependencies, "runGit", {
    enumerable: true,
    get() { invoked = true; return () => {}; },
  });
  await expectCode(
    verifyLayeredGodotPushReceipt(verifierInput(fx, receipt), accessorDependencies),
    "LAYERED_GODOT_GIT_PUSH_VERIFIER_INPUT_INVALID",
  );
  assert.equal(invoked, false);
  await expectCode(
    verifyLayeredGodotPushReceipt(verifierInput(fx, receipt), {
      runGit: new Proxy(() => {}, {}),
    }),
    "LAYERED_GODOT_GIT_PUSH_VERIFIER_INPUT_INVALID",
  );
});

test("rejects origin accessors without invocation and origin identity substitution", async (t) => {
  const { fx, receipt } = await pushedFixture(t);
  let invoked = false;
  await expectCode(
    verifyLayeredGodotPushReceipt(verifierInput(fx, receipt), verifierDependencies(fx, {
      resolveOrigin: async () => {
        const result = { repository: REPOSITORY };
        Object.defineProperty(result, "url", {
          enumerable: true,
          get() { invoked = true; return SAFE_ORIGIN; },
        });
        return result;
      },
    })),
    "LAYERED_GODOT_GIT_PUSH_VERIFIER_INPUT_INVALID",
  );
  assert.equal(invoked, false);
  await expectCode(
    verifyLayeredGodotPushReceipt(verifierInput(fx, receipt), verifierDependencies(fx, {
      resolveOrigin: async () => ({
        url: "https://github.com/EVAVO-STUDIO/Elsewhere.git",
        repository: REPOSITORY,
      }),
    })),
    "LAYERED_GODOT_GIT_PUSH_VERIFIER_ORIGIN_INVALID",
  );
});

test("closed Git runner rejects injected mutating commands", async (t) => {
  const { fx, receipt } = await pushedFixture(t);
  await expectCode(
    verifyLayeredGodotPushReceipt(verifierInput(fx, receipt), verifierDependencies(fx, {
      resolveOrigin: async (root, repository, deps) => {
        await deps.runGit(root.path, ["update-index", "--refresh"]);
        return { url: SAFE_ORIGIN, repository };
      },
    })),
    "LAYERED_GODOT_GIT_PUSH_VERIFIER_GIT_COMMAND_REJECTED",
  );
});

test("rejects shared-memory and oversized injected Git output", async (t) => {
  const { fx, receipt } = await pushedFixture(t);
  if (typeof SharedArrayBuffer !== "undefined") {
    const shared = Buffer.from(new SharedArrayBuffer(8));
    await expectCode(
      verifyLayeredGodotPushReceipt(verifierInput(fx, receipt), verifierDependencies(fx, {
        runGit: async () => ({ exitCode: 0, signal: null, stdout: shared, stderr: Buffer.alloc(0) }),
      })),
      "LAYERED_GODOT_GIT_PUSH_VERIFIER_GIT_RESULT_INVALID",
    );
  }
  await expectCode(
    verifyLayeredGodotPushReceipt(verifierInput(fx, receipt), verifierDependencies(fx, {
      runGit: async () => ({
        exitCode: 0,
        signal: null,
        stdout: Buffer.alloc(2 * 1024 * 1024 + 1),
        stderr: Buffer.alloc(0),
      }),
    })),
    "LAYERED_GODOT_GIT_PUSH_VERIFIER_GIT_RESULT_INVALID",
  );
});
