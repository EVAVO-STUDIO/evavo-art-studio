import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const CURRENT_DOCS = "22a8bf0b49637c1da1033e95eba0d7a7d8889e06";
const LEGACY_DOCS = "d7e5cd0f79ebcb211c502d33a90f84e93763f23c";
const CURRENT_WRITING = "83a5d1b183335e2d86565b10f3f8c822399e3697";
const LEGACY_WRITING = "c776a9e7f856815dbb92ffec08426cd12f176bea";
const CURRENT_ART_BASE = "e2d1019224ed4470b2a76f51b39b8fc2b52bdb0d";
const LEGACY_ART = "e9e96fd54a9e9d9c16bbd8faa2231caebb840c45";

function replaceExact(relative, before, after) {
  const absolute = path.join(root, relative);
  const source = readFileSync(absolute, "utf8");
  const count = source.split(before).length - 1;
  if (count !== 1) {
    throw new Error(`${relative}: expected one exact replacement, found ${count}.\n--- expected ---\n${before}`);
  }
  writeFileSync(absolute, source.replace(before, after), "utf8");
}

function insertBefore(relative, marker, content) {
  replaceExact(relative, marker, `${content}${marker}`);
}

replaceExact(
  "packages/contracts/src/book-production-docs-release.ts",
  `export const DOCS_BOOK_RELEASE_COMPATIBLE_DOCS_SUITE_COMMITS = Object.freeze([\n  "${LEGACY_DOCS}",\n] as const);`,
  `export const DOCS_BOOK_RELEASE_COMPATIBLE_DOCS_SUITE_COMMITS = Object.freeze([\n  "${CURRENT_DOCS}",\n  "${LEGACY_DOCS}",\n] as const);`,
);
replaceExact(
  "packages/contracts/src/book-production-docs-release.ts",
  `export const DOCS_BOOK_RELEASE_COMPATIBLE_WRITING_STUDIO_COMMITS = Object.freeze([\n  "${LEGACY_WRITING}",\n] as const);`,
  `export const DOCS_BOOK_RELEASE_COMPATIBLE_WRITING_STUDIO_COMMITS = Object.freeze([\n  "${CURRENT_WRITING}",\n  "${LEGACY_WRITING}",\n] as const);`,
);
replaceExact(
  "packages/contracts/src/book-production-docs-release.ts",
  `export const DOCS_BOOK_RELEASE_COMPATIBLE_ART_STUDIO_RECEIVER_COMMITS =\n  Object.freeze([\n    "${LEGACY_ART}",\n  ] as const);`,
  `export const DOCS_BOOK_RELEASE_COMPATIBLE_ART_STUDIO_RECEIVER_COMMITS =\n  Object.freeze([\n    "${CURRENT_ART_BASE}",\n    "${LEGACY_ART}",\n  ] as const);`,
);

replaceExact(
  "packages/contracts/test/book-production-docs-release.test.mjs",
  `const DOCS_MAIN = "${LEGACY_DOCS}";\nconst WRITING_MAIN = "${LEGACY_WRITING}";\nconst ART_RECEIVER = "${LEGACY_ART}";`,
  `const DOCS_MAIN = "${CURRENT_DOCS}";\nconst WRITING_MAIN = "${CURRENT_WRITING}";\nconst ART_RECEIVER = "${CURRENT_ART_BASE}";\nconst LEGACY_DOCS_MAIN = "${LEGACY_DOCS}";\nconst LEGACY_WRITING_MAIN = "${LEGACY_WRITING}";\nconst LEGACY_ART_RECEIVER = "${LEGACY_ART}";`,
);
insertBefore(
  "packages/contracts/test/book-production-docs-release.test.mjs",
  `test("rejects release receipt, final brief and manuscript drift", async () => {`,
  `test("retains reviewed legacy repository compatibility while accepting current heads", async () => {\n  const value = await envelope({ docsSuiteCommit: LEGACY_DOCS_MAIN });\n  value.releaseReceipt = await receipt(value.finalArtBrief, {\n    writingStudioMainCommit: LEGACY_WRITING_MAIN,\n    artStudioMainCommit: LEGACY_ART_RECEIVER,\n  });\n  const result = await compileDocsBookArtReleaseEnvelope(value);\n  assert.equal(result.status, "ready", result.blockers.join("\\n"));\n  assert.equal(result.releaseVerified, true);\n});\n\n`,
);

