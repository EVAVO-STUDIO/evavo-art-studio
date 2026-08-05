import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  BOOK_ILLUSTRATION_INTELLIGENCE_CAPABILITIES,
  compileBookIllustrationIntelligencePlan,
  evaluateBookIllustrationCandidate,
  canonicalBookIllustrationJson,
  fingerprintBookIllustrationValue,
  validateBookIllustrationIntelligencePlan,
} from "../dist/book-illustration-intelligence.js";

const digest = (character) => `sha256:${character.repeat(64)}`;

function planningInput() {
  return {
    outputKind: "evavo_art_book_illustration_planning_input",
    schemaVersion: 1,
    contract: "evavo_art_book_illustration_intelligence_v1",
    identity: {
      workspaceId: "workspace-1",
      projectId: "project-1",
      bookId: "book-1",
      editionId: "edition-paperback",
      requestId: "request-art-1",
      assetId: "cover-route-1",
    },
    purpose: "front_cover_art",
    contentClass: "historical dark fantasy",
    visualPacketFingerprint: digest("a"),
    sourceBriefFingerprint: digest("b"),
    processFamily: "relief_engraving",
    genreRoute: "grimdark_tabletop_fantasy",
    desiredAesthetic:
      "monumental project-owned military and ecclesiastical silhouettes, severe value grouping, weathered heraldic geometry, material-specific engraved linework, restrained red spot colour, no proprietary symbols",
    narrativeBrief: {
      primarySubject: "a rain-dark surveyor holding a cracked brass lantern beneath a leaning bell tower",
      supportingSubjects: ["flooded stone gate", "distant civic crowd"],
      narrativePurpose: "promise public danger, restraint and civic conflict without revealing the ending",
      emotionalTemperature: "controlled dread rather than spectacle",
      visualAction: "the surveyor tests the flood depth while the silent bell dominates the skyline",
      compositionRequirements: [
        "strong silhouette at thumbnail size",
        "leave clean title space in the upper left",
        "use the gate as narrative geometry rather than decorative scenery",
      ],
      mustShow: ["cracked brass lantern", "leaning bell tower", "flooded cobbles"],
      mustAvoid: [
        "ending revelation",
        "readable generated text",
        "logos",
        "modern materials",
        "generic armoured hero pose",
      ],
      researchEvidenceIds: ["research-lantern-1", "research-gate-1"],
    },
    continuityLockIds: [
      "character:mara",
      "location:east-gate",
      "prop:surveyor-lantern",
      "motif:silent-bell",
    ],
    rightsEvidenceIds: ["rights-original-project-1"],
    namedCreatorReferences: [],
    brandedFranchiseReferences: [],
    printProfile: {
      profileId: "kdp_print",
      trimWidthInches: 6,
      trimHeightInches: 9,
      deliveryWidthInches: 6.25,
      deliveryHeightInches: 9.25,
      geometryAuthority: "docs_suite_exact_dimensions",
      bleedRequired: true,
      minimumPpi: 300,
      pureLineArtPpi: 600,
      screenLpi: 150,
      colourMode: "spot_colour",
      paperDescription: "uncoated cream trade-paperback stock",
      maximumInkCoveragePercent: 240,
    },
    presentationPolicy: {
      generatedArtworkTextFreeRequired: true,
      editableTypographyRequired: true,
      editableLetteringRequired: false,
      labelsOwnedByDocsSuite: true,
      altTextOwnedByDocsSuite: true,
      provenanceDisclosureRequired: true,
    },
    requestedAt: "2026-08-05T05:00:00.000Z",
    requestedBy: "book-automation",
    providerCallAllowed: false,
    automaticSelectionAllowed: false,
    automaticPromotionAllowed: false,
    bookUseBindingAllowed: false,
    publicationAllowed: false,
  };
}

function compilePlan() {
  const result = compileBookIllustrationIntelligencePlan(planningInput());
  assert.equal(result.status, "ready");
  assert.ok(result.plan);
  return result.plan;
}

