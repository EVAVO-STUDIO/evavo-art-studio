import { link, unlink } from "node:fs/promises";
import path from "node:path";

import {
  LayeredGodotWorkspaceWriterError,
  bytesSha256,
} from "../layered-godot-workspace-writer/contract.mjs";
import {
  assertDirectory,
  assertSafeRegular,
  createExactStage,
  filesystemIdentity,
  inspectWorkspaceRoot,
  lstatMaybe,
  readStableRegularFile,
  revalidateWorkspaceRoot,
  sameFilesystemIdentity,
  sameFilesystemPath,
  syncDirectory,
} from "../layered-godot-workspace-writer/filesystem.mjs";
import { canonicalSha256 } from "./canonical.mjs";
import { validateDeliveryEvidenceBundle } from "./delivery-evidence-contract.mjs";
import {
  LAYERED_GODOT_GIT_DELIVERY_EVIDENCE_PUBLICATION_KIND,
  LAYERED_GODOT_GIT_DELIVERY_EVIDENCE_PUBLICATION_PROTOCOL_VERSION,
  LayeredGodotGitPushVerifierError,
  MAXIMUM_VERIFIER_INPUT_BYTES,
  verifierFail,
} from "./protocol.mjs";
import { snapshotJsonValue } from "./snapshot.mjs";

const PUBLICATION_INPUT_KEYS = [
  "bundle",
  "expectedRepository",
  "outputPath",
  "workspaceRoot",
];
const PUBLICATION_RECEIPT_KEYS = [
  "schemaVersion",
  "kind",
  "protocolVersion",
  "target",
  "evidence",
  "verification",
  "publishedAt",
  "authority",
  "publicationSha256",
];
const TARGET_KEYS = [
  "expectedRepository",
  "workspaceRoot",
  "outputPath",
];
const EVIDENCE_KEYS = [
  "bundleSha256",
  "bytes",
  "sha256",
];
const VERIFICATION_KEYS = [
  "deliveryEvidenceBundleAdmitted",
  "outputParentResolvedWithoutSymlinks",
  "createOnlyDestinationEnforced",
  "exactUtf8BytesStagedAndSynced",
  "atomicNoReplacePublicationPerformed",
  "finalReadbackVerified",
  "publicationReceiptContractAdmitted",
];
const AUTHORITY_KEYS = [
  "deliveryEvidenceFileCreationPerformed",
  "existingDeliveryEvidenceReplacementPerformed",
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
  "deliveryEvidenceFileCreationPerformed",
];
const PORTABLE_JSON_FILENAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,238}\.json$/u;

function exactObject(value, keys, label, code = "DELIVERY_EVIDENCE_PUBLICATION_RECEIPT_INVALID") {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    verifierFail(code, `${label} must be an exact object.`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    verifierFail(
      code,
      `${label} fields are not the exact current contract.`,
      { expected, actual },
    );
  }
  return value;
}

function exactPublicationInput(value) {
  let input;
  try {
    input = snapshotJsonValue(value, "deliveryEvidencePublicationInput");
  } catch (error) {
    verifierFail(
      "DELIVERY_EVIDENCE_PUBLICATION_INPUT_INVALID",
      "Delivery evidence publication input failed bounded immutable JSON admission.",
      { upstreamCode: error instanceof Error && "code" in error ? error.code : undefined },
    );
  }
  return exactObject(
    input,
    PUBLICATION_INPUT_KEYS,
    "deliveryEvidencePublicationInput",
    "DELIVERY_EVIDENCE_PUBLICATION_INPUT_INVALID",
  );
}

function boundedString(value, label, maximum = 32_768) {
  if (typeof value !== "string" || value.length < 1 || value.length > maximum) {
    verifierFail(
      "DELIVERY_EVIDENCE_PUBLICATION_RECEIPT_INVALID",
      `${label} must be a non-empty bounded string.`,
    );
  }
  return value;
}

function sha256(value, label) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) {
    verifierFail(
      "DELIVERY_EVIDENCE_PUBLICATION_RECEIPT_INVALID",
      `${label} must be a SHA-256 digest.`,
    );
  }
  return value;
}

function canonicalUtc(value, label) {
  if (typeof value !== "string") {
    verifierFail(
      "DELIVERY_EVIDENCE_PUBLICATION_RECEIPT_INVALID",
      `${label} must be a canonical UTC timestamp.`,
    );
  }
  let canonical;
  try {
    canonical = new Date(value).toISOString();
  } catch {
    canonical = null;
  }
  if (canonical !== value) {
    verifierFail(
      "DELIVERY_EVIDENCE_PUBLICATION_RECEIPT_INVALID",
      `${label} must be a canonical UTC timestamp.`,
    );
  }
  return value;
}

