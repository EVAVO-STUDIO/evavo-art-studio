import {
  compileDocsBookArtReleaseEnvelope,
  type DocsBookArtReleaseCompilationResultV1,
} from "@evavo/art-contracts";
import type { RuntimeJobRecord, RuntimeRepository } from "@evavo/art-runtime";

import {
  BOOK_ART_PROVIDER_RUNTIME_SCHEMA_VERSION,
  compileBookArtProviderShadowJob,
  submitBookArtProviderShadowJob,
  type BookArtProviderAdapterPolicyV1,
  type BookArtProviderShadowJobCompilationResultV1,
  type BookArtProviderShadowJobPlanV1,
  type BookArtProviderShadowJobSubmissionResultV1,
} from "./index.js";

export const DOCS_BOOK_ART_RELEASE_RUNTIME_CONTRACT =
  "evavo_docs_book_art_release_shadow_runtime_v1" as const;

export interface DocsBookArtReleaseShadowJobInputV1 {
  outputKind: "evavo_docs_book_art_release_shadow_job_input";
  schemaVersion: typeof BOOK_ART_PROVIDER_RUNTIME_SCHEMA_VERSION;
  executionId: string;
  requestedAt: string;
  release: unknown;
  adapterPolicy: BookArtProviderAdapterPolicyV1;
}

export interface DocsBookArtReleaseShadowJobCompilationResultV1 {
  outputKind: "evavo_docs_book_art_release_shadow_job_compilation_result";
  schemaVersion: typeof BOOK_ART_PROVIDER_RUNTIME_SCHEMA_VERSION;
  contract: typeof DOCS_BOOK_ART_RELEASE_RUNTIME_CONTRACT;
  status: "blocked" | "ready";
  release: DocsBookArtReleaseCompilationResultV1;
  providerCompilation?: BookArtProviderShadowJobCompilationResultV1;
  plan?: BookArtProviderShadowJobPlanV1;
  blockers: string[];
  warnings: string[];
  releaseVerified: boolean;
  exactFinalArtBriefVerified: boolean;
  shadowOnly: true;
  providerCallPerformed: false;
  candidateArtifactsWritten: false;
  authoritativeBookWritesPerformed: false;
  selectionPerformed: false;
  promotionPerformed: false;
  bookUseBindingCreated: false;
  runtimeCutoverApproved: false;
  publicationPerformed: false;
}

export interface DocsBookArtReleaseShadowJobSubmissionResultV1 {
  outputKind: "evavo_docs_book_art_release_shadow_job_submission_result";
  schemaVersion: typeof BOOK_ART_PROVIDER_RUNTIME_SCHEMA_VERSION;
  contract: typeof DOCS_BOOK_ART_RELEASE_RUNTIME_CONTRACT;
  status: "blocked" | "submitted";
  release: DocsBookArtReleaseCompilationResultV1;
  providerSubmission?: BookArtProviderShadowJobSubmissionResultV1;
  plan?: BookArtProviderShadowJobPlanV1;
  job?: RuntimeJobRecord;
  blockers: string[];
  warnings: string[];
  releaseVerified: boolean;
  exactFinalArtBriefVerified: boolean;
  shadowOnly: true;
  providerCallPerformed: false;
  candidateArtifactsWritten: false;
  authoritativeBookWritesPerformed: false;
  selectionPerformed: false;
  promotionPerformed: false;
  bookUseBindingCreated: false;
  runtimeCutoverApproved: false;
  publicationPerformed: false;
}

const INPUT_FIELDS = new Set([
  "outputKind",
  "schemaVersion",
  "executionId",
  "requestedAt",
  "release",
  "adapterPolicy",
]);

type UnknownRecord = Record<string, unknown>;

export async function compileDocsBookArtReleaseShadowJob(
  value: unknown,
): Promise<DocsBookArtReleaseShadowJobCompilationResultV1> {
  const input = record(value);
  const envelope = input?.release;
  const release = await compileDocsBookArtReleaseEnvelope(envelope);
  const blockers: string[] = [];
  if (!input) {
    blockers.push("Docs Book Art release shadow-job input must be one object.");
  } else {
    const unknown = Object.keys(input).filter((key) => !INPUT_FIELDS.has(key)).sort();
    if (unknown.length) {
      blockers.push(
        `Docs Book Art release shadow-job input contains unsupported fields: ${unknown.join(", ")}.`,
      );
    }
    if (
      input.outputKind !== "evavo_docs_book_art_release_shadow_job_input" ||
      input.schemaVersion !== BOOK_ART_PROVIDER_RUNTIME_SCHEMA_VERSION
    ) {
      blockers.push("Docs Book Art release shadow-job kind or version is invalid.");
    }
  }
  blockers.push(...release.blockers);
  if (blockers.length || !input || !release.workOrder) {
    return blockedCompilation(release, blockers, release.warnings);
  }

  const providerCompilation = await compileBookArtProviderShadowJob({
    outputKind: "evavo_book_art_provider_shadow_job_input",
    schemaVersion: BOOK_ART_PROVIDER_RUNTIME_SCHEMA_VERSION,
    executionId: input.executionId,
    requestedAt: input.requestedAt,
    workOrder: release.workOrder,
    adapterPolicy: input.adapterPolicy,
  });
  blockers.push(...providerCompilation.blockers);
  if (providerCompilation.status !== "ready" || !providerCompilation.plan) {
    return blockedCompilation(
      release,
      blockers,
      [...release.warnings, ...providerCompilation.warnings],
      providerCompilation,
    );
  }
  return {
    outputKind: "evavo_docs_book_art_release_shadow_job_compilation_result",
    schemaVersion: BOOK_ART_PROVIDER_RUNTIME_SCHEMA_VERSION,
    contract: DOCS_BOOK_ART_RELEASE_RUNTIME_CONTRACT,
    status: "ready",
    release,
    providerCompilation,
    plan: providerCompilation.plan,
    blockers: [],
    warnings: unique([...release.warnings, ...providerCompilation.warnings]),
    releaseVerified: true,
    exactFinalArtBriefVerified: true,
    shadowOnly: true,
    providerCallPerformed: false,
    candidateArtifactsWritten: false,
    authoritativeBookWritesPerformed: false,
    selectionPerformed: false,
    promotionPerformed: false,
    bookUseBindingCreated: false,
    runtimeCutoverApproved: false,
    publicationPerformed: false,
  };
}

