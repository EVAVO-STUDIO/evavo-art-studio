import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeJson,
  sha256,
  stableStringify,
} from "@evavo/art-artifacts";
import { BOOK_CREATIVE_DIRECTION_CONTRACT } from "@evavo/art-contracts";
import { normalizeRuntimeJobSubmission } from "@evavo/art-runtime";
import {
  BOOK_ART_CREATIVE_CANDIDATE_PROGRAMME_CONTRACT,
  compileBookArtCreativeCandidateProgramme,
} from "../dist/creative-candidate-programme.js";
import {
  BOOK_ART_CREATIVE_PROGRAMME_DISPATCH_CONTRACT,
  compileBookArtCreativeProgrammeDispatch,
  submitBookArtCreativeProgrammeDispatch,
} from "../dist/creative-candidate-programme-dispatch.js";

const digest = (value) => `sha256:${value.repeat(64)}`;
const evidence = (evidenceId, label, extra = {}) => ({
  evidenceId,
  label,
  meaning: `${label} changes the reader's understanding of power and consequence.`,
  importance: 90,
  sourceLocationIds: [`chapter-1:${evidenceId}`],
  ...extra,
});

function creativeInput(overrides = {}) {
  return {
    outputKind: "evavo_art_book_creative_direction_input",
    schemaVersion: 1,
    contract: BOOK_CREATIVE_DIRECTION_CONTRACT,
    identity: {
      workspaceId: "workspace-one",
      projectId: "project-one",
      bookId: "book-one",
      editionId: "edition-one",
      requestId: "request-one",
    },
    purpose: "front_cover_art",
    manuscript: {
      manuscriptRevisionId: "revision-one",
      manuscriptSha256: digest("1"),
      extractedTextSha256: digest("2"),
      visualCanonSha256: digest("3"),
      artDirectionSha256: digest("4"),
      approvedEvidenceIds: [
        "rights-one",
        "theme-duty",
        "theme-debt",
        "motif-key",
        "setting-archive",
        "character-mara",
        "scene-door",
        "scene-ledger",
      ],
    },
    output: {
      widthPx: 1800,
      heightPx: 2700,
      minimumPpi: 300,
      allowedMimeTypes: ["image/png"],
      colourIntent: "cmyk_conversion_required",
      alpha: "forbidden",
      textPolicy: "text_free",
      printUse: true,
      digitalUse: true,
    },
    contentClass: "historical literary fiction",
    primaryGenre: "historical",
    audience: "adult readers who expect historically grounded literary fiction",
    centralConflict:
      "Mara must choose whether protecting an ally justifies preserving an institution built on concealed debt.",
    emotionalPromise:
      "restrained dread, moral pressure and the cost of a decision that cannot be undone",
    themes: [
      evidence("theme-duty", "duty against complicity"),
      evidence("theme-debt", "inherited debt"),
    ],
    motifs: [
      evidence("motif-key", "the archive key", {
        visualForms: ["worn iron key", "key-shaped absence in dust"],
      }),
    ],
    settings: [
      evidence("setting-archive", "the flooded municipal archive", {
        architecture: ["cast-iron galleries", "water-marked brick vaults"],
        materials: ["oxidised iron", "wet brick", "rag paper"],
      }),
    ],
    characters: [
      evidence("character-mara", "Mara", {
        role: "junior archivist",
        silhouette: "tall coat with one weighted shoulder",
        props: ["iron key", "oil lantern"],
        contradiction: "outward procedural calm against private refusal",
      }),
    ],
    scenes: [
      evidence("scene-door", "Mara before the sealed archive door", {
        spoilerLevel: "none",
        physicalAction: "her hand stops short of turning the key",
        beforeOrAftermath: "water rises around the locked threshold",
      }),
      evidence("scene-ledger", "the ledger discovered beneath floodwater", {
        spoilerLevel: "minor",
        physicalAction: "the ledger surfaces between broken shelves",
        beforeOrAftermath: "ink begins to bleed before it can be copied",
      }),
    ],
    continuityRequirements: [
      "Mara's coat remains dark wool with a repaired left cuff.",
      "The archive key is hand-forged iron, not brass.",
    ],
    materialRequirements: [
      "1870s cast iron, rag paper, lime mortar and whale-oil practical light.",
    ],
    rightsEvidenceIds: ["rights-one"],
    aestheticIntent:
      "front-facing print composition with robust engraving contours, material-specific hatching, controlled black masses and quiet typography space",
    allowedProcessFamilies: [
      "relief_engraving",
      "intaglio_etching",
      "lithographic_tone",
    ],
    routeCount: 3,
    titleZone: "top",
    authorZone: "lower_third",
    minimumQuietAreaPercent: 30,
    namedCreatorReferences: [],
    brandedFranchiseReferences: [],
    requestedAt: "2026-08-07T00:00:00.000Z",
    requestedBy: "book-art-supervisor",
    providerCallAllowed: false,
    automaticSelectionAllowed: false,
    automaticPromotionAllowed: false,
    publicationAllowed: false,
    ...overrides,
  };
}

