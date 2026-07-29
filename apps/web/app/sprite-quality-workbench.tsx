"use client";

import type {
  SpriteFrameQualityReport,
  SpriteQualityGateResult,
  SpriteTransparencyExpectation,
} from "@evavo/art-quality";
import { useEffect, useMemo, useRef, useState } from "react";

import styles from "./sprite-quality-workbenches.module.css";

const MAXIMUM_FILE_BYTES = 16 * 1024 * 1024;
const MATTES = [
  { id: "checker", label: "Transparency preview", value: "checker" },
  { id: "black", label: "Black proof", value: "#000000" },
  { id: "white", label: "White proof", value: "#ffffff" },
  { id: "grey", label: "Grey proof", value: "#7f7f7f" },
  { id: "green", label: "Green proof", value: "#00ff00" },
  { id: "magenta", label: "Magenta proof", value: "#ff00ff" },
] as const;

type AnalysisState =
  | Readonly<{ status: "idle" }>
  | Readonly<{ status: "loading" }>
  | Readonly<{ status: "error"; message: string }>
  | Readonly<{ status: "ready"; report: SpriteFrameQualityReport }>;

function integerOrUndefined(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : undefined;
}

function nonNegativeInteger(value: string, fallback: number): number {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : fallback;
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

async function imageDimensions(file: File): Promise<Readonly<{ width: number; height: number }>> {
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
      reject(new Error("The browser could not preview this image."));
    };
    image.src = url;
  });
}

function percentage(value: number): string {
  return `${(value * 100).toFixed(value < 0.01 ? 2 : 1)}%`;
}

function gateRank(gate: SpriteQualityGateResult): number {
  if (gate.status === "fail") return 0;
  if (gate.status === "warning") return 1;
  if (gate.status === "skipped") return 2;
  return 3;
}

function gateClass(gate: SpriteQualityGateResult): string {
  if (gate.status === "fail") return styles.gateFail;
  if (gate.status === "warning") return styles.gateWarning;
  if (gate.status === "skipped") return styles.gateSkipped;
  return styles.gatePass;
}

