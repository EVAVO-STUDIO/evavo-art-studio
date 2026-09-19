import {
  ArtifactStoreError,
  LocalArtifactStore,
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

import {
  loadVisualContinuityArtifact,
  persistApprovedVisualContinuityHandoff as persistApprovedVisualContinuityHandoffBase,
  persistVisualContinuityApproval as persistVisualContinuityApprovalBase,
  persistVisualContinuityBible as persistVisualContinuityBibleBase,
  persistVisualContinuitySession as persistVisualContinuitySessionBase,
  visualContinuityApprovalReferenceName,
  visualContinuityHandoffReferenceName,
  visualContinuitySessionReferenceName,
  visualContinuityWorkspaceNamespace,
} from "./visual-continuity-workspace-store.js";
import type {
  ContinuityPersistOptions,
  ContinuityPersistResult,
} from "./visual-continuity-workspace-store.js";

function isReferenceConflict(error: unknown): error is ArtifactStoreError {
  return (
    error instanceof ArtifactStoreError &&
    error.code === "ARTIFACT_REFERENCE_CONFLICT"
  );
}

async function resolveMatchingReference<T>(
  root: string,
  namespace: string,
  name: string,
  expectedHash: string,
  hashField: string,
  verify: (document: T) => void,
  originalError: ArtifactStoreError,
): Promise<ContinuityPersistResult> {
  const store = new LocalArtifactStore({ root });
  const reference = await store.resolveReference(namespace, name);
  if (!reference) throw originalError;
  const loaded = await loadVisualContinuityArtifact(
    root,
    reference.artifactId,
  );
  const document = loaded.document as T;
  verify(document);
  const actualHash = (document as Record<string, unknown>)[hashField];
  if (actualHash !== expectedHash) throw originalError;
  return {
    artifact: loaded.descriptor,
    reference,
    idempotent: true,
  };
}

export async function persistVisualContinuityBible(
  root: string,
  bible: CompiledVisualContinuityBible,
  options: ContinuityPersistOptions,
): Promise<ContinuityPersistResult> {
  try {
    return await persistVisualContinuityBibleBase(root, bible, options);
  } catch (error: unknown) {
    if (!isReferenceConflict(error)) throw error;
    return resolveMatchingReference(
      root,
      visualContinuityWorkspaceNamespace(
        bible.project.projectId,
        bible.bibleId,
      ),
      "bible",
      bible.bibleSha256,
      "bibleSha256",
      verifyVisualContinuityBible,
      error,
    );
  }
}

export async function persistVisualContinuitySession(
  root: string,
  bible: CompiledVisualContinuityBible,
  session: CompiledVisualContinuitySession,
  options: ContinuityPersistOptions,
): Promise<ContinuityPersistResult> {
  try {
    return await persistVisualContinuitySessionBase(
      root,
      bible,
      session,
      options,
    );
  } catch (error: unknown) {
    if (!isReferenceConflict(error)) throw error;
    return resolveMatchingReference(
      root,
      visualContinuityWorkspaceNamespace(
        bible.project.projectId,
        bible.bibleId,
      ),
      visualContinuitySessionReferenceName(session.sessionId),
      session.sessionSha256,
      "sessionSha256",
      (document) => verifyVisualContinuitySession(bible, document),
      error,
    );
  }
}

export async function persistVisualContinuityApproval(
  root: string,
  bible: CompiledVisualContinuityBible,
  session: CompiledVisualContinuitySession,
  approval: VisualContinuityApprovalReceipt,
  options: ContinuityPersistOptions,
): Promise<ContinuityPersistResult> {
  try {
    return await persistVisualContinuityApprovalBase(
      root,
      bible,
      session,
      approval,
      options,
    );
  } catch (error: unknown) {
    if (!isReferenceConflict(error)) throw error;
    return resolveMatchingReference(
      root,
      visualContinuityWorkspaceNamespace(
        bible.project.projectId,
        bible.bibleId,
      ),
      visualContinuityApprovalReferenceName(
        session.sessionId,
        approval.workItemId,
      ),
      approval.approvalSha256,
      "approvalSha256",
      (document) =>
        verifyVisualContinuityApprovalReceipt(bible, session, document),
      error,
    );
  }
}

export async function persistApprovedVisualContinuityHandoff(
  root: string,
  bible: CompiledVisualContinuityBible,
  session: CompiledVisualContinuitySession,
  handoff: ApprovedVisualContinuityStudioHandoff,
  options: ContinuityPersistOptions,
): Promise<ContinuityPersistResult> {
  try {
    return await persistApprovedVisualContinuityHandoffBase(
      root,
      bible,
      session,
      handoff,
      options,
    );
  } catch (error: unknown) {
    if (!isReferenceConflict(error)) throw error;
    return resolveMatchingReference(
      root,
      visualContinuityWorkspaceNamespace(
        bible.project.projectId,
        bible.bibleId,
      ),
      visualContinuityHandoffReferenceName(
        session.sessionId,
        handoff.targetStudio,
        handoff.receiverProjectId,
      ),
      handoff.handoffSha256,
      "handoffSha256",
      (document) =>
        verifyApprovedVisualContinuityStudioHandoff(
          bible,
          session,
          document,
        ),
      error,
    );
  }
}
