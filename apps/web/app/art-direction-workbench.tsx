"use client";

import type {
  ArtDirectionCompileRequestInput,
  ArtDirectionOutputProfileDefinition,
  ArtDirectionOutputProfileId,
  ArtDirectionPresetDefinition,
  ArtDirectionPresetId,
  CompiledArtDirectionContract,
  CompiledArtDirectionJob,
} from "@evavo/art-direction";
import { useMemo, useState } from "react";

import styles from "./art-direction-workbench.module.css";

interface ArtDirectionWorkbenchProps {
  readonly initialRequest: ArtDirectionCompileRequestInput;
  readonly presets: readonly ArtDirectionPresetDefinition[];
  readonly outputProfiles: readonly ArtDirectionOutputProfileDefinition[];
}

type CompilePayload = Readonly<{
  schemaVersion: "1.0";
  compiledContract: CompiledArtDirectionContract;
  compiledJob: CompiledArtDirectionJob;
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

function requestFamily(value: unknown): string | null {
  if (!isRecord(value) || !isRecord(value.asset)) return null;
  return typeof value.asset.family === "string" ? value.asset.family : null;
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

function formatThreshold(value: number | string | boolean | undefined): string {
  if (value === undefined) return "evidence required";
  if (typeof value === "boolean") return value ? "required" : "advisory";
  return String(value);
}

export default function ArtDirectionWorkbench({
  initialRequest,
  presets,
  outputProfiles,
}: ArtDirectionWorkbenchProps) {
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
  const family = requestFamily(parsedRequest);
  const selectedPresetId =
    isRecord(parsedRequest) && typeof parsedRequest.presetId === "string"
      ? parsedRequest.presetId
      : null;
  const selectedOutputs = new Set(
    isRecord(parsedRequest) && Array.isArray(parsedRequest.outputProfileIds)
      ? parsedRequest.outputProfileIds.filter(
          (entry): entry is string => typeof entry === "string",
        )
      : [],
  );

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
            : "The request must be valid JSON before using visual controls.",
      });
    }
  }

  function selectPreset(preset: ArtDirectionPresetDefinition): void {
    updateSource((request) => {
      const asset = isRecord(request.asset) ? { ...request.asset } : {};
      const assetFamily = typeof asset.family === "string" ? asset.family : null;
      const compatibleDefaults = preset.defaultOutputProfileIds.filter((id) => {
        const profile = outputProfiles.find((entry) => entry.id === id);
        return profile && assetFamily && profile.compatibleFamilies.includes(assetFamily as never);
      });
      const fallback = outputProfiles.find(
        (profile) =>
          assetFamily && profile.compatibleFamilies.includes(assetFamily as never),
      );
      const outputs = compatibleDefaults.length
        ? compatibleDefaults
        : fallback
          ? [fallback.id]
          : request.outputProfileIds;
      asset.directionCount = preset.defaultDirections.length;
      asset.directionNames = [...preset.defaultDirections];
      return {
        ...request,
        presetId: preset.id,
        asset,
        ...(outputs ? { outputProfileIds: outputs } : {}),
      };
    });
  }

  function toggleOutput(profile: ArtDirectionOutputProfileDefinition): void {
    updateSource((request) => {
      const current = Array.isArray(request.outputProfileIds)
        ? request.outputProfileIds.filter(
            (entry): entry is string => typeof entry === "string",
          )
        : [];
      const next = current.includes(profile.id)
        ? current.filter((id) => id !== profile.id)
        : [...current, profile.id];
      if (!next.length) return request;
      return { ...request, outputProfileIds: next };
    });
  }

  async function compile(): Promise<void> {
    setState({ status: "loading" });
    try {
      const request: unknown = JSON.parse(source);
      const response = await fetch("/api/art-direction", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const message =
          isRecord(payload) && isRecord(payload.error)
            ? pretty(payload.error)
            : `Art-direction compilation failed with HTTP ${response.status}.`;
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
    <section className={`workspace ${styles.workbench}`} id="art-direction">
      <div className="section-heading section-heading--compact">
        <p className="eyebrow">Art-direction compiler</p>
        <h2>Lock the visual language before creating pixels.</h2>
        <p>
          Compile one project-specific style bible into camera, projection,
          palette, layer ownership, sprite-shot boundaries, anti-generic rules,
          Godot delivery and blocking quality evidence. Providers receive only a
          bounded frame or layer contract after this stage.
        </p>
      </div>

      <div className={styles.selectorRail} aria-label="Art direction presets">
        {presets.map((preset) => {
          const compatible =
            family === null || preset.compatibleFamilies.includes(family as never);
          return (
            <button
              className={
                selectedPresetId === preset.id
                  ? styles.presetActive
                  : styles.preset
              }
              type="button"
              key={preset.id}
              disabled={!compatible}
              onClick={() => selectPreset(preset)}
              title={compatible ? preset.description : `Not compatible with ${family}`}
            >
              <span>{preset.id}</span>
              <strong>{preset.title}</strong>
              <small>{preset.description}</small>
            </button>
          );
        })}
      </div>

      <div className={styles.outputRail} aria-label="Output profiles">
        {outputProfiles.map((profile) => {
          const compatible =
            family === null || profile.compatibleFamilies.includes(family as never);
          return (
            <button
              type="button"
              key={profile.id}
              disabled={!compatible}
              className={selectedOutputs.has(profile.id) ? styles.outputActive : styles.output}
              onClick={() => toggleOutput(profile)}
            >
              <span>{profile.target}</span>
              <strong>{profile.title}</strong>
              <small>
                {profile.textureFiltering} · {profile.masterFormats[0]}
              </small>
            </button>
          );
        })}
      </div>

      <div className={styles.workspaceGrid}>
        <div className="editor-panel">
          <div className="panel-head">
            <div>
              <span>STYLE BIBLE</span>
              <strong>JSON / {selectedPresetId ?? "CUSTOM"}</strong>
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
          <label className="sr-only" htmlFor="art-direction-request">
            Art-direction request JSON
          </label>
          <textarea
            id="art-direction-request"
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
              {state.status === "loading" ? "Compiling…" : "Compile style contract"}
            </button>
            <span>
              Same-origin and compile-only. No model, artifact promotion or
              filesystem write occurs.
            </span>
          </div>
        </div>

        <div className={`result-panel ${styles.result}`} aria-live="polite">
          {state.status === "idle" ? <Idle /> : null}
          {state.status === "loading" ? <Loading /> : null}
          {state.status === "error" ? <Failure message={state.message} /> : null}
          {state.status === "ready" ? (
            <ContractResult
              payload={state.payload}
              onDownload={(kind) => {
                if (kind === "contract") {
                  downloadJson(
                    `${state.payload.compiledContract.contractId}.art-direction.json`,
                    state.payload.compiledContract,
                  );
                } else {
                  downloadJson(
                    `${state.payload.compiledContract.contractId}.art-direction-job.json`,
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

function Idle() {
  return (
    <div className="result-empty">
      <span>STYLE / READY</span>
      <div className="result-empty__mark" aria-hidden="true">
        ◇
      </div>
      <h3>Compile the visual system</h3>
      <p>
        Review the preset, project motifs, asset grammar and delivery targets.
        The result explains what belongs in each shot, what stays separate and
        what evidence blocks inconsistent or generic output.
      </p>
    </div>
  );
}

function Loading() {
  return (
    <div className="result-empty">
      <span>STYLE / COMPILING</span>
      <div className="result-empty__mark result-empty__mark--loading" aria-hidden="true">
        ◌
      </div>
      <h3>Resolving the production method</h3>
      <p>
        Locking palette, camera, lighting, projection, motion, layer ownership,
        provider boundaries, QA and engine delivery.
      </p>
    </div>
  );
}

function Failure({ message }: Readonly<{ message: string }>) {
  return (
    <div className="result-error">
      <span>STYLE / REJECTED</span>
      <h3>Correct the art-direction contract</h3>
      <pre>{message}</pre>
    </div>
  );
}

function ContractResult({
  payload,
  onDownload,
}: Readonly<{
  payload: CompilePayload;
  onDownload: (kind: "contract" | "job") => void;
}>) {
  const contract = payload.compiledContract;
  const blocking = contract.qualityGates.filter(
    (gate) => gate.severity === "blocking",
  ).length;
  const separateLayers = contract.production.layers.filter(
    (layer) => layer.treatment !== "baked",
  ).length;

  return (
    <div className={styles.contract}>
      <div className={styles.contractHead}>
        <div>
          <span>COMPILED STYLE CONTRACT</span>
          <h3>{contract.preset.title}</h3>
          <p>{contract.project.title} · {contract.asset.assetId}</p>
        </div>
        <div className={styles.downloads}>
          <button type="button" onClick={() => onDownload("contract")}>Contract JSON</button>
          <button type="button" onClick={() => onDownload("job")}>Job JSON</button>
        </div>
      </div>

      <div className={styles.metrics}>
        <article><small>Production</small><strong>{contract.production.method}</strong></article>
        <article><small>Directions</small><strong>{contract.production.directionNames.length}</strong></article>
        <article><small>Separate layers</small><strong>{separateLayers}</strong></article>
        <article><small>Blocking gates</small><strong>{blocking}</strong></article>
        <article><small>Outputs</small><strong>{contract.outputs.length}</strong></article>
      </div>

      <section className={styles.block}>
        <Header code="STYLE / 01" title="Locked production language" />
        <div className={styles.lockGrid}>
          <Lock label="Rendering" value={contract.style.renderingMode} />
          <Lock label="Projection" value={contract.style.projection} />
          <Lock label="Palette" value={`${contract.style.palette.mode} · ${contract.style.palette.maxColours} colours`} />
          <Lock label="Pixel grid" value={contract.style.pixelGrid.enabled ? `${contract.style.pixelGrid.clusterPolicy} · ${contract.style.pixelGrid.antialias} AA` : "raster / non-pixel"} />
          <Lock label="Camera" value={`${contract.style.camera.yawDegrees}° yaw · ${contract.style.camera.pitchDegrees}° pitch`} />
          <Lock label="Lighting" value={`${contract.style.lighting.keyDirectionDegrees}° key · ${contract.style.lighting.frameVariation} variation`} />
          <Lock label="Timing" value={`${contract.style.motion.timingFeel} · exact ${String(contract.style.motion.exactFrameDurations)}`} />
          <Lock label="Mirroring" value={contract.style.camera.mirroring} />
        </div>
        <ul className={styles.reasonList}>
          {contract.production.methodReasons.map((reason) => <li key={reason}>{reason}</li>)}
        </ul>
      </section>

      <section className={styles.block}>
        <Header code="SHOT / 02" title="What belongs in the sprite" />
        <div className={styles.twoColumn}>
          <div><strong>Include</strong><ul>{contract.production.shot.include.map((item) => <li key={item}>{item}</li>)}</ul></div>
          <div><strong>Exclude</strong><ul>{contract.production.shot.exclude.map((item) => <li key={item}>{item}</li>)}</ul></div>
        </div>
        <div className={styles.shotFooter}>
          <span>{contract.production.frameUnit}</span>
          <span>{contract.production.shot.cropPolicy}</span>
          <span>{contract.production.shot.safePaddingPixels}px safety</span>
          <span>pivot {contract.production.pivot.x},{contract.production.pivot.y}</span>
          <span>Y-sort {contract.production.ySortOrigin.x},{contract.production.ySortOrigin.y}</span>
        </div>
      </section>

      <section className={styles.block}>
        <Header code="LAYERS / 03" title="Ownership and separation" />
        <div className={styles.layerTable}>
          {contract.production.layers.map((layer) => (
            <article key={layer.id}>
              <div><strong>{layer.role}</strong><span>{layer.treatment}</span></div>
              <p>{layer.reason}</p>
              <small>{layer.exportPolicy} · z {layer.zOrder} · {layer.contributesToIdentity ? "identity" : "non-identity"}</small>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.block}>
        <Header code="PROVIDER / 04" title="One bounded unit, no redesign authority" />
        <p className={styles.boundary}>{payload.executionBoundary}</p>
        <div className={styles.twoColumn}>
          <div><strong>Immutable locks</strong><ul>{contract.provider.immutableLocks.map((item) => <li key={item}>{item}</li>)}</ul></div>
          <div><strong>Prohibited changes</strong><ul>{contract.provider.prohibitedChanges.map((item) => <li key={item}>{item}</li>)}</ul></div>
        </div>
      </section>

      <section className={styles.block}>
        <Header code="QA / 05" title="Evidence that blocks weak art" />
        <div className={styles.gateList}>
          {contract.qualityGates.map((gate) => (
            <article key={gate.id} data-severity={gate.severity}>
              <div><span>{gate.severity}</span><strong>{gate.id}</strong><b>{formatThreshold(gate.threshold)}</b></div>
              <p>{gate.description}</p>
              <small>{gate.evidence.join(" · ")}</small>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.block}>
        <Header code="OUTPUT / 06" title="Godot and delivery contract" />
        <div className={styles.outputCards}>
          {contract.outputs.map((output) => (
            <article key={output.id}>
              <span>{output.target}</span>
              <h4>{output.title}</h4>
              <p>{output.masterFormats.join(" · ")}</p>
              <small>{output.textureFiltering} filtering · rotation {output.atlas.rotation} · padding {output.atlas.paddingPixels}px · extrusion {output.atlas.extrusionPixels}px</small>
              <ul>{output.importRecommendations.map((item) => <li key={item}>{item}</li>)}</ul>
            </article>
          ))}
        </div>
        {contract.delivery.godot ? (
          <div className={styles.godot}>
            <strong>Godot {contract.delivery.godot.engineVersion}</strong>
            <ul>{[...contract.delivery.godot.nodeRecommendations, ...contract.delivery.godot.projectSettings].map((item) => <li key={item}>{item}</li>)}</ul>
          </div>
        ) : null}
      </section>

      {contract.warnings.length ? (
        <section className={styles.warnings}>
          <strong>Release blockers and review notes</strong>
          {contract.warnings.map((warning) => <p key={warning}>{warning}</p>)}
        </section>
      ) : null}

      <footer className={styles.hashes}>
        <span>request {contract.requestSha256}</span>
        <span>contract {contract.contractSha256}</span>
        <span>{payload.compiledJob.runtimeJob.kind}</span>
      </footer>
    </div>
  );
}

function Header({ code, title }: Readonly<{ code: string; title: string }>) {
  return <div className={styles.blockHead}><span>{code}</span><h4>{title}</h4></div>;
}

function Lock({ label, value }: Readonly<{ label: string; value: string }>) {
  return <article><small>{label}</small><strong>{value}</strong></article>;
}
