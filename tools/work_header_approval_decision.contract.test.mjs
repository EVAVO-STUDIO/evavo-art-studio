import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (name) => readFile(new URL(name, import.meta.url), "utf8");

test("explicit Work-header approval decision is review-only and exact-lineage bound", async () => {
  const source = await read("./work_header_approval_decision_mcp.mjs");
  for (const token of [
    'SERVER_VERSION = "1.0.0"',
    'CONTRACT = "evavo.work-header-approval-decision.v1"',
    'DECISIONS = new Set(["approved", "rejected"])',
    'decisionSource: "explicit-caller"',
    "automaticDecision: false",
    "approvalPacketReverifiedBeforeDecision: true",
    "fullReceiptLineageVerified: true",
    "browserResponseMetadataVerified: true",
    "candidateBytesVerified: true",
    "evidenceIdentitySha256",
    "approvedDecisionAllowsPublicationPreparationOnly: true",
    "publicationAllowed: false",
    "cloudOverwriteAllowed: false",
    "websiteMutationAllowed: false",
    "writeCreateOnlyBundle",
  ]) assert.ok(source.includes(token), `missing approval-decision token: ${token}`);
});

test("automatic approval and stale decision lineage are fail-closed", async () => {
  const source = await read("./work_header_approval_decision_mcp.mjs");
  for (const token of [
    'if (args.automaticDecision === true) throw new Error("Automatic/system-generated Work-header approval decisions are forbidden.")',
    "Approval decision evidence identity digest is invalid.",
    "Approval decision is bound to stale or changed approval-packet lineage.",
    "Approval packet immutable candidate bytes changed.",
    "Approval packet page-render source bytes changed.",
    "Approval packet responsive Chrome response metadata drifted across durable receipts.",
  ]) assert.ok(source.includes(token), `missing fail-closed decision token: ${token}`);
});

test("decision verifier and MCP registration remain available", async () => {
  const source = await read("./work_header_approval_decision_mcp.mjs");
  for (const token of [
    "evavo_record_work_header_approval_decision",
    "evavo_verify_work_header_approval_decision",
    "explicitReviewerDecisionRequired: true",
    "automaticDecisionAllowed: false",
    "approvalPacketReverificationRequired: true",
    "candidateByteIdentityRequired: true",
    "responsiveBrowserResponseMetadataRequired: true",
    "fullReceiptLineageRequired: true",
    "evidenceIdentityDigestRequired: true",
  ]) assert.ok(source.includes(token), `missing decision capability token: ${token}`);
  const config = await read("../.mcp.json");
  assert.ok(config.includes('"evavo-work-header-approval-decision-v1"'));
  assert.ok(config.includes('"tools/work_header_approval_decision_mcp.mjs"'));
});
