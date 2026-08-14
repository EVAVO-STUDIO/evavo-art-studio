export function lifecycle() {
  return [
    { id: "planned", rank: 0, implicit: true, requiresEvidence: false, requiresCandidate: false, requiresHuman: false, nextAction: "lock-references" },
    { id: "references-locked", rank: 1, requiresEvidence: true, requiresCandidate: false, requiresHuman: false, nextAction: "request-generation-authorization" },
    { id: "generation-authorized", rank: 2, requiresEvidence: true, requiresCandidate: false, requiresHuman: true, nextAction: "run-provider-once" },
    { id: "candidates-admitted", rank: 3, requiresEvidence: true, requiresCandidate: true, requiresHuman: false, nextAction: "run-deterministic-qa" },
    { id: "deterministic-qa-passed", rank: 4, requiresEvidence: true, requiresCandidate: true, requiresHuman: false, nextAction: "run-creative-review" },
    { id: "creative-review-passed", rank: 5, requiresEvidence: true, requiresCandidate: true, requiresHuman: false, nextAction: "select-or-request-repair" },
    { id: "selected-or-repair-requested", rank: 6, requiresEvidence: true, requiresCandidate: true, requiresHuman: true, outcomes: ["selected", "repair-requested"], nextAction: "branch-on-human-decision" },
    { id: "mastered", rank: 7, requiresEvidence: true, requiresCandidate: true, requiresHuman: false, nextAction: "request-named-human-approval" },
    { id: "named-human-approved", rank: 8, requiresEvidence: true, requiresCandidate: true, requiresHuman: true, nextAction: "compile-delivery-readiness" },
    { id: "delivery-ready", rank: 9, requiresEvidence: true, requiresCandidate: true, requiresHuman: false, nextAction: "complete", terminal: true },
  ];
}

export function authority() {
  return {
    providerExecution: false,
    automaticGenerationAuthorization: false,
    automaticApproval: false,
    automaticPromotion: false,
    targetRepositoryMutation: false,
    gitMutation: false,
    deployment: false,
    publication: false,
    namedHumanApprovalRequired: true,
  };
}

export function customStrategyInputs() {
  const profile = {
    schema: "evavo.game-art-production-profile.v1",
    protocolVersion: "2026-08-14.2",
    profileId: "isometric-tactical-strategy",
    label: "Isometric tactical strategy",
    gameType: "tactical-strategy",
    era: "modern",
    tags: ["isometric", "strategy", "concept-art"],
    defaults: {
      batchSize: 6,
      candidateFanout: 1,
      maximumRepairAttempts: 2,
      imageFormat: "png",
      renderingModel: "concept-raster",
      textureFiltering: "linear",
      authoringScalePolicy: "uniform",
      oneAssetPerOutput: true,
      providerFallbackAllowed: false,
    },
    lifecycle: lifecycle(),
    reviewPresets: {
      "unit-concept-review": {
        humanRequired: true,
        modes: ["native", "thumbnail", "silhouette", "grayscale"],
        criteria: ["unit-role", "faction-identity", "readability", "material-language"],
      },
    },
    assetTypes: {
      "unit-concept": {
        kind: "concept-art",
        nativeDimensions: { width: 1024, height: 1024 },
        authoringCanvas: { width: 1024, height: 1024 },
        alpha: "opaque",
        reviewPreset: "unit-concept-review",
        pathTemplate: "working/units/{subjectId}/{productionGroup}/{unitId}.png",
        masterPathTemplate: "masters/units/{subjectId}/{productionGroup}/{unitId}.png",
        qaChecks: ["native-dimensions", "opaque-contract", "duplicate-candidate"],
        failureCodes: ["wrong-native-dimensions", "identity-drift", "duplicate-candidate"],
        promptFragments: ["one independent unit concept", "clear tactical role", "stable faction language"],
      },
    },
    authority: authority(),
  };
  const project = {
    schema: "evavo.game-art-production-project.v1",
    protocolVersion: "2026-08-14.2",
    projectId: "custom-strategy-fixture",
    title: "CUSTOM STRATEGY FIXTURE",
    profileId: "isometric-tactical-strategy",
    targetRepository: "example/custom-strategy",
    styleDirection: "Original isometric tactical units with strong role silhouettes, coherent faction materials and uncluttered battlefield readability.",
    subjectGroups: { units: ["ranger"] },
    assetTypeAliases: { "ranger-concept": "unit-concept" },
    productionDefaults: { batchSize: 4, candidateFanout: 1, maximumRepairAttempts: 1 },
    assetTypeOverrides: {},
    referenceContract: {
      styleRoot: "working/style",
      subjectRootTemplates: { units: "working/units/{subjectId}" },
      continuityAuthority: "approved faction and unit-role reference artifacts",
    },
    metadata: { fixture: true },
    authority: authority(),
  };
  return { profile, project };
}
