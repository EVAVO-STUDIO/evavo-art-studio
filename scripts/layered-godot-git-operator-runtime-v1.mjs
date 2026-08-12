#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  EXPECTED_REPOSITORY_REVIEW_PROTOCOL_VERSION,
  LAYERED_GODOT_GIT_COMMIT_RECEIPT_KIND,
  LAYERED_GODOT_GIT_OPERATOR_PROTOCOL_VERSION,
  LayeredGodotGitOperatorError,
  branchName,
  canonicalSha256,
  commitMessage,
  exactObject,
  gitOid,
  operatorFail,
  repositoryName,
  semanticReview,
  sha256,
  snapshotJsonValue,
  validateReviewReceipt,
} from "./layered-godot-git-operator/contract.mjs";
import {
  createEmptyHooksDirectory,
  gitText,
  nulPaths,
  removeHooksDirectory,
  runGit,
} from "./layered-godot-git-operator/git-exec.mjs";

export {
  LAYERED_GODOT_GIT_COMMIT_RECEIPT_KIND,
  LAYERED_GODOT_GIT_OPERATOR_PROTOCOL_VERSION,
  LayeredGodotGitOperatorError,
  canonicalSha256,
} from "./layered-godot-git-operator/contract.mjs";
export { runGit } from "./layered-godot-git-operator/git-exec.mjs";

const INPUT_KEYS = [
  "integrationPlan", "writeReceipt", "auditReceipt", "runtimeValidationReceipt",
  "handoffReceipt", "repositoryReviewReceipt", "workspaceRoot", "expectedRepository",
  "commitMessage", "authorization",
];
const AUTHORIZATION_KEYS = ["commit", "push", "forcePush"];

async function resolveDefaultDependencies() {
  const [reviewer, writer, filesystem] = await Promise.all([
    import("./layered-godot-repository-review.mjs"),
    import("./layered-godot-workspace-writer.mjs"),
    import("./layered-godot-workspace-writer/filesystem.mjs"),
  ]);
  if (reviewer.LAYERED_GODOT_REPOSITORY_REVIEW_PROTOCOL_VERSION !== EXPECTED_REPOSITORY_REVIEW_PROTOCOL_VERSION) {
    operatorFail("REVIEW_PROTOCOL_DRIFT", "Git operator repository-review protocol is stale.");
  }
  return {
    reviewRepository: reviewer.reviewLayeredGodotRepository,
    verifyWriteRequest: writer.verifyLayeredGodotWorkspaceWriteRequest,
    writeRequestKind: writer.LAYERED_GODOT_WORKSPACE_WRITE_REQUEST_KIND,
    inspectWorkspaceRoot: filesystem.inspectWorkspaceRoot,
    sameFilesystemPath: filesystem.sameFilesystemPath,
    readStableRegularFile: filesystem.readStableRegularFile,
    runGit,
  };
}

function validateAuthorization(value) {
  const auth = exactObject(value, AUTHORIZATION_KEYS, "authorization");
  if (auth.commit !== true || auth.push !== false || auth.forcePush !== false) {
    operatorFail("AUTHORITY_INVALID", "Authorization must explicitly allow commit while denying push and force push.");
  }
  return auth;
}

function validateBindings(request, review, verified) {
  const write = request.writeReceipt;
  if (write === null || typeof write !== "object" || Array.isArray(write) || typeof write.receiptSha256 !== "string") {
    operatorFail("INPUT_INVALID", "writeReceipt must carry receiptSha256.");
  }
  const handoff = request.handoffReceipt;
  if (handoff === null || typeof handoff !== "object" || Array.isArray(handoff) || typeof handoff.gateSha256 !== "string") {
    operatorFail("INPUT_INVALID", "handoffReceipt must carry gateSha256.");
  }
  if (
    review.requestSha256 !== verified.requestSha256 ||
    review.integrationSha256 !== verified.integration.integrationSha256 ||
    review.writeReceiptSha256 !== write.receiptSha256 ||
    review.handoffGateSha256 !== handoff.gateSha256
  ) operatorFail("REVIEW_INVALID", "Repository review is not bound to the exact verified handoff inputs.");
}

function assertReviewCurrent(supplied, current) {
  validateReviewReceipt(current, supplied.target.expectedRepository, { realPath: supplied.target.workspaceRoot }, (a, b) => path.resolve(a) === path.resolve(b));
  if (canonicalSha256(semanticReview(supplied)) !== canonicalSha256(semanticReview(current))) {
    operatorFail("REVIEW_DRIFT", "Repository review no longer matches current repository state.");
  }
}

