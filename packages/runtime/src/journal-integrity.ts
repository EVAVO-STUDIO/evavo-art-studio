import {
  normalizeJson,
  sha256,
  stableStringify,
  type JsonValue,
} from "@evavo/art-artifacts";

import {
  idempotencyIndexKey,
  normalizeRuntimeJobSubmission,
} from "./normalize.js";
import {
  RUNTIME_PROTOCOL_VERSION,
  RuntimeError,
  type RuntimeEvent,
  type RuntimeJobRecord,
  type RuntimeJobState,
  type RuntimeJobSubmission,
  type RuntimeSnapshot,
  type RuntimeTransactionRecord,
} from "./types.js";

export type RuntimeJournalHead = Readonly<{
  schemaVersion: "1.0";
  sequence: number;
  stateSha256: string;
  transactionFile: string;
}>;

const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const TRANSACTION_FILE = /^\d{16}\.json$/;
const JOB_STATES = new Set<RuntimeJobState>([
  "waiting", "queued", "leased", "running", "retry-wait", "paused",
  "succeeded", "failed", "cancelled", "blocked", "dead-letter",
]);
const TRANSACTION_KEYS = new Set([
  "schemaVersion", "protocolVersion", "sequence", "previousSequence",
  "stateSha256", "snapshot", "events",
]);
const SNAPSHOT_KEYS = new Set([
  "schemaVersion", "protocolVersion", "sequence", "jobs", "idempotencyIndex",
]);
const JOB_KEYS = new Set([
  "schemaVersion", "protocolVersion", "id", "specHash", "spec", "state",
  "createdAt", "updatedAt", "attemptLimit", "attempts", "lease",
  "nextAttemptAt", "cancellationRequestedAt", "pauseRequestedAt",
  "pausedFromState", "finishedAt", "outputArtifacts", "failure", "redriveCount",
]);
const ATTEMPT_KEYS = new Set([
  "attempt", "workerId", "leaseToken", "leasedAt", "startedAt",
  "lastHeartbeatAt", "heartbeatCount", "finishedAt", "outcome", "failure",
  "outputArtifacts",
]);
const LEASE_KEYS = new Set(["workerId", "token", "leasedAt", "expiresAt"]);
const EVENT_KEYS = new Set([
  "schemaVersion", "id", "transactionSequence", "eventIndex", "type", "at",
  "actor", "jobId", "data",
]);
const HEAD_KEYS = new Set([
  "schemaVersion", "sequence", "stateSha256", "transactionFile",
]);

function invalid(code: string, message: string): never {
  throw new RuntimeError(code, message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function record(value: unknown, code: string, label: string): Record<string, unknown> {
  if (!isRecord(value)) invalid(code, `${label} must be a JSON object.`);
  return value;
}

function exactKeys(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  code: string,
  label: string,
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) invalid(code, `${label} contains unsupported field ${key}.`);
  }
}

function safeInteger(value: unknown, minimum: number, code: string, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < minimum) {
    invalid(code, `${label} must be a safe integer greater than or equal to ${minimum}.`);
  }
  return Number(value);
}

function safeName(value: unknown, code: string, label: string): string {
  if (typeof value !== "string" || !SAFE_NAME.test(value)) {
    invalid(code, `${label} must contain 1 to 128 safe characters.`);
  }
  return value;
}

function canonicalTimestamp(value: unknown, code: string, label: string): string {
  if (typeof value !== "string") invalid(code, `${label} must be a canonical timestamp.`);
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) {
    invalid(code, `${label} must be a canonical ISO-8601 timestamp.`);
  }
  return value;
}

function optionalTimestamp(
  value: Record<string, unknown>,
  key: string,
  code: string,
  label: string,
): void {
  if (Object.hasOwn(value, key)) canonicalTimestamp(value[key], code, `${label}.${key}`);
}

function canonicalJson(value: unknown, code: string, label: string): JsonValue {
  let normalized: JsonValue;
  try {
    normalized = normalizeJson(value);
  } catch {
    invalid(code, `${label} must be canonical JSON.`);
  }
  if (stableStringify(normalized) !== stableStringify(value as JsonValue)) {
    invalid(code, `${label} must be canonical JSON.`);
  }
  return normalized;
}

function parseJsonObject(source: string, code: string, label: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source) as unknown;
  } catch {
    invalid(code, `${label} is not valid JSON.`);
  }
  return record(parsed, code, label);
}

