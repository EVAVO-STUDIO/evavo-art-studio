
from pathlib import Path

def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly 1 match, found {count}")
    return text.replace(old, new, 1)

def replace_exact_count(text, old, new, expected, label):
    count = text.count(old)
    if count != expected:
        raise SystemExit(f"{label}: expected exactly {expected} matches, found {count}")
    return text.replace(old, new)

path = Path("scripts/project-art/persistent-workspace-jobs.mjs")
text = path.read_text(encoding="utf-8")

text = replace_once(
    text,
    "  return current;\n}\n\nasync function snapshotFile(root, relative, label = 'file') {",
    """  return current;
}

async function resolveJobPath(root, relative, label, { allowMissingLeaf = false, requireDirectory = false } = {}) {
  let absolute;
  try {
    absolute = await rejectSymbolicChain(root, relative, { allowMissingLeaf });
  } catch (error) {
    if (typeof error?.code === 'string' && error.code.startsWith('ARTIST_WORKSPACE_JOB_')) throw error;
    fail('ARTIST_WORKSPACE_JOB_PATH_INVALID', `${label} cannot be resolved safely: ${error.message}`);
  }
  if (requireDirectory) {
    const metadata = await lstat(absolute).catch((error) => {
      fail('ARTIST_WORKSPACE_JOB_PATH_INVALID', `${label} cannot be inspected: ${error.message}`);
    });
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
      fail('ARTIST_WORKSPACE_JOB_PATH_INVALID', `${label} must be a non-symbolic directory.`);
    }
    const resolved = await realpath(absolute).catch((error) => {
      fail('ARTIST_WORKSPACE_JOB_PATH_INVALID', `${label} cannot be resolved: ${error.message}`);
    });
    if (!insideRoot(root, resolved)) fail('ARTIST_WORKSPACE_JOB_PATH_INVALID', `${label} escaped workspaceRoot.`);
    absolute = resolved;
  }
  return absolute;
}

async function snapshotFile(root, relative, label = 'file') {""",
    "insert resolveJobPath helper",
)

text = replace_once(
    text,
    "    optimisticConcurrency: true,\n    imageBytesThroughMcp: false,",
    "    optimisticConcurrency: true,\n    postCreationPathChainRevalidation: true,\n    imageBytesThroughMcp: false,",
    "capability flag",
)
text = replace_once(
    text,
    "      compareAndAppendEvents: true,\n      exactInputRevalidationBeforeStart: true,",
    "      compareAndAppendEvents: true,\n      revalidateJournalPathChainOnReadAndAppend: true,\n      exactInputRevalidationBeforeStart: true,",
    "plan execution flag",
)

old = """async function readPlanFromRoot(root, jobId) {
  const paths = jobPaths(root, jobId);
  const { value: commit } = await readStableJsonFile(paths.commitPath, 'job commit marker');
  if (!isRecord(commit) || commit.schema !== JOB_COMMIT_SCHEMA || commit.jobId !== jobId) {
    fail('ARTIST_WORKSPACE_JOB_STATE_INVALID', 'Job commit marker is missing or invalid.');
  }
  verifyDocumentHash(commit, 'job commit marker');
  const { value } = await readStableJsonFile(paths.planPath, 'job plan');
  validatePlan(value);
  if (value.workspaceRoot !== root) fail('ARTIST_WORKSPACE_JOB_PLAN_INVALID', 'Job plan workspaceRoot does not match the inspected root.');
  if (value.jobId !== jobId) fail('ARTIST_WORKSPACE_JOB_PLAN_INVALID', 'Job plan jobId does not match its directory.');
  if (commit.planSha256 !== value.documentSha256) fail('ARTIST_WORKSPACE_JOB_STATE_INVALID', 'Job commit marker does not bind the current plan.');
  const { value: initialEvent } = await readStableJsonFile(path.join(paths.eventsRoot, eventFilename(1)), 'initial job event');
  if (initialEvent.documentSha256 !== commit.initialEventSha256) fail('ARTIST_WORKSPACE_JOB_STATE_INVALID', 'Job commit marker does not bind the initial event.');
  return { plan: value, commit, ...paths };
}
"""
new = """async function readPlanFromRoot(root, jobId) {
  const safeJobId = safeId(jobId, 'jobId');
  const relativeRoot = `journals/jobs/${safeJobId}`;
  const jobRoot = await resolveJobPath(root, relativeRoot, 'job root', { requireDirectory: true });
  const planPath = await resolveJobPath(root, `${relativeRoot}/job-plan.json`, 'job plan path');
  const eventsRoot = await resolveJobPath(root, `${relativeRoot}/events`, 'job events directory', { requireDirectory: true });
  const commitPath = await resolveJobPath(root, `${relativeRoot}/job-commit.json`, 'job commit marker path');
  const { value: commit } = await readStableJsonFile(commitPath, 'job commit marker');
  if (!isRecord(commit) || commit.schema !== JOB_COMMIT_SCHEMA || commit.jobId !== safeJobId) {
    fail('ARTIST_WORKSPACE_JOB_STATE_INVALID', 'Job commit marker is missing or invalid.');
  }
  verifyDocumentHash(commit, 'job commit marker');
  const { value } = await readStableJsonFile(planPath, 'job plan');
  validatePlan(value);
  if (value.workspaceRoot !== root) fail('ARTIST_WORKSPACE_JOB_PLAN_INVALID', 'Job plan workspaceRoot does not match the inspected root.');
  if (value.jobId !== safeJobId) fail('ARTIST_WORKSPACE_JOB_PLAN_INVALID', 'Job plan jobId does not match its directory.');
  if (commit.planSha256 !== value.documentSha256) fail('ARTIST_WORKSPACE_JOB_STATE_INVALID', 'Job commit marker does not bind the current plan.');
  const initialEventPath = await resolveJobPath(root, `${relativeRoot}/events/${eventFilename(1)}`, 'initial job event path');
  const { value: initialEvent } = await readStableJsonFile(initialEventPath, 'initial job event');
  if (initialEvent.documentSha256 !== commit.initialEventSha256) fail('ARTIST_WORKSPACE_JOB_STATE_INVALID', 'Job commit marker does not bind the initial event.');
  return { plan: value, commit, jobRoot, planPath, eventsRoot, commitPath };
}
"""
text = replace_once(text, old, new, "readPlanFromRoot hardening")

