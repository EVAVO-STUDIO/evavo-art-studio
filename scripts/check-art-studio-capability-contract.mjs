#!/usr/bin/env node
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(HERE), "..");
const INTERFACES = new Set(["api","automation","cli","desktop","game","library","mcp","mobile","openapi","testing","ui","web-app"]);
const EFFECTS = new Set(["read","compute","network","write","execute","publish","financial"]);
const REQUIRED_IDS = ["art.source.review","art.project.workspace","art.project.mastering","art.project.review","art.pixel-font.build","art.delivery.optimize","art.provider.plan","art.provider.execute","art.mcp.review","art.mcp.production","art.book.direction","art.validation.execute"];
const REQUIRED_FILES = ["evavo.capabilities.json","schemas/evavo.repository-capabilities.schema.json","config/automation-fabric-client-v2.json","scripts/check-art-studio-capability-contract.mjs","scripts/test-art-studio-capability-contract.mjs","docs/CAPABILITY_DISCOVERY_AND_AUTOMATION_FABRIC.md",".github/workflows/art-studio-capability-contract.yml"];
const fail = (condition, message) => { if (!condition) throw new Error(message); };
const record = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const unique = (values) => new Set(values).size === values.length;
const text = (value, maximum = 1200) => typeof value === "string" && value.length > 0 && value.length <= maximum;
const exact = (value, keys, label) => {
  fail(record(value), `${label} must be an object.`);
  for (const key of Object.keys(value)) fail(keys.includes(key), `${label} contains unknown field ${key}.`);
};
const strings = (value, label, maximumItems = 100, maximumLength = 500, required = false) => {
  fail(Array.isArray(value), `${label} must be an array.`);
  fail(value.length <= maximumItems && (!required || value.length > 0), `${label} has invalid length.`);
  fail(value.every((item) => text(item, maximumLength)), `${label} contains an invalid string.`);
  fail(unique(value), `${label} contains duplicates.`);
  return value;
};
const version = (value) => {
  const match = /^(\d+)\.(\d+)\.(\d+)$/u.exec(String(value));
  fail(Boolean(match), `Invalid semantic version: ${value}`);
  return match.slice(1).map(Number);
};
const atLeast = (value, minimum) => {
  const left = version(value); const right = version(minimum);
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] > right[index];
  }
  return true;
};

