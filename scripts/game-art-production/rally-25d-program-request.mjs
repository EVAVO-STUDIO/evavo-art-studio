import { FAMILIES, PROJECT_ID, PROTOCOL_VERSION, REQUEST_SCHEMA, assert, authority, bindings, exact, id, integer, object, text, uniqueIds } from "./rally-25d-program-common.mjs";
import { assertCanonicalRallyVerticalSlice } from "./rally-25d-program-identity.mjs";

export function validateRally25DArtProgramRequest(input) {
  const source = object(input, "request");
  exact(source, ["schema", "protocolVersion", "programId", "title", "project", "assets", "authority"], "request");
  assert(source.schema === REQUEST_SCHEMA && source.protocolVersion === PROTOCOL_VERSION, "request protocol identity drifted.");
  const programId = id(source.programId, "request.programId");
  const project = object(source.project, "request.project");
  exact(project, ["projectId", "sourceRepository", "downstreamRepository", "runtimeRepository", "engine"], "request.project");
  assert(project.projectId === PROJECT_ID && project.sourceRepository === "EVAVO-STUDIO/evavo-art-studio" && project.downstreamRepository === "EVAVO-STUDIO/evavo-3d-studio" && project.runtimeRepository === "EVAVO-STUDIO/godot-462-isometric-rally" && project.engine === "Godot 4.6.2", "request project contract drifted.");
  assert(Array.isArray(source.assets) && source.assets.length >= 1 && source.assets.length <= 64, "request.assets is invalid.");
  const seen = new Set();
  const assets = source.assets.map((entry, index) => {
    const asset = object(entry, `request.assets[${index}]`);
    exact(asset, ["assetFamily", "assetId", "subjectId", "creativeIntent", "phase", "priority", "dependencies", "requiredForPlayable", "referenceBindings"], `request.assets[${index}]`);
    const assetFamily = id(asset.assetFamily, `request.assets[${index}].assetFamily`); assert(FAMILIES.has(assetFamily), `unsupported family ${assetFamily}.`);
    const assetId = id(asset.assetId, `request.assets[${index}].assetId`); assert(!seen.has(assetId), `duplicate asset ${assetId}.`); seen.add(assetId);
    const dependencies = uniqueIds(asset.dependencies, `request.assets[${index}].dependencies`); assert(!dependencies.includes(assetId), `asset ${assetId} depends on itself.`);
    assert(typeof asset.requiredForPlayable === "boolean", `request.assets[${index}].requiredForPlayable is invalid.`);
    return { assetFamily, assetId, subjectId: id(asset.subjectId, `request.assets[${index}].subjectId`), creativeIntent: text(asset.creativeIntent, `request.assets[${index}].creativeIntent`, 10), phase: id(asset.phase, `request.assets[${index}].phase`), priority: integer(asset.priority, `request.assets[${index}].priority`, 0, 1000), dependencies, requiredForPlayable: asset.requiredForPlayable, referenceBindings: bindings(asset.referenceBindings, `request.assets[${index}].referenceBindings`) };
  });
  for (const asset of assets) for (const dependency of asset.dependencies) assert(seen.has(dependency), `asset ${asset.assetId} references unknown dependency ${dependency}.`);
  assertCanonicalRallyVerticalSlice(programId, assets);
  return { schema: REQUEST_SCHEMA, protocolVersion: PROTOCOL_VERSION, programId, title: text(source.title, "request.title"), project: { ...project }, assets, authority: authority(source.authority, "request.authority") };
}

export function topologicalOrder(assets) {
  const pending = new Map(assets.map((asset, index) => [asset.assetId, { asset, index }])); const completed = new Set(); const result = [];
  while (pending.size) {
    const ready = [...pending.values()].filter(({ asset }) => asset.dependencies.every((entry) => completed.has(entry))).sort((a, b) => a.asset.priority - b.asset.priority || a.index - b.index || a.asset.assetId.localeCompare(b.asset.assetId));
    assert(ready.length, "asset dependency graph contains a cycle.");
    for (const entry of ready) { pending.delete(entry.asset.assetId); completed.add(entry.asset.assetId); result.push(entry); }
  }
  return result;
}
