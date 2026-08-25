import { describe, expect, it } from "vitest";
import {
  ADVENTURE_STUDIO_HANDOFF_V3_PROTOCOL_FINGERPRINT,
  adventureStudioHandoffV3Protocol,
  adventureStudioHandoffV3ProtocolFingerprint,
} from "./adventure-studio-protocol-v3.js";

describe("Adventure Studio v3 protocol", () => {
  it("matches the shared cross-studio fingerprint", () => {
    expect(adventureStudioHandoffV3ProtocolFingerprint()).toBe(
      ADVENTURE_STUDIO_HANDOFF_V3_PROTOCOL_FINGERPRINT,
    );
    expect(adventureStudioHandoffV3Protocol.hardInvariants).toContain("checkerboard-forbidden");
    expect(adventureStudioHandoffV3Protocol.hardInvariants).toContain("targeted-repair-first");
  });
});