async function hashAndStageResource(root, resource, run) {
  const hashResult = await run(root.path, ["hash-object", "-w", "--stdin"], {
    stdin: resource.data,
    errorCode: "GIT_OBJECT_WRITE_FAILED",
  });
  const oid = hashResult.stdout.toString("utf8").trim();
  gitOid(oid, `blob oid for ${resource.path}`);
  await run(root.path, ["update-index", "--add", "--cacheinfo", `100644,${oid},${resource.path}`], {
    errorCode: "GIT_INDEX_UPDATE_FAILED",
  });
  return { path: resource.path, oid, sha256: resource.sha256, bytes: resource.bytes };
}

function parseIndexEntry(buffer, resourcePath) {
  const text = buffer.toString("utf8");
  if (text.length === 0) return null;
  const entries = text.split("\0").filter(Boolean);
  if (entries.length !== 1) {
    operatorFail("GIT_INDEX_INVALID", `Git index returned multiple entries for ${resourcePath}.`);
  }
  const match = /^([0-7]{6}) ([0-9a-f]{40}|[0-9a-f]{64}) ([0-3])\t(.+)$/u.exec(entries[0]);
  if (!match || match[4] !== resourcePath || match[3] !== "0") {
    operatorFail("GIT_INDEX_INVALID", `Git index entry for ${resourcePath} is malformed or unmerged.`);
  }
  return Object.freeze({ mode: match[1], oid: gitOid(match[2], `index oid for ${resourcePath}`), stage: 0, path: resourcePath });
}

async function readIndexEntry(root, resourcePath, deps, errorCode = "GIT_INDEX_INSPECT_FAILED") {
  const result = await deps.runGit(root.path, ["ls-files", "--stage", "-z", "--", resourcePath], { errorCode });
  return parseIndexEntry(result.stdout, resourcePath);
}

async function captureIndexPreimages(root, changedPaths, deps) {
  const entries = new Map();
  for (const resourcePath of changedPaths) {
    entries.set(resourcePath, await readIndexEntry(root, resourcePath, deps));
  }
  return entries;
}

async function assertNoGitTransforms(root, resources, deps) {
  for (const resource of resources) {
    const output = (await deps.runGit(root.path, ["check-attr", "filter", "working-tree-encoding", "ident", "--", resource.path], {
      errorCode: "GIT_STAGE_VERIFY_FAILED",
    })).stdout.toString("utf8");
    for (const line of output.split("\n").filter(Boolean)) {
      const value = line.slice(line.lastIndexOf(":") + 1).trim();
      if (value !== "unspecified" && value !== "unset") {
        operatorFail("GIT_TRANSFORM_ACTIVE", `Git attribute transform became active for ${resource.path} after repository review.`);
      }
    }
  }
}

async function verifyStagedState({ root, verified, review, changedPaths, deps }) {
  const expectedChanged = [...changedPaths].sort();
  await assertNoGitTransforms(root, verified.integration.resources, deps);

  // HEAD/branch stability is the primary repository identity guard. Check it
  // before comparing the index against the reviewed HEAD so an external commit
  // cannot be misreported as a staged-path mismatch.
  const currentHead = await gitText(root.path, ["rev-parse", "HEAD"], { errorCode: "GIT_STAGE_VERIFY_FAILED" });
  const currentBranch = await gitText(root.path, ["branch", "--show-current"], { errorCode: "GIT_STAGE_VERIFY_FAILED" });
  if (currentHead !== review.git.head || currentBranch !== review.git.branch) {
    operatorFail("REPOSITORY_DRIFT", "HEAD or branch changed while staging the reviewed handoff.");
  }

  const cached = nulPaths((await deps.runGit(root.path, ["diff", "--cached", "--name-only", "-z", review.git.head, "--"], {
    errorCode: "GIT_STAGE_VERIFY_FAILED",
  })).stdout);
  if (canonicalSha256(cached) !== canonicalSha256(expectedChanged)) {
    operatorFail("STAGE_MISMATCH", "Git index does not contain exactly the reviewed changed resource paths.", { expected: expectedChanged, actual: cached });
  }

  for (const resource of verified.integration.resources) {
    const inspected = await deps.readStableRegularFile(path.join(root.path, ...resource.path.split("/")), `git operator target ${resource.path}`);
    if (inspected.sha256 !== resource.sha256 || inspected.bytes !== resource.bytes || !inspected.data.equals(resource.data)) {
      operatorFail("WORKTREE_DRIFT", `Working-tree resource ${resource.path} changed after repository review.`);
    }
    const staged = (await deps.runGit(root.path, ["show", `:${resource.path}`], { errorCode: "GIT_STAGE_VERIFY_FAILED" })).stdout;
    if (!staged.equals(resource.data)) operatorFail("STAGE_MISMATCH", `Staged bytes for ${resource.path} do not equal the approved integration bytes.`);
  }

  const unstaged = nulPaths((await deps.runGit(root.path, ["diff", "--no-ext-diff", "--no-textconv", "--name-only", "-z", "--"], {
    errorCode: "GIT_STAGE_VERIFY_FAILED",
  })).stdout);
  const untracked = nulPaths((await deps.runGit(root.path, ["ls-files", "--others", "--exclude-standard", "-z"], {
    errorCode: "GIT_STAGE_VERIFY_FAILED",
  })).stdout);
  if (unstaged.length > 0 || untracked.length > 0) {
    operatorFail("WORKTREE_DRIFT", "Working tree changed while staging the reviewed handoff.", { unstaged, untracked });
  }
}

