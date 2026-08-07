import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relativePath) =>
  readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("MCP exposes manuscript-led Book Art creative direction without execution authority", async () => {
  const [tools, index, contracts] = await Promise.all([
    read("src/book-creative-direction-tools.ts"),
    read("src/index.ts"),
    read("../../packages/contracts/src/book-creative-direction-types.ts"),
  ]);

  for (const token of [
    "BOOK_CREATIVE_DIRECTION_CONTRACT",
    "BOOK_CREATIVE_DIRECTION_SCHEMA_VERSION",
    "compileBookCreativeDirection",
    "listBookCreativeDirectionCapabilities",
    "book_creative_direction_protocol",
    "compile_book_creative_direction",
    "manuscriptEvidenceRequired: true",
    "materiallyDistinctRoutesRequired: true",
    "generatedTypographyAllowed: false",
    "namedCreatorImitationAllowed: false",
    "brandedFranchiseTransferAllowed: false",
    "providerCallPerformed: false",
    "runtimeJobSubmitted: false",
    "candidateArtifactsWritten: false",
    "automaticSelectionAllowed: false",
    "automaticPromotionAllowed: false",
    "bookUseBindingCreated: false",
    "publicationPerformed: false",
    "readOnly: true",
  ]) {
    assert.ok(tools.includes(token), `missing creative-direction MCP invariant: ${token}`);
  }

  assert.ok(index.includes('import { registerBookCreativeDirectionTools } from "./book-creative-direction-tools.js";'));
  assert.ok(index.includes("registerBookCreativeDirectionTools(server);"));
  assert.ok(contracts.includes('"evavo_art_book_creative_direction_v1"'));

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
    "candidateArtifactsWritten: true",
    "automaticSelectionAllowed: true",
    "automaticPromotionAllowed: true",
    "bookUseBindingCreated: true",
    "publicationPerformed: true",
    "child_process",
    "shell: true",
  ]) {
    assert.ok(!tools.includes(forbidden), `creative-direction MCP contains execution authority: ${forbidden}`);
  }
});
