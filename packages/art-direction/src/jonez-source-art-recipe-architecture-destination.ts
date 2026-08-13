import type { RoleRecipe } from "./jonez-source-art-recipe-types.js";

export const JONEZ_ARCHITECTURE_BACK_RECIPE: RoleRecipe = {
    scaleAnchors: [
      "primary facade masses are at least 18x12 native pixels",
      "background windows simplify to 2-4 pixel apertures",
      "roof lips and ledges use one- or two-pixel thickness",
      "distant doors remain at least 5x9 pixels where visible",
    ],
    silhouetteRules: [
      "each facade has an asymmetric roofline, chimney, awning or setback identity",
      "rear architecture forms readable neighbourhood masses without resembling a complete foreground destination",
      "no repeated facade is an exact mirror, palette swap or clone",
    ],
    valueRules: [
      "rear architecture uses one lower contrast tier than destination structures",
      "windows are grouped into rhythm blocks rather than individually highlighted grids",
      "deepest dark is reserved for openings and overlap seams",
    ],
    paletteRoles: [
      "#8B6A4D, #C49A65 and #E1C68A support warm brick and plaster",
      "#263248, #4B5D72 and #32739A support civic stone and cool roofs",
      "#B54D4D is a sparse awning or trim accent, never a dominant wash",
    ],
    clusterRules: [
      "brick suggestion uses short staggered clusters only on focal facade zones",
      "roof slopes use consistent staircase cadence corrected by hand at corners",
      "window highlights occur in grouped clusters and never as uniform AI-lit dots",
    ],
    materialRules: [
      "brick, painted stone, concrete, canvas and iron remain materially distinct with two or three authored cues each",
      "no physically based gloss, ambient-occlusion fog or painterly brush texture",
    ],
    compositionRules: [
      "leave intentional negative-space slots for separate cafe, market, player and fountain sources",
      "facade density decreases toward the top edge to protect native-scale readability",
      "blank signboards are simple bordered shapes with no pseudo-lettering",
    ],
    storyRules: [
      "include restrained lived-in variation such as one open shutter, patched brick or crooked awning",
      "micro-stories requiring people or loose props remain in later layers",
    ],
    blockingFailures: [
      "facades repeat as exact clones or mirrored templates",
      "pseudo-text, generated shop names or letter-like noise appears",
      "the source contains a foreground destination building, person, route or prop",
    ],
};

export const JONEZ_DESTINATION_STRUCTURE_RECIPE: RoleRecipe = {
    scaleAnchors: [
      "the structure occupies 72-90 percent of the source width and 68-94 percent of its height",
      "a usable entrance reads as an 8-14 pixel opening",
      "awnings and roof overhangs remain at least two pixels thick",
      "the ground-contact baseline is continuous and visually unambiguous",
    ],
    silhouetteRules: [
      "the building reads instantly from silhouette before windows, trim or signage are added",
      "the cafe uses an offset awning, compact chimney and asymmetrical street-facing entrance",
      "the silhouette is original and may not reconstruct a known commercial game building",
    ],
    valueRules: [
      "use a five-value maximum structure hierarchy before optional accent colours",
      "entrance and window cavities are darker than wall seams but not empty black rectangles",
      "reserve the lightest colour for small sun-facing edges and focal trim",
    ],
    paletteRoles: [
      "warm wall ramp uses #8B6A4D, #C49A65 and #E1C68A",
      "structural darks use #101018 and #263248",
      "civic blue #32739A or market red #B54D4D is limited to one authored identity accent",
    ],
    clusterRules: [
      "major planes are built from connected pixel masses before trim is introduced",
      "curves such as awning scallops use hand-authored clustered arcs without antialiasing",
      "single-pixel trim is used only where it survives one-times native inspection",
    ],
    materialRules: [
      "canvas awning, masonry wall, glass opening and iron bracket each use a distinct cluster grammar",
      "glass uses two or three stepped tones and no glossy gradient reflection",
    ],
    compositionRules: [
      "preserve transparent clearance around every silhouette edge and beneath the pivot",
      "leave sign fields completely blank for authored live typography",
      "front-facing interaction area remains visually clear for a player sprite",
    ],
    storyRules: [
      "express personality through architecture: one mismatched chair shadow, patched awning seam or hand-set window rhythm",
      "do not add loose chairs, customers, food, pavement, route or scenery to the structure source",
    ],
    blockingFailures: [
      "the building reads like a generic mobile-isometric shop kit",
      "readable or pseudo-readable text appears",
      "ground, route, people, loose props, drop shadow or adjacent buildings contaminate the source",
    ],
};
