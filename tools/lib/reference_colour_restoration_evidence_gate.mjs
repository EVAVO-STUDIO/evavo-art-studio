import { readFile } from "node:fs/promises";
import path from "node:path";

const BRIDGE_CONTRACT = "evavo.reference-colour-restoration-bridge.v1";
const PROVIDER_ID = "evavo-image-enhancement-studio:reference-colourization-v1";
const AUTH_CONTRACT = "evavo.reference-colourization-authorization.v1";
const VARIANT_SET_CONTRACT = "reference_colourization_variant_set_v1";
const QA_CONTRACT = "reference_colourization_qa_v1";
const REVIEW_CONTRACT = "evavo.enhancement-art-review.v1";
const EXPECTED_VARIANTS = Object.freeze(["conservative", "balanced", "rich"]);
const SHA256 = /^[a-f0-9]{64}$/u;

function fail(message) {
  throw new Error(`Reference-colour evidence gate rejected result: ${message}`);
}

function record(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be an object`);
  return value;
}

function sha(value, label) {
  if (typeof value !== "string" || !SHA256.test(value)) fail(`${label} must be a lowercase SHA-256 digest`);
  return value;
}

function canonical(value) {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function samePath(actual, expected, label) {
  if (typeof actual !== "string" || canonical(actual) !== canonical(expected)) {
    fail(`${label} path does not match its admitted create-only location`);
  }
}

function assertAuthority(value, label) {
  const item = record(value, label);
  for (const field of [
    "real_reference_confirmed",
    "human_reference_match_confirmed",
    "reference_guided_colorization_allowed",
    "explicit_approval_required",
  ]) {
    if (item[field] !== true) fail(`${label}.${field} must remain true`);
  }
  for (const field of [
    "automatic_colorization_allowed",
    "invented_colour_allowed",
    "generative_repair_allowed",
    "synthetic_detail_allowed",
  ]) {
    if (item[field] !== false) fail(`${label}.${field} must remain false`);
  }
  if (item.authorization !== undefined) {
    const authorization = record(item.authorization, `${label}.authorization`);
    if (authorization.contract !== AUTH_CONTRACT) fail(`${label}.authorization contract drifted`);
    if (authorization.reference_guided_colorization_allowed !== true) fail(`${label}.authorization must allow only reference-guided colourization`);
    if (authorization.explicit_approval_required !== true) fail(`${label}.authorization must require explicit approval`);
    for (const field of ["automatic_colorization_allowed", "invented_colour_allowed", "generative_repair_allowed", "synthetic_detail_allowed"]) {
      if (authorization[field] !== false) fail(`${label}.authorization.${field} must remain false`);
    }
  }
  return item;
}

function assertBindings(result) {
  if (result.contract !== BRIDGE_CONTRACT) fail("bridge contract drifted");
  if (result.providerId !== PROVIDER_ID) fail("provider id drifted");
  const source = record(result.sourceBinding, "sourceBinding");
  const reference = record(result.colourReferenceBinding, "colourReferenceBinding");
  sha(source.sha256, "sourceBinding.sha256");
  sha(reference.sha256, "colourReferenceBinding.sha256");
  if (source.sha256 === reference.sha256) fail("source and colour reference bytes must be distinct");
  if (reference.referenceIsRealPhotograph !== true) fail("colour reference must remain confirmed as a real photograph");
  if (reference.subjectMatchConfirmedByHuman !== true) fail("same-subject confirmation must remain human-confirmed");
  if (result.sourceMutationAllowed !== false || result.generativeFallbackAllowed !== false) fail("bridge authority boundary widened");
  return { source, reference };
}

function assertProviderPlan(result, bindings) {
  const plan = record(result.providerPlan, "providerPlan");
  if (plan.sourceSha256 !== bindings.source.sha256) fail("providerPlan source SHA does not match bound source");
  if (plan.referenceSha256 !== bindings.reference.sha256) fail("providerPlan reference SHA does not match bound colour reference");
  if (!Number.isInteger(plan.width) || plan.width < 1 || plan.width > 32768) fail("providerPlan width is invalid");
  if (!Number.isInteger(plan.height) || plan.height < 1 || plan.height > 32768) fail("providerPlan height is invalid");
  if (plan.sourceLuminanceIsMaster !== true) fail("source luminance must remain authoritative");
  if (plan.referenceGuidedColorizationAllowed !== true || plan.explicitApprovalRequired !== true) fail("providerPlan reference-guided/approval authority drifted");
  for (const field of ["backgroundColourized", "clothingColourized", "learnedExecutionUsed", "generativeExecutionUsed", "automaticColorizationAllowed", "inventedColourAllowed", "generativeRepairAllowed", "syntheticDetailAllowed"]) {
    if (plan[field] !== false) fail(`providerPlan.${field} must remain false`);
  }
  const authorization = record(plan.authorization, "providerPlan.authorization");
  if (authorization.contract !== AUTH_CONTRACT) fail("providerPlan.authorization contract drifted");
  if (authorization.reference_guided_colorization_allowed !== true || authorization.explicit_approval_required !== true) fail("providerPlan.authorization widened or removed approval boundaries");
  for (const field of ["automatic_colorization_allowed", "invented_colour_allowed", "generative_repair_allowed", "synthetic_detail_allowed"]) {
    if (authorization[field] !== false) fail(`providerPlan.authorization.${field} must remain false`);
  }
  return plan;
}

export function assertReferenceColourRestorationPlanResult(value) {
  const result = record(value, "plan result");
  const bindings = assertBindings(result);
  assertProviderPlan(result, bindings);
  if (result.executionPerformed !== false || result.writesPerformed !== false) fail("plan result must remain read-only");
  if (result.automaticWinnerSelectionAllowed !== false || result.humanFinalSelectionRequired !== true) fail("plan result widened creative-selection authority");
  return Object.freeze({ ...result, evidenceGatePassed: true, evidenceGateContract: "evavo.reference-colour-restoration-evidence-gate.v1" });
}

async function readJson(filePath, label) {
  let value;
  try {
    value = JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    fail(`${label} is unreadable or invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  return record(value, label);
}