async function rollbackIndexIfSafe({ root, changedPaths, indexPreimages, stagedResources, deps }) {
  try {
    const stagedByPath = new Map(stagedResources.map((entry) => [entry.path, entry]));

    // Restore only entries that still contain the exact blob written by this
    // operator. If another process touched the same index path, refuse to
    // overwrite it. This makes rollback independent of HEAD movement.
    for (const resourcePath of changedPaths) {
      const staged = stagedByPath.get(resourcePath);
      if (!staged) continue;
      const current = await readIndexEntry(root, resourcePath, deps, "GIT_ROLLBACK_FAILED");
      if (!current || current.mode !== "100644" || current.oid !== staged.oid) {
        return {
          attempted: false,
          reason: "index-drift",
          path: resourcePath,
          expectedOid: staged.oid,
          actualOid: current?.oid ?? null,
        };
      }
    }

    for (const resourcePath of changedPaths) {
      const staged = stagedByPath.get(resourcePath);
      if (!staged) continue;
      const prior = indexPreimages.get(resourcePath) ?? null;
      if (prior === null) {
        await deps.runGit(root.path, ["update-index", "--force-remove", "--", resourcePath], {
          errorCode: "GIT_ROLLBACK_FAILED",
        });
      } else {
        await deps.runGit(root.path, [
          "update-index", "--add", "--cacheinfo", `${prior.mode},${prior.oid},${resourcePath}`,
        ], { errorCode: "GIT_ROLLBACK_FAILED" });
      }
    }

    for (const resourcePath of changedPaths) {
      const prior = indexPreimages.get(resourcePath) ?? null;
      const current = await readIndexEntry(root, resourcePath, deps, "GIT_ROLLBACK_FAILED");
      if (canonicalSha256(current) !== canonicalSha256(prior)) {
        return { attempted: true, restored: false, reason: "preimage-mismatch", path: resourcePath, prior, current };
      }
    }
    return { attempted: true, restored: true };
  } catch (error) {
    return { attempted: true, restored: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function verifyCommittedState({ root, verified, review, changedPaths, message, deps }) {
  const head = await gitText(root.path, ["rev-parse", "HEAD"], { errorCode: "COMMIT_VERIFY_FAILED" });
  const parent = await gitText(root.path, ["rev-parse", "HEAD^"], { errorCode: "COMMIT_VERIFY_FAILED" });
  const branch = await gitText(root.path, ["branch", "--show-current"], { errorCode: "COMMIT_VERIFY_FAILED" });
  if (head === review.git.head || parent !== review.git.head || branch !== review.git.branch) {
    operatorFail("COMMIT_VERIFY_FAILED", "Created commit is not one direct child of the reviewed HEAD on the reviewed branch.");
  }
  const paths = nulPaths((await deps.runGit(root.path, ["diff-tree", "--no-commit-id", "--name-only", "-r", "-z", head], {
    errorCode: "COMMIT_VERIFY_FAILED",
  })).stdout);
  if (canonicalSha256(paths) !== canonicalSha256([...changedPaths].sort())) {
    operatorFail("COMMIT_VERIFY_FAILED", "Created commit does not contain exactly the reviewed changed resource paths.", { expected: [...changedPaths].sort(), actual: paths });
  }
  const staged = nulPaths((await deps.runGit(root.path, ["diff", "--cached", "--name-only", "-z", "--"], { errorCode: "COMMIT_VERIFY_FAILED" })).stdout);
  const unstaged = nulPaths((await deps.runGit(root.path, ["diff", "--no-ext-diff", "--no-textconv", "--name-only", "-z", "--"], { errorCode: "COMMIT_VERIFY_FAILED" })).stdout);
  const untracked = nulPaths((await deps.runGit(root.path, ["ls-files", "--others", "--exclude-standard", "-z"], { errorCode: "COMMIT_VERIFY_FAILED" })).stdout);
  if (staged.length || unstaged.length || untracked.length) operatorFail("COMMIT_VERIFY_FAILED", "Repository is not clean immediately after the exact handoff commit.", { staged, unstaged, untracked });
  for (const resource of verified.integration.resources) {
    const committed = (await deps.runGit(root.path, ["show", `${head}:${resource.path}`], { errorCode: "COMMIT_VERIFY_FAILED" })).stdout;
    if (!committed.equals(resource.data)) operatorFail("COMMIT_VERIFY_FAILED", `Committed bytes for ${resource.path} do not equal the approved integration bytes.`);
  }
  const recordedMessage = (await deps.runGit(root.path, ["show", "-s", "--format=%B", head], {
    errorCode: "COMMIT_VERIFY_FAILED",
  })).stdout.toString("utf8").replace(/\n+$/u, "");
  if (recordedMessage !== message) {
    operatorFail("COMMIT_VERIFY_FAILED", "Created commit message does not exactly match the authorized message.");
  }
  const tree = await gitText(root.path, ["show", "-s", "--format=%T", head], { errorCode: "COMMIT_VERIFY_FAILED" });
  gitOid(tree, "commit tree");
  const metadata = (await deps.runGit(root.path, ["show", "-s", "--format=%an%x00%ae%x00%cn%x00%ce%x00%cI%x00", head], { errorCode: "COMMIT_VERIFY_FAILED" })).stdout.toString("utf8").split("\0");
  return {
    commit: head,
    parent,
    tree,
    branch,
    author: { name: metadata[0] ?? "", email: metadata[1] ?? "" },
    committer: { name: metadata[2] ?? "", email: metadata[3] ?? "" },
    committedAt: metadata[4] ?? "",
  };
}

export async function commitLayeredGodotHandoff(input, dependencies = {}) {
  const request = exactObject(snapshotJsonValue(input), INPUT_KEYS, "gitOperatorInput");
  validateAuthorization(request.authorization);
  const message = commitMessage(request.commitMessage);
  if (typeof request.workspaceRoot !== "string") operatorFail("INPUT_INVALID", "workspaceRoot must be a string.");
  const repository = repositoryName(request.expectedRepository, "expectedRepository");
  const defaults = dependencies.complete === true ? {} : await resolveDefaultDependencies();
  const deps = { ...defaults, ...dependencies };
  for (const key of ["reviewRepository", "verifyWriteRequest", "inspectWorkspaceRoot", "sameFilesystemPath", "readStableRegularFile", "runGit"]) {
    if (typeof deps[key] !== "function") operatorFail("INPUT_INVALID", `Dependency ${key} must be a function.`);
  }
  const root = await deps.inspectWorkspaceRoot(path.resolve(request.workspaceRoot));
  const suppliedReview = validateReviewReceipt(request.repositoryReviewReceipt, repository, root, deps.sameFilesystemPath);
  const write = request.writeReceipt;
  const verified = deps.verifyWriteRequest({
    schemaVersion: "1.0",
    kind: deps.writeRequestKind,
    requestId: write.requestId,
    revision: write.revision,
    expectedRepository: repository,
    workspaceRoot: root.path,
    integrationPlan: request.integrationPlan,
  });
  validateBindings(request, suppliedReview, verified);

  const currentReview = await deps.reviewRepository({
    integrationPlan: request.integrationPlan,
    writeReceipt: request.writeReceipt,
    auditReceipt: request.auditReceipt,
    runtimeValidationReceipt: request.runtimeValidationReceipt,
    handoffReceipt: request.handoffReceipt,
    workspaceRoot: root.path,
    expectedRepository: repository,
  });
  assertReviewCurrent(suppliedReview, currentReview);

  const commonPayload = {
    schemaVersion: "1.0",
    kind: LAYERED_GODOT_GIT_COMMIT_RECEIPT_KIND,
    protocolVersion: LAYERED_GODOT_GIT_OPERATOR_PROTOCOL_VERSION,
    requestSha256: suppliedReview.requestSha256,
    integrationSha256: suppliedReview.integrationSha256,
    writeReceiptSha256: suppliedReview.writeReceiptSha256,
    handoffGateSha256: suppliedReview.handoffGateSha256,
    repositoryReviewSha256: suppliedReview.reviewSha256,
    target: { expectedRepository: repository, workspaceRoot: root.realPath },
    reviewedGit: {
      head: suppliedReview.git.head,
      branch: suppliedReview.git.branch,
      originRepository: suppliedReview.git.originRepository,
      snapshotSha256: suppliedReview.git.snapshotSha256,
    },
  };

  if (suppliedReview.readiness.alreadyIntegrated) {
    const payload = {
      ...commonPayload,
      outcome: "already-integrated",
      commitMessage: message,
      commit: null,
      committedAt: new Date().toISOString(),
      authority: {
        targetRepositoryReadPerformed: true,
        targetRepositoryWorkingTreeMutationPerformed: false,
        gitObjectWritePerformed: false,
        gitIndexMutationPerformed: false,
        gitHookExecutionPerformed: false,
        gitCommitCreated: false,
        gitRefUpdated: false,
        gitPushPerformed: false,
        deploymentPerformed: false,
        publicationPerformed: false,
        forcePushPerformed: false,
      },
    };
    return Object.freeze({ ...payload, receiptSha256: canonicalSha256(payload) });
  }

  const changedPaths = [...suppliedReview.workingTree.modifiedExpectedPaths, ...suppliedReview.workingTree.untrackedExpectedPaths].sort();
  if (changedPaths.length < 1) operatorFail("REVIEW_INVALID", "Commit-required review has no changed resource paths.");
  const resourceByPath = new Map(verified.integration.resources.map((resource) => [resource.path, resource]));
  if (changedPaths.some((entry) => !resourceByPath.has(entry))) operatorFail("REVIEW_INVALID", "Repository review names a changed path outside the verified integration resources.");

  const indexPreimages = await captureIndexPreimages(root, changedPaths, deps);
  let staged = false;
  let commitStarted = false;
  let hooksDirectory = null;
  const stagedResources = [];
  try {
    for (const resourcePath of changedPaths) {
      stagedResources.push(await hashAndStageResource(root, resourceByPath.get(resourcePath), deps.runGit));
      staged = true;
    }
    await verifyStagedState({ root, verified, review: suppliedReview, changedPaths, deps });
    hooksDirectory = await createEmptyHooksDirectory();
    commitStarted = true;
    await deps.runGit(root.path, [
      "-c", `core.hooksPath=${hooksDirectory}`,
      "-c", "core.fsmonitor=false",
      "-c", "commit.gpgSign=false",
      "commit", "--quiet", "--no-verify", "--no-gpg-sign", "--cleanup=verbatim", "-m", message,
    ], { errorCode: "COMMIT_FAILED" });
    const commit = await verifyCommittedState({ root, verified, review: suppliedReview, changedPaths, message, deps });
    const payload = {
      ...commonPayload,
      outcome: "committed",
      commitMessage: message,
      stagedResources,
      commit,
      committedAt: new Date().toISOString(),
      authority: {
        targetRepositoryReadPerformed: true,
        targetRepositoryWorkingTreeMutationPerformed: false,
        gitObjectWritePerformed: true,
        gitIndexMutationPerformed: true,
        gitHookExecutionPerformed: false,
        gitCommitCreated: true,
        gitRefUpdated: true,
        gitPushPerformed: false,
        deploymentPerformed: false,
        publicationPerformed: false,
        forcePushPerformed: false,
      },
    };
    return Object.freeze({ ...payload, receiptSha256: canonicalSha256(payload) });
  } catch (error) {
    if (staged) {
      if (commitStarted) {
        const head = await gitText(root.path, ["rev-parse", "HEAD"], { errorCode: "GIT_ROLLBACK_FAILED" });
        if (head !== suppliedReview.git.head) {
          operatorFail(
            "COMMIT_STATE_UNCERTAIN",
            "Commit command changed HEAD but final verification did not complete; automatic index rollback was refused.",
            { cause: error instanceof Error ? error.message : String(error), reviewedHead: suppliedReview.git.head, currentHead: head },
          );
        }
      }
      const rollback = await rollbackIndexIfSafe({
        root,
        changedPaths,
        indexPreimages,
        stagedResources,
        deps,
      });
      if (rollback.restored !== true) {
        operatorFail(
          "ROLLBACK_FAILED",
          "Git index rollback could not restore the exact pre-operator index entries without overwriting concurrent Git work.",
          { cause: error instanceof Error ? error.message : String(error), rollback },
        );
      }
    }
    throw error;
  } finally {
    if (hooksDirectory) await removeHooksDirectory(hooksDirectory);
  }
}

async function readJson(filePath, label, readStableRegularFile) {
  const inspected = await readStableRegularFile(path.resolve(filePath), label);
  if (inspected.bytes > 64 * 1024 * 1024) {
    operatorFail("INPUT_INVALID", `${label} exceeds the bounded byte limit.`);
  }
  try { return JSON.parse(inspected.data.toString("utf8")); }
  catch { operatorFail("INPUT_INVALID", `${label} is not valid UTF-8 JSON.`); }
}

function parseCli(argv) {
  const [command, ...rest] = argv;
  if (command !== "commit") operatorFail("CLI_INVALID", "Usage: layered-godot-git-operator.mjs commit --plan FILE --receipt FILE --audit-receipt FILE --runtime-receipt FILE --handoff-receipt FILE --review-receipt FILE --workspace DIR --repository OWNER/REPO --message TEXT");
  if (rest.length % 2 !== 0) operatorFail("CLI_INVALID", "CLI flags must be --flag value pairs.");
  const values = new Map();
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index], value = rest[index + 1];
    if (!flag?.startsWith("--") || value === undefined || value.startsWith("--")) operatorFail("CLI_INVALID", `Invalid CLI argument near ${String(flag)}.`);
    if (values.has(flag)) operatorFail("CLI_INVALID", `Duplicate CLI argument ${flag}.`);
    values.set(flag, value);
  }
  const allowed = ["--plan", "--receipt", "--audit-receipt", "--runtime-receipt", "--handoff-receipt", "--review-receipt", "--workspace", "--repository", "--message"];
  for (const key of allowed) if (!values.has(key)) operatorFail("CLI_INVALID", `Missing ${key}.`);
  for (const key of values.keys()) if (!allowed.includes(key)) operatorFail("CLI_INVALID", `Unknown CLI argument ${key}.`);
  return values;
}

async function main() {
  try {
    const values = parseCli(process.argv.slice(2));
    const filesystem = await import("./layered-godot-workspace-writer/filesystem.mjs");
    const stableRead = filesystem.readStableRegularFile;
    const [integrationPlan, writeReceipt, auditReceipt, runtimeValidationReceipt, handoffReceipt, repositoryReviewReceipt] = await Promise.all([
      readJson(values.get("--plan"), "integration plan", stableRead),
      readJson(values.get("--receipt"), "write receipt", stableRead),
      readJson(values.get("--audit-receipt"), "audit receipt", stableRead),
      readJson(values.get("--runtime-receipt"), "runtime receipt", stableRead),
      readJson(values.get("--handoff-receipt"), "handoff receipt", stableRead),
      readJson(values.get("--review-receipt"), "repository review receipt", stableRead),
    ]);
    console.log(JSON.stringify(await commitLayeredGodotHandoff({
      integrationPlan, writeReceipt, auditReceipt, runtimeValidationReceipt, handoffReceipt,
      repositoryReviewReceipt, workspaceRoot: path.resolve(values.get("--workspace")),
      expectedRepository: values.get("--repository"), commitMessage: values.get("--message"),
      authorization: { commit: true, push: false, forcePush: false },
    }), null, 2));
  } catch (error) {
    console.error(JSON.stringify({
      code: error instanceof LayeredGodotGitOperatorError ? error.code : "LAYERED_GODOT_GIT_OPERATOR_FAILED",
      message: error instanceof Error ? error.message : String(error),
      ...(error instanceof LayeredGodotGitOperatorError && error.details !== undefined ? { details: error.details } : {}),
    }, null, 2));
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) await main();
