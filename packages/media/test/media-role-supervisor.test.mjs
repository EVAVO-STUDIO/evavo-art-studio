import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateMediaCandidate,
  rankMediaCandidates,
} from "../dist/index.js";

test("rejects SVG heroes and catalogue-only detail media", () => {
  const svgHero = evaluateMediaCandidate(
    {
      id: "/images/work/temp-hero.svg",
      width: 1672,
      height: 941,
      format: "svg",
      status: "production",
      assetRole: "detail hero",
    },
    { role: "detail-hero" },
  );
  assert.equal(svgHero.eligible, false);
  assert.equal(svgHero.action, "reject");
  assert.ok(svgHero.reasons.some((reason) => /raster media, not SVG/i.test(reason)));

  const gearNetwork = evaluateMediaCandidate(
    {
      id: "automation-systems-gear-network-2026",
      width: 1536,
      height: 1024,
      bytes: 4_208_021,
      format: "png",
      status: "production-catalogue-only",
      assetRole: "governed Work index catalogue presentation art only",
      tags: ["catalogue-presentation", "work-index"],
      lockedCatalogueSource: true,
      sharedWithCatalogue: true,
    },
    { role: "detail-support", transparentPreferred: true },
  );
  assert.equal(gearNetwork.eligible, false);
  assert.equal(gearNetwork.action, "reject");
  assert.ok(gearNetwork.warnings.some((warning) => /2 MB/i.test(warning)));
});

test("prefers the finished CWA detail derivative over the padded catalogue source", () => {
  const ranked = rankMediaCandidates(
    [
      {
        id: "evavo/work/support-elements/custom-web-applications-interface-stack",
        width: 1011,
        height: 1556,
        bytes: 79_947,
        format: "jpg",
        status: "production-catalogue-source",
        assetRole: "governed Work catalogue presentation source and historical source evidence",
        tags: ["catalogue-presentation", "source-evidence"],
        sharedWithCatalogue: true,
        lockedCatalogueSource: true,
      },
      {
        id: "evavo/work/custom-web-applications/custom-application-interface-system-2026",
        width: 1000,
        height: 700,
        bytes: 11_978,
        format: "webp",
        status: "production",
        assetRole: "sticky-aside-support",
        tags: ["support-element", "finished-art", "detail-approved"],
        predominantWhiteRatio: 0.01,
      },
    ],
    { role: "detail-support", targetAspectRatio: 1000 / 700 },
  );

  assert.equal(ranked[0].id, "evavo/work/custom-web-applications/custom-application-interface-system-2026");
  assert.equal(ranked[0].action, "keep");
  assert.equal(ranked[1].action, "derive");
  assert.ok(ranked[1].warnings.some((warning) => /shared with the catalogue/i.test(warning)));
});

test("trusts production metadata over candidate-like public naming when explicitly allowed", () => {
  const result = evaluateMediaCandidate(
    {
      id: "evavo/work/covers/candidates/work-digital-safegrid-data-centre-candidate",
      width: 1672,
      height: 941,
      format: "png",
      status: "production",
      assetRole: "Active Work index tile, client case-study header and SEO source image",
      tags: ["active-reference", "production", "work-cover", "seo-image"],
      sharedWithCatalogue: true,
      lockedCatalogueSource: true,
    },
    {
      role: "detail-hero",
      allowSharedCatalogueSource: true,
      targetAspectRatio: 1672 / 941,
    },
  );
  assert.equal(result.eligible, true);
  assert.notEqual(result.action, "reject");
  assert.ok(result.score >= 70);
});

test("flags white-field support art for finishing and canonical hero art reused as support", () => {
  const whiteSupport = evaluateMediaCandidate(
    {
      id: "old-support-card",
      width: 900,
      height: 900,
      format: "png",
      status: "production",
      assetRole: "detail support",
      tags: ["support-element"],
      predominantWhiteRatio: 0.8,
    },
    { role: "detail-support" },
  );
  assert.equal(whiteSupport.action, "finish");
  assert.ok(whiteSupport.warnings.some((warning) => /predominantly white/i.test(warning)));

  const heroAsSupport = evaluateMediaCandidate(
    {
      id: "canonical-cover",
      width: 1672,
      height: 941,
      format: "webp",
      status: "production",
      assetRole: "canonical header social SEO cover",
      tags: ["work-cover", "seo-image"],
    },
    { role: "detail-support" },
  );
  assert.equal(heroAsSupport.action, "derive");
  assert.ok(heroAsSupport.reasons.some((reason) => /should not be reused/i.test(reason)));
});

test("requires alpha-aware finishing for motion layers and bounds candidate batches", () => {
  const motion = evaluateMediaCandidate(
    {
      id: "motion-layer.jpg",
      width: 900,
      height: 900,
      format: "jpg",
      status: "production",
      hasAlpha: false,
    },
    { role: "motion-layer" },
  );
  assert.equal(motion.action, "finish");
  assert.ok(motion.warnings.some((warning) => /JPEG cannot preserve transparency/i.test(warning)));

  assert.throws(
    () => rankMediaCandidates([], { role: "detail-support" }),
    /At least one media candidate/i,
  );
  assert.throws(
    () =>
      rankMediaCandidates(
        Array.from({ length: 501 }, (_, index) => ({ id: `candidate-${index}` })),
        { role: "detail-support" },
      ),
    /at most 500 candidates/i,
  );
});
