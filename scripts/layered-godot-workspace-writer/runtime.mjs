import { link, rename, unlink } from "node:fs/promises";
import path from "node:path";

import {
  LAYERED_GODOT_WORKSPACE_WRITER_PROTOCOL_VERSION,
  LAYERED_GODOT_WORKSPACE_WRITE_RECEIPT_KIND,
  LayeredGodotWorkspaceWriterError,
  canonicalSha256,
  fail,
  verifyLayeredGodotWorkspaceWriteRequest,
} from "./contract.mjs";
import {
  assertDirectory,
  createBackupPath,
  createExactStage,
  ensureSafeParent,
  filesystemIdentity,
  inspectWorkspaceRoot,
  lstatMaybe,
  readStableRegularFile,
  removeCreatedDirectories,
  resolveWorkspaceTarget,
  revalidateWorkspaceRoot,
  syncDirectory,
  unlinkExpected,
} from "./filesystem.mjs";

async function rollbackTransaction(active, prepared, createdDirectories) {
  const rollbackErrors = [];
  for (const transaction of [...active].reverse()) {
    try {
      if (transaction.targetLinked) {
        const current = await readStableRegularFile(
          transaction.operation.target,
          `written target ${transaction.operation.relativePath}`,
          undefined,
          [1n, 2n],
        );
        if (
          current.identity.dev !== transaction.operation.stage.identity.dev ||
          current.identity.ino !== transaction.operation.stage.identity.ino ||
          !current.data.equals(transaction.operation.resource.data)
        ) {
          fail(
            "LAYERED_GODOT_WRITE_ROLLBACK_INCOMPLETE",
            `Written target ${transaction.operation.relativePath} changed before rollback.`,
          );
        }
        await unlink(transaction.operation.target);
      }
      if (transaction.backupMoved) {
        const backup = await readStableRegularFile(
          transaction.backupPath,
          `backup ${transaction.operation.relativePath}`,
          transaction.operation.existing.identity,
        );
        if (!backup.data.equals(transaction.operation.existing.data)) {
          fail(
            "LAYERED_GODOT_WRITE_ROLLBACK_INCOMPLETE",
            `Backup ${transaction.operation.relativePath} changed before rollback.`,
          );
        }
        try {
          await link(transaction.backupPath, transaction.operation.target);
        } catch (error) {
          if (error && typeof error === "object" && error.code === "EEXIST") {
            fail(
              "LAYERED_GODOT_WRITE_ROLLBACK_INCOMPLETE",
              `Target ${transaction.operation.relativePath} reappeared before rollback restore.`,
            );
          }
          throw error;
        }
        await unlink(transaction.backupPath);
      }
      await syncDirectory(transaction.operation.parent.path);
    } catch (error) {
      rollbackErrors.push(error instanceof Error ? error.message : String(error));
    }
  }

  for (const operation of prepared) {
    if (operation.stage) {
      try {
        await unlinkExpected(
          operation.stage.path,
          operation.stage.identity,
          `stage ${operation.relativePath}`,
        );
      } catch (error) {
        rollbackErrors.push(error instanceof Error ? error.message : String(error));
      }
    }
  }
  try {
    await removeCreatedDirectories(createdDirectories);
  } catch (error) {
    rollbackErrors.push(error instanceof Error ? error.message : String(error));
  }
  if (rollbackErrors.length > 0) {
    fail(
      "LAYERED_GODOT_WRITE_ROLLBACK_INCOMPLETE",
      "Godot workspace write failed and rollback could not be completed safely.",
      rollbackErrors,
    );
  }
}

