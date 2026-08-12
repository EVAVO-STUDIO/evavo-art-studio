import { spawn } from "node:child_process";

import { canonicalSha256, reviewFail } from "./contract.mjs";

const MAXIMUM_GIT_OUTPUT_BYTES = 2 * 1024 * 1024;
const DEFAULT_GIT_TIMEOUT_MS = 30_000;

function allowedGitArguments(args) {
  if (!Array.isArray(args) || args.length === 0) return false;
  const exact = [
    ["--version"],
    ["rev-parse", "--is-inside-work-tree"],
    ["rev-parse", "--show-toplevel"],
    ["rev-parse", "--verify", "HEAD"],
    ["rev-parse", "--show-object-format"],
    ["branch", "--show-current"],
    ["config", "--local", "--get", "remote.origin.url"],
    ["diff", "--cached", "--name-status", "-z", "--no-renames", "--no-ext-diff", "--no-textconv", "--"],
    ["diff", "--name-status", "-z", "--no-renames", "--no-ext-diff", "--no-textconv", "--"],
    ["ls-files", "--others", "--exclude-standard", "-z", "--"],
  ];
  if (exact.some((candidate) => candidate.length === args.length && candidate.every((value, index) => value === args[index]))) return true;
  if (args.length >= 4 && args[0] === "ls-files" && args[1] === "-z" && args[2] === "--") return true;
  return args.length >= 5 && args[0] === "check-attr" && args[1] === "-z" && args[2] === "--all" && args[3] === "--";
}

export async function runGitReadOnly(
  workspaceRoot,
  args,
  { gitExecutable = "git", timeoutMs = DEFAULT_GIT_TIMEOUT_MS, maximumOutputBytes = MAXIMUM_GIT_OUTPUT_BYTES } = {},
) {
  if (!allowedGitArguments(args)) reviewFail("GIT_COMMAND_REJECTED", "Only exact bounded read-only Git argument shapes are permitted.");
  return await new Promise((resolve, reject) => {
    const child = spawn(gitExecutable, args, {
      cwd: workspaceRoot,
      shell: false,
      windowsHide: true,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        GIT_OPTIONAL_LOCKS: "0",
        GIT_TERMINAL_PROMPT: "0",
        GIT_CONFIG_COUNT: "1",
        GIT_CONFIG_KEY_0: "core.fsmonitor",
        GIT_CONFIG_VALUE_0: "false",
      },
    });
    let stdout = "", stderr = "", outputBytes = 0, settled = false, limitExceeded = false;
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    const terminate = () => {
      if (process.platform !== "win32" && child.pid) {
        try { process.kill(-child.pid, "SIGKILL"); return; } catch { /* direct fallback */ }
      }
      child.kill("SIGKILL");
    };
    const append = (current, chunk) => {
      outputBytes += Buffer.byteLength(chunk, "utf8");
      if (outputBytes > maximumOutputBytes) { limitExceeded = true; terminate(); return current; }
      return current + chunk;
    };
    child.stdout.on("data", (chunk) => { stdout = append(stdout, chunk); });
    child.stderr.on("data", (chunk) => { stderr = append(stderr, chunk); });
    const timer = setTimeout(terminate, timeoutMs);
    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(reviewError("GIT_EXECUTION_FAILED", error.message));
    });
    child.once("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (limitExceeded) { reject(reviewError("GIT_OUTPUT_LIMIT", "Git output exceeded the bounded byte limit.")); return; }
      if (signal === "SIGKILL" && code === null) { reject(reviewError("GIT_TIMEOUT", "Git read-only inspection exceeded the bounded timeout.")); return; }
      resolve(Object.freeze({ exitCode: code ?? 1, stdout, stderr }));
    });
  });
}

function reviewError(code, message) {
  try { reviewFail(code, message); } catch (error) { return error; }
}

async function mustGit(runGit, workspaceRoot, args, label) {
  const result = await runGit(workspaceRoot, args);
  if (result.exitCode !== 0) reviewFail("GIT_INSPECTION_FAILED", `${label} failed.`, { exitCode: result.exitCode, stderr: result.stderr.slice(0, 2048) });
  return result.stdout;
}