export function validateCapabilityManifest(manifest, schema, packageJson) {
  fail(record(schema), "Capability schema must be an object.");
  fail(schema.$id === "https://schemas.evavo.local/evavo.repository-capabilities.schema.json", "Capability schema identity drifted.");
  fail(schema.properties?.contractVersion?.const === "evavo_repository_capabilities_v1", "Capability schema contract version drifted.");
  fail(schema.additionalProperties === false, "Capability schema must fail closed on unknown fields.");

  const top = ["$schema","contractVersion","repository","authority","summary","capabilities","brain","reviewedAt"];
  exact(manifest, top, "Capability manifest");
  for (const key of top) fail(Object.hasOwn(manifest, key), `Capability manifest is missing ${key}.`);
  fail(manifest.$schema === "./schemas/evavo.repository-capabilities.schema.json", "Capability manifest schema path is not canonical.");
  fail(manifest.contractVersion === "evavo_repository_capabilities_v1", "Capability manifest contract version is invalid.");
  fail(manifest.repository === "EVAVO-STUDIO/evavo-art-studio", "Capability manifest repository identity is invalid.");
  fail(manifest.authority === "art-studio", "Capability manifest authority is invalid.");
  fail(text(manifest.summary), "Capability manifest summary is invalid.");
  fail(Array.isArray(manifest.capabilities) && manifest.capabilities.length > 0 && manifest.capabilities.length <= 200, "Capability manifest capabilities are invalid.");
  fail(unique(manifest.capabilities.map((item) => item?.id)), "Capability IDs must be unique.");
  fail(record(packageJson?.scripts), "package.json scripts are unavailable.");

  const byId = new Map();
  const entrypoints = new Set();
  const keys = ["id","title","description","interfaces","effects","entrypoints","tags","requires"];
  for (const capability of manifest.capabilities) {
    exact(capability, keys, `Capability ${capability?.id ?? "(unknown)"}`);
    for (const key of keys) fail(Object.hasOwn(capability, key), `Capability ${capability?.id ?? "(unknown)"} is missing ${key}.`);
    fail(/^[a-z0-9][a-z0-9._:-]{1,127}$/u.test(capability.id), `Capability ${capability.id} has an invalid ID.`);
    fail(text(capability.title, 160) && text(capability.description), `Capability ${capability.id} text is invalid.`);
    const interfaces = strings(capability.interfaces, `${capability.id}.interfaces`, 50, 40, true);
    const effects = strings(capability.effects, `${capability.id}.effects`, 50, 40, true);
    const commands = strings(capability.entrypoints, `${capability.id}.entrypoints`, 100, 500, true);
    strings(capability.tags, `${capability.id}.tags`, 100, 80);
    const requirements = strings(capability.requires, `${capability.id}.requires`, 100, 160);
    fail(interfaces.every((item) => INTERFACES.has(item)), `Capability ${capability.id} declares an unknown interface.`);
    fail(effects.every((item) => EFFECTS.has(item)), `Capability ${capability.id} declares an unknown effect.`);
    fail(!effects.includes("publish"), `Capability ${capability.id} must not claim Git or mainline publication authority.`);
    fail(!effects.includes("financial"), `Capability ${capability.id} must not claim financial authority.`);
    if (effects.includes("network")) fail(requirements.some((item) => /gate|authori[sz]ation|credential|confirmation/iu.test(item)), `Network capability ${capability.id} lacks an explicit gate or credential prerequisite.`);
    for (const command of commands) {
      const parts = command.split(/\s+/u);
      fail(parts.length === 2 && parts[0] === "pnpm", `Capability ${capability.id} entrypoint must be one exact pnpm script: ${command}`);
      fail(text(packageJson.scripts[parts[1]], 20_000), `Capability ${capability.id} references missing package script ${parts[1]}.`);
      entrypoints.add(command);
    }
    byId.set(capability.id, capability);
  }
  for (const id of REQUIRED_IDS) fail(byId.has(id), `Required capability ${id} is absent.`);
  const provider = byId.get("art.provider.execute");
  fail(["network","write","execute"].every((item) => provider.effects.includes(item)), "Provider execution capability effects are incomplete.");
  fail(provider.requires.some((item) => /per-call/iu.test(item)), "Provider execution requires exact per-call confirmation.");
  fail(byId.get("art.mcp.production").requires.some((item) => /No Git or publication authority/iu.test(item)), "Production MCP must explicitly retain the Git/publication negative-authority boundary.");
  fail(entrypoints.has("pnpm check"), "Complete Art Studio validation must declare pnpm check.");

  exact(manifest.brain, ["consult","sanityCheck","topics"], "Brain contract");
  fail(manifest.brain.consult === true && manifest.brain.sanityCheck === true, "Brain consultation and sanity-check routing must remain enabled.");
  const topics = strings(manifest.brain.topics, "brain.topics", 100, 160);
  fail(topics.some((item) => /publication boundaries/iu.test(item)), "Brain topics must include publication-boundary reasoning.");
  fail(typeof manifest.reviewedAt === "string" && Number.isFinite(Date.parse(manifest.reviewedAt)), "Capability manifest reviewedAt is invalid.");
  return { schema:"evavo.art-studio-capability-manifest-check.v1", repository:manifest.repository, authority:manifest.authority, capabilityCount:manifest.capabilities.length, entrypointCount:entrypoints.size, publicationAuthority:false, financialAuthority:false };
}

