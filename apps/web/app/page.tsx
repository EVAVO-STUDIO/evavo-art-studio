import {
  listArtDirectionOutputProfiles,
  listArtDirectionPresets,
} from "@evavo/art-direction";
import { ART_STUDIO_PROTOCOL_VERSION } from "@evavo/art-contracts";
import { CAPABILITY_CATALOG } from "@evavo/art-core";

import { DEFAULT_ART_DIRECTION_REQUEST } from "../lib/defaultArtDirection";
import { DEFAULT_ART_BRIEF } from "../lib/defaultBrief";
import { DEFAULT_SPRITE_PLAN_REQUEST } from "../lib/defaultSpritePlan";
import ArtDirectionWorkbench from "./art-direction-workbench";
import SpritePlannerWorkbench from "./sprite-planner-workbench";
import SpriteQualityWorkbench from "./sprite-quality-workbench";
import SpriteSequenceWorkbench from "./sprite-sequence-workbench";
import StudioWorkspace from "./studio-workspace";

const principles = [
  [
    "Project-aware",
    "Inspect the game, current assets, target engine and design language before proposing production work.",
  ],
  [
    "Continuity-locked",
    "Canonical identity, direction masters, key poses, layers, pivots and exact timing are compiled before provider work.",
  ],
  [
    "Coverage-complete",
    "Role, genre and gameplay features expand into every required direction, clip, frame, variant, layer and delivery output.",
  ],
  [
    "Evidence-backed",
    "Decoded pixels, hashes, parameters, source lineage, deterministic tool versions and every quality result travel with the asset.",
  ],
] as const;

export default function HomePage() {
  const presets = listArtDirectionPresets();
  const outputProfiles = listArtDirectionOutputProfiles();
  const workerGroups = Object.entries(
    CAPABILITY_CATALOG.reduce<Record<string, number>>((groups, capability) => {
      groups[capability.workerClass] =
        (groups[capability.workerClass] ?? 0) + 1;
      return groups;
    }, {}),
  );

  return (
    <main>
      <header className="topbar">
        <a className="wordmark" href="#top" aria-label="EVAVO Art Studio home">
          <span>EVAVO</span>
          <strong>ART STUDIO</strong>
        </a>
        <nav aria-label="Studio sections">
          <a href="#art-direction">Art direction</a>
          <a href="#sprite-planner">Sprite family</a>
          <a href="#compiler">Production</a>
          <a href="#frame-qa">Frame QA</a>
          <a href="/operations">Operations</a>
        </nav>
        <span className="status">
          <i /> Foundation online
        </span>
      </header>

      <section className="hero" id="top">
        <div className="hero__copy">
          <p className="eyebrow">Governed art-production control plane</p>
          <h1>
            Craft the whole visual system. <em>Prove every asset.</em>
          </h1>
          <p className="lede">
            A project-aware studio for complete sprite families, animation,
            environments, particles, cinematics, interfaces, print masters and
            engine-ready delivery. It treats model output as raw material, never
            as finished art.
          </p>
          <div className="hero__actions">
            <a className="button button--primary" href="#art-direction">
              Lock the art direction
            </a>
            <a className="button" href="#sprite-planner">
              Plan every sprite
            </a>
            <a className="button" href="#frame-qa">
              Inspect source pixels
            </a>
            <a className="button" href="/operations">
              Open runtime operations
            </a>
          </div>
        </div>
        <div
          className="hero__instrument"
          aria-label="Art Studio foundation status"
        >
          <div className="instrument__head">
            <span>Production kernel</span>
            <strong>{ART_STUDIO_PROTOCOL_VERSION}</strong>
          </div>
          <div className="instrument__readout">
            <span>ART DIRECTION</span>
            <b>LOCKED</b>
            <span>SPRITE COVERAGE</span>
            <b>COMPLETE</b>
            <span>PIXEL QA</span>
            <b>EXECUTABLE</b>
            <span>AUTONOMY</span>
            <b>POLICY GATED</b>
          </div>
          <div className="instrument__trace" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
        </div>
      </section>

      <section className="metrics" aria-label="Foundation metrics">
        <article>
          <small>Declared capabilities</small>
          <strong>{CAPABILITY_CATALOG.length}</strong>
          <span>control, media, vision, provider and engine work</span>
        </article>
        <article>
          <small>Style presets</small>
          <strong>{presets.length}</strong>
          <span>period and production-method contracts</span>
        </article>
        <article>
          <small>Output profiles</small>
          <strong>{outputProfiles.length}</strong>
          <span>Godot, web, cinematic and print delivery</span>
        </article>
        <article>
          <small>Final-output rule</small>
          <strong>QA</strong>
          <span>{workerGroups.length} isolated worker classes</span>
        </article>
      </section>

      <section className="principles" id="system">
        <div className="section-heading">
          <p className="eyebrow">Operating model</p>
          <h2>Not another prompt box.</h2>
          <p>
            The control plane locks style, calculates the complete asset family,
            and delegates only bounded frame or layer capabilities. The production
            record stays stable even when providers, machines or models change.
          </p>
        </div>
        <div className="principles__grid">
          {principles.map(([title, copy], index) => (
            <article key={title}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <h3>{title}</h3>
              <p>{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <ArtDirectionWorkbench
        initialRequest={DEFAULT_ART_DIRECTION_REQUEST}
        presets={presets}
        outputProfiles={outputProfiles}
      />
      <SpritePlannerWorkbench initialRequest={DEFAULT_SPRITE_PLAN_REQUEST} />
      <StudioWorkspace
        capabilities={CAPABILITY_CATALOG}
        initialBrief={DEFAULT_ART_BRIEF}
      />
      <SpriteQualityWorkbench />
      <SpriteSequenceWorkbench />

      <section className="quality" id="quality">
        <div className="section-heading">
          <p className="eyebrow">Quality contract</p>
          <h2>Complete means complete.</h2>
          <p>
            Final approval requires every declared direction, animation, frame,
            layer, timing record and engine binding, plus measured visual evidence.
          </p>
        </div>
        <div className="quality__grid">
          <article>
            <span className="quality__code">COVERAGE / 01</span>
            <h3>Every required state</h3>
            <p>
              Role, genre, gameplay and feature profiles compile locomotion,
              combat, interaction, damage, prop, particle, UI and portrait states
              before generation begins.
            </p>
          </article>
          <article>
            <span className="quality__code">MOTION / 02</span>
            <h3>Stable animation</h3>
            <p>
              Canvas, pivot, baseline, ground contact, exact timing, frame order,
              key poses, declared holds and loop closure are checked across the
              complete family.
            </p>
          </article>
          <article>
            <span className="quality__code">SOURCE / 03</span>
            <h3>Frames before sheets</h3>
            <p>
              Individual lossless frames, editable layers, tags and slices remain
              authoritative. Sheets and atlases are deterministic derivatives.
            </p>
          </article>
          <article>
            <span className="quality__code">ENGINE / 04</span>
            <h3>Godot-ready delivery</h3>
            <p>
              SpriteFrames names, exact duration multipliers, layer nodes, atlas
              regions, pivots, Y-sort origins and sidecar bindings remain complete
              and reproducible.
            </p>
          </article>
        </div>
      </section>

      <footer>
        <span>EVAVO Art Studio</span>
        <p>Professional art production for authored digital worlds.</p>
        <small>Control plane · protocol {ART_STUDIO_PROTOCOL_VERSION}</small>
      </footer>
    </main>
  );
}
