import {
  normalizeJson,
  sha256,
  stableStringify,
  type ArtifactId,
  type JsonValue,
} from "@evavo/art-artifacts";

import {
  RuntimeError,
  type NormalizedRuntimeJobSpec,
  type RuntimeJobRecord,
  type RuntimeJobState,
  type RuntimeJobSubmission,
  type RuntimeWorkerCapabilityProfile,
  type RuntimeWorkerDescriptor,
} from "./types.js";

const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const TERMINAL_STATES = new Set<RuntimeJobState>([
  "succeeded",
  "failed",
  "cancelled",
  "blocked",
  "dead-letter",
]);

function integer(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  name: string,
): number {
  const result = value ?? fallback;
  if (!Number.isInteger(result) || result < minimum || result > maximum) {
    throw new RuntimeError(
      "RUNTIME_JOB_SPEC_INVALID",
      `${name} must be an integer between ${minimum} and ${maximum}.`,
    );
  }
  return result;
}

function finite(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  name: string,
): number {
  const result = value ?? fallback;
  if (!Number.isFinite(result) || result < minimum || result > maximum) {
    throw new RuntimeError(
      "RUNTIME_JOB_SPEC_INVALID",
      `${name} must be between ${minimum} and ${maximum}.`,
    );
  }
  return result;
}

function safeName(
  value: unknown,
  name: string,
  code: string,
): string {
  if (typeof value !== "string") {
    throw new RuntimeError(
      code,
      `${name} must be a string containing 1 to 128 safe characters.`,
    );
  }
  const result = value.trim();
  if (!SAFE_NAME.test(result)) {
    throw new RuntimeError(
      code,
      `${name} must be 1 to 128 safe characters.`,
    );
  }
  return result;
}

export function safeRuntimeName(value: string, name: string): string {
  return safeName(value, name, "RUNTIME_JOB_SPEC_INVALID");
}

function normalizedCapabilityList(
  values: unknown,
  name: string,
  code: string,
  maximum = 256,
): readonly string[] {
  if (!Array.isArray(values) || values.length > maximum) {
    throw new RuntimeError(
      code,
      `${name} must contain no more than ${maximum} capabilities.`,
    );
  }
  return [...new Set(values.map((entry: unknown, index: number) => {
    if (typeof entry !== "string") {
      throw new RuntimeError(
        code,
        `${name}[${index}] must be a string capability.`,
      );
    }
    return safeName(entry, `${name}[${index}]`, code);
  }))].sort();
}

export function normalizeRuntimeWorkerDescriptor(
  input: RuntimeWorkerDescriptor,
): RuntimeWorkerDescriptor {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new RuntimeError(
      "RUNTIME_WORKER_OPTIONS_INVALID",
      "Worker descriptor must be an object.",
    );
  }
  const id = safeName(
    input.id,
    "worker.id",
    "RUNTIME_WORKER_OPTIONS_INVALID",
  );
  const capabilities = normalizedCapabilityList(
    input.capabilities,
    "worker.capabilities",
    "RUNTIME_WORKER_OPTIONS_INVALID",
    512,
  );
  const queues = input.queues === undefined
    ? undefined
    : normalizedCapabilityList(
        input.queues,
        "worker.queues",
        "RUNTIME_WORKER_OPTIONS_INVALID",
        256,
      );
  const profileInputs = input.capabilityProfiles ?? [];
  if (!Array.isArray(profileInputs) || profileInputs.length > 128) {
    throw new RuntimeError(
      "RUNTIME_WORKER_OPTIONS_INVALID",
      "worker.capabilityProfiles must contain no more than 128 profiles.",
    );
  }
  const profileIds = new Set<string>();
  const capabilityProfiles: RuntimeWorkerCapabilityProfile[] = profileInputs.map(
    (profile, index) => {
      if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
        throw new RuntimeError(
          "RUNTIME_WORKER_OPTIONS_INVALID",
          `worker.capabilityProfiles[${index}] must be an object.`,
        );
      }
      const profileId = safeName(
        profile.id,
        `worker.capabilityProfiles[${index}].id`,
        "RUNTIME_WORKER_OPTIONS_INVALID",
      );
      if (profileIds.has(profileId)) {
        throw new RuntimeError(
          "RUNTIME_WORKER_OPTIONS_INVALID",
          `Worker capability profile is declared more than once: ${profileId}.`,
        );
      }
      profileIds.add(profileId);
      const profileCapabilities = normalizedCapabilityList(
        profile.capabilities,
        `worker.capabilityProfiles[${index}].capabilities`,
        "RUNTIME_WORKER_OPTIONS_INVALID",
        256,
      );
      if (!profileCapabilities.length) {
        throw new RuntimeError(
          "RUNTIME_WORKER_OPTIONS_INVALID",
          `Worker capability profile ${profileId} must declare at least one capability.`,
        );
      }
      return { id: profileId, capabilities: profileCapabilities };
    },
  );
  capabilityProfiles.sort((left, right) => left.id.localeCompare(right.id));
  return {
    id,
    capabilities,
    ...(capabilityProfiles.length ? { capabilityProfiles } : {}),
    ...(queues === undefined ? {} : { queues }),
  };
}

