import { describe, expect, it } from "vitest";
import {
  ADVENTURE_STUDIO_CONFORMANCE_V3_FINGERPRINT,
  adventureStudioConformanceAnimationOrderV3,
  adventureStudioConformanceFingerprintV3,
  adventureStudioConformanceStaticOrderV3,
} from "./adventure-studio-conformance-v3.js";
import {
  compileAdventureStudioArtProductionRequestV3,
  validateAdventureStudioArtWorkOrderV3,
} from "./adventure-studio-handoff-v3.js";

describe("Adventure Studio v3 Art Studio conformance", () => {
  it("matches the shared conformance fingerprint", () => {
    expect(adventureStudioConformanceFingerprintV3()).toBe(
      ADVENTURE_STUDIO_CONFORMANCE_V3_FINGERPRINT,
    );
  });

  it("accepts and compiles the canonical transparent foreground order", () => {
    expect(validateAdventureStudioArtWorkOrderV3(adventureStudioConformanceStaticOrderV3)).toEqual([]);
    expect(compileAdventureStudioArtProductionRequestV3(adventureStudioConformanceStaticOrderV3)).toMatchObject({
      requestVersion: 3,
      destinationStudio: undefined,
      taskKind: "foreground-plate",
      alphaAdmission: {
        required: true,
        checkerboardForbidden: true,
        decodedAlphaRequired: true,
        transparentCanvasEdgeRequired: true,
        hostilePlateReviewRequired: true,
        rejectMatteResidue: true,
        rejectHaloFringe: true,
        rejectTransparentRgbContamination: true,
      },
      iterationPolicy: {
        maximumRevisionPasses: 5,
        requireIssueClosureEvidence: true,
        preferTargetedRepair: true,
        fullRegenerationRequiresExplicitReason: true,
      },
    });
  });

  it("rejects the canonical animation order because Art Studio does not own cel sequence production", () => {
    expect(validateAdventureStudioArtWorkOrderV3(adventureStudioConformanceAnimationOrderV3)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "wrong-destination" }),
        expect.objectContaining({ code: "unsupported-task" }),
      ]),
    );
  });
});
