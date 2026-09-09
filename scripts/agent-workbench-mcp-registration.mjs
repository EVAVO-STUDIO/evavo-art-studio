#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const CONTRACT = "evavo_agent_workbench_mcp_registration_v1";
const SERVER_NAME = "evavo-agent-workbench-v2";
const SERVER_ENTRY = Object.freeze({
  command: "node",
  args: Object.freeze(["./scripts/agent-workbench-mcp-v2.mjs"]),
});
const digest = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const record = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : null;
const canonical = (value) => `${JSON.stringify(value, null, 2)}\n`;
const fail = (message) => { throw new Error(message); };

function parse(argv) {
  const options = { root: null, write: false, check: false, selfTest: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--root") options.root = argv[++index] ?? null;
    else if (token === "--write") options.write = true;
    else if (token === "--check") options.check = true;
    else if (token === "--self-test") options.selfTest = true;
    else fail(`Unknown argument: ${token}`);
  }
  if (options.write && options.check) fail("--write and --check are mutually exclusive.");
  return options;
}

function exactEntry(value) {
  const item = record(value);
  return item?.command === SERVER_ENTRY.command
    && Array.isArray(item.args)
    && item.args.length === 1
    && item.args[0] === SERVER_ENTRY.args[0]
    && Object.keys(item).every((key) => key === "command" || key === "args");
}

function validateRepository(root) {
  const descriptorPath = path.join(root, ".evavo", "agent-workbench.mcp.v2.json");
  const bundlePath = path.join(root, ".evavo", "agent-workbench.contracts.v1.json");
  const serverPath = path.join(root, "scripts", "agent-workbench-mcp-v2.mjs");
  for (const required of [descriptorPath, bundlePath, serverPath]) {
    const metadata = fs.lstatSync(required);
    if (!metadata.isFile() || metadata.isSymbolicLink()) fail(`Unsafe or missing workbench registration dependency: ${required}`);
  }
  const descriptor = JSON.parse(fs.readFileSync(descriptorPath, "utf8"));
  const bundle = JSON.parse(fs.readFileSync(bundlePath, "utf8"));
  if (descriptor.contractVersion !== "evavo_agent_workbench_mcp_v2") fail("Workbench MCP v2 descriptor contract mismatch.");
  if (descriptor.readOnly !== true || descriptor.truthBoundary?.grantsExecutionAuthority !== false || descriptor.truthBoundary?.grantsMutationAuthority !== false || descriptor.truthBoundary?.grantsPublicationAuthority !== false) fail("Workbench MCP v2 descriptor truth boundary is unsafe.");
  if (bundle.mcpV2 !== ".evavo/agent-workbench.mcp.v2.json" || bundle.entrypoints?.mcpV2 !== "scripts/agent-workbench-mcp-v2.mjs") fail("Workbench contract bundle does not bind MCP v2.");
  if (descriptor.repository !== bundle.repository || descriptor.authority !== bundle.authority) fail("Workbench MCP v2 descriptor/bundle identity mismatch.");
  return { descriptorPath, bundlePath, serverPath, descriptor, bundle };
}