export async function submitDocsBookArtReleaseShadowJob(
  value: unknown,
  options: Readonly<{
    runtime: RuntimeRepository;
    actor: string;
    now?: Date;
  }>,
): Promise<DocsBookArtReleaseShadowJobSubmissionResultV1> {
  const input = record(value);
  const release = await compileDocsBookArtReleaseEnvelope(input?.release);
  const compilation = await compileDocsBookArtReleaseShadowJob(value);
  if (
    compilation.status !== "ready" ||
    !compilation.plan ||
    !input ||
    !release.workOrder
  ) {
    return blockedSubmission(
      release,
      compilation.blockers,
      compilation.warnings,
    );
  }
  const providerSubmission = await submitBookArtProviderShadowJob(
    {
      outputKind: "evavo_book_art_provider_shadow_job_input",
      schemaVersion: BOOK_ART_PROVIDER_RUNTIME_SCHEMA_VERSION,
      executionId: input.executionId,
      requestedAt: input.requestedAt,
      workOrder: release.workOrder,
      adapterPolicy: input.adapterPolicy,
    },
    options,
  );
  if (providerSubmission.status !== "submitted" || !providerSubmission.job) {
    return blockedSubmission(
      release,
      providerSubmission.blockers,
      [...compilation.warnings, ...providerSubmission.warnings],
      providerSubmission,
    );
  }
  return {
    outputKind: "evavo_docs_book_art_release_shadow_job_submission_result",
    schemaVersion: BOOK_ART_PROVIDER_RUNTIME_SCHEMA_VERSION,
    contract: DOCS_BOOK_ART_RELEASE_RUNTIME_CONTRACT,
    status: "submitted",
    release,
    providerSubmission,
    plan: providerSubmission.plan,
    job: providerSubmission.job,
    blockers: [],
    warnings: unique([...compilation.warnings, ...providerSubmission.warnings]),
    releaseVerified: true,
    exactFinalArtBriefVerified: true,
    shadowOnly: true,
    providerCallPerformed: false,
    candidateArtifactsWritten: false,
    authoritativeBookWritesPerformed: false,
    selectionPerformed: false,
    promotionPerformed: false,
    bookUseBindingCreated: false,
    runtimeCutoverApproved: false,
    publicationPerformed: false,
  };
}

function blockedCompilation(
  release: DocsBookArtReleaseCompilationResultV1,
  blockers: string[],
  warnings: string[],
  providerCompilation?: BookArtProviderShadowJobCompilationResultV1,
): DocsBookArtReleaseShadowJobCompilationResultV1 {
  return {
    outputKind: "evavo_docs_book_art_release_shadow_job_compilation_result",
    schemaVersion: BOOK_ART_PROVIDER_RUNTIME_SCHEMA_VERSION,
    contract: DOCS_BOOK_ART_RELEASE_RUNTIME_CONTRACT,
    status: "blocked",
    release,
    ...(providerCompilation === undefined ? {} : { providerCompilation }),
    blockers: unique(blockers),
    warnings: unique(warnings),
    releaseVerified: false,
    exactFinalArtBriefVerified: false,
    shadowOnly: true,
    providerCallPerformed: false,
    candidateArtifactsWritten: false,
    authoritativeBookWritesPerformed: false,
    selectionPerformed: false,
    promotionPerformed: false,
    bookUseBindingCreated: false,
    runtimeCutoverApproved: false,
    publicationPerformed: false,
  };
}

function blockedSubmission(
  release: DocsBookArtReleaseCompilationResultV1,
  blockers: string[],
  warnings: string[],
  providerSubmission?: BookArtProviderShadowJobSubmissionResultV1,
): DocsBookArtReleaseShadowJobSubmissionResultV1 {
  return {
    outputKind: "evavo_docs_book_art_release_shadow_job_submission_result",
    schemaVersion: BOOK_ART_PROVIDER_RUNTIME_SCHEMA_VERSION,
    contract: DOCS_BOOK_ART_RELEASE_RUNTIME_CONTRACT,
    status: "blocked",
    release,
    ...(providerSubmission === undefined ? {} : { providerSubmission }),
    blockers: unique(blockers),
    warnings: unique(warnings),
    releaseVerified: false,
    exactFinalArtBriefVerified: false,
    shadowOnly: true,
    providerCallPerformed: false,
    candidateArtifactsWritten: false,
    authoritativeBookWritesPerformed: false,
    selectionPerformed: false,
    promotionPerformed: false,
    bookUseBindingCreated: false,
    runtimeCutoverApproved: false,
    publicationPerformed: false,
  };
}

function record(value: unknown): UnknownRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : undefined;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
