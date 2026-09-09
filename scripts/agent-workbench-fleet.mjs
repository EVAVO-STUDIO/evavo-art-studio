#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { compileAgentWorkbench } from "./agent-workbench.mjs";

const CONTRACT = "evavo_agent_workbench_fleet_snapshot_v1";
const record = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : null;
const text = (value) => typeof value === "string" ? value.trim() : "";
const strings = (value) => Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
const uniqueStrings = (values) => [...new Set(values.filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim()))].sort();
const fail = (message) => { throw new Error(message); };

function parse(argv) {
  const options = { workspaceRoot: null, objective: "", limit: 50, perRepositoryLimit: 20, repositoryLimit: 256, estateSnapshot: null, compact: false, selfTest: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--workspace-root") options.workspaceRoot = argv[++index] ?? null;
    else if (token === "--objective") options.objective = argv[++index] ?? "";
    else if (token === "--limit") options.limit = Number(argv[++index] ?? 50);
    else if (token === "--per-repository-limit") options.perRepositoryLimit = Number(argv[++index] ?? 20);
    else if (token === "--repository-limit") options.repositoryLimit = Number(argv[++index] ?? 256);
    else if (token === "--estate-snapshot") options.estateSnapshot = argv[++index] ?? null;
    else if (token === "--compact") options.compact = true;
    else if (token === "--self-test") options.selfTest = true;
    else fail(`Unknown argument: ${token}`);
  }
  for (const [key, value, maximum] of [["limit", options.limit, 200], ["perRepositoryLimit", options.perRepositoryLimit, 100], ["repositoryLimit", options.repositoryLimit, 512]]) {
    if (!Number.isInteger(value) || value < 1 || value > maximum) fail(`${key} must be an integer from 1 to ${maximum}.`);
  }
  return options;
}

function safeDirectory(directory, label) {
  const resolved = path.resolve(directory);
  const metadata = fs.lstatSync(resolved);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) fail(`${label} must be a regular non-link directory.`);
  return resolved;
}

function isWorkbenchRoot(directory) {
  const configPath = path.join(directory, ".evavo", "agent-workbench.v1.json");
  try {
    const metadata = fs.lstatSync(configPath);
    return metadata.isFile() && !metadata.isSymbolicLink();
  } catch {
    return false;
  }
}

function discoverRoots(workspaceRoot, repositoryLimit) {
  const roots = [];
  for (const entry of fs.readdirSync(workspaceRoot, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (roots.length >= repositoryLimit) break;
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    const candidate = path.join(workspaceRoot, entry.name);
    let metadata;
    try { metadata = fs.lstatSync(candidate); } catch { continue; }
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) continue;
    if (isWorkbenchRoot(candidate)) roots.push(candidate);
  }
  if (isWorkbenchRoot(workspaceRoot)) roots.unshift(workspaceRoot);
  return [...new Set(roots)].slice(0, repositoryLimit);
}

function routePriority(type, item) {
  if (type === "capability") return 5;
  if (type === "tool" && item.source === "development-tool-registry") return 4;
  if (type === "estate-capability") return 3;
  if (type === "tool" && item.source === "root-mcp-launch-manifest") return 2;
  if (type === "tool") return 3;
  if (type === "script") return 1;
  return 0;
}

function routeId(type, item) {
  return type === "script" ? text(item.name) : text(item.id);
}

function routeOwner(type, item, snapshot) {
  if (type === "estate-capability") return text(item.repository) || snapshot.repository;
  if (type === "tool") return text(item.repository) || snapshot.repository;
  return snapshot.repository;
}

function routeAuthority(type, item, snapshot, owner) {
  const declared = text(item.authority);
  if (declared) return declared;
  if (owner === snapshot.repository) return snapshot.authority;
  if (owner === "EVAVO-STUDIO/evavo-development-studio") return "development-studio";
  return "unknown";
}

