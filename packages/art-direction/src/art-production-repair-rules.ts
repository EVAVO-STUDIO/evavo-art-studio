import type {
  ArtProductionBlockingDetection,
  ArtProductionMetricId,
} from "./art-production-orchestrator-types.js";

export const REPAIR_BY_METRIC: Readonly<Record<ArtProductionMetricId, string>> = {
  "alpha-quality":
    "Rebuild the alpha edge at native resolution: remove matte halos and unsafe transparent RGB while preserving only owned pixels.",
  "layer-purity":
    "Remove every object owned by another layer and return only the declared source-unit role.",
  "native-readability":
    "Simplify the silhouette and internal value groups until the asset reads clearly at exact native size without enlargement.",
  "palette-discipline":
    "Return to the approved indexed palette ramps and remove invented colours, soft blends and uncontrolled shade steps.",
  "pixel-cluster-quality":
    "Replace isolated noise, smoothed curves and post-process texture with deliberate connected pixel clusters.",
  "camera-accuracy":
    "Restore the exact fixed projection, yaw, pitch, roll, scale and facing direction from the game profile.",
  "era-authenticity":
    "Remove modern glossy rendering and redraw using the approved early-1990s raster grammar.",
  "non-generic-quality":
    "Reassert the approved project-specific motifs, proportions and material vocabulary; remove generic AI-retro treatment.",
  "runtime-usability":
    "Correct crop, bounds, pivot, contact and source isolation so the PNG can be used directly by the runtime manifest.",
  "identity-consistency":
    "Restore the approved identity-master proportions, clothing masses, palette ramps and distinguishing shapes.",
  "pivot-stability":
    "Hold the exact pivot and body mass around the approved anchor; do not recenter or trim the frame.",
  "ground-contact-stability":
    "Restore the exact ground-contact row and remove vertical bounce or foot sliding.",
  "pose-progression":
    "Redraw the pose as the intended motion step between neighbouring approved frames without changing identity or camera.",
};

export const REPAIR_BY_DETECTION: Readonly<
  Record<ArtProductionBlockingDetection, string>
> = {
  "multiple-assets":
    "Return exactly one source asset or animation frame; remove sheets, alternates, panels and comparison layouts.",
  "layer-contamination":
    "Remove all content owned by other layers and preserve transparent pixels outside the declared source role.",
  antialiasing:
    "Remove antialiasing and redraw every contour with hard native pixel steps.",
  "gradient-shading":
    "Replace gradients with approved stepped palette clusters and manual dithering only where the profile permits it.",
  "bloom-or-soft-lighting":
    "Remove bloom, glow, airbrush highlights and soft lighting; restore fixed palette-based illumination.",
  "procedural-pixel-noise":
    "Delete procedural speckle and microtexture; rebuild surfaces with intentional repeating cluster motifs.",
  "generic-ai-styling":
    "Discard generic AI-retro styling and reconstruct the asset from the approved project-specific shape and material grammar.",
  "vector-like-rendering":
    "Redraw as native raster pixels and remove SVG-like curves, wordmark geometry and resolution-independent edges.",
  "generated-readable-text":
    "Remove generated text and replace it with blank or deliberately unreadable authored marks for later typography.",
  "matte-halo":
    "Remove the matte fringe and preserve true transparent RGBA outside the owned silhouette.",
  "unsafe-transparent-rgb":
    "Clear hidden unrelated RGB in fully transparent pixels without changing visible owned pixels.",
  "camera-drift":
    "Restore the exact fixed camera profile and facing; do not reinterpret the asset from another view.",
  "identity-drift":
    "Match the approved identity master exactly before changing the intended pose.",
  "pivot-drift":
    "Restore the declared pivot coordinates and keep the silhouette registered to the same frame origin.",
  "ground-contact-drift":
    "Restore the declared Y-sort and ground-contact position; remove foot sliding and vertical drift.",
  "crop-risk":
    "Move the owned silhouette inside the safe native canvas without scaling, trimming or changing the pivot.",
  "copyrighted-imitation":
    "Remove copied franchise-specific shapes, marks and characters; retain only the original production grammar and functional constraints.",
};
