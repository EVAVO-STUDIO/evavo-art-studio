import { types as utilTypes } from "node:util";

import {
  LAYERED_GODOT_GIT_PUSH_VERIFICATION_RECEIPT_KIND,
  LAYERED_GODOT_GIT_PUSH_VERIFIER_PROTOCOL_VERSION,
  verifierFail,
} from "./protocol.mjs";
import { canonicalSha256 } from "./canonical.mjs";
import { snapshotJsonValue } from "./snapshot.mjs";
import { validateCommitReceipt } from "./commit-receipt-contract.mjs";
import { validatePushReceipt } from "./receipt-contract.mjs";
import {
  branchName,
  canonicalUtc,
  exactObject,
  gitOid,
  parseOriginRepository,
  repositoryName,
  sha256,
} from "./validation.mjs";

const RECEIPT_KEYS = [
  "schemaVersion",
  "kind",
  "protocolVersion",
  "commitReceiptSha256",
  "pushReceiptSha256",
  "lineage",
  "target",
  "local",
  "remote",
  "verification",
  "verifiedAt",
  "authority",
  "verificationSha256",
];

const LINEAGE_KEYS = [
  "requestSha256",
  "integrationSha256",
  "writeReceiptSha256",
  "handoffGateSha256",
  "repositoryReviewSha256",
  "commit",
  "crossReceiptBindingsVerified",
];

const LOCAL_KEYS = [
  "commit",
  "parent",
  "tree",
  "branch",
  "clean",
  "snapshotSha256",
];

const REMOTE_KEYS = [
  "url",
  "repository",
  "branch",
  "current",
  "stableAcrossVerification",
];

const VERIFICATION_KEYS = [
  "commitReceiptAdmitted",
  "pushReceiptAdmitted",
  "lineageBindingsCurrent",
  "localRepositoryCurrent",
  "remoteRefCurrent",
  "verificationReceiptContractAdmitted",
  "outcome",
];

const AUTHORITY_KEYS = [
  "targetRepositoryReadPerformed",
  "targetRepositoryMutationPerformed",
  "gitReadCommandsPerformed",
  "gitNetworkReadPerformed",
  "gitObjectWritePerformed",
  "gitIndexMutationPerformed",
  "gitCommitCreated",
  "gitRefUpdated",
  "gitPushAttempted",
  "gitPushPerformed",
  "gitTagPushPerformed",
  "forcePushPerformed",
  "deploymentPerformed",
  "releasePublicationPerformed",
];

function samePath(comparator, left, right) {
  let result;
  try {
    result = comparator(left, right);
  } catch {
    verifierFail(
      "VERIFICATION_RECEIPT_INVALID",
      "sameFilesystemPath failed while admitting the verification receipt.",
    );
  }
  if (typeof result !== "boolean") {
    verifierFail(
      "VERIFICATION_RECEIPT_INVALID",
      "sameFilesystemPath must return boolean while admitting the verification receipt.",
    );
  }
  return result;
}

function exactTrueMap(value, keys, trueKeys, label) {
  const map = exactObject(
    value,
    keys,
    label,
    "VERIFICATION_RECEIPT_INVALID",
  );
  for (const key of trueKeys) {
    if (map[key] !== true) {
      verifierFail(
        "VERIFICATION_RECEIPT_INVALID",
        `${label}.${key} must remain true.`,
      );
    }
  }
  return map;
}

