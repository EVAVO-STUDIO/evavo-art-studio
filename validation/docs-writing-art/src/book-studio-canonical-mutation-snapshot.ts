import type { BookCanonicalChangedUnitV1, BookCanonicalSnapshotV1, BookCanonicalUnitStateV1 } from './book-studio-canonical-mutation-types';
import { array, canonicalJson, digest, duplicateValues, id, integer, objectId, record, rejectUnknown, sha256Text, text, unique } from './book-studio-canonical-mutation-shared';

const SNAPSHOT_KEYS = new Set([
  'snapshotId','projectId','programmeId','volumeId','revisionNumber','manuscriptRevisionId','parentRevisionId',
  'manuscriptObjectId','manuscriptStorageVersion','manuscriptByteLength','manuscriptSha256','orderedUnits',
  'unitSequenceSha256','sourceCoverageFingerprint','stateFingerprint',
]);
const UNIT_KEYS = new Set(['unitId','ordinal','textSha256']);
const MAX_UNITS = 1_000_000;

export async function parseBookCanonicalSnapshot(value: unknown, label: string, blockers: string[]): Promise<BookCanonicalSnapshotV1> {
  const source = record(value, label, blockers);
  rejectUnknown(source, SNAPSHOT_KEYS, label, blockers);
  const parentRevisionId = source.parentRevisionId === undefined ? undefined : id(source.parentRevisionId, `${label}.parentRevisionId`, blockers);
  const units = array(source.orderedUnits, `${label}.orderedUnits`, blockers, 1, MAX_UNITS)
    .map((item, index) => parseUnit(item, `${label}.orderedUnits[${index}]`, blockers));
  const duplicateIds = duplicateValues(units.map((item) => item.unitId));
  if (duplicateIds.length) blockers.push(`${label} has duplicate unit IDs: ${duplicateIds.join(', ')}.`);
  const duplicateOrdinals = duplicateValues(units.map((item) => String(item.ordinal)));
  if (duplicateOrdinals.length) blockers.push(`${label} has duplicate unit ordinals.`);
  const sorted = [...units].sort((a, b) => a.ordinal - b.ordinal || a.unitId.localeCompare(b.unitId));
  for (let index = 0; index < sorted.length; index += 1) {
    if (sorted[index]!.ordinal !== index + 1) blockers.push(`${label} unit ordinals must be contiguous from one.`);
  }
  const unitSequenceSha256 = digest(source.unitSequenceSha256, `${label}.unitSequenceSha256`, blockers);
  if (unitSequenceSha256 !== await sha256Text(canonicalJson(sorted))) blockers.push(`${label} unitSequenceSha256 differs from exact ordered units.`);
  const unsigned = {
    snapshotId: id(source.snapshotId, `${label}.snapshotId`, blockers),
    projectId: id(source.projectId, `${label}.projectId`, blockers),
    programmeId: id(source.programmeId, `${label}.programmeId`, blockers),
    volumeId: id(source.volumeId, `${label}.volumeId`, blockers),
    revisionNumber: integer(source.revisionNumber, `${label}.revisionNumber`, blockers, 0, Number.MAX_SAFE_INTEGER),
    manuscriptRevisionId: id(source.manuscriptRevisionId, `${label}.manuscriptRevisionId`, blockers),
    ...(parentRevisionId === undefined ? {} : { parentRevisionId }),
    manuscriptObjectId: objectId(source.manuscriptObjectId, `${label}.manuscriptObjectId`, blockers),
    manuscriptStorageVersion: text(source.manuscriptStorageVersion, `${label}.manuscriptStorageVersion`, blockers, 200),
    manuscriptByteLength: integer(source.manuscriptByteLength, `${label}.manuscriptByteLength`, blockers, 1, Number.MAX_SAFE_INTEGER),
    manuscriptSha256: digest(source.manuscriptSha256, `${label}.manuscriptSha256`, blockers),
    orderedUnits: sorted,
    unitSequenceSha256,
    sourceCoverageFingerprint: digest(source.sourceCoverageFingerprint, `${label}.sourceCoverageFingerprint`, blockers),
  };
  const stateFingerprint = digest(source.stateFingerprint, `${label}.stateFingerprint`, blockers);
  if (stateFingerprint !== await sha256Text(canonicalJson(unsigned))) blockers.push(`${label} stateFingerprint differs from exact snapshot contents.`);
  return { ...unsigned, stateFingerprint };
}

export async function fingerprintBookCanonicalSnapshot(snapshot: Omit<BookCanonicalSnapshotV1, 'stateFingerprint'> | BookCanonicalSnapshotV1): Promise<string> {
  const { stateFingerprint: _discarded, ...unsigned } = snapshot as BookCanonicalSnapshotV1;
  return sha256Text(canonicalJson(unsigned));
}

export function deriveBookCanonicalChanges(current: BookCanonicalUnitStateV1[], proposed: BookCanonicalUnitStateV1[]): Map<string, { changeKind: 'added' | 'removed' | 'modified'; beforeSha256?: string; afterSha256?: string }> {
  const before = new Map(current.map((item) => [item.unitId, item]));
  const after = new Map(proposed.map((item) => [item.unitId, item]));
  const result = new Map<string, { changeKind: 'added' | 'removed' | 'modified'; beforeSha256?: string; afterSha256?: string }>();
  for (const unitId of unique([...before.keys(), ...after.keys()]).sort()) {
    const left = before.get(unitId);
    const right = after.get(unitId);
    if (!left && right) result.set(unitId, { changeKind: 'added', afterSha256: right.textSha256 });
    else if (left && !right) result.set(unitId, { changeKind: 'removed', beforeSha256: left.textSha256 });
    else if (left && right && left.textSha256 !== right.textSha256) result.set(unitId, { changeKind: 'modified', beforeSha256: left.textSha256, afterSha256: right.textSha256 });
  }
  return result;
}

export function validateBookCanonicalDeclaredChanges(
  declared: BookCanonicalChangedUnitV1[],
  derived: Map<string, { changeKind: string; beforeSha256?: string; afterSha256?: string }>,
  blockers: string[],
): void {
  const declaredMap = new Map(declared.map((item) => [item.unitId, item]));
  const missing = [...derived.keys()].filter((unitId) => !declaredMap.has(unitId));
  const unexpected = [...declaredMap.keys()].filter((unitId) => !derived.has(unitId));
  if (missing.length) blockers.push(`Changed-unit evidence is missing derived changes: ${missing.join(', ')}.`);
  if (unexpected.length) blockers.push(`Changed-unit evidence contains unchanged units: ${unexpected.join(', ')}.`);
  for (const [unitId, expected] of derived) {
    const observed = declaredMap.get(unitId);
    if (!observed) continue;
    if (observed.changeKind !== expected.changeKind || observed.beforeSha256 !== expected.beforeSha256 || observed.afterSha256 !== expected.afterSha256) {
      blockers.push(`Changed-unit evidence for ${unitId} differs from the exact snapshots.`);
    }
  }
}

function parseUnit(value: unknown, label: string, blockers: string[]): BookCanonicalUnitStateV1 {
  const source = record(value, label, blockers);
  rejectUnknown(source, UNIT_KEYS, label, blockers);
  return {
    unitId: id(source.unitId, `${label}.unitId`, blockers),
    ordinal: integer(source.ordinal, `${label}.ordinal`, blockers, 1, MAX_UNITS),
    textSha256: digest(source.textSha256, `${label}.textSha256`, blockers),
  };
}
