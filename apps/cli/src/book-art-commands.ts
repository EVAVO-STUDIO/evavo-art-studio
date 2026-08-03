import { readFile } from "node:fs/promises";
import path from "node:path";

import { LocalArtifactStore } from "@evavo/art-artifacts";
import {
  BOOK_ART_PROFILE_CONTRACT,
  BOOK_ART_PROFILE_SCHEMA_VERSION,
  translateLegacyWebsiteBookArtGenerationPlan,
  translateLegacyWebsiteBookIllustrationGenerationPlan,
} from "@evavo/art-contracts";
import {
  BOOK_ART_PROVIDER_RUNTIME_CONTRACT,
  BOOK_ART_PROVIDER_RUNTIME_SCHEMA_VERSION,
  compileBookArtProviderShadowJob,
  submitBookArtProviderShadowJob,
  type BookArtProviderAdapterPolicyV1,
} from "@evavo/art-book-runtime";
import {
  DOCS_BOOK_ART_RELEASE_RUNTIME_CONTRACT,
  compileDocsBookArtReleaseShadowJob,
  submitDocsBookArtReleaseShadowJob,
} from "@evavo/art-book-runtime/docs-release";
import { inspectBookArtProviderShadowJob } from "@evavo/art-book-runtime/inspection";
import { registerLegacyBookArtBytes } from "@evavo/art-book-runtime/legacy-registration";
import { compareBookArtProviderShadowParity } from "@evavo/art-book-runtime/parity";
import { LocalRuntimeRepository } from "@evavo/art-runtime";

export interface BookArtCommandValues {
  readonly input?: string;
  readonly "runtime-root"?: string;
  readonly "artifact-root"?: string;
  readonly actor?: string;
}

export type BookArtCommandResult =
  | Readonly<{ handled: false }>
  | Readonly<{ handled: true; value: unknown; exitCode?: number }>;

const COMMANDS = new Set([
  "book-art-legacy-register",
  "book-art-legacy-plan-protocol",
  "book-art-legacy-plan-translate",
  "book-art-legacy-illustration-plan-protocol",
  "book-art-legacy-illustration-plan-translate",
  "book-art-provider-protocol",
  "book-art-provider-compile",
  "book-art-provider-submit",
  "book-art-provider-inspect",
  "book-art-provider-parity",
  "book-art-docs-release-protocol",
  "book-art-docs-release-compile",
  "book-art-docs-release-submit",
]);
const PARITY_FIELDS = new Set(["request", "websiteObservation"]);
const REGISTRATION_ENVELOPE_FIELDS = new Set(["registration", "sourceFile"]);

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

function artifactRoot(values: BookArtCommandValues): string {
  return path.resolve(
    values["artifact-root"] ??
      process.env.EVAVO_ART_ARTIFACT_ROOT ??
      ".art-studio/artifacts",
  );
}

function actor(
  values: BookArtCommandValues,
  fallback = "cli-book-art-shadow",
): string {
  return (
    values.actor?.trim() ||
    process.env.EVAVO_ART_ACTOR?.trim() ||
    fallback
  );
}

async function readInputObject(
  filePath: string,
  label: string,
): Promise<Record<string, unknown>> {
  const value = JSON.parse(
    await readFile(path.resolve(filePath), "utf8"),
  ) as unknown;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return value as Record<string, unknown>;
}

function configuredInputValue(
  input: Record<string, unknown>,
  adapterPolicy: BookArtProviderAdapterPolicyV1,
): Record<string, unknown> {
  if (Object.hasOwn(input, "adapterPolicy")) {
    throw new Error(
      "Book Art input must not contain adapterPolicy; configure EVAVO_BOOK_ART_PROVIDER_ADAPTER_IDS on the host.",
    );
  }
  return { ...input, adapterPolicy };
}

