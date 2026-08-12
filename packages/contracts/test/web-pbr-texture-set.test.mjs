import assert from "node:assert/strict";
import test from "node:test";

import {
  WEB_PBR_TEXTURE_SET_CONTRACT_VERSION,
  assertWebPbrTextureSet,
  validateWebPbrTextureSet,
} from "../dist/index.js";

const sha = (character) => character.repeat(64);

function fixture() {
  return {
    contractVersion: WEB_PBR_TEXTURE_SET_CONTRACT_VERSION,
    textureSetId: "weathered-red-paint-art-v1",
    textureSetVersion: 1,
    approval: "approved",
    consumer: {
      repository: "EVAVO-STUDIO/threejs-experiments",
      materialRecipeIds: ["weathered-red-bike-v1"],
      fallbackTextureSetId: "weathered-red-paint-procedural-v1",
      fallbackRetentionRequiredUntilConsumerAdmission: true,
    },
    source: {
      repository: "EVAVO-STUDIO/evavo-art-studio",
      revision: "0123456789abcdef",
      sourceSha256: sha("a"),
    },
    channels: [
      {
        role: "base-color",
        format: "ktx2",
        colorSpace: "srgb",
        uri: "/assets/textures/rainy-red-bicycle/red-paint/base-color.ktx2",
        sha256: sha("b"),
        bytes: 1048576,
        width: 2048,
        height: 2048,
      },
      {
        role: "roughness",
        format: "ktx2",
        colorSpace: "linear",
        uri: "/assets/textures/rainy-red-bicycle/red-paint/roughness.ktx2",
        sha256: sha("c"),
        bytes: 524288,
        width: 2048,
        height: 2048,
      },
      {
        role: "normal",
        format: "ktx2",
        colorSpace: "linear",
        uri: "/assets/textures/rainy-red-bicycle/red-paint/normal.ktx2",
        sha256: sha("d"),
        bytes: 1048576,
        width: 2048,
        height: 2048,
      },
      {
        role: "ao",
        format: "ktx2",
        colorSpace: "linear",
        uri: "/assets/textures/rainy-red-bicycle/red-paint/ao.ktx2",
        sha256: sha("e"),
        bytes: 524288,
        width: 2048,
        height: 2048,
      },
    ],
    sampling: {
      repeat: [1, 1],
      anisotropy: 8,
    },
    rights: {
      status: "cleared",
      provenanceNote: "Authored and reviewed inside EVAVO Art Studio for the Rainy Red Bicycle consumer scene.",
    },
    review: {
      status: "approved",
      checks: [
        { id: "channel-role-colour-space", status: "pass" },
        { id: "seam-and-tiling", status: "pass", detail: "No visible wrap seam at the approved repeat." },
        { id: "fixed-lighting-preview", status: "pass" },
        { id: "rights-and-provenance", status: "pass" },
      ],
      previewArtifactSha256: sha("f"),
    },
    consumerReview: {
      materialLabDryWetRequired: true,
      independentVisualApprovalRequired: true,
    },
  };
}

test("publishes a Three.js-ready approved PBR texture-set contract", () => {
  const value = fixture();
  const result = validateWebPbrTextureSet(value);
  assert.equal(result.valid, true, JSON.stringify(result.issues));
  assert.doesNotThrow(() => assertWebPbrTextureSet(value));
});

test("fails closed when a data channel is marked sRGB", () => {
  const value = fixture();
  value.channels[1].colorSpace = "srgb";
  const result = validateWebPbrTextureSet(value);
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((entry) => entry.code === "ART_WEB_PBR_CHANNEL_COLOR_SPACE_INVALID"));
});

test("fails closed on unsafe channel URIs and invalid exact hashes", () => {
  const value = fixture();
  value.channels[0].uri = "/assets/../private/base-color.png";
  value.channels[0].sha256 = "not-a-sha";
  const result = validateWebPbrTextureSet(value);
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((entry) => entry.code === "ART_WEB_PBR_CHANNEL_URI_INVALID"));
  assert.ok(result.issues.some((entry) => entry.code === "ART_WEB_PBR_CHANNEL_HASH_INVALID"));
});

test("retains the procedural fallback until Three.js consumer admission", () => {
  const value = fixture();
  value.consumer.fallbackRetentionRequiredUntilConsumerAdmission = false;
  const result = validateWebPbrTextureSet(value);
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((entry) => entry.code === "ART_WEB_PBR_FALLBACK_RETENTION_REQUIRED"));
});

test("requires cleared rights and every producer review check", () => {
  const value = fixture();
  value.rights.status = "unknown";
  value.review.checks = value.review.checks.filter((entry) => entry.id !== "seam-and-tiling");
  const result = validateWebPbrTextureSet(value);
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((entry) => entry.code === "ART_WEB_PBR_RIGHTS_NOT_CLEARED"));
  assert.ok(result.issues.some((entry) => entry.code === "ART_WEB_PBR_REQUIRED_REVIEW_CHECK_MISSING"));
});

test("does not let producer approval bypass Material Lab or independent consumer review", () => {
  const value = fixture();
  value.consumerReview.materialLabDryWetRequired = false;
  value.consumerReview.independentVisualApprovalRequired = false;
  const result = validateWebPbrTextureSet(value);
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((entry) => entry.code === "ART_WEB_PBR_MATERIAL_LAB_REVIEW_REQUIRED"));
  assert.ok(result.issues.some((entry) => entry.code === "ART_WEB_PBR_INDEPENDENT_REVIEW_REQUIRED"));
});

test("rejects candidate or unapproved producer output", () => {
  const value = fixture();
  value.approval = "candidate";
  value.review.status = "review-required";
  const result = validateWebPbrTextureSet(value);
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((entry) => entry.code === "ART_WEB_PBR_APPROVAL_REQUIRED"));
  assert.ok(result.issues.some((entry) => entry.code === "ART_WEB_PBR_REVIEW_APPROVAL_REQUIRED"));
});
