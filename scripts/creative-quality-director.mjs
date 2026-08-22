import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const SAFE_ID = /^[a-z0-9][a-z0-9._-]{0,191}$/;
const SHA256 = /^sha256:[0-9a-f]{64}$/;
const SEVERITIES = new Set(["info", "warning", "blocking"]);
const LOOP_MODES = new Set(["none", "seamless", "finite-repeat"]);
const TARGETED_REPAIR_STRATEGIES = new Set([
  "source-replace",
  "metadata-adjustment",
  "layer-transform",
  "layer-recompose",
  "alpha-remaster",
  "masked-provider-inpaint",
  "manual-review",
]);

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .filter((key) => value[key] !== undefined)
        .map((key) => [key, canonical(value[key])]),
    );
  }
  return value;
}

function digest(value) {
  return `sha256:${createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex")}`;
}

function required(condition, code) {
  if (!condition) throw new Error(code);
}

function safeId(value, code) {
  required(typeof value === "string" && SAFE_ID.test(value), code);
}

function sha(value, code) {
  required(typeof value === "string" && SHA256.test(value), code);
}

function uniqueText(values, code, minimum = 1) {
  required(
    Array.isArray(values) && values.length >= minimum,
    `${code}_REQUIRED`,
  );
  const seen = new Set();
  for (const value of values) {
    required(
      typeof value === "string" &&
        value.trim() === value &&
        value.length >= 2 &&
        value.length <= 1000,
      `${code}_INVALID`,
    );
    required(!seen.has(value), `${code}_DUPLICATE`);
    seen.add(value);
  }
}

export function validateCreativeQualityProfile(profile) {
  required(
    profile?.schemaVersion === 1 &&
      profile?.kind === "evavo-art-creative-quality-profile-v1",
    "ART_DIRECTOR_PROFILE_IDENTITY_INVALID",
  );
  safeId(profile.id, "ART_DIRECTOR_PROFILE_ID_INVALID");
  required(
    profile.productionMethod === "authored-drawn-cel",
    "ART_DIRECTOR_AUTHORED_DRAWN_CEL_REQUIRED",
  );
  uniqueText(profile.reviewOrder, "ART_DIRECTOR_REVIEW_ORDER", 8);
  uniqueText(
    profile.forbiddenShortcuts,
    "ART_DIRECTOR_FORBIDDEN_SHORTCUTS",
    6,
  );
  required(
    Array.isArray(profile.failureRules) && profile.failureRules.length >= 16,
    "ART_DIRECTOR_FAILURE_RULES_REQUIRED",
  );
  const codes = new Set();
  for (const rule of profile.failureRules) {
    safeId(rule.code, "ART_DIRECTOR_FAILURE_CODE_INVALID");
    required(!codes.has(rule.code), "ART_DIRECTOR_FAILURE_CODE_DUPLICATE");
    codes.add(rule.code);
    safeId(rule.department, "ART_DIRECTOR_FAILURE_DEPARTMENT_INVALID");
    safeId(rule.intervention, "ART_DIRECTOR_FAILURE_INTERVENTION_INVALID");
    required(
      TARGETED_REPAIR_STRATEGIES.has(rule.targetedRepairStrategy),
      "ART_DIRECTOR_TARGETED_REPAIR_STRATEGY_INVALID",
    );
    required(
      typeof rule.localizedProviderRepairAllowed === "boolean",
      "ART_DIRECTOR_LOCALIZED_PROVIDER_REPAIR_POLICY_REQUIRED",
    );
    uniqueText(rule.rejectIf, "ART_DIRECTOR_REJECT_IF");
  }
  required(
    profile.loopPolicy?.modes?.length === LOOP_MODES.size,
    "ART_DIRECTOR_LOOP_MODES_INCOMPLETE",
  );
  for (const mode of LOOP_MODES) {
    required(
      profile.loopPolicy.modes.includes(mode),
      `ART_DIRECTOR_LOOP_MODE_MISSING_${mode}`,
    );
  }
  required(
    Number.isSafeInteger(profile.maximumRevisionCycles) &&
      profile.maximumRevisionCycles >= 1 &&
      profile.maximumRevisionCycles <= 8,
    "ART_DIRECTOR_MAXIMUM_REVISION_CYCLES_INVALID",
  );
  required(
    profile.authority?.providerExecution === false,
    "ART_DIRECTOR_PROVIDER_EXECUTION_MUST_BE_FALSE",
  );
  required(
    profile.authority?.automaticCreativeApproval === false,
    "ART_DIRECTOR_AUTOMATIC_APPROVAL_MUST_BE_FALSE",
  );
  required(
    profile.authority?.sourceMutation === false,
    "ART_DIRECTOR_SOURCE_MUTATION_MUST_BE_FALSE",
  );
  required(
    profile.authority?.publication === false,
    "ART_DIRECTOR_PUBLICATION_MUST_BE_FALSE",
  );
  return profile;
}

