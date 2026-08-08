from pathlib import Path

ROOT = Path.cwd()
LOCAL_STORE_PATH = ROOT / "packages/artifacts/src/local-store.ts"
TEST_PATH = ROOT / "packages/artifacts/test/reference-update-input-integrity-security.test.mjs"
WORKFLOW_PATH = ROOT / ".github/workflows/artifact-reference-integrity.yml"
AGENT_SCRIPT_PATH = ROOT / ".agent/apply-reference-update-options-integrity.py"
AGENT_WORKFLOW_PATH = ROOT / ".github/workflows/agent-apply-reference-update-options-integrity.yml"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


def replace_count(text: str, old: str, new: str, expected: int, label: str) -> str:
    count = text.count(old)
    if count != expected:
        raise RuntimeError(f"{label}: expected {expected} matches, found {count}")
    return text.replace(old, new)


local_store = LOCAL_STORE_PATH.read_text(encoding="utf-8")

old_snapshot_type = '''type DescriptorInputSnapshot = Readonly<{
  mediaType: unknown;
  storageClass: unknown;
  fileName: unknown;
  sourceArtifacts: unknown;
  labels: unknown;
  metadata: unknown;
}>;
'''
new_snapshot_type = old_snapshot_type + '''
type ReferenceUpdateOptionsSnapshot = Readonly<{
  expectedGeneration?: number;
  expectedArtifactId?: ArtifactId;
  actor?: string;
  updatedAt: string;
}>;
'''
local_store = replace_once(
    local_store,
    old_snapshot_type,
    new_snapshot_type,
    "reference update option snapshot type",
)

old_option_helpers = '''function optionReferenceActor(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    invalidReference("Artifact reference actor is invalid.");
  }
  const actor = value.trim();
  if (!actor) return undefined;
  if (actor.length > 512 || actor.includes("\\0")) {
    invalidReference("Artifact reference actor is invalid.");
  }
  return actor;
}

function optionReferenceTimestamp(value: Date): string {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    invalidReference("Artifact reference update time is invalid.");
  }
  return value.toISOString();
}
'''
new_option_helpers = '''function optionReferenceActor(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    invalidReference("Artifact reference actor is invalid.");
  }
  const actor = value.trim();
  if (!actor) return undefined;
  if (actor.length > 512 || actor.includes("\\0")) {
    invalidReference("Artifact reference actor is invalid.");
  }
  return actor;
}

function optionReferenceTimestamp(value: unknown): string {
  let time = Number.NaN;
  try {
    if (!(value instanceof Date)) {
      invalidReference("Artifact reference update time is invalid.");
    }
    time = Date.prototype.getTime.call(value);
  } catch {
    invalidReference("Artifact reference update time is invalid.");
  }
  if (!Number.isFinite(time)) {
    invalidReference("Artifact reference update time is invalid.");
  }
  return new Date(time).toISOString();
}

function snapshotReferenceUpdateOptions(
  value: unknown,
): ReferenceUpdateOptionsSnapshot {
  let recordLike = false;
  try {
    recordLike = isRecord(value);
  } catch {
    invalidReference(
      "Artifact reference update options could not be inspected safely.",
    );
  }
  if (!recordLike) {
    invalidReference("Artifact reference update options must be an object.");
  }

  const source = value as Readonly<Record<string, unknown>>;
  let expectedGenerationInput: unknown;
  let expectedArtifactIdInput: unknown;
  let actorInput: unknown;
  let nowInput: unknown;
  try {
    expectedGenerationInput = source.expectedGeneration;
    expectedArtifactIdInput = source.expectedArtifactId;
    actorInput = source.actor;
    nowInput = source.now;
  } catch {
    invalidReference(
      "Artifact reference update option fields could not be read safely.",
    );
  }

  let expectedGeneration: number | undefined;
  if (expectedGenerationInput !== undefined) {
    if (
      typeof expectedGenerationInput !== "number" ||
      !Number.isSafeInteger(expectedGenerationInput) ||
      expectedGenerationInput < 0
    ) {
      invalidReference(
        "Artifact reference expectedGeneration must be a non-negative safe integer.",
      );
    }
    expectedGeneration = expectedGenerationInput;
  }

  let expectedArtifactId: ArtifactId | undefined;
  if (expectedArtifactIdInput !== undefined) {
    if (
      typeof expectedArtifactIdInput !== "string" ||
      !ARTIFACT_ID.test(expectedArtifactIdInput)
    ) {
      invalidReference(
        "Artifact reference expectedArtifactId must use artifact_<sha256> format.",
      );
    }
    expectedArtifactId = expectedArtifactIdInput as ArtifactId;
  }

  const actor = optionReferenceActor(actorInput);
  const updatedAt = optionReferenceTimestamp(
    nowInput === undefined ? new Date() : nowInput,
  );

  return Object.freeze({
    ...(expectedGeneration === undefined ? {} : { expectedGeneration }),
    ...(expectedArtifactId === undefined ? {} : { expectedArtifactId }),
    ...(actor === undefined ? {} : { actor }),
    updatedAt,
  });
}
'''
local_store = replace_once(
    local_store,
    old_option_helpers,
    new_option_helpers,
    "reference update option helpers",
)

