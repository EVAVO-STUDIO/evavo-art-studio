import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (name) => readFile(new URL(name, import.meta.url));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

const EXPECTED_SCHEMA_SHA256 = "3f23166dc2901ba09f222682b2d6e2be4ab84e4d0ad4d469ae9c041e3bac211b";
const POSTFLIGHT_SCHEMA_SHA256 = "69b9a40178e78892c330e6f2b5bca33b3be8413ef81ef404c1dd9edad9d24ff2";
const CONFIRMATION = "I explicitly authorize rollback of this exact reviewed Work-header publication transaction.";

test("rollback authorization schema is exact, fail-closed and non-executing", async () => {
  const bytes = await read("../contracts/work-header-publication-rollback-authorization-v1.schema.json");
  assert.equal(sha256(bytes), EXPECTED_SCHEMA_SHA256);
  const schema = JSON.parse(bytes.toString("utf8"));
  assert.equal(schema.$id, "evavo.work-header-publication-rollback-authorization.v1");
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.authorizationState.const, "rollback-authorized-unexecuted");
  assert.equal(schema.properties.confirmationStatement.const, CONFIRMATION);
  for (const field of ["explicitRollbackConfirmation", "rollbackReadinessReverified", "publicationPostflightReverified", "postflightLiveTargetMatchedCandidateAtVerification", "postflightRollbackBackupStillReady", "currentPublishedTargetStillMatchesCandidate", "rollbackBackupStillMatchesPreviousTarget", "rollbackAuthorizedForOneTransactionOnly", "authorizationExpiresOnAnyEvidenceDrift"]) {
    assert.equal(schema.properties[field].const, true, `${field} must remain required true`);
  }
  for (const field of ["rollbackExecutionAllowed", "publicationAllowed", "cloudOverwriteAllowed", "websiteMutationAllowed"]) {
    assert.equal(schema.properties[field].const, false, `${field} must remain forbidden`);
  }
});

test("rollback authorization MCP reverifies target-aware publication postflight before authorization", async () => {
  const source = (await read("./work_header_publication_rollback_authorization_mcp.mjs")).toString("utf8");
  for (const token of [
    'SERVER_VERSION = "1.2.0"',
    `SCHEMA_SHA256 = "${EXPECTED_SCHEMA_SHA256}"`,
    `POSTFLIGHT_SCHEMA_SHA256 = "${POSTFLIGHT_SCHEMA_SHA256}"`,
    `CONFIRMATION_STATEMENT = "${CONFIRMATION}"`,
    'import { recheckPublicationTarget } from "./lib/publication_target_recheck.mjs"',
    "confirmRollbackAuthorization=true is required.",
    "Exact rollback confirmation statement is required.",
    "targetAwarePublicationPostflightRequired: true",
    "cloudinaryPostflightLiveRemoteRecheckRequired: true",
    "targetAwareLiveRecheckVerified",
    "cloudinaryLiveRemoteRecheckRequiredWhenApplicable",
    "liveTargetRecheckMode",
    "liveTargetReference",
    "rollbackAuthorizedForOneTransactionOnly: true",
    "authorizationExpiresOnAnyEvidenceDrift: true",
    "deterministicAuthorizationPath",
    "reverifyReadiness",
    "reverifyPostflight",
    "Current published target no longer exactly matches the reviewed candidate bytes.",
    "Rollback backup no longer exactly matches the previous-target snapshot bytes.",
    "rollbackExecutionAllowed: false",
    "publicationAllowed: false",
    "cloudOverwriteAllowed: false",
    "websiteMutationAllowed: false",
    "evavo_authorize_work_header_publication_rollback",
    "evavo_verify_work_header_publication_rollback_authorization",
  ]) assert.ok(source.includes(token), `missing rollback authorization token: ${token}`);
});

test("MCP configuration registers rollback authorization without direct mutation authority", async () => {
  const config = (await read("../.mcp.json")).toString("utf8");
  assert.ok(config.includes('"evavo-work-header-publication-rollback-authorization-v1"'));
  assert.ok(config.includes('"tools/work_header_publication_rollback_authorization_mcp.mjs"'));
});