export function validateAutomationFabricClient(client) {
  exact(client, ["schemaVersion","kind","client","role","canonicalRepository","canonicalManifest","minimumLocalStorageVersion","poolId","defaultRouting","approvedRoots","supportedWork","repositoryMutation","publication","executionEvidence","cleanup","downloadedExecution"], "Automation Fabric client");
  fail(client.schemaVersion === 1 && client.kind === "evavo-automation-fabric-client" && client.client === "evavo-art-studio", "Automation Fabric client identity is invalid.");
  fail(text(client.role, 200), "Automation Fabric client role is invalid.");
  fail(client.canonicalRepository === "EVAVO-STUDIO/evavo-local-storage", "Local Storage must remain the canonical host-execution authority.");
  fail(client.canonicalManifest === "config/automation-fabric-capabilities.json", "Automation Fabric canonical manifest path drifted.");
  fail(atLeast(client.minimumLocalStorageVersion, "0.36.0"), "Automation Fabric requires evavo-local-storage 0.36.0 or newer.");
  fail(client.poolId === "windows-local", "Automation Fabric pool must remain windows-local.");

  exact(client.defaultRouting, ["preferWorkerFabric","manualTerminalRelayRequired","fileFirstPowerShell","powershellGuardRequired","capabilityRouted","receiptRequired"], "Automation Fabric default routing");
  for (const key of ["preferWorkerFabric","fileFirstPowerShell","powershellGuardRequired","capabilityRouted","receiptRequired"]) fail(client.defaultRouting[key] === true, `Automation Fabric routing weakened: ${key}.`);
  fail(client.defaultRouting.manualTerminalRelayRequired === false, "Manual terminal relay must not be the default execution path.");
  fail(JSON.stringify(client.approvedRoots) === JSON.stringify(["C:\\GitRepos","C:\\Downloads","C:\\BEESTATION","approved-discovered-external-roots"]), "Automation Fabric approved roots drifted.");
  const work = strings(client.supportedWork, "supportedWork", 100, 100, true);
  for (const item of ["powershell","python","node","pnpm","archive","artifact-mission","repo-maintenance","art-pipeline-validation","image-toolchain","godot-validation","provider-runtime","guarded-main-publication"]) fail(work.includes(item), `Automation Fabric lacks ${item} routing.`);

  exact(client.repositoryMutation, ["operatorRepository","entrypoint","transport","publicRemoteSurface","structuredMutationRequired","rawGitByDefault","rawGithubByDefault"], "Repository mutation binding");
  fail(client.repositoryMutation.operatorRepository === "EVAVO-STUDIO/evavo-github-mcp", "GitHub MCP must remain the low-level repository mutation authority.");
  fail(client.repositoryMutation.entrypoint === "control-plane/agent-workspace-hardened-server.mjs", "Repository mutation must use the hardened agent-workspace entrypoint.");
  fail(client.repositoryMutation.transport === "stdio" && client.repositoryMutation.publicRemoteSurface === "read-only", "Broad repository writes must remain local stdio while the public surface is read-only.");
  fail(client.repositoryMutation.structuredMutationRequired === true && client.repositoryMutation.rawGitByDefault === false && client.repositoryMutation.rawGithubByDefault === false, "Repository mutation must remain structured and raw Git/GitHub disabled by default.");

  exact(client.publication, ["operatorRepository","operator","normalPushOnly","liveRemoteRecheck","declaredPathsOnly","exactHeadRequired","exactStatusRequired","remoteShaVerification","forcePush","resetHard","clean","stashAsRecovery","rebase"], "Publication binding");
  fail(client.publication.operatorRepository === "EVAVO-STUDIO/evavo-development-studio", "Development Studio must remain the publication authority.");
  fail(client.publication.operator === "scripts/Publish-EvavoRepoMain.ps1", "Development Studio publication operator drifted.");
  for (const key of ["normalPushOnly","liveRemoteRecheck","declaredPathsOnly","exactHeadRequired","exactStatusRequired","remoteShaVerification"]) fail(client.publication[key] === true, `Publication safety gate weakened: ${key}.`);
  for (const key of ["forcePush","resetHard","clean","stashAsRecovery","rebase"]) fail(client.publication[key] === false, `Destructive publication mode enabled: ${key}.`);

  const evidence = ["workerReceiptIsPublicationEvidence","localExecutionIsPublicationPermission","providerReceiptIsGitPublicationEvidence","validationIsCreativeApproval","validationIsRuntimePromotion"];
  exact(client.executionEvidence, evidence, "Execution evidence boundary");
  for (const key of evidence) fail(client.executionEvidence[key] === false, `Execution evidence overclaims ${key}.`);

  exact(client.cleanup, ["operator","destination","localRecoveryCopyRetained","restoreAvailable","permanentPurgeAvailableToAgents"], "Cleanup binding");
  fail(client.cleanup.operator === "evavo-local-storage-to-delete" && client.cleanup.destination === "bee://primary/TO_DELETE/", "Cleanup must remain delegated to the recoverable Local Storage boundary.");
  fail(client.cleanup.localRecoveryCopyRetained === false && client.cleanup.restoreAvailable === true && client.cleanup.permanentPurgeAvailableToAgents === false, "Cleanup recovery or purge boundaries were weakened.");

  exact(client.downloadedExecution, ["operator","hashPinnedByDefault","reviewedPurposeRequired","downloadSuccessAloneAuthorizesExecution"], "Downloaded execution binding");
  fail(client.downloadedExecution.operator === "evavo-local-storage-exec" && client.downloadedExecution.hashPinnedByDefault === true && client.downloadedExecution.reviewedPurposeRequired === true && client.downloadedExecution.downloadSuccessAloneAuthorizesExecution === false, "Reviewed downloaded-execution boundary was weakened.");
  return { schema:"evavo.art-studio-automation-fabric-client-check.v1", client:client.client, poolId:client.poolId, localExecutionAuthority:client.canonicalRepository, repositoryMutationAuthority:client.repositoryMutation.operatorRepository, publicationAuthority:client.publication.operatorRepository, workerReceiptIsPublicationEvidence:false };
}

