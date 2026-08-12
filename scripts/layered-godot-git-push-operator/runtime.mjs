import path from "node:path";

import {
  exactObject,
  pushFail,
  repositoryName,
  snapshotJsonValue,
  validateCommitReceipt,
} from "./contract.mjs";
import {
  createEmptyHooksDirectory,
  networkOptions,
  removeHooksDirectory,
  runGit,
} from "./git-exec.mjs";
import { inspectLocalRepository } from "./local.mjs";
import { inspectOrigin, readRemoteHead } from "./origin.mjs";
import { makeReceipt } from "./receipt.mjs";

const INPUT_KEYS = ["commitReceipt", "workspaceRoot", "expectedRepository", "authorization"];
const AUTHORIZATION_KEYS = ["push", "forcePush", "tags"];

async function resolveDefaultDependencies() {
  const filesystem = await import("../layered-godot-workspace-writer/filesystem.mjs");
  return {
    inspectWorkspaceRoot: filesystem.inspectWorkspaceRoot,
    sameFilesystemPath: filesystem.sameFilesystemPath,
    runGit,
    resolveOrigin: inspectOrigin,
  };
}

function validateAuthorization(value) {
  const authorization = exactObject(value, AUTHORIZATION_KEYS, "authorization");
  if (authorization.push !== true || authorization.forcePush !== false || authorization.tags !== false) {
    pushFail("AUTHORITY_INVALID", "Authorization must explicitly allow one branch push while denying force and tag pushes.");
  }
  return authorization;
}

export async function pushLayeredGodotCommit(input, dependencies = {}) {
  const request = exactObject(snapshotJsonValue(input), INPUT_KEYS, "gitPushInput");
  validateAuthorization(request.authorization);
  if (typeof request.workspaceRoot !== "string") pushFail("INPUT_INVALID", "workspaceRoot must be a string.");
  const repository = repositoryName(request.expectedRepository, "expectedRepository");
  const defaults = dependencies.complete === true ? {} : await resolveDefaultDependencies();
  const deps = { ...defaults, ...dependencies };
  for (const key of ["inspectWorkspaceRoot", "sameFilesystemPath", "runGit", "resolveOrigin"]) {
    if (typeof deps[key] !== "function") pushFail("INPUT_INVALID", `dependencies.${key} must be a function.`);
  }

  const root = await deps.inspectWorkspaceRoot(path.resolve(request.workspaceRoot));
  const receipt = validateCommitReceipt(request.commitReceipt, repository, root, deps.sameFilesystemPath);
  const localBefore = await inspectLocalRepository({ root, repository, receipt, deps });
  const remoteBefore = await readRemoteHead(root, localBefore.origin.url, localBefore.branch, deps);

  if (remoteBefore === localBefore.head) {
    const localAfter = await inspectLocalRepository({ root, repository, receipt, deps });
    if (localAfter.snapshotSha256 !== localBefore.snapshotSha256) pushFail("LOCAL_DRIFT", "Local repository changed during idempotent remote verification.");
    return makeReceipt({
      request: { ...request, expectedRepository: repository, workspaceRoot: root.realPath },
      receipt,
      local: localAfter,
      remoteBefore,
      remoteAfter: remoteBefore,
      outcome: "already-pushed",
      pushed: false,
      pushResult: null,
    });
  }
  if (remoteBefore === null) pushFail("REMOTE_BRANCH_MISSING", "The reviewed branch must already exist remotely; branch creation is outside this boundary.");
  if (remoteBefore !== receipt.commit.parent) {
    pushFail("REMOTE_DRIFT", "Remote branch no longer equals the reviewed commit parent.", {
      expectedParent: receipt.commit.parent,
      remoteHead: remoteBefore,
    });
  }

  const localPrePush = await inspectLocalRepository({ root, repository, receipt, deps });
  if (localPrePush.snapshotSha256 !== localBefore.snapshotSha256) pushFail("LOCAL_DRIFT", "Local repository changed during push preflight.");
  const remotePrePush = await readRemoteHead(root, localPrePush.origin.url, localPrePush.branch, deps);
  if (remotePrePush !== remoteBefore) pushFail("REMOTE_DRIFT", "Remote branch changed during push preflight.");

  const hooksDirectory = await createEmptyHooksDirectory();
  let pushResult;
  try {
    const refspec = `${localPrePush.head}:refs/heads/${localPrePush.branch}`;
    pushResult = await deps.runGit(root.path, [
      "-c", `core.hooksPath=${hooksDirectory}`,
      "-c", "core.fsmonitor=false",
      "-c", "push.followTags=false",
      "-c", "push.gpgSign=false",
      "push", "--porcelain", "--no-verify", localPrePush.origin.url, refspec,
    ], networkOptions({
      allowAnyExitCode: true,
      errorCode: "PUSH_COMMAND_FAILED",
    }));
  } finally {
    await removeHooksDirectory(hooksDirectory);
  }

  const remoteAfter = await readRemoteHead(root, localPrePush.origin.url, localPrePush.branch, deps);
  const localAfter = await inspectLocalRepository({ root, repository, receipt, deps });
  if (localAfter.snapshotSha256 !== localPrePush.snapshotSha256) {
    pushFail("LOCAL_DRIFT", "Local repository changed while publishing the reviewed commit.");
  }
  if (remoteAfter !== localPrePush.head) {
    pushFail("PUSH_VERIFY_FAILED", "Remote readback does not equal the exact reviewed commit.", {
      pushExitCode: pushResult.exitCode,
      remoteBefore,
      remoteAfter,
      expectedCommit: localPrePush.head,
      stderr: pushResult.stderr.toString("utf8").slice(-2048),
    });
  }

  return makeReceipt({
    request: { ...request, expectedRepository: repository, workspaceRoot: root.realPath },
    receipt,
    local: localAfter,
    remoteBefore,
    remoteAfter,
    outcome: pushResult.exitCode === 0 ? "pushed" : "remote-confirmed-after-client-error",
    pushed: true,
    pushResult,
  });
}
