import {
  atomicWriteFile,
  withFileLock,
  type JsonValue,
} from "@evavo/art-artifacts";
import {
  mkdir,
  readFile,
  readdir,
  realpath,
} from "node:fs/promises";
import path from "node:path";

import {
  parseRuntimeJournalHeadText,
  parseRuntimeTransactionText,
  runtimeSnapshotHash,
  serializeRuntimeJournalHead,
  serializeRuntimeTransaction,
  transactionFileName,
} from "./journal-integrity.js";
import {
  RUNTIME_PROTOCOL_VERSION,
  RuntimeError,
  type LocalRuntimeOptions,
  type RuntimeEvent,
  type RuntimeSnapshot,
  type RuntimeTransactionRecord,
} from "./types.js";

export type RuntimeEventDraft = Readonly<{
  type: string;
  actor: string;
  at: string;
  jobId?: string;
  data: JsonValue;
}>;

export type MutableRuntimeSnapshot = {
  schemaVersion: "1.0";
  protocolVersion: typeof RUNTIME_PROTOCOL_VERSION;
  sequence: number;
  jobs: Record<string, import("./types.js").RuntimeJobRecord>;
  idempotencyIndex: Record<string, string>;
};

export type RuntimeMutationResult<T> = Readonly<{
  result: T;
  events: readonly RuntimeEventDraft[];
  changed: boolean;
}>;

function emptySnapshot(): MutableRuntimeSnapshot {
  return {
    schemaVersion: "1.0",
    protocolVersion: RUNTIME_PROTOCOL_VERSION,
    sequence: 0,
    jobs: {},
    idempotencyIndex: {},
  };
}

function errorCode(error: unknown): string | undefined {
  return error && typeof error === "object" && "code" in error
    ? String((error as { code: unknown }).code)
    : undefined;
}

export class LocalRuntimeJournal {
  readonly #rootPromise: Promise<string>;
  readonly #lockTimeoutMs: number;
  readonly #staleLockMs: number;

  public constructor(options: LocalRuntimeOptions) {
    this.#rootPromise = this.#prepareRoot(options.root);
    this.#lockTimeoutMs = options.lockTimeoutMs ?? 20_000;
    this.#staleLockMs = options.staleLockMs ?? 120_000;
  }

