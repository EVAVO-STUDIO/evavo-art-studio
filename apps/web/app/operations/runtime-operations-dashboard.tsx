"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";

import {
  ACTIVE_RUNTIME_STATES,
  OPERATOR_RUNTIME_STATES,
  TERMINAL_RUNTIME_STATES,
  type OperatorArtifactDescriptor,
  type OperatorArtifactVerification,
  type OperatorEventsResponse,
  type OperatorJobAction,
  type OperatorJobsResponse,
  type OperatorRuntimeAttempt,
  type OperatorRuntimeEvent,
  type OperatorRuntimeJob,
  type OperatorRuntimeState,
  type OperatorSessionStatus,
} from "../../lib/operator-types";
import styles from "./operations.module.css";

const DEFAULT_SUBMISSION = {
  queue: "media",
  kind: "sprite.atlas.build",
  idempotencyKey: "project-hero-idle-atlas-v1",
  payload: {
    manifestPath: "C:\\GitRepos\\your-game\\art\\hero-idle.atlas.json",
    outputDirectory: "C:\\GitRepos\\your-game\\art\\generated\\hero-idle",
    godotProjectPath: "C:\\GitRepos\\your-game",
  },
  requiredCapabilities: [
    "atlas.pack",
    "media.raster",
    "godot.export",
    "evidence.bundle",
  ],
  maximumAttempts: 3,
  leaseDurationMs: 60000,
  timeoutMs: 900000,
  labels: {
    project: "your-game",
    assetFamily: "hero-idle",
    target: "godot-4.6.2",
  },
};

const STATE_LABELS: Readonly<Record<OperatorRuntimeState, string>> = {
  waiting: "Waiting",
  queued: "Queued",
  leased: "Leased",
  running: "Running",
  "retry-wait": "Retry wait",
  paused: "Paused",
  succeeded: "Succeeded",
  failed: "Failed",
  cancelled: "Cancelled",
  blocked: "Blocked",
  "dead-letter": "Dead letter",
};

const STATE_CLASS: Readonly<Record<OperatorRuntimeState, string>> = {
  waiting: styles.stateWaiting ?? "",
  queued: styles.stateQueued ?? "",
  leased: styles.stateLeased ?? "",
  running: styles.stateRunning ?? "",
  "retry-wait": styles.stateRetry ?? "",
  paused: styles.statePaused ?? "",
  succeeded: styles.stateSucceeded ?? "",
  failed: styles.stateFailed ?? "",
  cancelled: styles.stateCancelled ?? "",
  blocked: styles.stateBlocked ?? "",
  "dead-letter": styles.stateDeadLetter ?? "",
};

type SessionState =
  | Readonly<{ status: "loading" }>
  | Readonly<{ status: "ready"; value: OperatorSessionStatus }>
  | Readonly<{ status: "error"; message: string }>;

type ArtifactState =
  | Readonly<{ status: "idle" }>
  | Readonly<{ status: "loading"; artifactId: string }>
  | Readonly<{
      status: "ready";
      artifactId: string;
      descriptor: OperatorArtifactDescriptor;
      verification: OperatorArtifactVerification;
    }>
  | Readonly<{ status: "error"; artifactId: string; message: string }>;

type ActiveArtifactState = Exclude<
  ArtifactState,
  Readonly<{ status: "idle" }>
>;

type PendingAction = Readonly<{
  jobId: string;
  action: OperatorJobAction;
}>;

class OperatorUiError extends Error {
  public readonly code: string;
  public readonly status: number;

  public constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "OperatorUiError";
    this.code = code;
    this.status = status;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function requestJson<T>(
  input: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      accept: "application/json",
      ...(init.body === undefined ? {} : { "content-type": "application/json" }),
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
  const text = await response.text();
  let body: unknown = {};
  if (text) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      throw new OperatorUiError(
        "OPERATOR_INVALID_RESPONSE",
        "The operator gateway returned invalid JSON.",
        response.status,
      );
    }
  }
  if (!response.ok) {
    const error = isRecord(body) && isRecord(body.error) ? body.error : null;
    const code =
      error && typeof error.code === "string"
        ? error.code
        : "OPERATOR_REQUEST_FAILED";
    const message =
      error && typeof error.message === "string"
        ? error.message
        : `Operator request failed with HTTP ${response.status}.`;
    throw new OperatorUiError(code, message, response.status);
  }
  return body as T;
}

function absoluteTime(value: string | undefined): string {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(date);
}

