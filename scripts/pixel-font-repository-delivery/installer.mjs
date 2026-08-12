import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rename,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  HEAD40,
  canonicalDirectory,
  fileIdentity,
  hashObject,
  normalizeRemoteRepository,
  pathInside,
  posixRelative,
  readJson,
  regularFileState,
  runGit,
  sha256,
} from "./common.mjs";
import {
  INSTALL_SCHEMA,
  PLAN_SCHEMA,
  RECEIPT_SCHEMA,
  assertAllowed,
  assertPlanPathsAllowed,
  normalizeAllowlist,
  normalizeJob,
} from "./schema.mjs";

function verifySelfHash(value, key) {
  const stored = value[key];
  if (typeof stored !== "string" || !/^[0-9a-f]{64}$/u.test(stored)) {
    throw new Error(`${key} is invalid.`);
  }
  const unsigned = { ...value };
  delete unsigned[key];
  if (hashObject(unsigned) !== stored) {
    throw new Error(`${key} does not match canonical content.`);
  }
  return stored;
}

function verifyFileRecord(record, label) {
  if (!record || typeof record !== "object") throw new Error(`${label} is invalid.`);
  const relative = posixRelative(record.path, `${label}.path`);
  if (relative !== record.path) throw new Error(`${label}.path is not canonical.`);
  if (
    typeof record.sha256 !== "string"
    || !/^[0-9a-f]{64}$/u.test(record.sha256)
    || !Number.isSafeInteger(record.bytes)
    || record.bytes < 0
  ) {
    throw new Error(`${label} has an invalid byte identity.`);
  }
  return record;
}

function verifyInstallation(value, job) {
  if (!value || typeof value !== "object" || value.schema !== INSTALL_SCHEMA) {
    throw new Error("Existing installation manifest has an unsupported schema.");
  }
  verifySelfHash(value, "installationSha256");
  if (
    value.familyId !== job.family.familyId
    || value.repository.toLowerCase() !== job.target.repository.toLowerCase()
    || value.destinationRoot !== job.target.destinationRoot
  ) {
    throw new Error("Existing installation manifest belongs to a different family, repository or destination root.");
  }
  if (!Array.isArray(value.files) || value.files.length > 10000) {
    throw new Error("Existing installation manifest files are invalid.");
  }
  const paths = new Set();
  for (const [index, record] of value.files.entries()) {
    verifyFileRecord(record, `installation.files[${index}]`);
    const key = record.path.toLowerCase();
    if (paths.has(key)) throw new Error(`Existing installation manifest duplicates ${record.path}.`);
    paths.add(key);
    if (!(record.path === job.target.destinationRoot || record.path.startsWith(`${job.target.destinationRoot}/`))) {
      throw new Error(`Existing installation path escapes destinationRoot: ${record.path}.`);
    }
  }
  return value;
}

function verifyReceipt(value, job) {
  if (!value || typeof value !== "object" || value.schema !== RECEIPT_SCHEMA) {
    throw new Error("Existing delivery receipt has an unsupported schema.");
  }
  verifySelfHash(value, "receiptSha256");
  if (
    value.familyId !== job.family.familyId
    || value.repository.toLowerCase() !== job.target.repository.toLowerCase()
    || value.destinationRoot !== job.target.destinationRoot
  ) {
    throw new Error("Existing delivery receipt belongs to a different installation.");
  }
  if (!Array.isArray(value.installed) || value.installed.length > 10000) {
    throw new Error("Existing delivery receipt installed records are invalid.");
  }
  value.installed.forEach((record, index) => verifyFileRecord(record, `receipt.installed[${index}]`));
  return value;
}

