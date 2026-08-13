import assert from "node:assert/strict";
import { lstatSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const files = [
  "scripts/layered-godot-git-push-verifier.mjs",
  "scripts/layered-godot-git-push-verifier/protocol.mjs",
  "scripts/layered-godot-git-push-verifier/canonical.mjs",
  "scripts/layered-godot-git-push-verifier/snapshot.mjs",
  "scripts/layered-godot-git-push-verifier/validation.mjs",
  "scripts/layered-godot-git-push-verifier/dependencies.mjs",
  "scripts/layered-godot-git-push-verifier/buffers.mjs",
  "scripts/layered-godot-git-push-verifier/git-options.mjs",
  "scripts/layered-godot-git-push-verifier/git-readonly.mjs",
  "scripts/layered-godot-git-push-verifier/commit-receipt-contract.mjs",
  "scripts/layered-godot-git-push-verifier/receipt-contract.mjs",
  "scripts/layered-godot-git-push-verifier/receipt-outcome.mjs",
  "scripts/layered-godot-git-push-verifier/runtime.mjs",
  "scripts/layered-godot-git-push-verifier/verification-receipt.mjs",
  "scripts/layered-godot-git-push-verifier/verification-receipt-contract.mjs",
  "scripts/layered-godot-git-push-verifier/delivery-evidence.mjs",
  "scripts/layered-godot-git-push-verifier/delivery-evidence-contract.mjs",
  "scripts/layered-godot-git-push-verifier/cli.mjs",
  "scripts/layered-godot-git-push-verifier/test-verification-receipt.mjs",
  "scripts/layered-godot-git-push-verifier/test-delivery-evidence.mjs",
  "scripts/test-layered-godot-git-push-verifier.mjs",
  "scripts/check-layered-godot-git-push-verifier.mjs",
  "config/layered-production-godot-git-push-verifier.v1.json",
  "docs/LAYERED_GODOT_GIT_PUSH_VERIFIER.md",
];

function sourceMap() {
  const source = new Map();
  for (const relative of files) {
    const absolute = path.join(root, relative);
    const metadata = lstatSync(absolute);
    assert.equal(metadata.isFile(), true, `${relative} must be a regular file`);
    assert.equal(metadata.isSymbolicLink(), false, `${relative} must not be symbolic`);
    assert.ok(metadata.size > 0 && metadata.size < 2_000_000, `${relative} has invalid size`);
    const content = readFileSync(absolute, "utf8");
    assert.equal(content.startsWith("\uFEFF"), false, `${relative} must not have BOM`);
    assert.equal(content.includes("\r"), false, `${relative} must use LF line endings`);
    source.set(relative, content);
  }
  return source;
}

test("push verifier source, lineage, delivery evidence and authority contracts remain exact", async () => {
  const source = sourceMap();
  const verifier = await import("../layered-godot-git-push-verifier.mjs");
  const push = await import("../layered-godot-git-push-operator/contract.mjs");
  assert.equal(
    verifier.EXPECTED_GIT_COMMIT_OPERATOR_PROTOCOL_VERSION,
    push.EXPECTED_GIT_COMMIT_OPERATOR_PROTOCOL_VERSION,
  );
  assert.equal(verifier.EXPECTED_GIT_COMMIT_RECEIPT_KIND, push.EXPECTED_GIT_COMMIT_RECEIPT_KIND);
  assert.equal(
    verifier.EXPECTED_GIT_PUSH_OPERATOR_PROTOCOL_VERSION,
    push.LAYERED_GODOT_GIT_PUSH_OPERATOR_PROTOCOL_VERSION,
  );
  assert.equal(verifier.EXPECTED_GIT_PUSH_RECEIPT_KIND, push.LAYERED_GODOT_GIT_PUSH_RECEIPT_KIND);
  assert.equal(verifier.LAYERED_GODOT_GIT_DELIVERY_EVIDENCE_PROTOCOL_VERSION, "2026-08-13.1");
  assert.equal(
    verifier.LAYERED_GODOT_GIT_DELIVERY_EVIDENCE_KIND,
    "evavo.layered-production.godot-git-delivery-evidence-bundle",
  );
  assert.equal(typeof verifier.createDeliveryEvidenceBundle, "function");
  assert.equal(typeof verifier.validateDeliveryEvidenceBundle, "function");

  const implementation = files
    .filter((entry) => entry.includes("git-push-verifier/") || entry.endsWith("git-push-verifier.mjs"))
    .map((entry) => source.get(entry))
    .join("\n");
  for (const token of [
    "validateCommitReceipt", "validatePushReceipt", "validateVerificationReceipt",
    "snapshotJsonValue", "utilTypes.isProxy",
    "captureDependencies", "captureWorkspaceRoot", "captureOrigin",
    "captureGitResult", "copyStableBuffer", "SharedArrayBuffer",
    "assertReadOnlyGitArguments", "commitReceiptAdmitted: true",
    "lineageBindingsCurrent: true", "crossReceiptBindingsVerified: true",
    "verificationReceiptContractAdmitted: true",
    "createDeliveryEvidenceBundle", "validateDeliveryEvidenceBundle",
    "sourceReceipts", "sourceReceiptHashesBound: true",
    "sourceLineageBound: true", "deliveryEvidenceContractAdmitted: true",
    "deliveryEvidencePackagingPerformed: true",
    "stableAcrossVerification: true", "gitPushAttempted: false",
    "gitPushPerformed: false", "gitRefUpdated: false",
    "forcePushPerformed: false", "deploymentPerformed: false",
    "releasePublicationPerformed: false", "artifactPublicationPerformed: false",
  ]) assert.ok(implementation.includes(token), `push verifier missing ${token}`);
  const gitSurface = source.get("scripts/layered-godot-git-push-verifier/git-readonly.mjs");
  for (const forbidden of [
    '["push"', '["update-index"', '["commit"', '["fetch"', '["pull"',
    '["merge"', '["rebase"', '["reset"', '["checkout"', '["restore"',
    "--force-with-lease", "shell: true",
  ]) assert.equal(gitSurface.includes(forbidden), false, `push verifier Git surface contains ${forbidden}`);

  const config = JSON.parse(source.get("config/layered-production-godot-git-push-verifier.v1.json"));
  assert.equal(config.schema, "evavo.layered-production.godot-git-push-verifier.v1");
  assert.equal(config.protocolVersion, "2026-08-13.3");
  for (const key of [
    "requiresExactCurrentCommitReceipt", "requiresClosedCommitReceiptContract",
    "requiresCommitReceiptSelfHash", "requiresCommitAndPushReceiptLineageParity",
    "requiresCommitAndPushGitIdentityParity", "requiresExactCurrentPushReceipt",
    "requiresClosedPushReceiptContract", "requiresPushReceiptSelfHash",
    "requiresOutcomeCommandAuthorityParity", "requiresImmutableInputSnapshot",
    "requiresSynchronousDependencyCaptureBeforeAsyncBoundary",
    "rejectsProxyInputsDependenciesAndResults", "requiresExactRepositoryRoot",
    "requiresCleanLocalRepository", "requiresExactLocalHeadParentTreeAndBranch",
    "requiresExactHttpsGithubOrigin", "requiresTwoPhaseLocalAndRemoteVerification",
    "requiresRemoteRefEqualReceiptCommit", "requiresClosedReadOnlyGitCommandSet",
    "requiresOwnedGitOutputBuffers", "rejectsSharedGitOutputBuffers",
    "requiresClosedVerificationReceiptContract",
    "requiresGeneratedVerificationReceiptReadmission",
    "requiresVerificationReceiptSourceLineageParity",
  ]) assert.equal(config.requirements[key], true, `config missing ${key}`);
  for (const key of ["gitPush", "gitRefUpdate", "forcePush", "deployment", "releasePublication"]) {
    assert.equal(config.authority[key], false, `authority ${key} must remain false`);
  }

  assert.equal(config.deliveryEvidence.protocolVersion, "2026-08-13.1");
  assert.equal(
    config.deliveryEvidence.kind,
    "evavo.layered-production.godot-git-delivery-evidence-bundle",
  );
  for (const key of [
    "embedsActualCommitPushAndVerificationReceipts",
    "requiresClosedCommitPushAndVerificationReceiptAdmission",
    "requiresExactSourceReceiptHashParity",
    "requiresExactSourceLineageAndGitIdentityParity",
    "requiresExplicitRepositoryAndWorkspaceTarget",
    "requiresImmutableInputSnapshot",
    "rejectsUnsupportedFieldsAtEveryBundleBoundary",
    "emitsSelfHashedDeliveryEvidenceBundle",
    "requiresGeneratedDeliveryEvidenceBundleReadmission",
    "operatesWithoutTargetRepositoryOrNetworkAccess",
  ]) {
    assert.equal(
      config.deliveryEvidence.requirements[key],
      true,
      `delivery evidence config missing ${key}`,
    );
  }
  for (const key of [
    "targetRepositoryRead", "targetRepositoryMutation", "gitRead", "gitNetworkRead",
    "gitCommit", "gitRefUpdate", "gitPush", "deployment", "releasePublication",
    "artifactPublication",
  ]) {
    assert.equal(
      config.deliveryEvidence.authority[key],
      false,
      `delivery evidence authority ${key} must remain false`,
    );
  }

  const docs = source.get("docs/LAYERED_GODOT_GIT_PUSH_VERIFIER.md");
  for (const token of [
    "read-only post-push boundary", "self-hash is integrity, not independent authority",
    "actual source commit receipt", "cross-receipt lineage",
    "two fresh local inspections", "both remote reads",
    "closed read-only Git command set", "closed verification-receipt contract",
    "verificationReceiptContractAdmitted: true", "does not push",
    "Portable delivery evidence bundle", "three separately paired JSON files",
    "deliveryEvidenceContractAdmitted: true", "offline re-admission",
    "not deployment or release publication",
  ]) assert.ok(docs.includes(token), `push verifier docs missing ${token}`);
});
