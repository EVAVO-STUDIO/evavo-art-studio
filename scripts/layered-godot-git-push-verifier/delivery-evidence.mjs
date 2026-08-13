import { canonicalSha256 } from "./canonical.mjs";
import { snapshotJsonValue } from "./snapshot.mjs";
import {
  LAYERED_GODOT_GIT_DELIVERY_EVIDENCE_KIND,
  LAYERED_GODOT_GIT_DELIVERY_EVIDENCE_PROTOCOL_VERSION,
  verifierFail,
} from "./protocol.mjs";
import {
  admitDeliverySourceEvidence,
  validateDeliveryEvidenceBundle,
} from "./delivery-evidence-contract.mjs";

const CREATE_INPUT_KEYS = [
  "commitReceipt",
  "pushReceipt",
  "verificationReceipt",
  "expectedRepository",
  "workspaceRoot",
];

function exactCreateInput(value) {
  let input;
  try {
    input = snapshotJsonValue(value, "deliveryEvidenceCreateInput");
  } catch (error) {
    verifierFail(
      "DELIVERY_EVIDENCE_INPUT_INVALID",
      "Delivery evidence creation input failed bounded immutable JSON admission.",
      { upstreamCode: error instanceof Error && "code" in error ? error.code : undefined },
    );
  }
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    verifierFail("DELIVERY_EVIDENCE_INPUT_INVALID", "Delivery evidence creation input must be an exact object.");
  }
  const actual = Object.keys(input).sort();
  const expected = [...CREATE_INPUT_KEYS].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    verifierFail(
      "DELIVERY_EVIDENCE_INPUT_INVALID",
      "Delivery evidence creation input fields are not the exact current contract.",
      { expected, actual },
    );
  }
  return input;
}

export function createDeliveryEvidenceBundle(value) {
  const input = exactCreateInput(value);
  const admitted = admitDeliverySourceEvidence(
    {
      commit: input.commitReceipt,
      push: input.pushReceipt,
      verification: input.verificationReceipt,
    },
    input.expectedRepository,
    input.workspaceRoot,
  );
  const { commitReceipt, pushReceipt, verificationReceipt } = admitted;
  const payload = {
    schemaVersion: "1.0",
    kind: LAYERED_GODOT_GIT_DELIVERY_EVIDENCE_KIND,
    protocolVersion: LAYERED_GODOT_GIT_DELIVERY_EVIDENCE_PROTOCOL_VERSION,
    target: {
      expectedRepository: admitted.repository,
      workspaceRoot: admitted.workspaceRoot,
    },
    sourceReceipts: {
      commit: commitReceipt,
      push: pushReceipt,
      verification: verificationReceipt,
    },
    sourceHashes: {
      commitReceiptSha256: commitReceipt.receiptSha256,
      pushReceiptSha256: pushReceipt.receiptSha256,
      verificationReceiptSha256: verificationReceipt.verificationSha256,
    },
    lineage: {
      requestSha256: commitReceipt.requestSha256,
      integrationSha256: commitReceipt.integrationSha256,
      writeReceiptSha256: commitReceipt.writeReceiptSha256,
      handoffGateSha256: commitReceipt.handoffGateSha256,
      repositoryReviewSha256: commitReceipt.repositoryReviewSha256,
      commit: commitReceipt.commit.commit,
      parent: commitReceipt.commit.parent,
      tree: commitReceipt.commit.tree,
      branch: commitReceipt.commit.branch,
      remoteCurrent: verificationReceipt.remote.current,
      pushOutcome: verificationReceipt.verification.outcome,
    },
    verification: {
      commitReceiptAdmitted: true,
      pushReceiptAdmitted: true,
      verificationReceiptAdmitted: true,
      sourceReceiptHashesBound: true,
      sourceLineageBound: true,
      deliveryEvidenceContractAdmitted: true,
    },
    bundledAt: new Date().toISOString(),
    authority: {
      sourceEvidenceReadPerformed: true,
      deliveryEvidencePackagingPerformed: true,
      targetRepositoryReadPerformed: false,
      targetRepositoryMutationPerformed: false,
      gitReadCommandsPerformed: false,
      gitNetworkReadPerformed: false,
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
      artifactPublicationPerformed: false,
    },
  };
  const candidate = { ...payload, bundleSha256: canonicalSha256(payload) };
  return validateDeliveryEvidenceBundle(
    candidate,
    admitted.repository,
    admitted.workspaceRoot,
  );
}
