import { rename, rmdir, unlink } from "node:fs/promises";
import path from "node:path";

import {
  LAYERED_GODOT_WORKSPACE_RECOVERY_RECEIPT_KIND,
  LAYERED_GODOT_WORKSPACE_WRITER_PROTOCOL_VERSION,
  canonicalSha256,
  fail,
  repositoryName,
} from "./contract.mjs";
import {
  assertDirectory,
  filesystemIdentity,
  inspectWorkspaceRoot,
  lstatMaybe,
  readStableRegularFile,
  revalidateWorkspaceRoot,
  sameFilesystemIdentity,
  syncDirectory,
} from "./filesystem.mjs";
import {
  listActiveTransactions,
  parentRelativePaths,
  readTransactionBundle,
  removeTransactionDirectory,
} from "./journal.mjs";

function recoveryFail(code, message, details = undefined) {
  fail(`LAYERED_GODOT_WRITE_RECOVERY_${code}`, message, details);
}

async function ensureExistingParent(root, relativePath) {
  await revalidateWorkspaceRoot(root);
  let current = root.path;
  for (const segment of relativePath.split("/").slice(0, -1)) {
    current = path.join(current, segment);
    const stats = await lstatMaybe(current);
    if (stats === null) return null;
    if (stats.isSymbolicLink()) {
      recoveryFail(
        "INCOMPLETE",
        `Parent ${current} became symbolic during recovery.`,
      );
    }
    if (!stats.isDirectory()) {
      recoveryFail(
        "INCOMPLETE",
        `Parent ${current} is not a directory during recovery.`,
      );
    }
  }
  await assertDirectory(current, `recovery parent ${relativePath}`);
  return current;
}

async function verifyPriorTarget(target, operation) {
  const current = await readStableRegularFile(
    target,
    `recovery prior target ${operation.path}`,
    operation.existing.identity,
  );
  if (
    current.sha256 !== operation.existing.sha256 ||
    current.bytes !== operation.existing.bytes
  ) {
    recoveryFail(
      "INCOMPLETE",
      `Prior target ${operation.path} changed after the transaction was prepared.`,
    );
  }
  return current;
}

async function verifyStage(transactionPath, operation, acceptedLinks = [1n, 2n]) {
  if (operation.stage === null) return null;
  const stagePath = path.join(transactionPath, operation.stage.name);
  const stats = await lstatMaybe(stagePath);
  if (stats === null) return null;
  const stage = await readStableRegularFile(
    stagePath,
    `recovery stage ${operation.path}`,
    operation.stage.identity,
    acceptedLinks,
  );
  if (
    stage.sha256 !== operation.resourceSha256 ||
    stage.bytes !== operation.resourceBytes
  ) {
    recoveryFail(
      "INCOMPLETE",
      `Transaction stage for ${operation.path} no longer matches the prepared resource.`,
    );
  }
  return Object.freeze({ ...stage, path: stagePath });
}

async function verifyBackup(transactionPath, operation) {
  if (operation.backupName === null) return null;
  const backupPath = path.join(transactionPath, operation.backupName);
  const stats = await lstatMaybe(backupPath);
  if (stats === null) return null;
  const backup = await readStableRegularFile(
    backupPath,
    `recovery backup ${operation.path}`,
    operation.existing.identity,
  );
  if (
    backup.sha256 !== operation.existing.sha256 ||
    backup.bytes !== operation.existing.bytes
  ) {
    recoveryFail(
      "INCOMPLETE",
      `Transaction backup for ${operation.path} no longer matches the original target.`,
    );
  }
  return Object.freeze({ ...backup, path: backupPath });
}

async function removeRollbackDirectories(root, intent) {
  const preexisting = new Set(intent.preexistingDirectories);
  const candidates = parentRelativePaths(intent.resources.map((entry) => entry.path))
    .filter((entry) => !preexisting.has(entry))
    .sort((left, right) => {
      const depthDelta = right.split("/").length - left.split("/").length;
      return depthDelta || right.localeCompare(left);
    });
  for (const relative of candidates) {
    const absolute = path.join(root.path, ...relative.split("/"));
    const stats = await lstatMaybe(absolute);
    if (stats === null) continue;
    if (stats.isSymbolicLink() || !stats.isDirectory()) {
      recoveryFail(
        "INCOMPLETE",
        `Rollback-owned directory candidate ${relative} changed externally.`,
      );
    }
    try {
      await rmdir(absolute);
      await syncDirectory(path.dirname(absolute));
    } catch (error) {
      if (
        !error ||
        typeof error !== "object" ||
        !["ENOTEMPTY", "EEXIST", "ENOENT"].includes(error.code)
      ) {
        throw error;
      }
    }
  }
}

