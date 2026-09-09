#!/usr/bin/env node

import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mcp = JSON.parse(await readFile(path.join(root, ".mcp.json"), "utf8"));
if (!mcp || typeof mcp !== "object" || !mcp.mcpServers || typeof mcp.mcpServers !== "object") {
  throw new Error(".mcp.json must contain an mcpServers object.");
}

const COMMON_ROOTS = "C:\\GitRepos;%LOCALAPPDATA%\\EVAVO;%USERPROFILE%\\Downloads;C:\\EVAVO;D:\\EVAVO";
const registrations = Object.freeze([
  ["evavo-image-workflow-router-v2", "config/image-workflow-router-v2.capabilities.json", null, null],
  ["evavo-image-finishing-artist-v1", "config/image-finishing-artist.capabilities.json", "EVAVO_IMAGE_REVIEW_ALLOWED_ROOTS", null],
  ["evavo-image-finishing-packet-v1", "config/image-finishing-packet.capabilities.json", "EVAVO_IMAGE_FINISHING_PACKET_ALLOWED_ROOTS", null],
  ["evavo-image-repair-agent-v1", "config/image-repair-agent.capabilities.json", "EVAVO_IMAGE_REPAIR_ALLOWED_ROOTS", "EVAVO_IMAGE_REPAIR_ALLOW_WRITES"],
  ["evavo-image-reference-consistency-v1", "config/image-reference-consistency.capabilities.json", "EVAVO_IMAGE_CONSISTENCY_ALLOWED_ROOTS", "EVAVO_IMAGE_CONSISTENCY_ALLOW_WRITES"],
  ["evavo-image-artifact-triage-v1", "config/image-artifact-triage.capabilities.json", "EVAVO_IMAGE_ARTIFACT_ALLOWED_ROOTS", null],
  ["evavo-image-provenance-v1", "config/image-provenance.capabilities.json", "EVAVO_IMAGE_PROVENANCE_ALLOWED_ROOTS", null],
  ["evavo-image-sequence-finishing-v1", "config/image-sequence-finishing.capabilities.json", "EVAVO_IMAGE_SEQUENCE_ALLOWED_ROOTS", null],
  ["evavo-image-delivery-integrity-v1", "config/image-delivery-integrity.capabilities.json", "EVAVO_IMAGE_DELIVERY_ALLOWED_ROOTS", null],
  ["evavo-image-finalization-v1", "config/image-finalization.capabilities.json", "EVAVO_IMAGE_FINALIZATION_ALLOWED_ROOTS", null],
  ["evavo-texture-review-agent-v1", "config/texture-review-agent.capabilities.json", "EVAVO_TEXTURE_REVIEW_ALLOWED_ROOTS", "EVAVO_TEXTURE_REVIEW_ALLOW_WRITES"],
  ["evavo-godot-material-delivery-v1", "config/godot-material-delivery-agent.capabilities.json", "EVAVO_GODOT_MATERIAL_ALLOWED_ROOTS", "EVAVO_GODOT_MATERIAL_ALLOW_WRITES"],
  ["evavo-godot-material-validation-v1", "config/godot-material-validation-agent.capabilities.json", "EVAVO_GODOT_MATERIAL_VALIDATION_ALLOWED_ROOTS", "EVAVO_GODOT_MATERIAL_ALLOW_EXECUTION"],
  ["evavo-image-effects-v1", "config/image-effects-agent.capabilities.json", "EVAVO_IMAGE_EFFECTS_ALLOWED_ROOTS", "EVAVO_IMAGE_EFFECTS_ALLOW_WRITES"],
]);

