#!/usr/bin/env node
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(HERE), "..");
const INTERFACES = new Set(["api","automation","cli","desktop","game","library","mcp","mobile","openapi","testing","ui","web-app"]);
const EFFECTS = new Set(["read","compute","network","write","execute","publish","financial"]);
const REQUIRED_IDS = ["art.source.review","art.project.workspace","art.project.mastering","art.project.review","art.pixel-font.build","art.delivery.optimize","art.provider.plan","art.provider.execute","art.mcp.review","art.mcp.production","art.book.direction","art.validation.execute"];
const REQUIRED_FILES = [
  "evavo.capabilities.json",
  "evavo.tasks.json",
  "schemas/evavo.repository-capabilities.schema.json",
  "config/automation-fabric-client-v2.json",
  "config/automation-fabric-client-v5.json",
  "config/automation-fabric-recovery-chain.json",
  "scripts/Test-EvaAvatarWorkerStack.ps1",
  "scripts/check-art-studio-capability-contract.mjs",
  "scripts/test-art-studio-capability-contract.mjs",
  "docs/CAPABILITY_DISCOVERY_AND_AUTOMATION_FABRIC.md",
  ".github/workflows/art-studio-capability-contract.yml",
];
const SHA = /^[a-f0-9]{40}$/u;
const fail = (condition, message) => { if (!condition) throw new Error(message); };
const record = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const unique = (values) => new Set(values).size === values.length;
const text = (value, maximum = 1200) => typeof value === "string" && value.length > 0 && value.length <= maximum;
const exact = (value, keys, label) => {
  fail(record(value), `${label} must be an object.`);
  for (const key of Object.keys(value)) fail(keys.includes(key), `${label} contains unknown field ${key}.`);
  for (const key of keys) fail(Object.hasOwn(value, key), `${label} is missing ${key}.`);
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
  exact(manifest, ["$schema","contractVersion","repository","authority","summary","capabilities","brain","reviewedAt"], "Capability manifest");
  fail(manifest.$schema === "./schemas/evavo.repository-capabilities.schema.json", "Capability manifest schema path is not canonical.");
  fail(manifest.contractVersion === "evavo_repository_capabilities_v1", "Capability manifest contract version is invalid.");
  fail(manifest.repository === "EVAVO-STUDIO/evavo-art-studio" && manifest.authority === "art-studio", "Capability manifest repository authority is invalid.");
  fail(text(manifest.summary), "Capability manifest summary is invalid.");
  fail(Array.isArray(manifest.capabilities) && manifest.capabilities.length > 0 && manifest.capabilities.length <= 200, "Capability manifest capabilities are invalid.");
  fail(unique(manifest.capabilities.map((item) => item?.id)), "Capability IDs must be unique.");
  fail(record(packageJson?.scripts), "package.json scripts are unavailable.");
  const byId = new Map();
  const entrypoints = new Set();
  const keys = ["id","title","description","interfaces","effects","entrypoints","tags","requires"];
  for (const capability of manifest.capabilities) {
    exact(capability, keys, `Capability ${capability?.id ?? "(unknown)"}`);
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

export function validateRecoveryChain(chain) {
  exact(chain, ["schemaVersion","kind","client","runtimeOwner","minimumLocalStorageVersion","order","rules","authority"], "Recovery chain");
  fail(chain.schemaVersion === 1 && chain.kind === "evavo-automation-fabric-recovery-chain" && chain.client === "evavo-art-studio", "Recovery chain identity drifted.");
  fail(chain.runtimeOwner === "EVAVO-STUDIO/evavo-local-storage", "Recovery chain runtime owner drifted.");
  fail(atLeast(chain.minimumLocalStorageVersion, "0.48.9"), "Recovery chain requires Local Storage 0.48.9 or newer.");
  fail(Array.isArray(chain.order) && chain.order.length === 3, "Recovery chain must contain exactly three ordered routes.");
  fail(JSON.stringify(chain.order.map((entry) => entry.id)) === JSON.stringify(["supervisor-first","legacy-certified","immutable-armer"]), "Recovery chain order changed.");
  fail(chain.order[0].entrypoint === "START-EVAVO-WORKER-FABRIC-SUPERVISOR-FIRST.ps1", "Supervisor-first recovery starter drifted.");
  fail(chain.order[1].entrypoint === "START-EVAVO-AUTOMATION-FABRIC-CERTIFIED.ps1", "Certified fallback starter drifted.");
  fail(chain.order[2].entrypoint === "ARM-EVAVO-WORKER-FABRIC-REPAIR.ps1" && chain.order[2].createOnlyDelayedFallback === true, "Immutable repair armer drifted.");
  for (const entry of chain.order) fail(entry.mailboxDependent === false, `Recovery route ${entry.id} must not depend on the unavailable mailbox.`);
  for (const key of ["exactNodeReceiptRequired","poolReceiptRequired","freshReceiptsRequiredBeforeRoutineWork","commandIdSingleExecutionRequired","terminalReceiptReplayMustBeIdempotent","managedRuntimeUpdatesMustBeFastForwardOnly","managedRuntimeDivergenceMustBeQuarantined"]) fail(chain.rules[key] === true, `Recovery rule weakened: ${key}.`);
  fail(chain.rules.mailboxDependentRepairAllowedWhenMailboxUnreachable === false, "Dead mailbox must not repair itself through the same mailbox.");
  for (const [key, value] of Object.entries(chain.authority)) fail(value === false, `Recovery authority must remain closed: ${key}.`);
  return { schema:"evavo.art-studio-recovery-chain-check.v2", minimumLocalStorageVersion:chain.minimumLocalStorageVersion, order:chain.order.map((entry) => entry.id), publicationAuthority:false };
}

export function validateAutomationFabricClient(client) {
  exact(client, ["schemaVersion","kind","contractVersion","client","role","runtimeOwner","minimumLocalStorageVersion","reviewedLocalStorageMain","reviewedDevelopmentStudioMain","poolId","primaryNodeId","sourceContract","runtimeEvidenceStates","truthRules","routing","execution","githubActionsFallback","workerAuthority","publication","safety"], "Automation Fabric runtime-truth client");
  fail(client.schemaVersion === 3 && client.kind === "evavo-automation-fabric-runtime-truth-client" && client.contractVersion === 5 && client.client === "evavo-art-studio", "Automation Fabric v5 client identity is invalid.");
  fail(client.runtimeOwner === "EVAVO-STUDIO/evavo-local-storage", "Local Storage must remain the runtime owner.");
  fail(atLeast(client.minimumLocalStorageVersion, "0.48.9"), "Automation Fabric requires evavo-local-storage 0.48.9 or newer.");
  fail(SHA.test(client.reviewedLocalStorageMain) && SHA.test(client.reviewedDevelopmentStudioMain), "Reviewed runtime revisions must be exact commit SHAs.");
  fail(client.poolId === "windows-local" && client.primaryNodeId === "windows-primary", "Automation Fabric worker identity drifted.");
  exact(client.sourceContract, ["capabilitiesPath","physicalAcceptanceScript","workstationAcceptanceCommand","workstationAcceptanceImplementation","recoveryChainContract","supervisorFirstRecoveryStarter","certifiedFallbackStarter","immutableRepairArmer","resilientInstaller","controlPlaneHealer","repositoryTaskPlanAction","repositoryTaskExecuteAction","developmentStudioNamedTaskCompiler","evaAvatarWorkerTaskName"], "Source contract");
  fail(client.sourceContract.capabilitiesPath === "config/automation-fabric-capabilities.json", "Canonical Local Storage capabilities path drifted.");
  fail(client.sourceContract.workstationAcceptanceCommand === "evavo-local-storage-workstation-accept", "Workstation acceptance command drifted.");
  fail(client.sourceContract.workstationAcceptanceImplementation === "evavo_local_storage.workstation_acceptance_v8:main", "Art Studio must require workstation acceptance v8.");
  fail(client.sourceContract.recoveryChainContract === "config/automation-fabric-recovery-chain.json", "Runtime truth recovery chain is not bound.");
  fail(client.sourceContract.supervisorFirstRecoveryStarter === "START-EVAVO-WORKER-FABRIC-SUPERVISOR-FIRST.ps1", "Supervisor-first recovery starter changed.");
  fail(client.sourceContract.certifiedFallbackStarter === "START-EVAVO-AUTOMATION-FABRIC-CERTIFIED.ps1", "Certified fallback starter changed.");
  fail(client.sourceContract.immutableRepairArmer === "ARM-EVAVO-WORKER-FABRIC-REPAIR.ps1", "Immutable repair armer changed.");
  fail(client.sourceContract.resilientInstaller === "INSTALL-EVAVO-WORKER-FABRIC-RESILIENT.ps1" && client.sourceContract.controlPlaneHealer === "HEAL-EVAVO-WORKER-CONTROL-PLANE.ps1", "Resilient worker control-plane bindings drifted.");
  fail(client.sourceContract.repositoryTaskPlanAction === "storage.repository_task_plan" && client.sourceContract.repositoryTaskExecuteAction === "storage.repository_task_run", "Exact-state repository task actions drifted.");
  fail(client.sourceContract.developmentStudioNamedTaskCompiler === "packages/runner-fabric/src/repository-task.ts", "Development Studio named-task compiler drifted.");
  fail(client.sourceContract.evaAvatarWorkerTaskName === "eva-avatar-worker-stack", "EVA worker task binding drifted.");
  const states = new Map(client.runtimeEvidenceStates.map((item) => [item.state, item]));
  for (const state of ["declared","implemented","workflow-queued","installed","live","reachable","physically-accepted"]) fail(states.has(state), `Runtime evidence state ${state} is missing.`);
  for (const state of ["declared","implemented","workflow-queued","installed","live"]) fail(states.get(state).permitsRoutineWorkerUse === false, `State ${state} must not authorize routine worker use.`);
  fail(states.get("reachable").permitsRoutineWorkerUse === true && states.get("physically-accepted").permitsRoutineWorkerUse === true, "Routine worker use requires reachable or physically accepted evidence.");
  for (const key of ["sourceConfigurationIsRuntimeProof","queuedWorkflowIsRuntimeProof","taskRegistrationIsRuntimeProof","heartbeatAloneIsReachabilityProof","missingReceiptMeansSuccess","staleReceiptMeansSuccess","duplicateExecutionAllowed","repositoryTaskPlannerReceiptIsPublicationEvidence","physicalAcceptanceReceiptIsPublicationEvidence","recoverySourcePresenceAloneMeansReachable","validationIsCreativeApproval","validationIsRuntimePromotion"]) fail(client.truthRules[key] === false, `Runtime truth rule weakened: ${key}.`);
  for (const key of ["exactRequestToReceiptCorrelationRequired","commandIdSingleExecutionRequired","duplicateCommandIssueMustFailBeforeExecution","terminalReceiptReplayMustBeIdempotent","workerReceiptMustNameCommandId","workerReceiptMustNameNodeId","workerReceiptMustNameAction","workerReceiptMustBeSuccessful","repositoryTaskPlannerReceiptIsRuntimeMeasurement","unmeasuredRepositoryTaskMustPlanBeforeExecution","namedTaskPlanMustBindManifestSha256","namedTaskPlanMustBindTaskSha256","supervisorFirstRecoveryIsRuntimeProofOnlyAfterReceipts","stableControlPlaneMustExecuteExactCurrentManagedMain","managedRuntimeUpdatesMustBeFastForwardOnly","managedRuntimeDivergenceMustBeQuarantined"]) fail(client.truthRules[key] === true, `Runtime truth rule weakened: ${key}.`);
  fail(client.routing.askGregToPasteRoutineTerminalCommands === false, "Routine terminal relay must not be delegated to Greg.");
  fail(client.routing.manualTerminalRelayAllowedOnlyAfterAllRemoteRecoveryRoutesFail === true, "Manual terminal relay may occur only after remote recovery routes fail.");
  fail(/supervisor-first/iu.test(client.routing.whenAllRemoteRecoveryRoutesUnavailable), "Recovery routing must remain supervisor-first.");
  fail(/do not enqueue additional repair commands/iu.test(client.routing.whenMailboxWorkerUnavailable), "Mailbox outage routing must not self-depend on the unavailable mailbox.");
  for (const key of ["plannerReceiptRequiredForUnmeasuredRepositoryTask","plannerMeasuresExactHead","plannerMeasuresExactStatusSha256","plannerMeasuresTrackedScriptSha256","trackedScriptBytesRequired","namedRepositoryTaskDigestBindingRequired","credentialStrippingRequired","fileFirstPowerShell","powershellGuardRequired","explicitNativeExitCodeRequired","argvOnlyProcessesPreferred","resourceAwareAdmissionRequired","boundedProcessTreeTerminationRequired","automaticTransientRetryOnly"]) fail(client.execution[key] === true, `Execution safety gate weakened: ${key}.`);
  fail(client.execution.preferredRecoveryEntrypoint === "START-EVAVO-WORKER-FABRIC-SUPERVISOR-FIRST.ps1" && client.execution.legacyCertifiedRecoveryEntrypoint === "START-EVAVO-AUTOMATION-FABRIC-CERTIFIED.ps1" && client.execution.immutableRepairArmer === "ARM-EVAVO-WORKER-FABRIC-REPAIR.ps1", "Execution recovery chain drifted.");
  fail(client.execution.repositoryTaskPlanAction === "storage.repository_task_plan" && client.execution.repositoryTaskExecuteAction === "storage.repository_task_run", "Execution repository task route drifted.");
  fail(client.execution.maximumAttempts === 3, "Automatic retry budget must remain bounded to three attempts.");
  fail(JSON.stringify(client.execution.approvedRoots) === JSON.stringify(["C:\\GitRepos","%USERPROFILE%\\Downloads","resolved-beestation-root","approved-discovered-external-roots"]), "Approved execution roots drifted.");
  const routine = strings(client.execution.routineCapabilities, "routineCapabilities", 100, 100, true);
  for (const item of ["powershell","python","node","pnpm","git","github-cli","archive","art-pipeline-validation","image-toolchain","provider-runtime"]) fail(routine.includes(item), `Automation Fabric lacks ${item} routing.`);
  exact(client.githubActionsFallback, ["developmentStudioContract","eligibleStatus","zeroStepsRequired","completedFailedRunRequired","exactBlockedRevisionRequired","plannerReceiptBoundToBlockedRevision","readOnlyValidationOnly","githubActionsEquivalent","githubCheckStatusMutation","workerReceiptIsPublicationEvidence"], "GitHub Actions fallback");
  fail(client.githubActionsFallback.developmentStudioContract === "evavo-github-actions-worker-fallback" && client.githubActionsFallback.eligibleStatus === "provider-allocation-blocked", "GitHub Actions fallback contract drifted.");
  for (const key of ["zeroStepsRequired","completedFailedRunRequired","exactBlockedRevisionRequired","plannerReceiptBoundToBlockedRevision","readOnlyValidationOnly"]) fail(client.githubActionsFallback[key] === true, `GitHub Actions fallback weakened: ${key}.`);
  for (const key of ["githubActionsEquivalent","githubCheckStatusMutation","workerReceiptIsPublicationEvidence"]) fail(client.githubActionsFallback[key] === false, `GitHub Actions fallback overclaims ${key}.`);
  for (const [key, value] of Object.entries(client.workerAuthority)) fail(value === false, `Worker authority must remain closed: ${key}.`);
  exact(client.publication, ["operatorRepository","operator","guardedMainPublicationRequired","exactRemoteHeadRecheckRequired","declaredPathsOnly","remoteShaVerificationRequired","forcePush","automaticMerge","automaticRebase"], "Publication binding");
  fail(client.publication.operatorRepository === "EVAVO-STUDIO/evavo-development-studio" && client.publication.operator === "scripts/mainline-publish.mjs", "Development Studio must remain guarded publication authority.");
  for (const key of ["guardedMainPublicationRequired","exactRemoteHeadRecheckRequired","declaredPathsOnly","remoteShaVerificationRequired"]) fail(client.publication[key] === true, `Publication safety gate weakened: ${key}.`);
  for (const key of ["forcePush","automaticMerge","automaticRebase"]) fail(client.publication[key] === false, `Destructive or automatic publication mode enabled: ${key}.`);
  for (const key of ["resetHard","gitClean","stashAsRecovery","permanentDelete","providerDeleteImpliedByWorkerAuthority","downloadAloneAuthorizesExecution","secretEnvironmentCallerOverride"]) fail(client.safety[key] === false, `Safety boundary weakened: ${key}.`);
  fail(client.safety.cleanupDestination === "bee://primary/TO_DELETE/", "Recoverable cleanup destination drifted.");
  return { schema:"evavo.art-studio-automation-fabric-client-check.v8", client:client.client, poolId:client.poolId, minimumLocalStorageVersion:client.minimumLocalStorageVersion, workstationAcceptance:"v8", exactStateRepositoryTasks:true, namedRepositoryTaskDigestBinding:true, evaAvatarWorkerTaskName:client.sourceContract.evaAvatarWorkerTaskName, supervisorFirstRecovery:true, commandIdSingleExecutionRequired:true, githubActionsWorkerFallback:true, workerReceiptIsPublicationEvidence:false, publicationAuthority:client.publication.operatorRepository };
}

function validateEvaAvatarWorkerTask(tasks, script) {
  fail(tasks?.schemaVersion === 1 && tasks?.kind === "evavo-repository-task-manifest" && tasks?.repository === "evavo-art-studio", "Repository task manifest identity drifted.");
  const task = tasks?.tasks?.["eva-avatar-worker-stack"];
  fail(record(task), "EVA avatar worker task is missing.");
  fail(task.runtime === "powershell-script", "EVA avatar worker task must use PowerShell.");
  fail(task.entry === "scripts/Test-EvaAvatarWorkerStack.ps1", "EVA avatar worker task entrypoint drifted.");
  fail(task.network === "disabled", "EVA avatar worker task must remain network-disabled.");
  fail(Number.isSafeInteger(task.timeoutSeconds) && task.timeoutSeconds >= 300 && task.timeoutSeconds <= 1800, "EVA avatar worker task timeout is invalid.");
  for (const marker of [
    "Set-StrictMode -Version Latest",
    "$global:LASTEXITCODE = 0",
    "storage.repository_task_plan",
    "storage.repository_task_run",
    "expectedTaskManifestSha256",
    "expectedTaskSha256",
    "evavo_next_website_eva_identity_surface_v3",
    "scripts/check-project-art-eva-dense-motion-work-order.mjs",
    "tests/eva-dense-motion-admission.test.mjs",
    "scripts/check-eva-avatar-frame-cadence.mjs",
    "scripts/check-eva-avatar-alpha-compositing.mjs",
    "repositoryMutation = $false",
    "pushAuthority = $false",
    "publicationAuthority = $false",
    "runtimeActivation = $false",
    "forcePush = $false",
  ]) fail(script.includes(marker), `EVA avatar worker stack is missing marker: ${marker}`);
  return { schema:"evavo.eva-avatar-worker-task-check.v1", taskName:"eva-avatar-worker-stack", runtime:task.runtime, network:task.network, publicationAuthority:false };
}

export async function checkRepository(root = ROOT) {
  const json = async (relative) => JSON.parse(await readFile(path.join(root, relative), "utf8"));
  const [manifest,schema,packageJson,client,recovery,tasks] = await Promise.all([
    json("evavo.capabilities.json"),
    json("schemas/evavo.repository-capabilities.schema.json"),
    json("package.json"),
    json("config/automation-fabric-client-v5.json"),
    json("config/automation-fabric-recovery-chain.json"),
    json("evavo.tasks.json"),
  ]);
  const manifestResult = validateCapabilityManifest(manifest, schema, packageJson);
  const clientResult = validateAutomationFabricClient(client);
  const recoveryResult = validateRecoveryChain(recovery);
  for (const relative of REQUIRED_FILES) {
    const stat = await lstat(path.join(root, relative));
    fail(stat.isFile() && !stat.isSymbolicLink(), `Required capability-contract file is missing or linked: ${relative}`);
  }
  const [workflow,documentation,evaWorkerScript] = await Promise.all([
    readFile(path.join(root, ".github/workflows/art-studio-capability-contract.yml"), "utf8"),
    readFile(path.join(root, "docs/CAPABILITY_DISCOVERY_AND_AUTOMATION_FABRIC.md"), "utf8"),
    readFile(path.join(root, "scripts/Test-EvaAvatarWorkerStack.ps1"), "utf8"),
  ]);
  const evaWorkerResult = validateEvaAvatarWorkerTask(tasks, evaWorkerScript);
  for (const marker of ["node scripts/check-art-studio-capability-contract.mjs","node --test scripts/test-art-studio-capability-contract.mjs","git diff --exit-code","git status --porcelain=v1 --untracked-files=all","permissions:","contents: read"]) fail(workflow.includes(marker), `Capability workflow is missing marker: ${marker}`);
  for (const marker of ["Development Studio","EVAVO GitHub MCP","Local Storage","worker receipt","does not grant publication","file-first","supervisor-first","0.48.9","workstation acceptance v8","named repository task","eva-avatar-worker-stack","%USERPROFILE%\\Downloads","resolved-beestation-root"]) fail(documentation.toLowerCase().includes(marker.toLowerCase()), `Capability documentation is missing boundary: ${marker}`);
  return { schema:"evavo.art-studio-capability-and-automation-contract-check.v5", ok:true, manifest:manifestResult, automationFabric:clientResult, recovery:recoveryResult, evaAvatarWorker:evaWorkerResult, sourceMutation:false, publication:false };
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(HERE)) {
  try {
    const result = await checkRepository();
    console.log(`PASS ${result.manifest.capabilityCount} Art Studio capabilities, Local Storage 0.48.9 runtime truth, workstation acceptance v8, digest-bound EVA worker tasks and supervisor-first recovery validated.`);
  } catch (error) {
    console.error(`FAIL ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
