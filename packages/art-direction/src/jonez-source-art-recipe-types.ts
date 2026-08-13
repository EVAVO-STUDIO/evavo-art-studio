import type {
  LayeredProductionAlphaPolicy,
  LayeredProductionLayerRole,
  LayeredProductionUnitKind,
} from "./layered-production-types.js";

export interface CanonicalUnitLock {
  readonly role: LayeredProductionLayerRole;
  readonly kind: LayeredProductionUnitKind;
  readonly alpha: LayeredProductionAlphaPolicy;
  readonly width: number;
  readonly height: number;
}

export interface RoleRecipe {
  readonly scaleAnchors: readonly string[];
  readonly silhouetteRules: readonly string[];
  readonly valueRules: readonly string[];
  readonly paletteRoles: readonly string[];
  readonly clusterRules: readonly string[];
  readonly materialRules: readonly string[];
  readonly compositionRules: readonly string[];
  readonly storyRules: readonly string[];
  readonly blockingFailures: readonly string[];
}
