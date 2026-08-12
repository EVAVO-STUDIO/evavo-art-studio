import { createHash } from "node:crypto";

import {
  branchName,
  canonicalSha256,
  gitOid,
  pushFail,
} from "./contract.mjs";
import { gitText, nulPaths } from "./git-exec.mjs";

function sha256Bytes(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function parseCommitMetadata(buffer) {
  const fields = buffer.toString("utf8").split("\0");
  if (fields.length < 9) pushFail("GIT_OUTPUT_INVALID", "Commit metadata output is incomplete.");
  return Object.freeze({
    parents: fields[0].trim().split(" ").filter(Boolean),
    tree: fields[1].trim(),
    message: fields[2].replace(/\n+$/u, ""),
    author: { name: fields[3], email: fields[4] },
    committer: { name: fields[5], email: fields[6] },
    committedAt: fields[7],
  });
}

export async function inspectLocalRepository({ root, repository, receipt, deps }) {
  const inside = await gitText(root.path, ["rev-parse", "--is-inside-work-tree"], { errorCode: "LOCAL_INSPECTION_FAILED" });
  if (inside !== "true") pushFail("LOCAL_STATE_INVALID", "Selected workspace is not a Git working tree.");
  const top = await gitText(root.path, ["rev-parse", "--show-toplevel"], { errorCode: "LOCAL_INSPECTION_FAILED" });
  if (!deps.sameFilesystemPath(top, root.realPath)) pushFail("LOCAL_STATE_INVALID", "Selected workspace is not the exact Git repository root.");

  const head = await gitText(root.path, ["rev-parse", "--verify", "HEAD"], { errorCode: "LOCAL_INSPECTION_FAILED" });
  const branch = await gitText(root.path, ["branch", "--show-current"], { errorCode: "LOCAL_INSPECTION_FAILED" });
  if (head !== receipt.commit.commit || branch !== receipt.commit.branch) {
    pushFail("LOCAL_DRIFT", "Local HEAD or branch no longer matches the commit receipt.", {
      expectedHead: receipt.commit.commit,
      actualHead: head,
      expectedBranch: receipt.commit.branch,
      actualBranch: branch,
    });
  }

  const staged = nulPaths((await deps.runGit(root.path, ["diff", "--cached", "--name-only", "-z", "--"], {
    errorCode: "LOCAL_INSPECTION_FAILED",
  })).stdout);
  const unstaged = nulPaths((await deps.runGit(root.path, ["diff", "--no-ext-diff", "--no-textconv", "--name-only", "-z", "--"], {
    errorCode: "LOCAL_INSPECTION_FAILED",
  })).stdout);
  const untracked = nulPaths((await deps.runGit(root.path, ["ls-files", "--others", "--exclude-standard", "-z", "--"], {
    errorCode: "LOCAL_INSPECTION_FAILED",
  })).stdout);
  if (staged.length || unstaged.length || untracked.length) {
    pushFail("LOCAL_DRIFT", "Repository must remain completely clean before and after the remote push.", { staged, unstaged, untracked });
  }

  const metadata = parseCommitMetadata((await deps.runGit(root.path, [
    "show", "-s", "--format=%P%x00%T%x00%B%x00%an%x00%ae%x00%cn%x00%ce%x00%cI%x00", head,
  ], { errorCode: "LOCAL_INSPECTION_FAILED" })).stdout);
  if (
    metadata.parents.length !== 1 || metadata.parents[0] !== receipt.commit.parent ||
    metadata.tree !== receipt.commit.tree || metadata.message !== receipt.commitMessage ||
    metadata.author.name !== receipt.commit.author.name || metadata.author.email !== receipt.commit.author.email ||
    metadata.committer.name !== receipt.commit.committer.name || metadata.committer.email !== receipt.commit.committer.email ||
    metadata.committedAt !== receipt.commit.committedAt
  ) pushFail("LOCAL_DRIFT", "Local commit metadata no longer matches the exact commit receipt.");

  const changedPaths = nulPaths((await deps.runGit(root.path, [
    "diff-tree", "--no-commit-id", "--name-only", "-r", "-z", head,
  ], { errorCode: "LOCAL_INSPECTION_FAILED" })).stdout);
  const expectedPaths = receipt.stagedResources.map((entry) => entry.path).sort();
  if (canonicalSha256(changedPaths) !== canonicalSha256(expectedPaths)) {
    pushFail("LOCAL_DRIFT", "Local commit does not contain exactly the receipt-bound resource paths.", {
      expected: expectedPaths,
      actual: changedPaths,
    });
  }

  for (const resource of receipt.stagedResources) {
    const committed = (await deps.runGit(root.path, ["show", `${head}:${resource.path}`], {
      errorCode: "LOCAL_INSPECTION_FAILED",
    })).stdout;
    if (committed.byteLength !== resource.bytes || sha256Bytes(committed) !== resource.sha256) {
      pushFail("LOCAL_DRIFT", `Committed bytes for ${resource.path} do not match the commit receipt.`);
    }
  }

  const origin = await deps.resolveOrigin(root, repository, deps);
  if (origin.repository.toLowerCase() !== receipt.reviewedGit.originRepository.toLowerCase()) {
    pushFail("ORIGIN_MISMATCH", "Current origin is not the reviewed origin repository.");
  }

  return Object.freeze({
    head,
    branch: branchName(branch, "local branch"),
    tree: gitOid(metadata.tree, "local commit tree"),
    origin,
    snapshotSha256: canonicalSha256({
      head,
      branch,
      tree: metadata.tree,
      originUrl: origin.url,
      changedPaths,
      staged,
      unstaged,
      untracked,
    }),
  });
}
