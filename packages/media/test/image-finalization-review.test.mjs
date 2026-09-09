import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";

import { reviewImageFinalization } from "../dist/index.js";

async function detailedPng({ alpha = 1 } = {}) {
  const width = 192;
  const height = 128;
  const raw = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const value = (x * 17 + y * 31 + ((x * y) % 47)) % 256;
      raw[i] = value;
      raw[i + 1] = (value * 3 + x * 5) % 256;
      raw[i + 2] = (value * 7 + y * 3) % 256;
      raw[i + 3] = Math.round(alpha * 255);
    }
  }
  return sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

test("clean technical and web-delivery evidence reaches approval review without auto promotion", async () => {
  const image = await detailedPng();
  const result = await reviewImageFinalization(image, {
    finishing: { reviewContext: { declaredProfile: "illustration" } },
    delivery: { target: "web", intendedFormat: "png" },
  });
  assert.equal(result.contract, "evavo.image-finalization-review.v1");
  assert.equal(result.delivery.grade, "pass");
  assert.equal(result.finishing.disposition, "ready-for-visual-review");
  assert.equal(result.decision, "ready-for-approval-review");
  assert.equal(result.automaticPromotionAllowed, false);
  assert.equal(result.sourceMutationAllowed, false);
  assert.ok(result.recommendedNextTools.includes("existing-promotion-and-approval-gates"));
});

test("semantic visual finding prevents a technically deliverable image from finalizing", async () => {
  const image = await detailedPng();
  const result = await reviewImageFinalization(image, {
    finishing: {
      reviewContext: { declaredProfile: "illustration" },
      visualFindings: ["broken-anatomy"],
    },
    delivery: { target: "web", intendedFormat: "png" },
  });
  assert.equal(result.delivery.grade, "pass");
  assert.equal(result.finishing.disposition, "semantic-repair");
  assert.equal(result.decision, "needs-image-finishing");
  assert.ok(result.recommendedNextTools.includes("governed-provider-edit-or-inpaint"));
  assert.ok(result.recommendedNextTools.includes("evavo_review_image_finalization"));
});

test("delivery blocker makes finalization blocked even when image content itself is usable", async () => {
  const image = await detailedPng({ alpha: 0.5 });
  const result = await reviewImageFinalization(image, {
    finishing: { reviewContext: { declaredProfile: "illustration" } },
    delivery: { target: "web", intendedFormat: "jpeg" },
  });
  assert.equal(result.delivery.grade, "fail");
  assert.equal(result.decision, "blocked");
  assert.ok(result.blockers.some((item) => item.includes("jpeg-delivery-cannot-preserve-alpha")));
  assert.ok(result.recommendedNextTools.includes("create-deliberate-delivery-derivative"));
});

test("non-blocking print packaging warning is kept separate from pixel finishing", async () => {
  const image = await detailedPng();
  const result = await reviewImageFinalization(image, {
    finishing: { reviewContext: { declaredProfile: "illustration" } },
    delivery: { target: "print" },
  });
  assert.equal(result.finishing.disposition, "ready-for-visual-review");
  assert.equal(result.delivery.grade, "warn");
  assert.equal(result.decision, "needs-delivery-review");
  assert.ok(result.warnings.some((item) => item.includes("print-physical-size-not-supplied")));
  assert.ok(result.recommendedNextTools.includes("evavo_review_image_delivery_integrity"));
});
