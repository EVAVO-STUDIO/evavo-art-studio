import assert from "node:assert/strict";
import test from "node:test";

import { inspectLogoSurfaceProof } from "../dist/logo-surface-proof.js";

function transparentCanvas(width, height) {
  return new Uint8ClampedArray(width * height * 4);
}

function setPixel(rgba, width, x, y, red, green, blue, alpha) {
  const index = (y * width + x) * 4;
  rgba[index] = red;
  rgba[index + 1] = green;
  rgba[index + 2] = blue;
  rgba[index + 3] = alpha;
}

test("passes a transparent logo with complete padded bounds", () => {
  const rgba = transparentCanvas(7, 7);
  for (let y = 2; y <= 4; y += 1) {
    for (let x = 2; x <= 4; x += 1) {
      setPixel(rgba, 7, x, y, 240, 240, 240, 255);
    }
  }

  const report = inspectLogoSurfaceProof(rgba, 7, 7, {
    assetId: "nws-lockup-on-dark",
    intendedSurface: "dark",
    minimumPaddingPx: 2,
  });

  assert.equal(report.blocking, false);
  assert.equal(report.score, 100);
  assert.deepEqual(report.visibleBounds, {
    left: 2,
    top: 2,
    right: 4,
    bottom: 4,
  });
  assert.match(report.rgbaSha256, /^[a-f0-9]{64}$/u);
  assert.equal(report.sourceMutationPerformed, false);
  assert.equal(report.brandApprovalPerformed, false);
  assert.equal(report.releaseApprovalPerformed, false);
});

test("blocks a matte-backed logo with opaque corners and border", () => {
  const rgba = new Uint8ClampedArray(5 * 5 * 4);
  for (let pixel = 0; pixel < 25; pixel += 1) {
    rgba[pixel * 4 + 3] = 255;
  }
  setPixel(rgba, 5, 2, 2, 255, 255, 255, 255);

  const report = inspectLogoSurfaceProof(rgba, 5, 5, {
    assetId: "black-matte-lockup",
    intendedSurface: "light",
    matteColour: [0, 0, 0],
  });

  assert.equal(report.blocking, true);
  assert.ok(report.findings.some((finding) => finding.code === "LOGO_CORNER_OPACITY"));
  assert.ok(report.findings.some((finding) => finding.code === "LOGO_BORDER_MATTE_REMAINS"));
});

test("blocks visible artwork cropped against an image edge", () => {
  const rgba = transparentCanvas(6, 6);
  setPixel(rgba, 6, 0, 2, 255, 36, 82, 255);
  setPixel(rgba, 6, 1, 2, 255, 36, 82, 255);

  const report = inspectLogoSurfaceProof(rgba, 6, 6, {
    assetId: "cropped-mark",
    intendedSurface: "light",
    minimumPaddingPx: 1,
    matteColour: [255, 255, 255],
  });

  assert.equal(report.blocking, true);
  assert.ok(report.findings.some((finding) => finding.code === "LOGO_VISIBLE_BOUNDS_CROPPED"));
});

test("rejects hostile or ambiguous proof inputs before inspection", () => {
  const rgba = transparentCanvas(3, 3);
  assert.throws(
    () => inspectLogoSurfaceProof(rgba, 3, 3, {
      assetId: "proof",
      intendedSurface: "light",
      maximumBorderMatteShare: 1.2,
    }),
    /between 0 and 1/u,
  );

  const options = {
    assetId: "proof",
    intendedSurface: "light",
  };
  Object.defineProperty(options, "assetId", {
    enumerable: true,
    get() {
      throw new Error("getter must not execute");
    },
  });
  assert.throws(
    () => inspectLogoSurfaceProof(rgba, 3, 3, options),
    /data property/u,
  );

  assert.throws(
    () => inspectLogoSurfaceProof(new Uint8ClampedArray(4), 3, 3, {
      assetId: "proof",
      intendedSurface: "light",
    }),
    /does not match/u,
  );
});
