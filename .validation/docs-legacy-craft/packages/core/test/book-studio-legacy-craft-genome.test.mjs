import assert from "node:assert/strict";
import test from "node:test";

import {
  BOOK_LEGACY_CRAFT_GENOME_CONTRACT,
  compileEvavoCraftGenome,
  createEvavoCraftGenomeProviderPacket,
  executeBookLegacyCraftGenomeRequest,
  scanEvavoCraftPhraseOverlap,
  sha256CraftText,
  stableCraftJson,
  validateBookLegacyCraftGenomeRequest,
  validateEvavoCraftGenomeProviderResponse,
} from "../src/index.ts";

const fingerprint = (character) => `sha256:${character.repeat(64)}`;

const baseInput = {
  programmeId: "programme:wren",
  profileId: "craft:wren:1",
  profileVersion: 1,
  projectVoiceAnchorIds: ["voice:anchor:1", "voice:anchor:2", "voice:anchor:3"],
  narrativeConstraintIds: ["constraint:close-third", "constraint:no-exposition-dump"],
  acceptedPatternIds: ["pattern:material-detail"],
  rejectedPatternIds: ["pattern:not-x-but-y"],
  influences: [
    {
      influenceId: "influence:analysis-a",
      requestedWeight: 0.34,
      provenance: {
        sourceId: "source:a",
        privateLabel: "Private Creator Alpha",
        sourceKind: "restricted_reference",
        rightsBasis: "restricted_reference",
        rightsEvidenceIds: ["rights:a"],
        sourceFingerprint: fingerprint("a"),
        providerContextAllowed: false,
        phraseComparisonAllowed: true,
      },
      mechanisms: [
        { mechanismId: "mechanism:a:distance", dimensionId: "narrative_distance", description: "Keep perception close while withholding explanatory emotional labels.", polarity: 0.8, strength: 0.9, confidence: 0.9, evidenceIds: ["evidence:a1"], surfaceSpecificity: "general" },
        { mechanismId: "mechanism:a:phrase", dimensionId: "surface_phrase", description: "A distinctive phrase retained only for comparison and never for generation.", polarity: 1, strength: 1, confidence: 1, evidenceIds: ["evidence:a2"], surfaceSpecificity: "phrase_level" },
      ],
    },
    {
      influenceId: "influence:licensed-b",
      requestedWeight: 0.33,
      provenance: {
        sourceId: "source:b",
        privateLabel: "Licensed Craft Study Beta",
        sourceKind: "licensed",
        rightsBasis: "explicit_license",
        rightsEvidenceIds: ["rights:b"],
        sourceFingerprint: fingerprint("b"),
        providerContextAllowed: true,
        phraseComparisonAllowed: true,
      },
      mechanisms: [
        { mechanismId: "mechanism:b:rhythm", dimensionId: "sentence_rhythm", description: "Alternate compressed decisions with longer materially grounded perception.", polarity: -0.7, strength: 0.8, confidence: 0.85, evidenceIds: ["evidence:b1"], surfaceSpecificity: "general" },
      ],
    },
    {
      influenceId: "influence:project-c",
      requestedWeight: 0.33,
      provenance: {
        sourceId: "source:c",
        privateLabel: "Wren Project Voice",
        sourceKind: "project_owned",
        rightsBasis: "project_owned",
        rightsEvidenceIds: ["rights:c"],
        sourceFingerprint: fingerprint("c"),
        providerContextAllowed: true,
        phraseComparisonAllowed: true,
      },
      mechanisms: [
        { mechanismId: "mechanism:c:causality", dimensionId: "causal_density", description: "Make each physical choice alter knowledge, position, cost or later consequence.", polarity: 0.9, strength: 0.95, confidence: 1, evidenceIds: ["evidence:c1"], surfaceSpecificity: "general" },
      ],
    },
  ],
};

