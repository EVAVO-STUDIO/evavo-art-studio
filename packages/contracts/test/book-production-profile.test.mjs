import assert from "node:assert/strict";
import test from "node:test";
import {
  BOOK_ART_HANDOFF_CONTRACT,
  compileBookArtProductionWorkOrder,
  translateLegacyWebsiteBookArtGenerationPlan,
  validateBookArtProductionWorkOrder,
} from "../dist/index.js";

const sha = (character) => character.repeat(64);
function brief(purpose = "front_cover_art") {
  return {
    outputKind: "evavo_book_art_brief",
    schemaVersion: 1,
    contract: BOOK_ART_HANDOFF_CONTRACT,
    identity: { workspaceId: "workspace-1", projectId: "project-1", bookId: "book-1", editionId: "paperback-1", requestId: "request-1" },
    purpose,
    manuscript: { manuscriptRevisionId: "manuscript-4", manuscriptSha256: sha("a"), extractedTextSha256: sha("b"), visualCanonSha256: sha("c"), artDirectionSha256: sha("d"), approvedEvidenceIds: ["evidence-1"] },
    conceptTerritoryId: "manuscript-first",
    conceptTerritoryLabel: "Manuscript first",
    creativeThesis: "A restrained image built around one manuscript-specific object and a protected editable title field.",
    primarySubject: "The weathered object identified by approved visual canon",
    supportingSubjects: [],
    compositionRequirements: ["Protect the upper-right title field."],
    mustShow: ["One exact manuscript-specific object."],
    mustNotShow: ["Generated lettering", "Unapproved characters"],
    spoilerRestrictions: ["Do not reveal the final identity."],
    continuityRequirements: ["Match the approved object and period state."],
    historicalAndMaterialRequirements: ["Use period-correct material construction."],
    negativeSpaceRequirements: ["Keep 30 percent quiet space for editable type."],
    output: { widthPx: 3000, heightPx: 4800, minimumPpi: 300, allowedMimeTypes: ["image/png", "image/tiff"], colourIntent: "rgb", alpha: purpose === "ornament" ? "required" : "allowed", textPolicy: "text_free", printUse: true, digitalUse: true },
    rightsEvidenceIds: ["rights-1"],
    createdAt: "2026-08-02T00:00:00.000Z",
    briefFingerprint: sha("e"),
    providerCandidateMayBeFinal: false,
    publicationPerformed: false,
  };
}
function legacyPlan() {
  return {
    outputKind: "book_cover_artwork_generation_plan",
    version: "book_cover_artwork_generation_plan_v1",
    status: "ready_to_generate",
    projectId: "project-1",
    runId: "legacy-run-1",
    requestedAt: "2026-08-02T00:00:00.000Z",
    profile: "production",
    sceneDigestSha256: sha("1"),
    artDirectionDigestSha256: sha("d"),
    publicationTextDigestSha256: sha("2"),
    directionStatus: "ready_for_composition",
    providerProfile: {}, maximumRefinementRounds: 3, genreProfiles: [], conceptTerritories: [],
    tasks: [{
      candidateId: "candidate-1", order: 1, territoryId: "manuscript-first", territoryLabel: "Manuscript first",
      territoryArchetype: "symbolic_monument", variationId: "editorial_restraint",
      prompt: "Create one manuscript-grounded text-free image with protected negative space and no publication lettering.",
      promptDigestSha256: sha("3"), expectedWidthPx: 2160, expectedHeightPx: 3456,
      flattenBackgroundHex: "#000000", idempotencyKey: sha("4"), state: "ready", stopConditions: [],
    }],
    nextCandidateId: "candidate-1", completedCandidateIds: [], hardErrors: [], warnings: [], executionRules: [], blockedClaims: [],
    inputSnapshot: {}, inputDigestSha256: sha("5"), planDigestSha256: sha("6"),
  };
}

test("compiles a manuscript-bound cover into a provider-neutral non-final work order", async () => {
  const result = await compileBookArtProductionWorkOrder(brief());
  assert.equal(result.status, "ready", result.blockers.join("\n"));
  assert.equal(result.workOrder?.assetClass, "cover_background");
  assert.equal(result.workOrder?.providerRequest.assetKind, "print");
  assert.equal(result.workOrder?.providerRequest.target.outputFormat, "png");
  assert.equal(result.workOrder?.providerRequest.target.transparency, "opaque");
  assert.equal(result.workOrder?.providerCandidateMayBeFinal, false);
  assert.equal(result.workOrder?.selectionRequired, true);
  assert.equal(result.workOrder?.promotionRequired, true);
  assert.equal(result.workOrder?.bookUseBindingRequired, true);
  assert.equal(result.workOrder?.authoritativeWritesPerformed, false);
  assert.equal(result.workOrder?.publicationPerformed, false);
  assert.equal((await validateBookArtProductionWorkOrder(result.workOrder)).valid, true);
});

