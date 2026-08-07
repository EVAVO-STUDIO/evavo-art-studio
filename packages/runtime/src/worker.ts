import {
  normalizeJson,
  type ArtifactDescriptorInput,
  type ArtifactId,
  type StoredArtifact,
} from "@evavo/art-artifacts";

import { normalizeRuntimeWorkerDescriptor } from "./normalize.js";

import {
  CancelledRuntimeError,
  PermanentRuntimeError,
  RuntimeError,
  TransientRuntimeError,
  type RuntimeClaimedJob,
  type RuntimeFailureInput,
  type RuntimeHandlerContext,
  type RuntimeHandlerResult,
  type RuntimeHeartbeatResult,
  type RuntimeJobRecord,
  type RuntimeWorkerOptions,
  type RuntimeWorkerRunResult,
} from "./types.js";

function boundedInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  name: string,
): number {
  const result = value ?? fallback;
  if (!Number.isInteger(result) || result < minimum || result > maximum) {
    throw new RuntimeError(
      "RUNTIME_WORKER_OPTIONS_INVALID",
      `${name} must be an integer between ${minimum} and ${maximum}.`,
    );
  }
  return result;
}

function failureFor(error: unknown): RuntimeFailureInput {
  if (error instanceof TransientRuntimeError) {
    return {
      classification: "transient",
      code: error.code,
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details }),
    };
  }
  if (error instanceof PermanentRuntimeError) {
    return {
      classification: "permanent",
      code: error.code,
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details }),
    };
  }
  if (error instanceof CancelledRuntimeError) {
    return { classification: "cancelled", code: error.code, message: error.message };
  }
  if (error instanceof RuntimeError) {
    if (error.code === "RUNTIME_JOB_TIMEOUT") {
      return { classification: "timeout", code: error.code, message: error.message };
    }
    if (error.code === "RUNTIME_JOB_DEADLINE_EXCEEDED") {
      return {
        classification: "deadline-exceeded",
        code: error.code,
        message: error.message,
      };
    }
    if (
      error.code === "RUNTIME_LEASE_EXPIRED" ||
      error.code === "RUNTIME_LEASE_TOKEN_INVALID" ||
      error.code === "RUNTIME_LEASE_STATE_INVALID"
    ) {
      return {
        classification: "lease-expired",
        code: error.code,
        message: error.message,
      };
    }
    return { classification: "permanent", code: error.code, message: error.message };
  }
  return {
    classification: "permanent",
    code: "RUNTIME_HANDLER_UNEXPECTED_ERROR",
    message: error instanceof Error ? error.message : String(error),
  };
}

function descriptorFor(
  claimed: RuntimeClaimedJob,
  descriptor: ArtifactDescriptorInput,
): ArtifactDescriptorInput {
  const sourceArtifacts = [
    ...new Set([
      ...claimed.job.spec.inputArtifacts,
      ...(descriptor.sourceArtifacts ?? []),
    ]),
  ].sort() as readonly ArtifactId[];
  return {
    ...descriptor,
    sourceArtifacts,
    labels: {
      ...(descriptor.labels ?? {}),
      runtimeJobId: claimed.job.id,
      runtimeAttempt: String(claimed.job.attempts.length),
      runtimeQueue: claimed.job.spec.queue,
      runtimeKind: claimed.job.spec.kind,
    },
  };
}

export class RuntimeWorker {
  readonly #options: RuntimeWorkerOptions;
  readonly #concurrency: number;
  readonly #heartbeatIntervalMs: number | undefined;