old = """async function readEvents(eventsRoot, jobId) {
  const metadata = await lstat(eventsRoot).catch((error) => fail('ARTIST_WORKSPACE_JOB_STATE_INVALID', `Events directory cannot be inspected: ${error.message}`));
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) fail('ARTIST_WORKSPACE_JOB_STATE_INVALID', 'Events path must be a non-symbolic directory.');
  const names = (await readdir(eventsRoot)).filter((name) => /^\\d{6}\\.json$/.test(name)).sort();
  if (names.length < 1 || names.length > MAX_EVENTS) fail('ARTIST_WORKSPACE_JOB_STATE_INVALID', `Job event count must be 1-${MAX_EVENTS}.`);
  const events = [];
  let previous = null;
  for (let index = 0; index < names.length; index += 1) {
    const expectedName = eventFilename(index + 1);
    if (names[index] !== expectedName) fail('ARTIST_WORKSPACE_JOB_STATE_INVALID', `Job event sequence is not contiguous at ${expectedName}.`);
    const { value } = await readStableJsonFile(path.join(eventsRoot, names[index]), `job event ${expectedName}`);
    if (!isRecord(value) || value.schema !== JOB_EVENT_SCHEMA || value.jobId !== jobId || value.sequence !== index + 1) fail('ARTIST_WORKSPACE_JOB_STATE_INVALID', `Job event ${expectedName} has invalid identity.`);
    verifyDocumentHash(value, `job event ${expectedName}`);
    const expectedPrevious = previous?.documentSha256 ?? null;
    if (value.previousEventSha256 !== expectedPrevious) fail('ARTIST_WORKSPACE_JOB_STATE_INVALID', `Job event ${expectedName} broke the hash chain.`);
    events.push(value);
    previous = value;
  }
  return events;
}
"""
new = """async function readEvents(root, jobId) {
  const safeJobId = safeId(jobId, 'jobId');
  const relativeEventsRoot = `journals/jobs/${safeJobId}/events`;
  const eventsRoot = await resolveJobPath(root, relativeEventsRoot, 'job events directory', { requireDirectory: true });
  const names = (await readdir(eventsRoot)).filter((name) => /^\\d{6}\\.json$/.test(name)).sort();
  if (names.length < 1 || names.length > MAX_EVENTS) fail('ARTIST_WORKSPACE_JOB_STATE_INVALID', `Job event count must be 1-${MAX_EVENTS}.`);
  const events = [];
  let previous = null;
  for (let index = 0; index < names.length; index += 1) {
    const expectedName = eventFilename(index + 1);
    if (names[index] !== expectedName) fail('ARTIST_WORKSPACE_JOB_STATE_INVALID', `Job event sequence is not contiguous at ${expectedName}.`);
    const eventPath = await resolveJobPath(root, `${relativeEventsRoot}/${names[index]}`, `job event ${expectedName} path`);
    const { value } = await readStableJsonFile(eventPath, `job event ${expectedName}`);
    if (!isRecord(value) || value.schema !== JOB_EVENT_SCHEMA || value.jobId !== safeJobId || value.sequence !== index + 1) fail('ARTIST_WORKSPACE_JOB_STATE_INVALID', `Job event ${expectedName} has invalid identity.`);
    verifyDocumentHash(value, `job event ${expectedName}`);
    const expectedPrevious = previous?.documentSha256 ?? null;
    if (value.previousEventSha256 !== expectedPrevious) fail('ARTIST_WORKSPACE_JOB_STATE_INVALID', `Job event ${expectedName} broke the hash chain.`);
    events.push(value);
    previous = value;
  }
  return events;
}
"""
text = replace_once(text, old, new, "readEvents hardening")
text = replace_exact_count(
    text,
    "const events = await readEvents(eventsRoot, plan.jobId);",
    "const events = await readEvents(root, plan.jobId);",
    2,
    "readEvents call sites",
)
text = replace_once(
    text,
    "  const target = path.join(eventsRoot, eventFilename(sequence));",
    """  const target = await resolveJobPath(
    root,
    `journals/jobs/${plan.jobId}/events/${eventFilename(sequence)}`,
    'next job event path',
    { allowMissingLeaf: true },
  );""",
    "append target confinement",
)
path.write_text(text, encoding="utf-8", newline="\n")