function resolveOutputPath(value) {
  if (typeof value !== "string" || value.length < 1 || value.length > 32_768) {
    verifierFail(
      "DELIVERY_EVIDENCE_PUBLICATION_OUTPUT_INVALID",
      "outputPath must be a non-empty bounded path.",
    );
  }
  const outputPath = path.resolve(value);
  const basename = path.basename(outputPath);
  if (!PORTABLE_JSON_FILENAME.test(basename)) {
    verifierFail(
      "DELIVERY_EVIDENCE_PUBLICATION_OUTPUT_INVALID",
      "outputPath must end in one portable .json filename.",
    );
  }
  return Object.freeze({
    outputPath,
    parentPath: path.dirname(outputPath),
    basename,
  });
}

function serializeBundle(bundle) {
  const data = Buffer.from(`${JSON.stringify(bundle, null, 2)}\n`, "utf8");
  if (data.byteLength > MAXIMUM_VERIFIER_INPUT_BYTES) {
    verifierFail(
      "DELIVERY_EVIDENCE_PUBLICATION_OUTPUT_INVALID",
      "Delivery evidence output exceeds the bounded byte limit.",
    );
  }
  return data;
}

async function removeOwnedFile(filePath, expectedIdentity, acceptedLinkCounts, label) {
  const stats = await lstatMaybe(filePath);
  if (stats === null) return;
  assertSafeRegular(stats, label, acceptedLinkCounts);
  if (!sameFilesystemIdentity(filesystemIdentity(stats), expectedIdentity)) {
    verifierFail(
      "DELIVERY_EVIDENCE_PUBLICATION_ROLLBACK_FAILED",
      `${label} changed before cleanup and was left untouched.`,
    );
  }
  await unlink(filePath);
}

function throwPublicationFailure(error) {
  if (error instanceof LayeredGodotGitPushVerifierError) throw error;
  if (
    error instanceof LayeredGodotWorkspaceWriterError ||
    (
      error &&
      typeof error === "object" &&
      ["ENOENT", "ENOTDIR", "ELOOP"].includes(error.code)
    )
  ) {
    verifierFail(
      "DELIVERY_EVIDENCE_PUBLICATION_PATH_INVALID",
      "Delivery evidence publication path failed its stable filesystem checks.",
      { upstreamCode: error instanceof Error && "code" in error ? error.code : undefined },
    );
  }
  verifierFail(
    "DELIVERY_EVIDENCE_PUBLICATION_FAILED",
    "Delivery evidence publication failed before a verified create-only output was retained.",
    { upstreamCode: error instanceof Error && "code" in error ? error.code : undefined },
  );
}