function programmeInput(overrides = {}) {
  return {
    outputKind: "evavo_book_art_creative_candidate_programme_input",
    schemaVersion: 1,
    contract: BOOK_ART_CREATIVE_CANDIDATE_PROGRAMME_CONTRACT,
    creativeDirectionInput: creativeInput(),
    requestedAt: "2026-08-07T02:00:00.000Z",
    requestedBy: "book-art-supervisor",
    adapterPolicy: {
      allowedAdapterIds: ["fixture-image"],
      preferredAdapterId: "fixture-image",
      preferredModel: "fixture-model-v1",
    },
    providerFallbackAllowed: false,
    bulkSubmissionAllowed: false,
    partialProgrammeExecutionAllowed: false,
    automaticSelectionAllowed: false,
    automaticPromotionAllowed: false,
    publicationAllowed: false,
    ...overrides,
  };
}

async function programme() {
  const result = await compileBookArtCreativeCandidateProgramme(programmeInput());
  assert.equal(result.status, "ready", result.blockers.join("\n"));
  return structuredClone(result.programme);
}

function dispatchInput(programmeValue, overrides = {}) {
  return {
    outputKind: "evavo_book_art_creative_candidate_programme_dispatch_input",
    schemaVersion: 1,
    contract: BOOK_ART_CREATIVE_PROGRAMME_DISPATCH_CONTRACT,
    programme: programmeValue,
    expectedProgrammeFingerprintSha256:
      programmeValue.programmeFingerprintSha256,
    partialProgrammeSubmissionAllowed: false,
    providerFallbackAllowed: false,
    automaticSelectionAllowed: false,
    automaticPromotionAllowed: false,
    publicationAllowed: false,
    ...overrides,
  };
}

function refingerprint(programmeValue) {
  const {
    programmeFingerprintSha256: _ignored,
    ...unsigned
  } = programmeValue;
  programmeValue.programmeFingerprintSha256 = sha256(
    stableStringify(normalizeJson(unsigned)),
  );
  return programmeValue;
}

function fakeRuntime(options = {}) {
  const calls = {
    submit: 0,
    submitBatch: 0,
    batches: [],
  };
  return {
    calls,
    async submit() {
      calls.submit += 1;
      throw new Error("single-job submission must not be used");
    },
    async submitBatch(submissions, actor, now) {
      calls.submitBatch += 1;
      calls.batches.push({ submissions, actor, now });
      if (options.failBatch) throw new Error("fixture batch failure");
      const jobs = submissions.map((submission) => {
        const normalized = normalizeRuntimeJobSubmission(submission);
        return {
          id: normalized.spec.id,
          specHash: normalized.specHash,
          spec: normalized.spec,
        };
      });
      return options.mutateJobs ? options.mutateJobs(jobs) : jobs;
    },
  };
}

test("compiles one complete route-aware runtime batch", async () => {
  const value = await programme();
  const result = await compileBookArtCreativeProgrammeDispatch(
    dispatchInput(value),
  );
  assert.equal(result.status, "ready", result.blockers.join("\n"));
  assert.equal(result.plan.routeCount, value.routeCount);
  assert.equal(result.plan.runtimeSubmissions.length, value.routeCount);
  assert.equal(result.plan.routeDispatches.length, value.routeCount);
  assert.equal(result.plan.singleRuntimeBatchRequired, true);
  assert.equal(result.plan.partialProgrammeSubmissionAllowed, false);
  assert.equal(new Set(result.plan.routeDispatches.map(
    (route) => route.runtimeJobId,
  )).size, value.routeCount);
});

test("submits every creative route through exactly one runtime batch", async () => {
  const value = await programme();
  const runtime = fakeRuntime();
  const result = await submitBookArtCreativeProgrammeDispatch(
    dispatchInput(value),
    {
      runtime,
      actor: "book-art-supervisor",
      now: new Date("2026-08-07T03:30:00.000Z"),
    },
  );
  assert.equal(result.status, "submitted", result.blockers.join("\n"));
  assert.equal(runtime.calls.submit, 0);
  assert.equal(runtime.calls.submitBatch, 1);
  assert.equal(runtime.calls.batches[0].submissions.length, value.routeCount);
  assert.equal(result.receipt.singleRuntimeBatchVerified, true);
  assert.equal(result.receipt.completeRouteSetVerified, true);
  assert.equal(result.receipt.exactRuntimeSpecsVerified, true);
  assert.equal(result.receipt.partialProgrammeAuthorityAllowed, false);
  assert.equal(result.selectionPerformed, false);
  assert.equal(result.promotionPerformed, false);
  assert.equal(result.publicationPerformed, false);
});