function parseNulList(stdout) {
  if (!stdout) return [];
  const parts = stdout.split("\0");
  if (parts.at(-1) === "") parts.pop();
  return parts;
}

function parseNameStatus(stdout, label) {
  const parts = parseNulList(stdout);
  if (parts.length % 2 !== 0) reviewFail("GIT_OUTPUT_INVALID", `${label} returned malformed NUL-delimited name-status output.`);
  const entries = [];
  for (let index = 0; index < parts.length; index += 2) entries.push(Object.freeze({ status: parts[index], path: parts[index + 1] }));
  return Object.freeze(entries);
}

function parseAttributeTriplets(stdout) {
  const parts = parseNulList(stdout);
  if (parts.length % 3 !== 0) reviewFail("GIT_OUTPUT_INVALID", "git check-attr returned malformed NUL-delimited output.");
  const output = [];
  for (let index = 0; index < parts.length; index += 3) output.push(Object.freeze({ path: parts[index], attribute: parts[index + 1], value: parts[index + 2] }));
  return Object.freeze(output);
}

function validateCommitTransformSafety(resources, attributes) {
  for (const resource of resources) {
    if (resource.content.includes("\r")) reviewFail("NONCANONICAL_LINE_ENDINGS", `Expected resource ${resource.path} contains carriage returns and is not safe for exact-byte Git staging.`);
  }
  const dangerous = attributes.filter((entry) =>
    ["filter", "working-tree-encoding", "ident"].includes(entry.attribute) && !["unspecified", "unset"].includes(entry.value),
  );
  if (dangerous.length > 0) reviewFail("GIT_TRANSFORM_ACTIVE", "Git attributes would permit staging-time content transformation for an expected handoff resource.", { attributes: dangerous });
}

function normalizeOriginRepository(originValue) {
  const origin = originValue.trim();
  for (const pattern of [
    /^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/iu,
    /^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/iu,
    /^ssh:\/\/git@github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/iu,
  ]) {
    const match = pattern.exec(origin);
    if (match) return `${match[1]}/${match[2]}`;
  }
  return null;
}

