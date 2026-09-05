import assert from "node:assert/strict";
import test from "node:test";

import {
  IMAGE_REVIEW_PROFILE_NAMES,
  getImageReviewProfile,
  listImageReviewProfiles,
} from "../dist/index.js";

test("exposes all governed image review profiles", () => {
  const profiles = listImageReviewProfiles();
  assert.equal(profiles.length, IMAGE_REVIEW_PROFILE_NAMES.length);
  for (const name of IMAGE_REVIEW_PROFILE_NAMES) {
    const profile = getImageReviewProfile(name);
    assert.equal(profile.name, name);
    assert.ok(profile.visualChecks.length >= 4);
    assert.ok(profile.maximumChangedPixelRatio > 0 && profile.maximumChangedPixelRatio <= 1);
  }
});

test("pixel art review does not inherit photographic assumptions", () => {
  const pixel = getImageReviewProfile("pixel-art");
  const photo = getImageReviewProfile("photo");
  assert.ok(pixel.minimumSharpness < photo.minimumSharpness);
  assert.ok(pixel.maximumBlockinessRatio > photo.maximumBlockinessRatio);
  assert.equal(pixel.preserveOpaqueRgb, true);
});

test("transparent logo profile is stricter about edge contamination", () => {
  const logo = getImageReviewProfile("logo-transparent");
  const hero = getImageReviewProfile("web-hero");
  assert.ok(logo.maximumEdgeHaloRiskRatio < hero.maximumEdgeHaloRiskRatio);
  assert.ok(logo.maximumTransparentRgbContaminationRatio < hero.maximumTransparentRgbContaminationRatio);
  assert.equal(logo.preserveOpaqueRgb, true);
});
