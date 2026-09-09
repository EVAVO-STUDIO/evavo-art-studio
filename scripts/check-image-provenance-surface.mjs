#!/usr/bin/env node

import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function requireIncludes(source, values, label) {
  for (const value of values) {
    if (!source.includes(value)) throw new Error(`${label} is missing ${value}.`);
  }
}

function runDoctor(relative, label) {
  const result = spawnSync(process.execPath, [path.join(root, relative)], { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`${label} failed:\n${result.stderr || result.stdout}`);
}

const manifestPath = path.join(root, "config/image-provenance.capabilities.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
if (!/^1\.\d+$/u.test(manifest.schemaVersion) || manifest.id !== "evavo-image-provenance") {
  throw new Error("Image provenance capability manifest must use a compatible 1.x contract.");
}
for (const status of ["verified", "unverified", "absent", "invalid"]) {
  if (!manifest.packetStatuses?.includes(status)) throw new Error(`Image provenance manifest is missing ${status}.`);
}
for (const kind of ["source-binding", "generation-receipt", "content-credential", "evavo-record"]) {
  if (!manifest.evidenceKinds?.includes(kind)) throw new Error(`Image provenance manifest is missing ${kind}.`);
}
if (manifest.guarantees?.writesFiles !== false
  || manifest.guarantees?.sourceMutationAllowed !== false
  || manifest.guarantees?.localSha256BindingPerformedByArtStudio !== true
  || manifest.guarantees?.externalCryptographicVerificationPerformedByThisTool !== false
  || manifest.guarantees?.verifiedExternalClaimsRequireVerifierAndRecordId !== true
  || manifest.guarantees?.claimsPixelAiOriginDetection !== false
  || manifest.guarantees?.automaticCreativeApproval !== false
  || manifest.guarantees?.publicationAllowed !== false) {
  throw new Error("Image provenance guarantees must remain read-only, hash-bound, non-promoting and truthful about external verification.");
}

const packet = await readFile(path.join(root, "packages/media/src/image-provenance-packet.ts"), "utf8");
requireIncludes(packet, [
  "createImageProvenancePacket",
  "createHash(\"sha256\")",
  "contradictory-verified-origin-claims",
  "externalVerificationPerformedByArtStudio: false",
  "cannot report verified external evidence without verifier and verification record id",
  "aiGenerated: \"not-determined\"",
  "pixelHeuristicsUsedForOrigin: false",
  "automaticCreativeApproval: false",
  "publicationAllowed: false",
], "Image provenance packet");

const legacy = await readFile(path.join(root, "packages/media/src/image-provenance-evidence.ts"), "utf8");
requireIncludes(legacy, [
  "evavo.image-provenance-record.v1",
  "evavo.enhancement-art-review.v1",
  "evavo-master-transparent-asset",
  "createHash(\"sha256\")",
], "Existing image provenance lineage adapter");

const mediaIndex = await readFile(path.join(root, "packages/media/src/index.ts"), "utf8");
requireIncludes(mediaIndex, ['export * from "./image-provenance-packet.js";'], "@evavo/art-media public index");
if (mediaIndex.includes('export * from "./image-provenance-evidence.js";')) {
  throw new Error("Legacy caller-authenticated provenance helper must remain internal.");
}

const mcpPath = path.join(root, manifest.entrypoint);
await access(mcpPath);
const mcp = await readFile(mcpPath, "utf8");
requireIncludes(mcp, [
  "evavo_review_image_provenance",
  "EVAVO_IMAGE_PROVENANCE_ALLOWED_ROOTS",
  "externalCryptographicVerificationPerformedByThisTool: false",
  "pixelOriginDetectionClaimed: false",
  "verifiedExternalClaimsRequireVerifierAndRecordId: true",
  "bytesReturned: false",
], "Image provenance MCP");
if (mcp.includes("externallyAuthenticated")) {
  throw new Error("Image provenance MCP must not expose a caller-controlled externallyAuthenticated shortcut.");
}
const syntax = spawnSync(process.execPath, ["--check", mcpPath], { cwd: root, encoding: "utf8" });
if (syntax.status !== 0) throw new Error(`Image provenance MCP failed node --check:\n${syntax.stderr || syntax.stdout}`);

const providerIndex = await readFile(path.join(root, "packages/providers/src/index.ts"), "utf8");
requireIncludes(providerIndex, ['export * from "./provider-provenance.js";'], "@evavo/art-providers public index");
if (providerIndex.includes('export * from "./orchestrator.js";')) {
  throw new Error("Raw provider executor must remain internal; package consumers must use the provenance-enforcing wrapper.");
}

const providerProvenance = await readFile(path.join(root, "packages/providers/src/provider-provenance.ts"), "utf8");
requireIncludes(providerProvenance, [
  "evavo.provider-provenance-bundle.v1",
  "evavo.image-provenance-record.v1",
  "executeProviderCandidateRequest as executeProviderCandidateRequestRaw",
  "createImageProvenancePacket",
  "provenanceArtifact",
  "providerOrContentCredentialSignatureVerifiedHere: false",
  "providerReportedOriginIsExternallyAuthenticated: false",
  "pixelOriginInferenceUsed: false",
  "automaticCreativeApproval: false",
  "publicationAllowed: false",
  "PROVIDER_PROVENANCE_EMISSION_FAILED",
], "Provider provenance wrapper");
if (providerProvenance.includes("externallyAuthenticated")) {
  throw new Error("Provider provenance wrapper must not use the legacy caller-authenticated provenance shortcut.");
}

const providerContract = await readFile(path.join(root, "packages/providers/src/contract.ts"), "utf8");
requireIncludes(providerContract, ["evidence.bundle", "evidence.provenance"], "Provider durable runtime contract");

for (const relative of [
  "packages/media/test/image-provenance-packet.test.mjs",
  "tools/image_provenance_mcp.test.mjs",
  "packages/providers/test/provider-provenance.test.mjs",
  "packages/providers/test/compiled-contract.test.mjs",
]) await access(path.join(root, relative));

runDoctor("scripts/check-modern-image-mcp-registration.mjs", "Modern image MCP registration doctor");

process.stdout.write(`${JSON.stringify({
  contract: "evavo.image-provenance-surface.check.v1",
  ok: true,
  packetStatuses: manifest.packetStatuses,
  evidenceKinds: manifest.evidenceKinds,
  trustBoundary: [
    "exact-local-sha256-binding",
    "external-verifier-result-is-delegated-not-performed-here",
    "no-caller-authenticated-boolean",
    "no-pixel-ai-origin-inference",
    "no-creative-or-publication-authority",
  ],
  providerBoundary: [
    "public-provider-executor-emits-provenance",
    "raw-provider-executor-is-internal",
    "candidate-and-reference-hashes-verified",
    "base-image-only-canonical-parent-binding",
    "runtime-requires-evidence.provenance",
    "provider-origin-record-is-not-external-authentication",
  ],
  mcpRegistration: "scripts/check-modern-image-mcp-registration.mjs",
}, null, 2)}\n`);