export function verifyPlan(value) {
  if (!value || typeof value !== "object" || value.schema !== PLAN_SCHEMA) {
    throw new Error(`plan.schema must be ${PLAN_SCHEMA}.`);
  }
  const planSha256 = value.planSha256;
  if (typeof planSha256 !== "string" || !/^[0-9a-f]{64}$/u.test(planSha256)) {
    throw new Error("planSha256 is invalid.");
  }
  const unsignedPlan = { ...value };
  delete unsignedPlan.planSha256;
  delete unsignedPlan.runId;
  if (hashObject(unsignedPlan) !== planSha256 || value.runId !== planSha256.slice(0, 20)) {
    throw new Error("planSha256 does not match canonical content.");
  }
  const job = normalizeJob(value.job);
  if (job.jobSha256 !== value.job.jobSha256) {
    throw new Error("plan job identity is invalid.");
  }
  if (!HEAD40.test(value.expectedHead)) {
    throw new Error("plan.expectedHead is invalid.");
  }
  if (
    value.authority?.forcePush !== false
    || value.authority?.sourceMutation !== false
    || value.authority?.creativeApproval !== false
  ) {
    throw new Error("plan authority violates the delivery boundary.");
  }
  if (!Array.isArray(value.actions) || value.actions.length < 1 || value.actions.length > 10000) {
    throw new Error("plan.actions is invalid.");
  }
  const targets = new Set();
  for (const [index, action] of value.actions.entries()) {
    if (!action || typeof action !== "object" || typeof action.targetPath !== "string") {
      throw new Error(`plan.actions[${index}] is invalid.`);
    }
    const canonical = posixRelative(action.targetPath, `plan.actions[${index}].targetPath`);
    if (canonical !== action.targetPath) {
      throw new Error(`plan.actions[${index}].targetPath is not canonical.`);
    }
    const key = canonical.toLowerCase();
    if (targets.has(key)) throw new Error(`plan.actions duplicates ${canonical}.`);
    targets.add(key);
    if (!!action.source === !!action.generated) {
      throw new Error(`plan.actions[${index}] must contain exactly one byte source.`);
    }
    const identity = action.source ?? action.generated;
    if (
      !/^[0-9a-f]{64}$/u.test(identity.sha256)
      || !Number.isSafeInteger(identity.bytes)
      || identity.bytes < 0
    ) {
      throw new Error(`plan.actions[${index}] identity is invalid.`);
    }
    if (action.source) {
      if (typeof action.source.path !== "string" || !path.isAbsolute(action.source.path)) {
        throw new Error(`plan.actions[${index}].source.path must be absolute.`);
      }
    }
    if (action.generated) {
      if (
        action.generated.encoding !== "base64"
        || typeof action.generated.content !== "string"
      ) {
        throw new Error(`plan.actions[${index}].generated is invalid.`);
      }
      const bytes = Buffer.from(action.generated.content, "base64");
      if (
        bytes.toString("base64") !== action.generated.content
        || bytes.length !== action.generated.bytes
        || sha256(bytes) !== action.generated.sha256
      ) {
        throw new Error(`plan.actions[${index}].generated identity differs.`);
      }
    }
  }
  return Object.freeze({ plan: value, job });
}

async function readPlan(planPath) {
  const file = await readJson(planPath, "pixel-font repository delivery plan");
  return Object.freeze({
    ...verifyPlan(file.value),
    planPath: file.path,
    fileSha256: file.sha256,
  });
}

async function readAllowlist(allowlistPath) {
  const file = await readJson(allowlistPath, "pixel-font repository allowlist");
  return Object.freeze({
    allowlist: normalizeAllowlist(file.value),
    path: file.path,
    sha256: file.sha256,
  });
}

async function readExistingJson(target, label) {
  const state = await regularFileState(target);
  if (!state.exists) return null;
  let value;
  try {
    value = JSON.parse(state.bytes.toString("utf8"));
  } catch (error) {
    throw new Error(`${label} is invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  return Object.freeze({ path: target, sha256: state.sha256, value });
}

async function loadInstallation(targetRoot, job) {
  const target = path.resolve(targetRoot, job.target.installationManifestPath);
  const existing = await readExistingJson(target, "Existing installation manifest");
  if (!existing) return null;
  verifyInstallation(existing.value, job);
  return existing;
}

async function loadReceipt(targetRoot, job) {
  const target = path.resolve(targetRoot, job.target.receiptPath);
  const existing = await readExistingJson(target, "Existing delivery receipt");
  if (!existing) return null;
  verifyReceipt(existing.value, job);
  return existing;
}

async function safeParent(root, target) {
  const relative = path.relative(root, path.dirname(target));
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Target parent escapes repository root: ${target}.`);
  }
  const parts = relative === "" ? [] : relative.split(path.sep);
  let current = root;
  for (const part of parts) {
    current = path.join(current, part);
    try {
      const metadata = await lstat(current);
      if (
        metadata.isSymbolicLink()
        || !metadata.isDirectory()
        || await realpath(current) !== current
      ) {
        throw new Error(`Target parent is not a canonical directory: ${current}.`);
      }
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      await mkdir(current);
    }
  }
}