function envelope(payload, overrides = {}) {
  return {
    outputKind: "evavo_docs_book_legacy_craft_genome_request",
    schemaVersion: 1,
    contract: BOOK_LEGACY_CRAFT_GENOME_CONTRACT,
    authorityMode: "compatibility_migration",
    requestId: "request:legacy-craft:one",
    sourceRepository: "EVAVO-STUDIO/Website",
    sourceCommit: "a".repeat(40),
    payload,
    requestedAt: "2026-08-05T00:00:00.000Z",
    requestedBy: "Website Book Studio craft-genome compatibility route",
    authoritativeWritesAllowed: false,
    providerCallAllowed: false,
    canonicalManuscriptMutationAllowed: false,
    automaticCanonicalAdmissionAllowed: false,
    runtimeCutoverApproved: false,
    publicationPerformed: false,
    ...overrides,
  };
}

function packet(profile, provider = "chatgpt") {
  return createEvavoCraftGenomeProviderPacket({
    packetId: `packet:${provider}`,
    provider,
    modelName: `model:${provider}`,
    objective: "Draft one scene without copying reference expression.",
    targetUnitIds: ["scene:1"],
    contextEvidenceIds: ["context:1"],
    profile,
  });
}

function validProviderResponse(profile, providerPacket, overrides = {}) {
  return {
    outputKind: "evavo_book_studio_craft_genome_provider_response",
    schemaVersion: 1,
    packetId: providerPacket.packetId,
    provider: providerPacket.provider,
    modelName: providerPacket.modelName,
    profileFingerprint: profile.profileFingerprint,
    targetUnitIds: [...providerPacket.targetUnitIds],
    candidateText: "Mara left the key on the table because carrying it would answer the wrong question.",
    appliedDimensionIds: [profile.dimensions[0].dimensionId],
    preservedVoiceAnchorIds: [...profile.projectVoiceAnchorIds],
    rejectedPatternChecks: {
      "pattern:not-x-but-y": { passed: true, evidence: "The candidate contains no formulaic reversal construction." },
    },
    unresolvedRisks: [],
    phraseOverlapScanRequired: true,
    continuation: { complete: true, remainingUnitIds: [], exactTail: "" },
    ...overrides,
  };
}

test("legacy profile preserves deterministic Website craft semantics", () => {
  const profile = compileEvavoCraftGenome(baseInput);
  assert.equal(profile.status, "ready", profile.blockers.join("\n"));
  assert.equal(profile.providerBriefContainsNamedSources, false);
  assert.equal(profile.directImitationPermitted, false);
  assert.equal(profile.phraseLaunderingPermitted, false);
  assert.equal(profile.projectOwnedExpressionRequired, true);
  assert.equal(profile.normalizedInfluences.reduce((sum, influence) => sum + influence.normalizedWeight, 0).toFixed(5), "1.00000");
  assert.ok(!profile.providerInstruction.includes("Private Creator"));
  assert.ok(profile.warnings.some((warning) => warning.includes("phrase_level")));
  assert.ok(profile.influenceDistances.every((item) => item.distance >= 0.03));
  const reordered = compileEvavoCraftGenome({ ...baseInput, influences: [...baseInput.influences].reverse() });
  assert.equal(reordered.profileFingerprint, profile.profileFingerprint);
});

test("legacy profile blocks dominance, invalid weights, duplicate source identity and label leakage", () => {
  const dominant = compileEvavoCraftGenome({
    ...baseInput,
    influences: baseInput.influences.map((influence, index) => ({ ...influence, requestedWeight: index === 0 ? 0.9 : 0.05 })),
  });
  assert.equal(dominant.status, "blocked");
  assert.ok(dominant.blockers.some((blocker) => blocker.includes("dominates")));

  const invalidWeight = compileEvavoCraftGenome({
    ...baseInput,
    influences: baseInput.influences.map((influence, index) => ({ ...influence, requestedWeight: index === 0 ? Number.NaN : influence.requestedWeight })),
  });
  assert.equal(invalidWeight.status, "blocked");
  assert.ok(invalidWeight.blockers.some((blocker) => blocker.includes("finite positive")));

  const duplicateSource = compileEvavoCraftGenome({
    ...baseInput,
    influences: baseInput.influences.map((influence, index) => index === 1
      ? { ...influence, provenance: { ...influence.provenance, sourceFingerprint: fingerprint("a") } }
      : influence),
  });
  assert.equal(duplicateSource.status, "blocked");
  assert.ok(duplicateSource.blockers.some((blocker) => blocker.includes("repeat the same source fingerprint")));

  const identityLeak = compileEvavoCraftGenome({
    ...baseInput,
    influences: baseInput.influences.map((influence, index) => index === 0 ? {
      ...influence,
      provenance: { ...influence.provenance, privateLabel: "ScarletMoth" },
      mechanisms: influence.mechanisms.map((mechanism, mechanismIndex) => mechanismIndex === 0
        ? { ...mechanism, description: "ScarletMoth controls every sentence in this requested direct source manner." }
        : mechanism),
    } : influence),
  });
  assert.equal(identityLeak.status, "blocked");
  assert.ok(identityLeak.blockers.some((blocker) => blocker.includes("leaks private source identity")));
});

