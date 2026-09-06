import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (name) => readFile(new URL(name, import.meta.url), "utf8");

test("publication preparation consumes only explicit approved reviewer decisions", async () => {
  const source = await read("./work_header_publication_preparation_mcp.mjs");
  for (const token of [
    'SERVER_VERSION = "1.0.0"',
    'CONTRACT = "evavo.work-header-publication-preparation.v1"',
    'decision.contract !== "evavo.work-header-approval-decision.v1"',
    'decision.decision !== "approved"',
    'decision.decisionSource !== "explicit-caller"',
    "decision.automaticDecision !== false",
    "decision.publicationPreparationAllowed !== true",
    "approvalDecisionReverifiedBeforePreparation: true",
    "explicitReviewerApprovalRequiredAndVerified: true",
  ]) assert.ok(source.includes(token), `missing publication approval-boundary token: ${token}`);
});

test("publication preparation reverifies exact candidate and complete receipt lineage", async () => {
  const source = await read("./work_header_publication_preparation_mcp.mjs");
  for (const token of [
    "approvalPacketSha256",
    "pageRenderReceiptSha256",
    "selectionReceiptSha256",
    "candidateReviewReceiptSha256",
    "previewAdmissionReceiptSha256",
    "candidateSha256",
    "candidateByteLength",
    "page.sourceBindings",
    "browserResponseBindings",
    "fullReceiptLineageVerified: true",
    "candidateBytesVerified: true",
    "preparationIdentitySha256",
  ]) assert.ok(source.includes(token), `missing publication lineage token: ${token}`);
});

test("publication preparation is create-only and cannot execute a mutation", async () => {
  const source = await read("./work_header_publication_preparation_mcp.mjs");
  for (const token of [
    "writeCreateOnlyBundle",
    'preparationState: "prepared-unexecuted"',
    "backupRequiredBeforeExecution: true",
    "rollbackEvidenceRequiredBeforeExecution: true",
    "stableUrlOrPublicIdPreservationRequiredForCloudinary: true",
    "sourceCodeBackupOrRevertPointRequiredForWebsite: true",
    "executionAllowed: false",
    "publicationAllowed: false",
    "cloudOverwriteAllowed: false",
    "websiteMutationAllowed: false",
    "evavo_verify_work_header_publication_preparation",
  ]) assert.ok(source.includes(token), `missing non-executing publication token: ${token}`);
});
