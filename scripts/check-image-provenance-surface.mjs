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

for (const relative of [
  "packages/media/test/image-provenance-packet.test.mjs",
  "tools/image_provenance_mcp.test.mjs",
]) await access(path.join(root, relative));

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
}, null, 2)}\n`);