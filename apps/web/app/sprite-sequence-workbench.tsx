"use client";

import type {
  SpriteQualityGateResult,
  SpriteSequenceManifest,
  SpriteSequenceQualityReport,
  SpriteTransparencyExpectation,
} from "@evavo/art-quality";
import { useEffect, useMemo, useRef, useState } from "react";

import styles from "./sprite-quality-workbenches.module.css";

const MAXIMUM_FRAMES = 32;
const MAXIMUM_FRAME_BYTES = 8 * 1024 * 1024;
const MAXIMUM_TOTAL_BYTES = 64 * 1024 * 1024;

const SEQUENCE_MATTES = [
  ["checker", "Checker preview"],
  ["#000000", "Black"],
  ["#ffffff", "White"],
  ["#7f7f7f", "Grey"],
  ["#00ff00", "Green"],
  ["#ff00ff", "Magenta"],
] as const;

type SequenceFile = Readonly<{ id: string; file: File }>;
type CanvasSize = Readonly<{ width: number; height: number }>;
type SequenceState =
  | Readonly<{ status: "idle" }>
  | Readonly<{ status: "loading" }>
  | Readonly<{ status: "error"; message: string }>
  | Readonly<{ status: "ready"; report: SpriteSequenceQualityReport }>;

function slug(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return normalized || "frame";
}

function naturalCompare(left: File, right: File): number {
  return left.name.localeCompare(right.name, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const block = 0x8000;
  for (let index = 0; index < bytes.length; index += block) {
    binary += String.fromCharCode(...bytes.subarray(index, index + block));
  }
  return btoa(binary);
}

async function imageDimensions(file: File): Promise<CanvasSize> {
  if ("createImageBitmap" in window) {
    const bitmap = await createImageBitmap(file);
    try {
      return { width: bitmap.width, height: bitmap.height };
    } finally {
      bitmap.close();
    }
  }

  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`The browser could not inspect ${file.name}.`));
    };
    image.src = url;
  });
}

function gateClass(gate: SpriteQualityGateResult): string {
  if (gate.status === "fail") return styles.gateFail;
  if (gate.status === "warning") return styles.gateWarning;
  if (gate.status === "skipped") return styles.gateSkipped;
  return styles.gatePass;
}

