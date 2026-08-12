
from pathlib import Path

def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly 1 match, found {count}")
    return text.replace(old, new, 1)

test_path = Path("scripts/test-persistent-artist-workspace-jobs.mjs")
test = test_path.read_text(encoding="utf-8")
test = replace_once(
    test,
    "import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';",
    "import { mkdtemp, mkdir, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';",
    "test rename import",
)
case = """
  // Job journals are not trusted forever after creation: a later parent-directory symlink substitution fails closed.
  const pathChainRequest = structuredClone(request);
  pathChainRequest.jobId = 'job-path-chain';
  const pathChainPlan = await compileWorkspaceJob({ workspaceRoot: root, request: pathChainRequest, compiledAt: '2026-08-12T05:10:00.000Z' });
  await createWorkspaceJob({ workspaceRoot: root, plan: pathChainPlan });
  const pathChainJobRoot = path.join(root, 'journals', 'jobs', pathChainPlan.jobId);
  const relocatedParent = path.join(root, 'scratch-job-journal');
  await mkdir(relocatedParent, { recursive: true });
  const relocatedJobRoot = path.join(relocatedParent, pathChainPlan.jobId);
  await rename(pathChainJobRoot, relocatedJobRoot);
  await symlink(relocatedJobRoot, pathChainJobRoot, 'dir');
  await assert.rejects(
    inspectWorkspaceJob({ workspaceRoot: root, jobId: pathChainPlan.jobId, now: '2026-08-12T05:10:01.000Z' }),
    (error) => error?.code === 'ARTIST_WORKSPACE_JOB_PATH_INVALID',
  );
  await assert.rejects(
    claimWorkspaceJob({ workspaceRoot: root, jobId: pathChainPlan.jobId, actor: 'path-race-agent', leaseSeconds: 300, now: '2026-08-12T05:10:02.000Z' }),
    (error) => error?.code === 'ARTIST_WORKSPACE_JOB_PATH_INVALID',
  );

"""
test = replace_once(
    test,
    "  // Dependency cycles are rejected at compilation time.\n",
    case + "  // Dependency cycles are rejected at compilation time.\n",
    "path-chain regression insertion",
)
test = replace_once(
    test,
    "  console.log('- symbolic inputs and tampered events are rejected');",
    "  console.log('- symbolic inputs, post-creation journal path substitution and tampered events are rejected');",
    "test summary",
)
test_path.write_text(test, encoding="utf-8", newline="\n")

guard_path = Path("scripts/check-persistent-artist-workspace-jobs.mjs")
guard = guard_path.read_text(encoding="utf-8")
guard = replace_once(
    guard,
    "  'optimisticConcurrency: true',\n  'compareAndAppendEvents: true',",
    "  'optimisticConcurrency: true',\n  'postCreationPathChainRevalidation: true',\n  'compareAndAppendEvents: true',\n  'revalidateJournalPathChainOnReadAndAppend: true',",
    "static path-chain tokens",
)
guard = replace_once(
    guard,
    "for (const token of ['ChatGPT', 'Claude', 'crash-resumable', 'stale-lease recovery', 'exact input', 'output evidence', 'append-only', 'force push']) {",
    "for (const token of ['ChatGPT', 'Claude', 'crash-resumable', 'stale-lease recovery', 'exact input', 'output evidence', 'append-only', 'post-creation path confinement', 'force push']) {",
    "docs guard token",
)
guard = replace_once(
    guard,
    "console.log('- competing stale checkpoint intents fail closed instead of becoming later authoritative events');\nconsole.log('- failed steps remain resumable while dependency cycles are rejected');",
    "console.log('- competing stale checkpoint intents fail closed instead of becoming later authoritative events');\nconsole.log('- post-creation journal paths are revalidated through the workspace root before reads and appends');\nconsole.log('- failed steps remain resumable while dependency cycles are rejected');",
    "guard summary",
)
guard_path.write_text(guard, encoding="utf-8", newline="\n")

docs_path = Path("docs/PERSISTENT_ARTIST_WORKSPACE_JOBS.md")
docs = docs_path.read_text(encoding="utf-8")
docs = replace_once(
    docs,
    "There is no mutable `current.json` pointer. Current state is derived from immutable evidence each time the job is inspected.\n\n## Job request\n",
    """There is no mutable `current.json` pointer. Current state is derived from immutable evidence each time the job is inspected.

## Post-creation path confinement

Creation-time checks are not treated as permanent trust. Every later inspection re-walks the complete `journals/jobs/<job-id>/...` chain under the exact workspace root before reading the plan, commit marker, events directory, or an individual event. Every new checkpoint also revalidates the events directory and its create-only target before append.

If a job directory or later path component is replaced with a symbolic link or junction after job creation, inspection and mutation fail closed with `ARTIST_WORKSPACE_JOB_PATH_INVALID`. A stale path cannot redirect the resumable-job journal outside the configured workspace root.

## Job request
""",
    "documentation path-confinement section",
)
docs_path.write_text(docs, encoding="utf-8", newline="\n")
