import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  BOOK_ART_PROVIDER_RUNTIME_CONTRACT,
  BOOK_ART_PROVIDER_RUNTIME_SCHEMA_VERSION,
  compileBookArtProviderShadowJob,
  submitBookArtProviderShadowJob,
  type BookArtProviderAdapterPolicyV1,
} from "@evavo/art-book-runtime";
import { LocalRuntimeRepository } from "@evavo/art-runtime";

export interface BookArtCommandValues {
  readonly input?: string;
  readonly "runtime-root"?: string;
  readonly actor?: string;
}

export type BookArtCommandResult =
  | Readonly<{ handled: false }>
  | Readonly<{ handled: true; value: unknown; exitCode?: number }>;

const COMMANDS = new Set([
  "book-art-provider-protocol",
  "book-art-provider-compile",
  "book-art-provider-submit",
]);

function envCsv(name: string): string[] {
  return [
    ...new Set(
      (process.env[name] ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ].sort();
}

function optionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function providerPolicy(): BookArtProviderAdapterPolicyV1 | undefined {
  const allowedAdapterIds = envCsv("EVAVO_BOOK_ART_PROVIDER_ADAPTER_IDS");
  if (!allowedAdapterIds.length) return undefined;
  const preferredAdapterId = optionalEnv(
    "EVAVO_BOOK_ART_PROVIDER_PREFERRED_ADAPTER",
  );
  const preferredModel = optionalEnv("EVAVO_BOOK_ART_PROVIDER_MODEL");
  return {
    allowedAdapterIds,
    ...(preferredAdapterId === undefined ? {} : { preferredAdapterId }),
    ...(preferredModel === undefined ? {} : { preferredModel }),
  };
}

function required(value: string | undefined, option: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${option} is required.`);
  return normalized;
}

function runtimeRoot(values: BookArtCommandValues): string {
  return path.resolve(
    values["runtime-root"] ??
      process.env.EVAVO_ART_RUNTIME_ROOT ??
      ".art-studio/runtime",
  );
}

function actor(values: BookArtCommandValues): string {
  return (
    values.actor?.trim() ||
    process.env.EVAVO_ART_ACTOR?.trim() ||
    "cli-book-art-shadow"
  );
}

async function configuredInput(
  filePath: string,
  adapterPolicy: BookArtProviderAdapterPolicyV1,
): Promise<Record<string, unknown>> {
  const value = JSON.parse(
    await readFile(path.resolve(filePath), "utf8"),
  ) as unknown;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Book Art provider input must be a JSON object.");
  }
  const input = value as Record<string, unknown>;
  if (Object.hasOwn(input, "adapterPolicy")) {
    throw new Error(
      "Book Art provider input must not contain adapterPolicy; configure EVAVO_BOOK_ART_PROVIDER_ADAPTER_IDS on the host.",
    );
  }
  return { ...input, adapterPolicy };
}

function protocol(policy: BookArtProviderAdapterPolicyV1 | undefined) {
  return {
    schemaVersion: BOOK_ART_PROVIDER_RUNTIME_SCHEMA_VERSION,
    contract: BOOK_ART_PROVIDER_RUNTIME_CONTRACT,
    shadowOnly: true,
    providerPolicyConfigured: policy !== undefined,
    providerPolicyEnvironment: {
      allowedAdapterIds: "EVAVO_BOOK_ART_PROVIDER_ADAPTER_IDS",
      preferredAdapterId: "EVAVO_BOOK_ART_PROVIDER_PREFERRED_ADAPTER",
      preferredModel: "EVAVO_BOOK_ART_PROVIDER_MODEL",
    },
    oneCandidate: true,
    maximumRuntimeAttempts: 1,
    providerFallbackAllowed: false,
    compilePerformsProviderCall: false,
    submitPerformsProviderCall: false,
    candidateApprovalState: "unapproved",
    candidateStorageClass: "intermediate",
    selectionPerformed: false,
    promotionPerformed: false,
    bookUseBindingCreated: false,
    runtimeCutoverApproved: false,
    publicationPerformed: false,
  } as const;
}

export async function handleBookArtCommand(
  command: string,
  values: BookArtCommandValues,
): Promise<BookArtCommandResult> {
  if (!COMMANDS.has(command)) return { handled: false };
  const policy = providerPolicy();
  if (command === "book-art-provider-protocol") {
    return { handled: true, value: protocol(policy) };
  }
  if (!policy) {
    throw new Error(
      "EVAVO_BOOK_ART_PROVIDER_ADAPTER_IDS must configure at least one allowed adapter.",
    );
  }
  const input = await configuredInput(
    required(values.input, "--input"),
    policy,
  );
  if (command === "book-art-provider-compile") {
    const result = await compileBookArtProviderShadowJob(input);
    return {
      handled: true,
      value: result,
      ...(result.status === "ready" ? {} : { exitCode: 2 }),
    };
  }

  const result = await submitBookArtProviderShadowJob(input, {
    runtime: new LocalRuntimeRepository({ root: runtimeRoot(values) }),
    actor: actor(values),
  });
  return {
    handled: true,
    value: result,
    ...(result.status === "submitted" ? {} : { exitCode: 2 }),
  };
}
