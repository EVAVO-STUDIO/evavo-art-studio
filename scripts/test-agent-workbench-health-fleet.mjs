#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { inspectAgentWorkbenchHealthFleet } from "./agent-workbench-health-fleet.mjs";
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "evavo-wbhealth-fleet-"));
const repositories = [["brain", "EVAVO-STUDIO/the-brain", "the-brain"], ["dev", "EVAVO-STUDIO/evavo-development-studio", "development-studio"], ["art", "EVAVO-STUDIO/evavo-art-studio", "art-studio"]];
for (const [directoryName, repository, authority] of repositories) { const root = path.join(workspace, directoryName); fs.mkdirSync(path.join(root, ".evavo"), { recursive: true }); fs.writeFileSync(path.join(root, ".evavo", "agent-workbench.v1.json"), JSON.stringify({ contractVersion: "evavo_agent_workbench_config_v1", repository, authority })); }
const statusByRepository = new Map();
const inspector = (root) => { const config = JSON.parse(fs.readFileSync(path.join(root, ".evavo", "agent-workbench.v1.json"), "utf8")); const status = statusByRepository.get(config.repository) ?? "ready"; if (status === "throw") throw new Error("synthetic inspection failure"); return { contract: "evavo_agent_workbench_doctor_v1", status, registration: { state: status === "ready" ? "registered" : "missing" }, protocol: { toolCount: 7 }, artifactCount: 28, sharedDrift: { status: status === "ready" ? "aligned" : "drifted", mismatchCount: status === "ready" ? 0 : 1 }, findings: status === "ready" ? [] : [{ code: "synthetic-health-finding" }] }; };
let result = inspectAgentWorkbenchHealthFleet(path.join(workspace, "brain"), { workspaceRoot: workspace, inspectRepository: inspector });
if (result.status !== "ready" || result.coreCoverage.complete !== true || result.repositories.length !== 3) throw new Error("complete healthy core was not reported ready");
if (result.summary.ready !== 3 || result.summary.attentionRequired !== 0 || result.policy.mutationPerformed !== false) throw new Error("healthy summary/truth boundary mismatch");
fs.rmSync(path.join(workspace, "art"), { recursive: true, force: true });
result = inspectAgentWorkbenchHealthFleet(path.join(workspace, "brain"), { workspaceRoot: workspace, inspectRepository: inspector });
if (result.status !== "partial" || result.coreCoverage.complete !== false || !result.coreCoverage.missingRepositories.includes("EVAVO-STUDIO/evavo-art-studio")) throw new Error("partial core coverage was not reported partial");
if (result.workspace.absenceClaimsAllowed !== false || result.policy.localCoverageDoesNotProveProviderAbsence !== true) throw new Error("partial coverage truth boundary mismatch");
fs.mkdirSync(path.join(workspace, "art", ".evavo"), { recursive: true }); fs.writeFileSync(path.join(workspace, "art", ".evavo", "agent-workbench.v1.json"), JSON.stringify({ contractVersion: "evavo_agent_workbench_config_v1", repository: "EVAVO-STUDIO/evavo-art-studio", authority: "art-studio" }));
statusByRepository.set("EVAVO-STUDIO/evavo-development-studio", "repair-required");
result = inspectAgentWorkbenchHealthFleet(path.join(workspace, "brain"), { workspaceRoot: workspace, inspectRepository: inspector });
if (result.status !== "attention-required" || result.summary.attentionRequired !== 1 || result.summary.registrationAttention !== 1 || result.summary.sharedDriftAttention !== 1) throw new Error("repair-required repository did not fail aggregate health");
statusByRepository.set("EVAVO-STUDIO/evavo-development-studio", "ready"); statusByRepository.set("EVAVO-STUDIO/evavo-art-studio", "throw");
result = inspectAgentWorkbenchHealthFleet(path.join(workspace, "brain"), { workspaceRoot: workspace, inspectRepository: inspector });
if (result.status !== "attention-required" || result.summary.inspectionErrors !== 1 || !result.repositories.some((item) => item.repository === "EVAVO-STUDIO/evavo-art-studio" && item.findingCodes.includes("workbench-health-inspection-failed"))) throw new Error("inspection error was not surfaced");
fs.rmSync(workspace, { recursive: true, force: true });
console.log(JSON.stringify({ contract: "evavo_agent_workbench_health_fleet_test_v1", status: "passed", assertions: 10 }, null, 2));
