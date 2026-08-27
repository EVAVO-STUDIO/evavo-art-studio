import assert from "node:assert/strict";
import test from "node:test";
import {
  ADVENTURE_STUDIO_HANDOFF_V3_PROTOCOL_FINGERPRINT,
  adventureStudioHandoffV3Protocol,
  adventureStudioHandoffV3ProtocolFingerprint,
} from "../dist/index.js";

test("Adventure Studio v3 protocol matches the shared cross-studio fingerprint", () => {
  assert.equal(
    adventureStudioHandoffV3ProtocolFingerprint(),
    ADVENTURE_STUDIO_HANDOFF_V3_PROTOCOL_FINGERPRINT,
  );
  assert.ok(adventureStudioHandoffV3Protocol.hardInvariants.includes("checkerboard-forbidden"));
  assert.ok(adventureStudioHandoffV3Protocol.hardInvariants.includes("targeted-repair-first"));
});
