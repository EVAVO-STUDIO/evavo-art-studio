import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  LocalArtifactStore,
  type ArtifactDescriptorInput,
  type ArtifactId,
} from "@evavo/art-artifacts";
import {
  LocalRuntimeRepository,
  RuntimeError,
  type RuntimeJobState,
  type RuntimeJobSubmission,
} from "@evavo/art-runtime";

export interface LocalControlValues {
  readonly input?: string;
  readonly descriptor?: string;
  readonly output?: string;
  readonly "runtime-root"?: string;
  readonly "artifact-root"?: string;
  readonly artifact?: string;
  readonly job?: string;
  readonly state?: string;
  readonly queue?: string;
  readonly kind?: string;
  readonly limit?: string;
  readonly actor?: string;
  readonly attempts?: string;
  readonly after?: string;
  readonly force?: boolean;
  readonly namespace?: string;
  readonly name?: string;
  readonly "expected-generation"?: string;
}

export type LocalControlResult =
  | Readonly<{ handled: false }>
  | Readonly<{ handled: true; value: unknown }>;

const RUNTIME_STATES = new Set<RuntimeJobState>([
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

function runtimeRoot(values: LocalControlValues): string {
  return path.resolve(
    values["runtime-root"] ??
      process.env.EVAVO_ART_RUNTIME_ROOT ??
      ".art-studio/runtime",
  );
}

function artifactRoot(values: LocalControlValues): string {
  return path.resolve(
    values["artifact-root"] ??
      process.env.EVAVO_ART_ARTIFACT_ROOT ??
      ".art-studio/artifacts",
  );
}

function actor(values: LocalControlValues): string {
  return values.actor?.trim() || process.env.EVAVO_ART_ACTOR?.trim() || "cli";
}

function required(value: string | undefined, option: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${option} is required.`);
  return normalized;
}

function integer(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  option: string,
): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${option} must be an integer between ${minimum} and ${maximum}.`);
  }
  return parsed;
}

function artifactId(value: string | undefined): ArtifactId {
  const id = required(value, "--artifact");
  if (!/^artifact_[a-f0-9]{64}$/.test(id)) {
    throw new Error("--artifact must use artifact_<sha256> format.");
  }
  return id as ArtifactId;
}

function states(value: string | undefined): readonly RuntimeJobState[] | undefined {
  if (!value) return undefined;
  const result = [...new Set(value.split(",").map((entry) => entry.trim()).filter(Boolean))];
  if (!result.length) return undefined;
  for (const entry of result) {
    if (!RUNTIME_STATES.has(entry as RuntimeJobState)) {
      throw new Error(`Unsupported runtime state: ${entry}`);
    }
  }
  return result as RuntimeJobState[];
}

async function jsonFile(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(path.resolve(filePath), "utf8")) as unknown;
}

function object(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be a JSON object.`);
  }
  return value as Record<string, unknown>;
}

export async function handleLocalControlCommand(
  command: string,
  values: LocalControlValues,
): Promise<LocalControlResult> {
  const runtimeCommands = new Set([
    "runtime-submit",
    "runtime-list",
    "runtime-show",
    "runtime-events",
    "runtime-cancel",
    "runtime-pause",
    "runtime-resume",
    "runtime-redrive",
    "runtime-recover",
  ]);
  const artifactCommands = new Set([
    "artifact-put",
    "artifact-show",
    "artifact-verify",
    "artifact-ref-set",
    "artifact-ref-resolve",
  ]);
  if (!runtimeCommands.has(command) && !artifactCommands.has(command)) {
    return { handled: false };
  }

  if (artifactCommands.has(command)) {
    const store = new LocalArtifactStore({ root: artifactRoot(values) });
    if (command === "artifact-put") {
      const inputPath = path.resolve(required(values.input, "--input"));
      const descriptorPath = required(values.descriptor, "--descriptor");
      const descriptor = object(
        await jsonFile(descriptorPath),
        "Artifact descriptor",
      ) as unknown as ArtifactDescriptorInput;
      return {
        handled: true,
        value: await store.put(await readFile(inputPath), descriptor),
      };
    }
    if (command === "artifact-show") {
      return { handled: true, value: await store.get(artifactId(values.artifact)) };
    }
    if (command === "artifact-verify") {
      return { handled: true, value: await store.verify(artifactId(values.artifact)) };
    }
    const namespace = required(values.namespace, "--namespace");
    const name = required(values.name, "--name");
    if (command === "artifact-ref-resolve") {
      return { handled: true, value: await store.resolveReference(namespace, name) };
    }
    return {
      handled: true,
      value: await store.updateReference(
        namespace,
        name,
        artifactId(values.artifact),
        {
          actor: actor(values),
          ...(values["expected-generation"] === undefined
            ? {}
            : {
                expectedGeneration: integer(
                  values["expected-generation"],
                  0,
                  0,
                  Number.MAX_SAFE_INTEGER,
                  "--expected-generation",
                ),
              }),
        },
      ),
    };
  }

  const runtime = new LocalRuntimeRepository({ root: runtimeRoot(values) });
  if (command === "runtime-submit") {
    const input = await jsonFile(required(values.input, "--input"));
    if (Array.isArray(input)) {
      return {
        handled: true,
        value: await runtime.submitBatch(
          input as unknown as readonly RuntimeJobSubmission[],
          actor(values),
        ),
      };
    }
    return {
      handled: true,
      value: await runtime.submit(
        object(input, "Runtime submission") as unknown as RuntimeJobSubmission,
        actor(values),
      ),
    };
  }
  if (command === "runtime-list") {
    return {
      handled: true,
      value: await runtime.list({
        ...(states(values.state) ? { states: states(values.state) } : {}),
        ...(values.queue ? { queues: [values.queue.trim()] } : {}),
        ...(values.kind ? { kinds: [values.kind.trim()] } : {}),
        limit: integer(values.limit, 1_000, 1, 100_000, "--limit"),
      }),
    };
  }
  if (command === "runtime-events") {
    return {
      handled: true,
      value: await runtime.events(integer(values.after, 0, 0, Number.MAX_SAFE_INTEGER, "--after")),
    };
  }
  if (command === "runtime-recover") {
    return { handled: true, value: await runtime.recoverExpiredLeases(actor(values)) };
  }

  const jobId = required(values.job, "--job");
  if (command === "runtime-show") {
    return { handled: true, value: await runtime.get(jobId) };
  }
  if (command === "runtime-cancel") {
    return {
      handled: true,
      value: await runtime.cancel(jobId, actor(values), { force: values.force ?? false }),
    };
  }
  if (command === "runtime-pause") {
    return {
      handled: true,
      value: await runtime.pause(jobId, actor(values), { force: values.force ?? false }),
    };
  }
  if (command === "runtime-resume") {
    return { handled: true, value: await runtime.resume(jobId, actor(values)) };
  }
  if (command === "runtime-redrive") {
    return {
      handled: true,
      value: await runtime.redrive(
        jobId,
        integer(values.attempts, 1, 1, 50, "--attempts"),
        actor(values),
      ),
    };
  }

  throw new RuntimeError("RUNTIME_COMMAND_UNREACHABLE", `Unhandled command: ${command}`);
}