async function configuredInput(
  filePath: string,
  adapterPolicy: BookArtProviderAdapterPolicyV1,
): Promise<Record<string, unknown>> {
  return configuredInputValue(
    await readInputObject(filePath, "Book Art input"),
    adapterPolicy,
  );
}

async function configuredParityInput(
  filePath: string,
  adapterPolicy: BookArtProviderAdapterPolicyV1,
): Promise<Readonly<{
  request: Record<string, unknown>;
  websiteObservation: unknown;
}>> {
  const envelope = await readInputObject(filePath, "Book Art provider parity input");
  if (
    Object.keys(envelope).some((key) => !PARITY_FIELDS.has(key)) ||
    !Object.hasOwn(envelope, "request") ||
    !Object.hasOwn(envelope, "websiteObservation") ||
    !envelope.request ||
    typeof envelope.request !== "object" ||
    Array.isArray(envelope.request)
  ) {
    throw new Error(
      "Book Art provider parity input must contain exactly request and websiteObservation objects.",
    );
  }
  return {
    request: configuredInputValue(
      envelope.request as Record<string, unknown>,
      adapterPolicy,
    ),
    websiteObservation: envelope.websiteObservation,
  };
}

async function legacyRegistrationEnvelope(
  filePath: string,
): Promise<Readonly<{ registration: Record<string, unknown>; bytes: Buffer }>> {
  const envelopePath = path.resolve(filePath);
  const envelope = await readInputObject(
    envelopePath,
    "Legacy Book Art byte-registration input",
  );
  if (
    Object.keys(envelope).some(
      (key) => !REGISTRATION_ENVELOPE_FIELDS.has(key),
    ) ||
    !Object.hasOwn(envelope, "registration") ||
    !Object.hasOwn(envelope, "sourceFile") ||
    !envelope.registration ||
    typeof envelope.registration !== "object" ||
    Array.isArray(envelope.registration) ||
    typeof envelope.sourceFile !== "string"
  ) {
    throw new Error(
      "Legacy Book Art byte-registration input must contain exactly registration and sourceFile.",
    );
  }
  const sourceFile = envelope.sourceFile.trim();
  if (
    !sourceFile ||
    sourceFile.length > 1_024 ||
    sourceFile.includes("\0") ||
    path.isAbsolute(sourceFile)
  ) {
    throw new Error(
      "Legacy Book Art sourceFile must be one relative path beside the registration envelope.",
    );
  }
  const inputDirectory = path.dirname(envelopePath);
  const resolvedSource = path.resolve(inputDirectory, sourceFile);
  const relativeSource = path.relative(inputDirectory, resolvedSource);
  if (
    relativeSource === ".." ||
    relativeSource.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativeSource)
  ) {
    throw new Error(
      "Legacy Book Art sourceFile must remain inside the registration-envelope directory.",
    );
  }
  return {
    registration: envelope.registration as Record<string, unknown>,
    bytes: await readFile(resolvedSource),
  };
}

function providerProtocol(policy: BookArtProviderAdapterPolicyV1 | undefined) {
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
    inspectPerformsProviderCall: false,
    inspectionWritesArtifacts: false,
    parityPerformsProviderCall: false,
    parityWritesArtifacts: false,
    visualSimilarityEvaluated: false,
    cutoverEligible: false,
    candidateApprovalState: "unapproved",
    candidateStorageClass: "intermediate",
    selectionPerformed: false,
    promotionPerformed: false,
    bookUseBindingCreated: false,
    runtimeCutoverApproved: false,
    publicationPerformed: false,
  } as const;
}

