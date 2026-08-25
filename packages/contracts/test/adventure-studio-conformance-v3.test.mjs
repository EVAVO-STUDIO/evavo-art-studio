import assert from "node:assert/strict";
import test from "node:test";
import {
  ADVENTURE_STUDIO_CONFORMANCE_V3_FINGERPRINT,
  adventureStudioConformanceAnimationOrderV3,
  adventureStudioConformanceFingerprintV3,
  adventureStudioConformanceStaticOrderV3,
  compileAdventureStudioArtProductionRequestV3,
  validateAdventureStudioArtWorkOrderV3,
} from "../dist/index.js";

test("Adventure Studio v3 conformance fingerprint matches", () => {
  assert.equal(
    adventureStudioConformanceFingerprintV3(),
    ADVENTURE_STUDIO_CONFORMANCE_V3_FINGERPRINT,
  );
});

test("Art Studio accepts the shared transparent foreground order", () => {
  assert.deepEqual(validateAdventureStudioArtWorkOrderV3(adventureStudioConformanceStaticOrderV3), []);
  const request = compileAdventureStudioArtProductionRequestV3(adventureStudioConformanceStaticOrderV3);
  assert.equal(request.taskKind, "foreground-plate");
  assert.equal(request.alphaAdmission.required, true);
  assert.equal(request.alphaAdmission.checkerboardForbidden, true);
  assert.equal(request.alphaAdmission.decodedAlphaRequired, true);
  assert.equal(request.alphaAdmission.transparentCanvasEdgeRequired, true);
  assert.equal(request.alphaAdmission.hostilePlateReviewRequired, true);
  assert.equal(request.iterationPolicy.preferTargetedRepair, true);
  assert.equal(request.iterationPolicy.fullRegenerationRequiresExplicitReason, true);
});

test("Art Studio rejects the shared cel animation order", () => {
  const codes = validateAdventureStudioArtWorkOrderV3(adventureStudioConformanceAnimationOrderV3)
    .map((issue) => issue.code);
  assert.ok(codes.includes("wrong-destination"));
  assert.ok(codes.includes("unsupported-task"));
});
