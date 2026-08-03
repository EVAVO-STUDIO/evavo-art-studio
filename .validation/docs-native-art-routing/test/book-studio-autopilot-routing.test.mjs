import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalBookJson,
  compileRoutedBookStudioAutopilot,
  sha256BookText,
} from "../src/index.ts";

const sha = (character) => `sha256:${character.repeat(64)}`;

function operationRequest() {
  return {
    outputKind: "evavo_docs_book_operation_request",
    schemaVersion: 1,
    contract: "evavo_docs_book_operation_v1",
    authorityMode: "shadow_migration",
    requestId: "request-execution-plan-next",
    operation: "execution.plan_next",
    payload: {},
    requestedAt: "2026-08-04T00:00:00.000Z",
    requestedBy: "automation-worker-1",
    evidenceIds: [],
    authoritativeWritesAllowed: false,
    canonicalManuscriptMutationAllowed: false,
    automaticPublicationAllowed: false,
    runtimeCutoverApproved: false,
    sourceDeletionApproved: false,
    publicationPerformed: false,
  };
}

function input() {
  return {
    outputKind: "evavo_docs_book_autopilot_input",
    schemaVersion: 1,
    contract: "evavo_docs_book_autopilot_v1",
    authorityMode: "shadow_migration",
    operation: "programme_autopilot",
    runId: "run-1",
    projectId: "project-1",
    programmeId: "programme-1",
    executionRequest: operationRequest(),
    evidenceIds: [],
    requestedAt: "2026-08-04T00:00:00.000Z",
    requestedBy: "automation-worker-1",
    dryRun: false,
    authoritativeWritesAllowed: false,
    canonicalManuscriptMutationAllowed: false,
    automaticAmazonUploadAllowed: false,
    runtimeCutoverApproved: false,
    sourceDeletionApproved: false,
    publicationPerformed: false,
  };
}

async function operationResult(request, stageId) {
  const result = {
    outputKind: "evavo_docs_book_next_task",
    schemaVersion: 1,
    contract: "evavo_docs_book_execution_v1",
    status: "ready",
    executionId: "execution-1",
    projectId: "project-1",
    programmeId: "programme-1",
    planFingerprint: sha("a"),
    stateFingerprint: sha("b"),
    nextTask: {
      task: {
        taskId: `task-${stageId}`,
        stageId,
        executionMode: "provider",
        automaticExecutionAllowed: true,
        taskFingerprint: sha("c"),
      },
      expectedAttempt: 1,
      expectedStateRevision: 2,
      expectedInputFingerprint: sha("d"),
      taskInstruction: "Perform one exact bounded provider step.",
    },
    blockers: [],
    warnings: [],
    canonicalAdmissionAllowed: false,
    canonicalManuscriptMutationPerformed: false,
    websiteCompatibilityRuntimeStillAuthoritative: true,
    runtimeCutoverApproved: false,
    publicationPerformed: false,
  };
  const unsigned = {
    outputKind: "evavo_docs_book_operation_result",
    schemaVersion: 1,
    contract: "evavo_docs_book_operation_v1",
    status: "completed",
    requestId: request.requestId,
    operation: request.operation,
    requiredScope: "documents:read",
    requestFingerprint: sha("1"),
    result,
    blockers: [],
    warnings: [],
    authoritativeWritesPerformed: false,
    canonicalManuscriptMutationPerformed: false,
    providerCalled: false,
    publicationPerformed: false,
    websiteCompatibilityRuntimeStillAuthoritative: true,
    docsSuiteCanonicalWriterEnabled: false,
    dualAuthoritativeWritesAllowed: false,
    runtimeCutoverApproved: false,
    sourceDeletionApproved: false,
  };
  return {
    ...unsigned,
    resultFingerprint: await sha256BookText(canonicalBookJson(unsigned)),
  };
}

for (const stageId of ["cover_visual_routes", "illustration_production"]) {
  test(`routes ${stageId} to Art Studio`, async () => {
    const result = await compileRoutedBookStudioAutopilot(input(), {
      executeOperation: (request) => operationResult(request, stageId),
    });
    assert.equal(result.status, "ready_for_automatic_step");
    assert.equal(result.action.actionKind, "art_production");
    assert.equal(result.action.targetService, "art_studio");
    assert.equal(
      result.action.dispatchPath,
      "/v1/book-art/docs-releases/submit",
    );
    assert.equal(
      result.action.targetContract,
      "evavo_docs_book_art_release_shadow_runtime_v1",
    );
    assert.equal(
      result.action.preparationOperation,
      "writing_art.compile_release",
    );
    assert.equal(result.automaticExecutionAllowed, true);
    assert.equal(result.publicationPerformed, false);
    const { resultFingerprint, ...unsigned } = result;
    assert.equal(
      resultFingerprint,
      await sha256BookText(canonicalBookJson(unsigned)),
    );
  });
}

test("keeps prose and editorial providers in Writing Studio", async () => {
  const result = await compileRoutedBookStudioAutopilot(input(), {
    executeOperation: (request) =>
      operationResult(request, "review:line_editing"),
  });
  assert.equal(result.action.actionKind, "writing_candidate");
  assert.equal(result.action.targetService, "writing_studio");
  assert.equal(
    result.action.dispatchPath,
    "/api/v1/book-studio/writing-candidate",
  );
});
