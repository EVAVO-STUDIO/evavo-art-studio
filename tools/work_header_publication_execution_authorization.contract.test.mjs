import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relative) => readFile(new URL(relative, import.meta.url));
const text = async (relative) => (await read(relative)).toString("utf8");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

test("execution authorization schema remains fail-closed and non-mutating", async () => {
  const bytes = await read("../contracts/work-header-publication-execution-authorization-v1.schema.json");
  const schema = JSON.parse(bytes.toString("utf8"));
  assert.equal(sha256(bytes), "f56a746773e4e08db8e2d22c5bcc0fa50f8416bbfedbc6f8c18c26326ea3dff4");
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.contract.const, "evavo.work-header-publication-execution-authorization.v1");
  assert.equal(schema.properties.authorizationState.const, "authorized-unexecuted");
  assert.equal(schema.properties.explicitExecutionConfirmation.const, true);
  assert.equal(schema.properties.executionAllowed.const, false);
  assert.equal(schema.properties.publicationAllowed.const, false);
  assert.equal(schema.properties.cloudOverwriteAllowed.const, false);
  assert.equal(schema.properties.websiteMutationAllowed.const, false);
});

test("execution authorization requires exact deliberate confirmation and fresh rollback evidence", async () => {
  const source = await text("./work_header_publication_execution_authorization_mcp.mjs");
  for (const token of [
    'SERVER_VERSION = "1.0.0"',
    'CONTRACT = "evavo.work-header-publication-execution-authorization.v1"',
    'PLAN_CONTRACT = "evavo.work-header-publication-transaction-plan.v1"',
    "confirmExecutionAuthorization=true is required",
    "I explicitly authorize execution of this exact reviewed publication transaction.",
    "currentTargetRecheckPath",
    "Current target changed after transaction planning",
    "Rollback backup no longer exactly matches",
    "Exact reviewed candidate bytes changed after transaction planning",
    "executionAuthorizedForOneTransactionOnly: true",
    "authorizationExpiresOnAnyEvidenceDrift: true",
    "executionAllowed: false",
    "publicationAllowed: false",
    "cloudOverwriteAllowed: false",
    "websiteMutationAllowed: false",
    "evavo_authorize_work_header_publication_execution",
    "evavo_verify_work_header_publication_execution_authorization",
  ]) assert.ok(source.includes(token), `missing authorization safety token: ${token}`);
});

test("MCP registration exposes execution authorization without an executor", async () => {
  const config = await text("../.mcp.json");
  assert.ok(config.includes('"evavo-work-header-publication-execution-authorization-v1"'));
  assert.ok(config.includes('"tools/work_header_publication_execution_authorization_mcp.mjs"'));
  assert.ok(!config.includes('"evavo-work-header-publication-executor-v1"'));
});
