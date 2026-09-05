import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";

import { createWorkPageMediaReviewBundle } from "../dist/index.js";

async function image(width, height, background) {
  return sharp({ create: { width, height, channels: 4, background } }).png().toBuffer();
}

test("requires visual page review and blocks exact hero/support duplication", async () => {
  const header = await image(1920, 1080, "#222222");
  const result = await createWorkPageMediaReviewBundle({
    pageSlug: "example",
    header,
    support: header,
    desktopScreenshot: await image(1440, 1000, "#111111"),
    mobileScreenshot: await image(390, 844, "#111111"),
  });
  assert.equal(result.evidence.visualPageReviewRequired, true);
  assert.equal(result.evidence.publicationAllowed, false);
  assert.ok(result.evidence.blockers.includes("header-and-support-are-exact-duplicates"));
  assert.equal(result.evidence.decision, "reject");
  assert.ok(result.proofPng.length > 0);
});

test("warns when actual browser page context has not been supplied", async () => {
  const header = await image(1920, 1080, "#223344");
  const support = await image(900, 1200, "#884422");
  const result = await createWorkPageMediaReviewBundle({ header, support });
  assert.ok(result.evidence.warnings.includes("desktop-page-screenshot-not-provided"));
  assert.ok(result.evidence.warnings.includes("mobile-page-screenshot-not-provided"));
  assert.equal(result.evidence.visualPageReviewRequired, true);
});
