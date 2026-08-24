import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  compileStudioHandoff,
  compileStudioHandoffAcceptance,
  verifyStudioHandoff,
  verifyStudioHandoffAcceptance,
  verifyStudioHandoffFiles,
} from "../tools/studio-handoff-v2.mjs";

const sha = (character) => character.repeat(64);
const bytesSha = (bytes) =>
  createHash("sha256").update(bytes).digest("hex");

function request(asset = {}) {
  return {
    schema: "evavo_studio_handoff_request_v2",
    handoffType: "art-to-cel",
    productionId: "eva-dialogue",
    producer: { studio: "art-studio", commit: "a".repeat(40) },
    consumer: { studio: "cel-animation-studio" },
    creativeIntentSha256: sha("b"),
    continuitySha256: sha("c"),
    createdAt: "2026-08-23T00:00:00.000Z",
    assets: [
      {
        assetId: "frame-main",
        kind: "character-frame",
        relativePath: "assets/frame.png",
        sha256: sha("d"),
        bytes: 3,
        mediaType: "image/png",
        metadata: { role: "idle" },
        ...asset,
      },
    ],
    evidence: [
      {
        evidenceId: "identity-lock",
        kind: "identity-lock",
        sha256: sha("e"),
        metadata: {},
      },
    ],
    authority: {
      candidateOnly: false,
      creativeApprovalIncluded: true,
      releaseApprovalIncluded: false,
      publicationAuthority: false,
      deploymentAuthority: false,
    },
    metadata: {},
  };
}

test("compiles and detects tampering", () => {
  const handoff = compileStudioHandoff(request());
  assert.equal(verifyStudioHandoff(handoff), handoff.handoffSha256);
  const tampered = structuredClone(handoff);
  tampered.assets[0].bytes += 1;
  assert.throws(() => verifyStudioHandoff(tampered), /digest mismatch/);
});

test("verifies bytes and acceptance without adding authority", async () => {
  const root = await mkdtemp(join(tmpdir(), "art-handoff-"));
  await mkdir(join(root, "assets"));
  const bytes = Buffer.from("png");
  await writeFile(join(root, "assets", "frame.png"), bytes);
  const handoff = compileStudioHandoff(
    request({ sha256: bytesSha(bytes), bytes: bytes.length }),
  );
  const verification = await verifyStudioHandoffFiles(handoff, root);
  const acceptance = compileStudioHandoffAcceptance({
    schema: "evavo_studio_handoff_acceptance_request_v2",
    handoff,
    consumerCommit: "f".repeat(40),
    acceptedAt: "2026-08-23T00:01:00.000Z",
    fileVerification: verification,
  });
  assert.equal(
    verifyStudioHandoffAcceptance(acceptance),
    acceptance.acceptanceSha256,
  );
  assert.equal(acceptance.authority.creativeApprovalIncluded, false);
  assert.equal(acceptance.authority.publicationAuthority, false);
});

test("rejects unsafe paths, floats and publication escalation", () => {
  assert.throws(
    () => compileStudioHandoff(request({ relativePath: "../escape.png" })),
    /unsafe|portable/,
  );
  const floating = request();
  floating.metadata.score = 0.95;
  assert.throws(() => compileStudioHandoff(floating), /safe integers/);
  const escalated = request();
  escalated.authority.publicationAuthority = true;
  assert.throws(() => compileStudioHandoff(escalated), /publication/);
});
