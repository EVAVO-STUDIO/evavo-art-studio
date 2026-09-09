#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const CONFIG_CONTRACT = "evavo_agent_workbench_config_v1";
const SNAPSHOT_CONTRACT = "evavo_agent_workbench_snapshot_v1";
const GITHUB_CAPABILITY_EVIDENCE_CONTRACT = "evavo_github_repository_capability_evidence_v1";
const MAX_AUTO_ESTATE_BYTES = 25 * 1024 * 1024;
const MAX_AUTO_ESTATE_CANDIDATES = 100;
const TOKEN_PATTERN = /[\p{L}\p{N}][\p{L}\p{N}._:-]{1,}/gu;
const STOP_WORDS = new Set(["about", "and", "are", "can", "evavo", "for", "from", "have", "our", "repo", "repository", "that", "the", "this", "tool", "tools", "what", "which", "with"]);

const record = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : null;
const text = (value) => typeof value === "string" ? value.trim() : "";
const strings = (value) => Array.isArray(value) ? [...new Set(value.filter((item) => typeof item === "string").map((item) => item.trim()).filter(Boolean))] : [];
const digest = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");

function parseArguments(argv) {
  const options = { root: null, objective: "", limit: 20, all: false, compact: false, toolRegistry: null, estateSnapshot: null, selfTest: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--root") options.root = argv[++index] ?? null;
    else if (token === "--objective") options.objective = argv[++index] ?? "";
    else if (token === "--limit") options.limit = Number(argv[++index] ?? 20);
    else if (token === "--all") options.all = true;
    else if (token === "--compact") options.compact = true;
    else if (token === "--tool-registry") options.toolRegistry = argv[++index] ?? null;
    else if (token === "--estate-snapshot") options.estateSnapshot = argv[++index] ?? null;
    else if (token === "--self-test") options.selfTest = true;
    else if (token === "--help" || token === "-h") {
      process.stdout.write("Usage: node scripts/agent-workbench.mjs [--objective <text>] [--all] [--limit 1..200] [--tool-registry <json>] [--estate-snapshot <json>] [--root <dir>] [--compact] [--self-test]\n");
      process.exit(0);
    } else throw new Error(`Unknown argument: ${token}`);
  }
  if (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 200) throw new Error("--limit must be an integer from 1 to 200.");
  return options;
}

function readBytes(filePath, label = "JSON file") {
  const metadata = fs.lstatSync(filePath);
  if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error(`${label} must be a regular non-link file.`);
  return fs.readFileSync(filePath);
}

function readJson(filePath, label = "JSON file") {
  const bytes = readBytes(filePath, label);
  return { value: JSON.parse(bytes.toString("utf8")), evidence: Object.freeze({ path: filePath, sha256: digest(bytes), bytes: bytes.length }) };
}

function inside(root, relativePath, label) {
  if (!text(relativePath) || path.isAbsolute(relativePath)) throw new Error(`${label} must be repository-relative.`);
  const base = path.resolve(root);
  const resolved = path.resolve(base, relativePath);
  const relative = path.relative(base, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`${label} escapes the repository root.`);
  return resolved;
}

function broadObjective(objective) {
  return !objective.trim() || /\b(?:all|every|complete|everything|portfolio|estate|tools|capabilities|automation|automate)\b/iu.test(objective);
}

function queryTokens(objective) {
  return [...new Set((objective.toLowerCase().match(TOKEN_PATTERN) ?? []).filter((token) => token.length > 2 && !STOP_WORDS.has(token)))];
}

function rank(items, objective, all, limit, searchable) {
  const tokens = all || broadObjective(objective) ? [] : queryTokens(objective);
  const ranked = items.map((item) => {
    const haystack = searchable(item).toLowerCase();
    return { item, relevance: tokens.length ? tokens.reduce((score, token) => score + (haystack.includes(token) ? 1 : 0), 0) : 1 };
  }).filter(({ relevance }) => tokens.length === 0 || relevance > 0)
    .sort((left, right) => right.relevance - left.relevance || JSON.stringify(left.item).localeCompare(JSON.stringify(right.item)));
  return (all ? ranked : ranked.slice(0, limit)).map(({ item, relevance }) => Object.freeze({ ...item, relevance }));
}

