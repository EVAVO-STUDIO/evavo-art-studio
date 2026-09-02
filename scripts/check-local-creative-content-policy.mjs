#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const policy = JSON.parse(await readFile(new URL("../config/local-creative-content-policy-v1.json", import.meta.url), "utf8"));
assert.equal(policy.schemaVersion, 1);
assert.equal(policy.kind, "evavo-local-creative-content-policy-v1");
assert.equal(policy.consumer, "art-studio");
assert.equal(policy.mode, "local-owner-controlled");
for (const key of ["matureThemes", "adultSuggestive", "adultEroticNonExplicit", "revealingButNonExplicitAdultCharacterDesign"]) assert.equal(policy.creativeEnvelope[key], true);
for (const key of ["sexualContentInvolvingMinors", "sexualizedDepictionOfMinors", "nonConsensualSexualContent", "illegalSexualContent", "realPersonSexualDeepfakeWithoutConsent"]) assert.equal(policy.hardBoundaries[key], false);
assert.equal(policy.providerIndependence.hostedProviderPolicyDefinesEvavoPolicy, false);
assert.equal(policy.providerIndependence.hostedProviderRefusalIsUniversalCreativeDecision, false);
assert.equal(policy.providerIndependence.localOpenWeightAndOfflineRoutesMayBePreferred, true);
assert.equal(policy.execution.localFirst, true);
assert.equal(policy.execution.arbitraryModelDownloadFromCreativeRequest, false);
assert.equal(policy.execution.exactModelRevisionRequired, true);
assert.equal(policy.execution.physicalWorkstationReceiptRequired, true);
assert.equal(policy.execution.candidateOutputRequiresCreativeReview, true);
for (const [key, value] of Object.entries(policy.authority)) key === "policyDocumentOnly" ? assert.equal(value, true) : assert.equal(value, false);
console.log("Local creative content policy passed.");
