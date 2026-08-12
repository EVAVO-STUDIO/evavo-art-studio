import {
  EXPECTED_RESOURCE_KINDS,
  LAYERED_GODOT_INTEGRATION_PLAN_KIND,
  LAYERED_GODOT_INTEGRATION_PROTOCOL_VERSION,
  LAYERED_GODOT_WORKSPACE_WRITE_REQUEST_KIND,
  MAXIMUM_RESOURCE_BYTES,
  MAXIMUM_TOTAL_BYTES,
  SEMVER_PATTERN,
  absoluteWorkspaceRoot,
  bytesSha256,
  canonicalSha256,
  fail,
  identifier,
  literal,
  portableRelativePath,
  record,
  repositoryName,
  sha256Value,
  text,
} from "./contract-base.mjs";

export * from "./contract-base.mjs";

function validateResource(resource, index) {
  const entry = record(resource, `resources[${index}]`);
  const kind = text(entry.kind, `resources[${index}].kind`, 64);
  if (!EXPECTED_RESOURCE_KINDS.has(kind)) {
    fail(
      "LAYERED_GODOT_WRITE_PLAN_INVALID",
      `resources[${index}].kind is not a supported Godot draft kind.`,
    );
  }
  const resourcePath = portableRelativePath(entry.path, `resources[${index}].path`);
  const mediaType = text(entry.mediaType, `resources[${index}].mediaType`, 64);
  if (mediaType !== "text/plain" && mediaType !== "application/json") {
    fail(
      "LAYERED_GODOT_WRITE_PLAN_INVALID",
      `resources[${index}].mediaType is not supported.`,
    );
  }
  const content = typeof entry.content === "string" ? entry.content : null;
  if (content === null) {
    fail(
      "LAYERED_GODOT_WRITE_PLAN_INVALID",
      `resources[${index}].content must be UTF-8 text.`,
    );
  }
  const data = Buffer.from(content, "utf8");
  if (data.byteLength > MAXIMUM_RESOURCE_BYTES) {
    fail(
      "LAYERED_GODOT_WRITE_PLAN_INVALID",
      `resources[${index}] exceeds the per-resource byte limit.`,
    );
  }
  if (!Number.isSafeInteger(entry.bytes) || entry.bytes !== data.byteLength) {
    fail(
      "LAYERED_GODOT_WRITE_PLAN_INVALID",
      `resources[${index}] byte count does not match its exact UTF-8 content.`,
    );
  }
  const expectedSha256 = sha256Value(entry.sha256, `resources[${index}].sha256`);
  if (bytesSha256(data) !== expectedSha256) {
    fail(
      "LAYERED_GODOT_WRITE_PLAN_INVALID",
      `resources[${index}] SHA-256 does not match its exact UTF-8 content.`,
    );
  }
  if (mediaType === "application/json") {
    if (!resourcePath.endsWith(".json")) {
      fail(
        "LAYERED_GODOT_WRITE_PLAN_INVALID",
        `resources[${index}] JSON media type requires a .json path.`,
      );
    }
    try {
      JSON.parse(content);
    } catch {
      fail(
        "LAYERED_GODOT_WRITE_PLAN_INVALID",
        `resources[${index}] is not valid JSON.`,
      );
    }
  } else if (kind !== "scene-draft" || !resourcePath.endsWith(".tscn")) {
    fail(
      "LAYERED_GODOT_WRITE_PLAN_INVALID",
      `resources[${index}] text draft must be the canonical .tscn scene.`,
    );
  }
  return Object.freeze({
    kind,
    path: resourcePath,
    mediaType,
    content,
    data,
    sha256: expectedSha256,
    bytes: data.byteLength,
  });
}

