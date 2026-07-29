import type { AssetKind } from "./constants.js";
import type { ValidationIssue } from "./validation-common.js";
import { SPRITE_ASSET_KINDS, isNonEmptyString, isRecord, issue } from "./validation-common.js";

export function validateCanonicalRelationships(
  assets: readonly Record<string, unknown>[],
  issues: ValidationIssue[],
): void {
  const byId = new Map<string, { readonly asset: Record<string, unknown>; readonly index: number }>();
  assets.forEach((asset, index) => {
    if (isNonEmptyString(asset.id)) byId.set(asset.id, { asset, index });
  });

  const canonicalById = new Map<string, string>();
  assets.forEach((asset, index) => {
    if (!isRecord(asset.sprite)) return;
    const canonicalAssetId = asset.sprite.canonicalAssetId;
    if (canonicalAssetId === undefined) {
      if (asset.sprite.canonicalInstancePolicy !== undefined) {
        issue(
          issues,
          `$.assets[${index}].sprite.canonicalInstancePolicy`,
          "canonicalInstancePolicy requires canonicalAssetId.",
        );
      }
      return;
    }
    if (!isNonEmptyString(asset.id) || !isNonEmptyString(canonicalAssetId)) return;
    if (canonicalAssetId === asset.id) {
      issue(issues, `$.assets[${index}].sprite.canonicalAssetId`, "Omit canonicalAssetId for a self-canonical asset.");
      return;
    }
    const target = byId.get(canonicalAssetId);
    if (!target) {
      issue(issues, `$.assets[${index}].sprite.canonicalAssetId`, "Canonical asset does not exist.");
      return;
    }
    if (!SPRITE_ASSET_KINDS.has(asset.kind as AssetKind) || !SPRITE_ASSET_KINDS.has(target.asset.kind as AssetKind)) {
      issue(issues, `$.assets[${index}].sprite.canonicalAssetId`, "Canonical inheritance requires sprite-capable assets.");
    }

    const sourceQuantity = asset.quantity;
    const targetQuantity = target.asset.quantity;
    const explicitPolicy = asset.sprite.canonicalInstancePolicy;
    const resolvedPolicy =
      explicitPolicy ??
      (targetQuantity === 1 ? "shared" : sourceQuantity === targetQuantity ? "index-matched" : undefined);
    if (resolvedPolicy === undefined) {
      issue(
        issues,
        `$.assets[${index}].sprite.canonicalInstancePolicy`,
        "Quantity mapping is ambiguous; choose shared or index-matched.",
      );
    } else if (resolvedPolicy === "shared" && targetQuantity !== 1) {
      issue(
        issues,
        `$.assets[${index}].sprite.canonicalInstancePolicy`,
        "shared requires exactly one canonical asset instance.",
      );
    } else if (resolvedPolicy === "index-matched" && sourceQuantity !== targetQuantity) {
      issue(
        issues,
        `$.assets[${index}].sprite.canonicalInstancePolicy`,
        "index-matched requires equal source and canonical quantities.",
      );
    }
    canonicalById.set(asset.id, canonicalAssetId);
  });

  for (const id of canonicalById.keys()) {
    const seen = new Set<string>();
    let current: string | undefined = id;
    while (current !== undefined) {
      if (seen.has(current)) {
        const entry = byId.get(id);
        if (entry) {
          issue(
            issues,
            `$.assets[${entry.index}].sprite.canonicalAssetId`,
            `Canonical identity cycle includes ${current}.`,
          );
        }
        break;
      }
      seen.add(current);
      current = canonicalById.get(current);
    }
  }
}
