# HEAVY METAL FIGHTING Art Studio runtime

Status: first-class planning, mechanical-continuity, review and handoff adapter  
Public title: **HEAVY METAL FIGHTING**  
Technical game repository ID: `steel-dominion`  
Provider execution: disabled by this adapter  
Game-repository mutation: prohibited

## Purpose

This adapter turns the retained HEAVY METAL FIGHTING campaign into an executable Art Studio production authority rather than leaving the game as a collection of prose prompts.

It provides:

- exact campaign compilation and inventory checks;
- one family-locked batch at a time;
- one separate source image per required asset or animation cel;
- mechanical identity contracts for Bastion, Viper, Citadel and Mirage;
- exact hardpoints, asymmetry, silhouette, material and body/effect ownership rules;
- source-clip and source-cel topology;
- startup, active, hero-impact and recovery classification;
- previous/next-frame conditioning for animation continuity;
- current runtime-slot and planned runtime-slot bindings;
- deterministic detection of current shared-cell collisions;
- the locked Branka + Bastion + Foundry Nine style proof;
- read-only MCP tools suitable for ChatGPT, Claude or another authorised client;
- a hash-bound target-repository handoff template;
- dedicated CI evidence.

It does not generate or approve art on its own. Candidate generation, source editing, human approval, atlas assembly and target-repository integration remain separately authorised stages.

## Canonical files

```text
config/game-art-campaign.heavy-metal-fighting.v1.json
config/game-art-campaign.heavy-metal-fighting.v1.payload.b64.part-001 ... part-006
config/heavy-metal-fighting/mechanical-sprite-contract.v1.json
scripts/heavy-metal-fighting/mechanical-contract.mjs
scripts/heavy-metal-fighting/studio-core.mjs
scripts/heavy-metal-fighting/studio-runtime.mjs
scripts/heavy-metal-fighting-art-studio.mjs
scripts/heavy-metal-fighting-art-studio-mcp.mjs
config/mcp.heavy-metal-fighting-art-studio.windows.example.json
```

The campaign bundle owns the exact 1,157 work-unit inventory and 119 production batches. The mechanical contract adds the information that a generic game-art campaign cannot infer safely: Frame construction, joints, hardpoints, mirrored asymmetry, source-cel topology, runtime-slot mappings and style-proof requirements.

## Critical source-cel distinction

The campaign contains exactly **120 authored source cels per Frame**. Those source cels are not numerically identical to the current runtime atlas slots.

### Current implemented runtime map

The current game contract maps the source cels into:

```text
104 unique runtime slots
16 reserved runtime slots
4 shared boundary slots: 24, 44, 64 and 84
```

Each shared boundary slot binds two separate authored source cels. For example:

```text
Rivet Driver final recovery source cel -> current slot 24
GRAVEBELL first startup source cel     -> current slot 24
```

Art Studio must retain both source cels. It must not merge or discard one merely because the implemented runtime currently shares the destination slot.

### Planned atlas-v2 map

The planned map assigns every source cel to one unique runtime slot:

```text
120 authored source cels
120 mapped runtime slots
0 reserved slots
0 collisions
```

The proposed utility slots are:

| Slot | Planned semantic |
| ---: | --- |
| 34 | walk contact B |
| 35 | walk passing B |
| 54 | block impact |
| 55 | guard crush |
| 74 | jump apex or fall |
| 75 | landing compression |
| 94 | heavy or counter stagger |
| 95 | wall or air impact |
| 105 | CORE empty / SYSTEM DOWN |
| 106 | CORE restart / REIGNITION |
| 107 | heat vent |
| 117 | entrance or taunt |

This map remains `planned-not-authoritative`. Art Studio may produce and review the source studies, but it cannot promote them into the game until the live game animation library, fallback atlases, exporter and regression tests migrate together.

## Mechanical identity contract

Every launch Frame records:

- Pilot, affiliation, crew requirement, target height and CORE type;
- unique motion identity;
- silhouette locks;
- limited material ramps;
- eighteen required mechanical landmarks;
- declared weapon, cooling, anchor and service hardpoints;
- asymmetrical components and their mirror treatment;
- body-owned and effect-owned visual elements;
- forbidden visual substitutions;
- Frame-specific animation rules.

The required universal landmarks are:

```text
sensor centre
core centre
Pilot capsule centre
left/right shoulder
left/right elbow
left/right wrist mount
left/right hip
left/right knee
left/right ankle
left/right foot contact
primary cooling centre
```

The contract fails closed when a required landmark disappears, a hardpoint references an unknown attachment, body and effect ownership overlap, an asymmetrical Frame claims unconditional mirror safety, or the runtime-slot maps drift.

## Source clip topology

Every Frame has thirteen authored source clips:

| Ordinal | Semantic | Source cels | Current slots | Planned slots |
| ---: | --- | ---: | --- | --- |
| 0 | neutral and throws | 16 | 0–15 | 0–15 |
| 1 | standing light | 9 | 16–24 | 16–24 |
| 2 | standing heavy | 9 | 24–32 | 25–33 |
| 3 | crouch light | 9 | 36–44 | 36–44 |
| 4 | crouch heavy | 9 | 44–52 | 45–53 |
| 5 | jump light | 9 | 56–64 | 56–64 |
| 6 | jump heavy | 9 | 64–72 | 65–73 |
| 7 | special A | 9 | 76–84 | 76–84 |
| 8 | special B | 9 | 84–92 | 85–93 |
| 9 | high-output A | 9 | 96–104 | 96–104 |
| 10 | high-output B | 9 | 108–116 | 108–116 |
| 11 | planned utility studies | 12 | none | 34, 35, 54, 55, 74, 75, 94, 95, 105, 106, 107, 117 |
| 12 | victory and defeat | 2 | 118–119 | 118–119 |

A source cel records both mappings explicitly:

```json
{
  "sourceIndex": 25,
  "sourceClipOrdinal": 2,
  "clipSemantic": "standing-heavy",
  "frameIndex": 0,
  "currentRuntimeSlots": [24],
  "plannedRuntimeSlots": [25]
}
```

This prevents prompt ordering, source ordering and runtime atlas ordering from being accidentally conflated.

## Animation review model

For every nine-cel combat bank, the adapter classifies:

```text
0 startup
1 startup
2 startup
3 active entry
4 hero impact
5 active overshoot
6 recoil
7 vulnerable recovery
8 return or bridge
```

Every source cel also receives:

- canonical Frame identity binding;
- mechanical-landmark contract binding;
- material-ramp binding;
- previous approved source-cel ID;
- next approved source-cel ID;
- pivot and native canvas;
- current and planned runtime slot bindings;
- ground-contact expectation;
- mirror-review requirement;
- body/effect-separation requirement;
- named-human approval requirement.

A provider can therefore receive one bounded cel with the correct neighbours and identity references. It does not need to redraw an entire sheet when one source cel fails.


## Operating the adapter

Command-line, MCP, approval, validation and production-run instructions are maintained in [`HEAVY_METAL_FIGHTING_ART_STUDIO_OPERATIONS.md`](HEAVY_METAL_FIGHTING_ART_STUDIO_OPERATIONS.md).
