"use client";

import type {
  ArtBrief,
  CapabilityDefinition,
  ProductionPlan,
} from "@evavo/art-contracts";
import { useMemo, useState } from "react";

interface StudioWorkspaceProps {
  readonly capabilities: readonly CapabilityDefinition[];
  readonly initialBrief: ArtBrief;
}

type CompileState =
  | Readonly<{ status: "idle" }>
  | Readonly<{ status: "loading" }>
  | Readonly<{ status: "error"; message: string }>
  | Readonly<{ status: "ready"; plan: ProductionPlan }>;

function countGates(plan: ProductionPlan): number {
  return Object.values(plan.qualityGates).reduce(
    (total, gates) => total + gates.length,
    0,
  );
}

function countSpriteFrames(plan: ProductionPlan): number {
  return (plan.spriteBlueprints ?? []).reduce(
    (total, blueprint) => total + blueprint.totalFrames,
    0,
  );
}

export default function StudioWorkspace({
  capabilities,
  initialBrief,
}: StudioWorkspaceProps) {
  const [source, setSource] = useState(() =>
    JSON.stringify(initialBrief, null, 2),
  );
  const [state, setState] = useState<CompileState>({ status: "idle" });
  const capabilityGroups = useMemo(() => {
    return capabilities.reduce<Record<string, CapabilityDefinition[]>>(
      (groups, capability) => {
        (groups[capability.workerClass] ??= []).push(capability);
        return groups;
      },
      {},
    );
  }, [capabilities]);

  async function compilePlan(): Promise<void> {
    setState({ status: "loading" });
    try {
      const parsed: unknown = JSON.parse(source);
      const response = await fetch("/api/plans", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const message =
          payload && typeof payload === "object" && "error" in payload
            ? JSON.stringify(payload.error, null, 2)
            : `Plan compilation failed with HTTP ${response.status}.`;
        throw new Error(message);
      }
      setState({ status: "ready", plan: payload as ProductionPlan });
    } catch (error: unknown) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return (
    <section
      className="workspace"
      id="compiler"
      aria-labelledby="compiler-title"
    >
      <div className="section-heading section-heading--compact">
        <p className="eyebrow">Work-order compiler</p>
        <h2 id="compiler-title">Turn intent into governed production.</h2>
        <p>
          Edit the portable brief and compile canonical identities, direction
          masters, key poses, frame conditioning, layer treatment, exact timing,
          blocking quality gates and engine-ready delivery. The same contract is
          accepted by the REST API, CLI and MCP server.
        </p>
      </div>

      <div className="workspace__grid">
        <div className="editor-panel">
          <div className="panel-head">
            <div>
              <span>ART BRIEF</span>
              <strong>JSON / v1.0</strong>
            </div>
            <button
              type="button"
              onClick={() =>
                setSource(JSON.stringify(initialBrief, null, 2))
              }
            >
              Reset example
            </button>
          </div>
          <label className="sr-only" htmlFor="art-brief">
            Art brief JSON
          </label>
          <textarea
            id="art-brief"
            spellCheck={false}
            value={source}
            onChange={(event: { target: { value: string } }) => setSource(event.target.value)}
          />
          <div className="editor-panel__actions">
            <button
              className="button button--primary"
              type="button"
              onClick={compilePlan}
              disabled={state.status === "loading"}
            >
              {state.status === "loading"
                ? "Compiling…"
                : "Compile production plan"}
            </button>
            <span>
              No provider call is made. Continuity is locked before generation.
            </span>
          </div>
        </div>

        <div className="result-panel" aria-live="polite">
          {state.status === "idle" ? <EmptyResult /> : null}
          {state.status === "loading" ? <LoadingResult /> : null}
          {state.status === "error" ? (
            <ErrorResult message={state.message} />
          ) : null}
          {state.status === "ready" ? <PlanResult plan={state.plan} /> : null}
        </div>
      </div>

      <div className="capability-map" aria-label="Capability worker map">
        {Object.entries(capabilityGroups).map(([workerClass, entries]) => (
          <article key={workerClass}>
            <div>
              <span>{workerClass}</span>
              <strong>{entries.length}</strong>
            </div>
            <ul>
              {entries.map((entry) => (
                <li key={entry.id}>
                  <i className={entry.deterministic ? "is-deterministic" : ""} />
                  <span>
                    <b>{entry.label}</b>
                    <small>{entry.id}</small>
                  </span>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}

function EmptyResult() {
  return (
    <div className="result-empty">
      <span>PLAN / READY</span>
      <div className="result-empty__mark" aria-hidden="true">
        +
      </div>
      <h3>Compile the example brief</h3>
      <p>
        The result will show continuity blueprints, source frames, layer
        decisions, work dependencies, blocking gates and delivery outputs.
      </p>
    </div>
  );
}

function LoadingResult() {
  return (
    <div className="result-empty">
      <span>PLAN / COMPILING</span>
      <div
        className="result-empty__mark result-empty__mark--loading"
        aria-hidden="true"
      >
        ◌
      </div>
      <h3>Building the work graph</h3>
      <p>
        Resolving canonical identities, directions, key poses, layer treatment,
        exact timing, repair scopes and quality evidence.
      </p>
    </div>
  );
}

function ErrorResult({ message }: Readonly<{ message: string }>) {
  return (
    <div className="result-error">
      <span>BRIEF / REJECTED</span>
      <h3>Correct the production contract</h3>
      <pre>{message}</pre>
    </div>
  );
}

function PlanResult({ plan }: Readonly<{ plan: ProductionPlan }>) {
  const gates = countGates(plan);
  const automatic = plan.workItems.filter(
    (item) => item.approval === "automatic",
  ).length;
  const spriteBlueprints = plan.spriteBlueprints ?? [];
  const frames = countSpriteFrames(plan);

  return (
    <div className="plan-result">
      <div className="plan-result__head">
        <div>
          <span>COMPILED PLAN</span>
          <h3>{plan.projectName}</h3>
        </div>
        <b>{plan.id}</b>
      </div>

      <div className="plan-result__metrics">
        <article>
          <small>Work items</small>
          <strong>{plan.workItems.length}</strong>
        </article>
        <article>
          <small>Sprite families</small>
          <strong>{spriteBlueprints.length}</strong>
        </article>
        <article>
          <small>Planned frames</small>
          <strong>{frames}</strong>
        </article>
        <article>
          <small>Quality gates</small>
          <strong>{gates}</strong>
        </article>
        <article>
          <small>Deliverables</small>
          <strong>{plan.deliverables.length}</strong>
        </article>
      </div>

      {plan.warnings.length ? (
        <div className="plan-result__warnings">
          <span>Planner notes</span>
          {plan.warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </div>
      ) : null}

      {spriteBlueprints.length ? (
        <section
          className="plan-result__list"
          aria-labelledby="sprite-blueprints-title"
        >
          <div className="plan-result__list-head">
            <span id="sprite-blueprints-title">Sprite continuity</span>
            <small>
              first {Math.min(4, spriteBlueprints.length)} of{" "}
              {spriteBlueprints.length}
            </small>
          </div>
          {spriteBlueprints.slice(0, 4).map((blueprint, index) => {
            const independentLayers = blueprint.layers.filter((layer) =>
              ["layer-frames", "engine-sidecar"].includes(
                layer.exportPolicy,
              ),
            ).length;
            return (
              <article key={blueprint.id}>
                <b>{String(index + 1).padStart(2, "0")}</b>
                <div>
                  <strong>
                    {blueprint.assetInstanceId} · {blueprint.productionMethod}
                  </strong>
                  <span>
                    canonical {blueprint.canonicalInstanceId} ·{" "}
                    {blueprint.directions.length} ×{" "}
                    {blueprint.framesPerDirection} frames ·{" "}
                    {blueprint.layers.length} layers · {independentLayers}{" "}
                    independent
                  </span>
                </div>
                <i>
                  {blueprint.shot.safePadding}px · crop{" "}
                  {blueprint.shot.allowCrop ? "allowed" : "blocked"}
                </i>
              </article>
            );
          })}
        </section>
      ) : null}

      <div className="plan-result__list">
        <div className="plan-result__list-head">
          <span>Execution preview</span>
          <small>first 12 of {plan.workItems.length}</small>
        </div>
        {plan.workItems.slice(0, 12).map((item, index) => (
          <article key={item.id}>
            <b>{String(index + 1).padStart(2, "0")}</b>
            <div>
              <strong>{item.title}</strong>
              <span>
                {item.stage} · {item.requiredCapabilities.join(", ")}
              </span>
            </div>
            <i>{item.approval}</i>
          </article>
        ))}
      </div>

      <p className="plan-result__automation">
        {automatic} stages can run automatically, but no blocking threshold is
        removed and repairs stay scoped to the failed asset, frame, layer or
        derivative.
      </p>
    </div>
  );
}