export function validateDeliveryEvidencePublicationReceipt(
  value,
  bundleValue,
  expectedRepository,
  workspaceRoot,
  outputPathValue,
) {
  let input;
  try {
    input = snapshotJsonValue(
      {
        receipt: value,
        bundle: bundleValue,
        expectedRepository,
        workspaceRoot,
        outputPath: outputPathValue,
      },
      "deliveryEvidencePublicationReceiptAdmissionInput",
    );
  } catch (error) {
    verifierFail(
      "DELIVERY_EVIDENCE_PUBLICATION_RECEIPT_INVALID",
      "Delivery evidence publication receipt failed bounded immutable JSON admission.",
      { upstreamCode: error instanceof Error && "code" in error ? error.code : undefined },
    );
  }

  const bundle = validateDeliveryEvidenceBundle(
    input.bundle,
    input.expectedRepository,
    input.workspaceRoot,
  );
  const output = resolveOutputPath(input.outputPath);
  const expectedData = serializeBundle(bundle);
  const receipt = exactObject(
    input.receipt,
    PUBLICATION_RECEIPT_KEYS,
    "deliveryEvidencePublicationReceipt",
  );

  if (
    receipt.schemaVersion !== "1.0" ||
    receipt.kind !== LAYERED_GODOT_GIT_DELIVERY_EVIDENCE_PUBLICATION_KIND ||
    receipt.protocolVersion !==
      LAYERED_GODOT_GIT_DELIVERY_EVIDENCE_PUBLICATION_PROTOCOL_VERSION
  ) {
    verifierFail(
      "DELIVERY_EVIDENCE_PUBLICATION_RECEIPT_INVALID",
      "Delivery evidence publication receipt schema, kind or protocol is not current.",
    );
  }

  sha256(receipt.publicationSha256, "deliveryEvidencePublicationReceipt.publicationSha256");
  const { publicationSha256: _discard, ...payload } = receipt;
  if (canonicalSha256(payload) !== receipt.publicationSha256) {
    verifierFail(
      "DELIVERY_EVIDENCE_PUBLICATION_RECEIPT_INVALID",
      "Delivery evidence publication receipt self-hash is invalid.",
    );
  }

  const target = exactObject(
    receipt.target,
    TARGET_KEYS,
    "deliveryEvidencePublicationReceipt.target",
  );
  if (
    boundedString(
      target.expectedRepository,
      "deliveryEvidencePublicationReceipt.target.expectedRepository",
      255,
    ) !== input.expectedRepository ||
    boundedString(
      target.workspaceRoot,
      "deliveryEvidencePublicationReceipt.target.workspaceRoot",
    ) !== input.workspaceRoot ||
    !sameFilesystemPath(
      boundedString(
        target.outputPath,
        "deliveryEvidencePublicationReceipt.target.outputPath",
      ),
      output.outputPath,
    )
  ) {
    verifierFail(
      "DELIVERY_EVIDENCE_PUBLICATION_RECEIPT_INVALID",
      "Delivery evidence publication receipt target does not match the selected delivery.",
    );
  }

  const evidence = exactObject(
    receipt.evidence,
    EVIDENCE_KEYS,
    "deliveryEvidencePublicationReceipt.evidence",
  );
  if (
    sha256(
      evidence.bundleSha256,
      "deliveryEvidencePublicationReceipt.evidence.bundleSha256",
    ) !== bundle.bundleSha256 ||
    !Number.isSafeInteger(evidence.bytes) ||
    evidence.bytes !== expectedData.byteLength ||
    sha256(
      evidence.sha256,
      "deliveryEvidencePublicationReceipt.evidence.sha256",
    ) !== bytesSha256(expectedData)
  ) {
    verifierFail(
      "DELIVERY_EVIDENCE_PUBLICATION_RECEIPT_INVALID",
      "Delivery evidence publication receipt bytes do not match the admitted bundle.",
    );
  }

  const verification = exactObject(
    receipt.verification,
    VERIFICATION_KEYS,
    "deliveryEvidencePublicationReceipt.verification",
  );
  for (const key of VERIFICATION_KEYS) {
    if (verification[key] !== true) {
      verifierFail(
        "DELIVERY_EVIDENCE_PUBLICATION_RECEIPT_INVALID",
        `deliveryEvidencePublicationReceipt.verification.${key} must remain true.`,
      );
    }
  }

  canonicalUtc(receipt.publishedAt, "deliveryEvidencePublicationReceipt.publishedAt");

  const authority = exactObject(
    receipt.authority,
    AUTHORITY_KEYS,
    "deliveryEvidencePublicationReceipt.authority",
  );
  for (const key of AUTHORITY_KEYS) {
    const expected = TRUE_AUTHORITY_KEYS.includes(key);
    if (authority[key] !== expected) {
      verifierFail(
        "DELIVERY_EVIDENCE_PUBLICATION_RECEIPT_INVALID",
        `deliveryEvidencePublicationReceipt.authority.${key} must remain ${String(expected)}.`,
      );
    }
  }

  return receipt;
}

