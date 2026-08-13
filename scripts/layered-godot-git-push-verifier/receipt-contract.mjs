import {
  EXPECTED_GIT_PUSH_OPERATOR_PROTOCOL_VERSION,
  EXPECTED_GIT_PUSH_RECEIPT_KIND,
  verifierFail,
} from "./protocol.mjs";
import { canonicalSha256 } from "./canonical.mjs";
import {
  branchName,
  exactObject,
  gitOid,
  parseOriginRepository,
  repositoryName,
  sha256,
} from "./validation.mjs";
import { validatePushOutcome } from "./receipt-outcome.mjs";

const KEYS = [
  "schemaVersion", "kind", "protocolVersion", "commitReceiptSha256",
  "requestSha256", "integrationSha256", "repositoryReviewSha256", "target",
  "local", "remote", "outcome", "pushCommand", "pushedAt", "authority",
  "receiptSha256",
];

function validateLineage(receipt, commitReceipt, sameFilesystemPath) {
  if (commitReceipt === null || typeof commitReceipt !== "object") {
    verifierFail(
      "COMMIT_RECEIPT_INVALID",
      "An admitted source commit receipt is required before push receipt verification.",
    );
  }
  if (
    receipt.commitReceiptSha256 !== commitReceipt.receiptSha256 ||
    receipt.requestSha256 !== commitReceipt.requestSha256 ||
    receipt.integrationSha256 !== commitReceipt.integrationSha256 ||
    receipt.repositoryReviewSha256 !== commitReceipt.repositoryReviewSha256
  ) {
    verifierFail(
      "PUSH_RECEIPT_INVALID",
      "Push receipt inherited hashes do not match the admitted commit receipt.",
    );
  }

  if (
    receipt.target.expectedRepository.toLowerCase() !==
      commitReceipt.target.expectedRepository.toLowerCase() ||
    !sameFilesystemPath(
      receipt.target.workspaceRoot,
      commitReceipt.target.workspaceRoot,
    )
  ) {
    verifierFail(
      "PUSH_RECEIPT_INVALID",
      "Push and commit receipt targets do not identify the same repository workspace.",
    );
  }

  if (
    receipt.local.commit !== commitReceipt.commit.commit ||
    receipt.local.parent !== commitReceipt.commit.parent ||
    receipt.local.tree !== commitReceipt.commit.tree ||
    receipt.local.branch !== commitReceipt.commit.branch
  ) {
    verifierFail(
      "PUSH_RECEIPT_INVALID",
      "Push receipt Git identity does not match the admitted commit receipt.",
    );
  }
}

export function validatePushReceipt(
  value,
  repository,
  root,
  sameFilesystemPath,
  commitReceipt,
) {
  const receipt = exactObject(value, KEYS, "pushReceipt", "PUSH_RECEIPT_INVALID");
  if (
    receipt.schemaVersion !== "1.0" ||
    receipt.kind !== EXPECTED_GIT_PUSH_RECEIPT_KIND ||
    receipt.protocolVersion !== EXPECTED_GIT_PUSH_OPERATOR_PROTOCOL_VERSION
  ) verifierFail("PUSH_RECEIPT_INVALID", "Push receipt schema, kind or protocol is not current.");

  sha256(receipt.receiptSha256, "pushReceipt.receiptSha256");
  const { receiptSha256: _discard, ...payload } = receipt;
  if (canonicalSha256(payload) !== receipt.receiptSha256) {
    verifierFail("PUSH_RECEIPT_INVALID", "Push receipt self-hash is invalid.");
  }
  for (const key of [
    "commitReceiptSha256", "requestSha256", "integrationSha256", "repositoryReviewSha256",
  ]) sha256(receipt[key], `pushReceipt.${key}`);

  const target = exactObject(
    receipt.target,
    ["expectedRepository", "workspaceRoot"],
    "pushReceipt.target",
    "PUSH_RECEIPT_INVALID",
  );
  if (
    repositoryName(
      target.expectedRepository,
      "pushReceipt.target.expectedRepository",
      "PUSH_RECEIPT_INVALID",
    ).toLowerCase() !== repository.toLowerCase() ||
    typeof target.workspaceRoot !== "string" ||
    !sameFilesystemPath(target.workspaceRoot, root.realPath)
  ) verifierFail("PUSH_RECEIPT_INVALID", "Push receipt target does not match the selected repository workspace.");

  const local = exactObject(
    receipt.local,
    ["commit", "parent", "tree", "branch", "snapshotSha256"],
    "pushReceipt.local",
    "PUSH_RECEIPT_INVALID",
  );
  gitOid(local.commit, "pushReceipt.local.commit");
  gitOid(local.parent, "pushReceipt.local.parent");
  gitOid(local.tree, "pushReceipt.local.tree");
  branchName(local.branch, "pushReceipt.local.branch");
  sha256(local.snapshotSha256, "pushReceipt.local.snapshotSha256");
  if (local.commit === local.parent) verifierFail("PUSH_RECEIPT_INVALID", "Push receipt commit must differ from its parent.");

  const remote = exactObject(
    receipt.remote,
    ["url", "repository", "branch", "before", "after"],
    "pushReceipt.remote",
    "PUSH_RECEIPT_INVALID",
  );
  const urlRepository = parseOriginRepository(remote.url, "pushReceipt.remote.url");
  if (
    repositoryName(
      remote.repository,
      "pushReceipt.remote.repository",
      "PUSH_RECEIPT_INVALID",
    ).toLowerCase() !== repository.toLowerCase() ||
    urlRepository.toLowerCase() !== repository.toLowerCase() ||
    branchName(remote.branch, "pushReceipt.remote.branch") !== local.branch
  ) verifierFail("PUSH_RECEIPT_INVALID", "Push receipt remote identity does not match the selected repository and local branch.");
  gitOid(remote.before, "pushReceipt.remote.before");
  gitOid(remote.after, "pushReceipt.remote.after");
  if (remote.after !== local.commit) verifierFail("PUSH_RECEIPT_INVALID", "Push receipt remote result does not equal the exact local commit.");

  validateLineage(receipt, commitReceipt, sameFilesystemPath);
  validatePushOutcome(receipt, local, remote);
  return receipt;
}