test("blocks an omitted route even when the outer fingerprint is recomputed", async () => {
  const value = await programme();
  value.routePlans = value.routePlans.slice(0, -1);
  refingerprint(value);
  const runtime = fakeRuntime();
  const result = await submitBookArtCreativeProgrammeDispatch(
    dispatchInput(value),
    { runtime, actor: "book-art-supervisor" },
  );
  assert.equal(result.status, "blocked");
  assert.match(result.blockers.join(" "), /exact declared two-to-four route set/i);
  assert.equal(runtime.calls.submitBatch, 0);
});

test("blocks duplicate route substitution before any runtime submission", async () => {
  const value = await programme();
  value.routePlans[1] = structuredClone(value.routePlans[0]);
  refingerprint(value);
  const runtime = fakeRuntime();
  const result = await submitBookArtCreativeProgrammeDispatch(
    dispatchInput(value),
    { runtime, actor: "book-art-supervisor" },
  );
  assert.equal(result.status, "blocked");
  assert.match(result.blockers.join(" "), /duplicate route identities/i);
  assert.equal(runtime.calls.submitBatch, 0);
});

test("blocks nested provider-plan tampering despite a fresh outer fingerprint", async () => {
  const value = await programme();
  value.routePlans[0].providerJobPlan.runtimeSpecHash = digest("a");
  refingerprint(value);
  const runtime = fakeRuntime();
  const result = await submitBookArtCreativeProgrammeDispatch(
    dispatchInput(value),
    { runtime, actor: "book-art-supervisor" },
  );
  assert.equal(result.status, "blocked");
  assert.match(
    result.blockers.join(" "),
    /provider plan fingerprint|runtime submission identity or spec hash/i,
  );
  assert.equal(runtime.calls.submitBatch, 0);
});

test("blocks cross-programme fingerprint substitution", async () => {
  const value = await programme();
  const runtime = fakeRuntime();
  const result = await submitBookArtCreativeProgrammeDispatch(
    dispatchInput(value, {
      expectedProgrammeFingerprintSha256: digest("f"),
    }),
    { runtime, actor: "book-art-supervisor" },
  );
  assert.equal(result.status, "blocked");
  assert.match(result.blockers.join(" "), /expected programme fingerprint/i);
  assert.equal(runtime.calls.submitBatch, 0);
});

test("fails closed when the runtime batch throws", async () => {
  const value = await programme();
  const runtime = fakeRuntime({ failBatch: true });
  const result = await submitBookArtCreativeProgrammeDispatch(
    dispatchInput(value),
    { runtime, actor: "book-art-supervisor" },
  );
  assert.equal(result.status, "blocked");
  assert.match(result.blockers.join(" "), /runtime batch submission failed/i);
  assert.equal(runtime.calls.submit, 0);
  assert.equal(runtime.calls.submitBatch, 1);
  assert.equal(result.receipt, undefined);
});

test("rejects an incomplete or substituted batch response", async () => {
  const value = await programme();
  const runtime = fakeRuntime({
    mutateJobs: (jobs) => jobs.slice(0, -1),
  });
  const result = await submitBookArtCreativeProgrammeDispatch(
    dispatchInput(value),
    { runtime, actor: "book-art-supervisor" },
  );
  assert.equal(result.status, "blocked");
  assert.match(result.blockers.join(" "), /returned .* jobs for .* routes/i);
  assert.equal(result.runtimeBatchSubmitted, true);
  assert.equal(result.receipt, undefined);
});

test("does not allow authority escalation on the dispatch input", async () => {
  const value = await programme();
  const runtime = fakeRuntime();
  const result = await submitBookArtCreativeProgrammeDispatch(
    dispatchInput(value, {
      partialProgrammeSubmissionAllowed: true,
      providerFallbackAllowed: true,
      automaticSelectionAllowed: true,
      automaticPromotionAllowed: true,
      publicationAllowed: true,
    }),
    { runtime, actor: "book-art-supervisor" },
  );
  assert.equal(result.status, "blocked");
  assert.match(
    result.blockers.join(" "),
    /partialProgrammeSubmissionAllowed must remain false/i,
  );
  assert.match(
    result.blockers.join(" "),
    /providerFallbackAllowed must remain false/i,
  );
  assert.equal(runtime.calls.submitBatch, 0);
});
