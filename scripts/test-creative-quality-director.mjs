import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  compileCreativeQualityReview,
  validateCreativeQualityProfile,
} from "./creative-quality-director.mjs";

const profile = JSON.parse(
  readFileSync(
    new URL("../config/creative-quality-cel-v1.json", import.meta.url),
    "utf8",
  ),
);
validateCreativeQualityProfile(profile);

const digest = (character) => `sha256:${character.repeat(64)}`;
const base = {
  schemaVersion: 1,
  kind: "evavo-art-creative-quality-review-request-v1",
  reviewId: "shot-020-review-r1",
  candidate: {
    id: "shot-020-candidate-a",
    contentSha256: digest("a"),
    technicalEvidenceSha256: [digest("b")],
  },
  revision: { current: 1 },
  loop: { mode: "none" },
  references: [
    {
      role: "character-model-sheet",
      artifactId: "mara-model-r3",
      contentSha256: digest("c"),
      approved: true,
    },
    {
      role: "visual-standard",
      artifactId: "night-platform-standard-r2",
      contentSha256: digest("d"),
      approved: true,
    },
  ],
  findings: [
    {
      id: "f1",
      code: "hold-violation",
      severity: "blocking",
      targetId: "mara-body-track",
      evidenceSha256: digest("e"),
      observation:
        "The body redraws and swims during an approved held exposure.",
    },
    {
      id: "f2",
      code: "plastic-shading",
      severity: "blocking",
      targetId: "mara-shade-layer",
      evidenceSha256: digest("f"),
      observation:
        "Soft airbrushed shading and glossy highlights replace the approved cel-shadow groups.",
      maskArtifactId: "mara-shade-mask-r1",
    },
  ],
};

const review = compileCreativeQualityReview(base, profile);
assert.equal(review.disposition, "repair-required");
assert.ok(
  review.directives.some(
    (item) =>
      item.intervention ===
      "restore-held-drawing-and-replacement-cel-logic",
  ),
);
assert.ok(
  review.directives.some(
    (item) => item.targetedRepairStrategy === "masked-provider-inpaint",
  ),
);
assert.equal(review.authority.creativeApprovalPerformed, false);

const noMask = compileCreativeQualityReview(
  {
    ...base,
    reviewId: "shot-020-review-no-mask",
    findings: [
      {
        id: "f3",
        code: "plastic-shading",
        severity: "blocking",
        targetId: "mara-shade-layer",
        evidenceSha256: digest("1"),
        observation:
          "The whole shade layer uses soft plastic gradients without a bounded repair mask.",
      },
    ],
  },
  profile,
);
assert.equal(noMask.directives[0].targetedRepairStrategy, "manual-review");
assert.equal(noMask.disposition, "manual-art-direction-required");

assert.throws(
  () =>
    compileCreativeQualityReview(
      {
        ...base,
        reviewId: "loop-invalid",
        loop: { mode: "seamless" },
      },
      profile,
    ),
  /SEAMLESS_BOUNDARY_REQUIRED/,
);

const loop = compileCreativeQualityReview(
  {
    ...base,
    reviewId: "loop-review-r1",
    loop: {
      mode: "seamless",
      boundary: {
        firstFrameSha256: digest("2"),
        lastFrameSha256: digest("3"),
        boundaryEvidenceSha256: digest("4"),
      },
      omitDuplicateTerminalFrame: true,
    },
    findings: [
      {
        id: "f4",
        code: "loop-boundary-pop",
        severity: "blocking",
        targetId: "loop-boundary",
        evidenceSha256: digest("5"),
        observation:
          "The first and last poses differ enough to create a visible repeated-playback pop.",
      },
    ],
  },
  profile,
);
assert.ok(loop.loopChecks.includes("repeated-playback"));
assert.equal(loop.convergence.repeatedPlaybackRequired, true);

const clean = compileCreativeQualityReview(
  { ...base, reviewId: "clean-review", findings: [] },
  profile,
);
assert.equal(clean.disposition, "awaiting-human-creative-approval");
assert.equal(clean.convergence.automaticCreativeApprovalAllowed, false);

process.stdout.write("Creative Quality Director contracts passed.\n");
