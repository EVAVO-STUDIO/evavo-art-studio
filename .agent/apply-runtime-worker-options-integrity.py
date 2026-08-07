from pathlib import Path

ROOT = Path.cwd()
NORMALIZE_PATH = ROOT / "packages/runtime/src/normalize.ts"
WORKER_PATH = ROOT / "packages/runtime/src/worker.ts"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


def replace_between(
    text: str,
    start_marker: str,
    end_marker: str,
    replacement: str,
    label: str,
) -> str:
    start = text.find(start_marker)
    if start < 0:
        raise RuntimeError(f"{label}: start marker not found")
    end = text.find(end_marker, start)
    if end < 0:
        raise RuntimeError(f"{label}: end marker not found")
    return text[:start] + replacement + text[end:]


normalize_text = NORMALIZE_PATH.read_text(encoding="utf-8")
normalize_replacement = r'''export function normalizeRuntimeWorkerDescriptor(
  input: RuntimeWorkerDescriptor,
): RuntimeWorkerDescriptor {
  const code = "RUNTIME_WORKER_OPTIONS_INVALID";
  const source = runtimeInputRecord(input, "Worker descriptor", code);
  const id = safeName(
    readRuntimeInput(source, "id", "worker", code),
    "worker.id",
    code,
  );
  const capabilities = normalizedCapabilityList(
    readRuntimeInput(source, "capabilities", "worker", code),
    "worker.capabilities",
    code,
    512,
  );
  const queuesInput = readRuntimeInput(source, "queues", "worker", code);
  const queues = queuesInput === undefined
    ? undefined
    : normalizedCapabilityList(
        queuesInput,
        "worker.queues",
        code,
        256,
      );
  const profileInputsValue = readRuntimeInput(
    source,
    "capabilityProfiles",
    "worker",
    code,
  );
  const profileInputs = profileInputsValue === undefined
    ? Object.freeze([])
    : snapshotRuntimeArray(
        profileInputsValue,
        "worker.capabilityProfiles",
        code,
        128,
      );
  const profileIds = new Set<string>();
  const capabilityProfiles: RuntimeWorkerCapabilityProfile[] = profileInputs.map(
    (profile, index) => {
      const profileName = `worker.capabilityProfiles[${index}]`;
      const profileSource = runtimeInputRecord(profile, profileName, code);
      const profileId = safeName(
        readRuntimeInput(profileSource, "id", profileName, code),
        `${profileName}.id`,
        code,
      );
      if (profileIds.has(profileId)) {
        throw new RuntimeError(
          code,
          `Worker capability profile is declared more than once: ${profileId}.`,
        );
      }
      profileIds.add(profileId);
      const profileCapabilities = normalizedCapabilityList(
        readRuntimeInput(profileSource, "capabilities", profileName, code),
        `${profileName}.capabilities`,
        code,
        256,
      );
      if (!profileCapabilities.length) {
        throw new RuntimeError(
          code,
          `Worker capability profile ${profileId} must declare at least one capability.`,
        );
      }
      return Object.freeze({
        id: profileId,
        capabilities: profileCapabilities,
      });
    },
  );
  capabilityProfiles.sort((left, right) => left.id.localeCompare(right.id));
  const normalized: RuntimeWorkerDescriptor = {
    id,
    capabilities,
    ...(capabilityProfiles.length
      ? { capabilityProfiles: Object.freeze(capabilityProfiles) }
      : {}),
    ...(queues === undefined ? {} : { queues }),
  };
  return freezeRuntimeValue(normalized);
}
'''
normalize_text = replace_between(
    normalize_text,
    "export function normalizeRuntimeWorkerDescriptor(\n",
    "\nfunction timestamp(",
    normalize_replacement,
    "worker descriptor normalizer",
)
NORMALIZE_PATH.write_text(normalize_text, encoding="utf-8")

worker_text = WORKER_PATH.read_text(encoding="utf-8")
worker_text = replace_once(
    worker_text,
    "  type RuntimeHeartbeatResult,\n  type RuntimeJobRecord,\n",
    "  type RuntimeHeartbeatResult,\n  type RuntimeJobHandler,\n  type RuntimeJobRecord,\n",
    "runtime job handler import",
)