for (const relative of [
  "packages/book-art-runtime/test/docs-release.test.mjs",
  "apps/api/test/book-art-docs-release-api.test.mjs",
]) {
  replaceExact(relative, LEGACY_DOCS, CURRENT_DOCS);
  replaceExact(relative, LEGACY_WRITING, CURRENT_WRITING);
  replaceExact(relative, LEGACY_ART, CURRENT_ART_BASE);
}

replaceExact(
  "apps/api/test/book-art-docs-release-api.test.mjs",
  `import { LocalRuntimeRepository } from "@evavo/art-runtime";`,
  `import { LocalArtifactStore } from "@evavo/art-artifacts";\nimport { LocalRuntimeRepository } from "@evavo/art-runtime";`,
);
insertBefore(
  "apps/api/test/book-art-docs-release-api.test.mjs",
  `test("Docs release REST rejects caller provider policy and tampered receipt", async () => {`,
  `test("Docs release REST submit can be reconciled through exact provider inspection", async () => {\n  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-docs-release-api-inspect-"));\n  try {\n    const runtime = new LocalRuntimeRepository({ root: path.join(root, "runtime") });\n    const artifacts = new LocalArtifactStore({ root: path.join(root, "artifacts") });\n    const input = await requestBody();\n    await withServer(\n      {\n        runtime,\n        artifacts,\n        allowWrites: true,\n        writeToken: token,\n        bookArtProviderAdapterPolicy: policy(),\n      },\n      async (base) => {\n        const submittedResponse = await fetch(\n          \\`${base}/v1/book-art/docs-releases/submit\\`,\n          {\n            method: "POST",\n            headers: authorizedHeaders(),\n            body: JSON.stringify(input),\n          },\n        );\n        const submittedText = await submittedResponse.text();\n        assert.equal(submittedResponse.status, 201, submittedText);\n        const submitted = JSON.parse(submittedText);\n\n        const inspectionResponse = await fetch(\n          \\`${base}/v1/book-art/provider-jobs/inspect\\`,\n          {\n            method: "POST",\n            headers: authorizedHeaders(),\n            body: JSON.stringify({\n              outputKind: "evavo_book_art_provider_shadow_job_input",\n              schemaVersion: 1,\n              executionId: input.executionId,\n              requestedAt: input.requestedAt,\n              workOrder: submitted.release.workOrder,\n            }),\n          },\n        );\n        const inspectionText = await inspectionResponse.text();\n        assert.equal(inspectionResponse.status, 200, inspectionText);\n        const inspection = JSON.parse(inspectionText);\n        assert.equal(inspection.status, "pending");\n        assert.equal(inspection.runtimeJob.jobId, submitted.job.id);\n        assert.equal(inspection.providerExecutionObserved, false);\n        assert.equal(inspection.candidateArtifactObserved, false);\n        assert.equal(inspection.providerEvidenceObserved, false);\n        assert.equal(inspection.providerCallPerformedByInspection, false);\n        assert.equal(inspection.candidateArtifactsWrittenByInspection, false);\n        assert.equal(inspection.selectionPerformed, false);\n        assert.equal(inspection.promotionPerformed, false);\n        assert.equal(inspection.publicationPerformed, false);\n      },\n    );\n  } finally {\n    await rm(root, { recursive: true, force: true });\n  }\n});\n\n`,
);

replaceExact(
  "apps/api/openapi.book-art-docs-release.yaml",
  `        docsSuiteCommit:\n          const: ${LEGACY_DOCS}`,
  `        docsSuiteCommit:\n          type: string\n          enum:\n            - ${CURRENT_DOCS}\n            - ${LEGACY_DOCS}`,
);
replaceExact(
  "apps/api/test/book-art-docs-release-openapi-contract.test.mjs",
  `    "${LEGACY_DOCS}",`,
  `    "${CURRENT_DOCS}",\n    "${LEGACY_DOCS}",`,
);