export async function assertReferenceColourRestorationExecutionResult(value) {
  const result = record(value, "execution result");
  const bindings = assertBindings(result);
  const plan = assertProviderPlan(result, bindings);
  if (result.providerVariantSetContract !== VARIANT_SET_CONTRACT) fail("variant-set contract drifted");
  if (result.executionPerformed !== true || result.writesPerformed !== true || result.sourceMutated !== false) fail("execution receipt is missing create-only/source-immutable evidence");
  for (const field of ["generativeExecutionUsed", "generativeFallbackAllowed", "learnedRepaintUsed", "inventedColourAllowed", "automaticWinnerSelected", "automaticCreativeApprovalGranted", "publicationAllowed", "cloudOverwriteAllowed"]) {
    if (result[field] !== false) fail(`execution result ${field} must remain false`);
  }
  if (result.humanFinalSelectionRequired !== true) fail("human final selection must remain required");
  if (!Array.isArray(result.variants) || result.variants.length !== EXPECTED_VARIANTS.length) fail("execution must contain exactly three review candidates");
  const ids = result.variants.map((item) => item?.id).sort();
  if (JSON.stringify(ids) !== JSON.stringify([...EXPECTED_VARIANTS].sort())) fail("candidate IDs must be conservative, balanced and rich");

  for (const variant of result.variants) {
    const item = record(variant, "variant");
    const expectedCandidate = path.join(result.outputDir, `${result.prefix}-${item.id}.png`);
    const candidate = record(item.candidateBinding, `variant ${item.id} candidateBinding`);
    samePath(candidate.path, expectedCandidate, `variant ${item.id} candidate`);
    sha(candidate.sha256, `variant ${item.id} candidate SHA`);
    const receipt = assertAuthority(record(item.providerReceipt, `variant ${item.id} providerReceipt`), `variant ${item.id} providerReceipt`);
    if (receipt.source_sha256 !== bindings.source.sha256 || receipt.reference_sha256 !== bindings.reference.sha256) fail(`variant ${item.id} receipt is not bound to admitted source/reference bytes`);
    if (receipt.output_sha256 !== candidate.sha256) fail(`variant ${item.id} receipt SHA does not match candidate bytes`);

    const qa = await readJson(item.technicalQaPath, `variant ${item.id} technical QA`);
    if (qa.contract_version !== QA_CONTRACT || qa.review_required !== true) fail(`variant ${item.id} QA contract/review requirement drifted`);
    if (qa.source_sha256 !== bindings.source.sha256 || qa.candidate_sha256 !== candidate.sha256) fail(`variant ${item.id} QA is not bound to exact source/candidate bytes`);
    if (qa.width !== plan.width || qa.height !== plan.height) fail(`variant ${item.id} QA dimensions drifted from provider plan`);

    const manifest = await readJson(item.artStudioReviewManifestPath, `variant ${item.id} Art Studio review manifest`);
    if (manifest.contract !== REVIEW_CONTRACT) fail(`variant ${item.id} Art Studio review contract drifted`);
    samePath(manifest.source_path, bindings.source.path, `variant ${item.id} manifest source`);
    samePath(manifest.candidate_path, candidate.path, `variant ${item.id} manifest candidate`);
    if (manifest.source_sha256 !== bindings.source.sha256 || manifest.candidate_sha256 !== candidate.sha256) fail(`variant ${item.id} review manifest is not byte-bound`);
    if (manifest.art_studio_review_profile !== "photo" || manifest.intended_role !== "photo") fail(`variant ${item.id} must enter the photo review route`);
    if (manifest.learned_candidate !== false || manifest.source_immutable !== true || manifest.candidate_is_review_only !== true || manifest.art_studio_visual_review_required !== true) fail(`variant ${item.id} review manifest weakened source/review boundaries`);
    for (const field of ["publication_allowed", "cloud_overwrite_allowed", "automatic_creative_approval", "automatic_release_approval"]) {
      if (manifest[field] !== false) fail(`variant ${item.id} manifest ${field} must remain false`);
    }
  }

  return Object.freeze({ ...result, evidenceGatePassed: true, evidenceGateContract: "evavo.reference-colour-restoration-evidence-gate.v1" });
}
