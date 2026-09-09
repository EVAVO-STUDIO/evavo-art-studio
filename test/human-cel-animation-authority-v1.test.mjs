import test from "node:test";
import assert from "node:assert/strict";

import {
  assertHumanCelAnimationAuthorityIntegrity,
  compileHumanCelAnimationAuthority,
} from "../tools/human_cel_animation_authority_v1.mjs";

function request(overrides = {}) {
  return {
    id: "eva_idle_cel",
    revision: 3,
    targets: ["cel-sequence"],
    subject: {
      subjectId: "eva",
      identityLockId: "eva_identity_v3",
      silhouetteAnchors: ["short bob silhouette", "distinct shoulder line"],
      costumeAnchors: ["collar geometry", "sleeve seam"],
      anatomyRule: "Preserve approved head, neck, shoulder and hand proportions.",
    },
    camera: {
      profileId: "eva_chat_camera",
      motion: "locked",
      framing: "three-quarter medium shot with stable horizon",
    },
    performance: {
      intent: "Quiet attentive idle with occasional deliberate eye and head substitution.",
      weight: "Grounded upper-body balance with no floating torso drift.",
      tempo: "Held body timing with sparse authored substitutions.",
      continuityAnchors: ["head centre remains registered", "shoulder line remains stable"],
    },
    style: {
      motionStyle: "limited-cel",
      lineTreatment: "economical cleanup with controlled contour hierarchy and stable held lines",
      shapeLanguage: ["clean constructed silhouette", "restrained interior detail"],
      antiGenericTraits: ["specific face construction", "held cel stability", "source-based lighting"],
      exclusions: ["pseudo-text", "random line boil", "generic rim light"],
    },
    ...overrides,
  };
}

test("compiles strict human cel authority for cel animation requests", () => {
  const authority = compileHumanCelAnimationAuthority(request());
  assert.equal(authority.authority.mode, "human-cel-authored");
  assert.equal(authority.authority.preferredPromptCompiler, "createHumanCelRenderPrompt");
  assert.equal(authority.authority.requiredQualityGate, "evaluateHumanCelQualityGate");
  assert.equal(authority.handoff.minimumPackageVersion, "0.31.0");
  assert.equal(assertHumanCelAnimationAuthorityIntegrity(authority), true);
});

test("rejects non-cel motion styles from strict human cel authority", () => {
  const value = request();
  value.style.motionStyle = "cinematic-naturalistic";
  assert.throws(
    () => compileHumanCelAnimationAuthority(value),
    /HUMAN_CEL_AUTHORITY_CEL_MOTION_STYLE_REQUIRED/,
  );
});

test("rejects requests without a cel or video delivery target", () => {
  const value = request({ targets: ["godot-sprite"] });
  assert.throws(
    () => compileHumanCelAnimationAuthority(value),
    /HUMAN_CEL_AUTHORITY_CEL_OR_VIDEO_TARGET_REQUIRED/,
  );
});
