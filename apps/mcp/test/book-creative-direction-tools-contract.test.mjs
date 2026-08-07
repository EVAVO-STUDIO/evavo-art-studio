import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relativePath) =>
  readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("MCP exposes manuscript-led Book Art direction and route-aware programme without execution authority", async () => {
  const [tools, index, contracts, programme] = await Promise.all([
    read("src/book-creative-direction-tools.ts"),
    read("src/index.ts"),
    read("../../packages/contracts/src/book-creative-direction-types.ts"),
    read("../../packages/book-art-runtime/src/creative-candidate-programme.ts"),
  ]);

  for (const token of [
    "BOOK_CREATIVE_DIRECTION_CONTRACT",
    "BOOK_CREATIVE_DIRECTION_SCHEMA_VERSION",
    "compileBookCreativeDirection",
    "listBookCreativeDirectionCapabilities",
    "book_creative_direction_protocol",
    "compile_book_creative_direction",
    "BOOK_ART_CREATIVE_CANDIDATE_PROGRAMME_CONTRACT",
    "compileBookArtCreativeCandidateProgramme",
    "book_creative_candidate_programme_protocol",
    "compile_book_creative_candidate_programme",
    "EVAVO_BOOK_ART_PROVIDER_ADAPTER_IDS",
    "EVAVO_BOOK_ART_PROVIDER_PREFERRED_ADAPTER",
    "EVAVO_BOOK_ART_PROVIDER_MODEL",
    "recompilesCreativeDirectionFromManuscriptEvidence: true",
    "routeSpecificBriefRequired: true",
    "routeSpecificWorkOrderRequired: true",
    "routeSpecificProviderPlanRequired: true",
    "exactlyOneCandidatePerCreativeRoute: true",
    "manuscriptEvidenceRequired: true",
    "materiallyDistinctRoutesRequired: true",
    "generatedTypographyAllowed: false",
    "namedCreatorImitationAllowed: false",
    "brandedFranchiseTransferAllowed: false",
    "bulkSubmissionAllowed: false",
    "partialProgrammeExecutionAllowed: false",
    "providerFallbackAllowed: false",
    "providerCallPerformed: false",
    "runtimeJobsSubmitted: false",
    "candidateArtifactsWritten: false",
    "automaticSelectionAllowed: false",
    "automaticPromotionAllowed: false",
    "bookUseBindingCreated: false",
    "publicationPerformed: false",
  ]) {
    assert.ok(
      tools.includes(token),
      `missing creative-direction MCP invariant: ${token}`,
    );
  }

  assert.ok(
    index.includes(
      'import { registerBookCreativeDirectionTools } from "./book-creative-direction-tools.js";',
    ),
  );
  assert.ok(index.includes("registerBookCreativeDirectionTools(server);"));
  assert.ok(contracts.includes('"evavo_art_book_creative_direction_v1"'));

  for (const token of [
    "compileBookCreativeDirection(creativeInput)",
    "compileBookArtProductionWorkOrder(route.brief)",
    "compileBookArtProviderShadowJob",
    "normalizedProviderRequest.candidateCount !== 1",
    "metadata.conceptTerritoryId",
    "duplicate provider requests across distinct routes",
    "bulkSubmissionAllowed: false",
    "partialProgrammeExecutionAllowed: false",
    "runtimeJobsSubmitted: false",
    "providerCallPerformed: false",
    "selectionPerformed: false",
    "promotionPerformed: false",
    "bookUseBindingCreated: false",
    "publicationPerformed: false",
  ]) {
    assert.ok(
      programme.includes(token),
      `missing route-aware programme invariant: ${token}`,
    );
  }

  for (const forbidden of [
    "LocalRuntimeRepository",
    "LocalArtifactStore",
    "ProviderRegistry",
    "executeProviderCandidateRequest",
    "submitBookArtProviderShadowJob",
    "promoteSelectedCandidate",
    "updateReference(",
    ".put(",
    "providerCallPerformed: true",
    "runtimeJobSubmitted: true",
    "runtimeJobsSubmitted: true",
    "candidateArtifactsWritten: true",
    "automaticSelectionAllowed: true",
    "automaticPromotionAllowed: true",
    "bookUseBindingCreated: true",
    "publicationPerformed: true",
    "child_process",
    "shell: true",
  ]) {
    assert.ok(
      !tools.includes(forbidden),
      `creative-direction MCP contains execution authority: ${forbidden}`,
    );
    assert.ok(
      !programme.includes(forbidden),
      `creative candidate programme contains execution authority: ${forbidden}`,
    );
  }
});
