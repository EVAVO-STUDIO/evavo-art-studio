import path from "node:path";

import {
  HASH64,
  REPOSITORY,
  SAFE_ID,
  arrayValue,
  booleanValue,
  exactKeys,
  hashObject,
  integer,
  objectValue,
  posixRelative,
  safeStem,
  text,
} from "./common.mjs";

export const JOB_SCHEMA = "evavo.pixel-font-repository-automation-job.v1";
export const PLAN_SCHEMA = "evavo.pixel-font-repository-delivery-plan.v1";
export const RECEIPT_SCHEMA = "evavo.pixel-font-repository-delivery-receipt.v1";
export const INSTALL_SCHEMA = "evavo.pixel-font-installation.v1";
export const ALLOWLIST_SCHEMA = "evavo.pixel-font-repository-allowlist.v1";
export const CATALOG_SCHEMA = "evavo.pixel-font-repository-delivery-catalog.v1";
export const BUILD_SCHEMA = "evavo.pixel-font-style-build.v1";
export const TEXT_BUILD_SCHEMA = "evavo.pixel-text-build.v1";

const BUILD_MODES = new Set(["compile", "existing", "v2-family"]);
const TITLE_BUILD_MODES = new Set(["render", "existing"]);
const ADAPTERS = new Set(["godot-4.6.2", "generic-assets", "design-tooling"]);
const INSTALLATION_MODES = new Set(["create-only", "replace-owned"]);
const PUBLISH_MODES = new Set(["install-only", "branch", "direct-main"]);
const CASE_MODES = new Set(["preserve", "pascal", "kebab", "snake"]);
const INCLUDE_KEYS = ["runtime", "atlasJson", "ttf", "bdf", "source", "profile", "review", "godot"];
const TITLE_INCLUDE_KEYS = ["frames", "sheet", "web", "godot", "source", "manifest"];

function resolveInputPath(value, label, baseDirectory) {
  const source = text(value, label, { maximum: 8192 });
  return path.resolve(baseDirectory, source);
}

function normalizeGitRef(value, label) {
  const source = text(value, label, { maximum: 240 });
  if (
    !/^[A-Za-z0-9._/-]+$/u.test(source)
    || source.startsWith("/")
    || source.endsWith("/")
    || source.startsWith(".")
    || source.endsWith(".")
    || source.includes("//")
    || source.includes("..")
    || source.includes("@{")
    || source.endsWith(".lock")
  ) {
    throw new Error(`${label} is not a safe Git ref name.`);
  }
  return source;
}

function normalizeInclude(value, label) {
  const input = objectValue(value ?? {}, label);
  exactKeys(input, INCLUDE_KEYS, label);
  const defaults = {
    runtime: true,
    atlasJson: true,
    ttf: true,
    bdf: true,
    source: true,
    profile: true,
    review: false,
    godot: true,
  };
  return Object.freeze(
    Object.fromEntries(
      INCLUDE_KEYS.map((key) => [
        key,
        input[key] === undefined
          ? defaults[key]
          : booleanValue(input[key], `${label}.${key}`),
      ]),
    ),
  );
}

