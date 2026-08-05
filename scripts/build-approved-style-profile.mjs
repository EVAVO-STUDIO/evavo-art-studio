#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const option = (name, fallback = null) => {
  const index = args.indexOf(name);
  return index < 0 ? fallback : args[index + 1];
};
const reviewsPath = option('--reviews');
const outputPath = option('--output');
const minimumExemplars = Number(option('--minimum-exemplars', '2'));
if (!reviewsPath || !outputPath) {
  throw new Error(
    'usage: build-approved-style-profile.mjs --reviews <json|jsonl> --output <json> [--minimum-exemplars <n>]',
  );
}
if (
  !Number.isSafeInteger(minimumExemplars) ||
  minimumExemplars < 1 ||
  minimumExemplars > 100
) {
  throw new Error('minimum-exemplars must be an integer between 1 and 100');
}
const bytes = await readFile(path.resolve(reviewsPath));
const source = bytes.toString('utf8').replace(/^\uFEFF/u, '').trim();
let records;
try {
  const value = JSON.parse(source);
  records = Array.isArray(value)
    ? value
    : value.items || value.records || value.entries || [value];
} catch {
  records = source
    .split(/\r?\n/u)
    .filter((line) => line.trim())
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`invalid JSONL record ${index + 1}: ${error.message}`);
      }
    });
}
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const canonical = (value) => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
    .join(',')}}`;
};
const normalized = (value) => String(value || '').trim().replace(/\s+/gu, ' ');
const scopeKey = (record) => {
  const scope = record.styleScope || {};
  return [
    normalized(record.semanticRole || 'reference-unknown').toLocaleLowerCase('en-US'),
    normalized(scope.port || 'global').toLocaleLowerCase('en-US'),
    normalized(scope.culture || 'unspecified').toLocaleLowerCase('en-US'),
    normalized(scope.medium || 'unspecified').toLocaleLowerCase('en-US'),
  ].join('|');
};
const groups = new Map();
const seenExemplars = new Set();
for (const record of records) {
  if (!['keep', 'reference-only'].includes(record.decision)) continue;
  const sourcePath = normalized(record.sourcePath);
  const sourceSha256 = normalized(record.sourceSha256);
  if (!sourcePath || !/^[0-9a-f]{64}$/u.test(sourceSha256)) {
    throw new Error('style reference records require exact source path and SHA-256');
  }
  if (seenExemplars.has(sourceSha256)) {
    throw new Error(`duplicate style exemplar SHA-256: ${sourceSha256}`);
  }
  seenExemplars.add(sourceSha256);
  const traits = record.preserve || record.approvedTraits || [];
  const defects = record.removeOrFix || record.defects || [];
  const constraints = record.negativeConstraints || [];
  if (
    ![traits, defects, constraints].every(
      (value) =>
        Array.isArray(value) && value.every((entry) => typeof entry === 'string'),
    )
  ) {
    throw new Error(
      'style traits, defects and negative constraints must be arrays of strings',
    );
  }
  const key = scopeKey(record);
  const group = groups.get(key) || {
    key,
    semanticRole: normalized(record.semanticRole || 'reference-unknown'),
    styleScope: record.styleScope || null,
    exemplars: [],
    traitCounts: new Map(),
    defectCounts: new Map(),
    constraintCounts: new Map(),
    approvals: [],
  };
  group.exemplars.push({ sourcePath, sourceSha256, decision: record.decision });
  for (const [values, target] of [
    [traits, group.traitCounts],
    [defects, group.defectCounts],
    [constraints, group.constraintCounts],
  ]) {
    for (const raw of values) {
      const value = normalized(raw);
      if (!value) continue;
      const folded = value.toLocaleLowerCase('en-US');
      const current = target.get(folded) || { value, count: 0 };
      current.count += 1;
      target.set(folded, current);
    }
  }
  group.approvals.push(record.approvals || {});
  groups.set(key, group);
}
const ranked = (map) =>
  [...map.values()].sort(
    (left, right) =>
      right.count - left.count || left.value.localeCompare(right.value),
  );
const profiles = [...groups.values()]
  .sort((left, right) => left.key.localeCompare(right.key))
  .map((group) => {
    const allApproved =
      group.approvals.length > 0 &&
      group.approvals.every(
        (approval) =>
          approval.creative === true &&
          approval.historical === true &&
          approval.provenance === true,
      );
    const profile = {
      scopeId: sha256(group.key).slice(0, 16),
      semanticRole: group.semanticRole,
      styleScope: group.styleScope,
      status:
        group.exemplars.length >= minimumExemplars && allApproved
          ? 'approved'
          : 'provisional',
      exemplarCount: group.exemplars.length,
      exemplars: group.exemplars
        .sort((left, right) => left.sourcePath.localeCompare(right.sourcePath))
        .slice(0, 24),
      approvedTraits: ranked(group.traitCounts),
      knownDefectsToAvoid: ranked(group.defectCounts),
      negativeConstraints: ranked(group.constraintCounts),
      approvalEvidence: {
        creative: group.approvals.every((entry) => entry.creative === true),
        historical: group.approvals.every((entry) => entry.historical === true),
        provenance: group.approvals.every((entry) => entry.provenance === true),
      },
      modelTrainingPerformed: false,
      metadataReferenceOnly: true,
    };
    return { ...profile, scopeSha256: sha256(canonical(profile)) };
  });
const profile = {
  schema: 'evavo.approved-style-reference-profile.v2',
  reviewsSha256: sha256(bytes),
  minimumExemplars,
  profiles,
  approvedProfiles: profiles.filter((entry) => entry.status === 'approved').length,
  provisionalProfiles: profiles.filter((entry) => entry.status === 'provisional')
    .length,
  sourceMutation: false,
  providerExecution: false,
  modelTrainingPerformed: false,
  publication: false,
};
profile.profileSha256 = sha256(canonical(profile));
await writeFile(path.resolve(outputPath), `${JSON.stringify(profile, null, 2)}\n`, {
  flag: 'wx',
});
console.log(
  JSON.stringify({
    status: 'passed',
    profiles: profiles.length,
    approved: profile.approvedProfiles,
    provisional: profile.provisionalProfiles,
    profileSha256: profile.profileSha256,
    output: path.resolve(outputPath),
  }),
);
