import {
  BOOK_ART_CREATIVE_CANDIDATE_PROGRAMME_CONTRACT,
  BOOK_ART_CREATIVE_CANDIDATE_PROGRAMME_SCHEMA_VERSION,
  compileBookArtCreativeCandidateProgramme as compileBookArtCreativeCandidateProgrammeUnchecked,
  type BookArtCreativeCandidateProgrammeInputV1,
  type BookArtCreativeCandidateProgrammeResultV1,
  type BookArtCreativeCandidateProgrammeV1,
  type BookArtCreativeCandidateRoutePlanV1,
} from "./creative-candidate-programme.js";

export {
  BOOK_ART_CREATIVE_CANDIDATE_PROGRAMME_CONTRACT,
  BOOK_ART_CREATIVE_CANDIDATE_PROGRAMME_SCHEMA_VERSION,
  type BookArtCreativeCandidateProgrammeInputV1,
  type BookArtCreativeCandidateProgrammeResultV1,
  type BookArtCreativeCandidateProgrammeV1,
  type BookArtCreativeCandidateRoutePlanV1,
};

/**
 * Fail-closed public boundary for route-aware Book creative candidate compilation.
 *
 * The internal compiler intentionally performs no runtime/provider side effects, but
 * untrusted JavaScript objects can still throw through Proxy traps or accessors while
 * being inspected. Public package/MCP callers must receive one controlled blocked
 * result instead of allowing those exceptions to cross the capability boundary.
 */
export async function compileBookArtCreativeCandidateProgramme(
  value: unknown,
): Promise<BookArtCreativeCandidateProgrammeResultV1> {
  try {
    return await compileBookArtCreativeCandidateProgrammeUnchecked(value);
  } catch {
    return {
      outputKind: "evavo_book_art_creative_candidate_programme_result",
      schemaVersion: BOOK_ART_CREATIVE_CANDIDATE_PROGRAMME_SCHEMA_VERSION,
      contract: BOOK_ART_CREATIVE_CANDIDATE_PROGRAMME_CONTRACT,
      status: "blocked",
      identity: {
        workspaceId: "invalid",
        projectId: "invalid",
        bookId: "invalid",
        requestId: "invalid",
      },
      blockers: [
        "Creative candidate programme input could not be safely evaluated.",
      ],
      warnings: [],
      bulkSubmissionAllowed: false,
      runtimeJobsSubmitted: false,
      providerCallPerformed: false,
      candidateArtifactsWritten: false,
      selectionPerformed: false,
      promotionPerformed: false,
      publicationPerformed: false,
    };
  }
}
