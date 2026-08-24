import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  ART_REVIEW_SPECIALIST_RECEIPT,
  BRASS_ART_REVIEW_TOOL_NAMES,
  reviewCapabilityDocument,
} from "../dist/review.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.resolve(here, "../src/review.ts"), "utf8");

function rootFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "evavo-art-review-specialist-"));
  return {
    root,
    dispose() {
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

test("review capability advertises receipt-bearing no-completion authority", () => {
  const fixture = rootFixture();
  try {
    const capability = reviewCapabilityDocument(fixture.root);
    assert.equal(capability.specialistReceiptContract, ART_REVIEW_SPECIALIST_RECEIPT);
    assert.equal(capability.completionAuthority, false);
    assert.equal(capability.writesEnabled, false);
    assert.equal(capability.providerExecutionAllowed, false);
    assert.deepEqual(capability.tools, BRASS_ART_REVIEW_TOOL_NAMES);
  } finally {
    fixture.dispose();
  }
});

test("every review MCP tool is read-only and closed-world", () => {
  const registrations = [
    ...source.matchAll(/server\.registerTool\(\s*"([^"]+)"[\s\S]*?annotations:\s*READ_ONLY_ANNOTATIONS/gu),
  ].map((match) => match[1]);
  assert.deepEqual(registrations, [...BRASS_ART_REVIEW_TOOL_NAMES]);
  for (const marker of [
    "readOnlyHint: true",
    "destructiveHint: false",
    "idempotentHint: true",
    "openWorldHint: false",
  ]) {
    assert.equal(source.includes(marker), true, marker);
  }
});

test("review results carry a deterministic specialist receipt without creative approval", () => {
  for (const marker of [
    "evavo_art_studio_review_specialist_receipt_v1",
    "receiptId: `art-studio-review:${receiptSha256}`",
    "receiptSha256",
    "specialistEvidence: reviewReceipt(toolName, value)",
    "creativeApprovalPerformed: false",
    "artifactMutationPerformed: false",
    "providerExecutionPerformed: false",
    "publicationPerformed: false",
    "completionAuthority: false",
    "completionEvidenceEligible: false",
  ]) {
    assert.equal(source.includes(marker), true, marker);
  }
});
