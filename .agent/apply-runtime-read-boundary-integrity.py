from pathlib import Path

ROOT = Path.cwd()
SOURCE_PATH = ROOT / "packages/runtime/src/local-repository.ts"
source = SOURCE_PATH.read_text(encoding="utf-8")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


old_constants = r'''const ARTIFACT_ID = /^artifact_[a-f0-9]{64}$/;
const MAX_RUNTIME_OUTPUT_ARTIFACTS = 10_000;
const RUNTIME_FAILURE_CLASSIFICATIONS = new Set<
  RuntimeFailure["classification"]
>([
  "transient",
  "permanent",
  "cancelled",
  "lease-expired",
  "deadline-exceeded",
  "dependency-failed",
  "timeout",
]);'''

new_constants = r'''const ARTIFACT_ID = /^artifact_[a-f0-9]{64}$/;
const MAX_RUNTIME_OUTPUT_ARTIFACTS = 10_000;
const MAX_RUNTIME_QUERY_FILTERS = 10_000;
const RUNTIME_JOB_STATES = new Set<RuntimeJobState>([
  "waiting",
  "queued",
  "leased",
  "running",
  "retry-wait",
  "paused",
  "succeeded",
  "failed",
  "cancelled",
  "blocked",
  "dead-letter",
]);
const RUNTIME_FAILURE_CLASSIFICATIONS = new Set<
  RuntimeFailure["classification"]
>([
  "transient",
  "permanent",
  "cancelled",
  "lease-expired",
  "deadline-exceeded",
  "dependency-failed",
  "timeout",
]);'''
source = replace_once(source, old_constants, new_constants, "runtime query constants")

old_types = r'''type RuntimeClaimRequestSnapshot = Readonly<{
  worker: ReturnType<typeof normalizeRuntimeWorkerDescriptor>;
  maximumJobs: number;
  now: Date;
  at: string;
}>;'''

new_types = r'''type RuntimeClaimRequestSnapshot = Readonly<{
  worker: ReturnType<typeof normalizeRuntimeWorkerDescriptor>;
  maximumJobs: number;
  now: Date;
  at: string;
}>;

type RuntimeQuerySnapshot = Readonly<{
  states: readonly RuntimeJobState[] | null;
  queues: readonly string[] | null;
  kinds: readonly string[] | null;
  limit: number;
}>;'''
source = replace_once(source, old_types, new_types, "runtime query snapshot type")

helper_marker = "\nfunction draft(\n"
if source.count(helper_marker) != 1:
    raise SystemExit("runtime query helpers: draft marker was not unique")
if "function snapshotRuntimeQuery(" in source:
    raise SystemExit("runtime query helpers already exist")

helpers = r'''
function invalidRuntimeQuery(message: string): never {
  throw new RuntimeError("RUNTIME_QUERY_INVALID", message);
}

function snapshotRuntimeQueryName(value: unknown, name: string): string {
  try {
    return safeRuntimeName(value, name);
  } catch {
    invalidRuntimeQuery(`${name} must contain 1 to 128 safe characters.`);
  }
}

function snapshotRuntimeQueryArray<T extends string>(
  value: unknown,
  name: "states" | "queues" | "kinds",
  normalize: (entry: unknown, index: number) => T,
): readonly T[] | null {
  if (value === undefined) return null;

  let arrayLike = false;
  try {
    arrayLike = Array.isArray(value);
  } catch {
    invalidRuntimeQuery(`Runtime query ${name} could not be inspected safely.`);
  }
  if (!arrayLike) {
    invalidRuntimeQuery(`Runtime query ${name} must be an array.`);
  }

  const source = value as readonly unknown[];
  let length = 0;
  try {
    length = source.length;
  } catch {
    invalidRuntimeQuery(`Runtime query ${name} length could not be read safely.`);
  }
  if (
    !Number.isSafeInteger(length) ||
    length < 0 ||
    length > MAX_RUNTIME_QUERY_FILTERS
  ) {
    invalidRuntimeQuery(
      `Runtime query ${name} must contain no more than ${MAX_RUNTIME_QUERY_FILTERS} entries.`,
    );
  }

  const snapshot: T[] = [];
  for (let index = 0; index < length; index += 1) {
    let entry: unknown;
    try {
      entry = source[index];
    } catch {
      invalidRuntimeQuery(
        `Runtime query ${name}[${index}] could not be read safely.`,
      );
    }
    if (entry === undefined) {
      invalidRuntimeQuery(
        `Runtime query ${name}[${index}] may not be undefined or sparse.`,
      );
    }
    snapshot.push(normalize(entry, index));
  }
  return Object.freeze([...new Set(snapshot)].sort());
}

function snapshotRuntimeQueryStates(
  value: unknown,
): readonly RuntimeJobState[] | null {
  return snapshotRuntimeQueryArray(
    value,
    "states",
    (entry, index) => {
      if (
        typeof entry !== "string" ||
        !RUNTIME_JOB_STATES.has(entry as RuntimeJobState)
      ) {
        invalidRuntimeQuery(
          `Runtime query states[${index}] must be a supported runtime job state.`,
        );
      }
      return entry as RuntimeJobState;
    },
  );
}

function snapshotRuntimeQueryNames(
  value: unknown,
  name: "queues" | "kinds",
): readonly string[] | null {
  return snapshotRuntimeQueryArray(
    value,
    name,
    (entry, index) => snapshotRuntimeQueryName(entry, `${name}[${index}]`),
  );
}

function snapshotRuntimeQuery(value: unknown): RuntimeQuerySnapshot {
  let recordLike = false;
  try {
    recordLike =
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value);
  } catch {
    invalidRuntimeQuery("Runtime query could not be inspected safely.");
  }
  if (!recordLike) {
    invalidRuntimeQuery("Runtime query must be an object.");
  }

  const source = value as Readonly<Record<string, unknown>>;
  let statesInput: unknown;
  let queuesInput: unknown;
  let kindsInput: unknown;
  let limitInput: unknown;
  try {
    statesInput = source.states;
    queuesInput = source.queues;
    kindsInput = source.kinds;
    limitInput = source.limit;
  } catch {
    invalidRuntimeQuery("Runtime query fields could not be read safely.");
  }

  const limit = limitInput === undefined ? 1_000 : limitInput;
  if (
    typeof limit !== "number" ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 100_000
  ) {
    invalidRuntimeQuery("Runtime query limit must be 1 to 100000.");
  }

  return Object.freeze({
    states: snapshotRuntimeQueryStates(statesInput),
    queues: snapshotRuntimeQueryNames(queuesInput, "queues"),
    kinds: snapshotRuntimeQueryNames(kindsInput, "kinds"),
    limit,
  });
}

function snapshotRuntimeJobId(value: unknown): string {
  if (typeof value !== "string") {
    invalidRuntimeQuery(
      "Runtime job ID must contain 1 to 128 safe characters.",
    );
  }
  try {
    return safeRuntimeName(value, "Runtime job ID");
  } catch {
    invalidRuntimeQuery(
      "Runtime job ID must contain 1 to 128 safe characters.",
    );
  }
}
'''
source = source.replace(helper_marker, "\n" + helpers + "\nfunction draft(\n", 1)