function timestamp(value: string | undefined, name: string): string | undefined {
  if (value === undefined) return undefined;
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) {
    throw new RuntimeError(
      "RUNTIME_JOB_SPEC_INVALID",
      `${name} must be a valid timestamp.`,
    );
  }
  return new Date(milliseconds).toISOString();
}

function artifactIds(values: readonly ArtifactId[] | undefined): readonly ArtifactId[] {
  const result = [...new Set(values ?? [])].sort();
  for (const value of result) {
    if (!/^artifact_[a-f0-9]{64}$/.test(value)) {
      throw new RuntimeError(
        "RUNTIME_JOB_SPEC_INVALID",
        `Invalid input artifact ID: ${value}`,
      );
    }
  }
  return result;
}

function labels(
  values: Readonly<Record<string, string>> | undefined,
): Readonly<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const key of Object.keys(values ?? {}).sort()) {
    const normalizedKey = safeRuntimeName(key, `labels.${key}`);
    const normalizedValue = values![key]!.trim();
    if (!normalizedValue || normalizedValue.length > 512 || normalizedValue.includes("\0")) {
      throw new RuntimeError(
        "RUNTIME_JOB_SPEC_INVALID",
        `Label ${normalizedKey} must contain 1 to 512 characters.`,
      );
    }
    result[normalizedKey] = normalizedValue;
  }
  return result;
}

export function idempotencyIndexKey(queue: string, key: string): string {
  return sha256(`${queue}\0${key}`);
}

