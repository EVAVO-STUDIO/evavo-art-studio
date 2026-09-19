import { createHash } from "node:crypto";

import {
  ArtifactStoreError,
  LocalArtifactStore,
} from "@evavo/art-artifacts";
import type {
  ArtifactDescriptorInput,
  ArtifactId,
  ArtifactReference,
  StoredArtifact,
} from "@evavo/art-artifacts";
import {
  verifyApprovedVisualContinuityStudioHandoff,
  verifyVisualContinuityApprovalReceipt,
  verifyVisualContinuityBible,
  verifyVisualContinuitySession,
} from "@evavo/art-direction";
import type {
  ApprovedVisualContinuityStudioHandoff,
  CompiledVisualContinuityBible,
  CompiledVisualContinuitySession,
  VisualContinuityApprovalReceipt,
} from "@evavo/art-direction";

const IDENTIFIER = /^[a-z0-9]+(?:[a-z0-9_-]*[a-z0-9])?$/u;
const ARTIFACT_ID = /^artifact_[a-f0-9]{64}$/u;

export class VisualContinuityWorkspaceError extends Error {
  public readonly code: string;

  public constructor(code: string, message: string) {
    super(message);
    this.name = "VisualContinuityWorkspaceError";
    this.code = code;
  }
}

export interface ContinuityPersistOptions {
  readonly expectedGeneration: number;
  readonly actor: string;
  readonly now?: Date;
}

export interface ContinuityPersistResult {
  readonly artifact: StoredArtifact;
  readonly reference: ArtifactReference;
  readonly idempotent: boolean;
}

function fail(code: string, message: string): never {
  throw new VisualContinuityWorkspaceError(code, message);
}

function canonicalIdentifier(value: string, label: string): string {
  if (!IDENTIFIER.test(value) || value.includes("..")) {
    fail(
      "VISUAL_CONTINUITY_WORKSPACE_IDENTIFIER_INVALID",
      `${label} must be a canonical lowercase identifier.`,
    );
  }
  return value;
}

function stableSegment(
  category: string,
  value: string,
  label: string,
): string {
  const canonical = canonicalIdentifier(value, label);
  const digest = createHash("sha256").update(canonical).digest("hex");
  return `${category}-${canonical.slice(0, 48)}-${digest.slice(0, 16)}`;
}

function combinationDigest(...values: readonly string[]): string {
  return createHash("sha256").update(values.join("\u0000")).digest("hex");
}

export function visualContinuityWorkspaceNamespace(
  projectId: string,
  bibleId: string,
): string {
  return [
    "visual-continuity",
    stableSegment("project", projectId, "projectId"),
    stableSegment("bible", bibleId, "bibleId"),
  ].join("/");
}

export function visualContinuitySessionReferenceName(
  sessionId: string,
): string {
  return stableSegment("session", sessionId, "sessionId");
}

export function visualContinuityApprovalReferenceName(
  sessionId: string,
  workItemId: string,
): string {
  const session = canonicalIdentifier(sessionId, "sessionId");
  const workItem = canonicalIdentifier(workItemId, "workItemId");
  return `approval-${workItem.slice(0, 40)}-${combinationDigest(session, workItem).slice(0, 20)}`;
}

export function visualContinuityHandoffReferenceName(
  sessionId: string,
  targetStudio: string,
  receiverProjectId: string,
): string {
  const session = canonicalIdentifier(sessionId, "sessionId");
  const target = canonicalIdentifier(targetStudio, "targetStudio");
  const receiver = canonicalIdentifier(receiverProjectId, "receiverProjectId");
  return `handoff-${target.slice(0, 32)}-${combinationDigest(session, target, receiver).slice(0, 20)}`;
}

