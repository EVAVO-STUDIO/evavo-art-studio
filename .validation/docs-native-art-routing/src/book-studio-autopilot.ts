import {
  canonicalBookJson,
  sha256BookText,
} from "./book-studio-project-contracts";

export interface BookStudioAutopilotActionV1 {
  actionKind:
    | "docs_operation"
    | "writing_candidate"
    | "human_gate"
    | "external_gate"
    | "manual_amazon_handoff";
  taskId?: string;
  stageId?: string;
  executionMode?: "automation" | "provider" | "human_gate" | "external_gate";
  dispatchPath?: string;
  expectedAttempt?: number;
  expectedStateRevision?: number;
  expectedInputFingerprint?: string;
  taskFingerprint?: string;
  packageFingerprint?: string;
  requestCompilationRequired?: boolean;
  instruction: string;
}

export interface BookStudioAutopilotResultV1 {
  outputKind: "evavo_docs_book_autopilot_result";
  schemaVersion: 1;
  contract: "evavo_docs_book_autopilot_v1";
  status:
    | "blocked"
    | "needs_resolution"
    | "ready_for_automatic_step"
    | "waiting_for_human_gate"
    | "waiting_for_external_gate"
    | "ready_for_manual_amazon_handoff"
    | "complete";
  operation:
    | "programme_autopilot"
    | "amazon_autopilot"
    | "autonomous_amazon_release"
    | "publication_handoff"
    | "invalid";
  runId: string;
  projectId: string;
  programmeId: string;
  requestFingerprint: string;
  executionOperationResultFingerprint?: string;
  publicationOperationResultFingerprint?: string;
  action?: BookStudioAutopilotActionV1;
  blockerIds: string[];
  requiredActionIds: string[];
  warnings: string[];
  evidenceIds: string[];
  resultFingerprint: string;
  dryRun: boolean;
  oneBoundedStepPerCall: true;
  automaticExecutionAllowed: boolean;
  manualAmazonHandoffAllowed: boolean;
  automaticAmazonUploadAllowed: false;
  authoritativeWritesPerformed: false;
  canonicalManuscriptMutationPerformed: false;
  websiteCompatibilityRuntimeStillAuthoritative: true;
  docsSuiteCanonicalWriterEnabled: false;
  dualAuthoritativeWritesAllowed: false;
  runtimeCutoverApproved: false;
  sourceDeletionApproved: false;
  publicationPerformed: false;
}

export type BookStudioAutopilotDependencies = Readonly<{
  executeOperation?: (input: unknown) => Promise<unknown>;
}>;

export async function compileBookStudioAutopilot(
  input: unknown,
  dependencies: BookStudioAutopilotDependencies = {},
): Promise<BookStudioAutopilotResultV1> {
  const source = input as Record<string, unknown>;
  if (!dependencies.executeOperation) {
    throw new Error("validation stub requires executeOperation");
  }
  const operationResult = await dependencies.executeOperation(
    source.executionRequest,
  ) as Record<string, unknown>;
  const execution = operationResult.result as Record<string, unknown>;
  const nextTask = execution.nextTask as Record<string, unknown>;
  const task = nextTask.task as Record<string, unknown>;
  const action: BookStudioAutopilotActionV1 = {
    actionKind: task.executionMode === "provider"
      ? "writing_candidate"
      : "docs_operation",
    taskId: String(task.taskId),
    stageId: String(task.stageId),
    executionMode: task.executionMode as BookStudioAutopilotActionV1["executionMode"],
    dispatchPath: task.executionMode === "provider"
      ? "/api/v1/book-studio/writing-candidate"
      : "/api/v1/book-studio/operations",
    expectedAttempt: Number(nextTask.expectedAttempt),
    expectedStateRevision: Number(nextTask.expectedStateRevision),
    expectedInputFingerprint: String(nextTask.expectedInputFingerprint),
    taskFingerprint: String(task.taskFingerprint),
    requestCompilationRequired: true,
    instruction: String(nextTask.taskInstruction),
  };
  const unsigned: Omit<BookStudioAutopilotResultV1, "resultFingerprint"> = {
    outputKind: "evavo_docs_book_autopilot_result",
    schemaVersion: 1,
    contract: "evavo_docs_book_autopilot_v1",
    status: "ready_for_automatic_step",
    operation: "programme_autopilot",
    runId: String(source.runId),
    projectId: String(source.projectId),
    programmeId: String(source.programmeId),
    requestFingerprint: `sha256:${"8".repeat(64)}`,
    executionOperationResultFingerprint: String(
      operationResult.resultFingerprint,
    ),
    action,
    blockerIds: [],
    requiredActionIds: [],
    warnings: [],
    evidenceIds: [],
    dryRun: false,
    oneBoundedStepPerCall: true,
    automaticExecutionAllowed: true,
    manualAmazonHandoffAllowed: false,
    automaticAmazonUploadAllowed: false,
    authoritativeWritesPerformed: false,
    canonicalManuscriptMutationPerformed: false,
    websiteCompatibilityRuntimeStillAuthoritative: true,
    docsSuiteCanonicalWriterEnabled: false,
    dualAuthoritativeWritesAllowed: false,
    runtimeCutoverApproved: false,
    sourceDeletionApproved: false,
    publicationPerformed: false,
  };
  return {
    ...unsigned,
    resultFingerprint: await sha256BookText(canonicalBookJson(unsigned)),
  };
}