function parseJob(value: unknown, expectedId: string): RuntimeJobRecord {
  const code = "RUNTIME_JOURNAL_JOB_INVALID";
  const job = record(value, code, `Runtime job ${expectedId}`);
  exactKeys(job, JOB_KEYS, code, `Runtime job ${expectedId}`);
  if (
    job.schemaVersion !== "1.0" ||
    job.protocolVersion !== RUNTIME_PROTOCOL_VERSION ||
    job.id !== expectedId
  ) {
    invalid(code, `Runtime job ${expectedId} identity or version is invalid.`);
  }
  safeName(job.id, code, `Runtime job ${expectedId}.id`);
  const spec = record(job.spec, code, `Runtime job ${expectedId}.spec`);
  let normalized: ReturnType<typeof normalizeRuntimeJobSubmission>;
  try {
    normalized = normalizeRuntimeJobSubmission(spec as unknown as RuntimeJobSubmission);
  } catch {
    invalid(code, `Runtime job ${expectedId} spec failed normalization.`);
  }
  if (
    normalized.spec.id !== expectedId ||
    stableStringify(normalizeJson(spec)) !== stableStringify(normalizeJson(normalized.spec))
  ) {
    invalid(code, `Runtime job ${expectedId} spec is not its canonical normalized specification.`);
  }
  if (job.specHash !== normalized.specHash) {
    invalid(code, "Runtime job specHash does not match its normalized spec.");
  }
  if (typeof job.state !== "string" || !JOB_STATES.has(job.state as RuntimeJobState)) {
    invalid(code, `Runtime job ${expectedId}.state is invalid.`);
  }
  canonicalTimestamp(job.createdAt, code, `Runtime job ${expectedId}.createdAt`);
  canonicalTimestamp(job.updatedAt, code, `Runtime job ${expectedId}.updatedAt`);
  const attemptLimit = safeInteger(job.attemptLimit, 1, code, `Runtime job ${expectedId}.attemptLimit`);
  const redriveCount = safeInteger(job.redriveCount, 0, code, `Runtime job ${expectedId}.redriveCount`);
  if (redriveCount === 0 && attemptLimit !== normalized.spec.maximumAttempts) {
    invalid(code, `Runtime job ${expectedId} attemptLimit is inconsistent with its spec.`);
  }
  if (!Array.isArray(job.attempts) || job.attempts.length > attemptLimit) {
    invalid(code, `Runtime job ${expectedId}.attempts exceed the immutable attempt limit.`);
  }
  for (let index = 0; index < job.attempts.length; index += 1) {
    const attempt = record(job.attempts[index], code, `Runtime job ${expectedId} attempt ${index + 1}`);
    exactKeys(attempt, ATTEMPT_KEYS, code, `Runtime job ${expectedId} attempt ${index + 1}`);
    if (attempt.attempt !== index + 1) {
      invalid(code, `Runtime job ${expectedId} attempt identity is inconsistent with its position.`);
    }
    safeName(attempt.workerId, code, `Runtime job ${expectedId} attempt workerId`);
    canonicalTimestamp(attempt.leasedAt, code, `Runtime job ${expectedId} attempt leasedAt`);
    optionalTimestamp(attempt, "startedAt", code, `Runtime job ${expectedId} attempt`);
    optionalTimestamp(attempt, "lastHeartbeatAt", code, `Runtime job ${expectedId} attempt`);
    optionalTimestamp(attempt, "finishedAt", code, `Runtime job ${expectedId} attempt`);
    safeInteger(attempt.heartbeatCount, 0, code, `Runtime job ${expectedId} heartbeatCount`);
    if (!Array.isArray(attempt.outputArtifacts)) {
      invalid(code, `Runtime job ${expectedId} attempt outputArtifacts must be an array.`);
    }
  }
  if (!Array.isArray(job.outputArtifacts)) {
    invalid(code, `Runtime job ${expectedId}.outputArtifacts must be an array.`);
  }
  for (const key of [
    "nextAttemptAt", "cancellationRequestedAt", "pauseRequestedAt", "finishedAt",
  ]) optionalTimestamp(job, key, code, `Runtime job ${expectedId}`);
  if (Object.hasOwn(job, "lease")) {
    const lease = record(job.lease, code, `Runtime job ${expectedId}.lease`);
    exactKeys(lease, LEASE_KEYS, code, `Runtime job ${expectedId}.lease`);
    safeName(lease.workerId, code, `Runtime job ${expectedId}.lease.workerId`);
    canonicalTimestamp(lease.leasedAt, code, `Runtime job ${expectedId}.lease.leasedAt`);
    canonicalTimestamp(lease.expiresAt, code, `Runtime job ${expectedId}.lease.expiresAt`);
    if (Date.parse(String(lease.expiresAt)) <= Date.parse(String(lease.leasedAt))) {
      invalid(code, `Runtime job ${expectedId}.lease expiry must follow leasedAt.`);
    }
  }
  canonicalJson(job, code, `Runtime job ${expectedId}`);
  return job as unknown as RuntimeJobRecord;
}

