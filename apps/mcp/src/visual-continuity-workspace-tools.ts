import {
  ArtifactStoreError,
  LocalArtifactStore,
} from "@evavo/art-artifacts";
import type {
  ArtifactId,
  ArtifactReference,
  StoredArtifact,
} from "@evavo/art-artifacts";
import {
  ArtDirectionError,
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
import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

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

function workspaceNamespace(
  projectId: string,
  bibleId: string,
): string {
  return [
    "visual-continuity",
    canonicalIdentifier(projectId, "projectId"),
    canonicalIdentifier(bibleId, "bibleId"),
  ].join("/");
}

function sessionReferenceName(sessionId: string): string {
  return `session-${canonicalIdentifier(sessionId, "sessionId")}`;
}

function approvalReferenceName(
  sessionId: string,
  workItemId: string,
): string {
  return `approval-${canonicalIdentifier(sessionId, "sessionId")}-${canonicalIdentifier(workItemId, "workItemId")}`;
}

function handoffReferenceName(
  sessionId: string,
  targetStudio: string,
  receiverProjectId: string,
): string {
  return [
    "handoff",
    canonicalIdentifier(sessionId, "sessionId"),
    canonicalIdentifier(targetStudio, "targetStudio"),
    canonicalIdentifier(receiverProjectId, "receiverProjectId"),
  ].join("-");
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

async function persistReference(
  store: LocalArtifactStore,
  namespace: string,
  name: string,
  content: string,
  descriptor: Parameters<LocalArtifactStore["put"]>[1],
  options: ContinuityPersistOptions,
): Promise<ContinuityPersistResult> {
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
  const namespace = workspaceNamespace(
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
  const namespace = workspaceNamespace(
    bible.project.projectId,
    bible.bibleId,
  );
  const reference = await store.resolveReference(
    namespace,
    sessionReferenceName(session.sessionId),
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
    workspaceNamespace(bible.project.projectId, bible.bibleId),
    "bible",
    serialize(bible),
    {
      mediaType: "application/vnd.evavo.visual-continuity-bible+json",
      storageClass: "manifest",
      fileName: `${bible.bibleId}.visual-continuity-bible.json`,
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
    workspaceNamespace(bible.project.projectId, bible.bibleId),
    sessionReferenceName(session.sessionId),
    serialize(session),
    {
      mediaType: "application/vnd.evavo.visual-continuity-session+json",
      storageClass: "manifest",
      fileName: `${session.sessionId}.visual-continuity-session.json`,
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
    workspaceNamespace(bible.project.projectId, bible.bibleId),
    approvalReferenceName(session.sessionId, approval.workItemId),
    serialize(approval),
    {
      mediaType: "application/vnd.evavo.visual-continuity-approval+json",
      storageClass: "evidence",
      fileName: `${session.sessionId}.${approval.workItemId}.visual-continuity-approval.json`,
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
      workspaceNamespace(bible.project.projectId, bible.bibleId),
      approvalReferenceName(session.sessionId, approval.workItemId),
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
    workspaceNamespace(bible.project.projectId, bible.bibleId),
    handoffReferenceName(
      session.sessionId,
      handoff.targetStudio,
      handoff.receiverProjectId,
    ),
    serialize(handoff),
    {
      mediaType: "application/vnd.evavo.visual-continuity-approved-handoff+json",
      storageClass: "manifest",
      fileName: `${session.sessionId}.${handoff.targetStudio}.${handoff.receiverProjectId}.visual-continuity-handoff.json`,
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
  const namespace = workspaceNamespace(projectId, bibleId);
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
    sessionReferenceName(sessionId),
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

function artifactRoot(): string {
  const root = process.env.EVAVO_ART_ARTIFACT_ROOT?.trim();
  if (!root) {
    fail(
      "VISUAL_CONTINUITY_WORKSPACE_ROOT_MISSING",
      "EVAVO_ART_ARTIFACT_ROOT must be configured by the server operator.",
    );
  }
  return root;
}

function writesEnabled(): boolean {
  return process.env.EVAVO_ART_ALLOW_WRITES === "true";
}

function requireWrites(): void {
  if (!writesEnabled()) {
    fail(
      "VISUAL_CONTINUITY_WORKSPACE_WRITES_DISABLED",
      "Continuity persistence requires EVAVO_ART_ALLOW_WRITES=true.",
    );
  }
}

const textResult = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
});

function toolError(error: unknown) {
  const code =
    error instanceof VisualContinuityWorkspaceError ||
    error instanceof ArtifactStoreError ||
    error instanceof ArtDirectionError
      ? error.code
      : "VISUAL_CONTINUITY_WORKSPACE_TOOL_REJECTED";
  return {
    isError: true,
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            code,
            message: error instanceof Error ? error.message : String(error),
          },
          null,
          2,
        ),
      },
    ],
  };
}

const persistOptionsSchema = z.object({
  expectedGeneration: z.number().int().min(0),
  actor: z.string().min(1).max(512),
});

export function registerVisualContinuityWorkspaceTools(
  server: McpServer,
): void {
  server.registerTool(
    "persist_visual_continuity_bible",
    {
      description:
        "Persist one verified continuity bible into the configured content-addressed Art Studio store and atomically advance its named reference with an expected generation. Repeating the same bytes is idempotent.",
      inputSchema: z.object({
        bible: z.unknown(),
        persistence: persistOptionsSchema,
      }),
    },
    async ({ bible, persistence }) => {
      try {
        requireWrites();
        return textResult(
          await persistVisualContinuityBible(
            artifactRoot(),
            bible as CompiledVisualContinuityBible,
            persistence,
          ),
        );
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "persist_visual_continuity_session",
    {
      description:
        "Persist one verified continuity session only when its exact bible is already current, then atomically advance the session reference using stale-write generation protection.",
      inputSchema: z.object({
        bible: z.unknown(),
        session: z.unknown(),
        persistence: persistOptionsSchema,
      }),
    },
    async ({ bible, session, persistence }) => {
      try {
        requireWrites();
        return textResult(
          await persistVisualContinuitySession(
            artifactRoot(),
            bible as CompiledVisualContinuityBible,
            session as CompiledVisualContinuitySession,
            persistence,
          ),
        );
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "persist_visual_continuity_approval",
    {
      description:
        "Persist one canonical named-human approval receipt after verifying the current bible, current session, accepted candidate and exact persisted lineage.",
      inputSchema: z.object({
        bible: z.unknown(),
        session: z.unknown(),
        approval: z.unknown(),
        persistence: persistOptionsSchema,
      }),
    },
    async ({ bible, session, approval, persistence }) => {
      try {
        requireWrites();
        return textResult(
          await persistVisualContinuityApproval(
            artifactRoot(),
            bible as CompiledVisualContinuityBible,
            session as CompiledVisualContinuitySession,
            approval as VisualContinuityApprovalReceipt,
            persistence,
          ),
        );
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "persist_approved_visual_continuity_handoff",
    {
      description:
        "Persist one verified approved handoff only after its exact bible, current session and every source-bound approval receipt are already present in the immutable workspace lineage.",
      inputSchema: z.object({
        bible: z.unknown(),
        session: z.unknown(),
        handoff: z.unknown(),
        persistence: persistOptionsSchema,
      }),
    },
    async ({ bible, session, handoff, persistence }) => {
      try {
        requireWrites();
        return textResult(
          await persistApprovedVisualContinuityHandoff(
            artifactRoot(),
            bible as CompiledVisualContinuityBible,
            session as CompiledVisualContinuitySession,
            handoff as ApprovedVisualContinuityStudioHandoff,
            persistence,
          ),
        );
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "load_visual_continuity_workspace",
    {
      description:
        "Load and verify the current content-addressed visual bible, optional resumable session and named-reference generations from the fixed Art Studio artifact root.",
      inputSchema: z.object({
        projectId: z.string().regex(IDENTIFIER),
        bibleId: z.string().regex(IDENTIFIER),
        sessionId: z.string().regex(IDENTIFIER).optional(),
      }),
    },
    async ({ projectId, bibleId, sessionId }) => {
      try {
        return textResult(
          await loadVisualContinuityWorkspace(
            artifactRoot(),
            projectId,
            bibleId,
            sessionId,
          ),
        );
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "load_visual_continuity_artifact",
    {
      description:
        "Read and verify one immutable continuity JSON artifact by its content-addressed artifact ID from the fixed server-side Art Studio store.",
      inputSchema: z.object({
        artifactId: z.string().regex(ARTIFACT_ID),
      }),
    },
    async ({ artifactId }) => {
      try {
        return textResult(
          await loadVisualContinuityArtifact(artifactRoot(), artifactId),
        );
      } catch (error: unknown) {
        return toolError(error);
      }
    },
  );
}
