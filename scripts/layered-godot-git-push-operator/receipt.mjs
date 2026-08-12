import { createHash } from "node:crypto";

import {
  LAYERED_GODOT_GIT_PUSH_OPERATOR_PROTOCOL_VERSION,
  LAYERED_GODOT_GIT_PUSH_RECEIPT_KIND,
  canonicalSha256,
} from "./contract.mjs";

function sha256Bytes(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

export function makeReceipt({ request, receipt, local, remoteBefore, remoteAfter, outcome, pushed, pushResult }) {
  const payload = {
    schemaVersion: "1.0",
    kind: LAYERED_GODOT_GIT_PUSH_RECEIPT_KIND,
    protocolVersion: LAYERED_GODOT_GIT_PUSH_OPERATOR_PROTOCOL_VERSION,
    commitReceiptSha256: receipt.receiptSha256,
    requestSha256: receipt.requestSha256,
    integrationSha256: receipt.integrationSha256,
    repositoryReviewSha256: receipt.repositoryReviewSha256,
    target: {
      expectedRepository: request.expectedRepository,
      workspaceRoot: request.workspaceRoot,
    },
    local: {
      commit: local.head,
      parent: receipt.commit.parent,
      tree: local.tree,
      branch: local.branch,
      snapshotSha256: local.snapshotSha256,
    },
    remote: {
      url: local.origin.url,
      repository: local.origin.repository,
      branch: local.branch,
      before: remoteBefore,
      after: remoteAfter,
    },
    outcome,
    pushCommand: {
      attempted: pushed,
      exitCode: pushResult?.exitCode ?? null,
      stdoutSha256: pushResult ? sha256Bytes(pushResult.stdout) : null,
      stderrSha256: pushResult ? sha256Bytes(pushResult.stderr) : null,
      stdoutBytes: pushResult?.stdout.byteLength ?? 0,
      stderrBytes: pushResult?.stderr.byteLength ?? 0,
    },
    pushedAt: new Date().toISOString(),
    authority: {
      targetRepositoryReadPerformed: true,
      targetRepositoryWorkingTreeMutationPerformed: false,
      gitReadCommandsPerformed: true,
      gitNetworkReadPerformed: true,
      gitHookExecutionPerformed: false,
      gitCommitCreated: false,
      gitPushAttempted: pushed,
      gitPushPerformed: pushed && pushResult?.exitCode === 0,
      gitRemoteRefUpdatedToCommit: remoteAfter === local.head,
      gitTagPushPerformed: false,
      forcePushPerformed: false,
      deploymentPerformed: false,
      releasePublicationPerformed: false,
    },
  };
  return Object.freeze({ ...payload, receiptSha256: canonicalSha256(payload) });
}