async function actionBytes(action) {
  if (action.generated) return Buffer.from(action.generated.content, "base64");
  const source = action.source.path;
  const metadata = await lstat(source);
  if (
    !metadata.isFile()
    || metadata.isSymbolicLink()
    || await realpath(source) !== source
  ) {
    throw new Error(`Delivery source must be a canonical file: ${source}.`);
  }
  const bytes = await readFile(source);
  if (bytes.length !== action.source.bytes || sha256(bytes) !== action.source.sha256) {
    throw new Error(`Delivery source identity changed: ${source}.`);
  }
  return bytes;
}

async function preflightOwnership(targetRoot, plan, job, existingInstallation) {
  const owned = new Map(
    (existingInstallation?.value.files ?? []).map((record) => [
      record.path.toLowerCase(),
      record,
    ]),
  );
  const planned = new Set(plan.actions.map((action) => action.targetPath.toLowerCase()));
  const stale = [];
  if (existingInstallation && job.policy.removeStaleOwnedFiles) {
    for (const record of existingInstallation.value.files) {
      if (!planned.has(record.path.toLowerCase())) stale.push(record);
    }
  }
  const states = new Map();
  for (const action of plan.actions) {
    const target = path.resolve(targetRoot, action.targetPath);
    if (!pathInside(target, targetRoot)) {
      throw new Error(`Target path escapes repository root: ${action.targetPath}.`);
    }
    const state = await regularFileState(target);
    states.set(action.targetPath, state);
    if (!state.exists) continue;
    if (job.target.installationMode === "create-only") {
      throw new Error(`create-only installation would replace ${action.targetPath}.`);
    }
    if (
      action.targetPath === job.target.installationManifestPath
      || action.targetPath === job.target.receiptPath
    ) {
      continue;
    }
    const previous = owned.get(action.targetPath.toLowerCase());
    if (!previous) {
      throw new Error(`replace-owned installation refuses unowned file ${action.targetPath}.`);
    }
    if (state.sha256 !== previous.sha256 || state.size !== previous.bytes) {
      throw new Error(`Owned target changed outside delivery control: ${action.targetPath}.`);
    }
  }
  const staleStates = new Map();
  for (const record of stale) {
    const target = path.resolve(targetRoot, record.path);
    if (!pathInside(target, targetRoot)) {
      throw new Error(`Stale target escapes repository root: ${record.path}.`);
    }
    const state = await regularFileState(target);
    staleStates.set(record.path, state);
    if (!state.exists) continue;
    if (state.sha256 !== record.sha256 || state.size !== record.bytes) {
      throw new Error(`Stale owned target changed outside delivery control: ${record.path}.`);
    }
  }
  return Object.freeze({
    stale: Object.freeze(stale),
    states,
    staleStates,
  });
}

async function backupFile(target, backupRoot, targetRoot, backups) {
  const state = await regularFileState(target);
  if (!state.exists) return state;
  const relative = path.relative(targetRoot, target);
  const backup = path.join(backupRoot, relative);
  await mkdir(path.dirname(backup), { recursive: true });
  await writeFile(backup, state.bytes, { flag: "wx" });
  backups.push(
    Object.freeze({
      target,
      backup,
      relative,
      sha256: state.sha256,
      bytes: state.size,
    }),
  );
  return state;
}

