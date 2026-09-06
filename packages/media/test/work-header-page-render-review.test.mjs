import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";

import { reviewWorkHeaderPageRender } from "../dist/index.js";

async function screenshot(width, height, seed) {
  const raw = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      raw[i] = (x + seed) % 255;
      raw[i + 1] = (y + seed * 2) % 255;
      raw[i + 2] = (x + y + seed) % 255;
      raw[i + 3] = 255;
    }
  }
  return sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

async function base(overrides = {}) {
  return {
    pageSlug: "/work/opportunity-agent",
    pageTitle: "Opportunity Agent",
    candidateId: "candidate-a",
    candidateSha256: "a".repeat(64),
    currentDesktop: await screenshot(1440, 900, 1),
    candidateDesktop: await screenshot(1440, 900, 2),
    currentMobile: await screenshot(390, 844, 3),
    candidateMobile: await screenshot(390, 844, 4),
    titleLegibility: 4.5,
    focalPointQuality: 4.5,
    hierarchyQuality: 4.4,
    responsiveConsistency: 4.5,
    overallPageQuality: 4.5,
    titleObscured: false,
    textContrastFailure: false,
    importantSubjectCropped: false,
    layoutOverflowOrBreakage: false,
    candidateLooksWorseThanCurrent: false,
    notes: ["Candidate improves page hierarchy without losing the focal subject."],
    ...overrides,
  };
}

test("page-render review binds desktop and mobile screenshot hashes", async () => {
  const result = await reviewWorkHeaderPageRender(await base());
  assert.equal(result.evidence.verdict, "page-shortlist");
  assert.match(result.evidence.currentDesktopSha256, /^[0-9a-f]{64}$/u);
  assert.match(result.evidence.candidateMobileSha256, /^[0-9a-f]{64}$/u);
  assert.equal(result.evidence.exactScreenshotHashesBound, true);
  assert.equal(result.evidence.automaticWebsiteMutationAllowed, false);
  assert.ok(result.proofPng.length > 0);
});

test("page-render review hard rejects a mobile subject crop failure", async () => {
  const result = await reviewWorkHeaderPageRender(await base({ importantSubjectCropped: true }));
  assert.equal(result.evidence.verdict, "reject");
  assert.ok(result.evidence.disqualifiers.includes("important-subject-cropped"));
});

test("page-render review rejects a candidate explicitly judged worse than current", async () => {
  const result = await reviewWorkHeaderPageRender(await base({ candidateLooksWorseThanCurrent: true }));
  assert.equal(result.evidence.verdict, "reject");
  assert.ok(result.evidence.disqualifiers.includes("candidate-looks-worse-than-current-page"));
});
