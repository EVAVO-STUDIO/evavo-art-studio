import test from "node:test";
import assert from "node:assert/strict";
import {
  approveCharacterPerformanceBank,
  compileCharacterPerformanceBank,
  reviewCharacterPerformanceBank,
  verifyCharacterPerformanceApproval,
  verifyCharacterPerformanceBank,
} from "../tools/character-performance-bank-v1.mjs";
import {
  compileCharacterPerformanceDelivery,
  verifyCharacterPerformanceDelivery,
} from "../tools/character-performance-delivery-v1.mjs";
import {
  compileStudioHandoff,
  digestStudioValue,
  verifyStudioHandoff,
} from "../tools/studio-handoff-v2.mjs";

const sha = (character) => character.repeat(64);
const roles = ["idle", "listen", "speak", "gesture", "transition"];
const mouth = ["rest", "a", "e", "o", "u", "m-b-p", "f-v", "l", "w-q"];

function slot(slotId, role, digest, mouthShape = null, extra = {}) {
  return {
    slotId,
    role,
    assetId: `asset-${slotId}`,
    relativePath: `characters/eva/${slotId}.png`,
    sha256: sha(digest),
    bytes: 100,
    mediaType: "image/png",
    width: 1024,
    height: 1024,
    safeBounds: { left: 100, top: 50, right: 900, bottom: 1000 },
    mouthShape,
    intentionalHoldOf: null,
    protectedLandmarksSha256: sha("a"),
    paletteEvidenceSha256: sha("b"),
    cleanupEvidenceSha256: sha("c"),
    notes: "authored drawing",
    metadata: {},
    ...extra,
  };
}

function bankRequest() {
  const slots = [
    slot("idle-main", "idle", "1", "rest"),
    slot("listen-main", "listen", "2"),
    slot("speak-main", "speak", "3"),
    slot("gesture-main", "gesture", "4"),
    slot("transition-main", "transition", "5"),
    ...["6", "7", "8", "9", "a", "b", "c", "d"].map(
      (digest, index) =>
        slot(
          `mouth-${mouth[index + 1]}`,
          "speak",
          digest,
          mouth[index + 1],
        ),
    ),
  ];
  slots.push(
    slot("idle-hold", "idle", "1", "rest", {
      assetId: "asset-idle-main",
      relativePath: "characters/eva/idle-main.png",
      intentionalHoldOf: "idle-main",
    }),
  );
  return {
    schema: "evavo_character_performance_bank_request_v1",
    productionId: "eva-dialogue",
    characterId: "eva",
    producerCommit: "d".repeat(40),
    creativeIntentSha256: sha("e"),
    continuitySha256: sha("f"),
    artDirectionSha256: sha("9"),
    createdAt: "2026-08-23T00:00:00.000Z",
    canvas: { width: 1024, height: 1024 },
    thresholds: {
      identityMinBp: 9400,
      lineQualityMinBp: 9000,
      specificityMinBp: 9000,
      genericAiPenaltyMaxBp: 500,
      alphaCoverageMinBp: 500,
      alphaCoverageMaxBp: 8500,
      edgeContactMaxBp: 100,
      haloMaxPixels: 0,
      hiddenRgbMaxPixels: 0,
      unwantedMatteMaxPixels: 0,
      paletteDeviationMaxBp: 200,
    },
    requiredRoles: roles,
    requiredMouthShapes: mouth,
    slots,
    metadata: { style: "authored-cel-source" },
  };
}

function measurements(bank) {
  return bank.slots.map((entry) => ({
    slotId: entry.slotId,
    sha256: entry.sha256,
    width: entry.width,
    height: entry.height,
    identityBp: 9800,
    lineQualityBp: 9600,
    specificityBp: 9500,
    genericAiPenaltyBp: 100,
    alphaCoverageBp: 4000,
    edgeContactBp: 0,
    haloPixels: 0,
    hiddenRgbPixels: 0,
    unwantedMattePixels: 0,
    paletteDeviationBp: 50,
    protectedLandmarksSha256: entry.protectedLandmarksSha256,
    paletteEvidenceSha256: entry.paletteEvidenceSha256,
    cleanupEvidenceSha256: entry.cleanupEvidenceSha256,
  }));
}

function approvedDelivery() {
  const bank = compileCharacterPerformanceBank(bankRequest());
  const review = reviewCharacterPerformanceBank({
    bank,
    measurements: measurements(bank),
    reviewId: "clean-review",
  });
  const approval = approveCharacterPerformanceBank({
    bank,
    review,
    decisionId: "approve-eva",
    actorId: "greg",
    actorRole: "creative-director",
    approvalEvidenceSha256: sha("8"),
    observedAt: "2026-08-23T00:02:00.000Z",
  });
  const delivery = compileCharacterPerformanceDelivery({
    bank,
    review,
    approval,
    producerCommit: "d".repeat(40),
    createdAt: "2026-08-23T00:03:00.000Z",
  });
  return { bank, review, approval, delivery };
}