export function validateVerificationReceipt(
  value,
  expectedRepository,
  workspaceRoot,
  sameFilesystemPath,
  sourceCommitReceipt,
  sourcePushReceipt,
) {
  const input = snapshotJsonValue(
    {
      verificationReceipt: value,
      expectedRepository,
      workspaceRoot,
      sourceCommitReceipt,
      sourcePushReceipt,
    },
    "verificationReceiptAdmissionInput",
  );
  const receipt = exactObject(
    input.verificationReceipt,
    RECEIPT_KEYS,
    "verificationReceipt",
    "VERIFICATION_RECEIPT_INVALID",
  );
  if (
    receipt.schemaVersion !== "1.0" ||
    receipt.kind !== LAYERED_GODOT_GIT_PUSH_VERIFICATION_RECEIPT_KIND ||
    receipt.protocolVersion !== LAYERED_GODOT_GIT_PUSH_VERIFIER_PROTOCOL_VERSION
  ) {
    verifierFail(
      "VERIFICATION_RECEIPT_INVALID",
      "Verification receipt schema, kind or protocol is not current.",
    );
  }

  sha256(
    receipt.verificationSha256,
    "verificationReceipt.verificationSha256",
    "VERIFICATION_RECEIPT_INVALID",
  );
  const { verificationSha256: _discard, ...payload } = receipt;
  if (canonicalSha256(payload) !== receipt.verificationSha256) {
    verifierFail(
      "VERIFICATION_RECEIPT_INVALID",
      "Verification receipt self-hash is invalid.",
    );
  }

  const repository = repositoryName(
    input.expectedRepository,
    "expectedRepository",
    "VERIFICATION_RECEIPT_INVALID",
  );
  if (
    typeof input.workspaceRoot !== "string" ||
    input.workspaceRoot.length < 1 ||
    input.workspaceRoot.length > 32_768 ||
    typeof sameFilesystemPath !== "function" ||
    utilTypes.isProxy(sameFilesystemPath)
  ) {
    verifierFail(
      "VERIFICATION_RECEIPT_INVALID",
      "Verification receipt admission requires a bounded workspace root and non-Proxy path comparator.",
    );
  }

  const root = Object.freeze({ realPath: input.workspaceRoot });
  const commitReceipt = validateCommitReceipt(
    input.sourceCommitReceipt,
    repository,
    root,
    (left, right) => samePath(sameFilesystemPath, left, right),
  );
  const pushReceipt = validatePushReceipt(
    input.sourcePushReceipt,
    repository,
    root,
    (left, right) => samePath(sameFilesystemPath, left, right),
    commitReceipt,
  );

  for (const key of ["commitReceiptSha256", "pushReceiptSha256"]) {
    sha256(
      receipt[key],
      `verificationReceipt.${key}`,
      "VERIFICATION_RECEIPT_INVALID",
    );
  }
  if (
    receipt.commitReceiptSha256 !== commitReceipt.receiptSha256 ||
    receipt.pushReceiptSha256 !== pushReceipt.receiptSha256
  ) {
    verifierFail(
      "VERIFICATION_RECEIPT_INVALID",
      "Verification receipt source-receipt hashes do not match the admitted evidence.",
    );
  }

  const lineage = exactObject(
    receipt.lineage,
    LINEAGE_KEYS,
    "verificationReceipt.lineage",
    "VERIFICATION_RECEIPT_INVALID",
  );
  for (const key of [
    "requestSha256",
    "integrationSha256",
    "writeReceiptSha256",
    "handoffGateSha256",
    "repositoryReviewSha256",
  ]) {
    sha256(
      lineage[key],
      `verificationReceipt.lineage.${key}`,
      "VERIFICATION_RECEIPT_INVALID",
    );
    if (lineage[key] !== commitReceipt[key]) {
      verifierFail(
        "VERIFICATION_RECEIPT_INVALID",
        `Verification receipt lineage ${key} does not match the admitted commit receipt.`,
      );
    }
  }
  gitOid(
    lineage.commit,
    "verificationReceipt.lineage.commit",
    "VERIFICATION_RECEIPT_INVALID",
  );
  if (
    lineage.commit !== commitReceipt.commit.commit ||
    lineage.crossReceiptBindingsVerified !== true
  ) {
    verifierFail(
      "VERIFICATION_RECEIPT_INVALID",
      "Verification receipt lineage is not bound to the admitted commit.",
    );
  }

  const target = exactObject(
    receipt.target,
    ["expectedRepository", "workspaceRoot"],
    "verificationReceipt.target",
    "VERIFICATION_RECEIPT_INVALID",
  );
  if (
    repositoryName(
      target.expectedRepository,
      "verificationReceipt.target.expectedRepository",
      "VERIFICATION_RECEIPT_INVALID",
    ).toLowerCase() !== repository.toLowerCase() ||
    typeof target.workspaceRoot !== "string" ||
    !samePath(sameFilesystemPath, target.workspaceRoot, input.workspaceRoot) ||
    !samePath(
      sameFilesystemPath,
      target.workspaceRoot,
      commitReceipt.target.workspaceRoot,
    ) ||
    !samePath(
      sameFilesystemPath,
      target.workspaceRoot,
      pushReceipt.target.workspaceRoot,
    )
  ) {
    verifierFail(
      "VERIFICATION_RECEIPT_INVALID",
      "Verification receipt target does not match the selected and admitted repository workspace.",
    );
  }

  const local = exactObject(
    receipt.local,
    LOCAL_KEYS,
    "verificationReceipt.local",
    "VERIFICATION_RECEIPT_INVALID",
  );
  gitOid(local.commit, "verificationReceipt.local.commit", "VERIFICATION_RECEIPT_INVALID");
  gitOid(local.parent, "verificationReceipt.local.parent", "VERIFICATION_RECEIPT_INVALID");
  gitOid(local.tree, "verificationReceipt.local.tree", "VERIFICATION_RECEIPT_INVALID");
  branchName(local.branch, "verificationReceipt.local.branch", "VERIFICATION_RECEIPT_INVALID");
  sha256(
    local.snapshotSha256,
    "verificationReceipt.local.snapshotSha256",
    "VERIFICATION_RECEIPT_INVALID",
  );
  const expectedLocalSnapshotSha256 = canonicalSha256({
    head: local.commit,
    parent: local.parent,
    tree: local.tree,
    branch: local.branch,
    clean: true,
  });
  if (
    local.commit !== commitReceipt.commit.commit ||
    local.parent !== commitReceipt.commit.parent ||
    local.tree !== commitReceipt.commit.tree ||
    local.branch !== commitReceipt.commit.branch ||
    local.commit !== pushReceipt.local.commit ||
    local.parent !== pushReceipt.local.parent ||
    local.tree !== pushReceipt.local.tree ||
    local.branch !== pushReceipt.local.branch ||
    local.snapshotSha256 !== expectedLocalSnapshotSha256 ||
    local.clean !== true
  ) {
    verifierFail(
      "VERIFICATION_RECEIPT_INVALID",
      "Verification receipt local Git identity does not match the admitted delivery chain.",
    );
  }

  const remote = exactObject(
    receipt.remote,
    REMOTE_KEYS,
    "verificationReceipt.remote",
    "VERIFICATION_RECEIPT_INVALID",
  );
  const urlRepository = parseOriginRepository(
    remote.url,
    "verificationReceipt.remote.url",
    "VERIFICATION_RECEIPT_INVALID",
  );
  gitOid(remote.current, "verificationReceipt.remote.current", "VERIFICATION_RECEIPT_INVALID");
  branchName(remote.branch, "verificationReceipt.remote.branch", "VERIFICATION_RECEIPT_INVALID");
  if (
    repositoryName(
      remote.repository,
      "verificationReceipt.remote.repository",
      "VERIFICATION_RECEIPT_INVALID",
    ).toLowerCase() !== repository.toLowerCase() ||
    urlRepository.toLowerCase() !== repository.toLowerCase() ||
    remote.url !== pushReceipt.remote.url ||
    remote.repository.toLowerCase() !== pushReceipt.remote.repository.toLowerCase() ||
    remote.branch !== pushReceipt.remote.branch ||
    remote.current !== pushReceipt.remote.after ||
    remote.current !== local.commit ||
    remote.stableAcrossVerification !== true
  ) {
    verifierFail(
      "VERIFICATION_RECEIPT_INVALID",
      "Verification receipt remote identity is not stably bound to the admitted push.",
    );
  }

  const verification = exactTrueMap(
    receipt.verification,
    VERIFICATION_KEYS,
    VERIFICATION_KEYS.filter((key) => key !== "outcome"),
    "verificationReceipt.verification",
  );
  const allowedOutcomes = new Set([
    "pushed",
    "already-pushed",
    "remote-confirmed-after-client-error",
  ]);
  if (
    !allowedOutcomes.has(receipt.verification.outcome) ||
    receipt.verification.outcome !== pushReceipt.outcome
  ) {
    verifierFail(
      "VERIFICATION_RECEIPT_INVALID",
      "Verification receipt outcome does not match the admitted push receipt.",
    );
  }
  if (verification.verificationReceiptContractAdmitted !== true) {
    verifierFail(
      "VERIFICATION_RECEIPT_INVALID",
      "Verification receipt does not record closed-contract admission.",
    );
  }

  canonicalUtc(
    receipt.verifiedAt,
    "verificationReceipt.verifiedAt",
    "VERIFICATION_RECEIPT_INVALID",
  );

  const authority = exactObject(
    receipt.authority,
    AUTHORITY_KEYS,
    "verificationReceipt.authority",
    "VERIFICATION_RECEIPT_INVALID",
  );
  for (const key of [
    "targetRepositoryReadPerformed",
    "gitReadCommandsPerformed",
    "gitNetworkReadPerformed",
  ]) {
    if (authority[key] !== true) {
      verifierFail(
        "VERIFICATION_RECEIPT_INVALID",
        `Verification receipt authority ${key} must remain true.`,
      );
    }
  }
  for (const key of AUTHORITY_KEYS.filter(
    (key) => ![
      "targetRepositoryReadPerformed",
      "gitReadCommandsPerformed",
      "gitNetworkReadPerformed",
    ].includes(key),
  )) {
    if (authority[key] !== false) {
      verifierFail(
        "VERIFICATION_RECEIPT_INVALID",
        `Verification receipt authority ${key} must remain false.`,
      );
    }
  }

  return receipt;
}