function downloadJson(name: string, value: unknown): void {
  const url = URL.createObjectURL(
    new Blob([`${JSON.stringify(value, null, 2)}\n`], {
      type: "application/json",
    }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function parseDirections(value: string): string[] {
  const values = value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return [...new Set(values.length ? values : ["default"])];
}

function numberValue(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export default function SpriteSequenceWorkbench() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<readonly SequenceFile[]>([]);
  const [canvas, setCanvas] = useState<CanvasSize | null>(null);
  const [previewUrls, setPreviewUrls] = useState<ReadonlyMap<string, string>>(
    new Map(),
  );
  const [manifestSource, setManifestSource] = useState("{}");
  const [sequenceId, setSequenceId] = useState("sprite-sequence");
  const [directionSource, setDirectionSource] = useState("default");
  const [fps, setFps] = useState("8");
  const [pivotX, setPivotX] = useState("0");
  const [pivotY, setPivotY] = useState("0");
  const [baseline, setBaseline] = useState("");
  const [safePadding, setSafePadding] = useState("1");
  const [transparency, setTransparency] =
    useState<SpriteTransparencyExpectation>("alpha-required");
  const [groundContact, setGroundContact] = useState(true);
  const [state, setState] = useState<SequenceState>({ status: "idle" });
  const [matte, setMatte] = useState("checker");

  useEffect(() => {
    const next = new Map<string, string>();
    files.forEach((entry) => next.set(entry.id, URL.createObjectURL(entry.file)));
    setPreviewUrls(next);
    return () => next.forEach((url) => URL.revokeObjectURL(url));
  }, [files]);

  const report = state.status === "ready" ? state.report : null;
  const failedFrames = useMemo(
    () => report?.frameReports.filter((entry) => !entry.passed) ?? [],
    [report],
  );

  function clearSelection(message?: string): void {
    setFiles([]);
    setCanvas(null);
    setManifestSource("{}");
    if (inputRef.current) inputRef.current.value = "";
    setState(
      message ? { status: "error", message } : { status: "idle" },
    );
  }

  async function acceptFiles(list: FileList | readonly File[]): Promise<void> {
    setState({ status: "idle" });
    const selected = Array.from(list as ArrayLike<File>).sort(naturalCompare);
    if (!selected.length) {
      clearSelection();
      return;
    }
    if (selected.length > MAXIMUM_FRAMES) {
      clearSelection(
        `Browser sequence QA accepts at most ${MAXIMUM_FRAMES} frames.`,
      );
      return;
    }
    if (selected.some((file) => file.size > MAXIMUM_FRAME_BYTES)) {
      clearSelection("Every sequence frame must be 8 MB or smaller.");
      return;
    }
    if (
      selected.reduce((total, file) => total + file.size, 0) >
      MAXIMUM_TOTAL_BYTES
    ) {
      clearSelection("Sequence images exceed the 64 MB browser limit.");
      return;
    }
    if (selected.some((file) => !file.type.startsWith("image/"))) {
      clearSelection("Every selected sequence file must be a raster image.");
      return;
    }

    const ids = new Map<string, number>();
    const entries = selected.map((file) => {
      const base = slug(file.name);
      const count = (ids.get(base) ?? 0) + 1;
      ids.set(base, count);
      return {
        id: count === 1 ? base : `${base}-${String(count).padStart(2, "0")}`,
        file,
      };
    });

    try {
      const first = await imageDimensions(entries[0]!.file);
      const defaultPivotX = Math.floor(first.width / 2);
      const defaultBaseline = Math.max(0, first.height - 1);
      setFiles(entries);
      setCanvas(first);
      setPivotX(String(defaultPivotX));
      setPivotY(String(defaultBaseline));
      setBaseline(String(defaultBaseline));
      regenerateManifest(entries, first, {
        pivotX: defaultPivotX,
        pivotY: defaultBaseline,
        baseline: defaultBaseline,
      });
    } catch (error: unknown) {
      clearSelection(error instanceof Error ? error.message : String(error));
    }
  }

  function regenerateManifest(
    sourceFiles = files,
    explicitCanvas?: CanvasSize,
    explicit?: Readonly<{ pivotX: number; pivotY: number; baseline: number }>,
  ): void {
    if (!sourceFiles.length) {
      setState({
        status: "error",
        message: "Choose frames before regenerating the sequence manifest.",
      });
      return;
    }

    const directions = parseDirections(directionSource);
    if (sourceFiles.length % directions.length !== 0) {
      setState({
        status: "error",
        message:
          "Frame count must divide evenly across the declared directions before regenerating the manifest.",
      });
      return;
    }

    const resolvedCanvas = explicitCanvas ?? canvas;
    if (!resolvedCanvas) {
      setState({
        status: "error",
        message: "The selected frame canvas could not be resolved.",
      });
      return;
    }

    const framesPerDirection = sourceFiles.length / directions.length;
    const durationMs = Math.max(
      1,
      Math.round(1000 / Math.max(0.1, numberValue(fps, 8))),
    );
    const x = explicit?.pivotX ?? numberValue(pivotX, Math.floor(resolvedCanvas.width / 2));
    const y = explicit?.pivotY ?? numberValue(pivotY, resolvedCanvas.height - 1);
    const baselineValue =
      explicit?.baseline ?? numberValue(baseline, resolvedCanvas.height - 1);

    const manifest: SpriteSequenceManifest = {
      schemaVersion: "1.0",
      sequenceId: sequenceId.trim() || "sprite-sequence",
      transparency,
      expectedWidth: resolvedCanvas.width,
      expectedHeight: resolvedCanvas.height,
      safePadding: Math.max(0, Math.round(numberValue(safePadding, 1))),
      expectedPivot: { x, y },
      expectedBaseline: baselineValue,
      groundContactTolerance: 1,
      frames: sourceFiles.map((entry, globalFrameIndex) => {
        const directionIndex = Math.floor(globalFrameIndex / framesPerDirection);
        const frameIndex = globalFrameIndex % framesPerDirection;
        return {
          id: entry.id,
          path: entry.file.name,
          direction: directions[directionIndex] ?? "default",
          frameIndex,
          globalFrameIndex,
          durationMs,
          pivot: { x, y },
          baseline: baselineValue,
          groundContact,
        };
      }),
    };

    setManifestSource(JSON.stringify(manifest, null, 2));
    setState({ status: "idle" });
  }

  async function analyse(): Promise<void> {
    if (!files.length) {
      setState({
        status: "error",
        message: "Choose a frame sequence before running QA.",
      });
      return;
    }

    setState({ status: "loading" });
    try {
      const manifest = JSON.parse(manifestSource) as unknown;
      const encoded: Array<{ id: string; imageBase64: string }> = [];
      for (const entry of files) {
        encoded.push({
          id: entry.id,
          imageBase64: await fileToBase64(entry.file),
        });
      }

      const response = await fetch("/api/quality/sprite-sequence", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ manifest, frames: encoded }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const message =
          payload && typeof payload === "object" && "error" in payload
            ? JSON.stringify(payload.error, null, 2)
            : `Sequence inspection failed with HTTP ${response.status}.`;
        throw new Error(message);
      }
      setState({
        status: "ready",
        report: payload as SpriteSequenceQualityReport,
      });
    } catch (error: unknown) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  function reset(): void {
    setSequenceId("sprite-sequence");
    setDirectionSource("default");
    setFps("8");
    setPivotX("0");
    setPivotY("0");
    setBaseline("");
    setSafePadding("1");
    setTransparency("alpha-required");
    setGroundContact(true);
    setMatte("checker");
    clearSelection();
  }

  return (
    <section
      className={styles.workbench}
      id="sequence-qa"
      aria-labelledby="sequence-qa-title"
    >
      <div className={styles.heading}>
        <p className="eyebrow">Sequence continuity evidence</p>
        <h2 id="sequence-qa-title">Inspect the whole motion family.</h2>
        <p>
          Verify shared canvases, ordering, exact durations, anchors, baselines,
          ground contact, undeclared duplicate frames and per-frame pixel gates
          without flattening the editable source.
        </p>
      </div>

      <div className={styles.sequenceShell}>
        <div className={styles.sequenceControls}>
          <div className={styles.panelHead}>
            <div>
              <span>SEQUENCE CONTRACT</span>
              <strong>1–32 FRAMES · MAXIMUM 64 MB</strong>
            </div>
            <button type="button" onClick={reset}>
              Reset
            </button>
          </div>

          <label className={styles.dropzone}>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept="image/png,image/webp,image/avif,image/gif,image/jpeg,image/tiff"
              onChange={(event) => void acceptFiles(event.target.files ?? [])}
            />
            <span>
              {files.length
                ? `${files.length} ordered source frames`
                : "Choose an ordered frame sequence"}
            </span>
            <small>
              Natural filename order is used. Manifest JSON remains editable for
              exact holds, directions and per-frame timing.
            </small>
          </label>

          <div className={styles.formGrid}>
            <label>
              <span>Sequence ID</span>
              <input
                value={sequenceId}
                onChange={(event) => setSequenceId(event.target.value)}
              />
            </label>
            <label>
              <span>Directions</span>
              <input
                value={directionSource}
                onChange={(event) => setDirectionSource(event.target.value)}
                placeholder="down,left,right,up"
              />
            </label>
            <label>
              <span>Frames per second</span>
              <input
                inputMode="decimal"
                value={fps}
                onChange={(event) => setFps(event.target.value)}
              />
            </label>
            <label>
              <span>Transparency</span>
              <select
                value={transparency}
                onChange={(event) =>
                  setTransparency(
                    event.target.value as SpriteTransparencyExpectation,
                  )
                }
              >
                <option value="alpha-required">Alpha required</option>
                <option value="alpha-preferred">Alpha preferred</option>
                <option value="opaque">Opaque</option>
              </select>
            </label>
            <label>
              <span>Pivot X</span>
              <input
                inputMode="numeric"
                value={pivotX}
                onChange={(event) => setPivotX(event.target.value)}
              />
            </label>
            <label>
              <span>Pivot Y</span>
              <input
                inputMode="numeric"
                value={pivotY}
                onChange={(event) => setPivotY(event.target.value)}
              />
            </label>
            <label>
              <span>Baseline</span>
              <input
                inputMode="numeric"
                value={baseline}
                onChange={(event) => setBaseline(event.target.value)}
              />
            </label>
            <label>
              <span>Safe padding</span>
              <input
                inputMode="numeric"
                value={safePadding}
                onChange={(event) => setSafePadding(event.target.value)}
              />
            </label>
          </div>

          <label className={styles.inlineCheck}>
            <input
              type="checkbox"
              checked={groundContact}
              onChange={(event) => setGroundContact(event.target.checked)}
            />
            Treat every frame as ground-contact locked
          </label>
          <button
            type="button"
            className="button"
            onClick={() => regenerateManifest()}
          >
            Regenerate manifest
          </button>

          <details className={styles.manifest} open>
            <summary>Exact sequence manifest</summary>
            <p>
              Add <code>intentionalDuplicateOf</code> to a later frame when a
              linked cel or hold is deliberate.
            </p>
            <textarea
              spellCheck={false}
              value={manifestSource}
              onChange={(event) => setManifestSource(event.target.value)}
            />
          </details>

          <button
            className="button button--primary"
            type="button"
            onClick={analyse}
            disabled={state.status === "loading" || !files.length}
          >
            {state.status === "loading"
              ? "Decoding sequence…"
              : "Run blocking sequence QA"}
          </button>
          <p className={styles.privacy}>
            Every frame is encoded sequentially, decoded in bounded server memory
            and discarded after evidence generation. No files are written to the
            application repository.
          </p>
        </div>

        <div className={styles.sequenceEvidence} aria-live="polite">
          <div className={styles.panelHead}>
            <div>
              <span>SEQUENCE EVIDENCE</span>
              <strong>{report?.sequenceId ?? "AWAITING MANIFEST"}</strong>
            </div>
            {report ? (
              <b
                className={report.passed ? styles.statusPass : styles.statusFail}
              >
                {report.passed ? "PASS" : "BLOCKED"}
              </b>
            ) : null}
          </div>

          <div className={styles.sequenceToolbar}>
            {SEQUENCE_MATTES.map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={matte === value}
                className={matte === value ? styles.activeTool : ""}
                onClick={() => setMatte(value)}
              >
                {label}
              </button>
            ))}
          </div>

          {files.length ? (
            <div
              className={`${styles.filmstrip} ${
                matte === "checker" ? styles.checker : ""
              }`}
              style={
                matte === "checker" ? undefined : { backgroundColor: matte }
              }
            >
              {files.map((entry, index) => {
                const source = previewUrls.get(entry.id);
                return source ? (
                  <figure key={entry.id}>
                    <img
                      src={source}
                      alt={`${entry.file.name}, frame ${index + 1}`}
                    />
                    <figcaption>
                      <b>{String(index + 1).padStart(2, "0")}</b>
                      <span>{entry.file.name}</span>
                    </figcaption>
                  </figure>
                ) : null;
              })}
            </div>
          ) : (
            <div className={styles.emptyPreview}>
              <strong>Choose a sequence</strong>
              <span>
                The filmstrip preserves individual frames and natural filename
                order.
              </span>
            </div>
          )}

          {state.status === "error" ? (
            <pre className={styles.error}>{state.message}</pre>
          ) : null}

          {report ? (
            <>
              <div className={styles.metrics}>
                <article>
                  <small>Frames</small>
                  <strong>{report.summary.frameCount}</strong>
                  <span>{report.summary.directions.join(" · ")}</span>
                </article>
                <article>
                  <small>Duration</small>
                  <strong>{report.summary.totalDurationMs} ms</strong>
                  <span>exact manifest timing</span>
                </article>
                <article>
                  <small>Passed</small>
                  <strong>{report.summary.passedFrames}</strong>
                  <span>{report.summary.failedFrames} failed frames</span>
                </article>
                <article>
                  <small>Duplicate groups</small>
                  <strong>{report.duplicateGroups.length}</strong>
                  <span>
                    {report.duplicateGroups.filter((entry) => !entry.declared)
                      .length}{" "}
                    undeclared
                  </span>
                </article>
              </div>

              <div className={styles.gateHeader}>
                <div>
                  <span>SEQUENCE GATES</span>
                  <strong>
                    {report.gates.filter((gate) => gate.status === "fail").length}{" "}
                    blocking failures
                  </strong>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    downloadJson(`${report.sequenceId}.quality.json`, report)
                  }
                >
                  Download evidence JSON
                </button>
              </div>
              <div className={styles.gates}>
                {report.gates.map((gate) => (
                  <article key={gate.id} className={gateClass(gate)}>
                    <div>
                      <span>{gate.id.replaceAll("-", " ")}</span>
                      <b>{gate.status}</b>
                    </div>
                    <p>{gate.message}</p>
                    <dl>
                      <dt>Blocking</dt>
                      <dd>{gate.blocking ? "Yes" : "No"}</dd>
                    </dl>
                  </article>
                ))}
              </div>

              {failedFrames.length ? (
                <div className={styles.failedFrames}>
                  <h3>Failed frame evidence</h3>
                  {failedFrames.map((frame) => (
                    <article key={frame.frameId}>
                      <strong>{frame.frameId}</strong>
                      <span>
                        {frame.gates
                          .filter((gate) => gate.status === "fail")
                          .map((gate) => gate.id)
                          .join(", ")}
                      </span>
                    </article>
                  ))}
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}
