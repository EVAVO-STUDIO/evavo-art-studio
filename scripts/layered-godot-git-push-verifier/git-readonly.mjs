import { HTTPS_GITHUB_ORIGIN, verifierFail } from "./protocol.mjs";
import { canonicalSha256 } from "./canonical.mjs";
import { branchName, gitOid } from "./validation.mjs";
import { captureGitResult, captureStringArray } from "./buffers.mjs";
import { captureGitOptions } from "./git-options.mjs";

function sameStringArray(actual, expected) {
  return actual.length === expected.length && actual.every((entry, index) => entry === expected[index]);
}

export function assertReadOnlyGitArguments(args) {
  const allowed = [
    ["rev-parse", "--is-inside-work-tree"],
    ["rev-parse", "--show-toplevel"],
    ["rev-parse", "--verify", "HEAD"],
    ["branch", "--show-current"],
    ["show", "-s", "--format=%P%x00%T%x00", "HEAD"],
    ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
    ["config", "--local", "--get", "remote.origin.url"],
    ["config", "--local", "--get-all", "remote.origin.pushurl"],
    ["config", "--local", "--get", "remote.origin.receivepack"],
    ["config", "--local", "--bool", "--get", "remote.origin.mirror"],
    ["config", "--null", "--list"],
  ];
  if (allowed.some((candidate) => sameStringArray(args, candidate))) return;
  if (
    args.length === 5 && args[0] === "ls-remote" && args[1] === "--exit-code" &&
    args[2] === "--refs" && HTTPS_GITHUB_ORIGIN.test(args[3]) &&
    args[4].startsWith("refs/heads/")
  ) {
    branchName(args[4].slice("refs/heads/".length), "remote branch", "GIT_COMMAND_REJECTED");
    return;
  }
  verifierFail(
    "GIT_COMMAND_REJECTED",
    "Verifier dependency attempted a Git command outside the closed read-only command set.",
    { args },
  );
}

export function makeOwnedGitRunner(root, deps) {
  return async (cwd, args, options = {}) => {
    if (typeof cwd !== "string" || !deps.sameFilesystemPath(cwd, root.path)) {
      verifierFail("GIT_COMMAND_REJECTED", "Verifier Git command escaped the selected repository root.");
    }
    const ownedArgs = captureStringArray(args, "Verifier Git arguments");
    if (ownedArgs.length < 1) verifierFail("GIT_COMMAND_REJECTED", "Verifier Git arguments may not be empty.");
    assertReadOnlyGitArguments(ownedArgs);
    const ownedOptions = captureGitOptions(options);
    const result = await deps.runGit(root.path, ownedArgs, ownedOptions);
    return captureGitResult(result, ownedOptions.allowedExitCodes);
  };
}

async function gitText(runGit, root, args, options = {}) {
  return (await runGit(root.path, args, options)).stdout.toString("utf8").trim();
}

export async function inspectLocalRepository(root, receipt, runGit, sameFilesystemPath) {
  const inside = await gitText(runGit, root, ["rev-parse", "--is-inside-work-tree"]);
  if (inside !== "true") verifierFail("LOCAL_DRIFT", "Selected workspace is not a Git working tree.");
  const top = await gitText(runGit, root, ["rev-parse", "--show-toplevel"]);
  if (!sameFilesystemPath(top, root.realPath)) verifierFail("LOCAL_DRIFT", "Selected workspace is not the exact Git repository root.");
  const head = await gitText(runGit, root, ["rev-parse", "--verify", "HEAD"]);
  const branch = await gitText(runGit, root, ["branch", "--show-current"]);
  const metadata = (await runGit(root.path, ["show", "-s", "--format=%P%x00%T%x00", "HEAD"]))
    .stdout.toString("utf8").split("\0");
  const parents = (metadata[0] ?? "").trim().split(" ").filter(Boolean);
  const tree = (metadata[1] ?? "").trim();
  const status = (await runGit(
    root.path,
    ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
  )).stdout;
  if (
    head !== receipt.local.commit || branch !== receipt.local.branch ||
    parents.length !== 1 || parents[0] !== receipt.local.parent ||
    tree !== receipt.local.tree
  ) verifierFail("LOCAL_DRIFT", "Local commit identity no longer matches the push receipt.", {
    expected: receipt.local,
    actual: { head, branch, parents, tree },
  });
  if (status.byteLength !== 0) verifierFail("LOCAL_DRIFT", "Repository is not clean during push receipt verification.");
  gitOid(head, "local HEAD", "LOCAL_DRIFT");
  gitOid(tree, "local tree", "LOCAL_DRIFT");
  branchName(branch, "local branch", "LOCAL_DRIFT");
  const snapshotSha256 = canonicalSha256({
    head,
    parent: parents[0],
    tree,
    branch,
    clean: true,
  });
  return Object.freeze({
    head,
    parent: parents[0],
    tree,
    branch,
    clean: true,
    snapshotSha256,
  });
}

export function captureRemoteHead(value, branch) {
  if (value === null) verifierFail("REMOTE_DRIFT", `Remote branch ${branch} no longer exists.`);
  return gitOid(value, `remote branch ${branch}`, "REMOTE_DRIFT");
}