export async function checkRepository(root = ROOT) {
  const json = async (relative) => JSON.parse(await readFile(path.join(root, relative), "utf8"));
  const [manifest,schema,packageJson,client] = await Promise.all([json("evavo.capabilities.json"),json("schemas/evavo.repository-capabilities.schema.json"),json("package.json"),json("config/automation-fabric-client-v2.json")]);
  const manifestResult = validateCapabilityManifest(manifest, schema, packageJson);
  const clientResult = validateAutomationFabricClient(client);
  for (const relative of REQUIRED_FILES) {
    const stat = await lstat(path.join(root, relative));
    fail(stat.isFile() && !stat.isSymbolicLink(), `Required capability-contract file is missing or linked: ${relative}`);
  }
  const [workflow,documentation] = await Promise.all([readFile(path.join(root, ".github/workflows/art-studio-capability-contract.yml"), "utf8"),readFile(path.join(root, "docs/CAPABILITY_DISCOVERY_AND_AUTOMATION_FABRIC.md"), "utf8")]);
  for (const marker of ["node scripts/check-art-studio-capability-contract.mjs","node --test scripts/test-art-studio-capability-contract.mjs","git diff --exit-code","git status --porcelain=v1 --untracked-files=all","permissions:","contents: read"]) fail(workflow.includes(marker), `Capability workflow is missing marker: ${marker}`);
  for (const marker of ["Development Studio","EVAVO GitHub MCP","Local Storage","worker receipt","does not grant publication","file-first"]) fail(documentation.toLowerCase().includes(marker.toLowerCase()), `Capability documentation is missing boundary: ${marker}`);
  return { schema:"evavo.art-studio-capability-and-automation-contract-check.v1", ok:true, manifest:manifestResult, automationFabric:clientResult, sourceMutation:false, publication:false };
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(HERE)) {
  try {
    const result = await checkRepository();
    console.log(`PASS ${result.manifest.capabilityCount} Art Studio capabilities and Automation Fabric v2 boundaries validated.`);
  } catch (error) {
    console.error(`FAIL ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