test("compiles a deterministic identity-locked bank with intentional holds", () => {
  const first = compileCharacterPerformanceBank(bankRequest());
  const reversed = bankRequest();
  reversed.slots.reverse();
  const second = compileCharacterPerformanceBank(reversed);
  assert.deepEqual(first, second);
  assert.equal(verifyCharacterPerformanceBank(first), first.bankSha256);
  assert.equal(
    first.slots.find((entry) => entry.slotId === "idle-hold").intentionalHoldOf,
    "idle-main",
  );
});

test("rejects duplicate bytes that are not an intentional hold", () => {
  const request = bankRequest();
  request.slots.find((entry) => entry.slotId === "idle-hold").intentionalHoldOf =
    null;
  assert.throws(() => compileCharacterPerformanceBank(request), /duplicate/);
});

test("routes the smallest failing slot to targeted repair", () => {
  const bank = compileCharacterPerformanceBank(bankRequest());
  const rows = measurements(bank);
  const target = rows.find((entry) => entry.slotId === "gesture-main");
  target.haloPixels = 22;
  target.identityBp = 8500;
  const review = reviewCharacterPerformanceBank({ bank, measurements: rows });
  assert.equal(review.status, "repair-required");
  assert.ok(review.issues.every((entry) => entry.slotId === "gesture-main"));
  assert.equal(review.repairPlan.regenerateWholeBank, false);
  assert.equal(review.repairPlan.items[0].preserveUnaffectedSlots, true);
  assert.throws(
    () =>
      approveCharacterPerformanceBank({
        bank,
        review,
        decisionId: "approve-1",
        actorId: "greg",
        actorRole: "creative-director",
        approvalEvidenceSha256: sha("8"),
        observedAt: "2026-08-23T00:02:00.000Z",
      }),
    /clean/,
  );
});

test("records named creative approval and emits exact cross-bound Art handoffs", () => {
  const { bank, review, approval, delivery } = approvedDelivery();
  assert.equal(
    verifyCharacterPerformanceApproval(approval, bank, review),
    approval.approvalSha256,
  );
  assert.equal(
    verifyCharacterPerformanceDelivery(delivery),
    delivery.deliverySha256,
  );
  assert.equal(
    verifyStudioHandoff(delivery.artToCel),
    delivery.artToCel.handoffSha256,
  );
  assert.equal(delivery.artToCel.handoffType, "art-to-cel");
  assert.equal(delivery.artToVideo.handoffType, "art-to-video");
  assert.equal(delivery.artToCel.authority.creativeApprovalIncluded, true);
  assert.equal(delivery.artToCel.authority.releaseApprovalIncluded, false);
  assert.equal(delivery.artToCel.authority.publicationAuthority, false);
  assert.equal(delivery.artToCel.assets.length, bank.slots.length - 1);
  const sourceBinding = delivery.artToVideo.evidence.find(
    (row) => row.kind === "art-to-cel-source-handoff",
  );
  assert.equal(sourceBinding.sha256, delivery.artToCel.handoffSha256);
  assert.equal(sourceBinding.metadata.handoffId, delivery.artToCel.handoffId);
});

test("rejects a redigested Art delivery whose Video handoff loses its Cel source binding", () => {
  const { delivery } = approvedDelivery();
  const original = delivery.artToVideo;
  const artToVideo = compileStudioHandoff({
    schema: "evavo_studio_handoff_request_v2",
    handoffType: original.handoffType,
    productionId: original.productionId,
    producer: original.producer,
    consumer: original.consumer,
    creativeIntentSha256: original.creativeIntentSha256,
    continuitySha256: original.continuitySha256,
    createdAt: original.createdAt,
    assets: original.assets,
    evidence: original.evidence.filter(
      (row) => row.kind !== "art-to-cel-source-handoff",
    ),
    authority: original.authority,
    metadata: original.metadata,
  });
  const tamperedBody = { ...delivery, artToVideo };
  delete tamperedBody.deliverySha256;
  const tampered = {
    ...tamperedBody,
    deliverySha256: digestStudioValue(tamperedBody),
  };
  assert.throws(
    () => verifyCharacterPerformanceDelivery(tampered),
    /exact Art-to-Cel source handoff/,
  );
});

test("detects semantic bank tampering", () => {
  const bank = structuredClone(compileCharacterPerformanceBank(bankRequest()));
  bank.slots[0].role = "different-role";
  assert.throws(
    () => verifyCharacterPerformanceBank(bank),
    /digest mismatch|semantic drift|missing required roles/,
  );
});
