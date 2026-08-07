import type { BookIllustrationProcessFamily } from "./book-illustration-intelligence.js";
import type { BookCreativeComposition, BookCreativeGenre } from "./book-creative-direction-types.js";

export interface Profile { processes:BookIllustrationProcessFamily[]; compositions:BookCreativeComposition[]; tone:string; cliches:string[]; }
export const P:Readonly<Record<BookCreativeGenre,Profile>>={
 literary:p(["lithographic_tone","linocut","duotone"],["quiet_field_with_precise_intrusion","single_anchor_with_counterweight"],"restrained value groups and one exact rupture",["tasteful generic minimalism","floating symbolic object"]),
 historical:p(["relief_engraving","intaglio_etching","lithographic_tone"],["asymmetric_environmental_dominance","aftermath_or_preaction_suspension"],"period value grouping before fine linework",["sepia filter","costume pageant","tourist-view architecture"]),
 horror:p(["scratchboard","black_only","relief_engraving"],["compressed_oblique_geometry","quiet_field_with_precise_intrusion"],"controlled black masses interrupted by exact evidence",["generic skull","misty haunted house","glowing eyes"]),
 mythic:p(["relief_engraving","duotone","ornamental_print"],["monumental_low_horizon","single_anchor_with_counterweight"],"monumental silhouette with material history",["chosen-one pose","stock runes","perfect symmetry"]),
 grimdark_fantasy:p(["relief_engraving","scratchboard","black_only"],["monumental_low_horizon","compressed_oblique_geometry"],"severe values and project-owned weathered symbols",["branded armour","copied insignia","pile of skulls"]),
 science_fiction:p(["technical_plate","risograph","lithographic_tone"],["layered_cutaway","quiet_field_with_precise_intrusion"],"system scale and physical consequence",["stock nebula","blue-orange poster","hologram clutter"]),
 crime:p(["linocut","duotone","brush_pen_halftone"],["compressed_oblique_geometry","single_anchor_with_counterweight"],"oblique geometry and evidence-bearing objects",["fedora silhouette","wet alley","gun close-up"]),
 romance:p(["lithographic_tone","duotone","children_picture_book"],["relational_distance_and_negative_space","quiet_field_with_precise_intrusion"],"relational distance and gesture, not stock embrace",["anonymous embrace","sunset kiss","rose petals"]),
 children:p(["children_picture_book","linocut","risograph"],["single_anchor_with_counterweight","sequential_depth_rhythm"],"immediate silhouette readability and tactile discovery",["generic cute mascot","random rainbow palette"]),
 memoir:p(["brush_pen_halftone","lithographic_tone","duotone"],["single_anchor_with_counterweight","asymmetric_environmental_dominance"],"specific remembered objects without false certainty",["photo collage","torn-paper effect"]),
 documentary:p(["brush_pen_halftone","technical_plate","lithographic_tone"],["asymmetric_environmental_dominance","layered_cutaway"],"evidence hierarchy without dramatization",["newspaper collage","fake stamps"]),
 technical:p(["technical_plate","cartographic_linework","black_only"],["layered_cutaway","single_anchor_with_counterweight"],"geometry, flow and failure modes before decoration",["fake measurements","generated labels","decorative circuitry"]),
 reference:p(["technical_plate","cartographic_linework","ornamental_print"],["layered_cutaway","single_anchor_with_counterweight"],"taxonomy and comparison with editable labels",["stock infographic icons","generated labels"]),
 graphic_novel:p(["graphic_novel_ink","brush_pen_halftone","black_only"],["sequential_depth_rhythm","compressed_oblique_geometry"],"panel rhythm and camera continuity before rendering",["every panel splash art","Dutch angles everywhere","baked-in dialogue"]),
 pulp:p(["brush_pen_halftone","duotone","linocut"],["compressed_oblique_geometry","monumental_low_horizon"],"bold hierarchy with exact props and stakes",["floating villain head","meaningless explosion"]),
 poetry:p(["lithographic_tone","linocut","duotone"],["quiet_field_with_precise_intrusion","single_anchor_with_counterweight"],"image, pause and repetition rather than paraphrase",["floating feather","ink splash","generic moon"]),
 cookbook:p(["brush_pen_halftone","linocut","technical_plate"],["single_anchor_with_counterweight","layered_cutaway"],"ingredient, vessel and process clarity",["ingredient explosion","generic rustic table"]),
 academic:p(["technical_plate","lithographic_tone","cartographic_linework"],["layered_cutaway","quiet_field_with_precise_intrusion"],"claim, evidence and limitation made visible",["generic network","fake data","decorative equations"]),
 custom:p(["lithographic_tone","linocut","brush_pen_halftone"],["single_anchor_with_counterweight","asymmetric_environmental_dominance"],"custom route justified by evidence and reproduction",["style adjective pile","generic concept-art shorthand"]),
};
export const GENERIC=["masterpiece","trending on artstation","8k","ultra detailed","hyper detailed","epic cinematic","in the style of"];
export const STOCK_MOTIFS=["lone hooded figure facing a glowing portal","floating head montage","generic warrior on a ridge","central sword with symmetrical ornaments","stock nebula and planet","generic castle under a moon","anonymous embracing couple","detective silhouette in a wet alley"];
export const SYNTHETIC_FAILURES=["plastic or waxy materials","uniform micro-detail and equal edges","orange-blue grading","gratuitous rim light, glow or particles","random global scratch overlay","cloned texture or distress","meaningless pseudo-detail or runes","generated writing, logos, watermarks or signatures","generic movie-poster hierarchy"];
function p(processes:BookIllustrationProcessFamily[],compositions:BookCreativeComposition[],tone:string,cliches:string[]):Profile{return{processes,compositions,tone,cliches};}
