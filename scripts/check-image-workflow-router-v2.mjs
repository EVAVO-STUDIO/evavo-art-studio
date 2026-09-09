#!/usr/bin/env node

import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(root, "config/image-workflow-router-v2.capabilities.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

if (typeof manifest.schemaVersion !== "string" || !/^2\.\d+$/u.test(manifest.schemaVersion)) {
  throw new Error("Image workflow router v2 capability schema must be a supported 2.x revision.");
}
if (manifest.entrypoint !== "tools/image_workflow_router_v2_mcp.mjs") {
  throw new Error("Image workflow router v2 entrypoint is not canonical.");
}
if (!Array.isArray(manifest.goals) || manifest.goals.length !== 15 || !manifest.goals.includes("delivery-preflight")) {
  throw new Error("Image workflow router v2 must advertise fifteen goals including delivery-preflight.");
}
if (!manifest.goals.includes("ai-artifact-assessment")) {
  throw new Error("Image workflow router v2 must preserve the artifact/origin assessment goal.");
}
if (!Array.isArray(manifest.tools) || manifest.tools.length !== 2) {
  throw new Error("Image workflow router v2 manifest must advertise exactly two tools.");
}
if (!manifest.preferredModernSurfaces?.includes("evavo-image-provenance")) {
  throw new Error("Image workflow router v2 must advertise the governed provenance surface.");
}

for (const existingContract of manifest.integratesExistingContracts ?? []) await access(path.join(root, existingContract));
await access(path.join(root, "config/image-provenance.capabilities.json"));

const entrypoint = path.join(root, manifest.entrypoint);
await access(entrypoint);
const syntax = spawnSync(process.execPath, ["--check", entrypoint], { cwd: root, encoding: "utf8" });
if (syntax.status !== 0) throw new Error(`${manifest.entrypoint} failed node --check:\n${syntax.stderr || syntax.stdout}`);
const source = await readFile(entrypoint, "utf8");
for (const tool of manifest.tools) {
  if (!source.includes(`name: "${tool}"`) && !source.includes(`name: '${tool}'`)) {
    throw new Error(`Router manifest advertises ${tool}, but MCP does not expose it.`);
  }
}
for (const requiredSourceFeature of [
  "goalCount",
  "preservesV1RouterCompatibility",
  "distinguishesReviewWriteProviderAndExecutionPrivileges",
  "byte-bound provenance evidence with delegated external-verifier results",
]) {
  if (!source.includes(requiredSourceFeature)) throw new Error(`Image workflow router v2 MCP is missing ${requiredSourceFeature}.`);
}

const mediaIndex = await readFile(path.join(root, "packages/media/src/index.ts"), "utf8");
for (const exportName of ["image-agent-routing-v2", "image-provenance-packet"]) {
  if (!mediaIndex.includes(`export * from "./${exportName}.js";`)) {
    throw new Error(`@evavo/art-media does not publicly export ${exportName}.`);
  }
}
if (mediaIndex.includes('export * from "./image-provenance-evidence.js";')) {
  throw new Error("Router v2 must rely on the strict public provenance packet, not the legacy caller-authenticated helper.");
}

const core = await readFile(path.join(root, "packages/media/src/image-agent-routing-v2.ts"), "utf8");
for (const requiredRouteFeature of [
  "evavo_review_image_sequence_finishing",
  "evavo_review_image_provenance",
  "invalid or contradictory provenance evidence",
  "exact image SHA-256",
  "evavo_review_image_delivery_integrity",
  "evavo_review_image_finalization",
  "evavo_validate_godot_material_resource",
  "execution-gated",
  "Ready-for-approval-review is not approval",
]) {
  if (!core.includes(requiredRouteFeature)) throw new Error(`Image workflow router v2 core is missing ${requiredRouteFeature}.`);
}
if (core.includes('"trusted provenance/lineage", "review-origin-evidence"')) {
  throw new Error("Image workflow router v2 still contains the obsolete provenance placeholder.");
}

for (const requiredTest of [
  "packages/media/test/image-agent-routing-v2.test.mjs",
  "tools/image_workflow_router_v2_mcp.test.mjs",
  "packages/media/test/image-provenance-packet.test.mjs",
  "tools/image_provenance_mcp.test.mjs",
]) await access(path.join(root, requiredTest));

process.stdout.write(`${JSON.stringify({
  contract: "evavo.image-workflow-router-v2.check.v1",
  ok: true,
  schemaVersion: manifest.schemaVersion,
  entrypoint: manifest.entrypoint,
  goals: manifest.goals,
  privilegeClasses: manifest.privilegeClasses,
  integratesExistingContracts: manifest.integratesExistingContracts,
  preferredModernSurfaces: manifest.preferredModernSurfaces,
  guarantees: manifest.guarantees,
  provenance: [
    "real-governed-surface",
    "exact-byte-sha256-binding",
    "delegated-external-verifier-results",
    "no-pixel-origin-inference",
  ],
  tests: [
    "packages/media/test/image-agent-routing-v2.test.mjs",
    "tools/image_workflow_router_v2_mcp.test.mjs",
    "packages/media/test/image-provenance-packet.test.mjs",
    "tools/image_provenance_mcp.test.mjs",
  ],
}, null, 2)}\n`);