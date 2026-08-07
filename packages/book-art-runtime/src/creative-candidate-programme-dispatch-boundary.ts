import type { RuntimeRepository } from "@evavo/art-runtime";

import {
  BOOK_ART_CREATIVE_PROGRAMME_DISPATCH_CONTRACT,
  BOOK_ART_CREATIVE_PROGRAMME_DISPATCH_SCHEMA_VERSION,
  compileBookArtCreativeProgrammeDispatch as compileBookArtCreativeProgrammeDispatchUnchecked,
  submitBookArtCreativeProgrammeDispatch as submitBookArtCreativeProgrammeDispatchUnchecked,
  type BookArtCreativeProgrammeDispatchCompilationResultV1,
  type BookArtCreativeProgrammeDispatchInputV1,
  type BookArtCreativeProgrammeDispatchPlanV1,
  type BookArtCreativeProgrammeDispatchReceiptV1,
  type BookArtCreativeProgrammeDispatchSubmissionResultV1,
  type BookArtCreativeProgrammeRouteDispatchV1,
  type BookArtCreativeProgrammeSubmittedRouteV1,
} from "./creative-candidate-programme-dispatch.js";

export {
  BOOK_ART_CREATIVE_PROGRAMME_DISPATCH_CONTRACT,
  BOOK_ART_CREATIVE_PROGRAMME_DISPATCH_SCHEMA_VERSION,
  type BookArtCreativeProgrammeDispatchCompilationResultV1,
  type BookArtCreativeProgrammeDispatchInputV1,
  type BookArtCreativeProgrammeDispatchPlanV1,
  type BookArtCreativeProgrammeDispatchReceiptV1,
  type BookArtCreativeProgrammeDispatchSubmissionResultV1,
  type BookArtCreativeProgrammeRouteDispatchV1,
  type BookArtCreativeProgrammeSubmittedRouteV1,
};

const invalidIdentity = () => ({
  workspaceId: "invalid",
  projectId: "invalid",
  bookId: "invalid",
  requestId: "invalid",
});

export async function compileBookArtCreativeProgrammeDispatch(
  value: unknown,
): Promise<BookArtCreativeProgrammeDispatchCompilationResultV1> {
  try {
    return await compileBookArtCreativeProgrammeDispatchUnchecked(value);
  } catch {
    return {
      outputKind:
        "evavo_book_art_creative_candidate_programme_dispatch_compilation_result",
      schemaVersion: BOOK_ART_CREATIVE_PROGRAMME_DISPATCH_SCHEMA_VERSION,
      contract: BOOK_ART_CREATIVE_PROGRAMME_DISPATCH_CONTRACT,
      status: "blocked",
      identity: invalidIdentity(),
      blockers: [
        "Creative programme dispatch input could not be safely evaluated.",
      ],
      warnings: [],
      runtimeBatchSubmitted: false,
      providerCallPerformed: false,
      candidateArtifactsWritten: false,
      selectionPerformed: false,
      promotionPerformed: false,
      bookUseBindingCreated: false,
      publicationPerformed: false,
    };
  }
}

export async function submitBookArtCreativeProgrammeDispatch(
  value: unknown,
  options: Readonly<{
    runtime: RuntimeRepository;
    actor: string;
    now?: Date;
  }>,
): Promise<BookArtCreativeProgrammeDispatchSubmissionResultV1> {
  let batchReturned = false;
  try {
    const guardedRuntime = {
      submitBatch: async (...args: Parameters<RuntimeRepository["submitBatch"]>) => {
        const result = await options.runtime.submitBatch(...args);
        batchReturned = true;
        return result;
      },
    } as unknown as RuntimeRepository;
    return await submitBookArtCreativeProgrammeDispatchUnchecked(value, {
      runtime: guardedRuntime,
      actor: options.actor,
      ...(options.now === undefined ? {} : { now: options.now }),
    });
  } catch {
    return {
      outputKind:
        "evavo_book_art_creative_candidate_programme_dispatch_submission_result",
      schemaVersion: BOOK_ART_CREATIVE_PROGRAMME_DISPATCH_SCHEMA_VERSION,
      contract: BOOK_ART_CREATIVE_PROGRAMME_DISPATCH_CONTRACT,
      status: "blocked",
      identity: invalidIdentity(),
      blockers: [
        batchReturned
          ? "Creative programme dispatch could not safely verify the returned runtime batch; no dispatch receipt or downstream authority was granted."
          : "Creative programme dispatch input could not be safely evaluated.",
      ],
      warnings: [],
      runtimeBatchSubmitted: batchReturned,
      providerCallsPerformedByDispatcher: false,
      candidateArtifactsWrittenByDispatcher: false,
      selectionPerformed: false,
      promotionPerformed: false,
      bookUseBindingCreated: false,
      publicationPerformed: false,
    };
  }
}
