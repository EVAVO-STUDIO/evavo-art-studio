import {
  listArtDirectionOutputProfiles,
  listArtDirectionPresets,
} from "@evavo/art-direction";
import { ART_STUDIO_PROTOCOL_VERSION } from "@evavo/art-contracts";
import { CAPABILITY_CATALOG } from "@evavo/art-core";

import { DEFAULT_ART_DIRECTION_REQUEST } from "../lib/defaultArtDirection";
import { DEFAULT_ART_BRIEF } from "../lib/defaultBrief";
import ArtDirectionWorkbench from "./art-direction-workbench";
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
    "Evidence-backed",
    "Decoded pixels, hashes, parameters, source lineage, deterministic tool versions and every quality result travel with the asset.",
  ],
  [
    "More, correctly",
    "The planner calculates the complete asset family and world coverage rather than stopping at a few showcase images.",
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
          <a href="#compiler">Production</a>
          <a href="#frame-qa">Frame QA</a>
          <a href="#sequence-qa">Sequence QA</a>
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
            A project-aware studio for sprites, animation, environments,
            particles, cinematics, interfaces, print masters and engine-ready
            delivery. It treats model output as raw material, never as finished
            art.
          </p>
          <div className="hero__actions">
            <a className="button button--primary" href="#art-direction">
              Lock the art direction
            </a>
            <a className="button" href="#compiler">
              Compile production work
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
            <span>CONTINUITY</span>
            <b>CANONICAL</b>
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
            The control plane compiles explicit work and delegates only bounded
            frame or layer capabilities. The production record stays stable even
            when providers, machines or models change.
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
      <StudioWorkspace
        capabilities={CAPABILITY_CATALOG}
        initialBrief={DEFAULT_ART_BRIEF}
      />
      <SpriteQualityWorkbench />
      <SpriteSequenceWorkbench />

      <section className="quality" id="quality">
        <div className="section-heading">
          <p className="eyebrow">Quality contract</p>
          <h2>Transparent means transparent.</h2>
          <p>
            Final approval requires measured evidence, not a convincing thumbnail
            or a provider claim.
          </p>
        </div>
        <div className="quality__grid">
          <article>
            <span className="quality__code">ALPHA / 01</span>
            <h3>Real channel proof</h3>
            <p>
              Alpha presence, coverage, hidden transparent colour, fake
              checkerboards, flat mattes and edge contamination are decoded
              independently.
            </p>
          </article>
          <article>
            <span className="quality__code">MOTION / 02</span>
            <h3>Stable animation</h3>
            <p>
              Canvas, pivot, baseline, ground contact, exact timing, frame order,
              declared holds and gross area drift are checked across the full
              sequence.
            </p>
          </article>
          <article>
            <span className="quality__code">ATLAS / 03</span>
            <h3>Source before packing</h3>
            <p>
              Individual lossless frames and editable layers remain authoritative.
              Packed sheets and atlases are reproducible derivatives with governed
              padding and manifests.
            </p>
          </article>
          <article>
            <span className="quality__code">STYLE / 04</span>
            <h3>Family consistency</h3>
            <p>
              Silhouette, palette, line, material, composition, camera and identity
              rules remain blocking until dedicated vision workers emit measured
              evidence.
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