function normalizeBuild(value, index, baseDirectory) {
  const label = `job.builds[${index}]`;
  const input = objectValue(value, label);
  exactKeys(
    input,
    [
      "buildId",
      "mode",
      "facePath",
      "profilePath",
      "buildRoot",
      "expectedBuildSha256",
      "sourceFaceId",
      "strike",
      "targetStem",
      "displayName",
      "roles",
      "include",
    ],
    label,
  );
  const mode = text(input.mode, `${label}.mode`, { maximum: 32 });
  if (!BUILD_MODES.has(mode)) throw new Error(`${label}.mode is unsupported.`);
  const facePath = input.facePath === undefined || input.facePath === null
    ? null
    : resolveInputPath(input.facePath, `${label}.facePath`, baseDirectory);
  const profilePath = input.profilePath === undefined || input.profilePath === null
    ? null
    : resolveInputPath(input.profilePath, `${label}.profilePath`, baseDirectory);
  const buildRoot = input.buildRoot === undefined || input.buildRoot === null
    ? null
    : resolveInputPath(input.buildRoot, `${label}.buildRoot`, baseDirectory);
  const sourceFaceId = input.sourceFaceId === undefined || input.sourceFaceId === null
    ? null
    : text(input.sourceFaceId, `${label}.sourceFaceId`, { pattern: SAFE_ID, maximum: 160 });
  if (mode === "compile" && (!facePath || !profilePath || buildRoot || sourceFaceId)) {
    throw new Error(`${label} compile mode requires facePath/profilePath and forbids buildRoot/sourceFaceId.`);
  }
  if (mode === "existing" && (!buildRoot || facePath || profilePath || sourceFaceId)) {
    throw new Error(`${label} existing mode requires buildRoot and forbids facePath/profilePath/sourceFaceId.`);
  }
  if (mode === "v2-family" && (!buildRoot || !sourceFaceId || facePath || profilePath)) {
    throw new Error(`${label} v2-family mode requires buildRoot/sourceFaceId and forbids facePath/profilePath.`);
  }
  const expectedBuildSha256 = input.expectedBuildSha256 === undefined || input.expectedBuildSha256 === null
    ? null
    : text(input.expectedBuildSha256, `${label}.expectedBuildSha256`, {
      pattern: HASH64,
      maximum: 64,
    });
  if ((mode === "existing" || mode === "v2-family") && !expectedBuildSha256) {
    throw new Error(`${label} ${mode} mode requires expectedBuildSha256.`);
  }
  if (mode === "v2-family" && input.strike !== 1) {
    throw new Error(`${label} v2-family mode currently uses the authored native strike 1.`);
  }
  const roles = [
    ...new Set(
      arrayValue(input.roles, `${label}.roles`, { minimum: 1, maximum: 128 }).map(
        (role, roleIndex) => text(role, `${label}.roles[${roleIndex}]`, {
          pattern: SAFE_ID,
          maximum: 160,
        }),
      ),
    ),
  ].sort((left, right) => left.localeCompare(right));
  return Object.freeze({
    buildId: text(input.buildId, `${label}.buildId`, {
      pattern: SAFE_ID,
      maximum: 160,
    }),
    mode,
    facePath,
    profilePath,
    buildRoot,
    expectedBuildSha256,
    sourceFaceId,
    strike: integer(input.strike, `${label}.strike`, 1, 64),
    targetStem: text(input.targetStem, `${label}.targetStem`, { maximum: 160 }),
    displayName: text(input.displayName, `${label}.displayName`, {
      maximum: 256,
      pattern: /^[^\r\n]+$/u,
    }),
    roles: Object.freeze(roles),
    include: normalizeInclude(input.include, `${label}.include`),
  });
}

function normalizeTitleInclude(value, label) {
  const input = objectValue(value ?? {}, label);
  exactKeys(input, TITLE_INCLUDE_KEYS, label);
  const defaults = {
    frames: true,
    sheet: true,
    web: true,
    godot: true,
    source: true,
    manifest: true,
  };
  return Object.freeze(
    Object.fromEntries(
      TITLE_INCLUDE_KEYS.map((key) => [
        key,
        input[key] === undefined
          ? defaults[key]
          : booleanValue(input[key], `${label}.${key}`),
      ]),
    ),
  );
}