replaceExact(
  "scripts/check-book-art-docs-release.mjs",
  `  apiTest: "apps/api/test/book-art-docs-release-api.test.mjs",`,
  `  apiTest: "apps/api/test/book-art-docs-release-api.test.mjs",\n  workerIntegrationTest: "apps/worker/test/book-art-docs-release-runtime.test.mjs",`,
);
replaceExact(
  "scripts/check-book-art-docs-release.mjs",
  `  "${LEGACY_DOCS}",\n  "${LEGACY_WRITING}",\n  "${LEGACY_ART}",`,
  `  "${CURRENT_DOCS}",\n  "${LEGACY_DOCS}",\n  "${CURRENT_WRITING}",\n  "${LEGACY_WRITING}",\n  "${CURRENT_ART_BASE}",\n  "${LEGACY_ART}",`,
);
replaceExact(
  "scripts/check-book-art-docs-release.mjs",
  `  "Docs release REST rejects caller provider policy and tampered receipt",\n]) {`,
  `  "Docs release REST rejects caller provider policy and tampered receipt",\n  "Docs release REST submit can be reconciled through exact provider inspection",\n]) {`,
);
insertBefore(
  "scripts/check-book-art-docs-release.mjs",
  `requireTokens("openapi", [`,
  `requireTokens("workerIntegrationTest", [\n  "executes one verified Docs cover release through the provider worker and immutable inspection",\n  "submitDocsBookArtReleaseShadowJob",\n  "RuntimeWorker",\n  "inspectBookArtProviderShadowJob",\n  "candidateArtifactObserved",\n  "providerEvidenceObserved",\n  "approvalState, \"unapproved\"",\n  "providerFallbackAllowed",\n  "publicationPerformed",\n]);\n\n`,
);
replaceExact(
  "scripts/check-book-art-docs-release.mjs",
  `  "${LEGACY_DOCS}",\n  "requiresReadyForArtShadowRelease: { const: true }",`,
  `  "${CURRENT_DOCS}",\n  "${LEGACY_DOCS}",\n  "requiresReadyForArtShadowRelease: { const: true }",`,
);
replaceExact(
  "scripts/check-book-art-docs-release.mjs",
  `  docsSuiteCommit: "${LEGACY_DOCS}",\n  writingStudioCommit: "${LEGACY_WRITING}",\n  artStudioReceiverCommit: "${LEGACY_ART}",`,
  `  docsSuiteCommit: "${CURRENT_DOCS}",\n  writingStudioCommit: "${CURRENT_WRITING}",\n  artStudioReceiverCommit: "${CURRENT_ART_BASE}",\n  retainedLegacyDocsSuiteCommit: "${LEGACY_DOCS}",\n  retainedLegacyWritingStudioCommit: "${LEGACY_WRITING}",\n  retainedLegacyArtStudioReceiverCommit: "${LEGACY_ART}",\n  providerWorkerExecutionAndImmutableInspectionCovered: true,`,
);

replaceExact(
  ".github/workflows/book-art-docs-release.yml",
  `      - "apps/api/test/book-art-docs-release-openapi-contract.test.mjs"\n      - "apps/cli/src/book-art-commands.ts"`,
  `      - "apps/api/test/book-art-docs-release-openapi-contract.test.mjs"\n      - "apps/worker/src/provider-handlers.ts"\n      - "apps/worker/test/book-art-docs-release-runtime.test.mjs"\n      - "apps/cli/src/book-art-commands.ts"`,
);
replaceExact(
  ".github/workflows/book-art-docs-release.yml",
  `      - name: Run Docs release REST and OpenAPI attacks\n        run: pnpm --filter @evavo/art-studio-api test\n\n      - name: Run Docs release CLI attacks`,
  `      - name: Run Docs release REST and OpenAPI attacks\n        run: pnpm --filter @evavo/art-studio-api test\n\n      - name: Run Docs release provider-worker and immutable-inspection integration attacks\n        run: pnpm --filter @evavo/art-studio-worker test\n\n      - name: Run Docs release CLI attacks`,
);

replaceExact(
  "docs/book-art-docs-release.md",
  `Status: shadow-only receiver; no production cutover  \nReviewed: 3 August 2026`,
  `Status: active candidate-production receiver; approval and publication remain gated  \nReviewed: 5 August 2026`,
);
replaceExact(
  "docs/book-art-docs-release.md",
  `EVAVO-STUDIO/evavo-writing-studio\n${LEGACY_WRITING}\n\nEVAVO-STUDIO/evavo-docs-suite\n${LEGACY_DOCS}\n\nEVAVO-STUDIO/evavo-art-studio\n${LEGACY_ART}`,
  `EVAVO-STUDIO/evavo-writing-studio\n${CURRENT_WRITING}\n\nEVAVO-STUDIO/evavo-docs-suite\n${CURRENT_DOCS}\n\nEVAVO-STUDIO/evavo-art-studio\n${CURRENT_ART_BASE}\n\nRetained reviewed compatibility baselines\n${LEGACY_WRITING}\n${LEGACY_DOCS}\n${LEGACY_ART}`,
);
replaceExact(
  "docs/book-art-docs-release.md",
  `A later provider worker may store one unapproved intermediate candidate and evidence. That candidate is not final.`,
  `The durable provider worker may execute the queued job, store exactly one unapproved intermediate candidate plus immutable provider evidence, and expose both through the authenticated provider-inspection proof. Docs Suite can therefore reconcile a deterministic release from submission through verified candidate bytes without resubmitting an ambiguous job. That candidate is not final.`,
);