async function rollback(backups, created) {
  for (const target of [...created].reverse()) {
    await rm(target, { force: true }).catch(() => {});
  }
  for (const item of [...backups].reverse()) {
    await mkdir(path.dirname(item.target), { recursive: true });
    await writeFile(item.target, await readFile(item.backup));
  }
}

async function atomicReplace({ target, bytes, root, runId, before, backups, created, transaction }) {
  if (before.exists) await backupFile(target, transaction, root, backups);
  await safeParent(root, target);
  const temporary = `${target}.evavo-${runId}.tmp`;
  await rm(temporary, { force: true });
  await writeFile(temporary, bytes, { flag: "wx" });
  if (before.exists) await unlink(target);
  await rename(temporary, target);
  if (!before.exists) created.push(target);
}

function expectedInstalledRecords(plan) {
  return plan.actions.map((action) => {
    const expected = action.source ?? action.generated;
    return {
      path: action.targetPath,
      sha256: expected.sha256,
      bytes: expected.bytes,
      category: action.category,
      ownerBuildId: action.ownerBuildId,
    };
  });
}

function receiptMatchesPlan(existingReceipt, plan, installed) {
  if (!existingReceipt || existingReceipt.value.planSha256 !== plan.planSha256) return false;
  return JSON.stringify(existingReceipt.value.installed) === JSON.stringify(installed);
}

