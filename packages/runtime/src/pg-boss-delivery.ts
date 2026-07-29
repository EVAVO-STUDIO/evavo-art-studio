import { PgBoss, type ConstructorOptions } from "pg-boss";

import { normalizeJson } from "@evavo/art-artifacts";

import { safeRuntimeName } from "./normalize.js";
import {
  RuntimeError,
  type RuntimeDeliveryAdapter,
  type RuntimeDeliveryMessage,
  type RuntimeJobRecord,
} from "./types.js";

export interface PgBossDeliveryClient {
  start(): Promise<unknown>;
  stop(options?: Readonly<{ graceful?: boolean; timeout?: number }>): Promise<void>;
  getQueue(name: string): Promise<unknown | null>;
  createQueue(
    name: string,
    options?: Readonly<Record<string, unknown>>,
  ): Promise<void>;
  send(
    name: string,
    data: object,
    options?: Readonly<Record<string, unknown>>,
  ): Promise<string | null>;
  work<T>(
    name: string,
    options: Readonly<Record<string, unknown>>,
    handler: (
      jobs: readonly Readonly<{ id: string; data: T; signal: AbortSignal }>[],
    ) => Promise<unknown>,
  ): Promise<string>;
  offWork(
    name: string,
    options?: Readonly<{ wait?: boolean }>,
  ): Promise<void>;
  touch(name: string, id: string): Promise<unknown>;
  cancel(name: string, id: string): Promise<unknown>;
  retry(name: string, id: string): Promise<unknown>;
}

export interface PgBossRuntimeDeliveryOptions {
  readonly connection?: string | ConstructorOptions;
  readonly client?: PgBossDeliveryClient;
  readonly queuePrefix?: string;
  readonly heartbeatSeconds?: number;
  readonly notify?: boolean;
  readonly gracefulStopTimeoutMs?: number;
}

function positiveInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  name: string,
): number {
  const result = value ?? fallback;
  if (!Number.isInteger(result) || result < minimum || result > maximum) {
    throw new RuntimeError(
      "RUNTIME_DELIVERY_OPTIONS_INVALID",
      `${name} must be an integer between ${minimum} and ${maximum}.`,
    );
  }
  return result;
}

function createClient(connection: string | ConstructorOptions): PgBossDeliveryClient {
  const boss =
    typeof connection === "string"
      ? new PgBoss(connection)
      : new PgBoss(connection);
  return boss as unknown as PgBossDeliveryClient;
}

export class PgBossRuntimeDelivery implements RuntimeDeliveryAdapter {
  readonly #client: PgBossDeliveryClient;
  readonly #prefix: string;
  readonly #heartbeatSeconds: number;
  readonly #notify: boolean;
  readonly #gracefulStopTimeoutMs: number;
  readonly #preparedQueues = new Set<string>();
  readonly #subscriptions = new Map<string, string>();
  #started = false;

