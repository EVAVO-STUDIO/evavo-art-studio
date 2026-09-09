import assert from "node:assert/strict";
import test from "node:test";

import {
  HUMAN_CEL_AUTHORITY_PROTOCOL_VERSION,
  assertHumanCelAnimationAuthorityIntegrity,
  compileHumanCelAnimationAuthority,
} from "./human_cel_animation_authority_v1.mjs";

function strictHumanCelRequest() {
  return {
    id: "human-cel-regression",
    revision: 1,
    style: {
      motionStyle: "limited-cel",
      lineTreatment: "authored cleanup with intentional contour hierarchy",
      shapeLanguage: ["clear silhouette rhythm", "purposeful asymmetry"],
      antiGenericTraits: [
        "authored held drawings",
        "source-motivated cel shadows",
        "material-specific highlight logic",
      ],
      exclusions: [
        "blanket grading",
        "optical-flow interpolation",
        "fake analogue degradation",
      ],
    },
    subject: {
      subjectId: "eva",
      identityLockId: "eva-approved-model-sheet-v1",
      silhouetteAnchors: ["head-hair profile", "shoulder-torso proportion"],
      costumeAnchors: ["approved costume construction"],
      anatomyRule: "preserve approved construction and proportions across substitutions",
    },
    camera: {
      profileId: "eva-medium-performance-v1",
      motion: "authored",
      framing: "medium performance shot with preserved eyeline and screen direction",
    },
    performance: {
      intent: "attentive conversational acting",
      weight: "grounded restrained body mechanics",
      tempo: "authored held beats with deliberate substitutions",
      continuityAnchors: ["gaze continuity", "body-weight continuity"],
    },
    targets: ["cel-sequence"],
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test("human cel authority locks protocol .10 and the 0.39/0.15/0.28 handoff", () => {
  const authority = compileHumanCelAnimationAuthority(strictHumanCelRequest());

  assert.equal(HUMAN_CEL_AUTHORITY_PROTOCOL_VERSION, "2026-09-09.10");
  assert.equal(authority.protocolVersion, "2026-09-09.10");
  assert.equal(authority.authority.mode, "human-cel-authored");
  assert.equal(authority.authority.cleanupInk, "strict");
  assert.equal(authority.authority.colourPaint, "strict");
  assert.equal(authority.authority.colourReview, "strict");
  assert.equal(authority.authority.performanceActing, "strict");
  assert.equal(authority.authority.opticalCompositing, "strict");
  assert.equal(authority.authority.compositeReview, "strict");

  assert.equal(authority.handoff.targetRepository, "EVAVO-STUDIO/cel-animation-studio");
  assert.equal(authority.handoff.minimumPackageVersion, "0.39.0");
  assert.equal(authority.handoff.minimumContractsPackageVersion, "0.15.0");
  assert.equal(authority.handoff.minimumStorePackageVersion, "0.28.0");

  assert.equal(
    authority.authority.requiredPersistenceGate,
    "strict-human-cel-promotion-receipt-gate",
  );
  assert.equal(
    authority.authority.requiredPersistedStateIntegrity,
    "canonical-snapshot-render-job-integrity",
  );
  assert.equal(
    authority.authority.requiredStandaloneEvidenceStoreIntegrity,
    "integrity-aware-strict-envelope-and-quality-receipt-defaults",
  );
  assert.equal(authority.authority.requiresCandidateEnvelopeProvenance, true);
  assert.equal(authority.authority.requiresPersistencePromotionGate, true);
  assert.equal(authority.authority.requiresPersistedStateIntegrity, true);
  assert.equal(authority.authority.requiresStandaloneEvidenceStoreIntegrity, true);

  assert.equal(
    authority.handoff.requiredStoreIntegrity,
    "canonical-snapshot-render-job-integrity",
  );
  assert.equal(
    authority.handoff.requiredStandaloneEvidenceStoreIntegrity,
    "integrity-aware-strict-envelope-and-quality-receipt-defaults",
  );
  assert.ok(authority.handoff.requiredExports.includes("evaluateHumanCelColourReview"));
  assert.ok(authority.handoff.requiredExports.includes("evaluateHumanCelCompositeReview"));
  assert.ok(authority.handoff.requiredExports.includes("createHumanCelQualityReceipt"));
  assert.ok(authority.handoff.requiredExports.includes("assertHumanCelQualityReceiptBinding"));

  assert.doesNotThrow(() => assertHumanCelAnimationAuthorityIntegrity(authority));
});

test("human cel authority fails closed when protocol, Store or integrity requirements drift", () => {
  const authority = compileHumanCelAnimationAuthority(strictHumanCelRequest());

  const staleProtocol = clone(authority);
  staleProtocol.protocolVersion = "2026-09-09.9";
  assert.throws(
    () => assertHumanCelAnimationAuthorityIntegrity(staleProtocol),
    /HUMAN_CEL_AUTHORITY_PROTOCOL_INVALID/u,
  );

  const staleStore = clone(authority);
  staleStore.handoff.minimumStorePackageVersion = "0.27.0";
  assert.throws(
    () => assertHumanCelAnimationAuthorityIntegrity(staleStore),
    /HUMAN_CEL_AUTHORITY_STORE_GATE_INVALID/u,
  );

  const weakenedStandaloneStore = clone(authority);
  weakenedStandaloneStore.authority.requiresStandaloneEvidenceStoreIntegrity = false;
  assert.throws(
    () => assertHumanCelAnimationAuthorityIntegrity(weakenedStandaloneStore),
    /HUMAN_CEL_AUTHORITY_CRAFT_BINDING_INVALID/u,
  );
});

test("human cel authority keeps generic grading and interpolation substitutes explicitly prohibited", () => {
  const authority = compileHumanCelAnimationAuthority(strictHumanCelRequest());
  const prohibited = authority.prohibitedSubstitutions.join("\n");
  const practices = authority.requiredPractices.join("\n");
  const gates = authority.qualityGates.join("\n");

  for (const phrase of [
    "blanket blue-night wash",
    "generic optical-flow or frame interpolation",
    "blanket bloom",
    "constant idle body bob",
    "weaker default state validation",
  ]) {
    assert.ok(prohibited.includes(phrase), `missing prohibited substitution: ${phrase}`);
  }

  assert.match(practices, /dedicated colour-script review/u);
  assert.match(practices, /dedicated optical-composite review/u);
  assert.match(practices, /candidate bytes and strict envelope/u);
  assert.match(practices, /canonical snapshot and render-job state/u);
  assert.match(gates, /integrity-aware standalone strict evidence Store defaults/u);
  assert.match(gates, /exact candidate-byte-bound zero-blocker quality receipt/u);
});