  async #prepareRoot(input: string): Promise<string> {
    const root = path.resolve(input);
    await mkdir(path.join(root, "transactions"), { recursive: true });
    await mkdir(path.join(root, "locks"), { recursive: true });
    return realpath(root);
  }

  public async root(): Promise<string> {
    return this.#rootPromise;
  }

  async #readTransaction(sequence: number): Promise<RuntimeTransactionRecord> {
    const filePath = path.join(
      await this.root(),
      "transactions",
      transactionFileName(sequence),
    );
    return parseRuntimeTransactionText(
      await readFile(filePath, "utf8"),
      sequence,
    );
  }

  async #transactionSequences(): Promise<readonly number[]> {
    const entries = await readdir(path.join(await this.root(), "transactions"), {
      withFileTypes: true,
    });
    const sequences = entries
      .filter((entry) => entry.isFile() && /^\d{16}\.json$/.test(entry.name))
      .map((entry) => Number(entry.name.slice(0, 16)))
      .sort((left, right) => left - right);
    for (let index = 0; index < sequences.length; index += 1) {
      const expected = index + 1;
      const sequence = sequences[index];
      if (!Number.isSafeInteger(sequence) || sequence !== expected) {
        throw new RuntimeError(
          "RUNTIME_JOURNAL_SEQUENCE_GAP",
          `Runtime journal transaction sequence is not contiguous at ${expected}.`,
        );
      }
    }
    return sequences;
  }

  async #readAdvisoryHead(): Promise<ReturnType<typeof parseRuntimeJournalHeadText> | null> {
    try {
      return parseRuntimeJournalHeadText(
        await readFile(path.join(await this.root(), "head.json"), "utf8"),
      );
    } catch (error: unknown) {
      if (
        error instanceof RuntimeError ||
        errorCode(error) === "ENOENT"
      ) {
        return null;
      }
      throw error;
    }
  }

  async #latestTransaction(): Promise<RuntimeTransactionRecord | null> {
    const sequences = await this.#transactionSequences();
    const latestSequence = sequences.at(-1);
    if (latestSequence === undefined) return null;

    const transaction = await this.#readTransaction(latestSequence);
    const head = await this.#readAdvisoryHead();
    if (
      head &&
      head.sequence === transaction.sequence &&
      head.stateSha256 === transaction.stateSha256 &&
      head.transactionFile === transactionFileName(transaction.sequence)
    ) {
      return transaction;
    }

    // head.json is an advisory cache. A corrupt or stale head may be ignored,
    // but the highest immutable transaction must validate or recovery fails closed.
    return transaction;
  }

  public async snapshot(): Promise<RuntimeSnapshot> {
    const transaction = await this.#latestTransaction();
    return structuredClone(transaction?.snapshot ?? emptySnapshot());
  }

  public async transact<T>(
    mutate: (
      snapshot: MutableRuntimeSnapshot,
    ) => Promise<RuntimeMutationResult<T>> | RuntimeMutationResult<T>,
  ): Promise<T> {
    const root = await this.root();
    return withFileLock(
      root,
      "runtime-journal",
      async () => {
        const previous = await this.#latestTransaction();
        const snapshot = structuredClone(
          previous?.snapshot ?? emptySnapshot(),
        ) as MutableRuntimeSnapshot;
        const mutation = await mutate(snapshot);
        if (!mutation.changed) return mutation.result;

        const sequence = (previous?.sequence ?? 0) + 1;
        snapshot.sequence = sequence;
        const events: RuntimeEvent[] = mutation.events.map((event, index) => ({
          schemaVersion: "1.0",
          id: `event_${String(sequence).padStart(16, "0")}_${String(index).padStart(4, "0")}`,
          transactionSequence: sequence,
          eventIndex: index,
          type: event.type,
          at: event.at,
          actor: event.actor,
          ...(event.jobId === undefined ? {} : { jobId: event.jobId }),
          data: event.data,
        }));
        const immutableSnapshot = snapshot as RuntimeSnapshot;
        const transaction: RuntimeTransactionRecord = {
          schemaVersion: "1.0",
          protocolVersion: RUNTIME_PROTOCOL_VERSION,
          sequence,
          previousSequence: previous?.sequence ?? 0,
          stateSha256: runtimeSnapshotHash(immutableSnapshot),
          snapshot: immutableSnapshot,
          events,
        };
        const transactionPath = path.join(
          root,
          "transactions",
          transactionFileName(sequence),
        );
        await atomicWriteFile(
          transactionPath,
          serializeRuntimeTransaction(transaction),
        );
        await atomicWriteFile(
          path.join(root, "head.json"),
          serializeRuntimeJournalHead({
            schemaVersion: "1.0",
            sequence,
            stateSha256: transaction.stateSha256,
            transactionFile: transactionFileName(sequence),
          }),
        );
        return mutation.result;
      },
      {
        timeoutMs: this.#lockTimeoutMs,
        staleAfterMs: this.#staleLockMs,
      },
    );
  }

  public async events(
    afterTransactionSequence = 0,
  ): Promise<readonly RuntimeEvent[]> {
    if (
      !Number.isSafeInteger(afterTransactionSequence) ||
      afterTransactionSequence < 0
    ) {
      throw new RuntimeError(
        "RUNTIME_QUERY_INVALID",
        "Runtime event cursor must be a non-negative safe integer.",
      );
    }
    const sequences = (await this.#transactionSequences()).filter(
      (sequence) => sequence > afterTransactionSequence,
    );
    const events: RuntimeEvent[] = [];
    for (const sequence of sequences) {
      events.push(...(await this.#readTransaction(sequence)).events);
    }
    return structuredClone(events);
  }
}