export async function rollbackPreparedTransaction(root, bundle) {
  const { transaction, intent, prepared } = bundle;
  if (prepared === null) {
    await removeTransactionDirectory(transaction);
    return Object.freeze({
      transactionId: transaction.transactionId,
      action: "discarded-incomplete-preparation",
      operations: 0,
      externalTargetsPreserved: [],
    });
  }

  const externalTargetsPreserved = [];
  for (const operation of [...prepared.operations].reverse()) {
    await revalidateWorkspaceRoot(root);
    const target = path.join(root.path, ...operation.path.split("/"));
    const parent = await ensureExistingParent(root, operation.path);
    const stage = await verifyStage(transaction.path, operation);
    const backup = await verifyBackup(transaction.path, operation);
    const targetStats = await lstatMaybe(target);

    if (operation.outcome === "unchanged") {
      if (targetStats === null) {
        recoveryFail(
          "INCOMPLETE",
          `Unchanged target ${operation.path} disappeared during interrupted recovery.`,
        );
      }
      await verifyPriorTarget(target, operation);
      continue;
    }

    if (operation.outcome === "created") {
      if (targetStats !== null) {
        if (stage === null) {
          externalTargetsPreserved.push(operation.path);
        } else {
          let current;
          try {
            current = await readStableRegularFile(
              target,
              `recovery created target ${operation.path}`,
              undefined,
              [1n, 2n],
            );
          } catch (error) {
            current = null;
          }
          const writerOwned =
            current !== null &&
            current.identity.dev === stage.identity.dev &&
            current.identity.ino === stage.identity.ino &&
            current.sha256 === operation.resourceSha256 &&
            current.bytes === operation.resourceBytes;
          if (writerOwned) {
            await unlink(target);
            if (parent !== null) await syncDirectory(parent);
          } else {
            externalTargetsPreserved.push(operation.path);
          }
        }
      }
      if (stage !== null) {
        await unlink(stage.path);
        await syncDirectory(transaction.path);
      }
      continue;
    }

    if (backup === null) {
      if (targetStats === null) {
        recoveryFail(
          "INCOMPLETE",
          `Replaced target ${operation.path} is missing and its prepared backup is absent.`,
        );
      }
      try {
        await verifyPriorTarget(target, operation);
      } catch {
        externalTargetsPreserved.push(operation.path);
      }
      if (stage !== null) {
        await unlink(stage.path);
        await syncDirectory(transaction.path);
      }
      continue;
    }

    if (targetStats !== null) {
      if (stage === null) {
        recoveryFail(
          "INCOMPLETE",
          `Replacement target ${operation.path} exists but its ownership stage is missing.`,
        );
      }
      const current = await readStableRegularFile(
        target,
        `recovery replacement target ${operation.path}`,
        undefined,
        [2n],
      );
      if (
        !sameFilesystemIdentity(current.identity, stage.identity) ||
        current.sha256 !== operation.resourceSha256 ||
        current.bytes !== operation.resourceBytes
      ) {
        recoveryFail(
          "INCOMPLETE",
          `Replacement target ${operation.path} changed externally and was left untouched.`,
        );
      }
      await unlink(target);
      if (parent !== null) await syncDirectory(parent);
    }
    if ((await lstatMaybe(target)) !== null) {
      recoveryFail(
        "INCOMPLETE",
        `Target ${operation.path} reappeared before rollback restoration.`,
      );
    }
    await rename(backup.path, target);
    if (parent !== null) await syncDirectory(parent);
    await syncDirectory(transaction.path);
    await verifyPriorTarget(target, operation);
    if (stage !== null) {
      await unlink(stage.path);
      await syncDirectory(transaction.path);
    }
  }

  await removeRollbackDirectories(root, intent);
  await removeTransactionDirectory(transaction);
  return Object.freeze({
    transactionId: transaction.transactionId,
    action:
      externalTargetsPreserved.length === 0
        ? "rolled-back"
        : "rolled-back-external-preserved",
    operations: prepared.operations.filter((entry) => entry.outcome !== "unchanged").length,
    externalTargetsPreserved: externalTargetsPreserved.sort(),
  });
}

