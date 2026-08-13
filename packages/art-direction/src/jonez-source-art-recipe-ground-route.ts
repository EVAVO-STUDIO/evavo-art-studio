import type { RoleRecipe } from "./jonez-source-art-recipe-types.js";

export const JONEZ_GROUND_BASE_RECIPE: RoleRecipe = {
    scaleAnchors: [
      "primary street lanes read as 14-20 native pixels across",
      "curb rises use one dark pixel plus at most one light lip pixel",
      "surface-wear marks occupy compact 2-6 pixel clusters rather than noise",
      "walkable clearances remain at least 12 native pixels wide",
    ],
    silhouetteRules: [
      "large ground regions are simple interlocking masses with deliberate irregular boundaries",
      "canal, road, paving and grass remain separable at one-times native view",
      "no object silhouette, facade, person, prop, route symbol or UI mark may appear",
    ],
    valueRules: [
      "establish four readable value families before hue variation: road, stone, vegetation and water",
      "reserve the darkest ramp for seams, drains and contact creases rather than blanket outlines",
      "avoid high-frequency checker noise in quiet walkable areas",
    ],
    paletteRoles: [
      "#101018 and #263248 anchor asphalt seams and deepest water",
      "#4B5D72 supports cool road and canal mid-values",
      "#8B6A4D, #C49A65 and #E1C68A form the paving and dry-stone ramp",
      "#295A46 and #4E8A57 form the restrained grass ramp",
    ],
    clusterRules: [
      "use connected 2x2, 3x2 and stepped clusters for broad material changes",
      "isolated one-pixel accents may not exceed five percent of authored marks",
      "ordered repetition must be interrupted by authored wear every 12-24 pixels",
    ],
    materialRules: [
      "stone reads through chipped edges and two-tone joints, not photographic texture",
      "asphalt reads through sparse patched masses, not procedural speckle",
      "water base is calm stepped bands only; animated sparkle belongs to effects",
    ],
    compositionRules: [
      "preserve open negative space beneath future routes, buildings, crowds and props",
      "ground boundaries guide the eye around a loop without drawing the route itself",
      "district corners differ in material rhythm so the map remains navigable when zoomed out",
    ],
    storyRules: [
      "imply use through restrained scuffs, repairs and drainage without adding story props",
      "make the market district feel maintained but imperfect rather than generically ruined",
    ],
    blockingFailures: [
      "route paving, route medallions or destination sockets appear in the ground source",
      "procedural grain, AI speckle or uniformly scattered one-pixel noise appears",
      "ground regions cannot be distinguished at one-times native view",
    ],
};

export const JONEZ_ROUTE_BASE_RECIPE: RoleRecipe = {
    scaleAnchors: [
      "main route bands read as 8-12 native pixels wide",
      "destination sockets read as 6-8 pixel medallions with a two-pixel dark rim",
      "dimetric turns follow authored 2:1 stair-step rhythm without vector-smooth diagonals",
      "junction throats retain at least six clear pixels",
    ],
    silhouetteRules: [
      "the entire route is readable as one connected loop at native scale",
      "route geometry remains visibly embedded in paving rather than floating above it",
      "no ground fill, building, person, prop, highlight glow or UI panel may appear",
    ],
    valueRules: [
      "route bands remain one value step lighter than adjacent paving and one step darker than active highlights",
      "medallion centres use restrained civic-blue or market-ochre accents",
      "route edges avoid full black except at destination socket rims",
    ],
    paletteRoles: [
      "#C49A65 and #E1C68A form neutral route paving",
      "#32739A identifies civic destinations",
      "#E3A646 identifies market and leisure destinations",
      "#101018 is limited to socket rims and critical junction separation",
    ],
    clusterRules: [
      "straight segments repeat a short authored paving rhythm no longer than eight pixels",
      "corners use hand-corrected clusters rather than rotated or mirrored automatic output",
      "medallions use readable clustered circles, never antialiased ellipses",
    ],
    materialRules: [
      "route stone inherits the ground paving material but has a cleaner maintained edge",
      "socket insets read as enamel or coloured tile, not glowing buttons",
    ],
    compositionRules: [
      "all exits align to declared route-node centres and leave room for character feet",
      "route branches avoid tangencies with building silhouettes and future foreground occluders",
      "the route remains legible without arrows, labels or readable text",
    ],
    storyRules: [
      "use subtle wear concentration near destinations to imply foot traffic",
      "keep jokes and narrative events out of this structural layer",
    ],
    blockingFailures: [
      "any route segment visually terminates without a declared socket or edge connection",
      "route geometry reads as a board pasted over the city rather than authored paving",
      "glow, bloom, arrows, readable labels or modern UI iconography appears",
    ],
};
