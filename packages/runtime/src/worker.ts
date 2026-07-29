import {
  normalizeJson,
  type ArtifactDescriptorInput,
  type ArtifactId,
  type StoredArtifact,
} from "@evavo/art-artifacts";

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
  type RuntimeWorkerOptions,
  type RuntimeWorkerRunResult,
} from "./types.js";

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
      "RUNTIME_WORKER_OPTIONS_INVALID",
      `${name} must be an integer between ${minimum} and ${maximum}.`,
    );
  }
  return result;
}

function abortError(message: string, code: string): RuntimeError {
  return new RuntimeError(code, message);
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
    return {
      classification: "cancelled",
      code: error.code,
      message: error.message,
    };
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

function mergedDescriptor(
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
  readonly #configuredHeartbeatIntervalMs?: number;

  public constructor(options: RuntimeWorkerOptions) {
    if (!options.worker.id.trim()) {
      throw new RuntimeError(
        "RUNTIME_WORKER_OPTIONS_INVALID",
        "Worker id is required.",
      );
    }
    this.#options = options;
    this.#concurrency = positiveInteger(
      options.concurrency,
      1,
      1,
      64,
      "concurrency",
    );
    this.#configuredHeartbeatIntervalMs = options.heartbeatIntervalMs;
    if (
      this.#configuredHeartbeatIntervalMs !== undefined &&
      (!Number.isInteger(this.#configuredHeartbeatIntervalMs) ||
        this.#configuredHeartbeatIntervalMs < 1_000 ||
        this.#configuredHeartbeatIntervalMs > 3_600_000)
    ) {
      throw new RuntimeError(
        "RUNTIME_WORKER_OPTIONS_INVALID",
        "heartbeatIntervalMs must be an integer between 1000 and 3600000.",
      );
    }
  }

  async #putResultArtifact(
    claimed: RuntimeClaimedJob,
    result: RuntimeHandlerResult,
  ): Promise<StoredArtifact | null> {
    if (result.result === undefined) return null;
    return this.#options.artifacts.put(
      `${JSON.stringify(normalizeJson(result.result), null, 2)}\n`,
      mergedDescriptor(claimed, {
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

  async #execute(
    claimed: RuntimeClaimedJob,
  ): Promise<"succeeded" | "failed" | "cancelled" | "paused"> {
    const runtime = this.#options.runtime;
    const workerId = this.#options.worker.id;
    const leaseToken = claimed.lease.token;
    let current = await runtime.start(claimed.job.id, leaseToken, workerId);
    const controller = new AbortController();
    let control: "cancel" | "pause" | null = null;
    let heartbeatError: unknown;
    let heartbeatChain: Promise<void> = Promise.resolve();
    const heartbeatIntervalMs = Math.max(
      1_000,
      Math.min(
        this.#configuredHeartbeatIntervalMs ??
          Math.floor(current.spec.leaseDurationMs / 3),
        Math.floor(current.spec.leaseDurationMs / 2),
      ),
    );

    const heartbeat = async (): Promise<RuntimeHeartbeatResult> => {
      const result = await runtime.heartbeat(
        current.id,
        leaseToken,
        workerId,
      );
      current = result.job;
      if (result.cancellationRequested) {
        control = "cancel";
        controller.abort(
          abortError("Cancellation requested.", "RUNTIME_JOB_CANCELLED"),
        );
      } else if (result.pauseRequested) {
        control = "pause";
        controller.abort(abortError("Pause requested.", "RUNTIME_JOB_PAUSED"));
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
    const executionTimeout = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => {
        const error = abortError(
          `Execution exceeded ${current.spec.timeoutMs} milliseconds.`,
          "RUNTIME_JOB_TIMEOUT",
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
          this.#options.artifacts.put(
            content,
            mergedDescriptor(claimed, descriptor),
          ),
      };
      const handlerResult = await Promise.race([
        handler(context),
        executionTimeout,
      ]);
      clearInterval(interval);
      await heartbeatChain;
      if (heartbeatError) throw heartbeatError;
      if (control === "cancel") {
        await runtime.cancel(current.id, workerId, { force: true });
        return "cancelled";
      }
      if (control === "pause") {
        await runtime.pause(current.id, workerId, { force: true });
        return "paused";
      }
      if (controller.signal.aborted) {
        throw controller.signal.reason ?? new CancelledRuntimeError();
      }

      const result = handlerResult ?? {};
      const resultArtifact = await this.#putResultArtifact(claimed, result);
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
      if (control === "cancel") {
        await runtime
          .cancel(current.id, workerId, { force: true })
          .catch(() => undefined);
        return "cancelled";
      }
      if (control === "pause") {
        await runtime
          .pause(current.id, workerId, { force: true })
          .catch(() => undefined);
        return "paused";
      }
      const failure = failureFor(heartbeatError ?? error);
      if (failure.classification === "cancelled") {
        await runtime
          .cancel(current.id, workerId, { force: true })
          .catch(() => undefined);
        return "cancelled";
      }
      await runtime
        .fail(current.id, leaseToken, failure, workerId)
        .catch(() => undefined);
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
    const outcomes = await Promise.all(
      claimed.map((entry) => this.#execute(entry)),
    );
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
    const maximumCycles = positiveInteger(
      options.maximumCycles,
      1_000,
      1,
      1_000_000,
      "maximumCycles",
    );
    const idleDelayMs = positiveInteger(
      options.idleDelayMs,
      250,
      1,
      60_000,
      "idleDelayMs",
    );
    const total = {
      claimed: 0,
      succeeded: 0,
      failed: 0,
      cancelled: 0,
      paused: 0,
    };
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