function goodQaInput(plan) {
  return {
    outputKind: "evavo_art_book_illustration_candidate_qa_input",
    schemaVersion: 1,
    contract: "evavo_art_book_illustration_intelligence_v1",
    candidateId: "candidate-cover-1",
    plan,
    observedPlanFingerprint: plan.planFingerprint,
    observedVisualPacketFingerprint: plan.visualPacketFingerprint,
    observedContinuityLockIds: [...plan.continuityLockIds],
    technical: {
      widthPx: 3750,
      heightPx: 5550,
      printWidthInches: 6.25,
      printHeightInches: 9.25,
      effectiveContinuousTonePpi: 600,
      effectivePureLineArtPpi: 600,
      bleedInchesPerOuterEdge: 0.125,
      hasTransparency: true,
      flattenedForDelivery: true,
      editableLayeredMasterAvailable: true,
      minimumPositiveLineWidthPx: 2,
      minimumReverseLineWidthPx: 2.5,
      maximumInkCoveragePercent: 220,
      tonalStepCount: 7,
      embeddedTextDetected: false,
      embeddedLogoDetected: false,
    },
    craft: {
      lineWeightVariance: 82,
      hatchLightConsistency: 91,
      materialMarkVariation: 86,
      repeatedTextureScore: 4,
      randomNoiseScore: 3,
      pseudoDetailScore: 4,
      anatomyScore: 91,
      handsAndFacesScore: 92,
      perspectiveScore: 90,
      continuityScore: 96,
      digitalSmoothingScore: 8,
      compositionScore: 94,
      printSeparationScore: 93,
    },
    rights: {
      namedCreatorImitationDetected: false,
      brandedFranchiseElementsDetected: false,
      distinctiveSurfaceReconstructionDetected: false,
      falseHandmadeClaimDetected: false,
      syntheticProvenanceHidden: false,
    },
    evidenceIds: ["evidence-raster-1", "evidence-craft-review-1"],
    providerCallPerformedByQa: false,
    candidateBytesRewrittenByQa: false,
    automaticSelectionAllowed: false,
    automaticPromotionAllowed: false,
    publicationAllowed: false,
  };
}

test("compiles a rights-safe old-school print-craft plan with editable presentation", () => {
  const plan = compilePlan();
  assert.deepEqual(plan.capabilities, BOOK_ILLUSTRATION_INTELLIGENCE_CAPABILITIES);
  assert.equal(plan.genreRoute, "grimdark_tabletop_fantasy");
  assert.equal(plan.markGrammar.contourHierarchy.minimumDistinctWeights, 3);
  assert.equal(plan.markGrammar.hatchGrammar.randomScratchOverlayProhibited, true);
  assert.equal(plan.printRequirements.minimumContinuousTonePpi, 300);
  assert.equal(plan.printRequirements.minimumPureLineArtPpi, 600);
  assert.equal(plan.printRequirements.bleedInchesPerOuterEdge, 0.125);
  assert.equal(plan.layerPlan.generatedTextInsideArtworkAllowed, false);
  assert.equal(plan.layerPlan.typographyLayer, "docs_suite_editable_typography");
  assert.deepEqual(validateBookIllustrationIntelligencePlan(plan), []);
});

test("accepts an evidence-complete candidate only for independent review", () => {
  const plan = compilePlan();
  const result = evaluateBookIllustrationCandidate(goodQaInput(plan));
  assert.equal(result.status, "ready_for_independent_review");
  assert.deepEqual(result.findings, []);
  assert.equal(result.selectionPerformed, false);
  assert.equal(result.promotionPerformed, false);
  assert.equal(result.bookUseBindingCreated, false);
});

test("rejects synthetic-looking craft, print, continuity, presentation and rights failures together", () => {
  const plan = compilePlan();
  const input = goodQaInput(plan);
  Object.assign(input.technical, {
    widthPx: 1200,
    heightPx: 1800,
    effectiveContinuousTonePpi: 190,
    effectivePureLineArtPpi: 250,
    bleedInchesPerOuterEdge: 0,
    flattenedForDelivery: false,
    editableLayeredMasterAvailable: false,
    minimumPositiveLineWidthPx: 0.5,
    minimumReverseLineWidthPx: 0.75,
    maximumInkCoveragePercent: 330,
    tonalStepCount: 22,
    embeddedTextDetected: true,
    embeddedLogoDetected: true,
  });
  Object.assign(input.craft, {
    lineWeightVariance: 10,
    hatchLightConsistency: 20,
    materialMarkVariation: 15,
    repeatedTextureScore: 90,
    randomNoiseScore: 95,
    pseudoDetailScore: 92,
    anatomyScore: 20,
    handsAndFacesScore: 10,
    perspectiveScore: 25,
    continuityScore: 30,
    digitalSmoothingScore: 90,
    compositionScore: 35,
    printSeparationScore: 25,
  });
  Object.assign(input.rights, {
    namedCreatorImitationDetected: true,
    brandedFranchiseElementsDetected: true,
    distinctiveSurfaceReconstructionDetected: true,
    falseHandmadeClaimDetected: true,
    syntheticProvenanceHidden: true,
  });
  input.observedContinuityLockIds = ["character:substituted"];
  const result = evaluateBookIllustrationCandidate(input);
  assert.equal(result.status, "rejected");
  for (const code of [
    "raster_dimensions_below_plan",
    "line_art_ppi_low",
    "bleed_insufficient",
    "embedded_text_detected",
    "random_scratch_overlay",
    "repeated_texture_stamps",
    "hands_faces_failure",
    "continuity_failure",
    "branded_franchise_transfer",
    "false_handmade_claim",
  ]) {
    assert.ok(result.blockerCodes.includes(code), code);
  }
});

