#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { planAgentWorkbenchMcpRegistration, applyAgentWorkbenchMcpRegistration } from "./agent-workbench-mcp-registration.mjs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "evavo-wbreg-"));
fs.mkdirSync(path.join(root, ".evavo"), { recursive: true });
fs.mkdirSync(path.join(root, "scripts"), { recursive: true });
fs.writeFileSync(path.join(root, "scripts", "agent-workbench-mcp-v2.mjs"), "// test\n");
fs.writeFileSync(path.join(root, ".evavo", "agent-workbench.mcp.v2.json"), JSON.stringify({ contractVersion: "evavo_agent_workbench_mcp_v2", repository: "EVAVO-STUDIO/test", authority: "test", readOnly: true, truthBoundary: { grantsExecutionAuthority: false, grantsMutationAuthority: false, grantsPublicationAuthority: false } }));
fs.writeFileSync(path.join(root, ".evavo", "agent-workbench.contracts.v1.json"), JSON.stringify({ repository: "EVAVO-STUDIO/test", authority: "test", mcpV2: ".evavo/agent-workbench.mcp.v2.json", entrypoints: { mcpV2: "scripts/agent-workbench-mcp-v2.mjs" } }));
fs.writeFileSync(path.join(root, ".mcp.json"), JSON.stringify({ mcpServers: { existing: { command: "existing", args: [] } }, extra: { preserved: true } }, null, 2));
const plan = planAgentWorkbenchMcpRegistration(root);
if (!plan.changed || plan.existingEntryPresent) throw new Error("initial plan failed");
const applied = applyAgentWorkbenchMcpRegistration(plan);
if (!applied.written) throw new Error("write failed");
const after = JSON.parse(fs.readFileSync(path.join(root, ".mcp.json"), "utf8"));
if (after.mcpServers.existing.command !== "existing" || after.extra.preserved !== true) throw new Error("existing config not preserved");
if (after.mcpServers["evavo-agent-workbench-v2"].args[0] !== "./scripts/agent-workbench-mcp-v2.mjs") throw new Error("registration missing");
const second = planAgentWorkbenchMcpRegistration(root);
if (!second.alreadyExact || second.changed) throw new Error("idempotence failed");
console.log(JSON.stringify({ contract: "evavo_agent_workbench_mcp_registration_test_v1", status: "passed", assertions: 6 }, null, 2));
