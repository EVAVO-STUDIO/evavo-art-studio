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

const SPEC_HASH = /^[a-f0-9]{64}$/;
const MAX_DELIVERY_IDENTIFIER_LENGTH = 256;
const MAX_DELIVERY_BATCH = 100;

type PgBossRuntimeDeliveryOptionsSnapshot = Readonly<{
  connection?: string | ConstructorOptions;
  client?: PgBossDeliveryClient;
  queuePrefix: string;
  heartbeatSeconds: number;
  notify: boolean;
  gracefulStopTimeoutMs: number;
}>;

type RuntimeDeliveryJobSnapshot = Readonly<{
  jobId: string;
  queue: string;
  specHash: string;
  priority: number;
  timeoutMs: number;
  notBefore?: string;
}>;

type RuntimeDeliveryWorkSnapshot = Readonly<{
  deliveryId: string;
  message: RuntimeDeliveryMessage;
  aborted: boolean;
}>;

type RuntimeSubscription = Readonly<{
  name: string;
  workId: string;
}>;

function deliveryError(code: string, message: string): never {
  throw new RuntimeError(code, message);
}

function deliveryRecord(
  value: unknown,
  name: string,
  code: string,
): Readonly<Record<string, unknown>> {
  let recordLike = false;
  try {
    recordLike =
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value);
  } catch {
    deliveryError(code, `${name} could not be inspected safely.`);
  }
  if (!recordLike) deliveryError(code, `${name} must be an object.`);
  return value as Readonly<Record<string, unknown>>;
}

function deliveryField(
  source: Readonly<Record<string, unknown>>,
  field: string,
  name: string,
  code: string,
): unknown {
  try {
    return source[field];
  } catch {
    deliveryError(code, `${name}.${field} could not be read safely.`);
  }
}

function deliveryName(value: unknown, name: string, code: string): string {
  try {
    return safeRuntimeName(value, name);
  } catch {
    deliveryError(code, `${name} must contain 1 to 128 safe characters.`);
  }
}

function deliveryInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
  name: string,
  code = "RUNTIME_DELIVERY_OPTIONS_INVALID",
): number {
  const result = value ?? fallback;
  if (
    typeof result !== "number" ||
    !Number.isSafeInteger(result) ||
    result < minimum ||
    result > maximum
  ) {
    deliveryError(
      code,
      `${name} must be an integer between ${minimum} and ${maximum}.`,
    );
  }
  return result;
}

function deliveryBoolean(
  value: unknown,
  fallback: boolean,
  name: string,
): boolean {
  const result = value ?? fallback;
  if (typeof result !== "boolean") {
    deliveryError(
      "RUNTIME_DELIVERY_OPTIONS_INVALID",
      `${name} must be a boolean.`,
    );
  }
  return result;
}

function deliveryTimestamp(
  value: unknown,
  name: string,
  code: string,
): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    deliveryError(code, `${name} must be a valid timestamp.`);
  }
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) {
    deliveryError(code, `${name} must be a valid timestamp.`);
  }
  return new Date(milliseconds).toISOString();
}

function deliveryClock(value: unknown): string {
  let milliseconds = Number.NaN;
  try {
    milliseconds = Date.prototype.getTime.call(value);
  } catch {
    deliveryError(
      "RUNTIME_DELIVERY_INPUT_INVALID",
      "Runtime delivery time must be a valid Date.",
    );
  }
  if (!Number.isFinite(milliseconds)) {
    deliveryError(
      "RUNTIME_DELIVERY_INPUT_INVALID",
      "Runtime delivery time must be a valid Date.",
    );
  }
  return new Date(milliseconds).toISOString();
}

function deliveryIdentifier(
  value: unknown,
  name: string,
  code = "RUNTIME_DELIVERY_INPUT_INVALID",
): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > MAX_DELIVERY_IDENTIFIER_LENGTH ||
    value.includes("\0")
  ) {
    deliveryError(
      code,
      `${name} must contain 1 to ${MAX_DELIVERY_IDENTIFIER_LENGTH} characters.`,
    );
  }
  return value;
}

function clientMethod(
  source: Readonly<Record<string, unknown>>,
  name: keyof PgBossDeliveryClient,
): Function {
  const value = deliveryField(
    source,
    name,
    "pg-boss client",
    "RUNTIME_DELIVERY_OPTIONS_INVALID",
  );
  if (typeof value !== "function") {
    deliveryError(
      "RUNTIME_DELIVERY_OPTIONS_INVALID",
      `pg-boss client.${name} must be a function.`,
    );
  }
  return value;
}

