#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { inspectAgentWorkbench } from "./agent-workbench-doctor.mjs";

const CONTRACT = "evavo_agent_workbench_health_fleet_v1";
const CONFIG_RELATIVE = ".evavo/agent-workbench.v1.json";
const CORE_REPOSITORIES = Object.freeze(["EVAVO-STUDIO/the-brain", "EVAVO-STUDIO/evavo-development-studio", "EVAVO-STUDIO/evavo-art-studio"]);
const fail = (message) => { throw new Error(message); };
const record = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : null;
function regularFile(filePath) { try { const metadata = fs.lstatSync(filePath); return metadata.isFile() && !metadata.isSymbolicLink(); } catch { return false; } }
function regularDirectory(directoryPath) { try { const metadata = fs.lstatSync(directoryPath); return metadata.isDirectory() && !metadata.isSymbolicLink(); } catch { return false; } }
function repositoryIdentity(root) { const configPath = path.join(root, CONFIG_RELATIVE); if (!regularFile(configPath)) return null; try { const config = JSON.parse(fs.readFileSync(configPath, "utf8")); if (!record(config) || config.contractVersion !== "evavo_agent_workbench_config_v1" || typeof config.repository !== "string" || !config.repository) return null; return { repository: config.repository, authority: typeof config.authority === "string" && config.authority ? config.authority : "unknown" }; } catch { return null; } }
function discoverWorkbenchRoots(workspaceRoot) { if (!regularDirectory(workspaceRoot)) return []; const results = []; for (const entry of fs.readdirSync(workspaceRoot, { withFileTypes: true })) { if (!entry.isDirectory() || entry.isSymbolicLink()) continue; const root = path.join(workspaceRoot, entry.name); const identity = repositoryIdentity(root); if (identity) results.push({ root, directoryName: entry.name, ...identity }); } return results.sort((a, b) => a.repository.localeCompare(b.repository) || a.directoryName.localeCompare(b.directoryName)); }
function compactHealth(identity, health) { return { repository: identity.repository, authority: identity.authority, directoryName: identity.directoryName, status: health.status, registrationState: health.registration?.state ?? "unknown", protocolToolCount: health.protocol?.toolCount ?? null, artifactCount: health.artifactCount ?? null, sharedDriftStatus: health.sharedDrift?.status ?? "unknown", sharedDriftMismatchCount: health.sharedDrift?.mismatchCount ?? null, findingCodes: Array.isArray(health.findings) ? health.findings.map((item) => item?.code).filter((value) => typeof value === "string").sort() : [] }; }
export function inspectAgentWorkbenchHealthFleet(root, options = {}) {
  const repositoryRoot = path.resolve(root);
  const currentIdentity = repositoryIdentity(repositoryRoot);
  if (!currentIdentity) fail("Current repository does not have a valid EVAVO Workbench config.");
  const workspaceRoot = path.resolve(options.workspaceRoot ?? path.dirname(repositoryRoot));
  if (!regularDirectory(workspaceRoot)) fail("workspaceRoot must be a regular non-link directory.");
  const inspectRepository = typeof options.inspectRepository === "function" ? options.inspectRepository : inspectAgentWorkbench;
  const repositories = [];
  for (const identity of discoverWorkbenchRoots(workspaceRoot)) {
    try {
      const health = inspectRepository(identity.root, { workspaceRoot });
      if (!record(health) || health.contract !== "evavo_agent_workbench_doctor_v1") throw new Error("doctor contract mismatch");
      repositories.push(compactHealth(identity, health));
    } catch (error) {
      repositories.push({ repository: identity.repository, authority: identity.authority, directoryName: identity.directoryName, status: "error", registrationState: "unknown", protocolToolCount: null, artifactCount: null, sharedDriftStatus: "unknown", sharedDriftMismatchCount: null, findingCodes: ["workbench-health-inspection-failed"], error: error instanceof Error ? error.message : String(error) });
    }
  }
  const observedCoreRepositories = CORE_REPOSITORIES.filter((repository) => repositories.some((item) => item.repository === repository));
  const missingCoreRepositories = CORE_REPOSITORIES.filter((repository) => !observedCoreRepositories.includes(repository));
  const attention = repositories.filter((item) => item.status !== "ready");
  const status = attention.length > 0 ? "attention-required" : missingCoreRepositories.length > 0 ? "partial" : "ready";
  return {
    contract: CONTRACT,
    generatedAt: new Date().toISOString(),
    repository: currentIdentity.repository,
    authority: currentIdentity.authority,
    status,
    workspace: { scope: "workspace-root-direct-children", observedWorkbenchRepositoryCount: repositories.length, providerCompletenessClaimed: false, absenceClaimsAllowed: false },
    coreCoverage: { expectedRepositories: [...CORE_REPOSITORIES], observedRepositories: observedCoreRepositories, missingRepositories: missingCoreRepositories, complete: missingCoreRepositories.length === 0 },
    summary: { ready: repositories.filter((item) => item.status === "ready").length, attentionRequired: attention.length, registrationAttention: repositories.filter((item) => item.registrationState !== "registered").length, sharedDriftAttention: repositories.filter((item) => item.sharedDriftStatus === "drifted").length, inspectionErrors: repositories.filter((item) => item.status === "error").length },
    repositories,
    policy: { readOnly: true, providerQueriesPerformed: false, mutationPerformed: false, automaticRepairPerformed: false, localCoverageDoesNotProveProviderAbsence: true, partialCoreCoverageIsNotReportedReady: true, perRepositoryDoctorRemainsAuthorityForRepairDetails: true }
  };
}
function parse(argv) { const options = { root: null, workspaceRoot: null, selfTest: false }; for (let index = 0; index < argv.length; index += 1) { const token = argv[index]; if (token === "--root") options.root = argv[++index] ?? null; else if (token === "--workspace-root") options.workspaceRoot = argv[++index] ?? null; else if (token === "--self-test") options.selfTest = true; else fail(`Unknown argument: ${token}`); } return options; }
function selfTest() { const assertions = [CORE_REPOSITORIES.length === 3, new Set(CORE_REPOSITORIES).size === CORE_REPOSITORIES.length, CORE_REPOSITORIES.includes("EVAVO-STUDIO/the-brain"), CORE_REPOSITORIES.includes("EVAVO-STUDIO/evavo-development-studio"), CORE_REPOSITORIES.includes("EVAVO-STUDIO/evavo-art-studio"), CONTRACT === "evavo_agent_workbench_health_fleet_v1"]; if (assertions.some((value) => value !== true)) fail("health-fleet self-test failed"); process.stdout.write(`${JSON.stringify({ contract: "evavo_agent_workbench_health_fleet_self_test_v1", status: "passed", assertions: assertions.length }, null, 2)}\n`); }
function main() { const options = parse(process.argv.slice(2)); if (options.selfTest) return selfTest(); const root = path.resolve(options.root ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")); const result = inspectAgentWorkbenchHealthFleet(root, { workspaceRoot: options.workspaceRoot }); process.stdout.write(`${JSON.stringify(result, null, 2)}\n`); if (result.status === "attention-required") process.exitCode = 2; }
const direct = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url); if (direct) { try { main(); } catch (error) { console.error(error instanceof Error ? error.stack : String(error)); process.exitCode = 1; } }
