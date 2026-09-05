import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";

import { orchestrateImageReview } from "../dist/index.js";

async function makePng(width, height, pixel) {
  const raw = Buffer.alloc(width * height * 4);
  for (let i = 0; i < raw.length; i += 4) {
    raw[i] = pixel[0];
    raw[i + 1] = pixel[1];
    raw[i + 2] = pixel[2];
    raw[i + 3] = pixel[3];
  }
  return sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

test("uses work-header profile and requires visual review", async () => {
  const image = await makePng(1920, 1080, [80, 100, 120, 255]);
  const result = await orchestrateImageReview(image, { intendedRole: "work-header", filename: "hero.png" });
  assert.equal(result.profile, "web-hero");
  assert.equal(result.visualReviewRequired, true);
  assert.ok(["pass-to-visual-review", "needs-finishing", "reject"].includes(result.decision));
  assert.ok(result.header);
});

test("detects exact duplicate comparison as blocker", async () => {
  const image = await makePng(256, 256, [220, 30, 60, 255]);
  const result = await orchestrateImageReview(image, {
    declaredProfile: "illustration",
    compareAgainst: [{ id: "same", image }],
  });
  assert.ok(result.blockers.includes("exact-duplicate-of:same"));
  assert.equal(result.decision, "reject");
});

test("infers transparent logo profile from filename and alpha", async () => {
  const image = await makePng(256, 128, [220, 30, 60, 0]);
  const result = await orchestrateImageReview(image, { filename: "evavo-logo-mark.png" });
  assert.equal(result.profile, "logo-transparent");
});