function capabilitiesFrom(manifest) {
  if (!record(manifest) || manifest.contractVersion !== "evavo_repository_capabilities_v1" || !Array.isArray(manifest.capabilities)) throw new Error("Invalid standard capability manifest.");
  return manifest.capabilities.map((item) => {
    if (!record(item) || !text(item.id)) throw new Error("Capability id is required.");
    return Object.freeze({ id: text(item.id), title: text(item.title), description: text(item.description), interfaces: strings(item.interfaces), effects: strings(item.effects), entrypoints: strings(item.entrypoints), tags: strings(item.tags), requires: strings(item.requires) });
  });
}

function scriptsFrom(packageDocument) {
  const scripts = record(packageDocument)?.scripts;
  if (!record(scripts)) return [];
  return Object.entries(scripts).filter(([, command]) => typeof command === "string").map(([name, command]) => Object.freeze({ name, command: command.trim() })).sort((a, b) => a.name.localeCompare(b.name));
}

function toolsFrom(toolRegistry) {
  if (!toolRegistry) return [];
  if (!record(toolRegistry) || !Array.isArray(toolRegistry.tools)) throw new Error("Tool registry must contain a tools array.");
  return toolRegistry.tools.map((item) => {
    if (!record(item) || !text(item.id)) throw new Error("Tool registry id is required.");
    return Object.freeze({ id: text(item.id), repository: text(item.repository) || null, purpose: text(item.purpose), useWhen: strings(item.useWhen), entrypoints: strings(item.entrypoints), truthBoundary: text(item.truthBoundary), source: "development-tool-registry" });
  });
}

function mcpToolsFrom(document, repository) {
  const servers = record(document)?.mcpServers;
  if (!record(servers)) return [];
  return Object.entries(servers).filter(([, value]) => record(value)).map(([name, value]) => {
    const envKeys = Object.keys(record(value.env) ?? {}).sort();
    const argumentCount = Array.isArray(value.args) ? value.args.length : 0;
    const commandBaseName = text(value.command) ? path.basename(text(value.command)) : "";
    return Object.freeze({
      id: `mcp:${name}`,
      repository,
      purpose: `Registered MCP launch surface: ${name}`,
      useWhen: [],
      entrypoints: [name],
      truthBoundary: "Repository launch registration only; runtime readiness and effect authority require separate live protocol evidence.",
      source: "root-mcp-launch-manifest",
      runtimeReadiness: "unknown",
      commandBaseName,
      argumentCount,
      environmentKeys: envKeys,
    });
  }).sort((a, b) => a.id.localeCompare(b.id));
}

function readSanitizedMcp(filePath, repository) {
  const bytes = readBytes(filePath, "MCP launch manifest");
  const document = JSON.parse(bytes.toString("utf8"));
  const tools = mcpToolsFrom(document, repository);
  const sanitizedBytes = Buffer.from(JSON.stringify({ tools }, null, 2), "utf8");
  return {
    tools,
    evidence: Object.freeze({
      path: filePath,
      sha256: digest(sanitizedBytes),
      bytes: sanitizedBytes.length,
      sanitized: true,
      rawEnvironmentValuesRetained: false,
      rawArgumentValuesRetained: false,
    }),
  };
}

