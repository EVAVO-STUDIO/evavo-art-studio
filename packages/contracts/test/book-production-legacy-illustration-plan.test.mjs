import assert from "node:assert/strict";
import test from "node:test";
import {
  BOOK_ART_HANDOFF_CONTRACT,
  translateLegacyWebsiteBookIllustrationGenerationPlan,
} from "../dist/index.js";

const sha = (character) => character.repeat(64);
const canonical = (value) => Array.isArray(value)
  ? value.map(canonical)
  : value && typeof value === "object"
    ? Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]))
    : value;
const hashText = async (value) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
const hash = async (value) => hashText(JSON.stringify(canonical(value)));
const seal = async (value, key) => ({ ...value, [key]: await hash(value) });

function brief(purpose = "interior_full_page_illustration") {
  return {
    outputKind: "evavo_book_art_brief",
    schemaVersion: 1,
    contract: BOOK_ART_HANDOFF_CONTRACT,
    identity: { workspaceId: "workspace-1", projectId: "project-1", bookId: "book-1", editionId: "paperback-1", requestId: "request-illustration-1" },
    purpose,
    manuscript: { manuscriptRevisionId: "manuscript-4", manuscriptSha256: sha("a"), extractedTextSha256: sha("b"), visualCanonSha256: sha("c"), artDirectionSha256: sha("d"), approvedEvidenceIds: ["evidence-1"] },
    conceptTerritoryId: "chapter-plate-1",
    conceptTerritoryLabel: "Chapter plate",
    creativeThesis: "A manuscript-specific black-ink plate with disciplined page craft and protected live-text space.",
    primarySubject: "The exact manuscript-grounded object and figure grouping",
    supportingSubjects: [],
    compositionRequirements: ["Use measured hierarchy and stable perspective."],
    mustShow: ["The exact approved subject."],
    mustNotShow: ["Generated lettering", "Unsupported objects"],
    spoilerRestrictions: ["Do not reveal the final identity."],
    continuityRequirements: ["Match the approved character and object state."],
    historicalAndMaterialRequirements: ["Use period-correct construction and materials."],
    negativeSpaceRequirements: ["Protect the live chapter-title and caption zones."],
    output: { widthPx: 2400, heightPx: 3600, minimumPpi: 600, allowedMimeTypes: ["image/png", "image/tiff"], colourIntent: "monochrome", alpha: purpose === "ornament" ? "required" : "allowed", textPolicy: "text_free", printUse: true, digitalUse: true },
    rightsEvidenceIds: ["rights-1"],
    createdAt: "2026-08-02T00:00:00.000Z",
    briefFingerprint: sha("e"),
    providerCandidateMayBeFinal: false,
    publicationPerformed: false,
  };
}

async function styleAuthority(overrides = {}) {
  return seal({
    outputKind: "book_illustration_style_authority",
    version: "book_illustration_style_authority_v1",
    status: "approved_for_page_design",
    projectId: "project-1",
    styleId: "style-1",
    compiledAt: "2026-08-02T00:00:00.000Z",
    styleFamily: "engraved_book_plate",
    colourMode: "one_bit_black",
    paperTone: "white",
    inkLayerMode: "binary_alpha",
    minimumLineWidthPt: 0.25,
    targetLineArtPpi: 600,
    profile: {},
    projectVisualIdentity: "Exact manuscript-grounded line art",
    projectDirectives: [],
    prohibitedTraits: ["pseudo-text"],
    historicalReferenceDigestSha256: sha("1"),
    approvedReviewIds: ["review-1"],
    hardErrors: [],
    warnings: [],
    requiredRevisions: [],
    requiredHumanDecisions: [],
    blockedClaims: [],
    ...overrides,
  }, "authorityDigestSha256");
}

async function pageAuthority(style, role = "full_page_black_ink_plate", overrides = {}) {
  return seal({
    outputKind: "book_illustrated_page_authority",
    version: "book_illustrated_page_authority_v1",
    status: "ready_for_generation",
    projectId: "project-1",
    pageId: "page-1",
    compiledAt: "2026-08-02T00:00:00.000Z",
    styleAuthorityDigestSha256: style.authorityDigestSha256,
    pageRole: role,
    narrativeMode: "literal_scene",
    manuscriptAuthorityDigestSha256: sha("2"),
    visualManuscriptAuthorityDigestSha256: sha("3"),
    manuscriptEvidenceSpanIds: ["span-1"],
    directionDigestSha256: sha("d"),
    layoutDigestSha256: sha("4"),
    editionFormats: ["paperback"],
    sharesPageWithLiveText: true,
    protectedTextZoneCount: 2,
    hardErrors: [],
    warnings: [],
    requiredHumanDecisions: [],
    blockedClaims: [],
    ...overrides,
  }, "authorityDigestSha256");
}