function docsReleaseProtocol(
  policy: BookArtProviderAdapterPolicyV1 | undefined,
) {
  return {
    schemaVersion: BOOK_ART_PROVIDER_RUNTIME_SCHEMA_VERSION,
    contract: DOCS_BOOK_ART_RELEASE_RUNTIME_CONTRACT,
    shadowOnly: true,
    providerPolicyConfigured: policy !== undefined,
    providerPolicyEnvironment: {
      allowedAdapterIds: "EVAVO_BOOK_ART_PROVIDER_ADAPTER_IDS",
      preferredAdapterId: "EVAVO_BOOK_ART_PROVIDER_PREFERRED_ADAPTER",
      preferredModel: "EVAVO_BOOK_ART_PROVIDER_MODEL",
    },
    requiresReadyForArtShadowRelease: true,
    verifiesReleaseFingerprint: true,
    verifiesExactFinalBrief: true,
    verifiesRepositoryCompatibility: true,
    verifiesCompleteReleaseEvidence: true,
    oneCandidate: true,
    maximumRuntimeAttempts: 1,
    providerFallbackAllowed: false,
    compilePerformsProviderCall: false,
    submitPerformsProviderCall: false,
    candidateApprovalState: "unapproved",
    candidateStorageClass: "intermediate",
    authoritativeBookWritesPerformed: false,
    selectionPerformed: false,
    promotionPerformed: false,
    bookUseBindingCreated: false,
    runtimeCutoverApproved: false,
    publicationPerformed: false,
  } as const;
}


function legacyPlanProtocol() {
  return {
    schemaVersion: BOOK_ART_PROFILE_SCHEMA_VERSION,
    contract: BOOK_ART_PROFILE_CONTRACT,
    translationInputKind: "evavo_legacy_website_book_art_plan_translation_input",
    translationResultKind: "evavo_legacy_website_book_art_plan_translation_result",
    requiresCanonicalBookArtBrief: true,
    verifiesExactBriefFingerprint: true,
    verifiesLegacyPlanIdentity: true,
    verifiesCandidateUniqueness: true,
    verifiesArtDirectionDigest: true,
    rawLegacyPromptTrustedAsAuthority: false,
    translationReadOnly: true,
    providerCallPerformed: false,
    runtimeJobSubmitted: false,
    candidateArtifactsWritten: false,
    authoritativeBookWritesPerformed: false,
    selectionPerformed: false,
    promotionPerformed: false,
    bookUseBindingCreated: false,
    runtimeCutoverApproved: false,
    publicationPerformed: false,
  } as const;
}


function legacyIllustrationPlanProtocol() {
  return {
    schemaVersion: BOOK_ART_PROFILE_SCHEMA_VERSION,
    contract: BOOK_ART_PROFILE_CONTRACT,
    translationInputKind:
      "evavo_legacy_website_book_illustration_plan_translation_input",
    translationResultKind:
      "evavo_legacy_website_book_illustration_plan_translation_result",
    requiresCanonicalBookArtBrief: true,
    verifiesExactBriefFingerprint: true,
    verifiesLegacyPlanIdentity: true,
    verifiesCandidateUniqueness: true,
    verifiesArtDirectionDigest: true,
    verifiesStyleAuthorityDigest: true,
    verifiesPageAuthorityDigest: true,
    rawLegacyPromptTrustedAsAuthority: false,
    legacyLayoutTrustedAsArtAuthority: false,
    translationReadOnly: true,
    providerCallPerformed: false,
    runtimeJobSubmitted: false,
    candidateArtifactsWritten: false,
    authoritativeBookWritesPerformed: false,
    selectionPerformed: false,
    promotionPerformed: false,
    bookUseBindingCreated: false,
    runtimeCutoverApproved: false,
    publicationPerformed: false,
  };
}

