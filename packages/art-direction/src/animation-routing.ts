import type { AnimationMotionStyle } from "./animation-director.js";

export const ANIMATION_PRODUCTION_ROUTES = [
  "art-studio-sprite",
  "cel-animation-studio",
] as const;

export type AnimationProductionRoute =
  (typeof ANIMATION_PRODUCTION_ROUTES)[number];

export interface AnimationProductionRouteDecision {
  readonly route: AnimationProductionRoute;
  readonly reason: string;
  readonly directSpriteProviderCompilationAllowed: boolean;
}

export function resolveAnimationProductionRoute(
  motionStyle: AnimationMotionStyle,
): AnimationProductionRouteDecision {
  if (motionStyle === "traditional-cel") {
    return {
      route: "cel-animation-studio",
      reason:
        "Traditional cel production requires Cel Animation Studio X-sheet, exposure and authored-cel semantics before Art Studio packaging.",
      directSpriteProviderCompilationAllowed: false,
    };
  }
  return {
    route: "art-studio-sprite",
    reason:
      "Sprite-oriented motion is owned by Art Studio Animation Director, Sprite Supervisor and provider-neutral frame production.",
    directSpriteProviderCompilationAllowed: true,
  };
}
