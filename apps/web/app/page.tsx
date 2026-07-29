
import { CAPABILITY_CATALOG } from "@evavo/art-core";

import { DEFAULT_ART_BRIEF } from "../lib/defaultBrief";
import StudioWorkspace from "./studio-workspace";

const principles = [
  ["Project-aware", "Inspect the game, current assets, target engine and design language before proposing production work."],
  ["Process-led", "Concept, selection, construction, cleanup, consistency, mastering and QA remain distinct stages."],
  ["Evidence-backed", "Hashes, parameters, source lineage, deterministic tool versions and every quality result travel with the asset."],
  ["More, correctly", "The planner calculates the complete asset family and world coverage rather than stopping at a few showcase images."],
] as const;

export default function HomePage() {
  const workerGroups = Object.entries(
    CAPABILITY_CATALOG.reduce<Record<string, number>>((groups, capability) => {
      groups[capability.workerClass] = (groups[capability.workerClass] ?? 0) + 1;
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
          <a href="#compiler">Compiler</a>
          <a href="#system">System</a>
          <a href="#quality">Quality</a>
        </nav>
        <span className="status"><i /> Foundation online</span>
      </header>

      <section className="hero" id="top">
        <div className="hero__copy">
          <p className="eyebrow">Governed art-production control plane</p>
          <h1>Craft the whole visual system. <em>Prove every asset.</em></h1>
          <p className="lede">A project-aware studio for sprites, animation, environments, particles, cinematics, interfaces, print masters and engine-ready delivery. It treats model output as raw material, never as finished art.</p>
          <div className="hero__actions">
            <a className="button button--primary" href="#compiler">Compile a production plan</a>
            <a className="button" href="#system">Review the architecture</a>
          </div>
        </div>
        <div className="hero__instrument" aria-label="Art Studio foundation status">
          <div className="instrument__head"><span>Production kernel</span><strong>0.1</strong></div>
          <div className="instrument__readout">
            <span>CONTROL</span><b>VALIDATED</b>
            <span>PROVIDERS</span><b>PLUGGABLE</b>
            <span>OUTPUTS</span><b>EVIDENCE FIRST</b>
            <span>AUTONOMY</span><b>POLICY GATED</b>
          </div>
          <div className="instrument__trace" aria-hidden="true"><span /><span /><span /><span /><span /></div>
        </div>
      </section>

      <section className="metrics" aria-label="Foundation metrics">
        <article><small>Declared capabilities</small><strong>{CAPABILITY_CATALOG.length}</strong><span>control, media, vision, provider and engine work</span></article>
        <article><small>Worker classes</small><strong>{workerGroups.length}</strong><span>isolated execution boundaries</span></article>
        <article><small>Agent surfaces</small><strong>4</strong><span>web, REST, CLI and MCP</span></article>
        <article><small>Final-output rule</small><strong>QA</strong><span>blocking gates before delivery</span></article>
      </section>

      <section className="principles" id="system">
        <div className="section-heading"><p className="eyebrow">Operating model</p><h2>Not another prompt box.</h2><p>The control plane compiles explicit work and delegates only bounded capabilities. The production record stays stable even when providers, machines or models change.</p></div>
        <div className="principles__grid">
          {principles.map(([title, copy], index) => <article key={title}><span>{String(index + 1).padStart(2, "0")}</span><h3>{title}</h3><p>{copy}</p></article>)}
        </div>
      </section>

      <StudioWorkspace capabilities={CAPABILITY_CATALOG} initialBrief={DEFAULT_ART_BRIEF} />

      <section className="quality" id="quality">
        <div className="section-heading"><p className="eyebrow">Quality contract</p><h2>Transparent means transparent.</h2><p>Final approval requires measurable evidence, not a convincing thumbnail.</p></div>
        <div className="quality__grid">
          <article><span className="quality__code">ALPHA / 01</span><h3>Real channel proof</h3><p>Alpha presence, coverage, transparent-pixel colour, fake checkerboard patterns and edge contamination are checked independently.</p></article>
          <article><span className="quality__code">MOTION / 02</span><h3>Stable animation</h3><p>Canvas, anchor, baseline, accidental duplicates, timing curves and loop closure are verified across every frame.</p></article>
          <article><span className="quality__code">ATLAS / 03</span><h3>Safe runtime packing</h3><p>Padding, extrusion, bleed, rotation policy, frame names and engine resources must agree with the manifest.</p></article>
          <article><span className="quality__code">STYLE / 04</span><h3>Family consistency</h3><p>Silhouette, palette, line, material, composition and camera rules are scored against the locked art direction and references.</p></article>
        </div>
      </section>

      <footer><span>EVAVO Art Studio</span><p>Professional art production for authored digital worlds.</p><small>Control plane foundation · protocol 2026-07-29</small></footer>
    </main>
  );
}
