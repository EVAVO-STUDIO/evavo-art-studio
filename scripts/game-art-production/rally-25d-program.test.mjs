import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { compileRally25DArtProgram, sha256, verifyRally25DArtProgram } from "./rally-25d-program.mjs";

const request = JSON.parse(await readFile(new URL("../../config/game-art-production/programs/rally-vertical-slice.v1.json", import.meta.url), "utf8"));
const roles = { vehicle: ["shape-language", "modeling-reference", "uv-material-reference", "rig-damage-reference"], environment: ["world-composition", "terrain-material-reference", "runtime-shader-reference"], structure: ["modular-modeling-reference", "runtime-shader-reference"], prop: ["prop-modeling-reference", "runtime-shader-reference"], character: ["character-rig-reference", "runtime-shader-reference"], fauna: ["fauna-rig-reference", "runtime-shader-reference"], vfx: ["effect-shape-timing", "runtime-shader-reference"] };
const profiles = { vehicle: "rally-vehicle-rig-v1", environment: "rally-environment-kit-v1", structure: "rally-modular-structure-v1", prop: "rally-prop-v1", character: "rally-crowd-character-v1", fauna: "rally-fauna-v1", vfx: "rally-vfx-v1" };
function handoff(input) {
  const body = { schema: "evavo.rally-art-handoff.v1", protocolVersion: "2026-08-14.1", projectId: "isometric-rally-1990s", profileId: "isometric-rally-1990s-25d", sourceProductionProtocolVersion: "2026-08-14.2", resolvedProjectSha256: sha256("resolved-project"), assetFamily: input.assetFamily, assetId: input.assetId, subjectId: input.subjectId, creativeIntent: input.creativeIntent, artOrders: roles[input.assetFamily].map((role, index) => ({ role, requestedAssetTypeId: `asset-type-${index}`, assetTypeId: `asset-type-${index}`, unitId: `${input.assetId}-${index}`, workOrderSha256: sha256(`${input.assetId}:${role}`), output: { working: `working/${input.assetId}/${index}.png`, master: `masters/${input.assetId}/${index}.png` }, renderingContract: { model: "high-definition-stylized-raster", imageFormat: "png", textureFiltering: "linear", authoringScalePolicy: "uniform" }, providerPrompt: "governed provider prompt", assetContract: { kind: "reference" } })), downstream: { repository: "EVAVO-STUDIO/evavo-3d-studio", compilerProfile: profiles[input.assetFamily], expectedSchema: "evavo.rally-3d-production-plan.v1", runtimeRepository: "EVAVO-STUDIO/godot-462-isometric-rally", runtimeBundleSchema: "evavo.rally-runtime-asset-bundle.v1", exchangeFormat: "glb", engine: "Godot 4.6.2" }, authority: { providerExecution: false, automaticApproval: false, automaticPromotion: false, downstreamRepositoryMutation: false, runtimeRepositoryMutation: false, gitMutation: false, deployment: false, publication: false, namedHumanApprovalRequired: true } };
  return { ...body, handoffSha256: sha256(body) };
}
async function compile(value = request) { return compileRally25DArtProgram(value, { compileHandoff: async (input) => handoff(input) }); }
function rehash(program) { const { programSha256: _discarded, ...payload } = program; program.programSha256 = sha256(payload); return program; }

test("compiles and verifies the deterministic 13-asset playable slice without mutating input", async () => {
  const copy = structuredClone(request); const before = JSON.stringify(copy); const first = await compile(copy); const second = await compile(copy);
  assert.equal(JSON.stringify(copy), before); assert.deepEqual(first, second); assert.equal(first.totals.assets, 13); assert.equal(first.totals.playableRequiredAssets, 12); assert.equal(first.readiness.status, "awaiting-art-production"); assert.equal(verifyRally25DArtProgram(first), true);
  const order = new Map(first.assets.map((asset) => [asset.assetId, asset.sequence])); for (const asset of first.assets) for (const dependency of asset.dependencies) assert.ok(order.get(dependency) < asset.sequence);
});

test("rejects unknown dependencies and cycles", async () => {
  const unknown = structuredClone(request); unknown.assets[0].dependencies = ["missing-asset"]; await assert.rejects(() => compile(unknown), /unknown dependency/u);
  const cycle = structuredClone(request); cycle.assets[0].dependencies = [cycle.assets[1].assetId]; cycle.assets[1].dependencies = [cycle.assets[0].assetId]; await assert.rejects(() => compile(cycle), /cycle/u);
});

test("rejects authority, handoff and rehashed retained-metadata escalation", async () => {
  const authority = structuredClone(request); authority.authority.providerExecution = true; await assert.rejects(() => compile(authority), /must remain false/u);
  const forgedHandoff = async (input) => { const value = handoff(input); value.downstream.compilerProfile = "attacker-profile"; const { handoffSha256: _old, ...payload } = value; value.handoffSha256 = sha256(payload); return value; }; await assert.rejects(() => compileRally25DArtProgram(request, { compileHandoff: forgedHandoff }), /downstream contract drifted/u);
  const program = await compile(); const forged = structuredClone(program); forged.assets[0].priority += 1; rehash(forged); assert.throws(() => verifyRally25DArtProgram(forged), /metadata drifted/u);
});
