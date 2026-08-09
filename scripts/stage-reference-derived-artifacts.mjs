#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import {
  hashFileBounded,
  parseCliArguments,
  readJsonFileBounded,
  requireDirectoryNoSymlink,
  resolveExistingWithinRoot,
  verifyDocumentHash,
  withDocumentHash,
  writeJsonCreateOnly,
} from './project-art/common.mjs';
import {
  REFERENCE_BINDINGS_SCHEMA,
  REFERENCE_DERIVED_PLAN_SCHEMA,
  REFERENCE_INGEST_SCHEMA,
} from './project-art/reference-derived.mjs';

const args = parseCliArguments(process.argv.slice(2));
if (!args['workspace-root'] || !args.plan || !args['artifact-root'] || !args.output) {
  throw new Error(
    'usage: stage-reference-derived-artifacts.mjs --workspace-root <path> --plan <reference-plan.json> --artifact-root <artifact-store> --output <bindings.json>',
  );
}
const workspace = await requireDirectoryNoSymlink(args['workspace-root'], 'workspace-root');
const { value: plan } = await readJsonFileBounded(path.resolve(args.plan), 'reference-derived plan');
if (plan.schema !== REFERENCE_DERIVED_PLAN_SCHEMA) {
  throw new Error(`plan must use ${REFERENCE_DERIVED_PLAN_SCHEMA}`);
}
verifyDocumentHash(plan);
if (plan.artifactIngest?.schema !== REFERENCE_INGEST_SCHEMA || !Array.isArray(plan.artifactIngest.entries)) {
  throw new Error('plan is missing its artifact ingest manifest');
}
for (const key of [
  'providerExecution',
  'runtimeSubmission',
  'candidateApproval',
  'candidatePromotion',
  'sourceMutation',
  'sourceDeletion',
  'targetRepositoryMutation',
  'publication',
  'deployment',
  'forcePush',
]) {
  if (plan.authority?.[key] !== false) throw new Error(`plan authority boundary changed: ${key}`);
}
const { LocalArtifactStore } = await import('../packages/artifacts/dist/index.js');
const artifactRoot = path.resolve(args['artifact-root']);
const store = new LocalArtifactStore({ root: artifactRoot });
const bindings = [];
for (const entry of plan.artifactIngest.entries) {
  const resolved = await resolveExistingWithinRoot(workspace, entry.path, `reference ${entry.referenceId}`);
  const identity = await hashFileBounded(resolved.absolutePath);
  if (identity.sha256 !== entry.sha256 || identity.bytes !== entry.bytes) {
    throw new Error(`reference source identity changed: ${entry.path}`);
  }
  const bytes = await readFile(resolved.absolutePath);
  const artifact = await store.put(bytes, {
    mediaType: entry.mediaType,
    storageClass: 'source',
    fileName: path.posix.basename(entry.path),
    labels: entry.labels,
    metadata: {
      schema: 'evavo.reference-derived-source-artifact.v1',
      referenceId: entry.referenceId,
      referenceRole: entry.role,
      sourcePath: entry.path,
      sourceSha256: entry.sha256,
      sourceBytes: entry.bytes,
      referencePlanSha256: plan.documentSha256,
      providerExecution: false,
      candidateApproval: false,
    },
  });
  const verification = await store.verify(artifact.artifactId);
  if (!verification.exists || !verification.descriptorValid || !verification.contentValid) {
    throw new Error(`staged artifact failed immutable verification: ${artifact.artifactId}`);
  }
  bindings.push({
    referenceId: entry.referenceId,
    role: entry.role,
    artifactId: artifact.artifactId,
    contentHash: artifact.contentHash,
    descriptorSha256: artifact.descriptorSha256,
    sourcePath: entry.path,
    sourceSha256: entry.sha256,
  });
}
bindings.sort((left, right) => left.referenceId.localeCompare(right.referenceId));
const document = withDocumentHash({
  schema: REFERENCE_BINDINGS_SCHEMA,
  sourcePlanSha256: plan.documentSha256,
  requestId: plan.requestId,
  projectId: plan.projectId,
  artifactRoot: await store.root(),
  bindings,
  effects: {
    artifactIngest: true,
    providerExecution: false,
    runtimeSubmission: false,
    candidateApproval: false,
    candidatePromotion: false,
    sourceMutation: false,
    sourceDeletion: false,
    targetRepositoryMutation: false,
    publication: false,
    deployment: false,
    forcePush: false,
  },
});
const output = path.resolve(args.output);
await writeJsonCreateOnly(output, document);
console.log(
  JSON.stringify({
    status: 'passed',
    schema: document.schema,
    bindings: document.bindings.length,
    documentSha256: document.documentSha256,
    output,
  }),
);