test("legacy provider packets retain provider-native strict execution modes", () => {
  const profile = compileEvavoCraftGenome(baseInput);
  for (const [provider, mode] of [
    ["chatgpt", "strict_json_schema"],
    ["claude", "forced_single_tool"],
    ["other_compatible_model", "adapter_json_schema"],
  ]) {
    const providerPacket = packet(profile, provider);
    assert.equal(providerPacket.ready, true, providerPacket.blockers.join("\n"));
    assert.equal(providerPacket.providerExecutionMode, mode);
    assert.ok(providerPacket.taskInstruction.includes(profile.profileFingerprint));
    assert.ok(!providerPacket.systemInstruction.includes("Private Creator"));
  }

  const tampered = packet({
    ...profile,
    projectVoiceAnchorIds: [...profile.projectVoiceAnchorIds, "voice:tampered"],
  });
  assert.equal(tampered.ready, false);
  assert.ok(tampered.blockers.some((blocker) => blocker.includes("fingerprint does not match")));
});

test("legacy provider response validation rejects tampering and preserves continuation", () => {
  const profile = compileEvavoCraftGenome(baseInput);
  const providerPacket = packet(profile);
  const accepted = validateEvavoCraftGenomeProviderResponse(providerPacket, validProviderResponse(profile, providerPacket));
  assert.equal(accepted.status, "accepted_for_phrase_scan", JSON.stringify(accepted));
  assert.equal(accepted.acceptedForPhraseScan, true);
  assert.equal(accepted.canonicalAdmissionAllowed, false);

  const continuation = validateEvavoCraftGenomeProviderResponse(providerPacket, validProviderResponse(profile, providerPacket, {
    continuation: { complete: false, remainingUnitIds: ["scene:1"], exactTail: "Mara left the key" },
  }));
  assert.equal(continuation.status, "continuation_required");
  assert.equal(continuation.acceptedForPhraseScan, false);

  const risk = validateEvavoCraftGenomeProviderResponse(providerPacket, validProviderResponse(profile, providerPacket, {
    unresolvedRisks: ["The final causal transition needs independent review."],
  }));
  assert.equal(risk.status, "needs_work");

  const changedIdentity = validateEvavoCraftGenomeProviderResponse(providerPacket, validProviderResponse(profile, providerPacket, {
    profileFingerprint: fingerprint("f"),
  }));
  assert.equal(changedIdentity.status, "blocked");
  assert.ok(changedIdentity.blockers.some((blocker) => blocker.includes("identity does not match")));

  const changedPacket = { ...providerPacket, taskInstruction: `${providerPacket.taskInstruction}\nchanged` };
  const changedPacketResult = validateEvavoCraftGenomeProviderResponse(changedPacket, validProviderResponse(profile, providerPacket));
  assert.equal(changedPacketResult.status, "blocked");
  assert.ok(changedPacketResult.blockers.some((blocker) => blocker.includes("packet fingerprint")));
});