export function planAgentWorkbenchMcpRegistration(root) {
  const repositoryRoot = path.resolve(root);
  const dependencies = validateRepository(repositoryRoot);
  const configPath = path.join(repositoryRoot, ".mcp.json");
  const metadata = fs.lstatSync(configPath);
  if (!metadata.isFile() || metadata.isSymbolicLink()) fail(".mcp.json must be a regular non-link file.");
  const beforeBytes = fs.readFileSync(configPath);
  const config = JSON.parse(beforeBytes.toString("utf8"));
  if (!record(config) || !record(config.mcpServers)) fail(".mcp.json must contain an object mcpServers map.");
  const previous = config.mcpServers[SERVER_NAME];
  const alreadyExact = exactEntry(previous);
  const next = alreadyExact ? config : {
    ...config,
    mcpServers: {
      ...config.mcpServers,
      [SERVER_NAME]: { command: SERVER_ENTRY.command, args: [...SERVER_ENTRY.args] },
    },
  };
  const afterText = canonical(next);
  return Object.freeze({
    contract: CONTRACT,
    repository: dependencies.bundle.repository,
    authority: dependencies.bundle.authority,
    configPath,
    serverName: SERVER_NAME,
    desiredEntry: SERVER_ENTRY,
    alreadyExact,
    changed: !alreadyExact,
    existingEntryPresent: previous !== undefined,
    existingEntryWasDifferent: previous !== undefined && !alreadyExact,
    beforeSha256: digest(beforeBytes),
    afterSha256: digest(Buffer.from(afterText, "utf8")),
    next,
    afterText,
    truthBoundary: Object.freeze({
      registrationExecutesMcpServer: false,
      registrationExecutesCandidateCommands: false,
      registrationGrantsExecutionAuthority: false,
      registrationGrantsMutationAuthority: false,
      registrationGrantsPublicationAuthority: false,
    }),
  });
}

export function applyAgentWorkbenchMcpRegistration(plan) {
  if (plan.contract !== CONTRACT) fail("Invalid registration plan contract.");
  if (!plan.changed) return { written: false, backupPath: null };
  const backupPath = `${plan.configPath}.bak-agent-workbench-v2`;
  const temporaryPath = `${plan.configPath}.tmp-agent-workbench-v2-${process.pid}`;
  fs.writeFileSync(backupPath, fs.readFileSync(plan.configPath), { flag: "w" });
  fs.writeFileSync(temporaryPath, plan.afterText, { flag: "wx" });
  fs.renameSync(temporaryPath, plan.configPath);
  return { written: true, backupPath };
}

function publicResult(plan, writeResult = null) {
  return {
    contract: CONTRACT,
    repository: plan.repository,
    authority: plan.authority,
    configPath: plan.configPath,
    serverName: plan.serverName,
    desiredEntry: plan.desiredEntry,
    alreadyExact: plan.alreadyExact,
    changed: plan.changed,
    existingEntryPresent: plan.existingEntryPresent,
    existingEntryWasDifferent: plan.existingEntryWasDifferent,
    beforeSha256: plan.beforeSha256,
    afterSha256: plan.afterSha256,
    writePerformed: writeResult?.written === true,
    backupPath: writeResult?.backupPath ?? null,
    truthBoundary: plan.truthBoundary,
  };
}

function selfTest() {
  const sample = { command: "node", args: ["./scripts/agent-workbench-mcp-v2.mjs"] };
  if (!exactEntry(sample)) fail("exact-entry self-test failed");
  if (exactEntry({ ...sample, env: {} })) fail("unexpected-field self-test failed");
  if (exactEntry({ command: "node", args: ["other.mjs"] })) fail("different-path self-test failed");
  process.stdout.write(`${JSON.stringify({ contract: "evavo_agent_workbench_mcp_registration_self_test_v1", status: "passed", assertions: 3 }, null, 2)}\n`);
}

function main() {
  const options = parse(process.argv.slice(2));
  if (options.selfTest) return selfTest();
  const root = path.resolve(options.root ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."));
  const plan = planAgentWorkbenchMcpRegistration(root);
  if (options.check && !plan.alreadyExact) {
    process.stdout.write(`${JSON.stringify(publicResult(plan), null, 2)}\n`);
    process.exitCode = 2;
    return;
  }
  const writeResult = options.write ? applyAgentWorkbenchMcpRegistration(plan) : null;
  const result = publicResult(plan, writeResult);
  if (options.write && writeResult?.written) {
    const recheck = planAgentWorkbenchMcpRegistration(root);
    if (!recheck.alreadyExact) fail("Workbench MCP v2 registration recheck failed after write.");
    result.recheckPassed = true;
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

const direct = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (direct) {
  try { main(); } catch (error) { console.error(error instanceof Error ? error.stack : String(error)); process.exitCode = 1; }
}