function serialize(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function storeAt(root: string): LocalArtifactStore {
  if (!root.trim()) {
    fail(
      "VISUAL_CONTINUITY_WORKSPACE_ROOT_MISSING",
      "A fixed Art Studio artifact root is required.",
    );
  }
  return new LocalArtifactStore({ root });
}

function validatePersistOptions(
  options: ContinuityPersistOptions,
): ContinuityPersistOptions {
  if (
    !Number.isSafeInteger(options.expectedGeneration) ||
    options.expectedGeneration < 0
  ) {
    fail(
      "VISUAL_CONTINUITY_WORKSPACE_GENERATION_INVALID",
      "expectedGeneration must be a non-negative safe integer.",
    );
  }
  if (
    !options.actor ||
    options.actor.trim() !== options.actor ||
    options.actor.length > 512 ||
    options.actor.includes("\0")
  ) {
    fail(
      "VISUAL_CONTINUITY_WORKSPACE_ACTOR_INVALID",
      "actor must be one canonical non-empty identity.",
    );
  }
  return options;
}

async function persistReference(
  store: LocalArtifactStore,
  namespace: string,
  name: string,
  content: string,
  descriptor: ArtifactDescriptorInput,
  optionsInput: ContinuityPersistOptions,
): Promise<ContinuityPersistResult> {
  const options = validatePersistOptions(optionsInput);
  const artifact = await store.put(content, descriptor);
  const existing = await store.resolveReference(namespace, name);
  if (existing?.artifactId === artifact.artifactId) {
    return {
      artifact,
      reference: existing,
      idempotent: true,
    };
  }
  const reference = await store.updateReference(
    namespace,
    name,
    artifact.artifactId,
    {
      expectedGeneration: options.expectedGeneration,
      actor: options.actor,
      ...(options.now === undefined ? {} : { now: options.now }),
    },
  );
  return {
    artifact,
    reference,
    idempotent: false,
  };
}

async function readJsonArtifact<T>(
  store: LocalArtifactStore,
  artifactId: ArtifactId,
  label: string,
): Promise<T> {
  const verification = await store.verify(artifactId);
  if (
    !verification.exists ||
    !verification.descriptorValid ||
    !verification.contentValid
  ) {
    fail(
      "VISUAL_CONTINUITY_WORKSPACE_ARTIFACT_INVALID",
      `${label} ${artifactId} failed immutable artifact verification.`,
    );
  }
  const bytes = await store.read(artifactId);
  try {
    return JSON.parse(bytes.toString("utf8")) as T;
  } catch {
    fail(
      "VISUAL_CONTINUITY_WORKSPACE_JSON_INVALID",
      `${label} ${artifactId} is not valid JSON.`,
    );
  }
}

async function persistedBibleReference(
  store: LocalArtifactStore,
  bible: CompiledVisualContinuityBible,
): Promise<ArtifactReference> {
  const namespace = visualContinuityWorkspaceNamespace(
    bible.project.projectId,
    bible.bibleId,
  );
  const reference = await store.resolveReference(namespace, "bible");
  if (!reference) {
    fail(
      "VISUAL_CONTINUITY_WORKSPACE_BIBLE_MISSING",
      "Persist the exact visual continuity bible before persisting dependent state.",
    );
  }
  const stored = await readJsonArtifact<CompiledVisualContinuityBible>(
    store,
    reference.artifactId,
    "Visual continuity bible",
  );
  verifyVisualContinuityBible(stored);
  if (stored.bibleSha256 !== bible.bibleSha256) {
    fail(
      "VISUAL_CONTINUITY_WORKSPACE_BIBLE_CONFLICT",
      "The current persisted bible does not match the supplied bible SHA-256.",
    );
  }
  return reference;
}

async function persistedSessionReference(
  store: LocalArtifactStore,
  bible: CompiledVisualContinuityBible,
  session: CompiledVisualContinuitySession,
): Promise<ArtifactReference> {
  const namespace = visualContinuityWorkspaceNamespace(
    bible.project.projectId,
    bible.bibleId,
  );
  const reference = await store.resolveReference(
    namespace,
    visualContinuitySessionReferenceName(session.sessionId),
  );
  if (!reference) {
    fail(
      "VISUAL_CONTINUITY_WORKSPACE_SESSION_MISSING",
      "Persist the exact visual continuity session before persisting approvals or handoffs.",
    );
  }
  const stored = await readJsonArtifact<CompiledVisualContinuitySession>(
    store,
    reference.artifactId,
    "Visual continuity session",
  );
  verifyVisualContinuitySession(bible, stored);
  if (stored.sessionSha256 !== session.sessionSha256) {
    fail(
      "VISUAL_CONTINUITY_WORKSPACE_SESSION_CONFLICT",
      "The current persisted session does not match the supplied session SHA-256.",
    );
  }
  return reference;
}

export async function persistVisualContinuityBible(
  root: string,
  bible: CompiledVisualContinuityBible,
  options: ContinuityPersistOptions,
): Promise<ContinuityPersistResult> {
  verifyVisualContinuityBible(bible);
  const store = storeAt(root);
  return persistReference(
    store,
    visualContinuityWorkspaceNamespace(
      bible.project.projectId,
      bible.bibleId,
    ),
    "bible",
    serialize(bible),
    {
      mediaType: "application/vnd.evavo.visual-continuity-bible+json",
      storageClass: "manifest",
      fileName: `bible-${bible.bibleSha256.slice(0, 20)}.json`,
      labels: {
        projectId: bible.project.projectId,
        bibleId: bible.bibleId,
        bibleSha256: bible.bibleSha256,
        documentKind: "visual-continuity-bible",
      },
      metadata: {
        schemaVersion: "1.0",
        protocolVersion: bible.protocolVersion,
        documentKind: "visual-continuity-bible",
      },
    },
    options,
  );
}

export async function persistVisualContinuitySession(
  root: string,
  bible: CompiledVisualContinuityBible,
  session: CompiledVisualContinuitySession,
  options: ContinuityPersistOptions,
): Promise<ContinuityPersistResult> {
  verifyVisualContinuityBible(bible);
  verifyVisualContinuitySession(bible, session);
  const store = storeAt(root);
  const bibleReference = await persistedBibleReference(store, bible);
  return persistReference(
    store,
    visualContinuityWorkspaceNamespace(
      bible.project.projectId,
      bible.bibleId,
    ),
    visualContinuitySessionReferenceName(session.sessionId),
    serialize(session),
    {
      mediaType: "application/vnd.evavo.visual-continuity-session+json",
      storageClass: "manifest",
      fileName: `session-${session.sessionSha256.slice(0, 20)}.json`,
      sourceArtifacts: [bibleReference.artifactId],
      labels: {
        projectId: bible.project.projectId,
        bibleId: bible.bibleId,
        sessionId: session.sessionId,
        sessionSha256: session.sessionSha256,
        documentKind: "visual-continuity-session",
      },
      metadata: {
        schemaVersion: "1.0",
        protocolVersion: session.protocolVersion,
        bibleSha256: bible.bibleSha256,
        documentKind: "visual-continuity-session",
      },
    },
    options,
  );
}

export async function persistVisualContinuityApproval(
  root: string,
  bible: CompiledVisualContinuityBible,
  session: CompiledVisualContinuitySession,
  approval: VisualContinuityApprovalReceipt,
  options: ContinuityPersistOptions,
): Promise<ContinuityPersistResult> {
  verifyVisualContinuityApprovalReceipt(bible, session, approval);
  const store = storeAt(root);
  const bibleReference = await persistedBibleReference(store, bible);
  const sessionReference = await persistedSessionReference(
    store,
    bible,
    session,
  );
  return persistReference(
    store,
    visualContinuityWorkspaceNamespace(
      bible.project.projectId,
      bible.bibleId,
    ),
    visualContinuityApprovalReferenceName(
      session.sessionId,
      approval.workItemId,
    ),
    serialize(approval),
    {
      mediaType: "application/vnd.evavo.visual-continuity-approval+json",
      storageClass: "evidence",
      fileName: `approval-${approval.approvalSha256.slice(0, 20)}.json`,
      sourceArtifacts: [
        bibleReference.artifactId,
        sessionReference.artifactId,
      ],
      labels: {
        projectId: bible.project.projectId,
        bibleId: bible.bibleId,
        sessionId: session.sessionId,
        workItemId: approval.workItemId,
        approvalSha256: approval.approvalSha256,
        decision: approval.decision,
        documentKind: "visual-continuity-approval",
      },
      metadata: {
        schemaVersion: "1.0",
        protocolVersion: approval.protocolVersion,
        candidateSha256: approval.candidateSha256,
        attemptSha256: approval.attemptSha256,
        documentKind: "visual-continuity-approval",
      },
    },
    options,
  );
}

export async function persistApprovedVisualContinuityHandoff(
  root: string,
  bible: CompiledVisualContinuityBible,
  session: CompiledVisualContinuitySession,
  handoff: ApprovedVisualContinuityStudioHandoff,
  options: ContinuityPersistOptions,
): Promise<ContinuityPersistResult> {
  verifyApprovedVisualContinuityStudioHandoff(bible, session, handoff);
  const store = storeAt(root);
  const bibleReference = await persistedBibleReference(store, bible);
  const sessionReference = await persistedSessionReference(
    store,
    bible,
    session,
  );
  const approvalArtifactIds: ArtifactId[] = [];
  for (const approval of handoff.approvalReceipts) {
    const reference = await store.resolveReference(
      visualContinuityWorkspaceNamespace(
        bible.project.projectId,
        bible.bibleId,
      ),
      visualContinuityApprovalReferenceName(
        session.sessionId,
        approval.workItemId,
      ),
    );
    if (!reference) {
      fail(
        "VISUAL_CONTINUITY_WORKSPACE_APPROVAL_MISSING",
        `Persist approval ${approval.workItemId} before persisting its handoff.`,
      );
    }
    const stored = await readJsonArtifact<VisualContinuityApprovalReceipt>(
      store,
      reference.artifactId,
      "Visual continuity approval",
    );
    verifyVisualContinuityApprovalReceipt(bible, session, stored);
    if (stored.approvalSha256 !== approval.approvalSha256) {
      fail(
        "VISUAL_CONTINUITY_WORKSPACE_APPROVAL_CONFLICT",
        `Persisted approval ${approval.workItemId} does not match the handoff.`,
      );
    }
    approvalArtifactIds.push(reference.artifactId);
  }
  return persistReference(
    store,
    visualContinuityWorkspaceNamespace(
      bible.project.projectId,
      bible.bibleId,
    ),
    visualContinuityHandoffReferenceName(
      session.sessionId,
      handoff.targetStudio,
      handoff.receiverProjectId,
    ),
    serialize(handoff),
    {
      mediaType: "application/vnd.evavo.visual-continuity-approved-handoff+json",
      storageClass: "manifest",
      fileName: `handoff-${handoff.handoffSha256.slice(0, 20)}.json`,
      sourceArtifacts: [
        bibleReference.artifactId,
        sessionReference.artifactId,
        ...approvalArtifactIds,
      ],
      labels: {
        projectId: bible.project.projectId,
        bibleId: bible.bibleId,
        sessionId: session.sessionId,
        targetStudio: handoff.targetStudio,
        receiverProjectId: handoff.receiverProjectId,
        handoffSha256: handoff.handoffSha256,
        documentKind: "visual-continuity-approved-handoff",
      },
      metadata: {
        schemaVersion: "1.0",
        protocolVersion: handoff.protocolVersion,
        releaseStatus: handoff.releaseStatus,
        sourceCount: handoff.sources.length,
        approvalCount: handoff.approvalReceipts.length,
        documentKind: "visual-continuity-approved-handoff",
      },
    },
    options,
  );
}

export async function loadVisualContinuityWorkspace(
  root: string,
  projectId: string,
  bibleId: string,
  sessionId?: string,
) {
  const store = storeAt(root);
  const namespace = visualContinuityWorkspaceNamespace(projectId, bibleId);
  const bibleReference = await store.resolveReference(namespace, "bible");
  if (!bibleReference) {
    fail(
      "VISUAL_CONTINUITY_WORKSPACE_BIBLE_MISSING",
      `No persisted bible exists for ${namespace}.`,
    );
  }
  const bible = await readJsonArtifact<CompiledVisualContinuityBible>(
    store,
    bibleReference.artifactId,
    "Visual continuity bible",
  );
  verifyVisualContinuityBible(bible);
  const references = await store.listReferences(namespace);
  if (sessionId === undefined) {
    return {
      schemaVersion: "1.0" as const,
      namespace,
      bible,
      bibleReference,
      references,
    };
  }
  const sessionReference = await store.resolveReference(
    namespace,
    visualContinuitySessionReferenceName(sessionId),
  );
  if (!sessionReference) {
    fail(
      "VISUAL_CONTINUITY_WORKSPACE_SESSION_MISSING",
      `No persisted session ${sessionId} exists for ${namespace}.`,
    );
  }
  const session = await readJsonArtifact<CompiledVisualContinuitySession>(
    store,
    sessionReference.artifactId,
    "Visual continuity session",
  );
  verifyVisualContinuitySession(bible, session);
  return {
    schemaVersion: "1.0" as const,
    namespace,
    bible,
    session,
    bibleReference,
    sessionReference,
    references,
  };
}

export async function loadVisualContinuityArtifact(
  root: string,
  artifactId: string,
) {
  if (!ARTIFACT_ID.test(artifactId)) {
    fail(
      "VISUAL_CONTINUITY_WORKSPACE_ARTIFACT_ID_INVALID",
      "artifactId must use artifact_<sha256> format.",
    );
  }
  const store = storeAt(root);
  const descriptor = await store.get(artifactId as ArtifactId);
  if (!descriptor) {
    fail(
      "VISUAL_CONTINUITY_WORKSPACE_ARTIFACT_MISSING",
      `Artifact ${artifactId} was not found.`,
    );
  }
  const document = await readJsonArtifact<unknown>(
    store,
    descriptor.artifactId,
    "Visual continuity artifact",
  );
  return {
    schemaVersion: "1.0" as const,
    descriptor,
    document,
  };
}

export function isVisualContinuityWorkspaceError(
  error: unknown,
): error is VisualContinuityWorkspaceError | ArtifactStoreError {
  return (
    error instanceof VisualContinuityWorkspaceError ||
    error instanceof ArtifactStoreError
  );
}