export async function handleBookArtCommand(
  command: string,
  values: BookArtCommandValues,
): Promise<BookArtCommandResult> {
  if (!COMMANDS.has(command)) return { handled: false };
  if (command === "book-art-legacy-register") {
    const inputPath = required(values.input, "--input");
    const envelope = await legacyRegistrationEnvelope(inputPath);
    const result = await registerLegacyBookArtBytes(
      envelope.registration,
      envelope.bytes,
      {
        artifacts: new LocalArtifactStore({ root: artifactRoot(values) }),
        actor: actor(values, "cli-book-art-legacy-registration"),
      },
    );
    return {
      handled: true,
      value: result,
      ...(result.status === "registered" ? {} : { exitCode: 2 }),
    };
  }
  if (command === "book-art-legacy-plan-protocol") {
    return { handled: true, value: legacyPlanProtocol() };
  }
  if (command === "book-art-legacy-plan-translate") {
    const inputPath = required(values.input, "--input");
    const result = await translateLegacyWebsiteBookArtGenerationPlan(
      await readInputObject(inputPath, "Legacy Website Book Art plan translation input"),
    );
    return {
      handled: true,
      value: result,
      ...(result.status === "ready_for_shadow_comparison" ? {} : { exitCode: 2 }),
    };
  }

  if (command === "book-art-legacy-illustration-plan-protocol") {
    return { handled: true, value: legacyIllustrationPlanProtocol() };
  }
  if (command === "book-art-legacy-illustration-plan-translate") {
    const inputPath = required(values.input, "--input");
    const result =
      await translateLegacyWebsiteBookIllustrationGenerationPlan(
        await readInputObject(
          inputPath,
          "Legacy Website Book Illustration plan translation input",
        ),
      );
    return {
      handled: true,
      value: result,
      ...(result.status === "ready_for_shadow_comparison"
        ? {}
        : { exitCode: 2 }),
    };
  }
  const policy = providerPolicy();
  if (command === "book-art-provider-protocol") {
    return { handled: true, value: providerProtocol(policy) };
  }
  if (command === "book-art-docs-release-protocol") {
    return { handled: true, value: docsReleaseProtocol(policy) };
  }
  if (!policy) {
    throw new Error(
      "EVAVO_BOOK_ART_PROVIDER_ADAPTER_IDS must configure at least one allowed adapter.",
    );
  }
  const inputPath = required(values.input, "--input");
  if (command === "book-art-provider-parity") {
    const envelope = await configuredParityInput(inputPath, policy);
    const compilation = await compileBookArtProviderShadowJob(envelope.request);
    const result = await compareBookArtProviderShadowParity(
      compilation,
      envelope.websiteObservation,
      {
        runtime: new LocalRuntimeRepository({ root: runtimeRoot(values) }),
        artifacts: new LocalArtifactStore({ root: artifactRoot(values) }),
      },
    );
    return {
      handled: true,
      value: result,
      ...(result.status === "blocked" || result.status === "mismatched"
        ? { exitCode: 3 }
        : {}),
    };
  }

  const input = await configuredInput(inputPath, policy);
  if (command === "book-art-docs-release-compile") {
    const result = await compileDocsBookArtReleaseShadowJob(input);
    return {
      handled: true,
      value: result,
      ...(result.status === "ready" ? {} : { exitCode: 2 }),
    };
  }
  if (command === "book-art-docs-release-submit") {
    const result = await submitDocsBookArtReleaseShadowJob(input, {
      runtime: new LocalRuntimeRepository({ root: runtimeRoot(values) }),
      actor: actor(values),
    });
    return {
      handled: true,
      value: result,
      ...(result.status === "submitted" ? {} : { exitCode: 2 }),
    };
  }

  const compilation = await compileBookArtProviderShadowJob(input);
  if (command === "book-art-provider-compile") {
    return {
      handled: true,
      value: compilation,
      ...(compilation.status === "ready" ? {} : { exitCode: 2 }),
    };
  }
  if (command === "book-art-provider-inspect") {
    const result = await inspectBookArtProviderShadowJob(compilation, {
      runtime: new LocalRuntimeRepository({ root: runtimeRoot(values) }),
      artifacts: new LocalArtifactStore({ root: artifactRoot(values) }),
    });
    return {
      handled: true,
      value: result,
      ...(result.status === "blocked" || result.status === "failed"
        ? { exitCode: 3 }
        : {}),
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
