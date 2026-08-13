import type { RoleRecipe } from "./jonez-source-art-recipe-types.js";

export const JONEZ_CROWD_CHARACTER_RECIPE: RoleRecipe = {
    scaleAnchors: [
      "adult crowd sprites fit 18-24 pixels wide by 28-34 pixels high",
      "children and elderly silhouettes vary through body mass rather than simple uniform scaling",
    ],
    silhouetteRules: [
      "every crowd archetype differs in posture, body mass, hair and carried silhouette",
      "no exact mirrored or palette-only duplicate is accepted within one visible district",
    ],
    valueRules: ["separate skin, upper body, lower body and carried object by value before hue"],
    paletteRoles: ["limit each crowd sprite to 8-12 local colours from the canonical scene palette"],
    clusterRules: ["micro-animation changes only the clusters needed for the action"],
    materialRules: ["clothing and carried objects remain readable through mass and two-tone cues"],
    compositionRules: ["preserve a fixed ground-contact point and transparent exterior"],
    storyRules: ["each sprite performs one legible everyday action or reaction"],
    blockingFailures: ["identical faces, cloned silhouettes, extra characters or sheet layout appears"],
};

export const JONEZ_WORLD_PROP_RECIPE: RoleRecipe = {
    scaleAnchors: ["small props retain a 2-pixel minimum structural thickness where gameplay readability requires it"],
    silhouetteRules: ["the prop is recognisable from silhouette at native scale"],
    valueRules: ["use three or four value groups before accent pixels"],
    paletteRoles: ["draw only from the canonical scene palette and declared material ramp"],
    clusterRules: ["avoid isolated detail that disappears at one-times native view"],
    materialRules: ["communicate one principal material and at most one secondary material"],
    compositionRules: ["one prop only with transparent clearance and a declared ground contact"],
    storyRules: ["use wear or asymmetry to avoid generic asset-pack appearance"],
    blockingFailures: ["a prop bundle, scene vignette, cast background or readable text appears"],
};

export const JONEZ_FOREGROUND_OCCLUSION_RECIPE: RoleRecipe = {
    scaleAnchors: ["occluding edges align to declared lower-layer anchors on integer pixels"],
    silhouetteRules: ["only the foreground portion that must cover actors is present"],
    valueRules: ["foreground contrast is sufficient to read above actors without a modern vignette"],
    paletteRoles: ["reuse the exact material ramp of the parent object"],
    clusterRules: ["cut lines are deliberate and hidden behind the parent composite"],
    materialRules: ["match the parent object exactly; do not reinterpret its material"],
    compositionRules: ["transparent exterior and exact placement are mandatory"],
    storyRules: ["no new narrative detail is introduced in the occlusion split"],
    blockingFailures: ["the complete object, background fill or mismatched material appears"],
};

export const JONEZ_ROUTE_HIGHLIGHT_RECIPE: RoleRecipe = {
    scaleAnchors: ["highlight thickness is one or two native pixels beyond the route edge"],
    silhouetteRules: ["the highlight follows route geometry without changing it"],
    valueRules: ["use discrete stepped states and no glow gradient"],
    paletteRoles: ["reserve one bright accent and one dark separator from the canonical palette"],
    clusterRules: ["animated states change whole clusters, never opacity-smoothed pixels"],
    materialRules: ["the highlight reads as a game state, not emissive physical material"],
    compositionRules: ["route highlight only; no labels, arrows or UI panel"],
    storyRules: ["no narrative content"],
    blockingFailures: ["bloom, blur, arrows, readable text or altered route geometry appears"],
};

export const JONEZ_UI_RECIPE: RoleRecipe = {
    scaleAnchors: ["controls align to the 320x200 native grid and use integer padding"],
    silhouetteRules: ["panels and icons remain readable without rounded modern card silhouettes"],
    valueRules: ["UI separates from the city with stepped values rather than blur or translucency"],
    paletteRoles: ["use a restrained subset of the canonical scene palette"],
    clusterRules: ["borders, icons and type sockets use deliberate pixel clusters"],
    materialRules: ["UI is flat authored raster, not glassmorphism or skeuomorphic gloss"],
    compositionRules: ["live text fields remain blank in generated raster sources"],
    storyRules: ["UI ornament reflects civic blue and market ochre motifs sparingly"],
    blockingFailures: ["modern cards, gradients, generated text, bloom or touch-app styling appears"],
};