function normalizeTitle(value, index, baseDirectory) {
  const label = `job.titles[${index}]`;
  const input = objectValue(value, label);
  exactKeys(
    input,
    [
      "titleId",
      "mode",
      "fontBuildId",
      "text",
      "stylePath",
      "buildRoot",
      "expectedBuildSha256",
      "targetStem",
      "displayName",
      "roles",
      "include",
    ],
    label,
  );
  const mode = text(input.mode, `${label}.mode`, { maximum: 32 });
  if (!TITLE_BUILD_MODES.has(mode)) throw new Error(`${label}.mode is unsupported.`);
  const fontBuildId = input.fontBuildId === undefined || input.fontBuildId === null
    ? null
    : text(input.fontBuildId, `${label}.fontBuildId`, { pattern: SAFE_ID, maximum: 160 });
  const literal = input.text === undefined || input.text === null
    ? null
    : text(input.text, `${label}.text`, { maximum: 4096 });
  const stylePath = input.stylePath === undefined || input.stylePath === null
    ? null
    : resolveInputPath(input.stylePath, `${label}.stylePath`, baseDirectory);
  const buildRoot = input.buildRoot === undefined || input.buildRoot === null
    ? null
    : resolveInputPath(input.buildRoot, `${label}.buildRoot`, baseDirectory);
  const expectedBuildSha256 = input.expectedBuildSha256 === undefined || input.expectedBuildSha256 === null
    ? null
    : text(input.expectedBuildSha256, `${label}.expectedBuildSha256`, { pattern: HASH64, maximum: 64 });
  if (mode === "render" && (!fontBuildId || literal === null || !stylePath || buildRoot || expectedBuildSha256)) {
    throw new Error(`${label} render mode requires fontBuildId/text/stylePath and forbids buildRoot/expectedBuildSha256.`);
  }
  if (mode === "existing" && (!buildRoot || !expectedBuildSha256 || stylePath || literal !== null)) {
    throw new Error(`${label} existing mode requires buildRoot/expectedBuildSha256 and forbids text/stylePath.`);
  }
  const roles = [
    ...new Set(
      arrayValue(input.roles ?? [], `${label}.roles`, { maximum: 128 }).map(
        (role, roleIndex) => text(role, `${label}.roles[${roleIndex}]`, { pattern: SAFE_ID, maximum: 160 }),
      ),
    ),
  ].sort((left, right) => left.localeCompare(right));
  return Object.freeze({
    titleId: text(input.titleId, `${label}.titleId`, { pattern: SAFE_ID, maximum: 160 }),
    mode,
    fontBuildId,
    text: literal,
    stylePath,
    buildRoot,
    expectedBuildSha256,
    targetStem: text(input.targetStem, `${label}.targetStem`, { maximum: 160 }),
    displayName: text(input.displayName, `${label}.displayName`, { maximum: 256, pattern: /^[^\r\n]+$/u }),
    roles: Object.freeze(roles),
    include: normalizeTitleInclude(input.include, `${label}.include`),
  });
}

function insideRoot(relative, root) {
  return relative === root || relative.startsWith(`${root}/`);
}

