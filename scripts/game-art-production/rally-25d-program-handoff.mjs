import { HANDOFF_SCHEMA, PROJECT_ID, PROFILES, PROTOCOL_VERSION, ROLES, SHA_PATTERN, assert, authority, equal, object, sha256 } from "./rally-25d-program-common.mjs";

export function verifyRally25DProgramHandoff(value, asset) {
  const handoff = object(value, `handoff ${asset.assetId}`);
  assert(handoff.schema === HANDOFF_SCHEMA && handoff.protocolVersion === PROTOCOL_VERSION, `handoff ${asset.assetId} protocol drifted.`);
  assert(handoff.projectId === PROJECT_ID && handoff.profileId === "isometric-rally-1990s-25d" && handoff.sourceProductionProtocolVersion === "2026-08-14.2", `handoff ${asset.assetId} source identity drifted.`);
  assert(handoff.assetFamily === asset.assetFamily && handoff.assetId === asset.assetId && handoff.subjectId === asset.subjectId && handoff.creativeIntent === asset.creativeIntent, `handoff ${asset.assetId} asset identity drifted.`);
  assert(SHA_PATTERN.test(handoff.resolvedProjectSha256) && SHA_PATTERN.test(handoff.handoffSha256), `handoff ${asset.assetId} hashes are invalid.`);
  const { handoffSha256, ...payload } = handoff; assert(sha256(payload) === handoffSha256, `handoff ${asset.assetId} payload hash drifted.`);
  assert(Array.isArray(handoff.artOrders), `handoff ${asset.assetId} art orders are missing.`);
  const roles = handoff.artOrders.map((order) => order.role).sort(); assert(equal(roles, [...ROLES[asset.assetFamily]].sort()), `handoff ${asset.assetId} roles drifted.`);
  const downstream = object(handoff.downstream, `handoff ${asset.assetId}.downstream`);
  assert(downstream.repository === "EVAVO-STUDIO/evavo-3d-studio" && downstream.compilerProfile === PROFILES[asset.assetFamily] && downstream.expectedSchema === "evavo.rally-3d-production-plan.v1" && downstream.runtimeRepository === "EVAVO-STUDIO/godot-462-isometric-rally" && downstream.runtimeBundleSchema === "evavo.rally-runtime-asset-bundle.v1" && downstream.exchangeFormat === "glb" && downstream.engine === "Godot 4.6.2", `handoff ${asset.assetId} downstream contract drifted.`);
  authority(handoff.authority, `handoff ${asset.assetId}.authority`);
  return { handoff, roles };
}