async function plan({ purpose = "interior_full_page_illustration", role = "full_page_black_ink_plate", styleOverrides = {}, pageOverrides = {}, taskOverrides = {}, planOverrides = {} } = {}) {
  const style = await styleAuthority(styleOverrides);
  const page = await pageAuthority(style, role, pageOverrides);
  const prompt = "Create one exact manuscript-grounded black-ink illustrated page candidate with no generated publication text.";
  const candidateId = "page-1-formal_plate";
  const task = {
    candidateId,
    order: 1,
    variation: "formal_plate",
    prompt,
    promptDigestSha256: await hashText(prompt),
    expectedWidthPx: 2048,
    expectedHeightPx: 3072,
    flattenBackgroundHex: "#ffffff",
    createTransparentInkLayer: purpose === "ornament",
    inkLayerMode: purpose === "ornament" ? "binary_alpha" : "none",
    idempotencyKey: sha("5"),
    state: "ready",
    stopConditions: [],
    ...taskOverrides,
  };
  const inputSnapshot = { projectId: "project-1", runId: "illustration-run-1", pageId: "page-1" };
  const without = {
    outputKind: "book_illustration_generation_plan",
    version: "book_illustration_generation_plan_v1",
    status: "ready_to_generate",
    projectId: "project-1",
    runId: "illustration-run-1",
    requestedAt: "2026-08-02T00:00:00.000Z",
    profile: "production",
    styleAuthority: style,
    pageAuthority: page,
    providerProfile: { adapter: "openai_image_api", model: "gpt-image-2-2026-04-21", size: "2048x3072", quality: "high", outputFormat: "png", background: "opaque", maximumCandidatesPerRun: 4, maximumConcurrency: 1, automaticProviderRetries: 0 },
    maximumRefinementRounds: 3,
    tasks: [task],
    nextCandidateId: candidateId,
    completedCandidateIds: [],
    hardErrors: [],
    warnings: [],
    executionRules: [],
    blockedClaims: [],
    inputSnapshot,
    inputDigestSha256: await hash(inputSnapshot),
    ...planOverrides,
  };
  return { brief: brief(purpose), candidateId, plan: await seal(without, "planDigestSha256") };
}

async function translate(value) {
  return translateLegacyWebsiteBookIllustrationGenerationPlan({
    outputKind: "evavo_legacy_website_book_illustration_plan_translation_input",
    schemaVersion: 1,
    brief: value.brief,
    legacyPlan: value.plan,
    candidateId: value.candidateId,
  });
}

test("translates one exact illustrated-page task without moving layout or live text authority", async () => {
  const result = await translate(await plan());
  assert.equal(result.status, "ready_for_shadow_comparison", result.blockers.join("\n"));
  assert.equal(result.workOrder?.assetClass, "interior_illustration");
  assert.equal(result.legacyEvidence.pageRole, "full_page_black_ink_plate");
  assert.equal(result.legacyEvidence.sharesPageWithLiveText, true);
  assert.equal(result.legacyEvidence.protectedTextZoneCount, 2);
  assert.equal(result.legacyEvidence.rawLegacyPromptRetained, false);
  assert.equal(result.legacyEvidence.layoutGeometryRetained, false);
  assert.equal(result.rawLegacyPromptTrustedAsAuthority, false);
  assert.equal(result.legacyLayoutTrustedAsArtAuthority, false);
  assert.equal(result.authoritativeWritesPerformed, false);
});

test("translates a transparent ornament only when the legacy ink-layer task matches", async () => {
  const result = await translate(await plan({ purpose: "ornament", role: "ornamental_divider" }));
  assert.equal(result.status, "ready_for_shadow_comparison", result.blockers.join("\n"));
  assert.equal(result.workOrder?.providerRequest.target.transparency, "required");
  assert.equal(result.legacyEvidence.createTransparentInkLayer, true);
  assert.equal(result.legacyEvidence.taskInkLayerMode, "binary_alpha");
});

test("blocks a page role that does not match the canonical Book Art purpose", async () => {
  const result = await translate(await plan({ purpose: "interior_full_page_illustration", role: "ornamental_divider" }));
  assert.equal(result.status, "blocked");
  assert.ok(result.blockers.some((item) => item.includes("page role does not match")));
});

test("blocks stale page art direction and a different style authority", async () => {
  const result = await translate(await plan({ pageOverrides: { directionDigestSha256: sha("9"), styleAuthorityDigestSha256: sha("8") } }));
  assert.equal(result.status, "blocked");
  assert.ok(result.blockers.some((item) => item.includes("stale or different art direction")));
  assert.ok(result.blockers.some((item) => item.includes("different style authority")));
});

test("blocks live-text pages without retained protected zones", async () => {
  const result = await translate(await plan({ pageOverrides: { sharesPageWithLiveText: true, protectedTextZoneCount: 0 } }));
  assert.equal(result.status, "blocked");
  assert.ok(result.blockers.some((item) => item.includes("lacks protected text zones")));
});

test("blocks duplicate candidate identities and a non-next candidate", async () => {
  const value = await plan();
  value.plan.tasks.push(structuredClone(value.plan.tasks[0]));
  value.plan.nextCandidateId = "different-candidate";
  const { planDigestSha256: _old, ...without } = value.plan;
  value.plan = await seal(without, "planDigestSha256");
  const result = await translate(value);
  assert.equal(result.status, "blocked");
  assert.ok(result.blockers.some((item) => item.includes("exactly once")));
  assert.ok(result.blockers.some((item) => item.includes("duplicate candidate identities")));
  assert.ok(result.blockers.some((item) => item.includes("not the exact next ready task")));
});

test("blocks tampered legacy authority and plan fingerprints", async () => {
  const value = await plan();
  value.plan.styleAuthority.projectVisualIdentity += " altered";
  const result = await translate(value);
  assert.equal(result.status, "blocked");
  assert.ok(result.blockers.some((item) => item.includes("style authority digest does not match")));
  assert.ok(result.blockers.some((item) => item.includes("plan digest does not match")));
});