function validateLoop(loop) {
  required(
    loop && LOOP_MODES.has(loop.mode),
    "ART_DIRECTOR_LOOP_MODE_INVALID",
  );
  if (loop.mode === "none") {
    required(
      loop.boundary === undefined,
      "ART_DIRECTOR_NON_LOOP_BOUNDARY_FORBIDDEN",
    );
  }
  if (loop.mode === "seamless") {
    required(
      loop.boundary && typeof loop.boundary === "object",
      "ART_DIRECTOR_SEAMLESS_BOUNDARY_REQUIRED",
    );
    for (const key of [
      "firstFrameSha256",
      "lastFrameSha256",
      "boundaryEvidenceSha256",
    ]) {
      sha(loop.boundary[key], `ART_DIRECTOR_${key.toUpperCase()}_INVALID`);
    }
    required(
      loop.omitDuplicateTerminalFrame === true,
      "ART_DIRECTOR_DUPLICATE_TERMINAL_FRAME_MUST_BE_OMITTED",
    );
  }
  if (loop.mode === "finite-repeat") {
    required(
      Number.isSafeInteger(loop.cycleCount) &&
        loop.cycleCount >= 2 &&
        loop.cycleCount <= 64,
      "ART_DIRECTOR_CYCLE_COUNT_INVALID",
    );
    required(
      ["hold", "return-to-idle", "cut"].includes(loop.terminalPolicy),
      "ART_DIRECTOR_TERMINAL_POLICY_INVALID",
    );
  }
}

export function validateCreativeQualityReviewRequest(request, profile) {
  validateCreativeQualityProfile(profile);
  required(
    request?.schemaVersion === 1 &&
      request?.kind === "evavo-art-creative-quality-review-request-v1",
    "ART_DIRECTOR_REQUEST_IDENTITY_INVALID",
  );
  safeId(request.reviewId, "ART_DIRECTOR_REVIEW_ID_INVALID");
  safeId(request.candidate?.id, "ART_DIRECTOR_CANDIDATE_ID_INVALID");
  sha(
    request.candidate?.contentSha256,
    "ART_DIRECTOR_CANDIDATE_DIGEST_INVALID",
  );
  uniqueText(
    request.candidate?.technicalEvidenceSha256,
    "ART_DIRECTOR_TECHNICAL_EVIDENCE",
    1,
  );
  for (const value of request.candidate.technicalEvidenceSha256) {
    sha(value, "ART_DIRECTOR_TECHNICAL_EVIDENCE_DIGEST_INVALID");
  }
  required(
    Number.isSafeInteger(request.revision?.current) &&
      request.revision.current >= 1,
    "ART_DIRECTOR_REVISION_INVALID",
  );
  validateLoop(request.loop);
  required(
    Array.isArray(request.references) && request.references.length >= 1,
    "ART_DIRECTOR_REFERENCES_REQUIRED",
  );
  for (const reference of request.references) {
    safeId(reference.role, "ART_DIRECTOR_REFERENCE_ROLE_INVALID");
    safeId(reference.artifactId, "ART_DIRECTOR_REFERENCE_ARTIFACT_INVALID");
    sha(reference.contentSha256, "ART_DIRECTOR_REFERENCE_DIGEST_INVALID");
    required(
      reference.approved === true,
      "ART_DIRECTOR_REFERENCE_APPROVAL_REQUIRED",
    );
  }
  required(
    Array.isArray(request.findings),
    "ART_DIRECTOR_FINDINGS_REQUIRED",
  );
  const ruleByCode = new Map(
    profile.failureRules.map((rule) => [rule.code, rule]),
  );
  const ids = new Set();
  for (const finding of request.findings) {
    safeId(finding.id, "ART_DIRECTOR_FINDING_ID_INVALID");
    required(!ids.has(finding.id), "ART_DIRECTOR_FINDING_ID_DUPLICATE");
    ids.add(finding.id);
    required(
      ruleByCode.has(finding.code),
      `ART_DIRECTOR_FINDING_CODE_UNKNOWN_${finding.code}`,
    );
    required(
      SEVERITIES.has(finding.severity),
      "ART_DIRECTOR_FINDING_SEVERITY_INVALID",
    );
    safeId(finding.targetId, "ART_DIRECTOR_FINDING_TARGET_INVALID");
    sha(finding.evidenceSha256, "ART_DIRECTOR_FINDING_EVIDENCE_INVALID");
    required(
      typeof finding.observation === "string" &&
        finding.observation.trim() === finding.observation &&
        finding.observation.length >= 8 &&
        finding.observation.length <= 1200,
      "ART_DIRECTOR_FINDING_OBSERVATION_INVALID",
    );
    if (finding.maskArtifactId !== undefined) {
      safeId(finding.maskArtifactId, "ART_DIRECTOR_MASK_ARTIFACT_INVALID");
    }
  }
  return { ruleByCode };
}

function requiresNewSource(rule) {
  return ["source-replace", "manual-review"].includes(
    rule.targetedRepairStrategy,
  );
}