  public constructor(options: PgBossRuntimeDeliveryOptions) {
    if (!options.client && !options.connection) {
      throw new RuntimeError(
        "RUNTIME_DELIVERY_OPTIONS_INVALID",
        "A pg-boss connection or client is required.",
      );
    }
    this.#client = options.client ?? createClient(options.connection!);
    this.#prefix = safeRuntimeName(
      options.queuePrefix ?? "evavo-art",
      "queuePrefix",
    );
    this.#heartbeatSeconds = positiveInteger(
      options.heartbeatSeconds,
      30,
      10,
      3_600,
      "heartbeatSeconds",
    );
    this.#notify = options.notify ?? true;
    this.#gracefulStopTimeoutMs = positiveInteger(
      options.gracefulStopTimeoutMs,
      30_000,
      1_000,
      300_000,
      "gracefulStopTimeoutMs",
    );
  }

  #name(queue: string): string {
    return `${this.#prefix}.${safeRuntimeName(queue, "queue")}`;
  }

  async #ensureQueue(queue: string): Promise<string> {
    if (!this.#started) {
      throw new RuntimeError(
        "RUNTIME_DELIVERY_NOT_STARTED",
        "pg-boss delivery must be started before use.",
      );
    }
    const name = this.#name(queue);
    if (this.#preparedQueues.has(name)) return name;
    const deadLetter = `${name}.dead-letter`;
    if (!(await this.#client.getQueue(deadLetter))) {
      await this.#client.createQueue(deadLetter, {
        policy: "standard",
        warningQueueSize: 1_000,
      });
    }
    if (!(await this.#client.getQueue(name))) {
      await this.#client.createQueue(name, {
        policy: "key_strict_fifo",
        deadLetter,
        heartbeatSeconds: this.#heartbeatSeconds,
        notify: this.#notify,
        warningQueueSize: 1_000,
      });
    }
    this.#preparedQueues.add(name);
    return name;
  }

  public async start(): Promise<void> {
    if (this.#started) return;
    await this.#client.start();
    this.#started = true;
  }

  public async stop(): Promise<void> {
    if (!this.#started) return;
    for (const queue of [...this.#subscriptions.keys()]) {
      await this.unsubscribe(queue);
    }
    await this.#client.stop({
      graceful: true,
      timeout: this.#gracefulStopTimeoutMs,
    });
    this.#started = false;
    this.#preparedQueues.clear();
  }

  public async publish(job: RuntimeJobRecord, now = new Date()): Promise<string | null> {
    const name = await this.#ensureQueue(job.spec.queue);
    const message: RuntimeDeliveryMessage = {
      schemaVersion: "1.0",
      jobId: job.id,
      queue: job.spec.queue,
      specHash: job.specHash,
      enqueuedAt: now.toISOString(),
    };
    return this.#client.send(
      name,
      normalizeJson(message) as object,
      {
        singletonKey: job.id,
        priority: job.spec.priority,
        retryLimit: 0,
        expireInSeconds: Math.max(1, Math.ceil(job.spec.timeoutMs / 1_000)),
        heartbeatSeconds: this.#heartbeatSeconds,
        deadLetter: `${name}.dead-letter`,
        ...(job.spec.notBefore ? { startAfter: job.spec.notBefore } : {}),
      },
    );
  }

  public async subscribe(
    queue: string,
    handler: (message: RuntimeDeliveryMessage) => Promise<void>,
  ): Promise<string> {
    const name = await this.#ensureQueue(queue);
    if (this.#subscriptions.has(queue)) {
      throw new RuntimeError(
        "RUNTIME_DELIVERY_ALREADY_SUBSCRIBED",
        `A worker is already subscribed to queue ${queue}.`,
      );
    }
    const workId = await this.#client.work<RuntimeDeliveryMessage>(
      name,
      {
        batchSize: 1,
        pollingIntervalSeconds: 2,
        notifyPollingIntervalSeconds: 30,
        heartbeatRefreshSeconds: Math.max(
          5,
          Math.floor(this.#heartbeatSeconds / 2),
        ),
      },
      async (jobs) => {
        for (const job of jobs) {
          if (job.signal.aborted) {
            throw job.signal.reason ?? new Error("pg-boss delivery was aborted.");
          }
          const message = normalizeJson(job.data) as unknown as RuntimeDeliveryMessage;
          if (
            message.schemaVersion !== "1.0" ||
            !message.jobId ||
            !message.queue ||
            !message.specHash
          ) {
            throw new RuntimeError(
              "RUNTIME_DELIVERY_MESSAGE_INVALID",
              `Delivery ${job.id} contains an invalid runtime message.`,
            );
          }
          await handler(message);
        }
      },
    );
    this.#subscriptions.set(queue, workId);
    return workId;
  }

  public async unsubscribe(queue: string): Promise<void> {
    const workId = this.#subscriptions.get(queue);
    if (!workId) return;
    await this.#client.offWork(this.#name(queue), { wait: true });
    this.#subscriptions.delete(queue);
  }

  public async touch(queue: string, deliveryId: string): Promise<void> {
    await this.#client.touch(this.#name(queue), deliveryId);
  }

  public async cancel(queue: string, deliveryId: string): Promise<void> {
    await this.#client.cancel(this.#name(queue), deliveryId);
  }

  public async retry(queue: string, deliveryId: string): Promise<void> {
    await this.#client.retry(this.#name(queue), deliveryId);
  }
}