test("legacy phrase overlap blocks unauthorised copying and permits rights-backed quotation", () => {
  const copied = "The harbor clock struck twice and the gulls rose together over the black warehouse roof before the rain arrived.";
  const overlap = scanEvavoCraftPhraseOverlap({
    scanId: "scan:blocking",
    candidateId: "candidate:blocking",
    candidateText: `A new opening. ${copied} Then the scene changed.`,
    references: [{ referenceId: "reference:restricted", sourceKind: "restricted_reference", rightsEvidenceIds: ["rights:restricted"], text: `Earlier text. ${copied} Later text.` }],
  });
  assert.equal(overlap.accepted, false);
  assert.ok(overlap.blockingFindingIds.length > 0);

  const authorisedQuote = scanEvavoCraftPhraseOverlap({
    scanId: "scan:quote",
    candidateId: "candidate:quote",
    candidateText: copied,
    references: [{ referenceId: "reference:public-domain", sourceKind: "public_domain", rightsEvidenceIds: ["rights:public-domain"], text: copied, allowQuotedUse: true }],
  });
  assert.equal(authorisedQuote.accepted, true);
  assert.ok(authorisedQuote.findings.every((finding) => finding.severity === "info"));

  assert.throws(() => scanEvavoCraftPhraseOverlap({
    scanId: "scan:invalid-quote",
    candidateId: "candidate:invalid-quote",
    candidateText: copied,
    references: [{ referenceId: "reference:restricted-quote", sourceKind: "restricted_reference", rightsEvidenceIds: ["rights:restricted"], text: copied, allowQuotedUse: true }],
  }), /cannot authorise quoted use/);
});

test("Docs compatibility result exactly matches the direct legacy compiler and fingerprints authority", () => {
  const payload = { operation: "compile_profile", compileInput: baseInput };
  const direct = compileEvavoCraftGenome(baseInput);
  const compatibility = executeBookLegacyCraftGenomeRequest(envelope(payload));
  assert.deepEqual(compatibility.result, direct);
  assert.equal(compatibility.operation, "compile_profile");
  assert.equal(compatibility.docsSuiteCompatibilityExecutionPerformed, true);
  assert.equal(compatibility.websiteLocalCraftExecutionPerformed, false);
  assert.equal(compatibility.legacyWebsiteCraftSourceRetired, true);
  assert.equal(compatibility.providerCalled, false);
  assert.equal(compatibility.authoritativeWritesPerformed, false);
  assert.equal(compatibility.canonicalManuscriptMutationPerformed, false);
  assert.equal(compatibility.automaticCanonicalAdmissionAllowed, false);
  assert.equal(compatibility.runtimeCutoverApproved, false);
  assert.equal(compatibility.publicationPerformed, false);
  const { resultFingerprint, ...unsigned } = compatibility;
  assert.equal(resultFingerprint, sha256CraftText(stableCraftJson(unsigned)));
  const replay = executeBookLegacyCraftGenomeRequest(envelope(payload));
  assert.equal(replay.requestFingerprint, compatibility.requestFingerprint);
  assert.equal(replay.resultFingerprint, compatibility.resultFingerprint);
});

test("compatibility envelope fails closed on caller and authority escalation", () => {
  const payload = { operation: "compile_profile", compileInput: baseInput };
  assert.throws(() => validateBookLegacyCraftGenomeRequest(envelope(payload, { providerCallAllowed: true })), /REQUEST_INVALID/);
  assert.throws(() => validateBookLegacyCraftGenomeRequest(envelope(payload, { requestedBy: "untrusted caller" })), /REQUEST_INVALID/);
  assert.throws(() => validateBookLegacyCraftGenomeRequest({ ...envelope(payload), extra: true }), /REQUEST_INVALID/);
  assert.throws(() => validateBookLegacyCraftGenomeRequest(envelope(payload, { sourceCommit: "main" })), /SOURCE_COMMIT_INVALID/);
});

test("request validation parses but never executes a phrase scan", () => {
  const copied = "The harbor clock struck twice and the gulls rose together over the black warehouse roof before the rain arrived.";
  const payload = {
    operation: "scan_phrase_overlap",
    scanInput: {
      scanId: "scan:validation-only",
      candidateId: "candidate:validation-only",
      candidateText: copied,
      references: [{
        referenceId: "reference:validation-only",
        sourceKind: "public_domain",
        rightsEvidenceIds: ["rights:validation-only"],
        text: copied,
        textSha256: fingerprint("f"),
        allowQuotedUse: true,
      }],
    },
  };
  assert.doesNotThrow(() => validateBookLegacyCraftGenomeRequest(envelope(payload)));
  assert.throws(() => executeBookLegacyCraftGenomeRequest(envelope(payload)), /does not match its declared SHA-256 identity/);
});