old_update_prefix = '''  public async updateReference(
    namespace: string,
    name: string,
    id: ArtifactId,
    options: UpdateArtifactReferenceOptions = {},
  ): Promise<ArtifactReference> {
    validateArtifactId(id);
    const descriptor = await this.get(id);
    if (!descriptor) {
      throw new ArtifactStoreError(
        "ARTIFACT_NOT_FOUND",
        `Artifact ${id} was not found.`,
      );
    }
    const normalizedNamespace = safeNamespace(namespace).join("/");
    const normalizedName = safeSegment(name, "name");
    const actor = optionReferenceActor(options.actor);
    const updatedAt = optionReferenceTimestamp(options.now ?? new Date());
'''
new_update_prefix = '''  public async updateReference(
    namespace: string,
    name: string,
    id: ArtifactId,
    options: UpdateArtifactReferenceOptions = {},
  ): Promise<ArtifactReference> {
    const {
      expectedGeneration,
      expectedArtifactId,
      actor,
      updatedAt,
    } = snapshotReferenceUpdateOptions(options);
    validateArtifactId(id);
    const descriptor = await this.get(id);
    if (!descriptor) {
      throw new ArtifactStoreError(
        "ARTIFACT_NOT_FOUND",
        `Artifact ${id} was not found.`,
      );
    }
    const normalizedNamespace = safeNamespace(namespace).join("/");
    const normalizedName = safeSegment(name, "name");
'''
local_store = replace_once(
    local_store,
    old_update_prefix,
    new_update_prefix,
    "reference update method snapshot",
)
local_store = replace_count(
    local_store,
    "options.expectedGeneration",
    "expectedGeneration",
    2,
    "expected generation live reads",
)
local_store = replace_count(
    local_store,
    "options.expectedArtifactId",
    "expectedArtifactId",
    2,
    "expected artifact live reads",
)
LOCAL_STORE_PATH.write_text(local_store, encoding="utf-8")

TEST_PATH.write_text(
    '''import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { ArtifactStoreError, LocalArtifactStore } from "../dist/index.js";

const T0 = new Date("2026-08-08T00:00:00.000Z");
const T1 = new Date("2026-08-08T00:01:00.000Z");

function once(reads, name, value) {
  return {
    enumerable: true,
    configurable: true,
    get() {
      const count = (reads.get(name) ?? 0) + 1;
      reads.set(name, count);
      if (count > 1) {
        throw new Error(`reference-update-secret-${name}`);
      }
      return value;
    },
  };
}

function referenceInputFailure(secret) {
  return (error) =>
    error instanceof ArtifactStoreError &&
    error.code === "ARTIFACT_REFERENCE_INVALID" &&
    !error.message.includes(secret);
}

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-reference-input-"));
  const artifacts = new LocalArtifactStore({ root });
  await artifacts.root();
  const first = await artifacts.put("v1", {
    mediaType: "text/plain",
    storageClass: "master",
  });
  const second = await artifacts.put("v2", {
    mediaType: "text/plain",
    storageClass: "master",
  });
  await artifacts.updateReference(
    "projects/demo",
    "approved-master",
    first.artifactId,
    {
      expectedGeneration: 0,
      actor: "operator-a",
      now: T0,
    },
  );
  const referencePath = path.join(
    root,
    "refs",
    "projects",
    "demo",
    "approved-master.json",
  );
  t.after(async () => {
    await rm(root, { recursive: true, force: true });
  });
  return { artifacts, first, second, referencePath };
}

test("reference update options are read once and detached before promotion", async (t) => {
  const { artifacts, first, second } = await fixture(t);
  const reads = new Map();
  const options = {};
  Object.defineProperties(options, {
    expectedGeneration: once(reads, "expectedGeneration", 1),
    expectedArtifactId: once(
      reads,
      "expectedArtifactId",
      first.artifactId,
    ),
    actor: once(reads, "actor", " operator-b "),
    now: once(reads, "now", T1),
  });

  const updated = await artifacts.updateReference(
    "projects/demo",
    "approved-master",
    second.artifactId,
    options,
  );

  for (const name of [
    "expectedGeneration",
    "expectedArtifactId",
    "actor",
    "now",
  ]) {
    assert.equal(reads.get(name), 1, name);
  }
  assert.equal(updated.generation, 2);
  assert.equal(updated.artifactId, second.artifactId);
  assert.equal(updated.previousArtifactId, first.artifactId);
  assert.equal(updated.actor, "operator-b");
  assert.equal(updated.updatedAt, T1.toISOString());
});

test("reference compare-and-swap binds caller options before asynchronous reads", async (t) => {
  const { artifacts, first, second } = await fixture(t);
  const now = new Date(T1);
  const options = {
    expectedGeneration: 1,
    expectedArtifactId: first.artifactId,
    actor: "operator-original",
    now,
  };

  const update = artifacts.updateReference(
    "projects/demo",
    "approved-master",
    second.artifactId,
    options,
  );
  options.expectedGeneration = 999;
  options.expectedArtifactId = second.artifactId;
  options.actor = "operator-mutated";
  now.setUTCFullYear(2040);

  const updated = await update;
  assert.equal(updated.generation, 2);
  assert.equal(updated.artifactId, second.artifactId);
  assert.equal(updated.previousArtifactId, first.artifactId);
  assert.equal(updated.actor, "operator-original");
  assert.equal(updated.updatedAt, T1.toISOString());
});

test("hostile reference update options fail closed without leaking errors", async (t) => {
  const { artifacts, second, referencePath } = await fixture(t);
  const before = await readFile(referencePath, "utf8");
  const secret = "private-reference-option-error";
  const hostile = {};
  Object.defineProperty(hostile, "expectedGeneration", {
    enumerable: true,
    get() {
      throw new Error(secret);
    },
  });

  await assert.rejects(
    () =>
      artifacts.updateReference(
        "projects/demo",
        "approved-master",
        second.artifactId,
        hostile,
      ),
    referenceInputFailure(secret),
  );
  assert.equal(await readFile(referencePath, "utf8"), before);

  const revoked = Proxy.revocable({}, {});
  revoked.revoke();
  await assert.rejects(
    () =>
      artifacts.updateReference(
        "projects/demo",
        "approved-master",
        second.artifactId,
        revoked.proxy,
      ),
    referenceInputFailure(secret),
  );
  assert.equal(await readFile(referencePath, "utf8"), before);
});

test("reference compare-and-swap inputs reject malformed runtime values", async (t) => {
  const { artifacts, first, second } = await fixture(t);
  const invalidOptions = [
    null,
    { expectedGeneration: -1 },
    { expectedGeneration: 1.5 },
    { expectedGeneration: "1" },
    { expectedArtifactId: "artifact_bad" },
  ];

  for (const options of invalidOptions) {
    await assert.rejects(
      () =>
        artifacts.updateReference(
          "projects/demo",
          "approved-master",
          second.artifactId,
          options,
        ),
      referenceInputFailure("malformed-reference-option"),
    );
  }

  const resolved = await artifacts.resolveReference(
    "projects/demo",
    "approved-master",
  );
  assert.equal(resolved.artifactId, first.artifactId);
  assert.equal(resolved.generation, 1);
});
''',
    encoding="utf-8",
)

