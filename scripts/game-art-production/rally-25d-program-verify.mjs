import { BLOCKERS, PROGRAM_SCHEMA, PROTOCOL_VERSION, READINESS, SHA_PATTERN, assert, equal, exact, object, sha256 } from "./rally-25d-program-common.mjs";
import { verifyRally25DProgramHandoff } from "./rally-25d-program-handoff.mjs";
import { topologicalOrder, validateRally25DArtProgramRequest } from "./rally-25d-program-request.mjs";

export function verifyRally25DArtProgram(program) {
  const value = object(program, "program"); exact(value, ["schema", "protocolVersion", "programId", "title", "requestSha256", "request", "project", "assets", "totals", "readiness", "authority", "programSha256"], "program");
  assert(value.schema === PROGRAM_SCHEMA && value.protocolVersion === PROTOCOL_VERSION && SHA_PATTERN.test(value.programSha256), "program identity is invalid.");
  const { programSha256, ...payload } = value; assert(sha256(payload) === programSha256, "program SHA-256 does not match its payload.");
  const request = validateRally25DArtProgramRequest(value.request); assert(sha256(request) === value.requestSha256, "program request hash drifted.");
  assert(value.programId === request.programId && value.title === request.title && equal(value.project, request.project) && equal(value.authority, request.authority), "program request-derived metadata drifted.");
  const ordered = topologicalOrder(request.assets); assert(Array.isArray(value.assets) && value.assets.length === ordered.length, "program asset closure drifted.");
  let artOrders = 0; const completed = new Set();
  for (const [sequence, { asset: expected, index: requestIndex }] of ordered.entries()) {
    const compiled = object(value.assets[sequence], `program.assets[${sequence}]`); exact(compiled, ["sequence", "requestIndex", "assetFamily", "assetId", "subjectId", "phase", "priority", "dependencies", "requiredForPlayable", "handoffSha256", "requiredArtRoles", "handoff", "status", "blockers"], `program.assets[${sequence}]`);
    assert(compiled.sequence === sequence && compiled.requestIndex === requestIndex && compiled.assetFamily === expected.assetFamily && compiled.assetId === expected.assetId && compiled.subjectId === expected.subjectId && compiled.phase === expected.phase && compiled.priority === expected.priority && compiled.requiredForPlayable === expected.requiredForPlayable && equal(compiled.dependencies, expected.dependencies) && compiled.dependencies.every((entry) => completed.has(entry)), `program asset ${expected.assetId} metadata drifted.`);
    const verified = verifyRally25DProgramHandoff(compiled.handoff, expected); assert(compiled.handoffSha256 === verified.handoff.handoffSha256 && equal(compiled.requiredArtRoles, verified.roles) && compiled.status === "work-orders-compiled" && equal(compiled.blockers, BLOCKERS), `program asset ${expected.assetId} derived state drifted.`);
    artOrders += verified.roles.length; completed.add(expected.assetId);
  }
  const expectedTotals = { assets: value.assets.length, playableRequiredAssets: value.assets.filter((asset) => asset.requiredForPlayable).length, artOrders, families: [...new Set(value.assets.map((asset) => asset.assetFamily))].sort() };
  assert(equal(value.totals, expectedTotals) && equal(value.readiness, READINESS), "program totals or readiness drifted.");
  return true;
}