export async function installPlan({ planPath, targetRoot, allowlistPath }) {
  const { plan, job } = await readPlan(planPath);
  const root = await canonicalDirectory(targetRoot, "target repository root");
  const allowlistFile = await readAllowlist(allowlistPath);
  const rule = assertAllowed(job, allowlistFile.allowlist);
  assertPlanPathsAllowed(plan, rule);
  const existingInstallation = await loadInstallation(root, job);
  const existingReceipt = await loadReceipt(root, job);
  const ownership = await preflightOwnership(root, plan, job, existingInstallation);
  const expectedInstalled = expectedInstalledRecords(plan);

  const changedActions = [];
  for (const action of plan.actions) {
    const expected = action.source ?? action.generated;
    const state = ownership.states.get(action.targetPath);
    if (!state.exists || state.sha256 !== expected.sha256 || state.size !== expected.bytes) {
      changedActions.push(action);
    }
  }
  const actualStale = ownership.stale.filter(
    (record) => ownership.staleStates.get(record.path)?.exists,
  );
  if (
    changedActions.length === 0
    && actualStale.length === 0
    && receiptMatchesPlan(existingReceipt, plan, expectedInstalled)
  ) {
    return Object.freeze({
      status: "up-to-date",
      receipt: existingReceipt.value,
      receiptPath: existingReceipt.path,
      installedPaths: Object.freeze([]),
      changedPaths: Object.freeze([]),
      stalePaths: Object.freeze([]),
      root,
    });
  }

  const transaction = await mkdtemp(
    path.join(os.tmpdir(), `evavo-pixel-font-delivery-${plan.runId}-`),
  );
  const backups = [];
  const created = [];
  const preimages = [];
  const changedPaths = [];
  const removedStale = [];
  try {
    for (const record of actualStale) {
      const target = path.resolve(root, record.path);
      const state = await backupFile(target, transaction, root, backups);
      if (state.exists) {
        preimages.push({
          path: record.path,
          existed: true,
          sha256: state.sha256,
          bytes: state.size,
          action: "remove-stale",
        });
        await unlink(target);
        removedStale.push(record.path);
        changedPaths.push(record.path);
      }
    }

    for (const action of changedActions) {
      const target = path.resolve(root, action.targetPath);
      const bytes = await actionBytes(action);
      const before = ownership.states.get(action.targetPath);
      preimages.push({
        path: action.targetPath,
        existed: before.exists,
        sha256: before.sha256,
        bytes: before.size,
        action: before.exists ? "replace" : "create",
      });
      await atomicReplace({
        target,
        bytes,
        root,
        runId: plan.runId,
        before,
        backups,
        created,
        transaction,
      });
      const after = await fileIdentity(target);
      const expected = action.source ?? action.generated;
      if (after.sha256 !== expected.sha256 || after.bytes !== expected.bytes) {
        throw new Error(`Installed bytes differ for ${action.targetPath}.`);
      }
      changedPaths.push(action.targetPath);
    }

    for (const record of expectedInstalled) {
      const target = path.resolve(root, record.path);
      const state = await regularFileState(target);
      if (!state.exists || state.sha256 !== record.sha256 || state.size !== record.bytes) {
        throw new Error(`Final installed identity differs for ${record.path}.`);
      }
    }

    const receiptBody = {
      schema: RECEIPT_SCHEMA,
      version: "1.0.0",
      planSha256: plan.planSha256,
      runId: plan.runId,
      familyId: job.family.familyId,
      repository: job.target.repository,
      branch: job.target.branch,
      expectedHead: plan.expectedHead,
      destinationRoot: job.target.destinationRoot,
      installationManifestPath: job.target.installationManifestPath,
      installed: expectedInstalled,
      changed: [...new Set(changedPaths)].sort((left, right) => left.localeCompare(right)),
      removedStale: [...removedStale].sort((left, right) => left.localeCompare(right)),
      preimages,
      allowlist: {
        sha256: allowlistFile.sha256,
        normalizedSha256: allowlistFile.allowlist.allowlistSha256,
      },
      policy: {
        installationMode: job.target.installationMode,
        transactionalRollback: true,
        sourceMutation: false,
        forcePush: false,
      },
      status: "installed",
    };
    const receipt = {
      ...receiptBody,
      receiptSha256: hashObject(receiptBody),
    };
    const receiptTarget = path.resolve(root, job.target.receiptPath);
    const receiptBytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`, "utf8");
    const receiptBefore = await regularFileState(receiptTarget);
    if (
      !receiptBefore.exists
      || receiptBefore.sha256 !== sha256(receiptBytes)
      || receiptBefore.size !== receiptBytes.length
    ) {
      await atomicReplace({
        target: receiptTarget,
        bytes: receiptBytes,
        root,
        runId: plan.runId,
        before: receiptBefore,
        backups,
        created,
        transaction,
      });
      changedPaths.push(job.target.receiptPath);
    }
    return Object.freeze({
      status: "installed",
      receipt,
      receiptPath: receiptTarget,
      installedPaths: Object.freeze(expectedInstalled.map((record) => record.path)),
      changedPaths: Object.freeze(
        [...new Set(changedPaths)].sort((left, right) => left.localeCompare(right)),
      ),
      stalePaths: Object.freeze([...removedStale].sort((left, right) => left.localeCompare(right))),
      root,
    });
  } catch (error) {
    await rollback(backups, created);
    throw error;
  } finally {
    await rm(transaction, { recursive: true, force: true });
  }
}

export async function verifyInstalled({ receiptPath, targetRoot }) {
  const root = await canonicalDirectory(targetRoot, "target repository root");
  const receiptFile = await readJson(receiptPath, "pixel-font delivery receipt");
  const receipt = receiptFile.value;
  if (receipt.schema !== RECEIPT_SCHEMA) {
    throw new Error(`receipt.schema must be ${RECEIPT_SCHEMA}.`);
  }
  verifySelfHash(receipt, "receiptSha256");
  const failures = [];
  for (const record of receipt.installed) {
    verifyFileRecord(record, "receipt.installed record");
    const target = path.resolve(root, record.path);
    if (!pathInside(target, root)) {
      failures.push({ path: record.path, reason: "path-escape" });
      continue;
    }
    const state = await regularFileState(target);
    if (!state.exists || state.sha256 !== record.sha256 || state.size !== record.bytes) {
      failures.push({ path: record.path, reason: "identity-mismatch" });
    }
  }
  if (failures.length) {
    throw new Error(`Installed pixel-font verification failed: ${JSON.stringify(failures.slice(0, 32))}`);
  }
  return Object.freeze({
    schema: "evavo.pixel-font-repository-installed-validation.v1",
    status: "passed",
    familyId: receipt.familyId,
    fileCount: receipt.installed.length,
    receiptSha256: receipt.receiptSha256,
    failures: [],
  });
}

function trimmed(value) {
  return value.trim();
}

function currentBranch(root) {
  const result = runGit(root, ["symbolic-ref", "--quiet", "--short", "HEAD"], {
    allowFailure: true,
  });
  return result.status === 0 ? trimmed(result.stdout) : null;
}

async function gitPreflight(root, plan, job) {
  const inside = trimmed(runGit(root, ["rev-parse", "--show-toplevel"]).stdout);
  if (path.resolve(inside) !== root) {
    throw new Error("targetRoot is not the Git worktree root.");
  }
  const status = trimmed(
    runGit(root, ["status", "--porcelain=v1", "--untracked-files=all"]).stdout,
  );
  if (job.policy.requireClean && status) {
    throw new Error("Target repository worktree must be clean before delivery.");
  }
  runGit(root, ["check-ref-format", "--branch", job.publish.branchName]);
  const remoteUrl = trimmed(
    runGit(root, ["config", "--get", `remote.${job.publish.remote}.url`]).stdout,
  );
  if (
    job.policy.requireExactRemote
    && normalizeRemoteRepository(remoteUrl).toLowerCase()
      !== job.target.repository.toLowerCase()
  ) {
    throw new Error(`Target remote ${remoteUrl} does not match ${job.target.repository}.`);
  }
  runGit(root, ["fetch", "--no-tags", job.publish.remote, job.target.branch], {
    timeout: 600_000,
  });
  const remoteHead = trimmed(
    runGit(
      root,
      ["rev-parse", `refs/remotes/${job.publish.remote}/${job.target.branch}`],
    ).stdout,
  );
  const localHead = trimmed(runGit(root, ["rev-parse", "HEAD"]).stdout);
  if (
    job.policy.requireExactHead
    && (remoteHead !== plan.expectedHead || localHead !== plan.expectedHead)
  ) {
    throw new Error(
      `Target head mismatch: local=${localHead}, remote=${remoteHead}, expected=${plan.expectedHead}.`,
    );
  }
  if (job.publish.mode === "branch") {
    const existing = runGit(
      root,
      ["ls-remote", "--heads", job.publish.remote, job.publish.branchName],
      { allowFailure: true },
    );
    if (existing.status !== 0) {
      throw new Error(existing.stderr || existing.stdout || "Unable to inspect target branch.");
    }
    if (existing.stdout.trim()) {
      throw new Error(`Remote branch already exists: ${job.publish.branchName}.`);
    }
  }
  const originalBranch = currentBranch(root);
  const originalHead = localHead;
  if (job.publish.mode === "direct-main") {
    runGit(root, ["switch", "-C", job.target.branch, plan.expectedHead]);
  } else if (job.publish.mode === "branch") {
    runGit(root, ["switch", "-c", job.publish.branchName, plan.expectedHead]);
  }
  return Object.freeze({
    localHead,
    remoteHead,
    remoteUrl,
    originalBranch,
    originalHead,
    branchCreated: job.publish.mode === "branch",
  });
}

function restoreGit(root, plan, job, preflight, managedPaths) {
  runGit(root, ["reset", "--hard", plan.expectedHead], { allowFailure: true });
  if (managedPaths.length) {
    runGit(root, ["clean", "-fd", "--", ...managedPaths], { allowFailure: true });
  }
  if (preflight.originalBranch) {
    runGit(root, ["switch", preflight.originalBranch], { allowFailure: true });
  } else {
    runGit(root, ["switch", "--detach", preflight.originalHead], { allowFailure: true });
  }
  if (preflight.branchCreated && preflight.originalBranch !== job.publish.branchName) {
    runGit(root, ["branch", "-D", job.publish.branchName], { allowFailure: true });
  }
}

export async function publishPlan({
  planPath,
  targetRoot,
  allowlistPath,
  confirmPublish = false,
}) {
  if (confirmPublish !== true) throw new Error("publish requires confirmPublish=true.");
  const { plan, job } = await readPlan(planPath);
  if (job.publish.mode === "install-only") {
    throw new Error("publish cannot use install-only mode.");
  }
  const root = await canonicalDirectory(targetRoot, "target repository root");
  const allowlistFile = await readAllowlist(allowlistPath);
  const rule = assertAllowed(job, allowlistFile.allowlist);
  assertPlanPathsAllowed(plan, rule);
  const preflight = await gitPreflight(root, plan, job);
  let published = false;
  let managedPaths = plan.actions.map((action) => action.targetPath);
  managedPaths.push(job.target.receiptPath);
  managedPaths = [...new Set(managedPaths)].sort((left, right) => left.localeCompare(right));
  try {
    const installation = await installPlan({
      planPath,
      targetRoot: root,
      allowlistPath,
    });
    const stagedPaths = [
      ...installation.changedPaths,
      ...installation.stalePaths,
    ].sort((left, right) => left.localeCompare(right));
    if (!stagedPaths.length) {
      restoreGit(root, plan, job, preflight, managedPaths);
      return Object.freeze({
        status: "up-to-date",
        repository: job.target.repository,
        branch: job.publish.branchName,
        head: plan.expectedHead,
        receipt: installation.receipt,
      });
    }
    runGit(root, ["add", "--all", "--", ...stagedPaths]);
    const staged = trimmed(
      runGit(root, ["diff", "--cached", "--name-only"]).stdout,
    )
      .split(/\r?\n/u)
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right));
    const expectedStaged = [...new Set(stagedPaths)].sort(
      (left, right) => left.localeCompare(right),
    );
    if (JSON.stringify(staged) !== JSON.stringify(expectedStaged)) {
      throw new Error(
        `Staged scope differs from delivery plan. expected=${JSON.stringify(expectedStaged)} observed=${JSON.stringify(staged)}`,
      );
    }
    runGit(root, ["diff", "--cached", "--check"]);
    runGit(root, ["commit", "-m", job.publish.commitMessage]);
    const commitSha = trimmed(runGit(root, ["rev-parse", "HEAD"]).stdout);
    const parentSha = trimmed(runGit(root, ["rev-parse", "HEAD^"]).stdout);
    if (parentSha !== plan.expectedHead) {
      throw new Error(
        `Published commit parent ${parentSha} differs from expected target head ${plan.expectedHead}.`,
      );
    }
    runGit(root, ["fetch", "--no-tags", job.publish.remote, job.target.branch], {
      timeout: 600_000,
    });
    const remoteBase = trimmed(
      runGit(
        root,
        ["rev-parse", `refs/remotes/${job.publish.remote}/${job.target.branch}`],
      ).stdout,
    );
    if (remoteBase !== plan.expectedHead) {
      throw new Error(`Remote target branch advanced before push: ${remoteBase}.`);
    }
    if (job.publish.push) {
      runGit(
        root,
        ["push", job.publish.remote, `HEAD:refs/heads/${job.publish.branchName}`],
        { timeout: 600_000 },
      );
    }
    const readback = job.publish.push
      ? trimmed(
        runGit(
          root,
          ["ls-remote", "--heads", job.publish.remote, `refs/heads/${job.publish.branchName}`],
        ).stdout,
      ).split(/\s+/u)[0]
      : commitSha;
    if (readback !== commitSha) {
      throw new Error(
        `Remote readback ${readback} differs from published commit ${commitSha}.`,
      );
    }
    const status = trimmed(
      runGit(root, ["status", "--porcelain=v1", "--untracked-files=all"]).stdout,
    );
    if (status) {
      throw new Error(`Target repository is not clean after publication: ${status}`);
    }
    published = job.publish.push;
    return Object.freeze({
      schema: "evavo.pixel-font-repository-publication.v1",
      status: job.publish.push ? "published" : "committed",
      repository: job.target.repository,
      branch: job.publish.branchName,
      mode: job.publish.mode,
      commitSha,
      parentSha,
      remoteReadback: readback,
      forcePush: false,
      historyRewrite: false,
      preflight,
      receipt: installation.receipt,
    });
  } catch (error) {
    if (!published) restoreGit(root, plan, job, preflight, managedPaths);
    throw error;
  }
}