const workerTestPath = path.join(
  root,
  "apps/worker/test/book-art-docs-release-runtime.test.mjs",
);
if (existsSync(workerTestPath)) {
  throw new Error("apps/worker/test/book-art-docs-release-runtime.test.mjs already exists.");
}
writeFileSync(
  workerTestPath,
  `import assert from "node:assert/strict";\nimport { mkdtemp, rm } from "node:fs/promises";\nimport os from "node:os";\nimport path from "node:path";\nimport test from "node:test";\n\nimport { LocalArtifactStore } from "@evavo/art-artifacts";\nimport {\n  ART_STUDIO_DOCS_BOOK_RELEASE_CONTRACT,\n  DOCS_BOOK_WRITING_ART_LINK_CONTRACT,\n  DOCS_BOOK_WRITING_ART_RELEASE_CONTRACT,\n  fingerprintBookArtBrief,\n  fingerprintDocsBookWritingArtReleaseReceipt,\n} from "@evavo/art-contracts";\nimport {\n  compileBookArtProviderShadowJob,\n} from "@evavo/art-book-runtime";\nimport {\n  submitDocsBookArtReleaseShadowJob,\n} from "@evavo/art-book-runtime/docs-release";\nimport {\n  inspectBookArtProviderShadowJob,\n} from "@evavo/art-book-runtime/inspection";\nimport {\n  FixtureImageProviderAdapter,\n  ProviderRegistry,\n} from "@evavo/art-providers";\nimport { LocalRuntimeRepository, RuntimeWorker } from "@evavo/art-runtime";\n\nimport {\n  createProviderHandlers,\n  providerWorkerCapabilities,\n} from "../dist/provider-handlers.js";\n\nconst sha = (character) => \\`sha256:\${character.repeat(64)}\\`;\nconst adapterPolicy = {\n  allowedAdapterIds: ["fixture-image"],\n  preferredAdapterId: "fixture-image",\n  preferredModel: "fixture-transparent-v1",\n};\n\nclass CountingFixtureImageProviderAdapter extends FixtureImageProviderAdapter {\n  calls = 0;\n\n  async execute(resolved, context) {\n    this.calls += 1;\n    return super.execute(resolved, context);\n  }\n}\n\nasync function releaseInput() {\n  const evidence = [\n    "evidence:authoring:1",\n    sha("1"),\n    sha("2"),\n    sha("3"),\n    sha("4"),\n    sha("5"),\n  ].sort();\n  const finalArtBrief = {\n    outputKind: "evavo_book_art_brief",\n    schemaVersion: 1,\n    contract: "evavo_book_art_handoff_v1",\n    identity: {\n      workspaceId: "workspace:wren",\n      projectId: "project:wren",\n      bookId: "volume:wren:1",\n      editionId: "edition:wren:paperback",\n      requestId: "art-request:wren:cover:worker-release:1",\n    },\n    purpose: "front_cover_art",\n    manuscript: {\n      manuscriptRevisionId: "revision:wren:8",\n      manuscriptSha256: sha("a"),\n      extractedTextSha256: sha("b"),\n      visualCanonSha256: sha("c"),\n      artDirectionSha256: sha("d"),\n      approvedEvidenceIds: evidence,\n    },\n    conceptTerritoryId: "territory:wren:cover:1",\n    conceptTerritoryLabel: "Weathered coastal memory",\n    creativeThesis:\n      "A restrained maritime image binds the revised manuscript to a durable text-free cover field.",\n    primarySubject: "A weathered coastal signal tower",\n    supportingSubjects: ["low winter sea", "distant working vessel"],\n    compositionRequirements: [\n      "Keep the principal silhouette in the lower-left third.",\n      "Reserve calm negative space for editable title typography.",\n    ],\n    mustShow: ["historically credible maritime materials"],\n    mustNotShow: ["generated title text", "modern navigation equipment"],\n    spoilerRestrictions: ["Do not reveal the final harbour confrontation."],\n    continuityRequirements: [\n      "Match the approved tower and vessel descriptions in the visual canon.",\n    ],\n    historicalAndMaterialRequirements: [\n      "Use period-correct timber, iron and masonry construction.",\n    ],\n    negativeSpaceRequirements: ["Keep the upper third visually quiet."],\n    output: {\n      widthPx: 1800,\n      heightPx: 2700,\n      minimumPpi: 300,\n      allowedMimeTypes: ["image/png", "image/tiff"],\n      colourIntent: "cmyk_conversion_required",\n      alpha: "forbidden",\n      textPolicy: "text_free",\n      printUse: true,\n      digitalUse: true,\n    },\n    rightsEvidenceIds: ["rights:wren:commercial:1"],\n    createdAt: "2026-08-05T00:55:00.000Z",\n    briefFingerprint: "",\n    providerCandidateMayBeFinal: false,\n    publicationPerformed: false,\n  };\n  finalArtBrief.briefFingerprint = await fingerprintBookArtBrief(finalArtBrief);\n  const unsignedReceipt = {\n    outputKind: "evavo_docs_book_writing_art_release_receipt",\n    schemaVersion: 1,\n    contract: DOCS_BOOK_WRITING_ART_RELEASE_CONTRACT,\n    status: "ready_for_art_shadow",\n    linkContract: DOCS_BOOK_WRITING_ART_LINK_CONTRACT,\n    linkFingerprint: sha("1"),\n    mutationId: "mutation:wren:8",\n    canonicalMutationPlanFingerprint: sha("2"),\n    websiteMutationReceiptFingerprint: sha("3"),\n    websiteMutationImportFingerprint: sha("4"),\n    projectId: finalArtBrief.identity.projectId,\n    programmeId: "programme:wren",\n    volumeId: finalArtBrief.identity.bookId,\n    manuscriptRevisionId: finalArtBrief.manuscript.manuscriptRevisionId,\n    manuscriptSha256: finalArtBrief.manuscript.manuscriptSha256,\n    draftArtBriefFingerprint: sha("5"),\n    finalArtBriefFingerprint: finalArtBrief.briefFingerprint,\n    writingStudioMainCommit: "${CURRENT_WRITING}",\n    artStudioMainCommit: "${CURRENT_ART_BASE}",\n    releasedAt: "2026-08-05T01:00:00.000Z",\n    releasedBy: "docs-suite-unattended-art-production",\n    requiredEvidenceIds: evidence,\n    blockers: [],\n    requiredActions: [],\n    websiteCanonicalMutationVerified: true,\n    exactFinalArtBriefVerified: true,\n    writingStudioMayCallArtStudioDirectly: false,\n    docsSuiteCanonicalWriterEnabled: false,\n    artStudioCandidateMayBeFinal: false,\n    selectionRequired: true,\n    promotionRequired: true,\n    bookUseBindingRequired: true,\n    runtimeCutoverApproved: false,\n    publicationPerformed: false,\n  };\n  const releaseReceipt = {\n    ...unsignedReceipt,\n    releaseFingerprint:\n      await fingerprintDocsBookWritingArtReleaseReceipt(unsignedReceipt),\n  };\n  return {\n    outputKind: "evavo_docs_book_art_release_shadow_job_input",\n    schemaVersion: 1,\n    executionId: "execution:wren:cover:worker-release:1",\n    requestedAt: "2026-08-05T01:06:00.000Z",\n    release: {\n      outputKind: "evavo_art_studio_docs_book_release_envelope",\n      schemaVersion: 1,\n      contract: ART_STUDIO_DOCS_BOOK_RELEASE_CONTRACT,\n      sourceRepository: "EVAVO-STUDIO/evavo-docs-suite",\n      targetRepository: "EVAVO-STUDIO/evavo-art-studio",\n      docsSuiteCommit: "${CURRENT_DOCS}",\n      receivedAt: "2026-08-05T01:05:00.000Z",\n      releaseReceipt,\n      finalArtBrief,\n      crossRepositoryRuntimeSourceImportAllowed: false,\n      writingStudioMayCallArtStudioDirectly: false,\n      authoritativeBookWritesAllowed: false,\n      runtimeCutoverApproved: false,\n      publicationPerformed: false,\n    },\n    adapterPolicy,\n  };\n}\n\ntest("executes one verified Docs cover release through the provider worker and immutable inspection", async () => {\n  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-docs-cover-worker-"));\n  try {\n    const runtime = new LocalRuntimeRepository({ root: path.join(root, "runtime") });\n    const artifacts = new LocalArtifactStore({ root: path.join(root, "artifacts") });\n    const adapter = new CountingFixtureImageProviderAdapter();\n    const registry = new ProviderRegistry([adapter]);\n    const input = await releaseInput();\n\n    const submitted = await submitDocsBookArtReleaseShadowJob(input, {\n      runtime,\n      actor: "docs-suite-unattended-art-production",\n      now: new Date("2026-08-05T01:06:00.000Z"),\n    });\n    assert.equal(submitted.status, "submitted", submitted.blockers.join("\\n"));\n    assert.ok(submitted.release.workOrder);\n    assert.ok(submitted.job);\n\n    const providerInput = {\n      outputKind: "evavo_book_art_provider_shadow_job_input",\n      schemaVersion: 1,\n      executionId: input.executionId,\n      requestedAt: input.requestedAt,\n      workOrder: submitted.release.workOrder,\n      adapterPolicy,\n    };\n    const compilation = await compileBookArtProviderShadowJob(providerInput);\n    assert.equal(compilation.status, "ready", compilation.blockers.join("\\n"));\n\n    const pending = await inspectBookArtProviderShadowJob(compilation, {\n      runtime,\n      artifacts,\n    });\n    assert.equal(pending.status, "pending");\n    assert.equal(pending.runtimeJob.jobId, submitted.job.id);\n\n    const worker = new RuntimeWorker({\n      runtime,\n      artifacts,\n      worker: {\n        id: "book-art-docs-release-fixture-worker",\n        capabilities: providerWorkerCapabilities(registry),\n        queues: ["provider"],\n      },\n      handlers: createProviderHandlers(registry),\n    });\n    const run = await worker.runOnce();\n    assert.deepEqual(run, {\n      claimed: 1,\n      succeeded: 1,\n      failed: 0,\n      cancelled: 0,\n      paused: 0,\n    });\n    assert.equal(adapter.calls, 1);\n\n    const inspection = await inspectBookArtProviderShadowJob(compilation, {\n      runtime,\n      artifacts,\n    });\n    assert.equal(inspection.status, "succeeded", inspection.blockers.join("\\n"));\n    assert.equal(inspection.providerExecutionObserved, true);\n    assert.equal(inspection.candidateArtifactObserved, true);\n    assert.equal(inspection.providerEvidenceObserved, true);\n    assert.equal(inspection.runtimeJob.jobId, submitted.job.id);\n    assert.equal(inspection.runtimeJob.attemptLimit, 1);\n    assert.equal(inspection.runtimeJob.attemptCount, 1);\n    assert.equal(inspection.candidate.storageClass, "intermediate");\n    assert.equal(inspection.candidate.approvalState, "unapproved");\n    assert.equal(inspection.providerCallPerformedByInspection, false);\n    assert.equal(inspection.candidateArtifactsWrittenByInspection, false);\n    assert.equal(inspection.authoritativeBookWritesPerformed, false);\n    assert.equal(inspection.selectionPerformed, false);\n    assert.equal(inspection.promotionPerformed, false);\n    assert.equal(inspection.bookUseBindingCreated, false);\n    assert.equal(inspection.runtimeCutoverApproved, false);\n    assert.equal(inspection.publicationPerformed, false);\n\n    const duplicate = await submitDocsBookArtReleaseShadowJob(\n      structuredClone(input),\n      {\n        runtime,\n        actor: "docs-suite-unattended-art-production:reconcile",\n        now: new Date("2026-08-05T01:07:00.000Z"),\n      },\n    );\n    assert.equal(duplicate.status, "submitted");\n    assert.equal(duplicate.job.id, submitted.job.id);\n    assert.equal((await runtime.list()).length, 1);\n    assert.equal((await worker.runOnce()).claimed, 0);\n    assert.equal(adapter.calls, 1);\n\n    const providerFallbackAllowed =\n      submitted.plan.normalizedProviderRequest.selection.allowFallback;\n    assert.equal(providerFallbackAllowed, false);\n  } finally {\n    await rm(root, { recursive: true, force: true });\n  }\n});\n`,
  "utf8",
);

console.log(JSON.stringify({
  status: "PATCHED",
  docsSuiteCommit: CURRENT_DOCS,
  writingStudioCommit: CURRENT_WRITING,
  artStudioCompatibilityBase: CURRENT_ART_BASE,
  retainedLegacyCompatibility: true,
  providerWorkerExecutionAndImmutableInspectionCovered: true,
}, null, 2));
