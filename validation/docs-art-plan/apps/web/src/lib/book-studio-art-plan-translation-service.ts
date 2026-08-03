import "server-only";

import {
  BOOK_ART_PLAN_TRANSLATION_CONTRACT,
  compileBookArtPlanTranslationRequest,
  validateBookArtPlanTranslationResult,
  type BookArtPlanTranslationCoordinationV1,
} from "../../../../packages/core/src/book-studio-art-plan-translation";
import {
  callArtStudioBookPlanTranslation,
  resolveBookArtPlanTranslationClientConfig,
  type BookArtPlanTranslationClientConfigV1,
} from "./book-studio-art-plan-translation-client";

export async function coordinateBookArtPlanTranslation(
  input: unknown,
  options: Readonly<{
    config?: BookArtPlanTranslationClientConfigV1;
    fetchImpl?: typeof fetch;
  }> = {},
): Promise<BookArtPlanTranslationCoordinationV1> {
  const compilation = await compileBookArtPlanTranslationRequest(input);
  if (
    compilation.status !== "ready" ||
    !compilation.request ||
    !compilation.translationKind ||
    !compilation.requestFingerprint
  ) {
    return blocked({
      ...(compilation.translationKind === undefined
        ? {}
        : { translationKind: compilation.translationKind }),
      ...(compilation.requestFingerprint === undefined
        ? {}
        : { requestFingerprint: compilation.requestFingerprint }),
      blockers: compilation.blockers,
      warnings: compilation.warnings,
      artStudioCalled: false,
    });
  }
  let config: BookArtPlanTranslationClientConfigV1;
  try {
    config = options.config ?? resolveBookArtPlanTranslationClientConfig();
  } catch (error) {
    return blocked({
      translationKind: compilation.translationKind,
      requestFingerprint: compilation.requestFingerprint,
      blockers: [stableCode(error)],
      warnings: compilation.warnings,
      artStudioCalled: false,
    });
  }
  let remoteResult: unknown;
  try {
    remoteResult = await callArtStudioBookPlanTranslation(
      compilation.request,
      config,
      options.fetchImpl ?? fetch,
    );
  } catch (error) {
    const code = stableCode(error);
    return blocked({
      translationKind: compilation.translationKind,
      requestFingerprint: compilation.requestFingerprint,
      blockers: [code],
      warnings: compilation.warnings,
      artStudioCalled: remoteCallMayHaveOccurred(code),
    });
  }
  return validateBookArtPlanTranslationResult(input, remoteResult);
}

function blocked(input: Readonly<{
  translationKind?: BookArtPlanTranslationCoordinationV1["translationKind"];
  requestFingerprint?: string;
  blockers: string[];
  warnings: string[];
  artStudioCalled: boolean;
}>): BookArtPlanTranslationCoordinationV1 {
  return {
    outputKind: "evavo_docs_book_art_plan_translation_coordination",
    schemaVersion: 1,
    contract: BOOK_ART_PLAN_TRANSLATION_CONTRACT,
    status: "blocked",
    ...(input.translationKind === undefined
      ? {}
      : { translationKind: input.translationKind }),
    ...(input.requestFingerprint === undefined
      ? {}
      : { requestFingerprint: input.requestFingerprint }),
    blockers: unique(input.blockers),
    warnings: unique(input.warnings),
    artStudioCalled: input.artStudioCalled,
    providerCallPerformed: false,
    runtimeJobSubmitted: false,
    artifactBytesWritten: false,
    authoritativeBookWritesPerformed: false,
    selectionPerformed: false,
    promotionPerformed: false,
    bookUseBindingCreated: false,
    runtimeCutoverApproved: false,
    publicationPerformed: false,
  };
}

function stableCode(error: unknown): string {
  const message = error instanceof Error
    ? error.message
    : "DOCS_BOOK_ART_TRANSLATION_FAILED";
  return /^[A-Z][A-Z0-9_:-]{2,200}$/.test(message)
    ? message
    : "DOCS_BOOK_ART_TRANSLATION_FAILED";
}

function remoteCallMayHaveOccurred(code: string): boolean {
  return code.includes("AMBIGUOUS_") ||
    code.includes("RESPONSE_") ||
    code.includes("REMOTE_HTTP_") ||
    code.startsWith("BOOK_ART_") ||
    code.startsWith("ART_STUDIO_");
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
