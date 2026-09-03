import assert from "node:assert/strict";
import test from "node:test";

import {
  FACTUAL_VISUAL_AUTHORITY_CONTRACT_VERSION,
  validateFactualVisualAuthority,
} from "../dist/index.js";

function fixture() {
  return {
    contractVersion: FACTUAL_VISUAL_AUTHORITY_CONTRACT_VERSION,
    visualId: "apollo-lm-cutaway-v1",
    visualClass: "technical-cutaway",
    factual: true,
    claimIds: ["claim-lm-layout"],
    sourceIds: ["source-nasa-lm-manual"],
    protectedFacts: ["The ascent stage sits above the descent stage."],
    protectedGeometry: ["Ascent stage remains vertically above descent stage; engine bells point downward."],
    permittedSimplifications: ["Fasteners may be omitted at display scale."],
    uncertaintyNotes: [],
    origin: "generated",
    documentaryAppearance: false,
    disclosure: { required: false, text: null },
    review: {
      factReviewed: true,
      geometryReviewed: true,
      disclosureReviewed: true,
      unresolvedBlockers: [],
    },
    approval: "approved",
    truth: {
      generatedVisualDoesNotBecomeDocumentaryEvidence: true,
      visualApprovalDoesNotProveUnderlyingClaims: true,
      protectedFactsMustNotBeSilentlyChanged: true,
    },
  };
}

test("admits a reviewed evidence-bound factual cutaway", () => {
  const result = validateFactualVisualAuthority(fixture());
  assert.equal(result.valid, true, JSON.stringify(result.issues));
});

test("factual visuals require claim, source and protected-fact bindings", () => {
  const value = fixture();
  value.claimIds = [];
  value.sourceIds = [];
  value.protectedFacts = [];
  const result = validateFactualVisualAuthority(value);
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((item) => item.code === "ART_FACTUAL_VISUAL_FACTUAL_CLAIMS_REQUIRED"));
  assert.ok(result.issues.some((item) => item.code === "ART_FACTUAL_VISUAL_FACTUAL_SOURCES_REQUIRED"));
  assert.ok(result.issues.some((item) => item.code === "ART_FACTUAL_VISUAL_PROTECTED_FACTS_REQUIRED"));
});

test("generated documentary-looking imagery requires explicit disclosure", () => {
  const value = fixture();
  value.documentaryAppearance = true;
  value.disclosure = { required: false, text: null };
  const result = validateFactualVisualAuthority(value);
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((item) => item.code === "ART_FACTUAL_VISUAL_DISCLOSURE_MUST_BE_REQUIRED"));
  assert.ok(result.issues.some((item) => item.code === "ART_FACTUAL_VISUAL_DISCLOSURE_TEXT_REQUIRED"));
});

test("historical reconstruction always requires a disclosure label", () => {
  const value = fixture();
  value.visualClass = "historical-reconstruction";
  value.origin = "human-authored";
  value.disclosure = { required: false, text: null };
  const result = validateFactualVisualAuthority(value);
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((item) => item.code === "ART_FACTUAL_VISUAL_DISCLOSURE_MUST_BE_REQUIRED"));
});

test("approved protected geometry must have been reviewed and blockers cleared", () => {
  const value = fixture();
  value.review.geometryReviewed = false;
  value.review.unresolvedBlockers = ["Engine orientation differs from reference diagram."];
  const result = validateFactualVisualAuthority(value);
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((item) => item.code === "ART_FACTUAL_VISUAL_GEOMETRY_REVIEW_REQUIRED"));
  assert.ok(result.issues.some((item) => item.code === "ART_FACTUAL_VISUAL_UNRESOLVED_BLOCKERS"));
});

test("decorative non-factual art can remain unconstrained by factual evidence", () => {
  const value = fixture();
  value.visualClass = "decorative";
  value.factual = false;
  value.claimIds = [];
  value.sourceIds = [];
  value.protectedFacts = [];
  value.protectedGeometry = [];
  value.origin = "human-authored";
  const result = validateFactualVisualAuthority(value);
  assert.equal(result.valid, true, JSON.stringify(result.issues));
});
