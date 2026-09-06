import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import sharp from "sharp";

import { reviewEnhancementStudioCandidate } from "../dist/index.js";

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

async function makePatternPng(width, height) {
  const raw = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      raw[i] = (x * 13 + y * 3) % 256;
      raw[i + 1] = (x * 5 + y * 11) % 256;
      raw[i + 2] = (x * 7 + y * 17) % 256;
      raw[i + 3] = 255;
    }
  }
  return sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

const sha = (buffer) => createHash("sha256").update(buffer).digest("hex");

function manifest(source, candidate, width, height, role = "illustration", profile = "illustration", learned = false) {
  return {
    contract: "evavo.enhancement-art-review.v1",
    source_path: "/source.png",
    source_sha256: sha(source),
    source_width: width,
    source_height: height,
    candidate_path: "/candidate.png",
    candidate_sha256: sha(candidate),
    candidate_width: width,
    candidate_height: height,
    enhancement_profile: profile,
    art_studio_review_profile: profile,
    intended_role: role,
    learned_candidate: learned,
    mandatory_art_studio_tools: [
      "evavo_review_existing_image_quality",
      "evavo_review_existing_image_edit",
      "evavo_create_existing_image_inspection_proof",
      ...(role === "work-header" ? ["evavo_review_work_header_image", "evavo_review_image_for_intended_use"] : []),
    ],
    mandatory_visual_checks: ["review candidate visually"],
    approval_state: "unapproved",
    source_immutable: true,
    candidate_is_review_only: true,
    art_studio_visual_review_required: true,
    page_context_review_required: ["work-header", "support-image", "catalogue-tile"].includes(role),
    publication_allowed: false,
    cloud_overwrite_allowed: false,
    automatic_creative_approval: false,
    automatic_release_approval: false,
  };
}

test("end-to-end enhancement review never grants publishing authority", async () => {
  const source = await makePng(320, 180, [60, 80, 100, 255]);
  const candidate = await makePng(320, 180, [62, 82, 102, 255]);
  const result = await reviewEnhancementStudioCandidate({ manifest: manifest(source, candidate, 320, 180), source, candidate });
  assert.equal(result.evidence.sourceBytesVerified, true);
  assert.equal(result.evidence.candidateBytesVerified, true);
  assert.equal(result.evidence.publicationAllowed, false);
  assert.equal(result.evidence.cloudOverwriteAllowed, false);
  assert.equal(result.evidence.automaticCreativeApproval, false);
  assert.equal(result.evidence.finalVisualApprovalRequired, true);
  assert.ok(result.qualityProofPng.length > 0);
  assert.ok(result.differenceProofPng.length > 0);
});

test("rejects candidate bytes that do not match manifest", async () => {
  const source = await makePng(64, 64, [10, 20, 30, 255]);
  const candidate = await makePng(64, 64, [11, 21, 31, 255]);
  const wrong = await makePng(64, 64, [99, 99, 99, 255]);
  await assert.rejects(
    () => reviewEnhancementStudioCandidate({ manifest: manifest(source, candidate, 64, 64), source, candidate: wrong }),
    /candidate bytes do not match/i,
  );
});

test("work header review carries page-context requirement and page proof", async () => {
  const source = await makePng(1600, 900, [70, 90, 110, 255]);
  const candidate = await makePng(1600, 900, [72, 92, 112, 255]);
  const support = await makePng(900, 1200, [150, 80, 40, 255]);
  const desktop = await makePng(1440, 900, [20, 20, 20, 255]);
  const mobile = await makePng(390, 844, [22, 22, 22, 255]);
  const m = manifest(source, candidate, 1600, 900, "work-header", "web-hero");
  const result = await reviewEnhancementStudioCandidate({ manifest: m, source, candidate, support, desktopScreenshot: desktop, mobileScreenshot: mobile });
  assert.ok(result.evidence.pageContextReview);
  assert.ok(result.pageProofPng);
  assert.equal(result.evidence.pageContextComplete, true);
  assert.equal(result.evidence.publicationAllowed, false);
});

test("support image review uses current header for page relationship QA", async () => {
  const source = await makePng(900, 1200, [100, 70, 50, 255]);
  const candidate = await makePng(900, 1200, [102, 72, 52, 255]);
  const header = await makePng(1600, 900, [30, 50, 80, 255]);
  const m = manifest(source, candidate, 900, 1200, "support-image", "illustration");
  const result = await reviewEnhancementStudioCandidate({ manifest: m, source, candidate, header });
  assert.ok(result.evidence.pageContextReview);
  assert.ok(result.pageProofPng);
  assert.equal(result.evidence.pageContextComplete, false);
  assert.equal(result.evidence.cloudOverwriteAllowed, false);
});

test("learned candidate with no proven source-space benefit is blocked", async () => {
  const source = await makePatternPng(320, 180);
  const candidate = Buffer.from(source);
  const m = manifest(source, candidate, 320, 180, "illustration", "illustration", true);
  const result = await reviewEnhancementStudioCandidate({ manifest: m, source, candidate });
  assert.equal(result.evidence.materialTechnicalBenefitFound, false);
  assert.ok(result.evidence.blockers.includes("learned-enhancement-has-no-proven-source-space-benefit"));
  assert.equal(result.evidence.decision, "reject");
});

test("website media cannot become visual-review ready without desktop and mobile context", async () => {
  const source = await makePatternPng(1600, 900);
  const candidate = await sharp(source).modulate({ brightness: 1.01 }).png().toBuffer();
  const support = await makePatternPng(900, 1200);
  const m = manifest(source, candidate, 1600, 900, "work-header", "web-hero");
  const result = await reviewEnhancementStudioCandidate({ manifest: m, source, candidate, support });
  assert.equal(result.evidence.pageContextComplete, false);
  assert.notEqual(result.evidence.decision, "ready-for-human-visual-review");
  assert.ok(result.evidence.warnings.includes("desktop-page-context-missing"));
  assert.ok(result.evidence.warnings.includes("mobile-page-context-missing"));
});
