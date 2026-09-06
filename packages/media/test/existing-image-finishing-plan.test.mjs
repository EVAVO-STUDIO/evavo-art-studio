import assert from "node:assert/strict";
import test from "node:test";

import { planExistingImageFinishing } from "../dist/index.js";

function evidence(overrides = {}) {
  return {
    width: 100,
    height: 100,
    totalPixels: 10000,
    profile: "illustration",
    transparentRgbMode: "edge-only",
    defectPixels: 20,
    defectPixelRatio: 0.002,
    maskCoverageRatio: 0.01,
    withinMaximumMaskCoverageRatio: true,
    defectCounts: {
      "transparent-rgb-contamination": 20,
      "edge-halo-risk": 0,
      "alpha-pinhole": 0,
      "isolated-alpha-speck": 0,
      "hard-alpha-stair-step": 0,
    },
    bounds: { left: 10, top: 10, right: 20, bottom: 20 },
    suggestedAction: "polish",
    ...overrides,
  };
}

function regions(overrides = {}) {
  return {
    contract: "evavo.defect-region-components.v1",
    width: 100,
    height: 100,
    foregroundPixels: 20,
    componentCount: 1,
    retainedComponentCount: 1,
    ignoredSmallComponentPixels: 0,
    regions: [{ id: "region-01", pixelCount: 20, pixelRatio: 0.002, bounds: { left: 10, top: 10, right: 20, bottom: 20, width: 11, height: 11 }, centroid: { x: 15, y: 15 }, density: 0.165, touchesCanvasEdge: false, rank: 1 }],
    ...overrides,
  };
}

test("routes hidden RGB / halo-only cleanup to preservation polish", () => {
  const plan = planExistingImageFinishing(evidence(), regions(), { profile: "illustration" });
  assert.equal(plan.route, "preservation-polish");
  assert.equal(plan.nextTool, "evavo_polish_existing_raster_preserving_artwork");
  assert.equal(plan.automaticRepairAllowed, false);
  assert.equal(plan.visualConfirmationRequired, true);
});

test("routes alpha pinholes to bounded localized repair", () => {
  const plan = planExistingImageFinishing(evidence({
    defectCounts: {
      "transparent-rgb-contamination": 0,
      "edge-halo-risk": 0,
      "alpha-pinhole": 3,
      "isolated-alpha-speck": 0,
      "hard-alpha-stair-step": 0,
    },
    suggestedAction: "localized-repair",
  }), regions(), { profile: "logo-transparent" });
  assert.equal(plan.route, "localized-repair");
  assert.equal(plan.nextTool, "evavo_create_existing_image_edit_mask");
  assert.equal(plan.regions[0].padding, 2);
});

test("escalates broad or fragmented repair surfaces", () => {
  const plan = planExistingImageFinishing(evidence({ maskCoverageRatio: 0.2 }), regions({ retainedComponentCount: 20 }), {
    profile: "illustration",
    maximumAutomaticCoverageRatio: 0.12,
    maximumAutomaticRegionCount: 8,
  });
  assert.equal(plan.route, "manual-review");
  assert.ok(plan.reasonCodes.includes("repair-surface-exceeds-finishing-plan-budget"));
  assert.ok(plan.reasonCodes.includes("too-many-independent-defect-regions"));
  assert.equal(plan.nextTool, null);
});

test("no detected defects produce a no-op plan", () => {
  const plan = planExistingImageFinishing(evidence({ defectPixels: 0, defectPixelRatio: 0, maskCoverageRatio: 0, bounds: null, suggestedAction: "none", defectCounts: {
    "transparent-rgb-contamination": 0,
    "edge-halo-risk": 0,
    "alpha-pinhole": 0,
    "isolated-alpha-speck": 0,
    "hard-alpha-stair-step": 0,
  } }), regions({ foregroundPixels: 0, componentCount: 0, retainedComponentCount: 0, regions: [] }), { profile: "photo" });
  assert.equal(plan.route, "no-op");
  assert.equal(plan.nextTool, null);
});