function relativeTime(value: string | undefined): string {
  if (!value) return "never";
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) return value;
  const seconds = Math.round((milliseconds - Date.now()) / 1_000);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (Math.abs(seconds) < 60) return formatter.format(seconds, "second");
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return formatter.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 48) return formatter.format(hours, "hour");
  return formatter.format(Math.round(hours / 24), "day");
}

function shortId(value: string, length = 14): string {
  return value.length <= length ? value : `${value.slice(0, length)}…`;
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function canPause(job: OperatorRuntimeJob): boolean {
  return !TERMINAL_RUNTIME_STATES.has(job.state) && job.state !== "paused";
}

function canCancel(job: OperatorRuntimeJob): boolean {
  return !TERMINAL_RUNTIME_STATES.has(job.state);
}

function canRedrive(job: OperatorRuntimeJob): boolean {
  return new Set<OperatorRuntimeState>([
    "failed",
    "cancelled",
    "blocked",
    "dead-letter",
  ]).has(job.state);
}

function eventTitle(event: OperatorRuntimeEvent): string {
  return event.type
    .replace(/^job\./, "")
    .split("-")
    .map((entry) => entry.charAt(0).toUpperCase() + entry.slice(1))
    .join(" ");
}

function attemptDuration(attempt: OperatorRuntimeAttempt): string {
  const start = Date.parse(attempt.startedAt ?? attempt.leasedAt);
  const end = Date.parse(attempt.finishedAt ?? attempt.lastHeartbeatAt ?? new Date().toISOString());
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "Unknown duration";
  const seconds = Math.max(0, Math.round((end - start) / 1_000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}

function StateBadge({ state }: Readonly<{ state: OperatorRuntimeState }>) {
  return (
    <span className={`${styles.stateBadge} ${STATE_CLASS[state]}`}>
      <i />
      {STATE_LABELS[state]}
    </span>
  );
}

function LoadingPlate({ label }: Readonly<{ label: string }>) {
  return (
    <div className={styles.loadingPlate}>
      <span className={styles.loadingRing} aria-hidden="true" />
      <strong>{label}</strong>
      <small>Reading governed runtime evidence.</small>
    </div>
  );
}

export default function RuntimeOperationsDashboard() {
  const [session, setSession] = useState<SessionState>({ status: "loading" });
  const [accessToken, setAccessToken] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [jobs, setJobs] = useState<readonly OperatorRuntimeJob[]>([]);
  const [events, setEvents] = useState<readonly OperatorRuntimeEvent[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [selectedJobDetail, setSelectedJobDetail] = useState<OperatorRuntimeJob | null>(null);
  const [stateFilter, setStateFilter] = useState<OperatorRuntimeState | "all">("all");
  const [queueFilter, setQueueFilter] = useState("");
  const [kindFilter, setKindFilter] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [submittingAction, setSubmittingAction] = useState(false);
  const [submissionOpen, setSubmissionOpen] = useState(false);
  const [submissionSource, setSubmissionSource] = useState(() =>
    JSON.stringify(DEFAULT_SUBMISSION, null, 2),
  );
  const [submittingJob, setSubmittingJob] = useState(false);
  const [artifact, setArtifact] = useState<ArtifactState>({ status: "idle" });

  const authenticated =
    session.status === "ready" && session.value.authenticated;

  const refreshSession = useCallback(async () => {
    try {
      const value = await requestJson<OperatorSessionStatus>(
        "/api/operator/session",
      );
      setSession({ status: "ready", value });
    } catch (sessionError: unknown) {
      setSession({ status: "error", message: errorMessage(sessionError) });
    }
  }, []);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  const loadOverview = useCallback(
    async (quiet = false) => {
      if (!authenticated) return;
      if (!quiet) setRefreshing(true);
      setError(null);
      try {
        const query = new URLSearchParams({ limit: "500" });
        if (stateFilter !== "all") query.set("state", stateFilter);
        if (queueFilter.trim()) query.set("queue", queueFilter.trim());
        if (kindFilter.trim()) query.set("kind", kindFilter.trim());
        const [jobResponse, eventResponse] = await Promise.all([
          requestJson<OperatorJobsResponse>(
            `/api/operator/runtime/jobs?${query.toString()}`,
          ),
          requestJson<OperatorEventsResponse>(
            "/api/operator/runtime/events?after=0&limit=200",
          ),
        ]);
        setJobs(jobResponse.jobs);
        setEvents(eventResponse.events.slice(-200).reverse());
        setLastRefresh(new Date().toISOString());
        if (
          selectedJobId &&
          !jobResponse.jobs.some((entry) => entry.id === selectedJobId)
        ) {
          setSelectedJobDetail(null);
        }
      } catch (loadError: unknown) {
        if (loadError instanceof OperatorUiError && loadError.status === 401) {
          await refreshSession();
        }
        setError(errorMessage(loadError));
      } finally {
        if (!quiet) setRefreshing(false);
      }
    }, [
      authenticated,
      kindFilter,
      queueFilter,
      refreshSession,
      selectedJobId,
      stateFilter,
    ],
  );

  useEffect(() => {
    if (authenticated) void loadOverview();
  }, [authenticated, loadOverview]);

  useEffect(() => {
    if (!authenticated || !autoRefresh) return undefined;
    const timer = window.setInterval(() => void loadOverview(true), 10_000);
    return () => window.clearInterval(timer);
  }, [authenticated, autoRefresh, loadOverview]);

  useEffect(() => {
    if (!authenticated || !selectedJobId) {
      setSelectedJobDetail(null);
      return;
    }
    let cancelled = false;
    void requestJson<OperatorRuntimeJob>(
      `/api/operator/runtime/jobs/${encodeURIComponent(selectedJobId)}`,
    )
      .then((value) => {
        if (!cancelled) setSelectedJobDetail(value);
      })
      .catch((detailError: unknown) => {
        if (!cancelled) setError(errorMessage(detailError));
      });
    return () => {
      cancelled = true;
    };
  }, [authenticated, selectedJobId, lastRefresh]);

  const selectedJob = useMemo(
    () =>
      selectedJobDetail ??
      jobs.find((entry) => entry.id === selectedJobId) ??
      jobs[0] ??
      null,
    [jobs, selectedJobDetail, selectedJobId],
  );

  useEffect(() => {
    if (!selectedJobId && jobs[0]) setSelectedJobId(jobs[0].id);
  }, [jobs, selectedJobId]);

  const summary = useMemo(() => {
    const values = {
      total: jobs.length,
      active: 0,
      ready: 0,
      attention: 0,
      succeeded: 0,
    };
    for (const job of jobs) {
      if (ACTIVE_RUNTIME_STATES.has(job.state)) values.active += 1;
      if (new Set(["waiting", "queued", "retry-wait", "paused"]).has(job.state)) {
        values.ready += 1;
      }
      if (new Set(["failed", "blocked", "dead-letter"]).has(job.state)) {
        values.attention += 1;
      }
      if (job.state === "succeeded") values.succeeded += 1;
    }
    return values;
  }, [jobs]);

  const visibleEvents = useMemo(
    () =>
      selectedJob
        ? events.filter((entry) => !entry.jobId || entry.jobId === selectedJob.id)
        : events,
    [events, selectedJob],
  );

  async function unlock(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!accessToken.trim()) return;
    setUnlocking(true);
    setError(null);
    try {
      const value = await requestJson<OperatorSessionStatus>(
        "/api/operator/session",
        {
          method: "POST",
          body: JSON.stringify({ accessToken }),
        },
      );
      setAccessToken("");
      setSession({ status: "ready", value });
    } catch (unlockError: unknown) {
      setError(errorMessage(unlockError));
    } finally {
      setUnlocking(false);
    }
  }

  async function logout(): Promise<void> {
    await requestJson<OperatorSessionStatus>("/api/operator/session", {
      method: "DELETE",
    }).catch(() => undefined);
    setJobs([]);
    setEvents([]);
    setSelectedJobId(null);
    setSelectedJobDetail(null);
    setArtifact({ status: "idle" });
    await refreshSession();
  }

  async function submitJob(): Promise<void> {
    setSubmittingJob(true);
    setError(null);
    setMessage(null);
    try {
      const payload = JSON.parse(submissionSource) as unknown;
      const response = await requestJson<{
        readonly schemaVersion: "1.0";
        readonly jobs: OperatorRuntimeJob | readonly OperatorRuntimeJob[];
      }>("/api/operator/runtime/jobs", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const submitted = Array.isArray(response.jobs)
        ? response.jobs
        : [response.jobs];
      setMessage(
        `${submitted.length} durable job${submitted.length === 1 ? "" : "s"} accepted.`,
      );
      setSubmissionOpen(false);
      if (submitted[0]) setSelectedJobId(submitted[0].id);
      await loadOverview();
    } catch (submissionError: unknown) {
      setError(errorMessage(submissionError));
    } finally {
      setSubmittingJob(false);
    }
  }

  async function runAction(action: PendingAction): Promise<void> {
    setSubmittingAction(true);
    setError(null);
    setMessage(null);
    try {
      const body =
        action.action === "redrive"
          ? { additionalAttempts: 1 }
          : action.action === "cancel" || action.action === "pause"
            ? { force: false }
            : {};
      const updated = await requestJson<OperatorRuntimeJob>(
        `/api/operator/runtime/jobs/${encodeURIComponent(action.jobId)}/${action.action}`,
        { method: "POST", body: JSON.stringify(body) },
      );
      setSelectedJobDetail(updated);
      setMessage(`${STATE_LABELS[updated.state]} · ${shortId(updated.id, 24)}`);
      setPendingAction(null);
      await loadOverview();
    } catch (actionError: unknown) {
      setError(errorMessage(actionError));
    } finally {
      setSubmittingAction(false);
    }
  }

  async function recoverLeases(): Promise<void> {
    setRefreshing(true);
    setError(null);
    try {
      const response = await requestJson<{
        readonly schemaVersion: "1.0";
        readonly jobs: readonly OperatorRuntimeJob[];
      }>("/api/operator/runtime/recover", {
        method: "POST",
        body: "{}",
      });
      setMessage(
        response.jobs.length
          ? `${response.jobs.length} expired execution${response.jobs.length === 1 ? "" : "s"} recovered.`
          : "No expired executions required recovery.",
      );
      await loadOverview(true);
    } catch (recoveryError: unknown) {
      setError(errorMessage(recoveryError));
    } finally {
      setRefreshing(false);
    }
  }

  async function inspectArtifact(artifactId: string): Promise<void> {
    setArtifact({ status: "loading", artifactId });
    try {
      const [descriptor, verification] = await Promise.all([
        requestJson<OperatorArtifactDescriptor>(
          `/api/operator/artifacts/${encodeURIComponent(artifactId)}`,
        ),
        requestJson<OperatorArtifactVerification>(
          `/api/operator/artifacts/${encodeURIComponent(artifactId)}?verify=true`,
        ),
      ]);
      setArtifact({ status: "ready", artifactId, descriptor, verification });
    } catch (artifactError: unknown) {
      setArtifact({
        status: "error",
        artifactId,
        message: errorMessage(artifactError),
      });
    }
  }

  if (session.status === "loading") {
    return (
      <section className={styles.dashboardShell}>
        <LoadingPlate label="Securing owner session" />
      </section>
    );
  }

  if (session.status === "error") {
    return (
      <section className={styles.dashboardShell}>
        <div className={styles.lockedPanel}>
          <span>SESSION / ERROR</span>
          <h2>The owner session boundary could not be read.</h2>
          <p>{session.message}</p>
          <button className="button" type="button" onClick={() => void refreshSession()}>
            Retry session check
          </button>
        </div>
      </section>
    );
  }

  if (!session.value.configured || !session.value.apiConfigured) {
    return (
      <section className={styles.dashboardShell}>
        <div className={styles.lockedPanel}>
          <span>CONTROL ROOM / NOT CONFIGURED</span>
          <h2>Complete the server-only operator boundary.</h2>
          <p>
            This page refuses to fall back to a browser token or a public runtime route.
            Configure the missing values, restart the web process and return here.
          </p>
          <div className={styles.configurationGrid}>
            <article className={session.value.configured ? styles.configured : ""}>
              <b>{session.value.configured ? "READY" : "REQUIRED"}</b>
              <strong>Owner session</strong>
              <code>EVAVO_ART_OPERATOR_ACCESS_TOKEN</code>
              <code>EVAVO_ART_OPERATOR_SESSION_SECRET</code>
            </article>
            <article className={session.value.apiConfigured ? styles.configured : ""}>
              <b>{session.value.apiConfigured ? "READY" : "REQUIRED"}</b>
              <strong>Server API link</strong>
              <code>EVAVO_ART_API_BASE_URL</code>
              <code>EVAVO_ART_WRITE_TOKEN</code>
            </article>
          </div>
        </div>
      </section>
    );
  }

  if (!session.value.authenticated) {
    return (
      <section className={styles.dashboardShell}>
        <form className={styles.unlockPanel} onSubmit={unlock}>
          <span>OWNER ACCESS / LOCKED</span>
          <h2>Unlock durable production operations.</h2>
          <p>
            The access token is compared server-side, exchanged for an HttpOnly signed
            session and cleared from this form. It is never placed in local storage,
            cookies readable by JavaScript or runtime API requests from the browser.
          </p>
          <label>
            <span>Owner access token</span>
            <input
              type="password"
              autoComplete="current-password"
              value={accessToken}
              onChange={(event) => setAccessToken(event.target.value)}
              placeholder="Enter the server-configured owner token"
            />
          </label>
          {error ? <pre className={styles.errorMessage}>{error}</pre> : null}
          <button
            className="button button--primary"
            type="submit"
            disabled={unlocking || accessToken.trim().length < 32}
          >
            {unlocking ? "Establishing session…" : "Unlock control room"}
          </button>
        </form>
      </section>
    );
  }

  return (
    <section className={styles.dashboardShell} aria-label="Runtime operations dashboard">
      <div className={styles.sessionBar}>
        <div>
          <span>OWNER SESSION</span>
          <strong>Authenticated until {absoluteTime(session.value.expiresAt)}</strong>
        </div>
        <div className={styles.sessionActions}>
          <label>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(event) => setAutoRefresh(event.target.checked)}
            />
            Auto refresh
          </label>
          <span>{lastRefresh ? `Updated ${relativeTime(lastRefresh)}` : "Not loaded"}</span>
          <button type="button" onClick={() => void loadOverview()} disabled={refreshing}>
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
          <button type="button" onClick={() => void logout()}>
            Lock
          </button>
        </div>
      </div>

      {error ? (
        <div className={styles.bannerError} role="alert">
          <strong>Operation blocked</strong>
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)}>Dismiss</button>
        </div>
      ) : null}
      {message ? (
        <div className={styles.bannerSuccess} role="status">
          <strong>Runtime updated</strong>
          <span>{message}</span>
          <button type="button" onClick={() => setMessage(null)}>Dismiss</button>
        </div>
      ) : null}

      <div className={styles.metricGrid}>
        <article>
          <small>Visible jobs</small>
          <strong>{summary.total}</strong>
          <span>current filter result</span>
        </article>
        <article>
          <small>Active leases</small>
          <strong>{summary.active}</strong>
          <span>leased or running</span>
        </article>
        <article>
          <small>Ready / held</small>
          <strong>{summary.ready}</strong>
          <span>waiting, queued, retry or paused</span>
        </article>
        <article className={summary.attention ? styles.metricAttention : ""}>
          <small>Needs attention</small>
          <strong>{summary.attention}</strong>
          <span>failed, blocked or dead letter</span>
        </article>
        <article>
          <small>Succeeded</small>
          <strong>{summary.succeeded}</strong>
          <span>immutable outputs committed</span>
        </article>
      </div>

      <div className={styles.controlRail}>
        <label>
          <span>State</span>
          <select
            value={stateFilter}
            onChange={(event) =>
              setStateFilter(event.target.value as OperatorRuntimeState | "all")
            }
          >
            <option value="all">All states</option>
            {OPERATOR_RUNTIME_STATES.map((state) => (
              <option key={state} value={state}>{STATE_LABELS[state]}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Queue</span>
          <input
            value={queueFilter}
            onChange={(event) => setQueueFilter(event.target.value)}
            placeholder="media"
          />
        </label>
        <label>
          <span>Kind</span>
          <input
            value={kindFilter}
            onChange={(event) => setKindFilter(event.target.value)}
            placeholder="sprite.atlas.build"
          />
        </label>
        <div className={styles.controlButtons}>
          <button type="button" onClick={() => setSubmissionOpen(true)}>
            New durable job
          </button>
          <button type="button" onClick={() => void recoverLeases()} disabled={refreshing}>
            Recover leases
          </button>
        </div>
      </div>

      <div className={styles.operationsGrid} id="jobs">
        <section className={styles.jobPanel} aria-labelledby="job-list-title">
          <header className={styles.panelHeader}>
            <div>
              <span>RUNTIME JOBS</span>
              <strong id="job-list-title">{jobs.length} records</strong>
            </div>
            <small>priority · updated · attempt</small>
          </header>
          <div className={styles.jobList}>
            {jobs.length ? (
              jobs.map((job) => (
                <button
                  type="button"
                  className={`${styles.jobRow} ${selectedJob?.id === job.id ? styles.jobRowSelected : ""}`}
                  key={job.id}
                  onClick={() => setSelectedJobId(job.id)}
                >
                  <span className={styles.jobStateLine} />
                  <div>
                    <strong>{job.spec.kind}</strong>
                    <span>{job.spec.queue} · {shortId(job.id, 24)}</span>
                    <small>{job.spec.labels.project ?? "unlabelled project"}</small>
                  </div>
                  <div className={styles.jobRowMeta}>
                    <StateBadge state={job.state} />
                    <b>P{job.spec.priority}</b>
                    <span>{job.attempts.length}/{job.attemptLimit}</span>
                    <small>{relativeTime(job.updatedAt)}</small>
                  </div>
                </button>
              ))
            ) : (
              <div className={styles.emptyList}>
                <strong>No jobs match this filter.</strong>
                <span>Submit a governed job or broaden the query.</span>
              </div>
            )}
          </div>
        </section>

        <section className={styles.detailPanel} aria-labelledby="job-detail-title">
          {selectedJob ? (
            <JobDetail
              job={selectedJob}
              onAction={(action) => setPendingAction({ jobId: selectedJob.id, action })}
              onArtifact={(value) => void inspectArtifact(value)}
            />
          ) : (
            <div className={styles.detailEmpty}>
              <span>JOB / NONE SELECTED</span>
              <h2 id="job-detail-title">Choose a durable job.</h2>
              <p>Attempts, dependencies, leases, failure evidence and output artifacts appear here.</p>
            </div>
          )}
        </section>
      </div>

      <section className={styles.eventPanel} id="events" aria-labelledby="event-title">
        <header className={styles.panelHeader}>
          <div>
            <span>IMMUTABLE EVENTS</span>
            <strong id="event-title">
              {selectedJob ? `Selected job · ${shortId(selectedJob.id, 24)}` : "All recent events"}
            </strong>
          </div>
          <small>{visibleEvents.length} visible · newest first</small>
        </header>
        <div className={styles.eventList}>
          {visibleEvents.length ? (
            visibleEvents.map((entry) => (
              <article key={entry.id}>
                <i />
                <time dateTime={entry.at}>{absoluteTime(entry.at)}</time>
                <div>
                  <strong>{eventTitle(entry)}</strong>
                  <span>{entry.actor}</span>
                  {entry.jobId ? <small>{shortId(entry.jobId, 38)}</small> : null}
                </div>
                <details>
                  <summary>Evidence</summary>
                  <pre>{safeJson(entry.data)}</pre>
                </details>
              </article>
            ))
          ) : (
            <div className={styles.emptyList}>
              <strong>No matching runtime events.</strong>
              <span>The journal remains authoritative even when this view is empty.</span>
            </div>
          )}
        </div>
      </section>

      {pendingAction && selectedJob ? (
        <div className={styles.modalBackdrop} role="presentation">
          <div className={styles.confirmDialog} role="dialog" aria-modal="true" aria-labelledby="confirm-title">
            <span>ACTION / CONFIRM</span>
            <h2 id="confirm-title">
              {pendingAction.action.charAt(0).toUpperCase() + pendingAction.action.slice(1)} this job?
            </h2>
            <p>
              The request is recorded as an immutable event. Active cancel or pause requests
              remain cooperative unless recovery or a later force action is explicitly used.
            </p>
            <code>{selectedJob.id}</code>
            <div>
              <button type="button" onClick={() => setPendingAction(null)} disabled={submittingAction}>
                Keep current state
              </button>
              <button
                className={styles.dangerButton}
                type="button"
                onClick={() => void runAction(pendingAction)}
                disabled={submittingAction}
              >
                {submittingAction ? "Recording action…" : `Confirm ${pendingAction.action}`}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {submissionOpen ? (
        <div className={styles.modalBackdrop} role="presentation">
          <div className={styles.submissionDialog} role="dialog" aria-modal="true" aria-labelledby="submission-title">
            <header>
              <div>
                <span>NEW JOB / JSON CONTRACT</span>
                <h2 id="submission-title">Submit governed production work.</h2>
              </div>
              <button type="button" onClick={() => setSubmissionOpen(false)}>Close</button>
            </header>
            <p>
              Submission is idempotent. Reusing the same queue and key with different work is rejected,
              and capability requirements are enforced before a worker can claim it.
            </p>
            <textarea
              spellCheck={false}
              value={submissionSource}
              onChange={(event) => setSubmissionSource(event.target.value)}
            />
            <div>
              <button type="button" onClick={() => setSubmissionSource(JSON.stringify(DEFAULT_SUBMISSION, null, 2))}>
                Reset example
              </button>
              <button className="button button--primary" type="button" onClick={() => void submitJob()} disabled={submittingJob}>
                {submittingJob ? "Submitting transaction…" : "Submit durable job"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {artifact.status !== "idle" ? (
        <ArtifactInspector artifact={artifact} onClose={() => setArtifact({ status: "idle" })} />
      ) : null}
    </section>
  );
}

function JobDetail({
  job,
  onAction,
  onArtifact,
}: Readonly<{
  job: OperatorRuntimeJob;
  onAction: (action: OperatorJobAction) => void;
  onArtifact: (artifactId: string) => void;
}>) {
  return (
    <div className={styles.jobDetail}>
      <header>
        <div>
          <span>JOB / {job.spec.queue.toUpperCase()}</span>
          <h2 id="job-detail-title">{job.spec.kind}</h2>
          <code title={job.id}>{job.id}</code>
        </div>
        <StateBadge state={job.state} />
      </header>

      <div className={styles.jobControls}>
        {canPause(job) ? <button type="button" onClick={() => onAction("pause")}>Pause</button> : null}
        {job.state === "paused" ? <button type="button" onClick={() => onAction("resume")}>Resume</button> : null}
        {canCancel(job) ? <button type="button" onClick={() => onAction("cancel")}>Cancel</button> : null}
        {canRedrive(job) ? <button type="button" onClick={() => onAction("redrive")}>Redrive +1</button> : null}
      </div>

      <div className={styles.detailMetrics}>
        <article><small>Priority</small><strong>{job.spec.priority}</strong></article>
        <article><small>Attempts</small><strong>{job.attempts.length}/{job.attemptLimit}</strong></article>
        <article><small>Redrives</small><strong>{job.redriveCount}</strong></article>
        <article><small>Updated</small><strong>{relativeTime(job.updatedAt)}</strong></article>
      </div>

      {job.failure ? (
        <section className={styles.failureCard}>
          <span>{job.failure.classification}</span>
          <h3>{job.failure.code}</h3>
          <p>{job.failure.message}</p>
          {job.failure.details !== undefined ? <pre>{safeJson(job.failure.details)}</pre> : null}
        </section>
      ) : null}

      <section className={styles.detailSection}>
        <div className={styles.sectionTitle}>
          <span>EXECUTION CONTRACT</span>
          <small>{shortId(job.specHash, 18)}</small>
        </div>
        <dl className={styles.definitionGrid}>
          <dt>Idempotency</dt><dd>{job.spec.idempotencyKey}</dd>
          <dt>Timeout</dt><dd>{Math.round(job.spec.timeoutMs / 1000)} seconds</dd>
          <dt>Lease</dt><dd>{Math.round(job.spec.leaseDurationMs / 1000)} seconds</dd>
          <dt>Next attempt</dt><dd>{job.nextAttemptAt ? absoluteTime(job.nextAttemptAt) : "Not scheduled"}</dd>
          <dt>Deadline</dt><dd>{job.spec.deadline ? absoluteTime(job.spec.deadline) : "No deadline"}</dd>
          <dt>Capabilities</dt><dd>{job.spec.requiredCapabilities.join(", ") || "None declared"}</dd>
        </dl>
        {job.lease ? (
          <div className={styles.leaseCard}>
            <span>ACTIVE LEASE</span>
            <strong>{job.lease.workerId}</strong>
            <small>expires {absoluteTime(job.lease.expiresAt)}</small>
          </div>
        ) : null}
        {job.cancellationRequestedAt ? <p className={styles.controlNotice}>Cancellation requested {relativeTime(job.cancellationRequestedAt)}.</p> : null}
        {job.pauseRequestedAt ? <p className={styles.controlNotice}>Pause requested {relativeTime(job.pauseRequestedAt)}.</p> : null}
      </section>

      <ArtifactList title="Input artifacts" values={job.spec.inputArtifacts} onArtifact={onArtifact} />
      <ArtifactList title="Output artifacts" values={job.outputArtifacts} onArtifact={onArtifact} />

      <section className={styles.detailSection}>
        <div className={styles.sectionTitle}>
          <span>ATTEMPT HISTORY</span>
          <small>{job.attempts.length} immutable records</small>
        </div>
        <div className={styles.attemptList}>
          {job.attempts.length ? (
            [...job.attempts].reverse().map((attempt) => (
              <article key={`${attempt.attempt}-${attempt.leasedAt}-${attempt.workerId}`}>
                <div>
                  <b>{String(attempt.attempt).padStart(2, "0")}</b>
                  <span>{attempt.outcome ?? "active"}</span>
                </div>
                <strong>{attempt.workerId}</strong>
                <small>{attemptDuration(attempt)} · {attempt.heartbeatCount} heartbeats</small>
                <time>{absoluteTime(attempt.startedAt ?? attempt.leasedAt)}</time>
                {attempt.failure ? <p>{attempt.failure.code} · {attempt.failure.message}</p> : null}
              </article>
            ))
          ) : (
            <p className={styles.emptyInline}>No worker has claimed this job.</p>
          )}
        </div>
      </section>

      <details className={styles.payloadPanel}>
        <summary>Private payload and labels</summary>
        <p>Payloads may contain local repository paths. This section is intentionally collapsed.</p>
        <pre>{safeJson({ payload: job.spec.payload, labels: job.spec.labels, dependencies: job.spec.dependencyJobIds })}</pre>
      </details>
    </div>
  );
}

function ArtifactList({
  title,
  values,
  onArtifact,
}: Readonly<{
  title: string;
  values: readonly string[];
  onArtifact: (artifactId: string) => void;
}>) {
  return (
    <section className={styles.detailSection}>
      <div className={styles.sectionTitle}>
        <span>{title.toUpperCase()}</span>
        <small>{values.length}</small>
      </div>
      {values.length ? (
        <div className={styles.artifactList}>
          {values.map((value) => (
            <button type="button" key={value} onClick={() => onArtifact(value)} title={value}>
              <i />
              <span>{shortId(value, 34)}</span>
              <b>Inspect</b>
            </button>
          ))}
        </div>
      ) : (
        <p className={styles.emptyInline}>No artifacts recorded.</p>
      )}
    </section>
  );
}

function ArtifactInspector({
  artifact,
  onClose,
}: Readonly<{ artifact: ActiveArtifactState; onClose: () => void }>) {
  return (
    <div className={styles.modalBackdrop} role="presentation">
      <div className={styles.artifactDialog} role="dialog" aria-modal="true" aria-labelledby="artifact-title">
        <header>
          <div>
            <span>IMMUTABLE ARTIFACT</span>
            <h2 id="artifact-title">{shortId(artifact.artifactId, 42)}</h2>
          </div>
          <button type="button" onClick={onClose}>Close</button>
        </header>
        {artifact.status === "loading" ? <LoadingPlate label="Verifying artifact" /> : null}
        {artifact.status === "error" ? <pre className={styles.errorMessage}>{artifact.message}</pre> : null}
        {artifact.status === "ready" ? (
          <>
            <div className={styles.artifactProof}>
              <article className={artifact.verification.contentValid ? styles.proofPass : styles.proofFail}>
                <small>Content hash</small>
                <strong>{artifact.verification.contentValid ? "VALID" : "MISMATCH"}</strong>
              </article>
              <article className={artifact.verification.descriptorValid ? styles.proofPass : styles.proofFail}>
                <small>Descriptor hash</small>
                <strong>{artifact.verification.descriptorValid ? "VALID" : "MISMATCH"}</strong>
              </article>
              <article>
                <small>Storage class</small>
                <strong>{artifact.descriptor.storageClass}</strong>
              </article>
              <article>
                <small>Size</small>
                <strong>{artifact.descriptor.byteLength.toLocaleString()} B</strong>
              </article>
            </div>
            <dl className={styles.definitionGrid}>
              <dt>Media type</dt><dd>{artifact.descriptor.mediaType}</dd>
              <dt>Filename</dt><dd>{artifact.descriptor.fileName ?? "Not declared"}</dd>
              <dt>Created</dt><dd>{absoluteTime(artifact.descriptor.createdAt)}</dd>
              <dt>Content SHA-256</dt><dd>{artifact.descriptor.contentSha256}</dd>
              <dt>Descriptor SHA-256</dt><dd>{artifact.descriptor.descriptorSha256}</dd>
              <dt>Sources</dt><dd>{artifact.descriptor.sourceArtifacts.length}</dd>
            </dl>
            <details className={styles.payloadPanel} open>
              <summary>Labels and metadata</summary>
              <pre>{safeJson({ labels: artifact.descriptor.labels, metadata: artifact.descriptor.metadata, sourceArtifacts: artifact.descriptor.sourceArtifacts })}</pre>
            </details>
          </>
        ) : null}
      </div>
    </div>
  );
}