function snapshotClient(value: unknown): PgBossDeliveryClient {
  const source = deliveryRecord(
    value,
    "pg-boss client",
    "RUNTIME_DELIVERY_OPTIONS_INVALID",
  );
  const start = clientMethod(source, "start");
  const stop = clientMethod(source, "stop");
  const getQueue = clientMethod(source, "getQueue");
  const createQueue = clientMethod(source, "createQueue");
  const send = clientMethod(source, "send");
  const work = clientMethod(source, "work");
  const offWork = clientMethod(source, "offWork");
  const touch = clientMethod(source, "touch");
  const cancel = clientMethod(source, "cancel");
  const retry = clientMethod(source, "retry");

  const client: PgBossDeliveryClient = {
    async start() {
      return await Reflect.apply(start, value, []);
    },
    async stop(options) {
      await Reflect.apply(stop, value, [options]);
    },
    async getQueue(name) {
      return await Reflect.apply(getQueue, value, [name]);
    },
    async createQueue(name, options) {
      await Reflect.apply(createQueue, value, [name, options]);
    },
    async send(name, data, options) {
      return await Reflect.apply(send, value, [name, data, options]);
    },
    async work<T>(
      name: string,
      options: Readonly<Record<string, unknown>>,
      handler: (
        jobs: readonly Readonly<{ id: string; data: T; signal: AbortSignal }>[],
      ) => Promise<unknown>,
    ) {
      return await Reflect.apply(work, value, [
        name,
        options,
        handler,
      ]) as string;
    },
    async offWork(name, options) {
      await Reflect.apply(offWork, value, [name, options]);
    },
    async touch(name, id) {
      return await Reflect.apply(touch, value, [name, id]);
    },
    async cancel(name, id) {
      return await Reflect.apply(cancel, value, [name, id]);
    },
    async retry(name, id) {
      return await Reflect.apply(retry, value, [name, id]);
    },
  };
  return Object.freeze(client);
}

function snapshotConnection(value: unknown): string | ConstructorOptions {
  if (typeof value === "string") {
    if (!value || value.length > 32_768 || value.includes("\0")) {
      deliveryError(
        "RUNTIME_DELIVERY_OPTIONS_INVALID",
        "pg-boss connection must be a non-empty bounded string or options object.",
      );
    }
    return value;
  }
  return deliveryRecord(
    value,
    "pg-boss connection",
    "RUNTIME_DELIVERY_OPTIONS_INVALID",
  ) as unknown as ConstructorOptions;
}

function snapshotOptions(
  value: unknown,
): PgBossRuntimeDeliveryOptionsSnapshot {
  const source = deliveryRecord(
    value,
    "pg-boss delivery options",
    "RUNTIME_DELIVERY_OPTIONS_INVALID",
  );
  const clientInput = deliveryField(
    source,
    "client",
    "pg-boss delivery options",
    "RUNTIME_DELIVERY_OPTIONS_INVALID",
  );
  const connectionInput = deliveryField(
    source,
    "connection",
    "pg-boss delivery options",
    "RUNTIME_DELIVERY_OPTIONS_INVALID",
  );
  const prefixInput = deliveryField(
    source,
    "queuePrefix",
    "pg-boss delivery options",
    "RUNTIME_DELIVERY_OPTIONS_INVALID",
  );
  const heartbeatInput = deliveryField(
    source,
    "heartbeatSeconds",
    "pg-boss delivery options",
    "RUNTIME_DELIVERY_OPTIONS_INVALID",
  );
  const notifyInput = deliveryField(
    source,
    "notify",
    "pg-boss delivery options",
    "RUNTIME_DELIVERY_OPTIONS_INVALID",
  );
  const gracefulInput = deliveryField(
    source,
    "gracefulStopTimeoutMs",
    "pg-boss delivery options",
    "RUNTIME_DELIVERY_OPTIONS_INVALID",
  );

  const hasClient = clientInput !== undefined && clientInput !== null;
  const hasConnection = connectionInput !== undefined && connectionInput !== null;
  if (!hasClient && !hasConnection) {
    deliveryError(
      "RUNTIME_DELIVERY_OPTIONS_INVALID",
      "A pg-boss connection or client is required.",
    );
  }

  const client = hasClient ? snapshotClient(clientInput) : undefined;
  const connection = hasClient
    ? undefined
    : snapshotConnection(connectionInput);
  return Object.freeze({
    ...(client === undefined ? {} : { client }),
    ...(connection === undefined ? {} : { connection }),
    queuePrefix: deliveryName(
      prefixInput ?? "evavo-art",
      "queuePrefix",
      "RUNTIME_DELIVERY_OPTIONS_INVALID",
    ),
    heartbeatSeconds: deliveryInteger(
      heartbeatInput,
      30,
      10,
      3_600,
      "heartbeatSeconds",
    ),
    notify: deliveryBoolean(notifyInput, true, "notify"),
    gracefulStopTimeoutMs: deliveryInteger(
      gracefulInput,
      30_000,
      1_000,
      300_000,
      "gracefulStopTimeoutMs",
    ),
  });
}

