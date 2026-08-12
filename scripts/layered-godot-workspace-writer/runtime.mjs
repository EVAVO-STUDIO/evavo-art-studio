import { link, rename } from "node:fs/promises";
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
  ensureSafeParent,
  inspectWorkspaceRoot,
  lstatMaybe,
  readStableRegularFile,
  revalidateWorkspaceRoot,
  syncDirectory,
} from "./filesystem.mjs";
import {
  assertNoOutstandingTransactions,
  createTransactionJournal,
  createTransactionStage,
  snapshotPreexistingDirectories,
  transactionBackupName,
  transactionBackupPath,
  writeFinalizingJournal,
  writePreparedJournal,
} from "./journal.mjs";
import {
  completeFinalizingTransaction,
  rollbackPreparedTransaction,
} from "./recovery.mjs";

export class LayeredGodotWorkspaceSimulatedInterruption extends Error {
  constructor(phase, index = undefined) {
    super(
      `Simulated process interruption after durable phase ${phase}${
        index === undefined ? "" : ` for operation ${index}`
      }.`,
    );
    this.name = "LayeredGodotWorkspaceSimulatedInterruption";
    this.phase = phase;
    if (index !== undefined) this.index = index;
  }
}

async function notifyDurablePhase(hooks, phase, context = {}) {
  if (hooks?.afterDurablePhase) {
    await hooks.afterDurablePhase(Object.freeze({ phase, ...context }));
  }
  const selector =
    context.index === undefined ? phase : `${phase}:${context.index}`;
  if (
    hooks?.interruptAfterPhase === phase ||
    hooks?.interruptAfterPhase === selector
  ) {
    throw new LayeredGodotWorkspaceSimulatedInterruption(
      phase,
      context.index,
    );
  }
}

function isSimulatedInterruption(error) {
  return error instanceof LayeredGodotWorkspaceSimulatedInterruption;
}

function operationReceipt(preparedOperation) {
  return {
    index: preparedOperation.index,
    path: preparedOperation.relativePath,
    outcome: preparedOperation.outcome,
    sha256: preparedOperation.resource.sha256,
    bytes: preparedOperation.resource.bytes,
    ...(preparedOperation.existing === null
      ? {}
      : {
          priorSha256: preparedOperation.existing.sha256,
          priorBytes: preparedOperation.existing.bytes,
        }),
  };
}

