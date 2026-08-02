import type { BookCanonicalChangedUnitV1 } from './book-studio-canonical-mutation-types';
import { array, digest, duplicateValues, enumValue, id, ids, record, rejectUnknown } from './book-studio-canonical-mutation-shared';

const CHANGE_KEYS = new Set(['unitId', 'beforeSha256', 'afterSha256', 'changeKind', 'actionIds', 'evidenceIds']);
const CHANGE_KINDS = new Set(['added', 'removed', 'modified'] as const);
const MAX_UNITS = 1_000_000;

export function parseBookCanonicalChangedUnits(value: unknown, blockers: string[]): BookCanonicalChangedUnitV1[] {
  const result = array(value, 'changedUnits', blockers, 1, MAX_UNITS).map((item, index) => {
    const source = record(item, `changedUnits[${index}]`, blockers);
    rejectUnknown(source, CHANGE_KEYS, `changedUnits[${index}]`, blockers);
    const changeKind = enumValue(source.changeKind, CHANGE_KINDS, `changedUnits[${index}].changeKind`, blockers, 'modified');
    const beforeSha256 = source.beforeSha256 === undefined ? undefined : digest(source.beforeSha256, `changedUnits[${index}].beforeSha256`, blockers);
    const afterSha256 = source.afterSha256 === undefined ? undefined : digest(source.afterSha256, `changedUnits[${index}].afterSha256`, blockers);
    if (changeKind === 'added' && (beforeSha256 !== undefined || afterSha256 === undefined)) blockers.push(`Added unit at changedUnits[${index}] requires only afterSha256.`);
    if (changeKind === 'removed' && (beforeSha256 === undefined || afterSha256 !== undefined)) blockers.push(`Removed unit at changedUnits[${index}] requires only beforeSha256.`);
    if (changeKind === 'modified' && (beforeSha256 === undefined || afterSha256 === undefined || beforeSha256 === afterSha256)) blockers.push(`Modified unit at changedUnits[${index}] requires different before and after hashes.`);
    return {
      unitId: id(source.unitId, `changedUnits[${index}].unitId`, blockers),
      ...(beforeSha256 === undefined ? {} : { beforeSha256 }),
      ...(afterSha256 === undefined ? {} : { afterSha256 }),
      changeKind,
      actionIds: ids(source.actionIds, `changedUnits[${index}].actionIds`, blockers, 256, true),
      evidenceIds: ids(source.evidenceIds, `changedUnits[${index}].evidenceIds`, blockers, 10_000, true),
    };
  });
  const duplicates = duplicateValues(result.map((item) => item.unitId));
  if (duplicates.length) blockers.push(`Changed unit IDs are duplicated: ${duplicates.join(', ')}.`);
  return result;
}
