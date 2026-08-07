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
const ARTIFACT_ID = /^artifact_[a-f0-9]{64}$/;

type RuntimeJobSubmissionSnapshot = Readonly<
  Omit<NormalizedRuntimeJobSpec, "schemaVersion">
>;

function integer(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
  name: string,
): number {
  const result = value ?? fallback;
  if (
    typeof result !== "number" ||
    !Number.isInteger(result) ||
    result < minimum ||
    result > maximum
  ) {
    throw new RuntimeError(
      "RUNTIME_JOB_SPEC_INVALID",
      `${name} must be an integer between ${minimum} and ${maximum}.`,
    );
  }
  return result;
}

function finite(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
  name: string,
): number {
  const result = value ?? fallback;
  if (
    typeof result !== "number" ||
    !Number.isFinite(result) ||
    result < minimum ||
    result > maximum
  ) {
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

export function safeRuntimeName(value: unknown, name: string): string {
  return safeName(value, name, "RUNTIME_JOB_SPEC_INVALID");
}

function runtimeInputRecord(
  value: unknown,
  name: string,
  code = "RUNTIME_JOB_SPEC_INVALID",
): Readonly<Record<string, unknown>> {
  let recordLike = false;
  try {
    recordLike =
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value);
  } catch {
    throw new RuntimeError(code, `${name} could not be inspected safely.`);
  }
  if (!recordLike) {
    throw new RuntimeError(code, `${name} must be an object.`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function readRuntimeInput(
  source: Readonly<Record<string, unknown>>,
  field: string,
  name: string,
  code = "RUNTIME_JOB_SPEC_INVALID",
): unknown {
  try {
    return source[field];
  } catch {
    throw new RuntimeError(
      code,
      `${name}.${field} could not be read safely.`,
    );
  }
}

function snapshotRuntimeArray(
  values: unknown,
  name: string,
  code: string,
  maximum: number,
): readonly unknown[] {
  let arrayLike = false;
  try {
    arrayLike = Array.isArray(values);
  } catch {
    throw new RuntimeError(code, `${name} could not be inspected safely.`);
  }
  if (!arrayLike) {
    throw new RuntimeError(code, `${name} must be an array.`);
  }

  const source = values as readonly unknown[];
  let length = 0;
  try {
    length = source.length;
  } catch {
    throw new RuntimeError(code, `${name}.length could not be read safely.`);
  }
  if (!Number.isSafeInteger(length) || length < 0 || length > maximum) {
    throw new RuntimeError(
      code,
      `${name} must contain no more than ${maximum} entries.`,
    );
  }

  const snapshot: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    try {
      snapshot.push(source[index]);
    } catch {
      throw new RuntimeError(
        code,
        `${name}[${index}] could not be read safely.`,
      );
    }
  }
  return Object.freeze(snapshot);
}

function freezeRuntimeValue<T>(
  value: T,
  seen = new WeakSet<object>(),
): T {
  if (value === null || typeof value !== "object") return value;
  const object = value as object;
  if (seen.has(object)) return value;
  seen.add(object);
  for (const entry of Object.values(
    value as unknown as Readonly<Record<string, unknown>>,
  )) {
    freezeRuntimeValue(entry, seen);
  }
  Object.freeze(object);
  return value;
}

function runtimeJson(value: unknown, name: string): JsonValue {
  try {
    return freezeRuntimeValue(normalizeJson(value));
  } catch {
    throw new RuntimeError(
      "RUNTIME_JOB_SPEC_INVALID",
      `${name} must contain valid JSON data.`,
    );
  }
}

function normalizeIdempotencyKey(value: unknown): string {
  if (typeof value !== "string") {
    throw new RuntimeError(
      "RUNTIME_JOB_SPEC_INVALID",
      "idempotencyKey must contain 1 to 512 characters.",
    );
  }
  const result = value.trim();
  if (!result || result.length > 512 || result.includes("\0")) {
    throw new RuntimeError(
      "RUNTIME_JOB_SPEC_INVALID",
      "idempotencyKey must contain 1 to 512 characters.",
    );
  }
  return result;
}

function normalizedRuntimeNameList(
  values: unknown,
  name: string,
  maximum = 10_000,
): readonly string[] {
  if (values === undefined) return Object.freeze([]);
  const snapshot = snapshotRuntimeArray(
    values,
    name,
    "RUNTIME_JOB_SPEC_INVALID",
    maximum,
  );
  const normalized = snapshot.map((entry, index) =>
    safeRuntimeName(entry, `${name}[${index}]`),
  );
  return Object.freeze([...new Set(normalized)].sort());
}

function normalizeRetryPolicy(
  value: unknown,
): NormalizedRuntimeJobSpec["retryPolicy"] {
  if (value === undefined) {
    return Object.freeze({
      baseDelayMs: 5_000,
      maximumDelayMs: 300_000,
      multiplier: 2,
      jitterFraction: 0.15,
    });
  }
  const source = runtimeInputRecord(value, "retryPolicy");
  return Object.freeze({
    baseDelayMs: integer(
      readRuntimeInput(source, "baseDelayMs", "retryPolicy"),
      5_000,
      0,
      86_400_000,
      "retryPolicy.baseDelayMs",
    ),
    maximumDelayMs: integer(
      readRuntimeInput(source, "maximumDelayMs", "retryPolicy"),
      300_000,
      0,
      604_800_000,
      "retryPolicy.maximumDelayMs",
    ),
    multiplier: finite(
      readRuntimeInput(source, "multiplier", "retryPolicy"),
      2,
      1,
      16,
      "retryPolicy.multiplier",
    ),
    jitterFraction: finite(
      readRuntimeInput(source, "jitterFraction", "retryPolicy"),
      0.15,
      0,
      1,
      "retryPolicy.jitterFraction",
    ),
  });
}

function normalizedCapabilityList(
  values: unknown,
  name: string,
  code: string,
  maximum = 256,
): readonly string[] {
  const snapshot = snapshotRuntimeArray(values, name, code, maximum);
  const normalized = snapshot.map((entry, index) => {
    if (typeof entry !== "string") {
      throw new RuntimeError(
        code,
        `${name}[${index}] must be a string capability.`,
      );
    }
    return safeName(entry, `${name}[${index}]`, code);
  });
  return Object.freeze([...new Set(normalized)].sort());
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

function timestamp(value: unknown, name: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new RuntimeError(
      "RUNTIME_JOB_SPEC_INVALID",
      `${name} must be a valid timestamp.`,
    );
  }
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) {
    throw new RuntimeError(
      "RUNTIME_JOB_SPEC_INVALID",
      `${name} must be a valid timestamp.`,
    );
  }
  return new Date(milliseconds).toISOString();
}

function artifactIds(values: unknown): readonly ArtifactId[] {
  if (values === undefined) return Object.freeze([]);
  const snapshot = snapshotRuntimeArray(
    values,
    "inputArtifacts",
    "RUNTIME_JOB_SPEC_INVALID",
    10_000,
  );
  const normalized = snapshot.map((entry, index) => {
    if (typeof entry !== "string" || !ARTIFACT_ID.test(entry)) {
      throw new RuntimeError(
        "RUNTIME_JOB_SPEC_INVALID",
        `Invalid input artifact ID at inputArtifacts[${index}].`,
      );
    }
    return entry as ArtifactId;
  });
  return Object.freeze([...new Set(normalized)].sort());
}

function labels(values: unknown): Readonly<Record<string, string>> {
  const result = Object.create(null) as Record<string, string>;
  if (values === undefined) return Object.freeze(result);
  const source = runtimeInputRecord(values, "labels");
  let keys: readonly string[];
  try {
    keys = Object.keys(source).sort();
  } catch {
    throw new RuntimeError(
      "RUNTIME_JOB_SPEC_INVALID",
      "labels keys could not be read safely.",
    );
  }
  for (const key of keys) {
    const normalizedKey = safeRuntimeName(key, `labels.${key}`);
    if (Object.hasOwn(result, normalizedKey)) {
      throw new RuntimeError(
        "RUNTIME_JOB_SPEC_INVALID",
        `Label ${normalizedKey} is declared more than once.`,
      );
    }
    const entry = readRuntimeInput(source, key, "labels");
    if (typeof entry !== "string") {
      throw new RuntimeError(
        "RUNTIME_JOB_SPEC_INVALID",
        `Label ${normalizedKey} must be a string.`,
      );
    }
    const normalizedValue = entry.trim();
    if (
      !normalizedValue ||
      normalizedValue.length > 512 ||
      normalizedValue.includes("\0")
    ) {
      throw new RuntimeError(
        "RUNTIME_JOB_SPEC_INVALID",
        `Label ${normalizedKey} must contain 1 to 512 characters.`,
      );
    }
    Object.defineProperty(result, normalizedKey, {
      value: normalizedValue,
      enumerable: true,
      configurable: false,
      writable: false,
    });
  }
  return Object.freeze(result);
}

export function idempotencyIndexKey(queue: string, key: string): string {
  return sha256(`${queue}\0${key}`);
}

function snapshotRuntimeJobSubmission(
  input: unknown,
): RuntimeJobSubmissionSnapshot {
  const source = runtimeInputRecord(input, "Runtime job submission");
  const queue = safeRuntimeName(
    readRuntimeInput(source, "queue", "submission"),
    "queue",
  );
  const kind = safeRuntimeName(
    readRuntimeInput(source, "kind", "submission"),
    "kind",
  );
  const idempotencyKey = normalizeIdempotencyKey(
    readRuntimeInput(source, "idempotencyKey", "submission"),
  );
  const idInput = readRuntimeInput(source, "id", "submission");
  const id = idInput === undefined
    ? `job_${sha256(`${queue}\0${idempotencyKey}`).slice(0, 40)}`
    : safeRuntimeName(idInput, "id");
  const dependencyJobIds = normalizedRuntimeNameList(
    readRuntimeInput(source, "dependencyJobIds", "submission"),
    "dependencyJobIds",
  );
  if (dependencyJobIds.includes(id)) {
    throw new RuntimeError(
      "RUNTIME_JOB_SPEC_INVALID",
      "A job may not depend on itself.",
    );
  }

  const requiredCapabilitiesInput = readRuntimeInput(
    source,
    "requiredCapabilities",
    "submission",
  );
  const requiredCapabilities = normalizedCapabilityList(
    requiredCapabilitiesInput === undefined
      ? []
      : requiredCapabilitiesInput,
    "requiredCapabilities",
    "RUNTIME_JOB_SPEC_INVALID",
    256,
  );
  const requiredCapabilityProfileInput = readRuntimeInput(
    source,
    "requiredCapabilityProfile",
    "submission",
  );
  const requiredCapabilityProfile =
    requiredCapabilityProfileInput === undefined
      ? undefined
      : normalizedCapabilityList(
          requiredCapabilityProfileInput,
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

  const payload = runtimeJson(
    readRuntimeInput(source, "payload", "submission"),
    "payload",
  );
  const inputArtifacts = artifactIds(
    readRuntimeInput(source, "inputArtifacts", "submission"),
  );
  const priority = integer(
    readRuntimeInput(source, "priority", "submission"),
    0,
    -1000,
    1000,
    "priority",
  );
  const maximumAttempts = integer(
    readRuntimeInput(source, "maximumAttempts", "submission"),
    3,
    1,
    50,
    "maximumAttempts",
  );
  const retryPolicy = normalizeRetryPolicy(
    readRuntimeInput(source, "retryPolicy", "submission"),
  );
  const leaseDurationMs = integer(
    readRuntimeInput(source, "leaseDurationMs", "submission"),
    60_000,
    10_000,
    3_600_000,
    "leaseDurationMs",
  );
  const timeoutMs = integer(
    readRuntimeInput(source, "timeoutMs", "submission"),
    900_000,
    1_000,
    86_400_000,
    "timeoutMs",
  );
  const notBefore = timestamp(
    readRuntimeInput(source, "notBefore", "submission"),
    "notBefore",
  );
  const deadline = timestamp(
    readRuntimeInput(source, "deadline", "submission"),
    "deadline",
  );
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
  const normalizedLabels = labels(
    readRuntimeInput(source, "labels", "submission"),
  );

  const snapshot: RuntimeJobSubmissionSnapshot = {
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
    inputArtifacts,
    priority,
    maximumAttempts,
    retryPolicy,
    leaseDurationMs,
    timeoutMs,
    ...(notBefore === undefined ? {} : { notBefore }),
    ...(deadline === undefined ? {} : { deadline }),
    labels: normalizedLabels,
  };
  return freezeRuntimeValue(snapshot);
}

export function normalizeRuntimeJobSubmission(
  input: RuntimeJobSubmission,
): Readonly<{ spec: NormalizedRuntimeJobSpec; specHash: string }> {
  const snapshot = snapshotRuntimeJobSubmission(input);
  const spec: NormalizedRuntimeJobSpec = Object.freeze({
    schemaVersion: "1.0" as const,
    id: snapshot.id,
    queue: snapshot.queue,
    kind: snapshot.kind,
    idempotencyKey: snapshot.idempotencyKey,
    payload: snapshot.payload,
    requiredCapabilities: snapshot.requiredCapabilities,
    ...(snapshot.requiredCapabilityProfile === undefined
      ? {}
      : { requiredCapabilityProfile: snapshot.requiredCapabilityProfile }),
    dependencyJobIds: snapshot.dependencyJobIds,
    inputArtifacts: snapshot.inputArtifacts,
    priority: snapshot.priority,
    maximumAttempts: snapshot.maximumAttempts,
    retryPolicy: snapshot.retryPolicy,
    leaseDurationMs: snapshot.leaseDurationMs,
    timeoutMs: snapshot.timeoutMs,
    ...(snapshot.notBefore === undefined
      ? {}
      : { notBefore: snapshot.notBefore }),
    ...(snapshot.deadline === undefined
      ? {}
      : { deadline: snapshot.deadline }),
    labels: snapshot.labels,
  });
  return Object.freeze({
    spec,
    specHash: sha256(stableStringify(normalizeJson(spec))),
  });
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