export function normalizeRuntimeJobSubmission(
  input: RuntimeJobSubmission,
): Readonly<{ spec: NormalizedRuntimeJobSpec; specHash: string }> {
  const queue = safeRuntimeName(input.queue, "queue");
  const kind = safeRuntimeName(input.kind, "kind");
  const idempotencyKey = input.idempotencyKey.trim();
  if (
    !idempotencyKey ||
    idempotencyKey.length > 512 ||
    idempotencyKey.includes("\0")
  ) {
    throw new RuntimeError(
      "RUNTIME_JOB_SPEC_INVALID",
      "idempotencyKey must contain 1 to 512 characters.",
    );
  }
  const id = input.id
    ? safeRuntimeName(input.id, "id")
    : `job_${sha256(`${queue}\0${idempotencyKey}`).slice(0, 40)}`;
  const dependencyJobIds = [...new Set(input.dependencyJobIds ?? [])].sort();
  dependencyJobIds.forEach((entry) => safeRuntimeName(entry, "dependencyJobId"));
  if (dependencyJobIds.includes(id)) {
    throw new RuntimeError(
      "RUNTIME_JOB_SPEC_INVALID",
      "A job may not depend on itself.",
    );
  }
  const requiredCapabilities = normalizedCapabilityList(
    input.requiredCapabilities ?? [],
    "requiredCapabilities",
    "RUNTIME_JOB_SPEC_INVALID",
    256,
  );
  const requiredCapabilityProfile =
    input.requiredCapabilityProfile === undefined
      ? undefined
      : normalizedCapabilityList(
          input.requiredCapabilityProfile,
          "requiredCapabilityProfile",
          "RUNTIME_JOB_SPEC_INVALID",
          256,
        );
  if (requiredCapabilityProfile !== undefined && !requiredCapabilityProfile.length) {
    throw new RuntimeError(
      "RUNTIME_JOB_SPEC_INVALID",
      "requiredCapabilityProfile must contain at least one capability when supplied.",
    );
  }
  const payload = normalizeJson(input.payload);
  const notBefore = timestamp(input.notBefore, "notBefore");
  const deadline = timestamp(input.deadline, "deadline");
  if (
    notBefore !== undefined &&
    deadline !== undefined &&
    Date.parse(deadline) <= Date.parse(notBefore)
  ) {
    throw new RuntimeError(
      "RUNTIME_JOB_SPEC_INVALID",
      "deadline must be later than notBefore.",
    );
  }

  const spec: NormalizedRuntimeJobSpec = {
    schemaVersion: "1.0",
    id,
    queue,
    kind,
    idempotencyKey,
    payload,
    requiredCapabilities,
    ...(requiredCapabilityProfile === undefined
      ? {}
      : { requiredCapabilityProfile }),
    dependencyJobIds,
    inputArtifacts: artifactIds(input.inputArtifacts),
    priority: integer(input.priority, 0, -1000, 1000, "priority"),
    maximumAttempts: integer(
      input.maximumAttempts,
      3,
      1,
      50,
      "maximumAttempts",
    ),
    retryPolicy: {
      baseDelayMs: integer(
        input.retryPolicy?.baseDelayMs,
        5_000,
        0,
        86_400_000,
        "retryPolicy.baseDelayMs",
      ),
      maximumDelayMs: integer(
        input.retryPolicy?.maximumDelayMs,
        300_000,
        0,
        604_800_000,
        "retryPolicy.maximumDelayMs",
      ),
      multiplier: finite(
        input.retryPolicy?.multiplier,
        2,
        1,
        16,
        "retryPolicy.multiplier",
      ),
      jitterFraction: finite(
        input.retryPolicy?.jitterFraction,
        0.15,
        0,
        1,
        "retryPolicy.jitterFraction",
      ),
    },
    leaseDurationMs: integer(
      input.leaseDurationMs,
      60_000,
      10_000,
      3_600_000,
      "leaseDurationMs",
    ),
    timeoutMs: integer(
      input.timeoutMs,
      900_000,
      1_000,
      86_400_000,
      "timeoutMs",
    ),
    ...(notBefore === undefined ? {} : { notBefore }),
    ...(deadline === undefined ? {} : { deadline }),
    labels: labels(input.labels),
  };
  return {
    spec,
    specHash: sha256(stableStringify(normalizeJson(spec))),
  };
}

export function retryDelayMs(job: RuntimeJobRecord): number {
  const attempt = Math.max(1, job.attempts.length);
  const exponential =
    job.spec.retryPolicy.baseDelayMs *
    job.spec.retryPolicy.multiplier ** Math.max(0, attempt - 1);
  const capped = Math.min(job.spec.retryPolicy.maximumDelayMs, exponential);
  const sample = Number.parseInt(
    sha256(`${job.id}:${attempt}`).slice(0, 8),
    16,
  ) / 0xffffffff;
  const jitter = (sample * 2 - 1) * job.spec.retryPolicy.jitterFraction;
  return Math.max(0, Math.round(capped * (1 + jitter)));
}

export function isTerminalState(state: RuntimeJobState): boolean {
  return TERMINAL_STATES.has(state);
}

export function workerCanRun(
  job: RuntimeJobRecord,
  capabilities: readonly string[],
  capabilityProfiles: readonly RuntimeWorkerCapabilityProfile[] = [],
): boolean {
  const available = new Set(capabilities);
  if (
    !job.spec.requiredCapabilities.every((capability) =>
      available.has(capability),
    )
  ) {
    return false;
  }
  const requiredProfile = job.spec.requiredCapabilityProfile;
  if (requiredProfile === undefined) return true;
  return capabilityProfiles.some((profile) => {
    const profileCapabilities = new Set(profile.capabilities);
    return requiredProfile.every((capability) =>
      profileCapabilities.has(capability),
    );
  });
}

export function cloneJson<T>(value: T): T {
  return structuredClone(value);
}

export function eventData(value: unknown): JsonValue {
  return normalizeJson(value);
}