function mergeTools(...groups) {
  const byId = new Map();
  for (const group of groups) for (const item of group) if (!byId.has(item.id)) byId.set(item.id, item);
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function resolveToolRegistry({ repositoryRoot, config, explicitPath }) {
  if (explicitPath) return { path: path.resolve(explicitPath), origin: "explicit" };
  const configuredRegistry = text(config.defaultToolRegistry);
  if (configuredRegistry) return { path: inside(repositoryRoot, configuredRegistry, "default tool registry"), origin: "repository-config" };
  const sibling = path.resolve(repositoryRoot, "..", "evavo-development-studio", "config", "agent-tool-registry.json");
  if (fs.existsSync(sibling)) return { path: sibling, origin: "sibling-development-studio" };
  return { path: null, origin: "unavailable" };
}

function capabilityEvidenceDocument(snapshot) {
  if (!record(snapshot)) return null;
  if (snapshot.contract === GITHUB_CAPABILITY_EVIDENCE_CONTRACT && Array.isArray(snapshot.repositories)) return snapshot;
  const nested = record(snapshot.githubRepositoryCapabilities);
  if (nested?.contract === GITHUB_CAPABILITY_EVIDENCE_CONTRACT && Array.isArray(nested.repositories)) return nested;
  const legacy = record(snapshot.capabilities);
  if (Array.isArray(legacy?.repositories)) {
    return Object.freeze({
      contract: text(snapshot.contract) || text(snapshot.contractVersion) || "legacy-capability-estate",
      generatedAt: text(snapshot.generatedAt) || null,
      owner: text(snapshot.owner) || null,
      evidenceComplete: snapshot.evidenceComplete === true,
      repositories: legacy.repositories,
      counts: null,
    });
  }
  return null;
}

function resolveEstateSnapshot({ repositoryRoot, explicitPath }) {
  if (explicitPath) return { path: path.resolve(explicitPath), origin: "explicit" };
  const developmentRoot = path.resolve(repositoryRoot, "..", "evavo-development-studio");
  const auditRoot = path.join(developmentRoot, ".studio", "estate-audit");
  let auditMetadata;
  try { auditMetadata = fs.lstatSync(auditRoot); } catch { return { path: null, origin: "unavailable" }; }
  if (!auditMetadata.isDirectory() || auditMetadata.isSymbolicLink()) return { path: null, origin: "unavailable" };

  const candidates = [];
  for (const entry of fs.readdirSync(auditRoot, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".json")) continue;
    const filePath = path.join(auditRoot, entry.name);
    let metadata;
    try { metadata = fs.lstatSync(filePath); } catch { continue; }
    if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > MAX_AUTO_ESTATE_BYTES) continue;
    candidates.push({ path: filePath, mtimeMs: metadata.mtimeMs });
  }
  candidates.sort((left, right) => right.mtimeMs - left.mtimeMs || right.path.localeCompare(left.path));
  for (const candidate of candidates.slice(0, MAX_AUTO_ESTATE_CANDIDATES)) {
    try {
      const document = JSON.parse(fs.readFileSync(candidate.path, "utf8"));
      if (capabilityEvidenceDocument(document)) return { path: candidate.path, origin: "development-studio-latest-estate-audit" };
    } catch {
      // Ignore malformed or incomplete historical audit artifacts and continue to older candidates.
    }
  }
  return { path: null, origin: "unavailable" };
}

function estateCapabilitiesFrom(snapshot) {
  const evidence = capabilityEvidenceDocument(snapshot);
  if (!evidence) return [];
  const output = [];
  for (const item of evidence.repositories) {
    if (!record(item) || !text(item.repository)) continue;
    for (const id of strings(item.capabilityIds)) output.push(Object.freeze({
      id,
      repository: text(item.repository),
      authority: text(item.authority) || null,
      manifestStatus: text(item.manifestStatus) || "unknown",
      evidenceState: item.manifestStatus === "valid" ? "validated-standard-manifest" : "manifest-evidence",
      runtimeReadiness: "unknown",
    }));
  }
  return output.sort((a, b) => a.id.localeCompare(b.id) || a.repository.localeCompare(b.repository));
}

function estateSummary(snapshot) {
  if (!snapshot) return null;
  const evidence = capabilityEvidenceDocument(snapshot);
  if (!evidence) return null;
  const providerEstate = record(snapshot.githubRepositoryEstate) ?? record(snapshot.repositoryEstate);
  const repositories = Array.isArray(evidence.repositories) ? evidence.repositories : [];
  const counts = record(evidence.counts);
  const evidenceComplete = evidence.evidenceComplete === true;
  return Object.freeze({
    contract: text(evidence.contract) || text(snapshot.contract) || text(snapshot.contractVersion) || "unknown",
    generatedAt: text(evidence.generatedAt) || text(snapshot.generatedAt) || null,
    owner: text(evidence.owner) || text(snapshot.owner) || null,
    evidenceComplete,
    repositoryCount: Array.isArray(providerEstate?.repositories) ? providerEstate.repositories.length : Number.isInteger(counts?.repositoryCount) ? counts.repositoryCount : repositories.length,
    capabilityRepositoryCount: Number.isInteger(counts?.validManifestRepositoryCount) ? counts.validManifestRepositoryCount : repositories.filter((item) => item?.manifestStatus === "valid").length,
    declaredCapabilityCount: Number.isInteger(counts?.declaredCapabilityCount) ? counts.declaredCapabilityCount : repositories.reduce((total, item) => total + strings(item?.capabilityIds).length, 0),
    absenceClaimsAllowed: evidenceComplete,
  });
}

