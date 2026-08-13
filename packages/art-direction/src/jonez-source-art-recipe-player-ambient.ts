import type { RoleRecipe } from "./jonez-source-art-recipe-types.js";

export const JONEZ_PLAYER_CHARACTER_RECIPE: RoleRecipe = {
    scaleAnchors: [
      "head mass is 7-9 pixels wide and 8-10 pixels high",
      "torso mass is 8-11 pixels wide with a readable shoulder line",
      "feet occupy separate 3-5 pixel contact clusters around the declared pivot",
      "hands and face use compact high-contrast clusters rather than single noisy pixels",
    ],
    silhouetteRules: [
      "hair, torso, legs and footwear remain separable at native scale",
      "the player has one unmistakable original silhouette and does not use red-and-white striped search-character clothing",
      "limbs may not collapse into one-pixel spaghetti or modern chibi proportions",
    ],
    valueRules: [
      "face and hands share one restrained skin ramp",
      "clothing separates torso from legs with value before hue",
      "the darkest outline is selective around contact, overlap and facial focal points",
    ],
    paletteRoles: [
      "use no more than 12 local colours for the complete player frame",
      "reserve #101018 for selective contour and deepest overlap",
      "use one controlled clothing accent drawn from civic blue, market red or muted violet",
      "avoid pure white highlights and oversaturated modern neon",
    ],
    clusterRules: [
      "construct the pose from head, torso, pelvis and limb masses before adding features",
      "eyes, mouth and fingers are optional if they do not survive native scale",
      "each changed frame moves authored clusters deliberately; no interpolation smear or subpixel drift",
    ],
    materialRules: [
      "cloth folds are one- to three-cluster changes at joints, not painted fabric texture",
      "hair is one coherent mass with two or three directional break clusters",
    ],
    compositionRules: [
      "keep all motion inside the fixed frame and preserve the exact pivot and Y-sort origin",
      "leave transparent breathing room above hair and beside moving limbs",
      "the frame contains the player only: no floor tile, cast shadow, route marker, prop or UI",
    ],
    storyRules: [
      "the stance should communicate an ordinary ambitious city resident rather than a fantasy hero or mascot",
      "identity comes from posture, hair mass, jacket shape and shoe silhouette rather than decorative noise",
    ],
    blockingFailures: [
      "identity, body proportions, clothing design or palette drifts from the approved identity master",
      "red-and-white horizontal stripes, bobble hat, cane or other recognisable search-character signifiers appear",
      "the frame contains a cast shadow, ground patch, extra pose, second character or presentation sheet",
    ],
};

export const JONEZ_AMBIENT_EFFECT_RECIPE: RoleRecipe = {
    scaleAnchors: [
      "water jets remain 2-4 pixels wide at their widest point",
      "splash droplets are connected 1-3 pixel clusters and never particle haze",
      "the animation remains inside a 28-pixel safe diameter around the pivot",
    ],
    silhouetteRules: [
      "the frame contains water only and remains readable over both dark and light lower layers",
      "the lowest crest, jet tips and falling droplets form one coherent animation phase",
      "fountain masonry, basin, glow and environment are excluded",
    ],
    valueRules: [
      "use three to five stepped water colours with no alpha gradient",
      "brightest water pixels are sparse crest accents rather than bloom",
      "transparent exterior remains exact zero alpha",
    ],
    paletteRoles: [
      "#263248 and #4B5D72 form shadow and body water",
      "#32739A forms the principal water colour",
      "#E1C68A may not be used as a generic white sparkle substitute",
    ],
    clusterRules: [
      "each droplet is an authored cluster with a clear trajectory",
      "neighbouring frames preserve volume while changing crest timing",
      "no random spray, soft mask, motion blur or semi-transparent fog",
    ],
    materialRules: [
      "water reads through stepped crest shapes and overlap, not glass shaders or glow",
    ],
    compositionRules: [
      "preserve the exact pivot across the complete loop",
      "keep frame borders clear so atlas extrusion cannot merge droplets",
    ],
    storyRules: [
      "motion is restrained municipal fountain behaviour, not magical energy or combat VFX",
    ],
    blockingFailures: [
      "masonry, scenery, glow, shadow or another animation frame appears",
      "semi-transparent antialiased edges or soft spray appear",
      "water volume pops, drifts or changes palette between neighbouring frames",
    ],
};