function assertAcyclic(jobs: Readonly<Record<string, RuntimeJobRecord>>): void {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (jobId: string): void => {
    if (visited.has(jobId)) return;
    if (visiting.has(jobId)) invalid(
      "RUNTIME_JOURNAL_SNAPSHOT_INVALID",
      `Persisted runtime dependency cycle detected at ${jobId}.`,
    );
    const job = jobs[jobId];
    if (!job) return;
    visiting.add(jobId);
    for (const dependencyId of job.spec.dependencyJobIds) {
      if (Object.hasOwn(jobs, dependencyId)) visit(dependencyId);
    }
    visiting.delete(jobId);
    visited.add(jobId);
  };
  for (const jobId of Object.keys(jobs).sort()) visit(jobId);
}

function parseSnapshot(value: unknown, sequence: number): RuntimeSnapshot {
  const code = "RUNTIME_JOURNAL_SNAPSHOT_INVALID";
  const snapshot = record(value, code, "Runtime snapshot");
  exactKeys(snapshot, SNAPSHOT_KEYS, code, "Runtime snapshot");
  if (
    snapshot.schemaVersion !== "1.0" ||
    snapshot.protocolVersion !== RUNTIME_PROTOCOL_VERSION ||
    snapshot.sequence !== sequence
  ) invalid(code, "Runtime snapshot identity or version is invalid.");
  const jobInputs = record(snapshot.jobs, code, "Runtime snapshot jobs");
  const jobs = Object.create(null) as Record<string, RuntimeJobRecord>;
  for (const jobId of Object.keys(jobInputs)) {
    safeName(jobId, "RUNTIME_JOURNAL_JOB_INVALID", "Runtime snapshot job key");
    jobs[jobId] = parseJob(jobInputs[jobId], jobId);
  }
  assertAcyclic(jobs);
  const indexInput = record(snapshot.idempotencyIndex, code, "Runtime idempotency index");
  if (Object.keys(indexInput).length !== Object.keys(jobs).length) {
    invalid("RUNTIME_JOURNAL_INDEX_INVALID", "Runtime idempotency index cardinality does not match persisted jobs.");
  }
  const seenJobs = new Set<string>();
  for (const [key, value] of Object.entries(indexInput)) {
    if (!SHA256.test(key) || typeof value !== "string" || !Object.hasOwn(jobs, value)) {
      invalid("RUNTIME_JOURNAL_INDEX_INVALID", "Runtime idempotency index contains an invalid mapping.");
    }
    const job = jobs[value]!;
    const expectedKey = idempotencyIndexKey(job.spec.queue, job.spec.idempotencyKey);
    if (key !== expectedKey || seenJobs.has(value)) {
      invalid("RUNTIME_JOURNAL_INDEX_INVALID", `Runtime idempotency index does not bind canonical job ${value}.`);
    }
    seenJobs.add(value);
  }
  return {
    schemaVersion: "1.0",
    protocolVersion: RUNTIME_PROTOCOL_VERSION,
    sequence,
    jobs,
    idempotencyIndex: indexInput as Readonly<Record<string, string>>,
  };
}