workflow = WORKFLOW_PATH.read_text(encoding="utf-8")
workflow = replace_count(
    workflow,
    '      - "packages/artifacts/test/reference-integrity-security.test.mjs"\n      - "scripts/bootstrap-ci-media-tools.sh"',
    '      - "packages/artifacts/test/reference-integrity-security.test.mjs"\n      - "packages/artifacts/test/reference-update-input-integrity-security.test.mjs"\n      - "scripts/bootstrap-ci-media-tools.sh"',
    2,
    "reference workflow path coverage",
)
workflow = replace_once(
    workflow,
    '''          packages/artifacts/test/descriptor-integrity-security.test.mjs
          packages/artifacts/test/reference-integrity-security.test.mjs
''',
    '''          packages/artifacts/test/descriptor-integrity-security.test.mjs
          packages/artifacts/test/reference-integrity-security.test.mjs
          packages/artifacts/test/reference-update-input-integrity-security.test.mjs
''',
    "reference workflow focused tests",
)
workflow = replace_once(
    workflow,
    '''          grep -F 'reference bytes, file identity and target descriptors are validated before use' packages/artifacts/test/reference-integrity-security.test.mjs
          ! grep -F 'return reference as ArtifactReference' packages/artifacts/src/local-store.ts
''',
    '''          grep -F 'reference bytes, file identity and target descriptors are validated before use' packages/artifacts/test/reference-integrity-security.test.mjs
          grep -F 'snapshotReferenceUpdateOptions' packages/artifacts/src/local-store.ts
          grep -F 'reference update options are read once and detached before promotion' packages/artifacts/test/reference-update-input-integrity-security.test.mjs
          grep -F 'reference compare-and-swap binds caller options before asynchronous reads' packages/artifacts/test/reference-update-input-integrity-security.test.mjs
          grep -F 'hostile reference update options fail closed without leaking errors' packages/artifacts/test/reference-update-input-integrity-security.test.mjs
          ! grep -F 'options.expectedGeneration' packages/artifacts/src/local-store.ts
          ! grep -F 'options.expectedArtifactId' packages/artifacts/src/local-store.ts
          ! grep -F 'return reference as ArtifactReference' packages/artifacts/src/local-store.ts
''',
    "reference workflow permanent contract",
)
WORKFLOW_PATH.write_text(workflow, encoding="utf-8")

AGENT_SCRIPT_PATH.unlink()
AGENT_WORKFLOW_PATH.unlink()
try:
    AGENT_SCRIPT_PATH.parent.rmdir()
except OSError:
    pass
