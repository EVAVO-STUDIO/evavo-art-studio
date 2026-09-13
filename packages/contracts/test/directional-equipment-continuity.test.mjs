import assert from "node:assert/strict";
import test from "node:test";
import {
  DIRECTIONAL_EQUIPMENT_CONTINUITY_SCHEMA,
  validateDirectionalEquipmentContinuity,
} from "../dist/index.js";

const hash = "a".repeat(64);
const base = {
  schema: DIRECTIONAL_EQUIPMENT_CONTINUITY_SCHEMA,
  characterId: "rattle-guard",
  canonicalIdentitySha256: hash,
  runtimeAuthority: false,
  frames: [{
    frameId: "idle-east-00",
    sha256: hash,
    cameraDirection: "east-profile",
    equipmentId: "round-shield",
    carryingSide: "left",
    visibleFace: "inner",
    attachmentVisible: true,
    gripVisible: true,
    strapRouting: "consistent",
    shieldPlane: "side-carry",
    occlusion: "far forearm passes behind shield rim, through enarmes, hand closes on vertical grip",
    reviewer: "art-director",
    reviewedAt: "2026-09-14T00:00:00Z",
    status: "approved",
  }],
};

test("accepts a camera-relative inner shield face with explicit ownership", () => {
  assert.deepEqual(validateDirectionalEquipmentContinuity(base), []);
});

test("rejects a floating inner-face shield even when palette and silhouette could pass", () => {
  const invalid = structuredClone(base);
  invalid.frames[0].attachmentVisible = false;
  invalid.frames[0].gripVisible = false;
  invalid.frames[0].strapRouting = "not-visible";
  assert.deepEqual(validateDirectionalEquipmentContinuity(invalid), [
    "idle-east-00: inner side-carry must show arm attachment",
    "idle-east-00: inner side-carry must show the controlling grip",
    "idle-east-00: inner side-carry must declare consistent strap routing",
  ]);
});

test("rejects inner strap routing on an outward shield face", () => {
  const invalid = structuredClone(base);
  invalid.frames[0].visibleFace = "outer";
  assert.deepEqual(validateDirectionalEquipmentContinuity(invalid), [
    "idle-east-00: outward face cannot expose inner strap routing",
  ]);
});
