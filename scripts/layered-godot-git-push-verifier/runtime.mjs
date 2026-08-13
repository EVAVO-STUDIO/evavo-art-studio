import path from "node:path";
import { verifierFail } from "./protocol.mjs";
import { snapshotJsonValue } from "./snapshot.mjs";
import { canonicalUtc, exactObject, repositoryName } from "./validation.mjs";
import {
  captureDependencies,
  captureOrigin,
  captureWorkspaceRoot,
  resolveDefaultDependencies,
  validateResolvedDependencies,
} from "./dependencies.mjs";
import {
  captureRemoteHead,
  inspectLocalRepository,
  makeOwnedGitRunner,
} from "./git-readonly.mjs";
import { validatePushReceipt } from "./receipt-contract.mjs";
import { makeVerificationReceipt } from "./verification-receipt.mjs";

const INPUT_KEYS = ["pushReceipt", "workspaceRoot", "expectedRepository"];

export async function verifyLayeredGodotPushReceipt(input, dependencies = {}) {
  const request = exactObject(
    snapshotJsonValue(input, "gitPushVerificationInput"),
    INPUT_KEYS,
    "gitPushVerificationInput",
  );
  if (typeof request.workspaceRoot !== "string") verifierFail("INPUT_INVALID", "workspaceRoot must be a string.");
  const repository = repositoryName(request.expectedRepository, "expectedRepository");

  const capturedDependencies = captureDependencies(dependencies);
  const defaults = capturedDependencies.complete === true ? {} : await resolveDefaultDependencies();
  const overrides = Object.fromEntries(
    Object.entries(capturedDependencies).filter(([key]) => key !== "complete"),
  );
  const deps = validateResolvedDependencies({ ...defaults, ...overrides });
  const sameFilesystemPath = (left, right) => {
    const result = deps.sameFilesystemPath(left, right);
    if (typeof result !== "boolean") verifierFail("INPUT_INVALID", "sameFilesystemPath must return boolean.");
    return result;
  };
  const guardedDeps = Object.freeze({ ...deps, sameFilesystemPath });
  const root = captureWorkspaceRoot(
    await guardedDeps.inspectWorkspaceRoot(path.resolve(request.workspaceRoot)),
  );
  const receipt = validatePushReceipt(
    request.pushReceipt,
    repository,
    root,
    sameFilesystemPath,
  );
  const ownedRunGit = makeOwnedGitRunner(root, guardedDeps);

  const localBefore = await inspectLocalRepository(root, receipt, ownedRunGit, sameFilesystemPath);
  const originBefore = captureOrigin(
    await guardedDeps.resolveOrigin(root, repository, { runGit: ownedRunGit }),
    repository,
  );
  if (
    originBefore.url !== receipt.remote.url ||
    originBefore.repository.toLowerCase() !== receipt.remote.repository.toLowerCase()
  ) verifierFail("ORIGIN_INVALID", "Current origin no longer matches the push receipt.");
  const remoteBefore = captureRemoteHead(
    await guardedDeps.readRemoteHead(
      root,
      originBefore.url,
      receipt.local.branch,
      { runGit: ownedRunGit },
    ),
    receipt.local.branch,
  );

  const localAfter = await inspectLocalRepository(root, receipt, ownedRunGit, sameFilesystemPath);
  const originAfter = captureOrigin(
    await guardedDeps.resolveOrigin(root, repository, { runGit: ownedRunGit }),
    repository,
  );
  const remoteAfter = captureRemoteHead(
    await guardedDeps.readRemoteHead(
      root,
      originAfter.url,
      receipt.local.branch,
      { runGit: ownedRunGit },
    ),
    receipt.local.branch,
  );

  if (localAfter.snapshotSha256 !== localBefore.snapshotSha256) {
    verifierFail("LOCAL_DRIFT", "Local repository changed during push receipt verification.");
  }
  if (
    originAfter.url !== originBefore.url ||
    originAfter.repository.toLowerCase() !== originBefore.repository.toLowerCase()
  ) verifierFail("ORIGIN_INVALID", "Origin changed during push receipt verification.");
  if (
    remoteBefore !== receipt.remote.after ||
    remoteAfter !== remoteBefore ||
    remoteAfter !== receipt.local.commit
  ) verifierFail("REMOTE_DRIFT", "Remote branch is not stably bound to the exact pushed commit.", {
    expectedCommit: receipt.local.commit,
    receiptRemoteAfter: receipt.remote.after,
    remoteBefore,
    remoteAfter,
  });

  const verifiedAt = canonicalUtc(
    guardedDeps.now(),
    "dependencies.now result",
    "TIME_INVALID",
  );
  return makeVerificationReceipt({
    repository,
    root,
    receipt,
    local: localAfter,
    origin: originAfter,
    remote: remoteAfter,
    verifiedAt,
  });
}