test("blocks named-creator, branded-franchise and provenance-concealment prompts", () => {
  const input = planningInput();
  input.namedCreatorReferences = ["Living Illustrator"];
  input.brandedFranchiseReferences = ["Protected Franchise"];
  input.desiredAesthetic = "AI-undetectable art in the style of Living Illustrator";
  const result = compileBookIllustrationIntelligencePlan(input);
  assert.equal(result.status, "blocked");
  assert.match(result.blockers.join("\n"), /Named creator references are prohibited/);
  assert.match(result.blockers.join("\n"), /Branded franchise references are prohibited/);
  assert.match(result.blockers.join("\n"), /provenance-concealment/);
});

test("detects plan tampering", () => {
  const plan = compilePlan();
  const tampered = structuredClone(plan);
  tampered.markGrammar.hatchGrammar.maximumCrosshatchLayers = 99;
  assert.match(validateBookIllustrationIntelligencePlan(tampered).join("\n"), /fingerprint/i);
});

test("uses standards-compliant SHA-256 fingerprints", () => {
  assert.equal(
    fingerprintBookIllustrationValue("abc"),
    "sha256:6cc43f858fbb763301637b5af970e2a46b46f461f27e5a0f41e009c59b827b25",
  );
});


test("does not infer print geometry and requires exact Docs Suite dimensions", () => {
  const missing = planningInput();
  delete missing.printProfile.deliveryWidthInches;
  delete missing.printProfile.deliveryHeightInches;
  const missingResult = compileBookIllustrationIntelligencePlan(missing);
  assert.equal(missingResult.status, "blocked");
  assert.match(missingResult.blockers.join("\n"), /deliveryWidthInches|deliveryHeightInches/);

  const wrongAuthority = planningInput();
  wrongAuthority.printProfile.geometryAuthority = "provider_guess";
  const authorityResult = compileBookIllustrationIntelligencePlan(wrongAuthority);
  assert.equal(authorityResult.status, "blocked");
  assert.match(authorityResult.blockers.join("\n"), /docs_suite_exact_dimensions/);
});

test("requires an exact external template for full-wrap artwork", () => {
  const input = planningInput();
  input.purpose = "full_wrap_art";
  input.printProfile.deliveryWidthInches = 12.8;
  const result = compileBookIllustrationIntelligencePlan(input);
  assert.equal(result.status, "blocked");
  assert.match(result.blockers.join("\n"), /externalTemplateFingerprint/);

  input.printProfile.externalTemplateFingerprint = digest("f");
  const ready = compileBookIllustrationIntelligencePlan(input);
  assert.equal(ready.status, "ready");
  assert.equal(
    ready.plan.printRequirements.externalTemplateFingerprint,
    digest("f"),
  );
});

test("requires editable lettering for graphic-novel artwork", () => {
  const input = planningInput();
  input.purpose = "graphic_novel_page";
  input.processFamily = "graphic_novel_ink";
  input.genreRoute = "graphic_novel";
  input.presentationPolicy.editableLetteringRequired = false;
  const result = compileBookIllustrationIntelligencePlan(input);
  assert.equal(result.status, "blocked");
  assert.match(result.blockers.join("\n"), /editableLetteringRequired/);
});

test("plan validation rejects recomputed unknown authority and geometry tampering", () => {
  const plan = compilePlan();
  const unknown = structuredClone(plan);
  unknown.silentPromotionAuthority = true;
  unknown.planFingerprint = fingerprintBookIllustrationValue(
    Object.fromEntries(Object.entries(unknown).filter(([key]) => key !== "planFingerprint")),
  );
  assert.match(validateBookIllustrationIntelligencePlan(unknown).join("\n"), /unknown fields/);

  const geometry = structuredClone(plan);
  geometry.printRequirements.geometryAuthority = "provider_guess";
  geometry.planFingerprint = fingerprintBookIllustrationValue(
    Object.fromEntries(Object.entries(geometry).filter(([key]) => key !== "planFingerprint")),
  );
  assert.match(validateBookIllustrationIntelligencePlan(geometry).join("\n"), /Docs Suite exact dimensions/);
});

test("rejects calendar-invalid planning timestamps", () => {
  const input = planningInput();
  input.requestedAt = "2026-13-40T05:00:00.000Z";
  const result = compileBookIllustrationIntelligencePlan(input);
  assert.equal(result.status, "blocked");
  assert.match(result.blockers.join("\n"), /real canonical UTC timestamp/);
});


test("matches Node SHA-256 for Unicode and long canonical JSON", () => {
  for (const value of [
    "é漢字😀",
    { process: "wood engraving", paper: "wove — crème", note: "灯" },
    "crosshatch-".repeat(10_000),
  ]) {
    const expected = `sha256:${createHash("sha256")
      .update(canonicalBookIllustrationJson(value), "utf8")
      .digest("hex")}`;
    assert.equal(fingerprintBookIllustrationValue(value), expected);
  }
});
