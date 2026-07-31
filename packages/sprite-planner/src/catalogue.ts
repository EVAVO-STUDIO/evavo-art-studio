import type {
  SpriteClipCategory,
  SpriteDirectionMode,
  SpriteGameplayProfile,
  SpriteLoopMode,
  SpritePlanRole,
} from "./types.js";

export interface SpriteClipTemplate {
  readonly id: string;
  readonly category: SpriteClipCategory;
  readonly directionMode: SpriteDirectionMode;
  readonly loopMode: SpriteLoopMode;
  readonly baseFrames: Readonly<{ pixel: number; raster: number; prerendered: number }>;
  readonly framesPerSecond: number;
  readonly keyPoseFractions: readonly number[];
  readonly reason: string;
}

const clip = (
  id: string,
  category: SpriteClipCategory,
  baseFrames: readonly [number, number, number],
  framesPerSecond: number,
  loopMode: SpriteLoopMode,
  reason: string,
  directionMode: SpriteDirectionMode = "all",
  keyPoseFractions: readonly number[] = [0, 0.5],
): SpriteClipTemplate => ({
  id, category, directionMode, loopMode,
  baseFrames: { pixel: baseFrames[0], raster: baseFrames[1], prerendered: baseFrames[2] },
  framesPerSecond, keyPoseFractions, reason,
});