function createClient(connection: string | ConstructorOptions): PgBossDeliveryClient {
  try {
    const boss =
    typeof connection === "string"
      ? new PgBoss(connection)
      : new PgBoss(connection);
  return snapshotClient(boss);
  } catch (error: unknown) {
    if (error instanceof RuntimeError) throw error;
    deliveryError(
      "RUNTIME_DELIVERY_OPTIONS_INVALID",
      "The pg-boss connection could not be initialized safely.",
    );
  }
}

function snapshotDeliveryJob(value: unknown): RuntimeDeliveryJobSnapshot {
  const code = "RUNTIME_DELIVERY_INPUT_INVALID";
  const source = deliveryRecord(value, "Runtime delivery job", code);
  const jobId = deliveryName(
    deliveryField(source, "id", "Runtime delivery job", code),
    "Runtime delivery job.id",
    code,
  );
  const specHashInput = deliveryField(
    source,
    "specHash",
    "Runtime delivery job",
    code,
  );
  if (typeof specHashInput !== "string" || !SPEC_HASH.test(specHashInput)) {
    deliveryError(code, "Runtime delivery job.specHash must be a SHA-256 hash.");
  }

  const spec = deliveryRecord(
    deliveryField(source, "spec", "Runtime delivery job", code),
    "Runtime delivery job.spec",
    code,
  );
  const specId = deliveryName(
    deliveryField(spec, "id", "Runtime delivery job.spec", code),
    "Runtime delivery job.spec.id",
    code,
  );
  if (specId !== jobId) {
    deliveryError(code, "Runtime delivery job and specification IDs must match.");
  }
  const queue = deliveryName(
    deliveryField(spec, "queue", "Runtime delivery job.spec", code),
    "Runtime delivery job.spec.queue",
    code,
  );
  const priority = deliveryInteger(
    deliveryField(spec, "priority", "Runtime delivery job.spec", code),
    0,
    -1_000,
    1_000,
    "Runtime delivery job.spec.priority",
    code,
  );
  const timeoutMs = deliveryInteger(
    deliveryField(spec, "timeoutMs", "Runtime delivery job.spec", code),
    900_000,
    1_000,
    86_400_000,
    "Runtime delivery job.spec.timeoutMs",
    code,
  );
  const notBefore = deliveryTimestamp(
    deliveryField(spec, "notBefore", "Runtime delivery job.spec", code),
    "Runtime delivery job.spec.notBefore",
    code,
  );

  return Object.freeze({
    jobId,
    queue,
    specHash: specHashInput,
    priority,
    timeoutMs,
    ...(notBefore === undefined ? {} : { notBefore }),
  });
}