function routesFromSnapshot(snapshot) {
  const output = [];
  for (const [type, items] of Object.entries({ capability: snapshot.matches.capabilities, tool: snapshot.matches.tools, "estate-capability": snapshot.matches.estateCapabilities, script: snapshot.matches.scripts })) {
    for (const item of Array.isArray(items) ? items : []) {
      if (!record(item) || !routeId(type, item)) continue;
      const owner = routeOwner(type, item, snapshot);
      output.push(Object.freeze({
        type,
        id: routeId(type, item),
        repository: owner,
        authority: routeAuthority(type, item, snapshot, owner),
        observedFromRepository: snapshot.repository,
        relevance: Number.isFinite(item.relevance) ? item.relevance : 0,
        priority: routePriority(type, item),
        source: text(item.source) || (type === "capability" ? "repository-capability-manifest" : type),
        effects: strings(item.effects),
        requires: strings(item.requires),
        runtimeReadiness: text(item.runtimeReadiness) || null,
      }));
    }
  }
  return output;
}

function routeKey(route) {
  return `${route.type}\u0000${route.repository}\u0000${route.id}`;
}

function compareRoutes(a, b) {
  return b.priority - a.priority
    || b.relevance - a.relevance
    || a.source.localeCompare(b.source)
    || a.repository.localeCompare(b.repository)
    || a.id.localeCompare(b.id)
    || a.observedFromRepository.localeCompare(b.observedFromRepository);
}

function deduplicateRoutes(routes) {
  const groups = new Map();
  for (const route of routes) {
    const key = routeKey(route);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(route);
  }
  const output = [];
  for (const group of groups.values()) {
    const ordered = [...group].sort(compareRoutes);
    const winner = ordered[0];
    const effects = uniqueStrings(ordered.flatMap((route) => route.effects));
    const requires = uniqueStrings(ordered.flatMap((route) => route.requires));
    const observedFromRepositories = uniqueStrings(ordered.map((route) => route.observedFromRepository));
    output.push(Object.freeze({
      ...winner,
      effects,
      requires,
      observedFromRepositories,
    }));
  }
  return output.sort(compareRoutes);
}

function publicRoute(route) {
  const { priority, observedFromRepository, ...output } = route;
  return Object.freeze(output);
}

