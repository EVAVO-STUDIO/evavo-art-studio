import { compileRally25DArtHandoff } from "./rally-25d-handoff.mjs";
import { BLOCKERS, PROGRAM_SCHEMA, PROTOCOL_VERSION, READINESS, assert, canonicalJson, sha256 } from "./rally-25d-program-common.mjs";
import { verifyRally25DProgramHandoff } from "./rally-25d-program-handoff.mjs";
import { topologicalOrder, validateRally25DArtProgramRequest } from "./rally-25d-program-request.mjs";

export async function compileRally25DArtProgram(input, { compileHandoff = compileRally25DArtHandoff } = {}) {
  assert(typeof compileHandoff === "function", "compileHandoff must be a function.");
  const before = canonicalJson(input); const request = validateRally25DArtProgramRequest(input); const ordered = topologicalOrder(request.assets); const assets = [];
  for (const [sequence, { asset, index: requestIndex }] of ordered.entries()) {
    const result = await compileHandoff({ projectId: request.project.projectId, assetFamily: asset.assetFamily, assetId: asset.assetId, subjectId: asset.subjectId, creativeIntent: asset.creativeIntent, referenceBindings: asset.referenceBindings });
    const verified = verifyRally25DProgramHandoff(result, asset);
    assets.push({ sequence, requestIndex, assetFamily: asset.assetFamily, assetId: asset.assetId, subjectId: asset.subjectId, phase: asset.phase, priority: asset.priority, dependencies: [...asset.dependencies], requiredForPlayable: asset.requiredForPlayable, handoffSha256: verified.handoff.handoffSha256, requiredArtRoles: verified.roles, handoff: verified.handoff, status: "work-orders-compiled", blockers: [...BLOCKERS] });
  }
  assert(canonicalJson(input) === before, "compiler mutated the request.");
  const body = { schema: PROGRAM_SCHEMA, protocolVersion: PROTOCOL_VERSION, programId: request.programId, title: request.title, requestSha256: sha256(request), request, project: request.project, assets, totals: { assets: assets.length, playableRequiredAssets: assets.filter((asset) => asset.requiredForPlayable).length, artOrders: assets.reduce((sum, asset) => sum + asset.requiredArtRoles.length, 0), families: [...new Set(assets.map((asset) => asset.assetFamily))].sort() }, readiness: { ...READINESS }, authority: request.authority };
  return { ...body, programSha256: sha256(body) };
}