function parseEvent(
  value: unknown,
  sequence: number,
  index: number,
  jobs: Readonly<Record<string, RuntimeJobRecord>>,
): RuntimeEvent {
  const code = "RUNTIME_JOURNAL_EVENT_INVALID";
  const event = record(value, code, `Runtime event ${sequence}:${index}`);
  exactKeys(event, EVENT_KEYS, code, `Runtime event ${sequence}:${index}`);
  const expectedId = `event_${String(sequence).padStart(16, "0")}_${String(index).padStart(4, "0")}`;
  if (
    event.schemaVersion !== "1.0" ||
    event.id !== expectedId ||
    event.transactionSequence !== sequence ||
    event.eventIndex !== index
  ) invalid(code, `Runtime event ${sequence}:${index} identity is invalid.`);
  safeName(event.type, code, `Runtime event ${sequence}:${index}.type`);
  canonicalTimestamp(event.at, code, `Runtime event ${sequence}:${index}.at`);
  if (
    typeof event.actor !== "string" ||
    !event.actor ||
    event.actor !== event.actor.trim() ||
    event.actor.length > 256 ||
    event.actor.includes("\0")
  ) invalid(code, `Runtime event ${sequence}:${index}.actor is invalid.`);
  if (Object.hasOwn(event, "jobId")) {
    safeName(event.jobId, code, `Runtime event ${sequence}:${index}.jobId`);
    if (!Object.hasOwn(jobs, String(event.jobId))) {
      invalid(code, `Runtime event ${sequence}:${index} points to a missing job.`);
    }
  }
  canonicalJson(event.data, code, `Runtime event ${sequence}:${index}.data`);
  return event as unknown as RuntimeEvent;
}

export function runtimeSnapshotHash(snapshot: RuntimeSnapshot): string {
  return sha256(stableStringify(normalizeJson(snapshot)));
}

export function transactionFileName(sequence: number): string {
  const value = `${String(sequence).padStart(16, "0")}.json`;
  if (!Number.isSafeInteger(sequence) || sequence < 1 || !TRANSACTION_FILE.test(value)) {
    invalid("RUNTIME_JOURNAL_SEQUENCE_INVALID", "Runtime transaction sequence is invalid.");
  }
  return value;
}

export function serializeRuntimeTransaction(transaction: RuntimeTransactionRecord): string {
  return `${JSON.stringify(transaction, null, 2)}\n`;
}

export function parseRuntimeTransactionText(
  source: string,
  expectedSequence: number,
): RuntimeTransactionRecord {
  transactionFileName(expectedSequence);
  const code = "RUNTIME_JOURNAL_INVALID";
  const transaction = parseJsonObject(source, code, "Runtime transaction");
  exactKeys(transaction, TRANSACTION_KEYS, code, "Runtime transaction");
  if (
    transaction.schemaVersion !== "1.0" ||
    transaction.protocolVersion !== RUNTIME_PROTOCOL_VERSION ||
    transaction.sequence !== expectedSequence ||
    transaction.previousSequence !== expectedSequence - 1 ||
    typeof transaction.stateSha256 !== "string" ||
    !SHA256.test(transaction.stateSha256) ||
    !Array.isArray(transaction.events)
  ) invalid(code, `Runtime transaction ${expectedSequence} identity or required fields are invalid.`);
  const snapshot = parseSnapshot(transaction.snapshot, expectedSequence);
  if (runtimeSnapshotHash(snapshot) !== transaction.stateSha256) {
    invalid("RUNTIME_JOURNAL_HASH_MISMATCH", `Runtime transaction ${expectedSequence} failed snapshot verification.`);
  }
  const events = transaction.events.map((event, index) =>
    parseEvent(event, expectedSequence, index, snapshot.jobs),
  );
  return {
    schemaVersion: "1.0",
    protocolVersion: RUNTIME_PROTOCOL_VERSION,
    sequence: expectedSequence,
    previousSequence: expectedSequence - 1,
    stateSha256: transaction.stateSha256,
    snapshot,
    events,
  };
}

export function serializeRuntimeJournalHead(head: RuntimeJournalHead): string {
  return `${JSON.stringify(head, null, 2)}\n`;
}

export function parseRuntimeJournalHeadText(source: string): RuntimeJournalHead {
  const code = "RUNTIME_JOURNAL_HEAD_INVALID";
  const head = parseJsonObject(source, code, "Runtime journal head");
  exactKeys(head, HEAD_KEYS, code, "Runtime journal head");
  const sequence = safeInteger(head.sequence, 1, code, "Runtime journal head.sequence");
  if (
    head.schemaVersion !== "1.0" ||
    typeof head.stateSha256 !== "string" ||
    !SHA256.test(head.stateSha256) ||
    head.transactionFile !== transactionFileName(sequence)
  ) invalid(code, "Runtime journal head identity or required fields are invalid.");
  return {
    schemaVersion: "1.0",
    sequence,
    stateSha256: head.stateSha256,
    transactionFile: head.transactionFile,
  };
}
