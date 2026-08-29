import assert from "node:assert/strict";
import test from "node:test";
import {
  BOOK_COVER_DESIGN_INTELLIGENCE_CONTRACT,
  compileBookCoverDesignIntelligence,
  listBookCoverDesignIntelligenceCapabilities,
} from "../dist/book-cover-design-intelligence.js";

const evidence = (evidenceId, label, meaning, importance = 90, spoilerLevel = "none") => ({
  evidenceId,
  label,
  meaning,
  sourceLocationIds: [`chapter-1:${evidenceId}`],
  visualForms: [label],
  materials: ["rag paper", "iron"],
  importance,
  spoilerLevel,
});

function input(overrides = {}) {
  return {
    outputKind: "evavo_art_book_cover_design_intelligence_input",
    schemaVersion: 1,
    contract: BOOK_COVER_DESIGN_INTELLIGENCE_CONTRACT,
    bookId: "law-under-law",
    editionId: "paperback-one",
    title: "The Law Under the Law",
    seriesTitle: "Dark Age of Sorrows",
    seriesPosition: 1,
    authorDisplayName: "Gregory R. Parker & Gillian R. Parker",
    primaryGenre: "historical",
    audience: "Adult readers of literary historical dark fiction.",
    emotionalPromise: "Institutional pressure, moral dread and a human cost that becomes clearer after the first reading.",
    centralConflict: "A man is trapped between written law and the hidden authority that determines whose life the law protects.",
    themeEvidence: [
      evidence("theme-public-law", "public law", "Law is performed as visible institutional authority."),
      evidence("theme-hidden-law", "hidden law", "Permission beneath procedure decides who receives protection.", 88),
    ],
    motifEvidence: [
      evidence("motif-broken-permit", "broken permit seal", "A specific broken administrative seal changes who may act.", 96),
    ],
    settingEvidence: [
      evidence("setting-tribunal", "tribunal passage", "A used institutional passage controls movement through worn stone and guarded access.", 92),
    ],
    categorySignals: ["literary historical gravity", "institutional dread"],
    audienceExpectations: ["serious period materiality", "moral pressure rather than spectacle"],
    distinctionTarget: "Make the doubled idea of law spatial and institutional through one broken permission object, without occult shorthand.",
    comparisonObservations: [
      { evidenceId: "market-one", observation: "Strong titles retain a stable shape at retail thumbnail size.", categorySignalToRetain: "title-led seriousness", imitationToAvoid: "central relic under storm clouds" },
      { evidenceId: "market-two", observation: "Historical fiction rewards credible construction and period material.", categorySignalToRetain: "credible period material", imitationToAvoid: "sepia portrait montage" },
      { evidenceId: "market-three", observation: "Literary covers create a second reading rather than narrating the plot.", categorySignalToRetain: "conceptual restraint", imitationToAvoid: "decorative pseudo-history" },
    ],
    sharedSeriesIdentifiers: ["small institutional wren mark", "stable author typography"],
    bookSpecificSeriesFreedoms: ["composition", "crop", "material", "lighting", "image-making process"],
    forbiddenSeriesDevices: ["wax seal as automatic badge", "red frame"],
    intendedFormats: ["kindle_ebook", "paperback"],
    requestedRouteCount: 3,
    requestedAt: "2026-08-29T02:00:00.000Z",
    requestedBy: "book-art-supervisor",
    providerCallAllowed: false,
    automaticSelectionAllowed: false,
    automaticPromotionAllowed: false,
    publicationAllowed: false,
    ...overrides,
  };
}

test("cover design intelligence reads title structure and produces reproducible distinct routes", () => {
  const first = compileBookCoverDesignIntelligence(input());
  const second = compileBookCoverDesignIntelligence(input());
  assert.equal(first.status, "ready");
  assert.deepEqual(first.blockers, []);
  assert.deepEqual(first.direction.titleReading.repeatedTokens, ["law"]);
  assert.deepEqual(first.direction.titleReading.relationalWords, ["under"]);
  assert.equal(first.direction.routes.length, 3);
  assert.equal(new Set(first.direction.routes.map((route) => route.kind)).size, 3);
  assert.equal(first.direction.directionFingerprint, second.direction.directionFingerprint);
});

test("cover art remains text free while typography is an exact Docs Suite handoff", () => {
  const result = compileBookCoverDesignIntelligence(input());
  assert.equal(result.direction.typography.exactTitle, "The Law Under the Law");
  assert.equal(result.direction.typography.exactAuthorDisplayName, "Gregory R. Parker & Gillian R. Parker");
  assert.equal(result.direction.typography.authority, "evavo-docs-suite");
  assert.equal(result.direction.typography.artworkTextPolicy, "text_free");
  assert.match(result.direction.providerInstruction, /Never render title, author, series, blurb, spine copy, logos, labels, price, ISBN or barcode/);
});

test("print formats require retail, spine, wrap and physical proofs", () => {
  const result = compileBookCoverDesignIntelligence(input());
  const proofs = result.direction.retailProofPlan.requiredProofs.map((proof) => proof.proofId);
  assert.ok(proofs.includes("thumbnail_60px"));
  assert.ok(proofs.includes("grayscale"));
  assert.ok(proofs.includes("spine_shelf"));
  assert.ok(proofs.includes("full_wrap"));
  assert.ok(proofs.includes("physical_print"));
});

test("series cannot pass as a colour-swapped template", () => {
  const result = compileBookCoverDesignIntelligence(input({
    bookSpecificSeriesFreedoms: ["colour", "hue", "tint", "shade"],
  }));
  assert.equal(result.status, "blocked");
  assert.ok(result.blockers.includes("series_cannot_differentiate_by_colour_only"));
});

test("market evidence, human decision boundaries and anti-synthetic craft are explicit", () => {
  const result = compileBookCoverDesignIntelligence(input({ comparisonObservations: [] }));
  assert.equal(result.status, "blocked");
  assert.ok(result.blockers.includes("comparison_observations_require_between_3_and_12_records"));
  const capabilities = listBookCoverDesignIntelligenceCapabilities();
  assert.equal(capabilities.geometryAuthority, "evavo-docs-suite");
  assert.equal(capabilities.providerCallPerformed, false);
  assert.equal(capabilities.selectionPerformed, false);
});