export async function publishDeliveryEvidenceBundle(value) {
  const input = exactPublicationInput(value);
  const bundle = validateDeliveryEvidenceBundle(
    input.bundle,
    input.expectedRepository,
    input.workspaceRoot,
  );
  const output = resolveOutputPath(input.outputPath);
  const expectedData = serializeBundle(bundle);
  let root;
  let stage;
  let ownedIdentity;
  let finalLinked = false;

  try {
    root = await inspectWorkspaceRoot(output.parentPath);
    if (await lstatMaybe(output.outputPath) !== null) {
      verifierFail(
        "DELIVERY_EVIDENCE_PUBLICATION_OUTPUT_EXISTS",
        "Delivery evidence output already exists; publication is create-only.",
      );
    }

    stage = await createExactStage(output.parentPath, output.basename, expectedData);
    ownedIdentity = stage.identity;
    await revalidateWorkspaceRoot(root);
    await assertDirectory(output.parentPath, "delivery evidence output parent", root.identity);

    if (await lstatMaybe(output.outputPath) !== null) {
      verifierFail(
        "DELIVERY_EVIDENCE_PUBLICATION_OUTPUT_EXISTS",
        "Delivery evidence output appeared before publication; no file was replaced.",
      );
    }

    try {
      await link(stage.path, output.outputPath);
    } catch (error) {
      if (error && typeof error === "object" && error.code === "EEXIST") {
        verifierFail(
          "DELIVERY_EVIDENCE_PUBLICATION_OUTPUT_EXISTS",
          "Delivery evidence output appeared during publication; no file was replaced.",
        );
      }
      throw error;
    }
    finalLinked = true;

    const linked = await readStableRegularFile(
      output.outputPath,
      "linked delivery evidence output",
      undefined,
      [2n],
    );
    if (
      !sameFilesystemIdentity(linked.identity, stage.identity) ||
      !linked.data.equals(expectedData)
    ) {
      verifierFail(
        "DELIVERY_EVIDENCE_PUBLICATION_VERIFICATION_FAILED",
        "Linked delivery evidence output did not retain the exact staged bytes.",
      );
    }

    await removeOwnedFile(
      stage.path,
      stage.identity,
      [2n],
      "delivery evidence stage",
    );
    stage = undefined;
    await syncDirectory(output.parentPath);

    const published = await readStableRegularFile(
      output.outputPath,
      "published delivery evidence output",
    );
    if (
      !sameFilesystemIdentity(published.identity, linked.identity) ||
      !published.data.equals(expectedData) ||
      published.sha256 !== bytesSha256(expectedData)
    ) {
      verifierFail(
        "DELIVERY_EVIDENCE_PUBLICATION_VERIFICATION_FAILED",
        "Published delivery evidence failed exact post-write readback.",
      );
    }

    const payload = {
      schemaVersion: "1.0",
      kind: LAYERED_GODOT_GIT_DELIVERY_EVIDENCE_PUBLICATION_KIND,
      protocolVersion:
        LAYERED_GODOT_GIT_DELIVERY_EVIDENCE_PUBLICATION_PROTOCOL_VERSION,
      target: {
        expectedRepository: input.expectedRepository,
        workspaceRoot: input.workspaceRoot,
        outputPath: output.outputPath,
      },
      evidence: {
        bundleSha256: bundle.bundleSha256,
        bytes: expectedData.byteLength,
        sha256: published.sha256,
      },
      verification: {
        deliveryEvidenceBundleAdmitted: true,
        outputParentResolvedWithoutSymlinks: true,
        createOnlyDestinationEnforced: true,
        exactUtf8BytesStagedAndSynced: true,
        atomicNoReplacePublicationPerformed: true,
        finalReadbackVerified: true,
        publicationReceiptContractAdmitted: true,
      },
      publishedAt: new Date().toISOString(),
      authority: {
        deliveryEvidenceFileCreationPerformed: true,
        existingDeliveryEvidenceReplacementPerformed: false,
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
    const candidate = {
      ...payload,
      publicationSha256: canonicalSha256(payload),
    };
    return validateDeliveryEvidencePublicationReceipt(
      candidate,
      bundle,
      input.expectedRepository,
      input.workspaceRoot,
      output.outputPath,
    );
  } catch (error) {
    const cleanupFailures = [];
    if (finalLinked && ownedIdentity) {
      try {
        await removeOwnedFile(
          output.outputPath,
          ownedIdentity,
          [1n, 2n],
          "delivery evidence output rollback target",
        );
      } catch (failure) {
        cleanupFailures.push(failure);
      }
    }
    if (stage?.identity) {
      try {
        await removeOwnedFile(
          stage.path,
          stage.identity,
          [1n, 2n],
          "delivery evidence stage rollback target",
        );
      } catch (failure) {
        cleanupFailures.push(failure);
      }
    }
    if (root) {
      try {
        await syncDirectory(output.parentPath);
      } catch (failure) {
        cleanupFailures.push(failure);
      }
    }

    if (cleanupFailures.length > 0) {
      verifierFail(
        "DELIVERY_EVIDENCE_PUBLICATION_ROLLBACK_FAILED",
        "Delivery evidence publication failed and owned temporary files could not be cleaned safely.",
        {
          upstreamCode:
            error instanceof Error && "code" in error ? error.code : undefined,
          cleanupCodes: cleanupFailures.map((failure) =>
            failure instanceof Error && "code" in failure
              ? failure.code
              : undefined),
        },
      );
    }

    throwPublicationFailure(error);
  }
}
