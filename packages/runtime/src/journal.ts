import {
  atomicWriteFile,
  normalizeJson,
  sha256,
  stableStringify,
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

function transactionFileName(sequence: number): string {
  return `${String(sequence).padStart(16, "0")}.json`;
}

function emptySnapshot(): MutableRuntimeSnapshot {
  return {
    schemaVersion: "1.0",
    protocolVersion: RUNTIME_PROTOCOL_VERSION,
    sequence: 0,
    jobs: {},
    idempotencyIndex: {},
  };
}

function snapshotHash(snapshot: RuntimeSnapshot): string {
  return sha256(stableStringify(normalizeJson(snapshot)));
}

function parseTransaction(value: unknown): RuntimeTransactionRecord {
  if (!value || typeof value !== "object") {
    throw new RuntimeError(
      "RUNTIME_JOURNAL_INVALID",
      "Runtime transaction must be a JSON object.",
    );
  }
  const transaction = value as Partial<RuntimeTransactionRecord>;
  if (
    transaction.schemaVersion !== "1.0" ||
    transaction.protocolVersion !== RUNTIME_PROTOCOL_VERSION ||
    typeof transaction.sequence !== "number" ||
    typeof transaction.previousSequence !== "number" ||
    typeof transaction.stateSha256 !== "string" ||
    !transaction.snapshot ||
    !Array.isArray(transaction.events)
  ) {
    throw new RuntimeError(
      "RUNTIME_JOURNAL_INVALID",
      "Runtime transaction is missing required fields.",
    );
  }
  if (snapshotHash(transaction.snapshot) !== transaction.stateSha256) {
    throw new RuntimeError(
      "RUNTIME_JOURNAL_HASH_MISMATCH",
      `Runtime transaction ${transaction.sequence} failed snapshot verification.`,
    );
  }
  return transaction as RuntimeTransactionRecord;
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
    return parseTransaction(
      JSON.parse(await readFile(filePath, "utf8")) as unknown,
    );
  }

  async #latestTransaction(): Promise<RuntimeTransactionRecord | null> {
    const root = await this.root();
    try {
      const head = JSON.parse(
        await readFile(path.join(root, "head.json"), "utf8"),
      ) as unknown;
      if (
        head &&
        typeof head === "object" &&
        "sequence" in head &&
        Number.isInteger((head as { sequence: unknown }).sequence)
      ) {
        return await this.#readTransaction(
          Number((head as { sequence: unknown }).sequence),
        );
      }
    } catch {
      // Fall through to immutable transaction discovery.
    }

    const entries = await readdir(path.join(root, "transactions"), {
      withFileTypes: true,
    });
    const sequences = entries
      .filter((entry) => entry.isFile() && /^\d{16}\.json$/.test(entry.name))
      .map((entry) => Number(entry.name.slice(0, 16)))
      .sort((left, right) => right - left);
    let lastError: unknown;
    for (const sequence of sequences) {
      try {
        return await this.#readTransaction(sequence);
      } catch (error: unknown) {
        lastError = error;
      }
    }
    if (lastError) throw lastError;
    return null;
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
          stateSha256: snapshotHash(immutableSnapshot),
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
          `${JSON.stringify(transaction, null, 2)}\n`,
        );
        await atomicWriteFile(
          path.join(root, "head.json"),
          `${JSON.stringify(
            {
              schemaVersion: "1.0",
              sequence,
              stateSha256: transaction.stateSha256,
              transactionFile: transactionFileName(sequence),
            },
            null,
            2,
          )}\n`,
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
    const root = await this.root();
    const entries = await readdir(path.join(root, "transactions"), {
      withFileTypes: true,
    });
    const sequences = entries
      .filter((entry) => entry.isFile() && /^\d{16}\.json$/.test(entry.name))
      .map((entry) => Number(entry.name.slice(0, 16)))
      .filter((sequence) => sequence > afterTransactionSequence)
      .sort((left, right) => left - right);
    const events: RuntimeEvent[] = [];
    for (const sequence of sequences) {
      events.push(...(await this.#readTransaction(sequence)).events);
    }
    return events;
  }
}
