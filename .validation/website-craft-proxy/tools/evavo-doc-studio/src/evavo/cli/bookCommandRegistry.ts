import type { EvavoCliCommandDef } from "./cliTypes";

/**
 * Retained Book Studio CLI surface.
 *
 * These commands were previously implemented and documented, but were lost from
 * the shared command registry during later unrelated registry work. Keep this
 * additive module separate so future document, audio and other command updates
 * cannot silently overwrite the Book Studio command set again.
 */
export const bookCliCommandRegistry: EvavoCliCommandDef[] = [
  { id: "book-workflows", group: "book", command: "book workflows", method: "GET", endpoint: "/api/book-studio/workflows", description: "List Book Studio canonical workflows and stop conditions." },
  { id: "book-review-protocol", group: "book", command: "book review-protocol", method: "GET", endpoint: "/api/books/review/protocol", description: "Show Book Studio review protocol." },
  { id: "book-review-controls", group: "book", command: "book review-controls", method: "GET", endpoint: "/api/books/review/controls", description: "List Book Studio review control profiles." },
  { id: "book-review-controls-resolve", group: "book", command: "book review-controls-resolve", method: "POST", endpoint: "/api/books/review/controls", description: "Resolve Book Studio review control overrides.", inputFile: true },
  { id: "book-review-plan", group: "book", command: "book review-plan", method: "POST", endpoint: "/api/books/review/plan", description: "Plan a Book Studio review.", inputFile: true },
  { id: "book-review-run", group: "book", command: "book review-run", method: "POST", endpoint: "/api/books/review/run-comprehensive", description: "Run a Book Studio review shell.", inputFile: true },
  { id: "book-findings-validate", group: "book", command: "book findings-validate", method: "POST", endpoint: "/api/books/review/findings/validate", description: "Validate Book Studio review findings.", inputFile: true },
  { id: "book-review-package", group: "book", command: "book review-package", method: "POST", endpoint: "/api/books/review/package", description: "Build a Book Studio review package.", inputFile: true },
  { id: "book-review-package-store", group: "book", command: "book review-package-store", method: "POST", endpoint: "/api/books/review/package/store", description: "Build and store a Book Studio review package.", inputFile: true },
  { id: "book-research-board", group: "book", command: "book research-board", method: "POST", endpoint: "/api/books/research-board", description: "Create a Book Studio research board.", inputFile: true },
  { id: "book-jobs", group: "book", command: "book jobs", method: "GET", endpoint: "/api/books/jobs", description: "List Book Studio jobs from the current local store." },
  { id: "book-job-create", group: "book", command: "book job-create", method: "POST", endpoint: "/api/books/jobs", description: "Create a Book Studio job with default workflow phases.", inputFile: true },
  { id: "book-job-summary", group: "book", command: "book job-summary", method: "POST", endpoint: "/api/books/jobs/summary", description: "Summarize a Book Studio job by jobId.", inputFile: true },
  { id: "book-job-artifact", group: "book", command: "book job-artifact", method: "POST", endpoint: "/api/books/jobs/[id]/artifacts", description: "Attach an artifact reference to a Book Studio job. Payload must include jobId or id.", inputFile: true },
  { id: "book-job-phase", group: "book", command: "book job-phase", method: "POST", endpoint: "/api/books/jobs/[id]/phase", description: "Update a Book Studio job phase. Payload must include jobId or id.", inputFile: true },
  { id: "book-ingest", group: "book", command: "book ingest", method: "POST", endpoint: "/api/books/manuscript/ingest", description: "Ingest manuscript text into ordered segments.", inputFile: true },
  { id: "book-coverage", group: "book", command: "book coverage", method: "POST", endpoint: "/api/books/manuscript/coverage", description: "Validate no-skipped-text manuscript coverage.", inputFile: true },
  { id: "book-story-bible", group: "book", command: "book story-bible", method: "POST", endpoint: "/api/books/story-bible", description: "Build story bible from manuscript segments.", inputFile: true },
  { id: "book-continuity", group: "book", command: "book continuity", method: "POST", endpoint: "/api/books/continuity-check", description: "Run story continuity checks.", inputFile: true },
  { id: "book-review-developmental", group: "book", command: "book review developmental", method: "POST", endpoint: "/api/books/review/developmental", description: "Run developmental review.", inputFile: true },
  { id: "book-review-line", group: "book", command: "book review line", method: "POST", endpoint: "/api/books/review/line-edit", description: "Run line edit review.", inputFile: true },
  { id: "book-review-copyedit", group: "book", command: "book review copyedit", method: "POST", endpoint: "/api/books/review/copyedit", description: "Run copyedit review.", inputFile: true },
  { id: "book-review-proofread", group: "book", command: "book review proofread", method: "POST", endpoint: "/api/books/review/proofread", description: "Run proofread review.", inputFile: true },
  { id: "book-revision-plan", group: "book", command: "book revision-plan", method: "POST", endpoint: "/api/books/revision-plan", description: "Build revision plan from editorial findings.", inputFile: true },
  { id: "book-write-plan", group: "book", command: "book write-plan", method: "POST", endpoint: "/api/books/write/plan", description: "Create book writing contract.", inputFile: true },
  { id: "book-write-execute", group: "book", command: "book write-execute", method: "POST", endpoint: "/api/books/write/execute", description: "Execute controlled book draft/scaffold workflow.", inputFile: true },
  { id: "book-review-draft", group: "book", command: "book review-draft", method: "POST", endpoint: "/api/books/write/review-draft", description: "Review candidate draft before editorial handoff.", inputFile: true },
  { id: "book-interior-format", group: "book", command: "book interior-format", method: "POST", endpoint: "/api/books/interior-format/execute", description: "Format manuscript interior outputs.", inputFile: true },
  { id: "book-craft-genome", group: "book", command: "book craft-genome", method: "POST", endpoint: "/api/books/write/craft-genome", description: "Compile a rights-tracked, de-identified original craft profile.", inputFile: true },
  { id: "book-craft-packet", group: "book", command: "book craft-packet", method: "POST", endpoint: "/api/books/write/craft-genome", description: "Compile a provider-neutral ChatGPT, Claude or compatible-model craft packet.", inputFile: true },
  { id: "book-craft-response-validate", group: "book", command: "book craft-response-validate", method: "POST", endpoint: "/api/books/write/craft-genome", description: "Recompile a craft packet and validate an exact provider response before phrase-overlap review.", inputFile: true },
  { id: "book-craft-overlap", group: "book", command: "book craft-overlap", method: "POST", endpoint: "/api/books/write/craft-genome", description: "Scan candidate prose against rights-tracked comparison text before canonical admission.", inputFile: true },
  { id: "book-project-compile", group: "book", command: "book project-compile", method: "POST", endpoint: "/api/books/programme/universal?operation=compile_project", description: "Compile a dependency-aware production programme for one book or any multi-volume project.", inputFile: true },
  { id: "book-project-prompt", group: "book", command: "book project-prompt", method: "POST", endpoint: "/api/books/programme/universal?operation=compile_prompt", description: "Compile a deterministic project-specific autonomous production prompt.", inputFile: true },
  { id: "book-project-plan", group: "book", command: "book project-plan", method: "POST", endpoint: "/api/books/programme/universal?operation=compile_execution_plan", description: "Compile the exact dependency-aware execution task graph for a book project.", inputFile: true },
  { id: "book-project-init", group: "book", command: "book project-init", method: "POST", endpoint: "/api/books/programme/universal?operation=initialize_execution", description: "Initialize fingerprinted resumable execution state and return the first ready task.", inputFile: true },
  { id: "book-project-next", group: "book", command: "book project-next", method: "POST", endpoint: "/api/books/programme/universal?operation=plan_next_task", description: "Validate execution state and return all dependency-ready tasks plus one deterministic next task.", inputFile: true },
  { id: "book-project-receipt", group: "book", command: "book project-receipt", method: "POST", endpoint: "/api/books/programme/universal?operation=record_task_receipt", description: "Record an exact task receipt with optimistic revision control and replan the project.", inputFile: true }
];