function snapshotDeliveryMessage(
  value: unknown,
  expectedQueue: string,
): RuntimeDeliveryMessage {
  const code = "RUNTIME_DELIVERY_MESSAGE_INVALID";
  const source = deliveryRecord(value, "Runtime delivery message", code);
  const schemaVersion = deliveryField(
    source,
    "schemaVersion",
    "Runtime delivery message",
    code,
  );
  if (schemaVersion !== "1.0") {
    deliveryError(code, "Runtime delivery message schemaVersion must be 1.0.");
  }
  const jobId = deliveryName(
    deliveryField(source, "jobId", "Runtime delivery message", code),
    "Runtime delivery message.jobId",
    code,
  );
  const queue = deliveryName(
    deliveryField(source, "queue", "Runtime delivery message", code),
    "Runtime delivery message.queue",
    code,
  );
  if (queue !== expectedQueue) {
    deliveryError(
      code,
      `Runtime delivery message queue ${queue} does not match subscription ${expectedQueue}.`,
    );
  }
  const specHashInput = deliveryField(
    source,
    "specHash",
    "Runtime delivery message",
    code,
  );
  if (typeof specHashInput !== "string" || !SPEC_HASH.test(specHashInput)) {
    deliveryError(code, "Runtime delivery message.specHash must be a SHA-256 hash.");
  }
  const enqueuedAt = deliveryTimestamp(
    deliveryField(source, "enqueuedAt", "Runtime delivery message", code),
    "Runtime delivery message.enqueuedAt",
    code,
  );
  if (enqueuedAt === undefined) {
    deliveryError(code, "Runtime delivery message.enqueuedAt is required.");
  }
  return Object.freeze({
    schemaVersion: "1.0",
    jobId,
    queue,
    specHash: specHashInput,
    enqueuedAt,
  });
}

function snapshotWorkBatch(
  value: unknown,
  expectedQueue: string,
): readonly RuntimeDeliveryWorkSnapshot[] {
  const code = "RUNTIME_DELIVERY_MESSAGE_INVALID";
  let arrayLike = false;
  try {
    arrayLike = Array.isArray(value);
  } catch {
    deliveryError(code, "pg-boss delivery batch could not be inspected safely.");
  }
  if (!arrayLike) deliveryError(code, "pg-boss delivery batch must be an array.");

  const source = value as readonly unknown[];
  let length = 0;
  try {
    length = source.length;
  } catch {
    deliveryError(code, "pg-boss delivery batch length could not be read safely.");
  }
  if (!Number.isSafeInteger(length) || length < 0 || length > MAX_DELIVERY_BATCH) {
    deliveryError(
      code,
      `pg-boss delivery batch must contain no more than ${MAX_DELIVERY_BATCH} jobs.`,
    );
  }

  const snapshot: RuntimeDeliveryWorkSnapshot[] = [];
  for (let index = 0; index < length; index += 1) {
    let entryInput: unknown;
    try {
      entryInput = source[index];
    } catch {
      deliveryError(code, `pg-boss delivery batch[${index}] could not be read safely.`);
    }
    const entry = deliveryRecord(
      entryInput,
      `pg-boss delivery batch[${index}]`,
      code,
    );
    const deliveryId = deliveryIdentifier(
      deliveryField(entry, "id", `pg-boss delivery batch[${index}]`, code),
      `pg-boss delivery batch[${index}].id`,
      code,
    );
    const data = deliveryField(
      entry,
      "data",
      `pg-boss delivery batch[${index}]`,
      code,
    );
    const signalInput = deliveryField(
      entry,
      "signal",
      `pg-boss delivery batch[${index}]`,
      code,
    );
    let aborted: unknown;
    try {
      aborted = (signalInput as Readonly<{ aborted?: unknown }>).aborted;
    } catch {
      deliveryError(
        code,
        `pg-boss delivery batch[${index}].signal could not be read safely.`,
      );
    }
    if (typeof aborted !== "boolean") {
      deliveryError(
        code,
        `pg-boss delivery batch[${index}].signal.aborted must be a boolean.`,
      );
    }
    snapshot.push(Object.freeze({
      deliveryId,
      message: snapshotDeliveryMessage(data, expectedQueue),
      aborted,
    }));
  }
  return Object.freeze(snapshot);
}

function snapshotHandler(
  value: unknown,
): (message: RuntimeDeliveryMessage) => Promise<void> {
  if (typeof value !== "function") {
    deliveryError(
      "RUNTIME_DELIVERY_INPUT_INVALID",
      "Runtime delivery handler must be a function.",
    );
  }
  return value as (message: RuntimeDeliveryMessage) => Promise<void>;
}

export class PgBossRuntimeDelivery implements RuntimeDeliveryAdapter {
  readonly #client: PgBossDeliveryClient;
  readonly #prefix: string;
  readonly #heartbeatSeconds: number;
  readonly #notify: boolean;
  readonly #gracefulStopTimeoutMs: number;
  readonly #preparedQueues = new Set<string>();
  readonly #queuePreparations = new Map<string, Promise<string>>();
  readonly #subscriptions = new Map<string, RuntimeSubscription>();
  readonly #subscriptionOperations = new Map<string, Promise<string>>();
  readonly #unsubscriptionOperations = new Map<string, Promise<void>>();
  readonly #inFlight = new Set<Promise<unknown>>();
  #started = false;
  #stopping = false;
  #startPromise: Promise<void> | null = null;
  #stopPromise: Promise<void> | null = null;