const checked = [];
for (const [serverName, manifestRelative, rootsEnv, privilegeEnv] of registrations) {
  const manifest = JSON.parse(await readFile(path.join(root, manifestRelative), "utf8"));
  const server = mcp.mcpServers[serverName];
  if (!server) throw new Error(`.mcp.json is missing required modern image server ${serverName}.`);
  if (server.command !== "node") throw new Error(`${serverName} must launch through node.`);
  if (!Array.isArray(server.args) || server.args.length !== 1 || server.args[0] !== manifest.entrypoint) {
    throw new Error(`${serverName} must launch canonical manifest entrypoint ${manifest.entrypoint}.`);
  }
  await access(path.join(root, manifest.entrypoint));
  const env = server.env ?? {};
  if (rootsEnv && env[rootsEnv] !== COMMON_ROOTS) {
    throw new Error(`${serverName} must use the canonical image allowed-root set through ${rootsEnv}.`);
  }
  if (!rootsEnv && Object.keys(env).length !== 0) {
    throw new Error(`${serverName} is read-only discovery and must not receive extra environment privileges.`);
  }
  if (privilegeEnv) {
    if (env[privilegeEnv] !== "true") throw new Error(`${serverName} must expose ${privilegeEnv}=true so explicit per-call admission can function.`);
  }
  checked.push(serverName);
}

const raster = mcp.mcpServers["evavo-raster-finishing-v1"];
if (!raster) throw new Error(".mcp.json is missing evavo-raster-finishing-v1 required by Router v2 transparency/resize routes.");
if (raster.command !== "node" || raster.args?.[0] !== "tools/raster_finishing_mcp.mjs") throw new Error("Raster finishing registration entrypoint is not canonical.");
if (raster.env?.EVAVO_RASTER_FINISH_ALLOWED_ROOTS !== COMMON_ROOTS || raster.env?.EVAVO_RASTER_FINISH_ALLOW_WRITES !== "true") {
  throw new Error("Raster finishing registration must preserve its own root/write admission environment.");
}
await access(path.join(root, "tools/raster_finishing_mcp.mjs"));
checked.push("evavo-raster-finishing-v1");

const readOnlyServers = [
  "evavo-image-workflow-router-v2",
  "evavo-image-finishing-artist-v1",
  "evavo-image-finishing-packet-v1",
  "evavo-image-artifact-triage-v1",
  "evavo-image-provenance-v1",
  "evavo-image-sequence-finishing-v1",
  "evavo-image-delivery-integrity-v1",
  "evavo-image-finalization-v1",
];
for (const serverName of readOnlyServers) {
  const env = mcp.mcpServers[serverName]?.env ?? {};
  for (const key of Object.keys(env)) {
    if (/ALLOW_(WRITES|EXECUTION)$/u.test(key)) throw new Error(`${serverName} is read-only but .mcp.json grants ${key}.`);
  }
}

const godotValidation = mcp.mcpServers["evavo-godot-material-validation-v1"];
if (Object.hasOwn(godotValidation.env ?? {}, "EVAVO_GODOT_EXECUTABLE")) {
  throw new Error(".mcp.json must not hardcode EVAVO_GODOT_EXECUTABLE; the trusted executable is operator environment only.");
}
if (godotValidation.env?.EVAVO_GODOT_MATERIAL_ALLOW_EXECUTION !== "true") {
  throw new Error("Native Godot validation registration must expose its server-level execution gate; the tool still requires exact per-call confirmation.");
}

for (const serverName of checked) {
  const server = mcp.mcpServers[serverName];
  if (server.env && Object.values(server.env).some((value) => typeof value !== "string")) {
    throw new Error(`${serverName} contains a non-string MCP environment value.`);
  }
}

process.stdout.write(`${JSON.stringify({
  contract: "evavo.modern-image-mcp-registration.check.v1",
  ok: true,
  preferredDiscovery: "evavo-image-workflow-router-v2",
  registeredModernSurfaces: checked,
  readOnlyServers,
  nativeExecution: {
    server: "evavo-godot-material-validation-v1",
    serverGateConfigured: true,
    executableHardcoded: false,
    perCallConfirmationStillRequiredByTool: true,
  },
  writeBoundary: "Write-capable MCP registrations only expose server-level admission; tools remain create-only and require explicit per-call confirmation.",
}, null, 2)}\n`);
