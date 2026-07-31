"use client";

import {
  SPRITE_COVERAGE_LEVELS,
  SPRITE_FIDELITY_LEVELS,
  SPRITE_GAMEPLAY_PROFILES,
  SPRITE_PLAN_ROLES,
  type CompiledSpritePlanJob,
  type CompiledSpriteProductionPlan,
  type SpritePlanCompileRequestInput,
} from "@evavo/art-sprite-planner";
import { useMemo, useState } from "react";

import styles from "./sprite-planner-workbench.module.css";

interface SpritePlannerWorkbenchProps {
  readonly initialRequest: SpritePlanCompileRequestInput;
}

type CompilePayload = Readonly<{
  schemaVersion: "1.0";
  compiledPlan: CompiledSpriteProductionPlan;
  compiledJob: CompiledSpritePlanJob;
  executionBoundary: string;
}>;

type CompileState =
  | Readonly<{ status: "idle" }>
  | Readonly<{ status: "loading" }>
  | Readonly<{ status: "error"; message: string }>
  | Readonly<{ status: "ready"; payload: CompilePayload }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pretty(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function downloadJson(fileName: string, value: unknown): void {
  const blob = new Blob([`${pretty(value)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function title(value: string): string {
  return value
    .split("-")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

export default function SpritePlannerWorkbench({
  initialRequest,
}: SpritePlannerWorkbenchProps) {
  const initialSource = useMemo(() => pretty(initialRequest), [initialRequest]);
  const [source, setSource] = useState(initialSource);
  const [state, setState] = useState<CompileState>({ status: "idle" });

  const parsedRequest = useMemo(() => {
    try {
      return JSON.parse(source) as unknown;
    } catch {
      return null;
    }
  }, [source]);

  const selectedRole =
    isRecord(parsedRequest) && typeof parsedRequest.role === "string"
      ? parsedRequest.role
      : null;
  const selectedProfile =
    isRecord(parsedRequest) && typeof parsedRequest.gameplayProfile === "string"
      ? parsedRequest.gameplayProfile
      : null;
  const selectedCoverage =
    isRecord(parsedRequest) && typeof parsedRequest.coverage === "string"
      ? parsedRequest.coverage
      : null;
  const selectedFidelity =
    isRecord(parsedRequest) && typeof parsedRequest.fidelity === "string"
      ? parsedRequest.fidelity
      : null;

  function updateSource(
    updater: (request: Record<string, unknown>) => Record<string, unknown>,
  ): void {
    try {
      const parsed = JSON.parse(source) as unknown;
      if (!isRecord(parsed)) throw new Error("The request must be a JSON object.");
      setSource(pretty(updater(parsed)));
      setState({ status: "idle" });
    } catch (error: unknown) {
      setState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "The sprite plan must be valid JSON before using visual controls.",
      });
    }
  }

  function setField(field: string, value: string): void {
    updateSource((request) => ({ ...request, [field]: value }));
  }

  async function compile(): Promise<void> {
    setState({ status: "loading" });
    try {
      const request: unknown = JSON.parse(source);
      const response = await fetch("/api/sprite-plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const message =
          isRecord(payload) && isRecord(payload.error)
            ? pretty(payload.error)
            : `Sprite planning failed with HTTP ${response.status}.`;
        throw new Error(message);
      }
      setState({ status: "ready", payload: payload as CompilePayload });
    } catch (error: unknown) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return (
    <section className={`workspace ${styles.workbench}`} id="sprite-planner">
      <div className="section-heading section-heading--compact">
        <p className="eyebrow">Complete sprite production planner</p>
        <h2>Know every sprite before generating one.</h2>
        <p>
          Infer role, genre and feature-specific animation coverage, every facing,
          exact frames and key poses, retained layers, runtime variants, sprite
          sheets, atlases, Aseprite source metadata and Godot SpriteFrames output.
        </p>
      </div>

      <div className={styles.controlGrid}>
        <Selector
          label="Role"
          values={SPRITE_PLAN_ROLES}
          selected={selectedRole}
          onSelect={(value) => setField("role", value)}
        />
        <Selector
          label="Gameplay profile"
          values={SPRITE_GAMEPLAY_PROFILES}
          selected={selectedProfile}
          onSelect={(value) => setField("gameplayProfile", value)}
        />
        <Selector
          label="Coverage"
          values={SPRITE_COVERAGE_LEVELS}
          selected={selectedCoverage}
          onSelect={(value) => setField("coverage", value)}
        />
        <Selector
          label="Fidelity"
          values={SPRITE_FIDELITY_LEVELS}
          selected={selectedFidelity}
          onSelect={(value) => setField("fidelity", value)}
        />
      </div>

      <div className={styles.workspaceGrid}>
        <div className="editor-panel">
          <div className="panel-head">
            <div>
              <span>SPRITE FAMILY REQUEST</span>
              <strong>JSON / COMPLETE COVERAGE</strong>
            </div>
            <button
              type="button"
              onClick={() => {
                setSource(initialSource);
                setState({ status: "idle" });
              }}
            >
              Reset example
            </button>
          </div>
          <label className="sr-only" htmlFor="sprite-plan-request">
            Complete sprite plan request JSON
          </label>
          <textarea
            id="sprite-plan-request"
            spellCheck={false}
            value={source}
            onChange={(event: { target: { value: string } }) => {
              setSource(event.target.value);
              setState({ status: "idle" });
            }}
          />
          <div className="editor-panel__actions">
            <button
              className="button button--primary"
              type="button"
              onClick={compile}
              disabled={state.status === "loading"}
            >
              {state.status === "loading"
                ? "Calculating…"
                : "Compile complete sprite family"}
            </button>
            <span>
              Provider-free. Sheets and atlases remain derivatives of retained
              frames and editable layers.
            </span>
          </div>
        </div>

        <div className={`result-panel ${styles.result}`} aria-live="polite">
          {state.status === "idle" ? <Idle /> : null}
          {state.status === "loading" ? <Loading /> : null}
          {state.status === "error" ? <Failure message={state.message} /> : null}
          {state.status === "ready" ? (
            <PlanResult
              payload={state.payload}
              onDownload={(kind) => {
                if (kind === "plan") {
                  downloadJson(
                    `${state.payload.compiledPlan.planId}.sprite-plan.json`,
                    state.payload.compiledPlan,
                  );
                } else {
                  downloadJson(
                    `${state.payload.compiledPlan.planId}.sprite-plan-job.json`,
                    state.payload.compiledJob,
                  );
                }
              }}
            />
          ) : null}
        </div>
      </div>
    </section>
  );
}

function Selector({
  label,
  values,
  selected,
  onSelect,
}: Readonly<{
  label: string;
  values: readonly string[];
  selected: string | null;
  onSelect: (value: string) => void;
}>) {
  return (
    <article className={styles.selector}>
      <span>{label}</span>
      <div>
        {values.map((value) => (
          <button
            key={value}
            type="button"
            data-active={selected === value}
            onClick={() => onSelect(value)}
          >
            {title(value)}
          </button>
        ))}
      </div>
    </article>
  );
}

function Idle() {
  return (
    <div className="result-empty">
      <span>SPRITES / READY</span>
      <div className="result-empty__mark" aria-hidden="true">
        8
      </div>
      <h3>Compile the complete family</h3>
      <p>
        The result will show every direction, inferred clip, frame, layer,
        variant strategy, sheet page, atlas page and Godot resource before
        generation begins.
      </p>
    </div>
  );
}

function Loading() {
  return (
    <div className="result-empty">
      <span>SPRITES / CALCULATING</span>
      <div
        className="result-empty__mark result-empty__mark--loading"
        aria-hidden="true"
      >
        ◌
      </div>
      <h3>Building the production matrix</h3>
      <p>
        Resolving direction authorship, role and gameplay clips, exact timing,
        layers, variants, source sheets, atlas pages and Godot bindings.
      </p>
    </div>
  );
}

function Failure({ message }: Readonly<{ message: string }>) {
  return (
    <div className="result-error">
      <span>SPRITES / REJECTED</span>
      <h3>Correct the family contract</h3>
      <pre>{message}</pre>
    </div>
  );
}

function PlanResult({
  payload,
  onDownload,
}: Readonly<{
  payload: CompilePayload;
  onDownload: (kind: "plan" | "job") => void;
}>) {
  const plan = payload.compiledPlan;
  const authoredDirections = plan.directions.filter((entry) => entry.authored);
  const derivedDirections = plan.directions.filter((entry) => !entry.authored);
  const requiredLayers = plan.layers.filter((entry) => entry.required);

  return (
    <div className={styles.plan}>
      <div className={styles.planHead}>
        <div>
          <span>COMPLETE SPRITE PLAN</span>
          <h3>{plan.asset.assetId}</h3>
          <p>
            {title(plan.role)} · {title(plan.gameplayProfile)} · {title(plan.coverage)}
          </p>
        </div>
        <div className={styles.downloads}>
          <button type="button" onClick={() => onDownload("plan")}>
            Plan JSON
          </button>
          <button type="button" onClick={() => onDownload("job")}>
            Job JSON
          </button>
        </div>
      </div>

      <div className={styles.metrics}>
        <Metric label="Directions" value={plan.directions.length} />
        <Metric label="Animation clips" value={plan.totals.clips} />
        <Metric label="Runtime frames" value={plan.totals.runtimeFrames} />
        <Metric label="Authored frames" value={plan.totals.authoredFrames} />
        <Metric label="Layer sources" value={plan.totals.layerSourceUnits} />
        <Metric label="Sheet pages" value={plan.totals.sheets} />
      </div>

      <section className={styles.block}>
        <Heading code="DIR / 01" title="Direction authorship" />
        <div className={styles.directionGrid}>
          {plan.directions.map((direction) => (
            <article key={direction.name} data-authored={direction.authored}>
              <b>{direction.index + 1}</b>
              <div>
                <strong>{direction.name}</strong>
                <span>
                  {direction.authored
                    ? "authored master"
                    : `derived from ${direction.mirrorOf}`}
                </span>
              </div>
            </article>
          ))}
        </div>
        <p className={styles.boundary}>
          {authoredDirections.length} authored direction masters ·{" "}
          {derivedDirections.length} safe derived directions. Held items,
          asymmetry and swappable equipment force independent authorship.
        </p>
      </section>

      <section className={styles.block}>
        <Heading code="CLIPS / 02" title="Role and gameplay animation matrix" />
        <div className={styles.clipTable}>
          {plan.clips.map((clip) => (
            <article key={clip.id}>
              <div>
                <strong>{clip.id}</strong>
                <span>{clip.category}</span>
              </div>
              <b>{clip.framesPerDirection} × {clip.directionNames.length}</b>
              <p>{clip.reason}</p>
              <small>
                {clip.framesPerSecond} fps · {clip.loopMode} · key poses{" "}
                {clip.keyPoseFrames.join(", ")} · {clip.runtimeFrameCount} runtime
                frames
              </small>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.block}>
        <Heading code="LAYERS / 03" title="Retained layers and runtime variants" />
        <div className={styles.layerTable}>
          {plan.layers.map((layer) => (
            <article key={layer.role} data-required={layer.required}>
              <div>
                <strong>{layer.role}</strong>
                <span>{layer.treatment}</span>
              </div>
              <p>{layer.reason}</p>
              <small>
                {layer.minimumUniqueSourceUnits}–{layer.maximumSourceUnits} source
                units · {layer.runtimeBindings} runtime bindings · variants{" "}
                {layer.variantCount}
              </small>
            </article>
          ))}
        </div>
        <div className={styles.variantGrid}>
          {plan.variants.strategies.map((strategy) => (
            <article key={strategy.kind}>
              <span>{strategy.kind}</span>
              <strong>{strategy.count} · {strategy.strategy}</strong>
              <p>{strategy.reason}</p>
            </article>
          ))}
        </div>
        <p className={styles.boundary}>
          {requiredLayers.length} required layer contracts ·{" "}
          {plan.variants.runtimeCombinations} runtime combinations without
          flattening {plan.variants.flattenedFullFamilyCombinations} complete
          frame variants.
        </p>
      </section>

      <section className={styles.block}>
        <Heading code="DELIVERY / 04" title="Sheets, atlas, Aseprite and Godot" />
        <div className={styles.deliveryGrid}>
          <article>
            <span>Per-clip sheets</span>
            <strong>{plan.sheets.length}</strong>
            <p>
              Fixed-cell, no-rotation review and runtime derivatives with JSON
              coverage manifests.
            </p>
          </article>
          <article>
            <span>Family atlas</span>
            <strong>{plan.atlas.estimatedPages} pages</strong>
            <p>
              {plan.atlas.packing} · {plan.atlas.paddingPixels}px padding ·{" "}
              {plan.atlas.extrusionPixels}px extrusion.
            </p>
          </article>
          <article>
            <span>Aseprite source</span>
            <strong>{plan.aseprite.tags.length} tags</strong>
            <p>
              {plan.aseprite.slices.length} slices preserve pivot, ground contact,
              footprint and safe bounds.
            </p>
          </article>
          <article>
            <span>Godot</span>
            <strong>{plan.godot.animations.length} animations</strong>
            <p>
              {plan.godot.primaryNode} · {plan.godot.layerNodes.length} sibling
              layer nodes · exact duration multipliers.
            </p>
          </article>
        </div>
      </section>

      <section className={styles.block}>
        <Heading code="GATES / 05" title="What blocks incomplete production" />
        <div className={styles.gates}>
          {plan.qualityGates.map((gate) => (
            <article key={gate.id} data-severity={gate.severity}>
              <div>
                <span>{gate.severity}</span>
                <strong>{gate.id}</strong>
                <b>{gate.expected === undefined ? "evidence" : String(gate.expected)}</b>
              </div>
              <p>{gate.description}</p>
            </article>
          ))}
        </div>
      </section>

      {plan.warnings.length ? (
        <section className={styles.warnings}>
          <strong>Planning warnings</strong>
          {plan.warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </section>
      ) : null}

      <footer className={styles.hashes}>
        <span>request {plan.requestSha256}</span>
        <span>plan {plan.planSha256}</span>
        <span>{payload.compiledJob.runtimeJob.kind}</span>
      </footer>
    </div>
  );
}

function Heading({ code, title: text }: Readonly<{ code: string; title: string }>) {
  return (
    <div className={styles.blockHead}>
      <span>{code}</span>
      <h4>{text}</h4>
    </div>
  );
}

function Metric({ label, value }: Readonly<{ label: string; value: number }>) {
  return (
    <article>
      <small>{label}</small>
      <strong>{value.toLocaleString()}</strong>
    </article>
  );
}