function directiveFor(finding, rule, request) {
  const localizedProviderRepairAllowed =
    rule.localizedProviderRepairAllowed && Boolean(finding.maskArtifactId);
  const targetedRepairStrategy =
    rule.targetedRepairStrategy === "masked-provider-inpaint" &&
    !localizedProviderRepairAllowed
      ? "manual-review"
      : rule.targetedRepairStrategy;
  return {
    findingId: finding.id,
    code: finding.code,
    severity: finding.severity,
    targetId: finding.targetId,
    department: rule.department,
    intervention: rule.intervention,
    targetedRepairStrategy,
    localizedProviderRepairAllowed,
    maskArtifactId: localizedProviderRepairAllowed
      ? finding.maskArtifactId
      : undefined,
    preserveArtifactIds: request.references
      .map((reference) => reference.artifactId)
      .sort(),
    rejectIf: rule.rejectIf,
    instruction: `${rule.intervention}: ${finding.observation}`,
    requiresNewSource: requiresNewSource({
      ...rule,
      targetedRepairStrategy,
    }),
    automaticApprovalAllowed: false,
  };
}

export function compileCreativeQualityReview(request, profile) {
  const { ruleByCode } = validateCreativeQualityReviewRequest(
    request,
    profile,
  );
  const findings = [...request.findings].sort((a, b) => {
    const severity = { blocking: 0, warning: 1, info: 2 };
    return (
      severity[a.severity] - severity[b.severity] ||
      a.code.localeCompare(b.code) ||
      a.id.localeCompare(b.id)
    );
  });
  const directives = findings.map((finding) =>
    directiveFor(finding, ruleByCode.get(finding.code), request),
  );
  const blocking = findings.some(
    (finding) => finding.severity === "blocking",
  );
  const manual = directives.some(
    (directive) => directive.targetedRepairStrategy === "manual-review",
  );
  let disposition;
  if (findings.length === 0) {
    disposition = "awaiting-human-creative-approval";
  } else if (request.revision.current >= profile.maximumRevisionCycles) {
    disposition = "revision-limit-reached";
  } else if (manual && blocking) {
    disposition = "manual-art-direction-required";
  } else {
    disposition = blocking
      ? "repair-required"
      : "review-and-optional-repair";
  }
  const loopChecks =
    request.loop.mode === "seamless"
      ? [
          "first-last-pose-and-volume",
          "line-and-palette-boundary",
          "motion-vector-boundary",
          "repeated-playback",
          "duplicate-terminal-frame-absent",
        ]
      : request.loop.mode === "finite-repeat"
        ? ["cycle-count", "terminal-policy", "repeat-cadence"]
        : ["no-forced-looping", "authored-ending-preserved"];
  const base = {
    schemaVersion: 1,
    kind: "evavo-art-creative-quality-review-v1",
    profileId: profile.id,
    profileSha256: digest(profile),
    reviewId: request.reviewId,
    candidate: canonical(request.candidate),
    revision: canonical(request.revision),
    loop: canonical(request.loop),
    references: [...request.references].sort(
      (a, b) =>
        a.role.localeCompare(b.role) ||
        a.artifactId.localeCompare(b.artifactId),
    ),
    findings,
    directives,
    reviewOrder: profile.reviewOrder,
    loopChecks,
    forbiddenShortcuts: profile.forbiddenShortcuts,
    disposition,
    nextRevision: ["repair-required", "review-and-optional-repair"].includes(
      disposition,
    )
      ? request.revision.current + 1
      : null,
    convergence: {
      baselineCandidateSha256: request.candidate.contentSha256,
      requiredTechnicalEvidenceSha256: [
        ...request.candidate.technicalEvidenceSha256,
      ].sort(),
      allBlockingFindingsMustClear: true,
      unchangedAreasMustNotRegress: true,
      normalSpeedAndFrameStepReviewRequired: true,
      repeatedPlaybackRequired: request.loop.mode !== "none",
      automaticContinuationAllowed:
        disposition === "repair-required" && !manual,
      automaticCreativeApprovalAllowed: false,
    },
    authority: {
      providerExecutionPerformed: false,
      sourceMutationPerformed: false,
      candidatePromotionPerformed: false,
      creativeApprovalPerformed: false,
      publicationPerformed: false,
    },
  };
  return { ...base, reviewSha256: digest(base) };
}

function valueAfter(args, flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function readJson(path) {
  return JSON.parse(readFileSync(resolve(path), "utf8"));
}

function writeCreateOnly(path, value) {
  const target = resolve(path);
  if (existsSync(target)) throw new Error("ART_DIRECTOR_OUTPUT_EXISTS");
  writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const [command, ...args] = process.argv.slice(2);
    const profile = readJson(
      valueAfter(args, "--profile") ??
        "config/creative-quality-cel-v1.json",
    );
    if (command === "validate") {
      validateCreativeQualityProfile(profile);
      process.stdout.write(
        `${JSON.stringify(
          { ok: true, profileSha256: digest(profile) },
          null,
          2,
        )}\n`,
      );
    } else if (command === "compile") {
      const input = valueAfter(args, "--input");
      if (!input) throw new Error("ART_DIRECTOR_INPUT_REQUIRED");
      const result = compileCreativeQualityReview(readJson(input), profile);
      const output = valueAfter(args, "--output");
      if (output) writeCreateOnly(output, result);
      else process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else {
      throw new Error("ART_DIRECTOR_COMMAND_INVALID");
    }
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 2;
  }
}
