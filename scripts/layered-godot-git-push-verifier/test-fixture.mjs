import assert from "node:assert/strict";

import {
  REPOSITORY,
  SAFE_ORIGIN,
  bareGit,
  canonicalSha256 as pushCanonicalSha256,
  cleanup,
  competingRemoteCommit,
  dependencies as pushDependencies,
  fixture,
  git,
  input as pushInput,
  pushLayeredGodotCommit,
  runFixtureGit,
} from "../layered-godot-git-push-operator/test-fixture.mjs";
import {
  LayeredGodotGitPushVerifierError,
  verifyLayeredGodotPushReceipt,
} from "../layered-godot-git-push-verifier.mjs";

export const VERIFIED_AT = "2026-08-13T02:00:00.000Z";

export function verifierInput(fx, pushReceipt, overrides = {}) {
  return {
    pushReceipt,
    workspaceRoot: fx.root,
    expectedRepository: REPOSITORY,
    ...overrides,
  };
}

export function verifierDependencies(fx, overrides = {}) {
  return {
    runGit: (root, args, settings) => runFixtureGit(fx, root, args, settings),
    now: () => VERIFIED_AT,
    ...overrides,
  };
}

export async function expectCode(promise, code) {
  await assert.rejects(
    promise,
    (error) => error instanceof LayeredGodotGitPushVerifierError && error.code === code,
  );
}

export function rehashPushReceipt(receipt, mutate) {
  const copy = JSON.parse(JSON.stringify(receipt));
  mutate(copy);
  delete copy.receiptSha256;
  return { ...copy, receiptSha256: pushCanonicalSha256(copy) };
}

export async function pushedFixture(t, outcome = "pushed") {
  const fx = await fixture();
  await cleanup(t, fx);
  let receipt;
  if (outcome === "pushed") {
    receipt = await pushLayeredGodotCommit(pushInput(fx), pushDependencies(fx));
  } else if (outcome === "already-pushed") {
    await pushLayeredGodotCommit(pushInput(fx), pushDependencies(fx));
    receipt = await pushLayeredGodotCommit(pushInput(fx), pushDependencies(fx));
  } else if (outcome === "remote-confirmed-after-client-error") {
    const dependencies = pushDependencies(fx);
    const baseRunGit = dependencies.runGit;
    receipt = await pushLayeredGodotCommit(pushInput(fx), {
      ...dependencies,
      runGit: async (root, args, settings) => {
        const result = await baseRunGit(root, args, settings);
        return args.includes("push") ? { ...result, exitCode: 1 } : result;
      },
    });
  } else {
    throw new Error(`unsupported fixture outcome ${outcome}`);
  }
  git(fx.root, "remote", "set-url", "origin", SAFE_ORIGIN);
  return { fx, receipt };
}

export {
  REPOSITORY,
  SAFE_ORIGIN,
  assert,
  bareGit,
  competingRemoteCommit,
  git,
  verifyLayeredGodotPushReceipt,
};
