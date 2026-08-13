import { canonicalSha256 } from "./canonical.mjs";
import { validateCommitReceipt } from "./commit-receipt-contract.mjs";
import { validatePushReceipt } from "./receipt-contract.mjs";
import {
  LAYERED_GODOT_GIT_DELIVERY_EVIDENCE_KIND,
  LAYERED_GODOT_GIT_DELIVERY_EVIDENCE_PROTOCOL_VERSION,
  LayeredGodotGitPushVerifierError,
  verifierFail,
} from "./protocol.mjs";
import { snapshotJsonValue } from "./snapshot.mjs";
import { validateVerificationReceipt } from "./verification-receipt-contract.mjs";

const BUNDLE_KEYS = [
  "schemaVersion",
  "kind",
  "protocolVersion",
  "target",
  "sourceReceipts",
  "sourceHashes",
  "lineage",
  "verification",
  "bundledAt",
  "authority",
  "bundleSha256",
];

const TARGET_KEYS = ["expectedRepository", "workspaceRoot"];
const SOURCE_RECEIPT_KEYS = ["commit", "push", "verification"];
const SOURCE_HASH_KEYS = [
  "commitReceiptSha256",
  "pushReceiptSha256",
  "verificationReceiptSha256",
];
const LINEAGE_KEYS = [
  "requestSha256",
  "integrationSha256",
  "writeReceiptSha256",
  "handoffGateSha256",
  "repositoryReviewSha256",
  "commit",
  "parent",
  "tree",
  "branch",
  "remoteCurrent",
  "pushOutcome",
];
const VERIFICATION_KEYS = [
  "commitReceiptAdmitted",
  "pushReceiptAdmitted",
  "verificationReceiptAdmitted",
  "sourceReceiptHashesBound",
  "sourceLineageBound",
  "deliveryEvidenceContractAdmitted",
];
const AUTHORITY_KEYS = [
  "sourceEvidenceReadPerformed",
  "deliveryEvidencePackagingPerformed",
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
  "artifactPublicationPerformed",
];
const TRUE_AUTHORITY_KEYS = [
  "sourceEvidenceReadPerformed",
  "deliveryEvidencePackagingPerformed",
];

function exactObject(value, keys, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    verifierFail("DELIVERY_EVIDENCE_INVALID", `${label} must be an exact object.`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    verifierFail(
      "DELIVERY_EVIDENCE_INVALID",
      `${label} fields are not the exact current contract.`,
      { expected, actual },
    );
  }
  return value;
}

function boundedString(value, label, maximum = 32_768) {
  if (typeof value !== "string" || value.length < 1 || value.length > maximum) {
    verifierFail(
      "DELIVERY_EVIDENCE_INVALID",
      `${label} must be a non-empty bounded string.`,
    );
  }
  return value;
}

function repositoryName(value, label) {
  const repository = boundedString(value, label, 255);
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repository)) {
    verifierFail(
      "DELIVERY_EVIDENCE_INVALID",
      `${label} must be an OWNER/REPOSITORY identity.`,
    );
  }
  return repository;
}

function sha256(value, label) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) {
    verifierFail("DELIVERY_EVIDENCE_INVALID", `${label} must be a SHA-256 digest.`);
  }
  return value;
}

function gitOid(value, label) {
  if (typeof value !== "string" || !/^[a-f0-9]{40}$/u.test(value)) {
    verifierFail("DELIVERY_EVIDENCE_INVALID", `${label} must be a Git object ID.`);
  }
  return value;
}

function canonicalUtc(value, label) {
  if (typeof value !== "string") {
    verifierFail("DELIVERY_EVIDENCE_INVALID", `${label} must be a canonical UTC timestamp.`);
  }
  let canonical;
  try {
    canonical = new Date(value).toISOString();
  } catch {
    canonical = null;
  }
  if (canonical !== value) {
    verifierFail("DELIVERY_EVIDENCE_INVALID", `${label} must be a canonical UTC timestamp.`);
  }
  return value;
}

