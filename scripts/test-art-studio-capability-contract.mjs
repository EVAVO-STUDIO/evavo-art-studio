#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  checkRepository,
  validateAutomationFabricClient,
  validateCapabilityManifest,
} from "./check-art-studio-capability-contract.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = async (relative) =>
  JSON.parse(await readFile(path.join(root, relative), "utf8"));

const [manifest, schema, packageJson, automationClient] = await Promise.all([
  readJson("evavo.capabilities.json"),
  readJson("schemas/evavo.repository-capabilities.schema.json"),
  readJson("package.json"),
  readJson("config/automation-fabric-client-v2.json"),
]);

const clone = (value) => structuredClone(value);

test("validates the repository capability and Automation Fabric contract", async () => {
  const result = await checkRepository(root);
  assert.equal(result.ok, true);
  assert.equal(result.manifest.publicationAuthority, false);
  assert.equal(result.automationFabric.workerReceiptIsPublicationEvidence, false);
});

test("rejects duplicate capability identities", () => {
  const candidate = clone(manifest);
  candidate.capabilities[1].id = candidate.capabilities[0].id;
  assert.throws(
    () => validateCapabilityManifest(candidate, schema, packageJson),
    /Capability IDs must be unique/u,
  );
});

test("rejects removal of the book creative-direction capability", () => {
  const candidate = clone(manifest);
  candidate.capabilities = candidate.capabilities.filter(
    (capability) => capability.id !== "art.book.direction",
  );
  assert.throws(
    () => validateCapabilityManifest(candidate, schema, packageJson),
    /Required capability art\.book\.direction is absent/u,
  );
});

test("rejects a capability that claims publication", () => {
  const candidate = clone(manifest);
  candidate.capabilities[0].effects.push("publish");
  assert.throws(
    () => validateCapabilityManifest(candidate, schema, packageJson),
    /must not claim Git or mainline publication authority/u,
  );
});

test("rejects a capability entrypoint with no real package script", () => {
  const candidate = clone(manifest);
  candidate.capabilities[0].entrypoints[0] = "pnpm capability:missing";
  assert.throws(
    () => validateCapabilityManifest(candidate, schema, packageJson),
    /references missing package script capability:missing/u,
  );
});

test("rejects network execution without an explicit gate", () => {
  const candidate = clone(manifest);
  const provider = candidate.capabilities.find(
    (capability) => capability.id === "art.provider.execute",
  );
  provider.requires = ["Exact plan", "Expected source hashes"];
  assert.throws(
    () => validateCapabilityManifest(candidate, schema, packageJson),
    /lacks an explicit gate or credential prerequisite/u,
  );
});

test("rejects disabled file-first PowerShell routing", () => {
  const candidate = clone(automationClient);
  candidate.defaultRouting.fileFirstPowerShell = false;
  assert.throws(
    () => validateAutomationFabricClient(candidate),
    /routing weakened: fileFirstPowerShell/u,
  );
});

test("rejects the retired GitHub MCP hardened-server alias", () => {
  const candidate = clone(automationClient);
  candidate.repositoryMutation.entrypoint =
    "control-plane/agent-workspace-hardened-server.mjs";
  assert.throws(
    () => validateAutomationFabricClient(candidate),
    /live trusted-workstation agent-workspace MCP entrypoint/u,
  );
});

test("rejects the retired Development Studio PowerShell publisher alias", () => {
  const candidate = clone(automationClient);
  candidate.publication.operator = "scripts/Publish-EvavoRepoMain.ps1";
  assert.throws(
    () => validateAutomationFabricClient(candidate),
    /live guarded mainline publisher/u,
  );
});

test("rejects a write-enabled public GitHub surface", () => {
  const candidate = clone(automationClient);
  candidate.repositoryMutation.publicRemoteSurface = "read-write";
  assert.throws(
    () => validateAutomationFabricClient(candidate),
    /public surface is read-only/u,
  );
});

test("rejects a worker receipt promoted to publication evidence", () => {
  const candidate = clone(automationClient);
  candidate.executionEvidence.workerReceiptIsPublicationEvidence = true;
  assert.throws(
    () => validateAutomationFabricClient(candidate),
    /overclaims workerReceiptIsPublicationEvidence/u,
  );
});

test("rejects force-push publication", () => {
  const candidate = clone(automationClient);
  candidate.publication.forcePush = true;
  assert.throws(
    () => validateAutomationFabricClient(candidate),
    /Destructive publication mode enabled: forcePush/u,
  );
});

test("rejects Local Storage version drift below the v2 baseline", () => {
  const candidate = clone(automationClient);
  candidate.minimumLocalStorageVersion = "0.35.9";
  assert.throws(
    () => validateAutomationFabricClient(candidate),
    /0.36.0 or newer/u,
  );
});