function validateIntegrationPlan(planValue, expectedRepository) {
  const plan = record(planValue, "integrationPlan");
  literal(plan.schemaVersion, "1.0", "integrationPlan.schemaVersion");
  literal(plan.kind, LAYERED_GODOT_INTEGRATION_PLAN_KIND, "integrationPlan.kind");
  literal(
    plan.protocolVersion,
    LAYERED_GODOT_INTEGRATION_PROTOCOL_VERSION,
    "integrationPlan.protocolVersion",
  );
  const integrationSha256 = sha256Value(
    plan.integrationSha256,
    "integrationPlan.integrationSha256",
  );
  const { integrationSha256: _discarded, ...withoutHash } = plan;
  if (canonicalSha256(withoutHash) !== integrationSha256) {
    fail(
      "LAYERED_GODOT_WRITE_PLAN_INVALID",
      "integrationPlan self-hash does not match its canonical payload.",
    );
  }

  const productionPlan = record(plan.productionPlan, "integrationPlan.productionPlan");
  if (productionPlan.targetRepository !== expectedRepository) {
    fail(
      "LAYERED_GODOT_WRITE_REPOSITORY_MISMATCH",
      "integrationPlan target repository does not match the explicitly selected repository.",
    );
  }
  if (productionPlan.engine !== "Godot" || productionPlan.engineVersion !== "4.6.2") {
    fail(
      "LAYERED_GODOT_WRITE_PLAN_INVALID",
      "integrationPlan production identity must target Godot 4.6.2.",
    );
  }
  const runtimeRoot = portableRelativePath(
    productionPlan.runtimeRoot,
    "integrationPlan.productionPlan.runtimeRoot",
  );
  const assembly = record(plan.assembly, "integrationPlan.assembly");
  if (
    assembly.scope !== "runtime-candidate" ||
    assembly.runtimeReady !== true ||
    assembly.candidateOnly !== false
  ) {
    fail(
      "LAYERED_GODOT_WRITE_NOT_READY",
      "integrationPlan must be bound to one retained runtime-candidate assembly.",
    );
  }
  const target = record(plan.target, "integrationPlan.target");
  if (
    target.engine !== "Godot" ||
    target.engineVersion !== "4.6.2" ||
    target.runtimeRoot !== runtimeRoot
  ) {
    fail(
      "LAYERED_GODOT_WRITE_PLAN_INVALID",
      "integrationPlan must target Godot 4.6.2 and the exact production runtime root.",
    );
  }
  const readiness = record(plan.readiness, "integrationPlan.readiness");
  if (
    readiness.handoffReady !== true ||
    readiness.reviewOnly !== false ||
    readiness.requiresExplicitRepositoryWriter !== true ||
    readiness.runtimeActivationRequired !== true ||
    !Array.isArray(readiness.blockers) ||
    readiness.blockers.length !== 0
  ) {
    fail(
      "LAYERED_GODOT_WRITE_NOT_READY",
      "Only blocker-free handoff-ready runtime candidates may be written.",
    );
  }
  const authority = record(plan.authority, "integrationPlan.authority");
  if (
    authority.planningOnly !== true ||
    [
      "artifactRead",
      "fileWrite",
      "targetRepositoryMutation",
      "runtimeActivation",
      "deployment",
      "gitCommit",
      "gitPush",
      "publication",
    ].some((key) => authority[key] !== false)
  ) {
    fail(
      "LAYERED_GODOT_WRITE_PLAN_INVALID",
      "integrationPlan execution authority boundary has drifted.",
    );
  }

  if (!Array.isArray(plan.resources) || plan.resources.length !== 7) {
    fail(
      "LAYERED_GODOT_WRITE_PLAN_INVALID",
      "integrationPlan must contain exactly seven Godot resource drafts.",
    );
  }
  const resources = plan.resources.map(validateResource);
  if (
    new Set(resources.map((entry) => entry.kind)).size !== EXPECTED_RESOURCE_KINDS.size ||
    new Set(resources.map((entry) => entry.path)).size !== resources.length
  ) {
    fail(
      "LAYERED_GODOT_WRITE_PLAN_INVALID",
      "integrationPlan resource kinds and paths must be unique and complete.",
    );
  }
  const totalBytes = resources.reduce((total, entry) => total + entry.bytes, 0);
  if (totalBytes > MAXIMUM_TOTAL_BYTES) {
    fail(
      "LAYERED_GODOT_WRITE_PLAN_INVALID",
      "integrationPlan exceeds the total byte limit.",
    );
  }

  const outputs = record(plan.outputs, "integrationPlan.outputs");
  const expectedPathByKind = new Map([
    [
      "scene-draft",
      portableRelativePath(outputs.scenePath, "integrationPlan.outputs.scenePath"),
    ],
    [
      "route-graph",
      portableRelativePath(
        outputs.routeResourcePath,
        "integrationPlan.outputs.routeResourcePath",
      ),
    ],
    [
      "placements",
      portableRelativePath(
        outputs.placementResourcePath,
        "integrationPlan.outputs.placementResourcePath",
      ),
    ],
    [
      "animations",
      portableRelativePath(
        outputs.animationResourcePath,
        "integrationPlan.outputs.animationResourcePath",
      ),
    ],
    [
      "cameras",
      portableRelativePath(
        outputs.cameraResourcePath,
        "integrationPlan.outputs.cameraResourcePath",
      ),
    ],
    [
      "import-policy",
      portableRelativePath(
        outputs.importPolicyPath,
        "integrationPlan.outputs.importPolicyPath",
      ),
    ],
    [
      "integration-manifest",
      portableRelativePath(
        outputs.integrationManifestPath,
        "integrationPlan.outputs.integrationManifestPath",
      ),
    ],
  ]);
  if (
    new Set(expectedPathByKind.values()).size !== expectedPathByKind.size ||
    resources.some((resource) => expectedPathByKind.get(resource.kind) !== resource.path)
  ) {
    fail(
      "LAYERED_GODOT_WRITE_PLAN_INVALID",
      "integrationPlan resources do not match its exact declared output contract.",
    );
  }
  for (const [kind, outputPath] of expectedPathByKind) {
    if (kind !== "scene-draft" && !outputPath.startsWith(`${runtimeRoot}/`)) {
      fail(
        "LAYERED_GODOT_WRITE_PATH_INVALID",
        `Output ${outputPath} escapes the declared production runtime root.`,
      );
    }
  }
  const scene = record(plan.scene, "integrationPlan.scene");
  const sceneResource = resources.find((resource) => resource.kind === "scene-draft");
  if (
    !sceneResource ||
    scene.path !== sceneResource.path ||
    scene.tscnDraft !== sceneResource.content ||
    scene.tscnSha256 !== sceneResource.sha256 ||
    scene.tscnBytes !== sceneResource.bytes
  ) {
    fail(
      "LAYERED_GODOT_WRITE_PLAN_INVALID",
      "integrationPlan scene identity does not match its exact scene draft resource.",
    );
  }

  if (!Array.isArray(plan.writeIntents) || plan.writeIntents.length !== resources.length) {
    fail(
      "LAYERED_GODOT_WRITE_PLAN_INVALID",
      "integrationPlan write intents must cover every resource exactly once.",
    );
  }
  const resourceByPath = new Map(resources.map((entry) => [entry.path, entry]));
  const seenIntentPaths = new Set();
  for (const [index, intentValue] of plan.writeIntents.entries()) {
    const intent = record(intentValue, `writeIntents[${index}]`);
    const intentPath = portableRelativePath(intent.path, `writeIntents[${index}].path`);
    const resource = resourceByPath.get(intentPath);
    if (
      !resource ||
      seenIntentPaths.has(intentPath) ||
      intent.operation !== "create-or-replace" ||
      intent.mediaType !== resource.mediaType ||
      intent.sha256 !== resource.sha256 ||
      intent.bytes !== resource.bytes ||
      intent.content !== resource.content ||
      intent.requiresExplicitRepositoryWriter !== true ||
      intent.expectedRepository !== expectedRepository
    ) {
      fail(
        "LAYERED_GODOT_WRITE_PLAN_INVALID",
        `writeIntents[${index}] is not an exact bounded copy of one resource draft.`,
      );
    }
    seenIntentPaths.add(intentPath);
  }

  return Object.freeze({ plan, integrationSha256, resources, totalBytes });
}

export function verifyLayeredGodotWorkspaceWriteRequest(requestValue) {
  const request = record(requestValue, "request");
  literal(request.schemaVersion, "1.0", "request.schemaVersion");
  literal(
    request.kind,
    LAYERED_GODOT_WORKSPACE_WRITE_REQUEST_KIND,
    "request.kind",
  );
  const requestId = identifier(request.requestId, "request.requestId");
  const revision = text(request.revision, "request.revision", 40);
  if (!SEMVER_PATTERN.test(revision)) {
    fail(
      "LAYERED_GODOT_WRITE_INPUT_INVALID",
      "request.revision must be semantic version x.y.z.",
    );
  }
  const expectedRepository = repositoryName(
    request.expectedRepository,
    "request.expectedRepository",
  );
  const workspaceRoot = absoluteWorkspaceRoot(request.workspaceRoot);
  const integration = validateIntegrationPlan(
    request.integrationPlan,
    expectedRepository,
  );
  return Object.freeze({
    request,
    requestId,
    revision,
    expectedRepository,
    workspaceRoot,
    requestSha256: canonicalSha256(request),
    integration,
  });
}
