import "server-only";

import {
  canonicalBookJson,
  compileBookUnattendedAuthorialWritingExecution,
  listBookUnattendedAuthorialWritingCapabilities,
  sha256BookText,
  type BookUnattendedAuthorialWritingCompileResultV1,
  type BookWritingCandidateCoordinationResultV1,
} from "../../../../packages/core/src/index";
import type { BookWritingCandidateClientConfigV1 } from "./book-studio-writing-candidate-client";
import { coordinateBookWritingCandidate } from "./book-studio-writing-candidate-service";

export { listBookUnattendedAuthorialWritingCapabilities };

export interface BookUnattendedAuthorialWritingCoordinationResultV1 {
  outputKind: "evavo_docs_book_unattended_authorial_writing_coordination";
  schemaVersion: 1;
  status: BookWritingCandidateCoordinationResultV1["status"];
  compilation: BookUnattendedAuthorialWritingCompileResultV1;
  writingCoordination?: BookWritingCandidateCoordinationResultV1;
  coordinationFingerprint: string;
  blockers: string[];
  warnings: string[];
  providerCalled: boolean;
  oneBoundedStagePerAutomationCallRequired: true;
  oneProviderAttemptPerRevisionCycleRequired: true;
  providerFallbackAllowed: false;
  authoritativeBookStateWritePerformed: false;
  canonicalManuscriptMutationPerformed: false;
  artStudioCalled: false;
  automaticCanonicalAdmissionAllowed: false;
  automaticPublicationAllowed: false;
  runtimeCutoverApproved: false;
  publicationPerformed: false;
}

export async function coordinateBookUnattendedAuthorialWriting(
  input: unknown,
  options: Readonly<{
    config?: BookWritingCandidateClientConfigV1;
    fetchImpl?: typeof fetch;
  }> = {},
): Promise<BookUnattendedAuthorialWritingCoordinationResultV1> {
  const compilation = await compileBookUnattendedAuthorialWritingExecution(input);
  const candidateInput = compilation.authorialBridge.candidateCompileInput;
  const runtimePreview = compilation.authorialBridge.runtimeRequestPreview;
  if (
    compilation.status !== "ready"
    || !compilation.executionFingerprint
    || !candidateInput
    || !runtimePreview
  ) {
    return finish(compilation, undefined, "blocked", false, compilation.blockers, compilation.warnings);
  }

  const writingCoordination = await coordinateBookWritingCandidate(candidateInput, {
    ...options,
    expectedRuntimeRequestFingerprint: runtimePreview.runtimeRequestFingerprint,
  });
  const observedRuntimeFingerprint = writingCoordination.runtimeRequest?.runtimeRequestFingerprint;
  const fingerprintMismatch = observedRuntimeFingerprint !== undefined
    && observedRuntimeFingerprint !== runtimePreview.runtimeRequestFingerprint;
  const blockers = unique([
    ...writingCoordination.blockers,
    ...(fingerprintMismatch
      ? ["DOCS_BOOK_UNATTENDED_AUTHORIAL_RUNTIME_FINGERPRINT_MISMATCH"]
      : []),
  ]);
  const status = fingerprintMismatch ? "blocked" : writingCoordination.status;
  return finish(
    compilation,
    writingCoordination,
    status,
    writingCoordination.providerCalled,
    blockers,
    unique([...compilation.warnings, ...writingCoordination.warnings]),
  );
}

async function finish(
  compilation: BookUnattendedAuthorialWritingCompileResultV1,
  writingCoordination: BookWritingCandidateCoordinationResultV1 | undefined,
  status: BookWritingCandidateCoordinationResultV1["status"],
  providerCalled: boolean,
  blockers: string[],
  warnings: string[],
): Promise<BookUnattendedAuthorialWritingCoordinationResultV1> {
  const coordinationFingerprint = await sha256BookText(canonicalBookJson({
    outputKind: "evavo_docs_book_unattended_authorial_writing_coordination_identity",
    schemaVersion: 1,
    executionFingerprint: compilation.executionFingerprint ?? null,
    runtimeRequestFingerprint:
      writingCoordination?.runtimeRequest?.runtimeRequestFingerprint ?? null,
    runtimeResultFingerprint:
      writingCoordination?.runtimeResult?.resultFingerprint ?? null,
    status,
    blockers: unique(blockers).sort(),
    warnings: unique(warnings).sort(),
    providerCalled,
  }));
  return {
    outputKind: "evavo_docs_book_unattended_authorial_writing_coordination",
    schemaVersion: 1,
    status,
    compilation,
    ...(writingCoordination === undefined ? {} : { writingCoordination }),
    coordinationFingerprint,
    blockers: unique(blockers).sort(),
    warnings: unique(warnings).sort(),
    providerCalled,
    oneBoundedStagePerAutomationCallRequired: true,
    oneProviderAttemptPerRevisionCycleRequired: true,
    providerFallbackAllowed: false,
    authoritativeBookStateWritePerformed: false,
    canonicalManuscriptMutationPerformed: false,
    artStudioCalled: false,
    automaticCanonicalAdmissionAllowed: false,
    automaticPublicationAllowed: false,
    runtimeCutoverApproved: false,
    publicationPerformed: false,
  };
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