export const SPRITE_CLIP_CATALOGUE: Readonly<Record<string, SpriteClipTemplate>> = Object.freeze({
  idle: clip("idle", "foundation", [6, 8, 10], 8, "linear", "Every runtime family needs a stable resting silhouette and identity reference.", "all", [0, 0.5]),
  walk: clip("walk", "locomotion", [8, 8, 12], 10, "linear", "Primary locomotion loop with grounded contact and readable weight transfer.", "all", [0, 0.25, 0.5, 0.75]),
  run: clip("run", "locomotion", [8, 10, 12], 12, "linear", "Fast locomotion with a distinct silhouette and cadence from walking.", "all", [0, 0.25, 0.5, 0.75]),
  turn: clip("turn", "locomotion", [4, 6, 8], 10, "none", "Explicit facing transition prevents snapping between direction masters.", "all", [0, 0.5, 1]),
  "crouch-idle": clip("crouch-idle", "locomotion", [4, 6, 8], 8, "linear", "Stable crouched state for platforming, combat or stealth."),
  "crouch-walk": clip("crouch-walk", "locomotion", [6, 8, 10], 9, "linear", "Crouched locomotion preserves reduced baseline and collision posture."),
  "jump-start": clip("jump-start", "locomotion", [3, 4, 5], 12, "none", "Anticipation and take-off are separated from airborne loops.", "all", [0, 0.5, 1]),
  "jump-loop": clip("jump-loop", "locomotion", [2, 4, 4], 8, "linear", "Airborne hold for variable jump duration.", "all", [0, 1]),
  fall: clip("fall", "locomotion", [2, 4, 4], 8, "linear", "Falling posture remains distinct from ascent and landing.", "all", [0, 1]),
  land: clip("land", "locomotion", [3, 5, 6], 12, "none", "Ground impact and recovery close the jump state cleanly.", "all", [0, 0.5, 1]),
  climb: clip("climb", "locomotion", [6, 8, 10], 9, "linear", "Climbing needs vertical cadence and fixed contact points.", "front-only"),
  swim: clip("swim", "locomotion", [8, 10, 12], 9, "linear", "Swimming uses distinct buoyancy, recovery and secondary motion."),
  fly: clip("fly", "locomotion", [8, 10, 12], 10, "linear", "Flying needs stable lift and airborne anchors."),

  "combat-idle": clip("combat-idle", "combat", [6, 8, 10], 8, "linear", "Combat posture establishes weapon, handedness and readiness."),
  "attack-light": clip("attack-light", "combat", [8, 10, 12], 12, "none", "Fast attack with readable wind-up, contact and recovery.", "all", [0, 0.35, 0.55, 1]),
  "attack-heavy": clip("attack-heavy", "combat", [10, 12, 16], 12, "none", "Heavy attack needs longer anticipation, impact and recovery.", "all", [0, 0.35, 0.6, 1]),
  "attack-ranged": clip("attack-ranged", "combat", [8, 10, 12], 12, "none", "Ranged attack preserves aim line, release timing and held-item scale.", "all", [0, 0.4, 0.6, 1]),
  aim: clip("aim", "combat", [4, 6, 8], 8, "linear", "Aiming locks weapon alignment without replaying the firing motion."),
  reload: clip("reload", "combat", [8, 12, 16], 10, "none", "Reloading needs a complete equipment interaction.", "all", [0, 0.35, 0.7, 1]),
  block: clip("block", "combat", [4, 6, 8], 8, "linear", "Held defensive state needs stable silhouette and equipment coverage."),
  parry: clip("parry", "combat", [5, 7, 9], 14, "none", "Parry is a short timing window, not a mirrored block.", "all", [0, 0.5, 1]),
  dodge: clip("dodge", "combat", [6, 8, 10], 14, "none", "Dodge or roll requires full motion bounds and recovery.", "all", [0, 0.35, 0.7, 1]),
  cast: clip("cast", "combat", [10, 12, 16], 10, "none", "Casting separates anticipation, release, effect ownership and recovery.", "all", [0, 0.35, 0.65, 1]),
  "use-item": clip("use-item", "interaction", [6, 8, 10], 10, "none", "Item use requires a bounded prop interaction.", "all", [0, 0.5, 1]),

  interact: clip("interact", "interaction", [6, 8, 10], 10, "none", "General interaction motion for switches, doors and contextual actions.", "all", [0, 0.5, 1]),
  pickup: clip("pickup", "interaction", [6, 8, 10], 10, "none", "Pickup preserves hand-to-object contact, baseline and recovery.", "all", [0, 0.5, 1]),
  push: clip("push", "interaction", [8, 10, 12], 9, "linear", "Pushing needs sustained contact and grounded force transfer.", "horizontal"),
  pull: clip("pull", "interaction", [8, 10, 12], 9, "linear", "Pulling differs from pushing in silhouette and force direction.", "horizontal"),
  talk: clip("talk", "interaction", [6, 8, 10], 8, "linear", "Dialogue loop keeps posture and identity stable.", "front-only"),
  gesture: clip("gesture", "interaction", [8, 10, 12], 8, "none", "Project-specific gesture avoids generic conversational movement.", "front-only", [0, 0.5, 1]),
  "work-loop": clip("work-loop", "interaction", [8, 10, 12], 8, "linear", "Occupational loop gives NPCs role-specific activity."),

  alert: clip("alert", "state", [5, 7, 9], 10, "none", "Awareness transition prevents snapping from idle to combat.", "all", [0, 0.5, 1]),
  "hit-react": clip("hit-react", "state", [4, 5, 7], 12, "none", "Damage reaction preserves identity and direction.", "all", [0, 0.5, 1]),
  stun: clip("stun", "state", [6, 8, 10], 8, "linear", "Stunned state is a controlled loop with no unintended locomotion."),
  knockdown: clip("knockdown", "state", [7, 9, 12], 12, "none", "Knockdown includes displacement, ground contact and final hold.", "all", [0, 0.5, 1]),
  "get-up": clip("get-up", "state", [7, 9, 12], 12, "none", "Recovery restores exact baseline and facing.", "all", [0, 0.5, 1]),
  death: clip("death", "state", [10, 12, 16], 10, "none", "Complete death state with ground contact and retained final frame.", "all", [0, 0.35, 0.7, 1]),
  spawn: clip("spawn", "state", [8, 10, 14], 10, "none", "Spawn or entrance is authored separately from idle and effects.", "all", [0, 0.5, 1]),
  despawn: clip("despawn", "state", [8, 10, 14], 10, "none", "Despawn preserves effect ownership and final visibility.", "all", [0, 0.5, 1]),
  "phase-transition": clip("phase-transition", "cinematic", [12, 16, 20], 10, "none", "Boss phase change needs a complete readable transition.", "all", [0, 0.35, 0.7, 1]),
  special: clip("special", "combat", [12, 16, 20], 10, "none", "Signature ability gets project-specific timing and silhouette.", "all", [0, 0.35, 0.65, 1]),
  taunt: clip("taunt", "cinematic", [8, 10, 12], 8, "none", "Character-specific flourish strengthens personality.", "front-only", [0, 0.5, 1]),

  "vehicle-idle": clip("vehicle-idle", "foundation", [4, 6, 8], 8, "linear", "Stable vehicle idle, engine or wheel motion."),
  move: clip("move", "locomotion", [8, 10, 12], 10, "linear", "Primary vehicle or strategy-unit movement."),
  brake: clip("brake", "locomotion", [4, 6, 8], 10, "none", "Braking avoids abrupt transition to idle.", "all", [0, 0.5, 1]),
  damage: clip("damage", "state", [4, 6, 8], 8, "linear", "Visible damaged operating state remains distinct from destruction."),
  destroyed: clip("destroyed", "state", [8, 10, 14], 10, "none", "Complete destruction transition and stable wreck.", "all", [0, 0.5, 1]),

  "prop-idle": clip("prop-idle", "prop", [1, 1, 1], 1, "none", "Default intact prop state.", "none", [0]),
  activate: clip("activate", "prop", [6, 8, 10], 10, "none", "Activation transition from inactive to operating.", "none", [0, 0.5, 1]),
  "active-loop": clip("active-loop", "prop", [6, 8, 10], 8, "linear", "Continuous operating state with fixed bounds.", "none"),
  deactivate: clip("deactivate", "prop", [6, 8, 10], 10, "none", "Return from active state without reversing unrelated effect logic.", "none", [0, 0.5, 1]),
  damaged: clip("damaged", "prop", [1, 1, 1], 1, "none", "Stable damaged visual state.", "none", [0]),
  broken: clip("broken", "prop", [6, 8, 10], 10, "none", "Break transition and final non-operating state.", "none", [0, 0.5, 1]),
  open: clip("open", "prop", [6, 8, 10], 10, "none", "Open transition with stable hinges, pivot and occlusion.", "none", [0, 0.5, 1]),
  close: clip("close", "prop", [6, 8, 10], 10, "none", "Close transition may differ in timing and collision.", "none", [0, 0.5, 1]),

  "particle-spawn": clip("particle-spawn", "particle", [4, 6, 8], 12, "none", "Effect onset establishes origin, scale and blend.", "none", [0, 0.5, 1]),
  "particle-loop": clip("particle-loop", "particle", [8, 12, 16], 12, "linear", "Fixed-cell effect loop for sustained particles.", "none"),
  "particle-impact": clip("particle-impact", "particle", [8, 12, 16], 14, "none", "Impact carries contact, peak and dissipation.", "none", [0, 0.35, 0.65, 1]),
  "particle-dissipate": clip("particle-dissipate", "particle", [6, 8, 12], 12, "none", "Explicit effect end avoids popping.", "none", [0, 0.5, 1]),
  "particle-trail": clip("particle-trail", "particle", [8, 12, 16], 12, "linear", "Trail segment maintains fixed canvas and continuity.", "none"),

  normal: clip("normal", "ui", [1, 1, 1], 1, "none", "Default UI state.", "none", [0]),
  hover: clip("hover", "ui", [1, 1, 1], 1, "none", "Pointer hover state with stable bounds.", "none", [0]),
  pressed: clip("pressed", "ui", [1, 1, 1], 1, "none", "Pressed state with controlled offset and contrast.", "none", [0]),
  disabled: clip("disabled", "ui", [1, 1, 1], 1, "none", "Disabled state when art requires it.", "none", [0]),
  selected: clip("selected", "ui", [1, 1, 1], 1, "none", "Selected or active state.", "none", [0]),
  focused: clip("focused", "ui", [1, 1, 1], 1, "none", "Keyboard or controller focus state.", "none", [0]),

  "portrait-idle": clip("portrait-idle", "portrait", [4, 6, 8], 6, "linear", "Stable portrait breathing or idle loop.", "none"),
  blink: clip("blink", "portrait", [3, 4, 5], 12, "none", "Blink with exact closure and recovery.", "none", [0, 0.5, 1]),
  "portrait-talk": clip("portrait-talk", "portrait", [6, 8, 10], 10, "linear", "Dialogue motion preserves face identity.", "none"),
  "emote-positive": clip("emote-positive", "portrait", [6, 8, 10], 8, "none", "Project-specific positive expression.", "none", [0, 0.5, 1]),
  "emote-negative": clip("emote-negative", "portrait", [6, 8, 10], 8, "none", "Project-specific negative expression.", "none", [0, 0.5, 1]),
  "portrait-hurt": clip("portrait-hurt", "portrait", [4, 6, 8], 10, "none", "Portrait damage reaction retains facial structure.", "none", [0, 0.5, 1]),
});

