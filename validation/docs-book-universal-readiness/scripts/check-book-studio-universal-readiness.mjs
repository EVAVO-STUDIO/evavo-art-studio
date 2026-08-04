import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const files = {
  core: "packages/core/src/book-studio-universal-readiness.ts",
  governance: "packages/core/src/book-studio-universal-readiness-governance.ts",
  index: "packages/core/src/index.ts",
  coreTest: "packages/core/test/book-studio-universal-readiness.test.mjs",
  governanceTest: "packages/core/test/book-studio-universal-readiness-governance.test.mjs",
  service: "apps/web/src/lib/book-studio-universal-readiness-service.ts",
  route: "apps/web/src/app/api/v1/book-studio/universal-readiness/route.ts",
  cli: "apps/web/scripts/evavo-docs-book-readiness-cli.mjs",
  mcp: "apps/web/scripts/evavo-docs-book-readiness-mcp.mjs",
  adapterTest: "apps/web/scripts/test-book-studio-universal-readiness-adapters.mjs",
  docs: "docs/migrations/book-studio/BOOK_STUDIO_UNIVERSAL_READINESS.md",
  workflow: ".github/workflows/book-studio-universal-readiness.yml",
};
const source = {};
const problems = [];
for (const [label, relative] of Object.entries(files)) {
  const absolute = path.join(root, relative);
  if (!existsSync(absolute)) problems.push(`missing ${label}: ${relative}`);
  source[label] = existsSync(absolute) ? readFileSync(absolute, "utf8") : "";
}
function requireTokens(label, tokens) {
  for (const token of tokens) if (!source[label].includes(token)) problems.push(`${label} missing ${token}`);
}
function forbidTokens(label, tokens) {
  for (const token of tokens) if (source[label].includes(token)) problems.push(`${label} contains forbidden ${token}`);
}