export async function completeFinalizingTransaction(root, bundle) {
  const { transaction, prepared, finalizing } = bundle;
  if (prepared === null || finalizing === null) {
    recoveryFail(
      "INCOMPLETE",
      "Forward completion requires prepared and finalizing journal records.",
    );
  }

  for (const operation of prepared.operations) {
    await revalidateWorkspaceRoot(root);
    const target = path.join(root.path, ...operation.path.split("/"));
    const parent = await ensureExistingParent(root, operation.path);
    if (parent === null || (await lstatMaybe(target)) === null) {
      recoveryFail(
        "INCOMPLETE",
        `Committed target ${operation.path} is missing during forward recovery.`,
      );
    }
    const targetLinks = operation.outcome === "unchanged" ? [1n] : [1n, 2n];
    const current = await readStableRegularFile(
      target,
      `committed target ${operation.path}`,
      undefined,
      targetLinks,
    );
    if (
      current.sha256 !== operation.resourceSha256 ||
      current.bytes !== operation.resourceBytes
    ) {
      recoveryFail(
        "INCOMPLETE",
        `Committed target ${operation.path} drifted before recovery completion.`,
      );
    }

    const stage = await verifyStage(transaction.path, operation);
    if (stage !== null) {
      if (!sameFilesystemIdentity(current.identity, stage.identity)) {
        recoveryFail(
          "INCOMPLETE",
          `Committed target ${operation.path} is no longer linked to its retained stage.`,
        );
      }
      await unlink(stage.path);
      await syncDirectory(transaction.path);
      await syncDirectory(parent);
    }

    const backup = await verifyBackup(transaction.path, operation);
    if (backup !== null) {
      await unlink(backup.path);
      await syncDirectory(transaction.path);
    }

    const final = await readStableRegularFile(
      target,
      `final recovered target ${operation.path}`,
    );
    if (
      final.sha256 !== operation.resourceSha256 ||
      final.bytes !== operation.resourceBytes
    ) {
      recoveryFail(
        "INCOMPLETE",
        `Recovered target ${operation.path} failed final exact-byte verification.`,
      );
    }
  }

  await removeTransactionDirectory(transaction);
  return Object.freeze({
    transactionId: transaction.transactionId,
    action: "completed-forward",
    operations: prepared.operations.filter((entry) => entry.outcome !== "unchanged").length,
  });
}

export async function recoverTransaction(root, transaction, expectedRepository) {
  const bundle = await readTransactionBundle(root, transaction, expectedRepository);
  if (bundle.prepared === null) {
    return rollbackPreparedTransaction(root, bundle);
  }
  if (bundle.finalizing !== null) {
    return completeFinalizingTransaction(root, bundle);
  }
  return rollbackPreparedTransaction(root, bundle);
}

export async function recoverLayeredGodotWorkspace({
  workspaceRoot,
  expectedRepository,
}) {
  const repository = repositoryName(expectedRepository, "expectedRepository");
  const root = await inspectWorkspaceRoot(path.resolve(workspaceRoot));
  const transactions = await listActiveTransactions(root);
  const recovered = [];
  for (const transaction of transactions) {
    recovered.push(await recoverTransaction(root, transaction, repository));
  }
  const receiptWithoutHash = {
    schemaVersion: "1.0",
    kind: LAYERED_GODOT_WORKSPACE_RECOVERY_RECEIPT_KIND,
    protocolVersion: LAYERED_GODOT_WORKSPACE_WRITER_PROTOCOL_VERSION,
    target: {
      expectedRepository: repository,
      workspaceRoot: root.realPath,
    },
    transactions: recovered,
    totals: {
      recovered: recovered.length,
      rolledBack: recovered.filter((entry) =>
        ["rolled-back", "rolled-back-external-preserved"].includes(entry.action),
      ).length,
      completedForward: recovered.filter((entry) => entry.action === "completed-forward").length,
      discardedPreparations: recovered.filter(
        (entry) => entry.action === "discarded-incomplete-preparation",
      ).length,
    },
    recoveredAt: new Date().toISOString(),
    authority: {
      exactFileRecoveryPerformed: recovered.length > 0,
      godotExecutionPerformed: false,
      runtimeActivationPerformed: false,
      gitCommitCreated: false,
      gitPushPerformed: false,
      deploymentPerformed: false,
      publicationPerformed: false,
      forcePushPerformed: false,
    },
  };
  return Object.freeze({
    ...receiptWithoutHash,
    recoveryReceiptSha256: canonicalSha256(receiptWithoutHash),
  });
}