function evidenceLabel(value: unknown): string {
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(4);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (value === null || value === undefined) return "Not set";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function downloadJson(name: string, value: unknown): void {
  const url = URL.createObjectURL(
    new Blob([`${JSON.stringify(value, null, 2)}\n`], { type: "application/json" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function SpriteQualityWorkbench() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [matte, setMatte] = useState<(typeof MATTES)[number]["id"]>("checker");
  const [pixelated, setPixelated] = useState(true);
  const [zoom, setZoom] = useState(2);
  const [transparency, setTransparency] = useState<SpriteTransparencyExpectation>("alpha-required");
  const [expectedWidth, setExpectedWidth] = useState("");
  const [expectedHeight, setExpectedHeight] = useState("");
  const [safePadding, setSafePadding] = useState("1");
  const [dragActive, setDragActive] = useState(false);
  const [state, setState] = useState<AnalysisState>({ status: "idle" });

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return undefined;
    }
    const nextUrl = URL.createObjectURL(file);
    setPreviewUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [file]);

  const report = state.status === "ready" ? state.report : null;
  const orderedGates = useMemo(
    () => (report ? [...report.gates].sort((left, right) => gateRank(left) - gateRank(right)) : []),
    [report],
  );
  const selectedMatte = MATTES.find((entry) => entry.id === matte) ?? MATTES[0];

  async function acceptFile(next: File | null): Promise<void> {
    setState({ status: "idle" });
    if (!next) {
      setFile(null);
      return;
    }
    if (next.size > MAXIMUM_FILE_BYTES) {
      setFile(null);
      setState({ status: "error", message: "Frame exceeds the 16 MB browser inspection limit." });
      return;
    }
    if (!next.type.startsWith("image/")) {
      setFile(null);
      setState({ status: "error", message: "Choose a supported raster image file." });
      return;
    }
    setFile(next);
    try {
      const dimensions = await imageDimensions(next);
      setExpectedWidth(String(dimensions.width));
      setExpectedHeight(String(dimensions.height));
    } catch {
      setExpectedWidth("");
      setExpectedHeight("");
    }
  }

  async function analyse(): Promise<void> {
    if (!file) {
      setState({ status: "error", message: "Choose one sprite frame before running QA." });
      return;
    }
    setState({ status: "loading" });
    try {
      const response = await fetch("/api/quality/sprite-frame", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          imageBase64: await fileToBase64(file),
          expectations: {
            frameId: file.name.replace(/\.[^.]+$/, ""),
            transparency,
            expectedWidth: integerOrUndefined(expectedWidth),
            expectedHeight: integerOrUndefined(expectedHeight),
            safePadding: nonNegativeInteger(safePadding, 1),
          },
        }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const message =
          payload && typeof payload === "object" && "error" in payload
            ? JSON.stringify(payload.error, null, 2)
            : `Frame inspection failed with HTTP ${response.status}.`;
        throw new Error(message);
      }
      setState({ status: "ready", report: payload as unknown as SpriteFrameQualityReport });
    } catch (error: unknown) {
      setState({ status: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }

  function reset(): void {
    setFile(null);
    setExpectedWidth("");
    setExpectedHeight("");
    setSafePadding("1");
    setTransparency("alpha-required");
    setState({ status: "idle" });
    if (inputRef.current) inputRef.current.value = "";
  }

  const boundsStyle = report && report.visibleBounds.minX !== null && report.visibleBounds.minY !== null
    ? {
        left: `${(report.visibleBounds.minX / report.source.width) * 100}%`,
        top: `${(report.visibleBounds.minY / report.source.height) * 100}%`,
        width: `${(report.visibleBounds.width / report.source.width) * 100}%`,
        height: `${(report.visibleBounds.height / report.source.height) * 100}%`,
      }
    : undefined;
  const padding = nonNegativeInteger(safePadding, 1);
  const paddingStyle = report
    ? {
        left: `${(padding / report.source.width) * 100}%`,
        top: `${(padding / report.source.height) * 100}%`,
        right: `${(padding / report.source.width) * 100}%`,
        bottom: `${(padding / report.source.height) * 100}%`,
      }
    : undefined;

  return (
    <section className={styles.workbench} id="frame-qa" aria-labelledby="frame-qa-title">
      <div className={styles.heading}>
        <p className="eyebrow">Decoded frame evidence</p>
        <h2 id="frame-qa-title">Prove the sprite, pixel by pixel.</h2>
        <p>
          Inspect one source frame through the same deterministic server kernel used by the CLI, REST API and MCP tools. The browser preview is never treated as proof.
        </p>
      </div>

      <div className={styles.shell}>
        <div className={styles.controls}>
          <div className={styles.panelHead}>
            <div><span>FRAME CONTRACT</span><strong>LOCAL FILE · NO PROVIDER</strong></div>
            <button type="button" onClick={reset}>Reset</button>
          </div>

          <div
            className={`${styles.dropzone} ${dragActive ? styles.dropzoneActive : ""}`}
            onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => { if (event.currentTarget === event.target) setDragActive(false); }}
            onDrop={(event) => {
              event.preventDefault();
              setDragActive(false);
              void acceptFile(event.dataTransfer.files[0] ?? null);
            }}
          >
            <input
              ref={inputRef}
              type="file"
              accept="image/png,image/webp,image/avif,image/gif,image/jpeg,image/tiff"
              onChange={(event) => void acceptFile(event.target.files?.[0] ?? null)}
            />
            <span>{file ? file.name : "Drop one source frame here"}</span>
            <small>{file ? `${(file.size / 1024).toFixed(1)} KB · ${file.type || "format decoded server-side"}` : "Or choose a file · maximum 16 MB"}</small>
          </div>

          <div className={styles.formGrid}>
            <label>
              <span>Transparency policy</span>
              <select value={transparency} onChange={(event) => setTransparency(event.target.value as SpriteTransparencyExpectation)}>
                <option value="alpha-required">Alpha required</option>
                <option value="alpha-preferred">Alpha preferred</option>
                <option value="opaque">Opaque asset</option>
              </select>
            </label>
            <label>
              <span>Expected width</span>
              <input inputMode="numeric" value={expectedWidth} placeholder="Detect" onChange={(event) => setExpectedWidth(event.target.value)} />
            </label>
            <label>
              <span>Expected height</span>
              <input inputMode="numeric" value={expectedHeight} placeholder="Detect" onChange={(event) => setExpectedHeight(event.target.value)} />
            </label>
            <label>
              <span>Safe padding</span>
              <input inputMode="numeric" value={safePadding} onChange={(event) => setSafePadding(event.target.value)} />
            </label>
          </div>

          <button className="button button--primary" type="button" onClick={analyse} disabled={state.status === "loading" || !file}>
            {state.status === "loading" ? "Decoding and measuring…" : "Run blocking frame QA"}
          </button>
          <p className={styles.privacy}>The route is same-origin, bounded, no-store and disabled in production unless explicitly enabled. No image-generation provider is called.</p>
        </div>

        <div className={styles.previewPanel} aria-live="polite">
          <div className={styles.panelHead}>
            <div><span>MATTE PROOF</span><strong>{report ? report.rawRgbaSha256.slice(0, 16) : "AWAITING SOURCE"}</strong></div>
            {report ? <b className={report.passed ? styles.statusPass : styles.statusFail}>{report.passed ? "PASS" : "BLOCKED"}</b> : null}
          </div>

          <div className={styles.previewToolbar}>
            <div role="group" aria-label="Preview matte">
              {MATTES.map((entry) => (
                <button key={entry.id} type="button" aria-pressed={matte === entry.id} className={matte === entry.id ? styles.activeTool : ""} onClick={() => setMatte(entry.id)}>{entry.label}</button>
              ))}
            </div>
            <label><input type="checkbox" checked={pixelated} onChange={(event) => setPixelated(event.target.checked)} /> Pixel edges</label>
            <label>Zoom <input type="range" min="1" max="8" step="1" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /></label>
          </div>

          <div className={`${styles.previewStage} ${selectedMatte.value === "checker" ? styles.checker : ""}`} style={selectedMatte.value === "checker" ? undefined : { backgroundColor: selectedMatte.value }}>
            {previewUrl ? (
              <div className={styles.imageWrap} style={{ transform: `scale(${zoom})` }}>
                <img src={previewUrl} alt={`${file?.name ?? "Sprite frame"} over ${selectedMatte.label}`} className={pixelated ? styles.pixelated : ""} />
                {paddingStyle ? <span className={styles.paddingGuide} style={paddingStyle} aria-hidden="true" /> : null}
                {boundsStyle ? <span className={styles.boundsGuide} style={boundsStyle} aria-hidden="true" /> : null}
              </div>
            ) : (
              <div className={styles.emptyPreview}><strong>Choose one frame</strong><span>Black, white, grey, green and magenta proofs expose edge contamination that a checkerboard can hide.</span></div>
            )}
          </div>

          {state.status === "error" ? <pre className={styles.error}>{state.message}</pre> : null}

          {report ? (
            <>
              <div className={styles.metrics}>
                <article><small>Decoded</small><strong>{report.source.width}×{report.source.height}</strong><span>{report.source.format} · {report.source.hasAlpha ? "source alpha" : "no source alpha"}</span></article>
                <article><small>Transparent</small><strong>{percentage(report.alpha.transparentFraction)}</strong><span>{report.alpha.partialPixels} partial pixels</span></article>
                <article><small>Minimum clearance</small><strong>{Math.min(...Object.values(report.visibleBounds.clearance))} px</strong><span>{report.visibleBounds.visiblePixels} visible pixels</span></article>
                <article><small>Halo / hidden RGB</small><strong>{percentage(report.halo.haloFraction)}</strong><span>{percentage(report.transparentRgb.unexpectedFraction)} unexpected hidden colour</span></article>
              </div>

              <div className={styles.gateHeader}>
                <div><span>BLOCKING EVIDENCE</span><strong>{orderedGates.filter((gate) => gate.status === "fail").length} failures · {orderedGates.length} gates</strong></div>
                <button type="button" onClick={() => downloadJson(`${report.frameId}.quality.json`, report)}>Download evidence JSON</button>
              </div>
              <div className={styles.gates}>
                {orderedGates.map((gate) => (
                  <article key={gate.id} className={gateClass(gate)}>
                    <div><span>{gate.id.replaceAll("-", " ")}</span><b>{gate.status}</b></div>
                    <p>{gate.message}</p>
                    <dl>
                      {gate.value !== undefined ? <><dt>Measured</dt><dd>{evidenceLabel(gate.value)}</dd></> : null}
                      {gate.threshold !== undefined ? <><dt>Threshold</dt><dd>{evidenceLabel(gate.threshold)}</dd></> : null}
                      <dt>Blocking</dt><dd>{gate.blocking ? "Yes" : "No"}</dd>
                    </dl>
                  </article>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}