export function compileAgentWorkbench({ root, objective = "", limit = 20, all = false, toolRegistryPath = null, estateSnapshotPath = null } = {}) {
  const repositoryRoot = path.resolve(root ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."));
  const configRead = readJson(inside(repositoryRoot, ".evavo/agent-workbench.v1.json", "workbench config"), "workbench config");
  const config = record(configRead.value);
  if (!config || config.contractVersion !== CONFIG_CONTRACT || !text(config.repository) || !text(config.authority) || !Array.isArray(config.phases) || config.phases.length === 0) throw new Error(`Invalid ${CONFIG_CONTRACT}.`);
  const repository = text(config.repository);

  const capabilityRead = readJson(inside(repositoryRoot, text(config.capabilityManifest) || "evavo.capabilities.json", "capability manifest"), "capability manifest");
  if (text(capabilityRead.value.repository) !== repository) throw new Error("Capability manifest repository identity does not match workbench config.");
  const capabilities = capabilitiesFrom(capabilityRead.value);

  const packageRead = readJson(inside(repositoryRoot, text(config.packageManifest) || "package.json", "package manifest"), "package manifest");
  const scripts = scriptsFrom(packageRead.value);

  const registryResolution = resolveToolRegistry({ repositoryRoot, config, explicitPath: toolRegistryPath });
  const registryRead = registryResolution.path ? readJson(registryResolution.path, "tool registry") : null;
  const registryTools = toolsFrom(registryRead?.value ?? null);

  const mcpPath = path.join(repositoryRoot, ".mcp.json");
  const mcpRead = fs.existsSync(mcpPath) ? readSanitizedMcp(mcpPath, repository) : null;
  const mcpTools = mcpRead?.tools ?? [];
  const tools = mergeTools(registryTools, mcpTools);

  const estateResolution = resolveEstateSnapshot({ repositoryRoot, explicitPath: estateSnapshotPath });
  const estateRead = estateResolution.path ? readJson(estateResolution.path, "estate snapshot") : null;
  const estateDocument = estateRead?.value ?? null;
  const estateCapabilities = estateCapabilitiesFrom(estateDocument);
  const estate = estateSummary(estateDocument);
  const automation = record(config.automation) ?? {};

  return Object.freeze({
    contract: SNAPSHOT_CONTRACT,
    generatedAt: new Date().toISOString(),
    repository,
    authority: text(config.authority),
    role: text(config.role),
    objective,
    mode: all ? "complete-local-inventory" : broadObjective(objective) ? "broad-orientation" : "objective-ranked-orientation",
    sourceEvidence: Object.freeze({ workbenchConfig: configRead.evidence, capabilityManifest: capabilityRead.evidence, packageManifest: packageRead.evidence, ...(registryRead ? { toolRegistry: registryRead.evidence } : {}), ...(mcpRead ? { mcpLaunchManifest: mcpRead.evidence } : {}), ...(estateRead ? { estateSnapshot: estateRead.evidence } : {}) }),
    inventory: Object.freeze({ capabilityCount: capabilities.length, packageScriptCount: scripts.length, toolCount: tools.length, registeredToolCount: registryTools.length, mcpServerCount: mcpTools.length, estateCapabilityCount: estateCapabilities.length, estate }),
    discovery: Object.freeze({
      toolRegistryOrigin: registryResolution.origin,
      siblingDevelopmentStudioRegistryAutoDiscovered: registryResolution.origin === "sibling-development-studio",
      mcpLaunchManifestObserved: mcpRead !== null,
      mcpLaunchManifestSanitized: mcpRead !== null,
      estateSnapshotOrigin: estateResolution.origin,
      developmentEstateAuditAutoDiscovered: estateResolution.origin === "development-studio-latest-estate-audit",
      estateEvidenceComplete: estate?.evidenceComplete === true,
    }),
    orientation: Object.freeze({ readFirst: strings(config.readFirst), phases: config.phases.filter(record).map((item) => Object.freeze({ id: text(item.id), purpose: text(item.purpose), evidence: strings(item.evidence) })), handoffs: Array.isArray(config.handoffs) ? config.handoffs.filter(record) : [] }),
    matches: Object.freeze({
      capabilities: rank(capabilities, objective, all, limit, (item) => [item.id, item.title, item.description, ...item.interfaces, ...item.effects, ...item.entrypoints, ...item.tags, ...item.requires].join(" ")),
      scripts: rank(scripts, objective, all, limit, (item) => `${item.name} ${item.command}`),
      tools: rank(tools, objective, all, limit, (item) => [item.id, item.repository ?? "", item.purpose, ...item.useWhen, ...item.entrypoints, item.truthBoundary, item.commandBaseName ?? "", ...(item.environmentKeys ?? [])].join(" ")),
      estateCapabilities: rank(estateCapabilities, objective, all, limit, (item) => `${item.id} ${item.repository} ${item.authority ?? ""} ${item.manifestStatus}`),
    }),
    automation: Object.freeze({ safeWithoutApproval: strings(automation.safeWithoutApproval), gated: strings(automation.gated), neverImplied: strings(automation.neverImplied) }),
    policy: Object.freeze({
      readOnlyCompiler: true,
      commandExecutionPerformed: false,
      mutationPerformed: false,
      sourceCapabilityDoesNotImplyRuntimeReadiness: true,
      routeDoesNotAuthorizeEffects: true,
      planDoesNotProveExecution: true,
      incompleteEstateCannotProveAbsence: estate?.evidenceComplete !== true,
      publicationRequiresSeparateAuthority: true,
      mcpRegistrationDoesNotImplyRuntimeReadiness: true,
      mcpEnvironmentValuesRetained: false,
      mcpArgumentValuesRetained: false,
      estateAutoDiscoveryRunsProviderQueries: false,
    }),
  });
}

function selfTest() {
  const ranked = rank([{ id: "art.alpha" }, { id: "dev.publish" }], "repair alpha", false, 5, (item) => item.id);
  if (ranked[0]?.id !== "art.alpha") throw new Error("ranking self-test failed");
  const legacyEstate = estateCapabilitiesFrom({ capabilities: { repositories: [{ repository: "EVAVO-STUDIO/art", authority: "art", manifestStatus: "valid", capabilityIds: ["art.alpha"] }] } });
  if (legacyEstate[0]?.runtimeReadiness !== "unknown" || legacyEstate[0]?.evidenceState !== "validated-standard-manifest") throw new Error("legacy estate self-test failed");
  const providerEvidence = {
    contract: GITHUB_CAPABILITY_EVIDENCE_CONTRACT,
    generatedAt: new Date(0).toISOString(),
    owner: "EVAVO-STUDIO",
    evidenceComplete: true,
    counts: { repositoryCount: 1, validManifestRepositoryCount: 1, declaredCapabilityCount: 1 },
    repositories: [{ repository: "EVAVO-STUDIO/dev", authority: "development-studio", manifestStatus: "valid", capabilityIds: ["dev.alpha"] }],
  };
  const providerEstate = estateCapabilitiesFrom(providerEvidence);
  const providerSummary = estateSummary(providerEvidence);
  if (providerEstate[0]?.id !== "dev.alpha" || providerEstate[0]?.runtimeReadiness !== "unknown") throw new Error("provider estate self-test failed");
  if (providerSummary?.evidenceComplete !== true || providerSummary?.absenceClaimsAllowed !== true || providerSummary?.declaredCapabilityCount !== 1) throw new Error("provider estate summary self-test failed");
  if (!broadObjective("all tools") || broadObjective("repair alpha sprite")) throw new Error("objective self-test failed");
  if (strings(["a", "a", " b "]).join(",") !== "a,b") throw new Error("normalization self-test failed");
  const mcpTools = mcpToolsFrom({ mcpServers: { "secret-test": { command: "node", args: ["server.mjs", "--token", "secret-value"], env: { API_TOKEN: "secret", MODE: "read-only" } } } }, "EVAVO-STUDIO/test");
  if (mcpTools[0]?.id !== "mcp:secret-test" || mcpTools[0]?.runtimeReadiness !== "unknown") throw new Error("MCP inventory self-test failed");
  const mcpSerialized = JSON.stringify(mcpTools);
  if (mcpSerialized.includes("secret-value") || mcpSerialized.includes('"secret"')) throw new Error("MCP redaction self-test failed");
  if (!mcpTools[0]?.environmentKeys.includes("API_TOKEN") || mcpTools[0]?.argumentCount !== 3) throw new Error("MCP shape self-test failed");
  process.stdout.write(`${JSON.stringify({ contract: "evavo_agent_workbench_self_test_v2", status: "passed", assertions: 12 }, null, 2)}\n`);
}

async function cli() {
  const options = parseArguments(process.argv.slice(2));
  if (options.selfTest) return selfTest();
  const result = compileAgentWorkbench({ ...(options.root ? { root: options.root } : {}), objective: options.objective, limit: options.limit, all: options.all, ...(options.toolRegistry ? { toolRegistryPath: options.toolRegistry } : {}), ...(options.estateSnapshot ? { estateSnapshotPath: options.estateSnapshot } : {}) });
  process.stdout.write(`${JSON.stringify(result, null, options.compact ? 0 : 2)}\n`);
}

const direct = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (direct) cli().catch((error) => { console.error(error instanceof Error ? error.stack : String(error)); process.exitCode = 1; });
