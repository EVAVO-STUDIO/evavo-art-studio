import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relativePath) =>
  readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("MCP submits Book creative programmes only through trusted host recompilation and governed batch dispatch", async () => {
  const [tools, index, creativeTools, dispatcher] = await Promise.all([
    read("src/book-creative-programme-runtime-tools.ts"),
    read("src/index.ts"),
    read("src/book-creative-direction-tools.ts"),
    read(
      "../../packages/book-art-runtime/src/creative-candidate-programme-dispatch.ts",
    ),
  ]);

  for (const token of [
    "BOOK_ART_CREATIVE_CANDIDATE_PROGRAMME_CONTRACT",
    "BOOK_ART_CREATIVE_PROGRAMME_DISPATCH_CONTRACT",
    "compileBookArtCreativeCandidateProgramme",
    "submitBookArtCreativeProgrammeDispatch",
    "book_creative_candidate_programme_runtime_protocol",
    "submit_book_creative_candidate_programme",
    "EVAVO_BOOK_ART_PROVIDER_ADAPTER_IDS",
    "EVAVO_BOOK_ART_PROVIDER_PREFERRED_ADAPTER",
    "EVAVO_BOOK_ART_PROVIDER_MODEL",
    "EVAVO_ART_ALLOW_WRITES",
    "EVAVO_ART_RUNTIME_ROOT",
    "LocalRuntimeRepository",
    "trustedHostRecompilesProgramme: true",
    "callerSuppliedProgrammeAccepted: false",
    "callerSuppliedAdapterPolicyAccepted: false",
    "completeRouteSetRequired: true",
    "singleRuntimeBatchRequired: true",
    "partialProgrammeExecutionAllowed: false",
    "exactlyOneCandidatePerCreativeRoute: true",
    "maximumProviderAttemptsPerRoute: 1",
    "providerFallbackAllowed: false",
    "submitPerformsProviderCall: false",
    "providerCallsRequireSeparateWorkerLease: true",
    "candidateArtifactsWrittenBySubmission: false",
    "automaticSelectionAllowed: false",
    "automaticPromotionAllowed: false",
    "bookUseBindingCreated: false",
    "publicationPerformed: false",
    "partialProgrammeSubmissionAllowed: false",
    "expectedProgrammeFingerprintSha256:",
    "programme.programmeFingerprintSha256",
  ]) {
    assert.ok(
      tools.includes(token),
      `missing creative programme runtime MCP invariant: ${token}`,
    );
  }

  assert.ok(
    index.includes(
      'import { registerBookCreativeProgrammeRuntimeTools } from "./book-creative-programme-runtime-tools.js";',
    ),
  );
  assert.ok(index.includes("registerBookCreativeProgrammeRuntimeTools(server);"));

  const compileIndex = tools.indexOf("compileBookArtCreativeCandidateProgramme(");
  const submitIndex = tools.indexOf("submitBookArtCreativeProgrammeDispatch(");
  assert.ok(compileIndex >= 0 && submitIndex > compileIndex);
  assert.ok(
    tools.includes('if (Object.hasOwn(input, "adapterPolicy"))'),
    "untrusted callers must not supply provider adapter policy",
  );
  assert.ok(
    tools.includes('if (compilation.status !== "ready" || !compilation.programme)'),
    "blocked programme compilation must stop before runtime submission",
  );
  assert.ok(
    !tools.includes("programme: z.unknown()"),
    "MCP must not accept a caller-supplied precompiled programme",
  );

  for (const token of [
    "submitBatch(",
    "singleRuntimeBatchRequired: true",
    "routeCoverageComplete: true",
    "partialProgrammeSubmissionAllowed: false",
    "providerFallbackAllowed: false",
    "maximumProviderAttempts: 1",
    "providerCallsPerformedByDispatcher: false",
    "selectionPerformed: false",
    "promotionPerformed: false",
    "bookUseBindingCreated: false",
    "publicationPerformed: false",
  ]) {
    assert.ok(
      dispatcher.includes(token),
      `governed programme dispatcher is missing ${token}`,
    );
  }

  for (const forbidden of [
    "ProviderRegistry",
    "createProviderHandlers",
    "executeProviderCandidateRequest",
    "LocalArtifactStore",
    "promoteSelectedCandidate",
    "updateReference(",
    ".put(",
    "providerCallPerformed: true",
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
      `creative programme runtime MCP contains an authority shortcut: ${forbidden}`,
    );
  }

  for (const forbidden of [
    "LocalRuntimeRepository",
    "submitBookArtCreativeProgrammeDispatch",
    "EVAVO_ART_ALLOW_WRITES",
  ]) {
    assert.ok(
      !creativeTools.includes(forbidden),
      `compile-only creative-direction MCP acquired runtime authority: ${forbidden}`,
    );
  }
});