  public constructor(options: RuntimeWorkerOptions) {
    this.#options = {
      ...options,
      worker: normalizeRuntimeWorkerDescriptor(options.worker),
    };
    this.#concurrency = boundedInteger(options.concurrency, 1, 1, 64, "concurrency");
    this.#heartbeatIntervalMs = options.heartbeatIntervalMs;
    if (
      this.#heartbeatIntervalMs !== undefined &&
      (!Number.isInteger(this.#heartbeatIntervalMs) ||
        this.#heartbeatIntervalMs < 1_000 ||
        this.#heartbeatIntervalMs > 3_600_000)
    ) {
      throw new RuntimeError(
        "RUNTIME_WORKER_OPTIONS_INVALID",
        "heartbeatIntervalMs must be an integer between 1000 and 3600000.",
      );
    }
  }

  async #resultArtifact(
    claimed: RuntimeClaimedJob,
    result: RuntimeHandlerResult,
  ): Promise<StoredArtifact | null> {
    if (result.result === undefined) return null;
    return this.#options.artifacts.put(
      `${JSON.stringify(normalizeJson(result.result), null, 2)}\n`,
      descriptorFor(claimed, {
        mediaType: "application/json",
        storageClass: "evidence",
        fileName: `${claimed.job.id}.result.json`,
        labels: { runtimeResult: "true" },
        metadata: {
          jobId: claimed.job.id,
          attempt: claimed.job.attempts.length,
          specHash: claimed.job.specHash,
        },
      }),
    );
  }

  async #applyControl(
    job: RuntimeJobRecord,
    control: "cancel" | "pause",
  ): Promise<"cancelled" | "paused"> {
    if (control === "cancel") {
      await this.#options.runtime.cancel(job.id, this.#options.worker.id, { force: true });
      return "cancelled";
    }
    await this.#options.runtime.pause(job.id, this.#options.worker.id, { force: true });
    return "paused";
  }

  async #execute(
    claimed: RuntimeClaimedJob,
  ): Promise<"succeeded" | "failed" | "cancelled" | "paused"> {
    const runtime = this.#options.runtime;
    const workerId = this.#options.worker.id;
    const leaseToken = claimed.lease.token;
    let current = claimed.job;
    try {
      current = await runtime.start(current.id, leaseToken, workerId);
    } catch (error: unknown) {
      const latest = await runtime.get(current.id);
      if (latest?.cancellationRequestedAt) return this.#applyControl(latest, "cancel");
      if (latest?.pauseRequestedAt) return this.#applyControl(latest, "pause");
      await runtime
        .fail(current.id, leaseToken, failureFor(error), workerId)
        .catch(() => undefined);
      return "failed";
    }

    const controller = new AbortController();
    let control: "cancel" | "pause" | null = null;
    let heartbeatError: unknown;
    let heartbeatChain: Promise<void> = Promise.resolve();
    const heartbeatIntervalMs = Math.max(
      1_000,
      Math.min(
        this.#heartbeatIntervalMs ?? Math.floor(current.spec.leaseDurationMs / 3),
        Math.floor(current.spec.leaseDurationMs / 2),
      ),
    );

    const heartbeat = async (): Promise<RuntimeHeartbeatResult> => {
      const result = await runtime.heartbeat(current.id, leaseToken, workerId);
      current = result.job;
      if (result.cancellationRequested) {
        control = "cancel";
        controller.abort(new CancelledRuntimeError("Cancellation requested."));
      } else if (result.pauseRequested) {
        control = "pause";
        controller.abort(new RuntimeError("RUNTIME_JOB_PAUSED", "Pause requested."));
      }
      return result;
    };

    const interval = setInterval(() => {
      heartbeatChain = heartbeatChain
        .then(async () => {
          await heartbeat();
        })
        .catch((error: unknown) => {
          heartbeatError = error;
          controller.abort(error);
        });
    }, heartbeatIntervalMs);
    interval.unref?.();

    let timeout: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => {
        const error = new RuntimeError(
          "RUNTIME_JOB_TIMEOUT",
          `Execution exceeded ${current.spec.timeoutMs} milliseconds.`,
        );
        controller.abort(error);
        reject(error);
      }, current.spec.timeoutMs);
      timeout.unref?.();
    });

    try {
      const handler = this.#options.handlers[current.spec.kind];
      if (!handler) {
        throw new PermanentRuntimeError(
          "RUNTIME_HANDLER_NOT_REGISTERED",
          `No handler is registered for job kind ${current.spec.kind}.`,
        );
      }
      const context: RuntimeHandlerContext = {
        job: current,
        signal: controller.signal,
        artifacts: this.#options.artifacts,
        heartbeat,
        cancellationRequested: () => runtime.cancellationRequested(current.id),
        putArtifact: (content, descriptor) =>
          this.#options.artifacts.put(content, descriptorFor(claimed, descriptor)),
      };
      const handlerResult = await Promise.race([handler(context), timeoutPromise]);
      clearInterval(interval);
      await heartbeatChain;
      if (heartbeatError) throw heartbeatError;
      if (control) return this.#applyControl(current, control);
      if (controller.signal.aborted) {
        throw controller.signal.reason ?? new CancelledRuntimeError();
      }

      const result = handlerResult ?? {};
      const resultArtifact = await this.#resultArtifact(claimed, result);
      const outputArtifacts = [
        ...new Set([
          ...(result.outputArtifacts ?? []),
          ...(resultArtifact ? [resultArtifact.artifactId] : []),
        ]),
      ].sort() as readonly ArtifactId[];
      const completed = await runtime.complete(
        current.id,
        leaseToken,
        outputArtifacts,
        workerId,
      );
      if (completed.state === "cancelled") return "cancelled";
      if (completed.state === "paused") return "paused";
      return "succeeded";
    } catch (error: unknown) {
      clearInterval(interval);
      await heartbeatChain.catch(() => undefined);
      if (control) return this.#applyControl(current, control).catch(() => control === "cancel" ? "cancelled" : "paused");
      const failure = failureFor(heartbeatError ?? error);
      if (failure.classification === "cancelled") {
        await runtime.cancel(current.id, workerId, { force: true }).catch(() => undefined);
        return "cancelled";
      }
      await runtime.fail(current.id, leaseToken, failure, workerId).catch(() => undefined);
      return "failed";
    } finally {
      clearInterval(interval);
      if (timeout) clearTimeout(timeout);
    }
  }

  public async runOnce(): Promise<RuntimeWorkerRunResult> {
    await this.#options.runtime.recoverExpiredLeases(
      `${this.#options.worker.id}:recovery`,
    );
    const claimed = await this.#options.runtime.claim({
      worker: this.#options.worker,
      maximumJobs: this.#concurrency,
    });
    const outcomes = await Promise.all(claimed.map((entry) => this.#execute(entry)));
    return {
      claimed: claimed.length,
      succeeded: outcomes.filter((entry) => entry === "succeeded").length,
      failed: outcomes.filter((entry) => entry === "failed").length,
      cancelled: outcomes.filter((entry) => entry === "cancelled").length,
      paused: outcomes.filter((entry) => entry === "paused").length,
    };
  }

  public async runUntilIdle(
    options: Readonly<{ maximumCycles?: number; idleDelayMs?: number }> = {},
  ): Promise<RuntimeWorkerRunResult> {
    const maximumCycles = boundedInteger(
      options.maximumCycles,
      1_000,
      1,
      1_000_000,
      "maximumCycles",
    );
    const idleDelayMs = boundedInteger(
      options.idleDelayMs,
      250,
      1,
      60_000,
      "idleDelayMs",
    );
    const total = { claimed: 0, succeeded: 0, failed: 0, cancelled: 0, paused: 0 };
    for (let cycle = 0; cycle < maximumCycles; cycle += 1) {
      const result = await this.runOnce();
      total.claimed += result.claimed;
      total.succeeded += result.succeeded;
      total.failed += result.failed;
      total.cancelled += result.cancelled;
      total.paused += result.paused;
      if (result.claimed === 0) return total;
      await new Promise((resolve) => setTimeout(resolve, idleDelayMs));
    }
    throw new RuntimeError(
      "RUNTIME_WORKER_CYCLE_LIMIT",
      `Worker did not become idle within ${maximumCycles} cycles.`,
    );
  }
}