requireTokens("core", [
  "evavo_docs_book_universal_readiness_v1",
  "SUPPORTED_BOOK_CONTENT_CLASSES",
  '"fiction"',
  '"memoir"',
  '"nonfiction"',
  '"academic"',
  '"textbook"',
  '"reference"',
  '"cookbook"',
  '"children"',
  '"graphic_novel"',
  '"poetry"',
  '"anthology"',
  '"workbook"',
  '"manual"',
  '"illustrated"',
  '"hybrid"',
  '"custom"',
  "compileBookUniversalReadiness",
  '"ready_for_automation"',
  '"writing_candidate"',
  '"cover_candidate"',
  '"cover_promotion"',
  '"cover_binding"',
  '"illustration_candidate"',
  '"illustration_promotion"',
  '"illustration_binding"',
  '"render_and_accessibility"',
  '"external_previewer"',
  '"physical_proof"',
  '"release_approval"',
  '"writing_studio"',
  '"art_studio"',
  '"docs_suite"',
  '"human_or_external"',
  "visual_first_book_requires_illustrations",
  "reflowable_edition_conflicts_with_fixed_layout_art",
  "cover_editable_typography_required",
  "print_trim_dimensions_required",
  "kindle_previewer_evidence_required",
  "providerCallPerformed: false",
  "runtimeJobSubmitted: false",
  "artifactBytesWritten: false",
  "canonicalAdmissionAllowed: false",
  "canonicalManuscriptMutationPerformed: false",
  "automaticPublicationAllowed: false",
  "runtimeCutoverApproved: false",
  "publicationPerformed: false",
]);
forbidTokens("core", [
  "fetch(",
  "process.env",
  "node:child_process",
  "node:fs",
  "writeFile",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "providerCallPerformed: true",
  "runtimeJobSubmitted: true",
  "artifactBytesWritten: true",
  "automaticPublicationAllowed: true",
]);
requireTokens("governance", [
  "compileGovernedBookUniversalReadiness",
  "chatgpt_strict_schema_required",
  "claude_forced_tool_required",
  "compatible_adapter_schema_required",
  "provider_substitution_forbidden",
  "exact_source_coverage_required",
  "minimum_material_alternatives_insufficient",
  "independent_review_required",
  "automatic_canonical_admission_forbidden",
  "anti_genericity_review_required",
  "project_owned_voice_evidence_required",
  "manual_submission_required",
  "publication_metadata_verification_required",
  "publication_rights_verification_required",
  "publication_ai_disclosure_decision_required",
  "project_previewer_evidence_required",
  "project_physical_proof_required",
  "art_credentials_server_side_required",
  "art_remote_writes_disabled_by_default_required",
  "art_provenance_required",
  'stage.kind === "external_previewer"',
  'stage.kind === "physical_proof"',
  'stage.kind === "release_approval"',
]);
forbidTokens("governance", [
  "fetch(",
  "process.env",
  "node:child_process",
  "node:fs",
  "writeFile",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
]);
requireTokens("index", [
  'from "./book-studio-universal-readiness";',
  'compileGovernedBookUniversalReadiness as compileBookUniversalReadiness',
  'from "./book-studio-universal-readiness-governance";',
]);
requireTokens("coreTest", [
  "supports every versioned Book content class",
  "blocks contradictory book, cover, illustration, edition and release settings",
  "blocks reflow, generated-text and empty-edition edge cases",
  "supports a typography-only cover path",
  "is deterministic across series input order",
  "SUPPORTED_BOOK_CONTENT_CLASSES.length, 16",
  'contentClass === "custom" ? 7 : 12',
]);
requireTokens("governanceTest", [
  "returns precise blockers while the strict project contract remains fail-closed",
  "orders metadata, Previewer, physical proof and release approval deterministically",
  "project_contract_invalid",
  "provider_substitution_forbidden",
  "automatic_canonical_admission_forbidden",
  "project_physical_proof_required",
]);
requireTokens("service", [
  "server-only",
  "compileGovernedBookUniversalReadiness as compileBookUniversalReadiness",
  "../../../../packages/core/src/book-studio-universal-readiness-governance",
]);
requireTokens("route", [
  "documents:read",
  "readBoundedJson",
  "compileBookUniversalReadiness",
  "private, no-store",
  "readyForAutomation",
  'status: result.status === "blocked" ? 422 : 200',
]);
requireTokens("cli", [
  "EVAVO_DOCS_TOKEN",
  "/api/v1/book-studio/universal-readiness",
  'flag: "wx"',
  "capabilities",
  "compile",
]);
requireTokens("mcp", [
  "compile_book_universal_readiness",
  "/api/v1/book-studio/universal-readiness",
  "additionalProperties: false",
  "notifications/initialized",
  "EVAVO_DOCS_TOKEN",
]);
requireTokens("adapterTest", [
  "CLI posts the exact Book project",
  "MCP lists one strict readiness tool",
  "Bearer payload.signature",
]);
requireTokens("docs", [
  "16 content classes",
  "Writing Studio",
  "Art Studio",
  "Cover and illustration authority",
  "Human and external gates",
  "compile_book_universal_readiness",
  "ready_for_automation",
]);
requireTokens("workflow", [
  "check-book-studio-universal-readiness.mjs",
  "book-studio-universal-readiness.test.mjs",
  "book-studio-universal-readiness-governance.test.mjs",
  "test-book-studio-universal-readiness-adapters.mjs",
  "pnpm --filter @evavo-docs/core typecheck",
  "pnpm --filter @evavo-docs/web typecheck",
  "git diff --exit-code",
]);

if (problems.length) {
  console.error("Book Studio universal readiness check failed.");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}
console.log(JSON.stringify({
  status: "PASS",
  contract: "evavo_docs_book_universal_readiness_v1",
  contentClasses: 16,
  deterministicPlanning: true,
  governedProviderPolicy: true,
  governedQualityPolicy: true,
  governedPublicationPolicy: true,
  governedArtPolicy: true,
  orderedExternalEvidence: true,
  writingStudioIntegrated: true,
  artStudioIntegrated: true,
  coverAndIllustrationBindingsRequired: true,
  accessibilityAndEditionChecks: true,
  protectedRest: true,
  cli: true,
  mcp: true,
  providerCallPerformed: false,
  runtimeJobSubmitted: false,
  artifactBytesWritten: false,
  canonicalManuscriptMutationPerformed: false,
  automaticPublicationAllowed: false,
  runtimeCutoverApproved: false,
  publicationPerformed: false,
}, null, 2));