function normalizeGodot(value, label, destinationRoot, namespace) {
  const input = objectValue(value ?? {}, label);
  exactKeys(
    input,
    [
      "resourceRoot",
      "loaderClass",
      "loaderPath",
      "roleMapPath",
      "roleResourceRoot",
      "systemFallback",
      "subpixelPositioning",
      "mipmaps",
      "integerScaleOnly",
      "nearestFiltering",
    ],
    label,
  );
  const resourceRoot = posixRelative(
    (input.resourceRoot ?? destinationRoot).replace(/^res:\/\//u, ""),
    `${label}.resourceRoot`,
  );
  if (resourceRoot !== destinationRoot) {
    throw new Error(`${label}.resourceRoot must equal target.destinationRoot so generated resources remain inside the allowlisted installation root.`);
  }
  const loaderPath = posixRelative(
    input.loaderPath ?? `${destinationRoot}/godot/${namespace}.gd`,
    `${label}.loaderPath`,
  );
  if (!insideRoot(loaderPath, destinationRoot)) {
    throw new Error(`${label}.loaderPath must remain below target.destinationRoot.`);
  }
  const roleMapPath = posixRelative(
    input.roleMapPath ?? "metadata/role-map.json",
    `${label}.roleMapPath`,
  );
  const roleResourceRoot = posixRelative(
    input.roleResourceRoot ?? "godot/roles",
    `${label}.roleResourceRoot`,
  );
  const policy = {
    resourceRoot,
    loaderClass: text(input.loaderClass ?? namespace, `${label}.loaderClass`, {
      pattern: /^[A-Za-z_][A-Za-z0-9_]{0,127}$/u,
      maximum: 128,
    }),
    loaderPath,
    roleMapPath,
    roleResourceRoot,
    systemFallback: input.systemFallback === undefined
      ? false
      : booleanValue(input.systemFallback, `${label}.systemFallback`),
    subpixelPositioning: input.subpixelPositioning === undefined
      ? false
      : booleanValue(input.subpixelPositioning, `${label}.subpixelPositioning`),
    mipmaps: input.mipmaps === undefined
      ? false
      : booleanValue(input.mipmaps, `${label}.mipmaps`),
    integerScaleOnly: input.integerScaleOnly === undefined
      ? true
      : booleanValue(input.integerScaleOnly, `${label}.integerScaleOnly`),
    nearestFiltering: input.nearestFiltering === undefined
      ? true
      : booleanValue(input.nearestFiltering, `${label}.nearestFiltering`),
  };
  if (
    policy.systemFallback
    || policy.subpixelPositioning
    || policy.mipmaps
    || !policy.integerScaleOnly
    || !policy.nearestFiltering
  ) {
    throw new Error(`${label} violates the pixel-perfect Godot runtime policy.`);
  }
  return Object.freeze(policy);
}

function normalizeTarget(value, namespace) {
  const label = "job.target";
  const input = objectValue(value, label);
  exactKeys(
    input,
    [
      "repository",
      "branch",
      "adapter",
      "destinationRoot",
      "filenameCase",
      "installationMode",
      "installationManifestPath",
      "receiptPath",
      "readmePath",
      "godot",
    ],
    label,
  );
  const adapter = text(input.adapter, `${label}.adapter`, { maximum: 64 });
  if (!ADAPTERS.has(adapter)) throw new Error(`${label}.adapter is unsupported.`);
  const filenameCase = text(input.filenameCase ?? "preserve", `${label}.filenameCase`, {
    maximum: 32,
  });
  if (!CASE_MODES.has(filenameCase)) throw new Error(`${label}.filenameCase is unsupported.`);
  const installationMode = text(
    input.installationMode ?? "replace-owned",
    `${label}.installationMode`,
    { maximum: 32 },
  );
  if (!INSTALLATION_MODES.has(installationMode)) {
    throw new Error(`${label}.installationMode is unsupported.`);
  }
  const destinationRoot = posixRelative(input.destinationRoot, `${label}.destinationRoot`);
  const installationManifestPath = posixRelative(
    input.installationManifestPath ?? `${destinationRoot}/pixel-font-installation.json`,
    `${label}.installationManifestPath`,
  );
  const receiptPath = posixRelative(
    input.receiptPath ?? `${destinationRoot}/pixel-font-delivery-receipt.json`,
    `${label}.receiptPath`,
  );
  const readmePath = posixRelative(
    input.readmePath ?? `${destinationRoot}/README.md`,
    `${label}.readmePath`,
  );
  for (const [name, relative] of Object.entries({
    installationManifestPath,
    receiptPath,
    readmePath,
  })) {
    if (!insideRoot(relative, destinationRoot)) {
      throw new Error(`${label}.${name} must remain below destinationRoot.`);
    }
  }
  return Object.freeze({
    repository: text(input.repository, `${label}.repository`, {
      pattern: REPOSITORY,
      maximum: 256,
    }),
    branch: normalizeGitRef(input.branch ?? "main", `${label}.branch`),
    adapter,
    destinationRoot,
    filenameCase,
    installationMode,
    installationManifestPath,
    receiptPath,
    readmePath,
    godot: adapter === "godot-4.6.2"
      ? normalizeGodot(input.godot, `${label}.godot`, destinationRoot, namespace)
      : null,
  });
}

function normalizePublish(value, target) {
  const label = "job.publish";
  const input = objectValue(value, label);
  exactKeys(
    input,
    ["mode", "remote", "branchName", "allowDirectMain", "commitMessage", "push", "forcePush"],
    label,
  );
  const mode = text(input.mode, `${label}.mode`, { maximum: 32 });
  if (!PUBLISH_MODES.has(mode)) throw new Error(`${label}.mode is unsupported.`);
  const remote = text(input.remote ?? "origin", `${label}.remote`, {
    pattern: /^[A-Za-z0-9._-]{1,64}$/u,
    maximum: 64,
  });
  const allowDirectMain = booleanValue(
    input.allowDirectMain ?? false,
    `${label}.allowDirectMain`,
  );
  const push = booleanValue(input.push ?? true, `${label}.push`);
  if (input.forcePush !== undefined && input.forcePush !== false) {
    throw new Error(`${label}.forcePush must remain false.`);
  }
  const branchName = mode === "branch"
    ? normalizeGitRef(
      input.branchName ?? `agent/pixel-font/${target.repository.split("/")[1]}`,
      `${label}.branchName`,
    )
    : target.branch;
  if (
    mode === "direct-main"
    && (!allowDirectMain || target.branch !== "main" || branchName !== "main")
  ) {
    throw new Error(`${label} direct-main requires allowDirectMain=true and target branch main.`);
  }
  if (mode === "install-only" && push) {
    throw new Error(`${label} install-only requires push=false.`);
  }
  return Object.freeze({
    mode,
    remote,
    branchName,
    allowDirectMain,
    commitMessage: text(input.commitMessage, `${label}.commitMessage`, {
      maximum: 512,
      pattern: /^[^\r\n]+$/u,
    }),
    push,
    forcePush: false,
  });
}

export function normalizeJob(value, { baseDirectory = process.cwd() } = {}) {
  const input = objectValue(value, "job");
  exactKeys(
    input,
    ["schema", "jobId", "family", "builds", "titles", "target", "publish", "policy", "jobSha256"],
    "job",
  );
  if (input.schema !== JOB_SCHEMA) throw new Error(`job.schema must be ${JOB_SCHEMA}.`);
  const familyInput = objectValue(input.family, "job.family");
  exactKeys(familyInput, ["familyId", "displayName", "version", "namespace"], "job.family");
  const family = Object.freeze({
    familyId: text(familyInput.familyId, "job.family.familyId", {
      pattern: SAFE_ID,
      maximum: 160,
    }),
    displayName: text(familyInput.displayName, "job.family.displayName", {
      maximum: 256,
      pattern: /^[^\r\n]+$/u,
    }),
    version: text(familyInput.version, "job.family.version", { maximum: 64 }),
    namespace: text(familyInput.namespace, "job.family.namespace", {
      pattern: /^[A-Za-z_][A-Za-z0-9_]{0,127}$/u,
      maximum: 128,
    }),
  });
  const builds = arrayValue(input.builds, "job.builds", {
    minimum: 1,
    maximum: 64,
  }).map((entry, index) => normalizeBuild(entry, index, path.resolve(baseDirectory)));
  if (new Set(builds.map((entry) => entry.buildId)).size !== builds.length) {
    throw new Error("job.builds contains duplicate buildId values.");
  }
  const titles = arrayValue(input.titles ?? [], "job.titles", { maximum: 64 })
    .map((entry, index) => normalizeTitle(entry, index, path.resolve(baseDirectory)));
  if (new Set(titles.map((entry) => entry.titleId)).size !== titles.length) {
    throw new Error("job.titles contains duplicate titleId values.");
  }
  const buildIds = new Set(builds.map((entry) => entry.buildId));
  for (const title of titles) {
    if (title.mode === "render" && !buildIds.has(title.fontBuildId)) {
      throw new Error(`Title ${title.titleId} references unknown fontBuildId ${title.fontBuildId}.`);
    }
  }
  const roleOwners = new Map();
  for (const build of builds) {
    for (const role of build.roles) {
      if (roleOwners.has(role)) {
        throw new Error(`Role ${role} is assigned to both ${roleOwners.get(role)} and ${build.buildId}.`);
      }
      roleOwners.set(role, build.buildId);
    }
  }
  for (const title of titles) {
    for (const role of title.roles) {
      if (roleOwners.has(role)) {
        throw new Error(`Role ${role} is assigned to both ${roleOwners.get(role)} and ${title.titleId}.`);
      }
      roleOwners.set(role, title.titleId);
    }
  }
  const target = normalizeTarget(input.target, family.namespace);
  const stems = builds.map((entry) => safeStem(entry.targetStem, target.filenameCase).toLowerCase());
  if (new Set(stems).size !== stems.length) {
    throw new Error("job.builds target stems collide after filename-case normalization.");
  }
  if (target.adapter === "godot-4.6.2") {
    for (const build of builds) {
      if (!build.include.runtime || !build.include.godot) {
        throw new Error(`Godot delivery build ${build.buildId} must include runtime and Godot outputs.`);
      }
    }
    for (const title of titles) {
      if (!title.include.frames || !title.include.godot) {
        throw new Error(`Godot delivery title ${title.titleId} must include frames and Godot output.`);
      }
    }
  }
  const publish = normalizePublish(input.publish, target);
  const policyInput = objectValue(input.policy ?? {}, "job.policy");
  exactKeys(
    policyInput,
    [
      "requireClean",
      "requireExactHead",
      "requireExactRemote",
      "removeStaleOwnedFiles",
      "retainSourceEvidence",
    ],
    "job.policy",
  );
  const policy = Object.freeze({
    requireClean: policyInput.requireClean === undefined
      ? true
      : booleanValue(policyInput.requireClean, "job.policy.requireClean"),
    requireExactHead: policyInput.requireExactHead === undefined
      ? true
      : booleanValue(policyInput.requireExactHead, "job.policy.requireExactHead"),
    requireExactRemote: policyInput.requireExactRemote === undefined
      ? true
      : booleanValue(policyInput.requireExactRemote, "job.policy.requireExactRemote"),
    removeStaleOwnedFiles: policyInput.removeStaleOwnedFiles === undefined
      ? true
      : booleanValue(
        policyInput.removeStaleOwnedFiles,
        "job.policy.removeStaleOwnedFiles",
      ),
    retainSourceEvidence: policyInput.retainSourceEvidence === undefined
      ? true
      : booleanValue(
        policyInput.retainSourceEvidence,
        "job.policy.retainSourceEvidence",
      ),
  });
  if (
    publish.mode !== "install-only"
    && (!policy.requireClean || !policy.requireExactHead || !policy.requireExactRemote)
  ) {
    throw new Error("Git publication requires clean checkout, exact target HEAD and exact remote verification.");
  }
  const body = {
    schema: JOB_SCHEMA,
    jobId: text(input.jobId, "job.jobId", { pattern: SAFE_ID, maximum: 160 }),
    family,
    builds: Object.freeze([...builds].sort((left, right) => left.buildId.localeCompare(right.buildId))),
    titles: Object.freeze([...titles].sort((left, right) => left.titleId.localeCompare(right.titleId))),
    target,
    publish,
    policy,
  };
  const jobSha256 = hashObject(body);
  if (input.jobSha256 !== undefined && input.jobSha256 !== jobSha256) {
    throw new Error("job.jobSha256 does not match canonical content.");
  }
  return Object.freeze({ ...body, jobSha256 });
}

function normalizeRepositoryRule(value, index) {
  const label = `allowlist.repositories[${index}]`;
  const input = objectValue(value, label);
  exactKeys(
    input,
    ["repository", "repositoryPattern", "branches", "destinationRoots", "publishModes"],
    label,
  );
  if (!!input.repository === !!input.repositoryPattern) {
    throw new Error(`${label} must set exactly one of repository or repositoryPattern.`);
  }
  const repository = input.repository === undefined
    ? null
    : text(input.repository, `${label}.repository`, {
      pattern: REPOSITORY,
      maximum: 256,
    });
  const repositoryPattern = input.repositoryPattern === undefined
    ? null
    : text(input.repositoryPattern, `${label}.repositoryPattern`, {
      pattern: /^[A-Za-z0-9_.-]+\/\*$/u,
      maximum: 256,
    });
  const branches = [
    ...new Set(
      arrayValue(input.branches, `${label}.branches`, { minimum: 1, maximum: 64 }).map(
        (branch, branchIndex) => normalizeGitRef(branch, `${label}.branches[${branchIndex}]`),
      ),
    ),
  ].sort((left, right) => left.localeCompare(right));
  const destinationRoots = [
    ...new Set(
      arrayValue(input.destinationRoots, `${label}.destinationRoots`, {
        minimum: 1,
        maximum: 64,
      }).map((root, rootIndex) => posixRelative(
        root,
        `${label}.destinationRoots[${rootIndex}]`,
      )),
    ),
  ].sort((left, right) => left.localeCompare(right));
  const publishModes = [
    ...new Set(
      arrayValue(input.publishModes, `${label}.publishModes`, {
        minimum: 1,
        maximum: 3,
      }).map((mode, modeIndex) => {
        const normalized = text(mode, `${label}.publishModes[${modeIndex}]`, {
          maximum: 32,
        });
        if (!PUBLISH_MODES.has(normalized)) {
          throw new Error(`${label}.publishModes contains unsupported mode ${normalized}.`);
        }
        return normalized;
      }),
    ),
  ].sort((left, right) => left.localeCompare(right));
  return Object.freeze({
    repository,
    repositoryPattern,
    branches: Object.freeze(branches),
    destinationRoots: Object.freeze(destinationRoots),
    publishModes: Object.freeze(publishModes),
  });
}

export function normalizeAllowlist(value) {
  const input = objectValue(value, "allowlist");
  exactKeys(input, ["schema", "version", "repositories"], "allowlist");
  if (input.schema !== ALLOWLIST_SCHEMA) {
    throw new Error(`allowlist.schema must be ${ALLOWLIST_SCHEMA}.`);
  }
  const body = {
    schema: ALLOWLIST_SCHEMA,
    version: integer(input.version, "allowlist.version", 1, 1),
    repositories: Object.freeze(
      arrayValue(input.repositories, "allowlist.repositories", {
        minimum: 1,
        maximum: 1024,
      }).map(normalizeRepositoryRule),
    ),
  };
  return Object.freeze({ ...body, allowlistSha256: hashObject(body) });
}

export function assertAllowed(job, allowlist) {
  const lower = job.target.repository.toLowerCase();
  const exact = allowlist.repositories.find(
    (candidate) => candidate.repository?.toLowerCase() === lower,
  );
  const wildcard = allowlist.repositories.find((candidate) => {
    if (!candidate.repositoryPattern) return false;
    const owner = candidate.repositoryPattern.slice(0, -2).toLowerCase();
    return lower.startsWith(`${owner}/`);
  });
  const rule = exact ?? wildcard;
  if (!rule) throw new Error(`Repository ${job.target.repository} is not allowlisted.`);
  if (!rule.branches.includes(job.target.branch)) {
    throw new Error(`Branch ${job.target.branch} is not allowlisted for ${job.target.repository}.`);
  }
  if (!rule.publishModes.includes(job.publish.mode)) {
    throw new Error(`Publish mode ${job.publish.mode} is not allowlisted for ${job.target.repository}.`);
  }
  if (!rule.destinationRoots.some((root) => insideRoot(job.target.destinationRoot, root))) {
    throw new Error(`Destination root ${job.target.destinationRoot} is not allowlisted for ${job.target.repository}.`);
  }
  return rule;
}

export function assertPlanPathsAllowed(plan, rule) {
  for (const action of plan.actions) {
    if (!rule.destinationRoots.some((root) => insideRoot(action.targetPath, root))) {
      throw new Error(`Planned target path ${action.targetPath} is outside the allowlisted roots.`);
    }
  }
}

export function deliveryCatalog() {
  return Object.freeze({
    schema: CATALOG_SCHEMA,
    version: "1.1.0",
    sourceBuildSchemas: Object.freeze([BUILD_SCHEMA, TEXT_BUILD_SCHEMA, "evavo.pixel-font-family.v2"]),
    buildModes: [...BUILD_MODES].sort(),
    titleBuildModes: [...TITLE_BUILD_MODES].sort(),
    jobSchema: JOB_SCHEMA,
    planSchema: PLAN_SCHEMA,
    receiptSchema: RECEIPT_SCHEMA,
    installationSchema: INSTALL_SCHEMA,
    adapters: [...ADAPTERS].sort(),
    installationModes: [...INSTALLATION_MODES].sort(),
    publishModes: [...PUBLISH_MODES].sort(),
    formats: [
      "AngelCode BMFont",
      "RGBA PNG",
      "atlas JSON",
      "BDF",
      "TTF",
      "Godot FontVariation",
      "source/profile evidence",
      "review grids",
      "static and animated pixel-title PNG frames",
      "pixel-title sprite sheets",
      "pixel-title web CSS/JavaScript",
      "Godot SpriteFrames title resources",
    ],
    workflow: {
      manualOnlyCrossRepositoryPublisher: true,
      reusableWorkflow: true,
      exactTargetHeadRequired: true,
      exactRemoteRequired: true,
      cleanCheckoutRequired: true,
      allowlistRequired: true,
      transactionalInstallAndRollback: true,
      normalPushOnly: true,
      forcePush: false,
    },
  });
}
