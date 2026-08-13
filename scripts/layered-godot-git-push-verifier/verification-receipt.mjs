import {
  LAYERED_GODOT_GIT_PUSH_VERIFICATION_RECEIPT_KIND,
  LAYERED_GODOT_GIT_PUSH_VERIFIER_PROTOCOL_VERSION,
} from "./protocol.mjs";
import { canonicalSha256, deepFreeze } from "./canonical.mjs";

export function makeVerificationReceipt({
  repository,
  root,
  receipt,
  local,
  origin,
  remote,
  verifiedAt,
}) {
  const payload = {
    schemaVersion: "1.0",
    kind: LAYERED_GODOT_GIT_PUSH_VERIFICATION_RECEIPT_KIND,
    protocolVersion: LAYERED_GODOT_GIT_PUSH_VERIFIER_PROTOCOL_VERSION,
    pushReceiptSha256: receipt.receiptSha256,
    target: {
      expectedRepository: repository,
      workspaceRoot: root.realPath,
    },
    local: {
      commit: local.head,
      parent: local.parent,
      tree: local.tree,
      branch: local.branch,
      clean: true,
      snapshotSha256: local.snapshotSha256,
    },
    remote: {
      url: origin.url,
      repository: origin.repository,
      branch: local.branch,
      current: remote,
      stableAcrossVerification: true,
    },
    verification: {
      pushReceiptAdmitted: true,
      localRepositoryCurrent: true,
      remoteRefCurrent: true,
      outcome: receipt.outcome,
    },
    verifiedAt,
    authority: {
      targetRepositoryReadPerformed: true,
      targetRepositoryMutationPerformed: false,
      gitReadCommandsPerformed: true,
      gitNetworkReadPerformed: true,
      gitObjectWritePerformed: false,
      gitIndexMutationPerformed: false,
      gitCommitCreated: false,
      gitRefUpdated: false,
      gitPushAttempted: false,
      gitPushPerformed: false,
      gitTagPushPerformed: false,
      forcePushPerformed: false,
      deploymentPerformed: false,
      releasePublicationPerformed: false,
    },
  };
  return deepFreeze({ ...payload, verificationSha256: canonicalSha256(payload) });
}