test("compiles illustration and ornament profiles without moving page layout authority", async () => {
  const illustration = await compileBookArtProductionWorkOrder(brief("interior_full_page_illustration"));
  assert.equal(illustration.status, "ready", illustration.blockers.join("\n"));
  assert.equal(illustration.workOrder?.assetClass, "interior_illustration");
  assert.equal(illustration.workOrder?.providerRequest.assetKind, "illustration");
  const ornament = await compileBookArtProductionWorkOrder(brief("ornament"));
  assert.equal(ornament.status, "ready", ornament.blockers.join("\n"));
  assert.equal(ornament.workOrder?.providerRequest.target.transparency, "required");
  assert.equal(ornament.workOrder?.providerRequest.background.strategy, "native-alpha");
  assert.ok(ornament.workOrder?.authorityBoundary.docsSuiteOwns.some((item) => item.includes("illustration placement")));
});

test("is deterministic and fingerprint-bound", async () => {
  const first = await compileBookArtProductionWorkOrder(brief());
  const second = await compileBookArtProductionWorkOrder(brief());
  assert.equal(first.workOrder?.workOrderFingerprintSha256, second.workOrder?.workOrderFingerprintSha256);
  const tampered = structuredClone(first.workOrder);
  tampered.providerRequest.creativeIntent += " altered";
  const validation = await validateBookArtProductionWorkOrder(tampered);
  assert.equal(validation.valid, false);
  assert.ok(validation.issues.some((item) => item.includes("fingerprint does not match")));
});

test("blocks Docs Suite-owned typography and publication fields at the Art Studio boundary", async () => {
  const value = brief();
  value.title = "This does not belong in Art Studio";
  value.output.isbn = "9780000000000";
  const result = await compileBookArtProductionWorkOrder(value);
  assert.equal(result.status, "blocked");
  assert.ok(result.blockers.some((item) => item.includes("unknown fields")));
  assert.ok(result.blockers.some((item) => item.includes("Docs Suite-owned authority fields")));
  assert.equal(result.workOrder, undefined);
});

test("blocks non-text-free cover candidates before provider execution", async () => {
  const value = brief();
  value.output.textPolicy = "exact_editable_labels_only";
  const result = await compileBookArtProductionWorkOrder(value);
  assert.equal(result.status, "blocked");
  assert.ok(result.blockers.some((item) => item.includes("text-free")));
});

test("translates one exact legacy Website cover task for shadow comparison only", async () => {
  const result = await translateLegacyWebsiteBookArtGenerationPlan({
    outputKind: "evavo_legacy_website_book_art_plan_translation_input",
    schemaVersion: 1,
    brief: brief(),
    legacyPlan: legacyPlan(),
    candidateId: "candidate-1",
  });
  assert.equal(result.status, "ready_for_shadow_comparison", result.blockers.join("\n"));
  assert.equal(result.legacyEvidence.legacyPromptDigestSha256, sha("3"));
  assert.equal(result.legacyEvidence.rawLegacyPromptRetained, false);
  assert.equal(result.rawLegacyPromptTrustedAsAuthority, false);
  assert.equal(result.shadowOnly, true);
  assert.equal(result.authoritativeWritesPerformed, false);
});

test("blocks stale legacy art direction and duplicate candidate identities", async () => {
  const plan = legacyPlan();
  plan.artDirectionDigestSha256 = sha("9");
  plan.tasks.push({ ...plan.tasks[0] });
  const result = await translateLegacyWebsiteBookArtGenerationPlan({
    outputKind: "evavo_legacy_website_book_art_plan_translation_input",
    schemaVersion: 1,
    brief: brief(),
    legacyPlan: plan,
    candidateId: "candidate-1",
  });
  assert.equal(result.status, "blocked");
  assert.ok(result.blockers.some((item) => item.includes("stale or different art direction")));
  assert.ok(result.blockers.some((item) => item.includes("exactly once")));
  assert.equal(result.workOrder, undefined);
});