export async function inspectGitSnapshot({ root, repository, resources, runGit, sameFilesystemPath }) {
  const version = (await mustGit(runGit, root.path, ["--version"], "git --version")).trim();
  if (!/^git version \d+\.\d+(?:\.\d+)?/u.test(version)) reviewFail("GIT_OUTPUT_INVALID", "Git version output is malformed.");
  if ((await mustGit(runGit, root.path, ["rev-parse", "--is-inside-work-tree"], "Git work-tree probe")).trim() !== "true") reviewFail("NOT_GIT_WORKTREE", "Selected workspace is not a Git working tree.");
  const topLevel = (await mustGit(runGit, root.path, ["rev-parse", "--show-toplevel"], "Git root probe")).trim();
  if (!sameFilesystemPath(topLevel, root.realPath)) reviewFail("GIT_ROOT_MISMATCH", "Selected workspace is not the exact Git repository root.");
  const head = (await mustGit(runGit, root.path, ["rev-parse", "--verify", "HEAD"], "Git HEAD probe")).trim();
  if (!/^[0-9a-f]{40,64}$/u.test(head)) reviewFail("GIT_OUTPUT_INVALID", "Git HEAD identity is malformed.");
  const branch = (await mustGit(runGit, root.path, ["branch", "--show-current"], "Git branch probe")).trim();
  if (!branch) reviewFail("DETACHED_HEAD", "Repository review requires a named branch, not detached HEAD.");
  const objectFormat = (await mustGit(runGit, root.path, ["rev-parse", "--show-object-format"], "Git object-format probe")).trim();
  if (!new Set(["sha1", "sha256"]).has(objectFormat)) reviewFail("GIT_OUTPUT_INVALID", "Git object format is unsupported.");
  const originUrl = (await mustGit(runGit, root.path, ["config", "--local", "--get", "remote.origin.url"], "Git origin probe")).trim();
  const originRepository = normalizeOriginRepository(originUrl);
  if (!originRepository || originRepository.toLowerCase() !== repository.toLowerCase()) reviewFail("ORIGIN_MISMATCH", "Git origin does not match the explicitly selected GitHub repository.", { expectedRepository: repository, originUrl });

  const staged = parseNameStatus(await mustGit(runGit, root.path, ["diff", "--cached", "--name-status", "-z", "--no-renames", "--no-ext-diff", "--no-textconv", "--"], "Staged change probe"), "staged diff");
  if (staged.length > 0) reviewFail("STAGED_CHANGES_PRESENT", "Repository review requires an empty index before the Git operator boundary.", { paths: staged.map((entry) => entry.path) });
  const worktree = parseNameStatus(await mustGit(runGit, root.path, ["diff", "--name-status", "-z", "--no-renames", "--no-ext-diff", "--no-textconv", "--"], "Working-tree change probe"), "working-tree diff");
  const untracked = parseNulList(await mustGit(runGit, root.path, ["ls-files", "--others", "--exclude-standard", "-z", "--"], "Untracked-file probe"));
  const expectedPaths = resources.map((entry) => entry.path);
  const expectedSet = new Set(expectedPaths);
  const trackedExpected = new Set(parseNulList(await mustGit(runGit, root.path, ["ls-files", "-z", "--", ...expectedPaths], "Expected-resource tracking probe")));
  const invalidWorktree = worktree.filter((entry) => entry.status !== "M");
  if (invalidWorktree.length > 0) reviewFail("UNSAFE_WORKTREE_CHANGE", "Deletes, type changes, conflicts and other non-modification states are not commit-reviewable.", { entries: invalidWorktree });
  const unrelatedTracked = worktree.filter((entry) => !expectedSet.has(entry.path));
  const unrelatedUntracked = untracked.filter((entry) => !expectedSet.has(entry));
  if (unrelatedTracked.length > 0 || unrelatedUntracked.length > 0) reviewFail("UNRELATED_CHANGES_PRESENT", "Repository contains changes outside the exact seven handoff resources.", { tracked: unrelatedTracked.map((entry) => entry.path), untracked: unrelatedUntracked });
  const attributes = parseAttributeTriplets(await mustGit(runGit, root.path, ["check-attr", "-z", "--all", "--", ...expectedPaths], "Git attribute probe"));
  validateCommitTransformSafety(resources, attributes);
  const modifiedSet = new Set(worktree.map((entry) => entry.path));
  const untrackedSet = new Set(untracked);
  const invisible = expectedPaths.filter((entry) => !trackedExpected.has(entry) && !untrackedSet.has(entry));
  if (invisible.length > 0) reviewFail("EXPECTED_PATH_NOT_ADMISSIBLE", "One or more expected handoff resources are ignored or otherwise not visible to Git.", { paths: invisible });
  return Object.freeze({
    version, root: topLevel, head, branch, objectFormat, originUrl, originRepository,
    attributesSha256: canonicalSha256(attributes), stagedPaths: Object.freeze([]),
    modifiedExpectedPaths: Object.freeze(expectedPaths.filter((entry) => modifiedSet.has(entry)).sort()),
    untrackedExpectedPaths: Object.freeze(expectedPaths.filter((entry) => untrackedSet.has(entry)).sort()),
    unchangedExpectedPaths: Object.freeze(expectedPaths.filter((entry) => trackedExpected.has(entry) && !modifiedSet.has(entry)).sort()),
    unrelatedPaths: Object.freeze([]),
  });
}

export function snapshotIdentity(snapshot) {
  return canonicalSha256({
    head: snapshot.head, branch: snapshot.branch, objectFormat: snapshot.objectFormat,
    originRepository: snapshot.originRepository.toLowerCase(), attributesSha256: snapshot.attributesSha256,
    modifiedExpectedPaths: snapshot.modifiedExpectedPaths, untrackedExpectedPaths: snapshot.untrackedExpectedPaths,
    unchangedExpectedPaths: snapshot.unchangedExpectedPaths, stagedPaths: snapshot.stagedPaths,
    unrelatedPaths: snapshot.unrelatedPaths,
  });
}