worker_helpers = r'''const SAFE_HANDLER_NAME = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const MAXIMUM_HANDLERS = 10_000;

type RuntimeWorkerOptionSnapshot = Readonly<{
  runtime: RuntimeWorkerOptions["runtime"];
  artifacts: RuntimeWorkerOptions["artifacts"];
  worker: RuntimeWorkerOptions["worker"];
  handlers: RuntimeWorkerOptions["handlers"];
  concurrency: number;
  heartbeatIntervalMs?: number;
}>;

function boundedInteger(
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
      "RUNTIME_WORKER_OPTIONS_INVALID",
      `${name} must be an integer between ${minimum} and ${maximum}.`,
    );
  }
  return result;
}

function workerOptionsRecord(
  value: unknown,
  name: string,
): Readonly<Record<string, unknown>> {
  let recordLike = false;
  try {
    recordLike =
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value);
  } catch {
    throw new RuntimeError(
      "RUNTIME_WORKER_OPTIONS_INVALID",
      `${name} could not be inspected safely.`,
    );
  }
  if (!recordLike) {
    throw new RuntimeError(
      "RUNTIME_WORKER_OPTIONS_INVALID",
      `${name} must be an object.`,
    );
  }
  return value as Readonly<Record<string, unknown>>;
}

function readWorkerOption(
  source: Readonly<Record<string, unknown>>,
  field: string,
  name: string,
): unknown {
  try {
    return source[field];
  } catch {
    throw new RuntimeError(
      "RUNTIME_WORKER_OPTIONS_INVALID",
      `${name}.${field} could not be read safely.`,
    );
  }
}

function workerService<T>(value: unknown, name: string): T {
  let serviceLike = false;
  try {
    serviceLike =
      value !== null &&
      (typeof value === "object" || typeof value === "function") &&
      !Array.isArray(value);
  } catch {
    throw new RuntimeError(
      "RUNTIME_WORKER_OPTIONS_INVALID",
      `${name} could not be inspected safely.`,
    );
  }
  if (!serviceLike) {
    throw new RuntimeError(
      "RUNTIME_WORKER_OPTIONS_INVALID",
      `${name} must be a service object.`,
    );
  }
  return value as T;
}

function safeHandlerName(value: string): string {
  if (!SAFE_HANDLER_NAME.test(value)) {
    throw new RuntimeError(
      "RUNTIME_WORKER_OPTIONS_INVALID",
      "Worker handler names must contain 1 to 128 safe characters.",
    );
  }
  return value;
}

function snapshotHandlers(value: unknown): RuntimeWorkerOptions["handlers"] {
  const source = workerOptionsRecord(value, "handlers");
  let keys: readonly string[];
  try {
    keys = Object.keys(source).sort();
  } catch {
    throw new RuntimeError(
      "RUNTIME_WORKER_OPTIONS_INVALID",
      "Worker handler keys could not be read safely.",
    );
  }
  if (keys.length > MAXIMUM_HANDLERS) {
    throw new RuntimeError(
      "RUNTIME_WORKER_OPTIONS_INVALID",
      `Worker handlers must contain no more than ${MAXIMUM_HANDLERS} entries.`,
    );
  }

  const handlers = Object.create(null) as Record<string, RuntimeJobHandler>;
  for (const key of keys) {
    const handlerName = safeHandlerName(key);
    const handler = readWorkerOption(source, key, "handlers");
    if (typeof handler !== "function") {
      throw new RuntimeError(
        "RUNTIME_WORKER_OPTIONS_INVALID",
        `Worker handler ${handlerName} must be a function.`,
      );
    }
    Object.defineProperty(handlers, handlerName, {
      value: handler,
      enumerable: true,
      configurable: false,
      writable: false,
    });
  }
  return Object.freeze(handlers);
}

function snapshotRuntimeWorkerOptions(
  input: unknown,
): RuntimeWorkerOptionSnapshot {
  const source = workerOptionsRecord(input, "Runtime worker options");
  const runtime = workerService<RuntimeWorkerOptions["runtime"]>(
    readWorkerOption(source, "runtime", "options"),
    "runtime",
  );
  const artifacts = workerService<RuntimeWorkerOptions["artifacts"]>(
    readWorkerOption(source, "artifacts", "options"),
    "artifacts",
  );
  const worker = normalizeRuntimeWorkerDescriptor(
    readWorkerOption(source, "worker", "options") as RuntimeWorkerOptions["worker"],
  );
  const handlers = snapshotHandlers(
    readWorkerOption(source, "handlers", "options"),
  );
  const concurrency = boundedInteger(
    readWorkerOption(source, "concurrency", "options"),
    1,
    1,
    64,
    "concurrency",
  );
  const heartbeatIntervalInput = readWorkerOption(
    source,
    "heartbeatIntervalMs",
    "options",
  );
  const heartbeatIntervalMs = heartbeatIntervalInput === undefined
    ? undefined
    : boundedInteger(
        heartbeatIntervalInput,
        1_000,
        1_000,
        3_600_000,
        "heartbeatIntervalMs",
      );

  return Object.freeze({
    runtime,
    artifacts,
    worker,
    handlers,
    concurrency,
    ...(heartbeatIntervalMs === undefined ? {} : { heartbeatIntervalMs }),
  });
}
'''
worker_text = replace_between(
    worker_text,
    "function boundedInteger(\n",
    "\nfunction failureFor(",
    worker_helpers,
    "worker option helpers",
)

constructor_replacement = r'''  public constructor(options: RuntimeWorkerOptions) {
    const snapshot = snapshotRuntimeWorkerOptions(options);
    this.#options = Object.freeze({
      runtime: snapshot.runtime,
      artifacts: snapshot.artifacts,
      worker: snapshot.worker,
      handlers: snapshot.handlers,
    });
    this.#concurrency = snapshot.concurrency;
    this.#heartbeatIntervalMs = snapshot.heartbeatIntervalMs;
  }
'''
worker_text = replace_between(
    worker_text,
    "  public constructor(options: RuntimeWorkerOptions) {\n",
    "\n  async #resultArtifact(",
    constructor_replacement,
    "runtime worker constructor",
)
WORKER_PATH.write_text(worker_text, encoding="utf-8")