export function compileAgentWorkbenchFleet({ workspaceRoot, objective = "", limit = 50, perRepositoryLimit = 20, repositoryLimit = 256, estateSnapshotPath = null } = {}) {
  const resolvedRoot = safeDirectory(workspaceRoot, "workspaceRoot");
  const roots = discoverRoots(resolvedRoot, repositoryLimit);
  const repositories = [];
  const errors = [];
  const rawRoutes = [];
  for (const root of roots) {
    try {
      const snapshot = compileAgentWorkbench({ root, objective, limit: perRepositoryLimit, ...(estateSnapshotPath ? { estateSnapshotPath } : {}) });
      repositories.push(Object.freeze({
        repository: snapshot.repository,
        authority: snapshot.authority,
        role: snapshot.role,
        mode: snapshot.mode,
        inventory: snapshot.inventory,
        discovery: snapshot.discovery,
        policy: Object.freeze({
          sourceCapabilityDoesNotImplyRuntimeReadiness: snapshot.policy.sourceCapabilityDoesNotImplyRuntimeReadiness,
          mcpRegistrationDoesNotImplyRuntimeReadiness: snapshot.policy.mcpRegistrationDoesNotImplyRuntimeReadiness,
          mcpEnvironmentValuesRetained: snapshot.policy.mcpEnvironmentValuesRetained,
          mcpArgumentValuesRetained: snapshot.policy.mcpArgumentValuesRetained,
          incompleteEstateCannotProveAbsence: snapshot.policy.incompleteEstateCannotProveAbsence,
          estateAutoDiscoveryRunsProviderQueries: snapshot.policy.estateAutoDiscoveryRunsProviderQueries,
        }),
      }));
      rawRoutes.push(...routesFromSnapshot(snapshot));
    } catch (error) {
      errors.push(Object.freeze({ directoryName: path.basename(root), error: error instanceof Error ? error.message.slice(0, 1000) : String(error).slice(0, 1000) }));
    }
  }
  rawRoutes.sort(compareRoutes);
  const routes = deduplicateRoutes(rawRoutes);
  const bestRoutes = routes.slice(0, limit).map(publicRoute);
  return Object.freeze({
    contract: CONTRACT,
    generatedAt: new Date().toISOString(),
    objective,
    scope: "local-workbench-enabled-siblings",
    workspaceRoot: resolvedRoot,
    counts: Object.freeze({
      repositoryRootsObserved: roots.length,
      repositoriesCompiled: repositories.length,
      compileErrors: errors.length,
      routeCandidatesRaw: rawRoutes.length,
      routeCandidates: routes.length,
      duplicateRoutesCollapsed: rawRoutes.length - routes.length,
      bestRoutes: bestRoutes.length,
    }),
    repositories: Object.freeze(repositories),
    bestRoutes: Object.freeze(bestRoutes),
    errors: Object.freeze(errors),
    policy: Object.freeze({
      readOnlyCompiler: true,
      commandExecutionPerformed: false,
      mutationPerformed: false,
      localSiblingDiscoveryOnly: true,
      providerEstateCompletenessClaimed: false,
      absenceClaimsAllowed: false,
      canonicalRouteOwnershipApplied: true,
      duplicateRoutesCollapsed: true,
      mcpRegistrationDoesNotImplyRuntimeReadiness: true,
      rawMcpEnvironmentValuesRetained: false,
      rawMcpArgumentValuesRetained: false,
    }),
  });
}

function selfTest() {
  const semantic = routePriority("tool", { source: "development-tool-registry" });
  const launcher = routePriority("tool", { source: "root-mcp-launch-manifest" });
  if (!(semantic > launcher) || routePriority("capability", {}) <= semantic) fail("fleet priority self-test failed");
  const snapshot = { repository: "EVAVO-STUDIO/brain", authority: "brain", matches: { capabilities: [], tools: [], scripts: [], estateCapabilities: [{ id: "art.test", repository: "EVAVO-STUDIO/art", authority: "art-studio", relevance: 1, runtimeReadiness: "unknown" }] } };
  const route = routesFromSnapshot(snapshot)[0];
  if (route.repository !== "EVAVO-STUDIO/art" || route.authority !== "art-studio") fail("fleet canonical ownership self-test failed");
  const duplicate = deduplicateRoutes([route, { ...route, observedFromRepository: "EVAVO-STUDIO/dev" }]);
  if (duplicate.length !== 1 || duplicate[0].observedFromRepositories.length !== 2) fail("fleet deduplication self-test failed");
  process.stdout.write(`${JSON.stringify({ contract: "evavo_agent_workbench_fleet_self_test_v2", status: "passed", assertions: 4 }, null, 2)}\n`);
}

function main() {
  const options = parse(process.argv.slice(2));
  if (options.selfTest) return selfTest();
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const workspaceRoot = options.workspaceRoot ? path.resolve(options.workspaceRoot) : path.dirname(repositoryRoot);
  const result = compileAgentWorkbenchFleet({ workspaceRoot, objective: options.objective, limit: options.limit, perRepositoryLimit: options.perRepositoryLimit, repositoryLimit: options.repositoryLimit, ...(options.estateSnapshot ? { estateSnapshotPath: path.resolve(options.estateSnapshot) } : {}) });
  process.stdout.write(`${JSON.stringify(result, null, options.compact ? 0 : 2)}\n`);
}

const direct = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (direct) {
  try { main(); } catch (error) { console.error(error instanceof Error ? error.stack : String(error)); process.exitCode = 1; }
}
