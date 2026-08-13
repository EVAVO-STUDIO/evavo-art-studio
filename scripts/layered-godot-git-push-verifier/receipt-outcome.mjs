import { MAXIMUM_GIT_OUTPUT_BYTES, verifierFail } from "./protocol.mjs";
import { canonicalUtc, exactObject, sha256 } from "./validation.mjs";

const AUTHORITY_KEYS = [
  "targetRepositoryReadPerformed",
  "targetRepositoryWorkingTreeMutationPerformed",
  "gitReadCommandsPerformed",
  "gitNetworkReadPerformed",
  "gitHookExecutionPerformed",
  "gitCommitCreated",
  "gitPushAttempted",
  "gitPushPerformed",
  "gitRemoteRefUpdatedToCommit",
  "gitTagPushPerformed",
  "forcePushPerformed",
  "deploymentPerformed",
  "releasePublicationPerformed",
];

function exactBooleanMap(value, keys, label) {
  const output = exactObject(value, keys, label, "PUSH_RECEIPT_INVALID");
  for (const key of keys) {
    if (typeof output[key] !== "boolean") verifierFail("PUSH_RECEIPT_INVALID", `${label}.${key} must be boolean.`);
  }
  return output;
}

export function validatePushOutcome(receipt, local, remote) {
  if (!["pushed", "already-pushed", "remote-confirmed-after-client-error"].includes(receipt.outcome)) {
    verifierFail("PUSH_RECEIPT_INVALID", "Push receipt outcome is unsupported.");
  }
  const command = exactObject(
    receipt.pushCommand,
    ["attempted", "exitCode", "stdoutSha256", "stderrSha256", "stdoutBytes", "stderrBytes"],
    "pushReceipt.pushCommand",
    "PUSH_RECEIPT_INVALID",
  );
  if (typeof command.attempted !== "boolean") verifierFail("PUSH_RECEIPT_INVALID", "pushReceipt.pushCommand.attempted must be boolean.");
  for (const key of ["stdoutBytes", "stderrBytes"]) {
    if (!Number.isSafeInteger(command[key]) || command[key] < 0 || command[key] > MAXIMUM_GIT_OUTPUT_BYTES) {
      verifierFail("PUSH_RECEIPT_INVALID", `pushReceipt.pushCommand.${key} is invalid.`);
    }
  }
  if (command.stdoutBytes + command.stderrBytes > MAXIMUM_GIT_OUTPUT_BYTES) {
    verifierFail("PUSH_RECEIPT_INVALID", "Push receipt command output exceeds the governed total byte limit.");
  }
  if (command.attempted) {
    if (!Number.isInteger(command.exitCode) || command.exitCode < 0 || command.exitCode > 255) {
      verifierFail("PUSH_RECEIPT_INVALID", "Attempted push must record a bounded integer exit code.");
    }
    sha256(command.stdoutSha256, "pushReceipt.pushCommand.stdoutSha256");
    sha256(command.stderrSha256, "pushReceipt.pushCommand.stderrSha256");
  } else if (
    command.exitCode !== null || command.stdoutSha256 !== null || command.stderrSha256 !== null ||
    command.stdoutBytes !== 0 || command.stderrBytes !== 0
  ) verifierFail("PUSH_RECEIPT_INVALID", "Unattempted push must record null command identities and zero bytes.");

  canonicalUtc(receipt.pushedAt, "pushReceipt.pushedAt");
  const authority = exactBooleanMap(receipt.authority, AUTHORITY_KEYS, "pushReceipt.authority");
  const attempted = receipt.outcome !== "already-pushed";
  const commandSucceeded = receipt.outcome === "pushed";
  if (
    authority.targetRepositoryReadPerformed !== true ||
    authority.gitReadCommandsPerformed !== true ||
    authority.gitNetworkReadPerformed !== true ||
    authority.gitRemoteRefUpdatedToCommit !== true ||
    authority.gitPushAttempted !== attempted ||
    authority.gitPushPerformed !== commandSucceeded ||
    [
      "targetRepositoryWorkingTreeMutationPerformed", "gitHookExecutionPerformed",
      "gitCommitCreated", "gitTagPushPerformed", "forcePushPerformed",
      "deploymentPerformed", "releasePublicationPerformed",
    ].some((key) => authority[key] !== false)
  ) verifierFail("PUSH_RECEIPT_INVALID", "Push receipt authority boundary has drifted.");

  if (receipt.outcome === "already-pushed") {
    if (remote.before !== local.commit || command.attempted !== false) {
      verifierFail("PUSH_RECEIPT_INVALID", "Already-pushed evidence is inconsistent.");
    }
  } else {
    if (remote.before !== local.parent || command.attempted !== true) {
      verifierFail("PUSH_RECEIPT_INVALID", "Attempted push evidence is not bound to the exact reviewed parent.");
    }
    if (receipt.outcome === "pushed" && command.exitCode !== 0) {
      verifierFail("PUSH_RECEIPT_INVALID", "Pushed outcome requires a zero client exit code.");
    }
    if (receipt.outcome === "remote-confirmed-after-client-error" && command.exitCode === 0) {
      verifierFail("PUSH_RECEIPT_INVALID", "Client-error-confirmed outcome requires a non-zero client exit code.");
    }
  }
}
