#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(here), "..");
const fail = (condition, message) => { if (!condition) throw new Error(message); };
const semver = (value) => {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u.exec(String(value));
  fail(Boolean(match), `Invalid semantic version: ${value}`);
  return match.slice(1).map(Number);
};
const atLeast = (value, floor) => {
  const left = semver(value); const right = semver(floor);
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] > right[index];
  }
  return true;
};
const exactSha = (value, label) => fail(/^[a-f0-9]{40}$/u.test(String(value)), `${label} SHA is invalid.`);
const EXPECTED_ROOTS = Object.freeze([
  "C:\\GitRepos",
  "%USERPROFILE%\\Downloads",
  "resolved-beestation-root",
  "approved-discovered-external-roots",
]);

export function validate(client) {
  fail(client.schemaVersion === 3, "Art Studio v5 client must use schema 3.");
  fail(client.kind === "evavo-automation-fabric-runtime-truth-client", "Runtime-truth client kind drifted.");
  fail(client.contractVersion === 5 && client.client === "evavo-art-studio", "Art Studio v5 identity drifted.");
  fail(client.runtimeOwner === "EVAVO-STUDIO/evavo-local-storage", "Local Storage runtime authority drifted.");
  fail(atLeast(client.minimumLocalStorageVersion, "0.48.0"), "Local Storage 0.48.0+ is required.");
  exactSha(client.reviewedLocalStorageMain, "Reviewed Local Storage");
  exactSha(client.reviewedDevelopmentStudioMain, "Reviewed Development Studio");
  fail(client.poolId === "windows-local" && client.primaryNodeId === "windows-primary", "Worker routing identity drifted.");

  const source = client.sourceContract;
  fail(source.capabilitiesPath === "config/automation-fabric-capabilities.json", "Capabilities source drifted.");
  fail(source.physicalAcceptanceScript === "scripts/Test-EvavoAutomationFabricPhysical.ps1", "Physical acceptance entrypoint drifted.");
  fail(source.workstationAcceptanceCommand === "evavo-local-storage-workstation-accept", "Workstation command drifted.");
  fail(source.workstationAcceptanceImplementation === "evavo_local_storage.workstation_acceptance_v8:main", "Workstation command must resolve to v8.");
  fail(source.repositoryTaskPlanAction === "storage.repository_task_plan" && source.repositoryTaskExecuteAction === "storage.repository_task_run", "Repository task actions drifted.");
  fail(source.supervisorFirstRecoveryStarter === "START-EVAVO-WORKER-FABRIC-SUPERVISOR-FIRST.ps1", "Supervisor-first recovery entrypoint drifted.");

  const states = new Map(client.runtimeEvidenceStates.map((entry) => [entry.state, entry]));
  for (const state of ["declared","implemented","workflow-queued","installed","live","reachable","physically-accepted"]) fail(states.has(state), `Runtime evidence state missing: ${state}.`);
  for (const state of ["declared","implemented","workflow-queued","installed","live"]) fail(states.get(state).permitsRoutineWorkerUse === false, `${state} must not prove routine worker usability.`);
  for (const state of ["reachable","physically-accepted"]) fail(states.get(state).permitsRoutineWorkerUse === true, `${state} must permit routine worker use.`);

  const truth = client.truthRules;
  for (const key of ["sourceConfigurationIsRuntimeProof","queuedWorkflowIsRuntimeProof","taskRegistrationIsRuntimeProof","heartbeatAloneIsReachabilityProof","missingReceiptMeansSuccess","staleReceiptMeansSuccess","duplicateExecutionAllowed","repositoryTaskPlannerReceiptIsPublicationEvidence","physicalAcceptanceReceiptIsPublicationEvidence","recoverySourcePresenceAloneMeansReachable","validationIsCreativeApproval","validationIsRuntimePromotion"]) fail(truth[key] === false, `Truth boundary weakened: ${key}.`);
  for (const key of ["exactRequestToReceiptCorrelationRequired","commandIdSingleExecutionRequired","duplicateCommandIssueMustFailBeforeExecution","terminalReceiptReplayMustBeIdempotent","workerReceiptMustNameCommandId","workerReceiptMustNameNodeId","workerReceiptMustNameAction","workerReceiptMustBeSuccessful","repositoryTaskPlannerReceiptIsRuntimeMeasurement","unmeasuredRepositoryTaskMustPlanBeforeExecution","supervisorFirstRecoveryIsRuntimeProofOnlyAfterReceipts","stableControlPlaneMustExecuteExactCurrentManagedMain","managedRuntimeUpdatesMustBeFastForwardOnly","managedRuntimeDivergenceMustBeQuarantined"]) fail(truth[key] === true, `Truth requirement missing: ${key}.`);

  fail(client.routing.askGregToPasteRoutineTerminalCommands === false, "Routine work must not be delegated to Greg.");
  fail(client.routing.manualTerminalRelayAllowedOnlyAfterAllRemoteRecoveryRoutesFail === true, "Manual relay must remain last-resort only.");
  fail(/supervisor-first/iu.test(client.routing.whenAllRemoteRecoveryRoutesUnavailable), "Recovery routing must remain supervisor-first.");

  const execution = client.execution;
  fail(execution.repositoryTaskPlanAction === "storage.repository_task_plan" && execution.repositoryTaskExecuteAction === "storage.repository_task_run", "Execution repository-task actions drifted.");
  for (const key of ["plannerReceiptRequiredForUnmeasuredRepositoryTask","plannerMeasuresExactHead","plannerMeasuresExactStatusSha256","plannerMeasuresTrackedScriptSha256","trackedScriptBytesRequired","credentialStrippingRequired","fileFirstPowerShell","powershellGuardRequired","explicitNativeExitCodeRequired","argvOnlyProcessesPreferred","resourceAwareAdmissionRequired","boundedProcessTreeTerminationRequired","automaticTransientRetryOnly"]) fail(execution[key] === true, `Execution safety weakened: ${key}.`);
  fail(execution.maximumAttempts === 3, "Automatic attempts must remain bounded to three.");
  fail(JSON.stringify(execution.approvedRoots) === JSON.stringify(EXPECTED_ROOTS), "Approved execution roots drifted.");
  fail(!execution.approvedRoots.includes("C:\\Downloads"), "Retired C:\\Downloads root must remain disabled.");
  fail(!execution.approvedRoots.includes("C:\\BEESTATION"), "BeeStation must remain dynamically resolved.");
  for (const capability of ["powershell","python","node","pnpm","git","github-cli","art-pipeline-validation","image-toolchain","provider-runtime"]) fail(execution.routineCapabilities.includes(capability), `Routine capability missing: ${capability}.`);

  const fallback = client.githubActionsFallback;
  fail(fallback.developmentStudioContract === "evavo-github-actions-worker-fallback", "GitHub Actions fallback contract drifted.");
  fail(fallback.eligibleStatus === "provider-allocation-blocked", "Only pre-step provider allocation failure may use the worker fallback.");
  for (const key of ["zeroStepsRequired","completedFailedRunRequired","exactBlockedRevisionRequired","plannerReceiptBoundToBlockedRevision","readOnlyValidationOnly"]) fail(fallback[key] === true, `GitHub Actions fallback requirement weakened: ${key}.`);
  for (const key of ["githubActionsEquivalent","githubCheckStatusMutation","workerReceiptIsPublicationEvidence"]) fail(fallback[key] === false, `GitHub Actions fallback overclaim enabled: ${key}.`);

  for (const [key, value] of Object.entries(client.workerAuthority)) fail(value === false, `Worker authority widened: ${key}.`);

  const publication = client.publication;
  fail(publication.operatorRepository === "EVAVO-STUDIO/evavo-development-studio" && publication.operator === "scripts/mainline-publish.mjs", "Development Studio publication binding drifted.");
  for (const key of ["guardedMainPublicationRequired","exactRemoteHeadRecheckRequired","declaredPathsOnly","remoteShaVerificationRequired"]) fail(publication[key] === true, `Publication requirement weakened: ${key}.`);
  for (const key of ["forcePush","automaticMerge","automaticRebase"]) fail(publication[key] === false, `Unsafe publication behavior enabled: ${key}.`);

  const safety = client.safety;
  for (const key of ["resetHard","gitClean","stashAsRecovery","permanentDelete","providerDeleteImpliedByWorkerAuthority","downloadAloneAuthorizesExecution","secretEnvironmentCallerOverride"]) fail(safety[key] === false, `Safety boundary weakened: ${key}.`);
  fail(safety.cleanupDestination === "bee://primary/TO_DELETE/", "Cleanup destination drifted.");

  return Object.freeze({
    schema: "evavo.art-studio-workstation-v5-contract.v2",
    ok: true,
    runtimeOwner: client.runtimeOwner,
    minimumLocalStorageVersion: client.minimumLocalStorageVersion,
    workstationAcceptance: "v8",
    plannerRequired: execution.plannerReceiptRequiredForUnmeasuredRepositoryTask,
    physicalAcceptanceRequired: true,
    approvedRoots: [...EXPECTED_ROOTS],
    githubActionsFallbackStatus: fallback.eligibleStatus,
    githubActionsEquivalent: false,
    workerPublicationAuthority: false,
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(here)) {
  const client = JSON.parse(fs.readFileSync(path.join(root, "config/automation-fabric-client-v5.json"), "utf8"));
  console.log(JSON.stringify(validate(client)));
}