function snapshot(value, label) {
  try {
    return snapshotJsonValue(value, label);
  } catch (error) {
    if (error instanceof LayeredGodotGitPushVerifierError) {
      verifierFail(
        "DELIVERY_EVIDENCE_INPUT_INVALID",
        `${label} failed bounded immutable JSON admission.`,
        { upstreamCode: error.code },
      );
    }
    throw error;
  }
}

function sameFilesystemPath(left, right) {
  return typeof left === "string" && typeof right === "string" && left === right;
}

export function admitDeliverySourceEvidence(
  sourceReceipts,
  expectedRepository,
  workspaceRoot,
) {
  const input = snapshot(
    { sourceReceipts, expectedRepository, workspaceRoot },
    "deliveryEvidenceSourceAdmissionInput",
  );
  const repository = repositoryName(input.expectedRepository, "expectedRepository");
  const workspace = boundedString(input.workspaceRoot, "workspaceRoot");
  const sources = exactObject(
    input.sourceReceipts,
    SOURCE_RECEIPT_KEYS,
    "sourceReceipts",
  );
  const root = Object.freeze({ realPath: workspace });

  try {
    const commitReceipt = validateCommitReceipt(
      sources.commit,
      repository,
      root,
      sameFilesystemPath,
    );
    const pushReceipt = validatePushReceipt(
      sources.push,
      repository,
      root,
      sameFilesystemPath,
      commitReceipt,
    );
    const verificationReceipt = validateVerificationReceipt(
      sources.verification,
      repository,
      workspace,
      sameFilesystemPath,
      commitReceipt,
      pushReceipt,
    );
    return Object.freeze({
      repository,
      workspaceRoot: workspace,
      commitReceipt,
      pushReceipt,
      verificationReceipt,
    });
  } catch (error) {
    if (error instanceof LayeredGodotGitPushVerifierError) {
      verifierFail(
        "DELIVERY_EVIDENCE_SOURCE_INVALID",
        "Delivery evidence source receipts failed their current closed contracts.",
        { upstreamCode: error.code },
      );
    }
    throw error;
  }
}

function assertSourceHashes(sourceHashes, admitted) {
  const hashes = exactObject(sourceHashes, SOURCE_HASH_KEYS, "deliveryEvidence.sourceHashes");
  for (const [key, expected] of [
    ["commitReceiptSha256", admitted.commitReceipt.receiptSha256],
    ["pushReceiptSha256", admitted.pushReceipt.receiptSha256],
    ["verificationReceiptSha256", admitted.verificationReceipt.verificationSha256],
  ]) {
    sha256(hashes[key], `deliveryEvidence.sourceHashes.${key}`);
    if (hashes[key] !== expected) {
      verifierFail(
        "DELIVERY_EVIDENCE_INVALID",
        `deliveryEvidence.sourceHashes.${key} does not match the admitted source receipt.`,
      );
    }
  }
  return hashes;
}

function assertLineage(lineageValue, admitted) {
  const lineage = exactObject(lineageValue, LINEAGE_KEYS, "deliveryEvidence.lineage");
  const commit = admitted.commitReceipt;
  const verification = admitted.verificationReceipt;
  const expectedHashes = {
    requestSha256: commit.requestSha256,
    integrationSha256: commit.integrationSha256,
    writeReceiptSha256: commit.writeReceiptSha256,
    handoffGateSha256: commit.handoffGateSha256,
    repositoryReviewSha256: commit.repositoryReviewSha256,
  };
  for (const [key, expected] of Object.entries(expectedHashes)) {
    sha256(lineage[key], `deliveryEvidence.lineage.${key}`);
    if (lineage[key] !== expected) {
      verifierFail(
        "DELIVERY_EVIDENCE_INVALID",
        `deliveryEvidence.lineage.${key} does not match the admitted commit receipt.`,
      );
    }
  }
  for (const [key, expected] of [
    ["commit", commit.commit.commit],
    ["parent", commit.commit.parent],
    ["tree", commit.commit.tree],
    ["remoteCurrent", verification.remote.current],
  ]) {
    gitOid(lineage[key], `deliveryEvidence.lineage.${key}`);
    if (lineage[key] !== expected) {
      verifierFail(
        "DELIVERY_EVIDENCE_INVALID",
        `deliveryEvidence.lineage.${key} does not match the admitted delivery chain.`,
      );
    }
  }
  if (
    boundedString(lineage.branch, "deliveryEvidence.lineage.branch", 255) !==
      commit.commit.branch ||
    lineage.branch !== verification.local.branch ||
    boundedString(lineage.pushOutcome, "deliveryEvidence.lineage.pushOutcome", 64) !==
      verification.verification.outcome
  ) {
    verifierFail(
      "DELIVERY_EVIDENCE_INVALID",
      "Delivery evidence branch or push outcome does not match the admitted delivery chain.",
    );
  }
  return lineage;
}