export async function applyLayeredGodotWorkspaceWriteRequest(
  requestValue,
  hooks = undefined,
) {
  const verified = verifyLayeredGodotWorkspaceWriteRequest(requestValue);
  const root = await inspectWorkspaceRoot(verified.workspaceRoot);
  await assertNoOutstandingTransactions(root);
  const preexistingDirectories = await snapshotPreexistingDirectories(
    root,
    verified.integration.resources.map((resource) => resource.path),
  );

  let journal = null;
  let preparedJournal = null;
  let finalizingJournal = null;
  const prepared = [];
  const createdDirectories = [];
  const parentByPath = new Map();

  const preflight = [];
  for (const [index, resource] of verified.integration.resources.entries()) {
    const target = path.join(root.path, ...resource.path.split("/"));
    const existingStats = await lstatMaybe(target);
    let existing = null;
    let outcome = "created";
    if (existingStats !== null) {
      existing = await readStableRegularFile(
        target,
        `target ${resource.path}`,
      );
      outcome = existing.data.equals(resource.data)
        ? "unchanged"
        : "replaced";
    }
    preflight.push({ index, resource, target, existing, outcome });
  }

  try {
    journal = await createTransactionJournal(
      root,
      verified,
      preexistingDirectories,
    );
    await notifyDurablePhase(hooks, "intent", {
      transactionId: journal.transactionId,
    });

    for (const entry of preflight) {
      const stage =
        entry.outcome === "unchanged"
          ? null
          : await createTransactionStage(
              journal,
              entry.index,
              entry.resource.data,
            );
      prepared.push({
        index: entry.index,
        resource: entry.resource,
        relativePath: entry.resource.path,
        target: entry.target,
        existing: entry.existing,
        outcome: entry.outcome,
        stage,
        backupName:
          entry.outcome === "replaced"
            ? transactionBackupName(entry.index)
            : null,
      });
    }

    preparedJournal = await writePreparedJournal(journal, prepared);
    await notifyDurablePhase(hooks, "prepared", {
      transactionId: journal.transactionId,
    });

    for (const operation of prepared) {
      const parent = await ensureSafeParent(
        root,
        operation.relativePath,
        createdDirectories,
      );
      parentByPath.set(operation.relativePath, parent);
    }

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
      const parent = parentByPath.get(operation.relativePath);
      await assertDirectory(
        parent.path,
        `parent ${operation.relativePath}`,
        parent.identity,
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
        `transaction stage ${operation.relativePath}`,
        operation.stage.identity,
      );
      if (!stage.data.equals(operation.resource.data)) {
        fail(
          "LAYERED_GODOT_WRITE_STAGE_INVALID",
          `Stage ${operation.relativePath} changed after preparation.`,
        );
      }

      if (operation.outcome === "replaced") {
        const backupPath = transactionBackupPath(
          journal.path,
          operation.index,
        );
        if ((await lstatMaybe(backupPath)) !== null) {
          fail(
            "LAYERED_GODOT_WRITE_TARGET_RACE",
            `Backup path collision for ${operation.relativePath}.`,
          );
        }
        await rename(operation.target, backupPath);
        await syncDirectory(parent.path);
        await syncDirectory(journal.path);
        await notifyDurablePhase(hooks, "backup-moved", {
          transactionId: journal.transactionId,
          index: operation.index,
          path: operation.relativePath,
        });
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
      await syncDirectory(parent.path);
      await syncDirectory(journal.path);
      await notifyDurablePhase(hooks, "target-linked", {
        transactionId: journal.transactionId,
        index: operation.index,
        path: operation.relativePath,
      });

      const installed = await readStableRegularFile(
        operation.target,
        `written target ${operation.relativePath}`,
        operation.stage.identity,
        [2n],
      );
      if (!installed.data.equals(operation.resource.data)) {
        fail(
          "LAYERED_GODOT_WRITE_TARGET_INVALID",
          `Written target ${operation.relativePath} does not contain the exact approved bytes.`,
        );
      }
    }

    for (const operation of prepared) {
      await revalidateWorkspaceRoot(root);
      const parent = parentByPath.get(operation.relativePath);
      await assertDirectory(
        parent.path,
        `parent ${operation.relativePath}`,
        parent.identity,
      );
      const current = await readStableRegularFile(
        operation.target,
        `final target ${operation.relativePath}`,
        undefined,
        operation.outcome === "unchanged" ? [1n] : [2n],
      );
      if (!current.data.equals(operation.resource.data)) {
        fail(
          "LAYERED_GODOT_WRITE_STALE_TARGET",
          `Target ${operation.relativePath} changed before transaction finalisation.`,
        );
      }
    }

    finalizingJournal = await writeFinalizingJournal(
      journal,
      preparedJournal,
    );
    await notifyDurablePhase(hooks, "finalizing", {
      transactionId: journal.transactionId,
    });

    await completeFinalizingTransaction(root, {
      transaction: {
        transactionId: journal.transactionId,
        path: journal.path,
        rootPath: journal.rootPath,
      },
      intent: journal.intent,
      prepared: preparedJournal,
      finalizing: finalizingJournal,
    });

    const operations = prepared.map(operationReceipt);
    const receiptWithoutHash = {
      schemaVersion: "1.0",
      kind: LAYERED_GODOT_WORKSPACE_WRITE_RECEIPT_KIND,
      protocolVersion: LAYERED_GODOT_WORKSPACE_WRITER_PROTOCOL_VERSION,
      requestId: verified.requestId,
      revision: verified.revision,
      requestSha256: verified.requestSha256,
      integrationSha256: verified.integration.integrationSha256,
      transactionId: journal.transactionId,
      recoveryState: "clean",
      target: {
        expectedRepository: verified.expectedRepository,
        workspaceRoot: root.realPath,
      },
      operations,
      totals: {
        resources: operations.length,
        created: operations.filter((entry) => entry.outcome === "created")
          .length,
        replaced: operations.filter((entry) => entry.outcome === "replaced")
          .length,
        unchanged: operations.filter((entry) => entry.outcome === "unchanged")
          .length,
        bytes: verified.integration.totalBytes,
      },
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
    if (isSimulatedInterruption(error)) {
      throw error;
    }

    if (journal !== null && finalizingJournal !== null) {
      fail(
        "LAYERED_GODOT_WRITE_RECOVERY_REQUIRED",
        `Godot workspace write reached its durable finalizing boundary but cleanup did not complete: ${
          error instanceof Error ? error.message : String(error)
        }`,
        {
          transactionId: journal.transactionId,
          originalCode:
            error instanceof LayeredGodotWorkspaceWriterError
              ? error.code
              : "FILESYSTEM_ERROR",
        },
      );
    }

    if (journal !== null) {
      try {
        await rollbackPreparedTransaction(root, {
          transaction: {
            transactionId: journal.transactionId,
            path: journal.path,
            rootPath: journal.rootPath,
          },
          intent: journal.intent,
          prepared: preparedJournal,
          finalizing: null,
        });
      } catch (rollbackError) {
        fail(
          "LAYERED_GODOT_WRITE_RECOVERY_REQUIRED",
          "Godot workspace write failed and durable rollback could not be completed safely.",
          {
            transactionId: journal.transactionId,
            originalCode:
              error instanceof LayeredGodotWorkspaceWriterError
                ? error.code
                : "FILESYSTEM_ERROR",
            rollbackError:
              rollbackError instanceof Error
                ? rollbackError.message
                : String(rollbackError),
          },
        );
      }
      fail(
        "LAYERED_GODOT_WRITE_ROLLED_BACK",
        `Godot workspace write failed and was rolled back from its durable journal: ${
          error instanceof Error ? error.message : String(error)
        }`,
        {
          transactionId: journal.transactionId,
          originalCode:
            error instanceof LayeredGodotWorkspaceWriterError
              ? error.code
              : "FILESYSTEM_ERROR",
        },
      );
    }
    throw error;
  }
}