const roleClips: Readonly<Record<SpritePlanRole, readonly string[]>> = Object.freeze({
  "playable-character": ["idle", "walk", "run", "turn", "interact", "use-item", "hit-react", "death"],
  npc: ["idle", "walk", "turn", "talk", "gesture", "interact", "work-loop"],
  enemy: ["idle", "walk", "run", "alert", "attack-light", "hit-react", "death", "spawn"],
  boss: ["idle", "walk", "run", "alert", "combat-idle", "attack-light", "attack-heavy", "special", "phase-transition", "hit-react", "death", "spawn"],
  companion: ["idle", "walk", "run", "turn", "interact", "talk", "hit-react", "death"],
  vehicle: ["vehicle-idle", "move", "turn", "brake", "damage", "destroyed"],
  "animated-prop": ["prop-idle", "activate", "active-loop", "deactivate"],
  "destructible-prop": ["prop-idle", "damaged", "broken"],
  "particle-effect": ["particle-spawn", "particle-loop", "particle-dissipate"],
  "ui-sprite": ["normal", "hover", "pressed", "disabled", "selected", "focused"],
  "portrait-character": ["portrait-idle", "blink", "portrait-talk", "emote-positive", "emote-negative", "portrait-hurt"],
});

const profileClips: Readonly<Record<SpriteGameplayProfile, readonly string[]>> = Object.freeze({
  platformer: ["run", "crouch-idle", "crouch-walk", "jump-start", "jump-loop", "fall", "land", "climb", "attack-light", "hit-react", "death"],
  "action-rpg": ["combat-idle", "attack-light", "attack-heavy", "block", "dodge", "cast", "use-item", "alert", "hit-react", "death"],
  "tactical-rpg": ["combat-idle", "attack-light", "attack-ranged", "aim", "cast", "alert", "hit-react", "death"],
  strategy: ["idle", "move", "attack-light", "attack-ranged", "work-loop", "hit-react", "death"],
  adventure: ["talk", "gesture", "interact", "pickup", "push", "pull", "use-item", "work-loop"],
  fighting: ["combat-idle", "walk", "run", "crouch-idle", "jump-start", "jump-loop", "fall", "land", "attack-light", "attack-heavy", "block", "parry", "dodge", "hit-react", "knockdown", "get-up", "death", "taunt"],
  shooter: ["run", "combat-idle", "aim", "attack-ranged", "reload", "dodge", "hit-react", "death"],
  simulation: ["idle", "walk", "talk", "interact", "pickup", "use-item", "work-loop"],
  "visual-novel": ["portrait-idle", "blink", "portrait-talk", "emote-positive", "emote-negative", "portrait-hurt"],
  custom: [],
});

export function roleDefaultClipIds(role: SpritePlanRole): readonly string[] { return roleClips[role]; }
export function gameplayDefaultClipIds(profile: SpriteGameplayProfile): readonly string[] { return profileClips[profile]; }