function assertVerification(value) {
  const verification = exactObject(
    value,
    VERIFICATION_KEYS,
    "deliveryEvidence.verification",
  );
  for (const key of VERIFICATION_KEYS) {
    if (verification[key] !== true) {
      verifierFail(
        "DELIVERY_EVIDENCE_INVALID",
        `deliveryEvidence.verification.${key} must remain true.`,
      );
    }
  }
  return verification;
}

function assertAuthority(value) {
  const authority = exactObject(value, AUTHORITY_KEYS, "deliveryEvidence.authority");
  for (const key of AUTHORITY_KEYS) {
    const expected = TRUE_AUTHORITY_KEYS.includes(key);
    if (authority[key] !== expected) {
      verifierFail(
        "DELIVERY_EVIDENCE_INVALID",
        `deliveryEvidence.authority.${key} must remain ${String(expected)}.`,
      );
    }
  }
  return authority;
}

export function validateDeliveryEvidenceBundle(
  value,
  expectedRepository,
  workspaceRoot,
) {
  const input = snapshot(
    { bundle: value, expectedRepository, workspaceRoot },
    "deliveryEvidenceBundleAdmissionInput",
  );
  const repository = repositoryName(input.expectedRepository, "expectedRepository");
  const workspace = boundedString(input.workspaceRoot, "workspaceRoot");
  const bundle = exactObject(input.bundle, BUNDLE_KEYS, "deliveryEvidence");

  if (
    bundle.schemaVersion !== "1.0" ||
    bundle.kind !== LAYERED_GODOT_GIT_DELIVERY_EVIDENCE_KIND ||
    bundle.protocolVersion !== LAYERED_GODOT_GIT_DELIVERY_EVIDENCE_PROTOCOL_VERSION
  ) {
    verifierFail(
      "DELIVERY_EVIDENCE_INVALID",
      "Delivery evidence schema, kind or protocol is not current.",
    );
  }

  sha256(bundle.bundleSha256, "deliveryEvidence.bundleSha256");
  const { bundleSha256: _discard, ...payload } = bundle;
  if (canonicalSha256(payload) !== bundle.bundleSha256) {
    verifierFail("DELIVERY_EVIDENCE_INVALID", "Delivery evidence self-hash is invalid.");
  }

  const target = exactObject(bundle.target, TARGET_KEYS, "deliveryEvidence.target");
  if (
    repositoryName(target.expectedRepository, "deliveryEvidence.target.expectedRepository") !==
      repository ||
    boundedString(target.workspaceRoot, "deliveryEvidence.target.workspaceRoot") !== workspace
  ) {
    verifierFail(
      "DELIVERY_EVIDENCE_INVALID",
      "Delivery evidence target does not match the explicitly selected repository workspace.",
    );
  }

  const admitted = admitDeliverySourceEvidence(
    bundle.sourceReceipts,
    repository,
    workspace,
  );
  assertSourceHashes(bundle.sourceHashes, admitted);
  assertLineage(bundle.lineage, admitted);
  assertVerification(bundle.verification);
  canonicalUtc(bundle.bundledAt, "deliveryEvidence.bundledAt");
  assertAuthority(bundle.authority);
  return bundle;
}