old_reads = r'''  public async get(jobId: string): Promise<RuntimeJobRecord | null> {
    const snapshot = await this.#journal.snapshot();
    return snapshot.jobs[jobId] ? cloneJson(snapshot.jobs[jobId]) : null;
  }

  public async list(query: RuntimeQuery = {}): Promise<readonly RuntimeJobRecord[]> {
    const limit = query.limit ?? 1_000;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100_000) {
      throw new RuntimeError("RUNTIME_QUERY_INVALID", "Runtime query limit must be 1 to 100000.");
    }
    const states = query.states ? new Set(query.states) : null;
    const queues = query.queues ? new Set(query.queues) : null;
    const kinds = query.kinds ? new Set(query.kinds) : null;
    const snapshot = await this.#journal.snapshot();
    return Object.values(snapshot.jobs)
      .filter((job) => !states || states.has(job.state))
      .filter((job) => !queues || queues.has(job.spec.queue))
      .filter((job) => !kinds || kinds.has(job.spec.kind))
      .sort(
        (left, right) =>
          Date.parse(right.updatedAt) - Date.parse(left.updatedAt) ||
          left.id.localeCompare(right.id),
      )
      .slice(0, limit)
      .map(cloneJson);
  }'''

new_reads = r'''  public async get(jobIdInput: string): Promise<RuntimeJobRecord | null> {
    const jobId = snapshotRuntimeJobId(jobIdInput);
    const snapshot = await this.#journal.snapshot();
    const job = snapshot.jobs[jobId];
    return job ? cloneJson(job) : null;
  }

  public async list(queryInput: RuntimeQuery = {}): Promise<readonly RuntimeJobRecord[]> {
    const {
      states: stateValues,
      queues: queueValues,
      kinds: kindValues,
      limit,
    } = snapshotRuntimeQuery(queryInput);
    const states = stateValues === null ? null : new Set(stateValues);
    const queues = queueValues === null ? null : new Set(queueValues);
    const kinds = kindValues === null ? null : new Set(kindValues);
    const snapshot = await this.#journal.snapshot();
    return Object.values(snapshot.jobs)
      .filter((job) => !states || states.has(job.state))
      .filter((job) => !queues || queues.has(job.spec.queue))
      .filter((job) => !kinds || kinds.has(job.spec.kind))
      .sort(
        (left, right) =>
          Date.parse(right.updatedAt) - Date.parse(left.updatedAt) ||
          left.id.localeCompare(right.id),
      )
      .slice(0, limit)
      .map(cloneJson);
  }'''
source = replace_once(source, old_reads, new_reads, "runtime read methods")

old_cancellation_read = r'''  public async cancellationRequested(jobId: string): Promise<boolean> {
    return (await this.get(jobId))?.cancellationRequestedAt !== undefined;
  }'''

new_cancellation_read = r'''  public async cancellationRequested(jobIdInput: string): Promise<boolean> {
    const jobId = snapshotRuntimeJobId(jobIdInput);
    const snapshot = await this.#journal.snapshot();
    return snapshot.jobs[jobId]?.cancellationRequestedAt !== undefined;
  }'''
source = replace_once(
    source,
    old_cancellation_read,
    new_cancellation_read,
    "runtime cancellation read",
)

SOURCE_PATH.write_text(source, encoding="utf-8")