  public constructor(options: PgBossRuntimeDeliveryOptions) {
    const snapshot = snapshotOptions(options);
    this.#client = snapshot.client ?? createClient(snapshot.connection!);
    this.#prefix = snapshot.queuePrefix;
    this.#heartbeatSeconds = snapshot.heartbeatSeconds;
    this.#notify = snapshot.notify;
    this.#gracefulStopTimeoutMs = snapshot.gracefulStopTimeoutMs;
  }

  #track<T>(operation: Promise<T>): Promise<T> {
    this.#inFlight.add(operation);
    void operation
      .finally(() => this.#inFlight.delete(operation))
      .catch(() => undefined);
    return operation;
  }

  #assertAvailable(): void {
    if (!this.#started) {
      throw new RuntimeError(
        "RUNTIME_DELIVERY_NOT_STARTED",
        "pg-boss delivery must be started before use.",
      );
    }
    if (this.#stopping) {
      throw new RuntimeError(
        "RUNTIME_DELIVERY_STOPPING",
        "pg-boss delivery is stopping and cannot accept new work.",
      );
    }
  }

  #name(queue: string): string {
    return `${this.#prefix}.${queue}`;
  }

  async #ensureQueue(queue: string): Promise<string> {
    this.#assertAvailable();
    const name = this.#name(queue);
    if (this.#preparedQueues.has(name)) return name;
    const existing = this.#queuePreparations.get(name);
    if (existing) return existing;

    const operation = (async () => {
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
    })();
    this.#queuePreparations.set(name, operation);
    try {
      return await operation;
    } finally {
      if (this.#queuePreparations.get(name) === operation) {
        this.#queuePreparations.delete(name);
      }
    }
  }

  async #unsubscribeInternal(queue: string): Promise<void> {
    const pendingSubscription = this.#subscriptionOperations.get(queue);
    if (pendingSubscription) {
      await pendingSubscription.catch(() => undefined);
    }
    const subscription = this.#subscriptions.get(queue);
    if (!subscription) return;

    const existing = this.#unsubscriptionOperations.get(queue);
    if (existing) return existing;
    const operation = (async () => {
      await this.#client.offWork(subscription.name, { wait: true });
      this.#subscriptions.delete(queue);
    })();
    this.#unsubscriptionOperations.set(queue, operation);
    try {
      await operation;
    } finally {
      if (this.#unsubscriptionOperations.get(queue) === operation) {
        this.#unsubscriptionOperations.delete(queue);
      }
    }
  }

  public async start(): Promise<void> {
    if (this.#started && !this.#stopping) return;
    if (this.#stopPromise) {
      await this.#stopPromise;
      return this.start();
    }
    if (this.#startPromise) return this.#startPromise;

    const operation = (async () => {
      await this.#client.start();
      this.#started = true;
    })();
    this.#startPromise = operation;
    try {
      await operation;
    } finally {
      if (this.#startPromise === operation) this.#startPromise = null;
    }
  }

  public async stop(): Promise<void> {
    if (this.#stopPromise) return this.#stopPromise;
    const operation = (async () => {
      if (this.#startPromise) await this.#startPromise;
      if (!this.#started) return;
      this.#stopping = true;
      await Promise.allSettled([...this.#inFlight]);
      for (const queue of [...this.#subscriptions.keys()].sort()) {
        await this.#unsubscribeInternal(queue);
      }
      await this.#client.stop({
        graceful: true,
        timeout: this.#gracefulStopTimeoutMs,
      });
      this.#started = false;
      this.#preparedQueues.clear();
      this.#queuePreparations.clear();
      this.#subscriptionOperations.clear();
      this.#unsubscriptionOperations.clear();
    })();
    this.#stopPromise = operation;
    try {
      await operation;
    } finally {
      this.#stopping = false;
      if (this.#stopPromise === operation) this.#stopPromise = null;
    }
  }

  public async publish(
    jobInput: RuntimeJobRecord,
    nowInput = new Date(),
  ): Promise<string | null> {
    const job = snapshotDeliveryJob(jobInput);
    const enqueuedAt = deliveryClock(nowInput);
    this.#assertAvailable();
    const operation = (async () => {
      const name = await this.#ensureQueue(job.queue);
      const message: RuntimeDeliveryMessage = Object.freeze({
        schemaVersion: "1.0",
        jobId: job.jobId,
        queue: job.queue,
        specHash: job.specHash,
        enqueuedAt,
      });
      const deliveryId = await this.#client.send(
        name,
        normalizeJson(message) as object,
        {
          singletonKey: job.jobId,
          priority: job.priority,
          retryLimit: 0,
          expireInSeconds: Math.max(1, Math.ceil(job.timeoutMs / 1_000)),
          heartbeatSeconds: this.#heartbeatSeconds,
          deadLetter: `${name}.dead-letter`,
          ...(job.notBefore ? { startAfter: job.notBefore } : {}),
        },
      );
      return deliveryId === null
        ? null
        : deliveryIdentifier(
            deliveryId,
            "pg-boss delivery ID",
            "RUNTIME_DELIVERY_MESSAGE_INVALID",
          );
    })();
    return this.#track(operation);
  }

  public async subscribe(
    queueInput: string,
    handlerInput: (message: RuntimeDeliveryMessage) => Promise<void>,
  ): Promise<string> {
    const queue = deliveryName(
      queueInput,
      "queue",
      "RUNTIME_DELIVERY_INPUT_INVALID",
    );
    const handler = snapshotHandler(handlerInput);
    this.#assertAvailable();
    if (
      this.#subscriptions.has(queue) ||
      this.#subscriptionOperations.has(queue)
    ) {
      throw new RuntimeError(
        "RUNTIME_DELIVERY_ALREADY_SUBSCRIBED",
        `A worker is already subscribed to queue ${queue}.`,
      );
    }

    const operation = (async () => {
      const name = await this.#ensureQueue(queue);
      const rawWorkId = await this.#client.work<RuntimeDeliveryMessage>(
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
        async (jobsInput) => {
          const jobs = snapshotWorkBatch(jobsInput, queue);
          for (const job of jobs) {
            if (job.aborted) {
              throw new RuntimeError(
                "RUNTIME_DELIVERY_ABORTED",
                `pg-boss delivery ${job.deliveryId} was aborted.`,
              );
            }
            await handler(job.message);
          }
        },
      );
      const workId = deliveryIdentifier(
        rawWorkId,
        "pg-boss work ID",
        "RUNTIME_DELIVERY_MESSAGE_INVALID",
      );
      this.#subscriptions.set(queue, Object.freeze({ name, workId }));
      return workId;
    })();
    this.#subscriptionOperations.set(queue, operation);
    const tracked = this.#track(operation);
    try {
      return await tracked;
    } finally {
      if (this.#subscriptionOperations.get(queue) === operation) {
        this.#subscriptionOperations.delete(queue);
      }
    }
  }

  public async unsubscribe(queueInput: string): Promise<void> {
    const queue = deliveryName(
      queueInput,
      "queue",
      "RUNTIME_DELIVERY_INPUT_INVALID",
    );
    if (this.#stopping) {
      if (this.#stopPromise) await this.#stopPromise;
      return;
    }
    if (!this.#started) return;
    return this.#track(this.#unsubscribeInternal(queue));
  }

  public async touch(queueInput: string, deliveryIdInput: string): Promise<void> {
    const queue = deliveryName(
      queueInput,
      "queue",
      "RUNTIME_DELIVERY_INPUT_INVALID",
    );
    const deliveryId = deliveryIdentifier(deliveryIdInput, "delivery ID");
    this.#assertAvailable();
    await this.#track(this.#client.touch(this.#name(queue), deliveryId));
  }

  public async cancel(queueInput: string, deliveryIdInput: string): Promise<void> {
    const queue = deliveryName(
      queueInput,
      "queue",
      "RUNTIME_DELIVERY_INPUT_INVALID",
    );
    const deliveryId = deliveryIdentifier(deliveryIdInput, "delivery ID");
    this.#assertAvailable();
    await this.#track(this.#client.cancel(this.#name(queue), deliveryId));
  }

  public async retry(queueInput: string, deliveryIdInput: string): Promise<void> {
    const queue = deliveryName(
      queueInput,
      "queue",
      "RUNTIME_DELIVERY_INPUT_INVALID",
    );
    const deliveryId = deliveryIdentifier(deliveryIdInput, "delivery ID");
    this.#assertAvailable();
    await this.#track(this.#client.retry(this.#name(queue), deliveryId));
  }
}