export async function applyLayeredGodotWorkspaceWriteRequest(
  requestValue,
  hooks = undefined,
) {
  const verified = verifyLayeredGodotWorkspaceWriteRequest(requestValue);
  const root = await inspectWorkspaceRoot(verified.workspaceRoot);
  const createdDirectories = [];
  const prepared = [];
  const active = [];
  let transactionStarted = false;

  try {
    for (const resource of verified.integration.resources) {
      const parent = await ensureSafeParent(
        root,
        resource.path,
        createdDirectories,
      );
      const target = resolveWorkspaceTarget(root.path, resource.path);
      const existingStats = await lstatMaybe(target);
      let existing = null;
      let outcome = "created";
      if (existingStats !== null) {
        existing = await readStableRegularFile(target, `target ${resource.path}`);
        outcome = existing.data.equals(resource.data) ? "unchanged" : "replaced";
      }
      const operation = {
        index: prepared.length,
        resource,
        relativePath: resource.path,
        parent,
        target,
        existing,
        outcome,
        stage: null,
      };
      if (outcome !== "unchanged") {
        operation.stage = await createExactStage(
          parent.path,
          path.basename(target),
          resource.data,
        );
      }
      prepared.push(operation);
    }

    await revalidateWorkspaceRoot(root);
    transactionStarted = true;
    for (const operation of prepared) {
      if (operation.outcome === "unchanged") continue;
      if (hooks?.beforeCommitOperation) {
        await hooks.beforeCommitOperation(
          Object.freeze({
            index: operation.index,
            path: operation.relativePath,
            target: operation.target,
            outcome: operation.outcome,
          }),
        );
      }
      await revalidateWorkspaceRoot(root);
      await assertDirectory(
        operation.parent.path,
        `parent ${operation.relativePath}`,
        operation.parent.identity,
      );
      if (operation.existing === null) {
        if ((await lstatMaybe(operation.target)) !== null) {
          fail(
            "LAYERED_GODOT_WRITE_TARGET_RACE",
            `Target ${operation.relativePath} appeared after preflight.`,
          );
        }
      } else {
        const current = await readStableRegularFile(
          operation.target,
          `target ${operation.relativePath}`,
          operation.existing.identity,
        );
        if (!current.data.equals(operation.existing.data)) {
          fail(
            "LAYERED_GODOT_WRITE_STALE_TARGET",
            `Target ${operation.relativePath} changed after preflight.`,
          );
        }
      }
      const stage = await readStableRegularFile(
        operation.stage.path,
        `stage ${operation.relativePath}`,
        operation.stage.identity,
      );
      if (!stage.data.equals(operation.resource.data)) {
        fail(
          "LAYERED_GODOT_WRITE_STAGE_INVALID",
          `Stage ${operation.relativePath} changed after preflight.`,
        );
      }

      const transaction = {
        operation,
        backupPath: null,
        backupMoved: false,
        targetLinked: false,
        stageUnlinked: false,
        installedIdentity: null,
      };
      active.push(transaction);
      if (operation.existing !== null) {
        transaction.backupPath = createBackupPath(
          operation.parent.path,
          path.basename(operation.target),
        );
        if ((await lstatMaybe(transaction.backupPath)) !== null) {
          fail(
            "LAYERED_GODOT_WRITE_TARGET_RACE",
            `Backup path collision for ${operation.relativePath}.`,
          );
        }
        await rename(operation.target, transaction.backupPath);
        transaction.backupMoved = true;
        await readStableRegularFile(
          transaction.backupPath,
          `backup ${operation.relativePath}`,
          operation.existing.identity,
        );
      }
      try {
        await link(operation.stage.path, operation.target);
      } catch (error) {
        if (error && typeof error === "object" && error.code === "EEXIST") {
          fail(
            "LAYERED_GODOT_WRITE_TARGET_RACE",
            `Target ${operation.relativePath} appeared during atomic installation.`,
          );
        }
        throw error;
      }
      transaction.targetLinked = true;
      await unlink(operation.stage.path);
      transaction.stageUnlinked = true;
      const installed = await readStableRegularFile(
        operation.target,
        `written target ${operation.relativePath}`,
      );
      transaction.installedIdentity = installed.identity;
      if (!installed.data.equals(operation.resource.data)) {
        fail(
          "LAYERED_GODOT_WRITE_TARGET_INVALID",
          `Written target ${operation.relativePath} does not contain the exact approved bytes.`,
        );
      }
      await syncDirectory(operation.parent.path);
    }

    for (const operation of prepared) {
      await revalidateWorkspaceRoot(root);
      await assertDirectory(
        operation.parent.path,
        `parent ${operation.relativePath}`,
        operation.parent.identity,
      );
      const current = await readStableRegularFile(
        operation.target,
        `final target ${operation.relativePath}`,
      );
      if (!current.data.equals(operation.resource.data)) {
        fail(
          "LAYERED_GODOT_WRITE_STALE_TARGET",
          `Target ${operation.relativePath} changed before transaction finalisation.`,
        );
      }
    }

    const cleanupWarnings = [];
    for (const transaction of active) {
      if (transaction.backupMoved) {
        try {
          await unlinkExpected(
            transaction.backupPath,
            transaction.operation.existing.identity,
            `backup ${transaction.operation.relativePath}`,
          );
          await syncDirectory(transaction.operation.parent.path);
        } catch (error) {
          cleanupWarnings.push(error instanceof Error ? error.message : String(error));
        }
      }
    }

    const operations = prepared.map((operation) => ({
      index: operation.index,
      path: operation.relativePath,
      outcome: operation.outcome,
      sha256: operation.resource.sha256,
      bytes: operation.resource.bytes,
      ...(operation.existing === null
        ? {}
        : {
            priorSha256: operation.existing.sha256,
            priorBytes: operation.existing.bytes,
          }),
    }));
    const receiptWithoutHash = {
      schemaVersion: "1.0",
      kind: LAYERED_GODOT_WORKSPACE_WRITE_RECEIPT_KIND,
      protocolVersion: LAYERED_GODOT_WORKSPACE_WRITER_PROTOCOL_VERSION,
      requestId: verified.requestId,
      revision: verified.revision,
      requestSha256: verified.requestSha256,
      integrationSha256: verified.integration.integrationSha256,
      target: {
        expectedRepository: verified.expectedRepository,
        workspaceRoot: root.realPath,
      },
      operations,
      totals: {
        resources: operations.length,
        created: operations.filter((entry) => entry.outcome === "created").length,
        replaced: operations.filter((entry) => entry.outcome === "replaced").length,
        unchanged: operations.filter((entry) => entry.outcome === "unchanged").length,
        bytes: verified.integration.totalBytes,
      },
      ...(cleanupWarnings.length === 0 ? {} : { cleanupWarnings }),
      appliedAt: new Date().toISOString(),
      authority: {
        exactFileWritePerformed: operations.some(
          (entry) => entry.outcome !== "unchanged",
        ),
        targetRepositoryWorkingTreeMutationPerformed: operations.some(
          (entry) => entry.outcome !== "unchanged",
        ),
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
      receiptSha256: canonicalSha256(receiptWithoutHash),
    });
  } catch (error) {
    if (transactionStarted) {
      await rollbackTransaction(active, prepared, createdDirectories);
      fail(
        "LAYERED_GODOT_WRITE_ROLLED_BACK",
        `Godot workspace write failed and was rolled back: ${
          error instanceof Error ? error.message : String(error)
        }`,
        {
          originalCode:
            error instanceof LayeredGodotWorkspaceWriterError
              ? error.code
              : "FILESYSTEM_ERROR",
        },
      );
    }
    for (const operation of prepared) {
      if (operation.stage) {
        try {
          await unlinkExpected(
            operation.stage.path,
            operation.stage.identity,
            `stage ${operation.relativePath}`,
          );
        } catch {
          // The primary validation error remains authoritative before transaction start.
        }
      }
    }
    await removeCreatedDirectories(createdDirectories);
    throw error;
  }
}
