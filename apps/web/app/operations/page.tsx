import type { Metadata } from "next";

import RuntimeOperationsDashboard from "./runtime-operations-dashboard";
import styles from "./operations.module.css";

export const metadata: Metadata = {
  title: "Runtime Operations · EVAVO Art Studio",
  description:
    "Private owner control room for durable Art Studio jobs, attempts, artifacts and recovery evidence.",
};

export const dynamic = "force-dynamic";

export default function RuntimeOperationsPage() {
  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <a className={styles.wordmark} href="/" aria-label="Return to EVAVO Art Studio">
          <span>EVAVO</span>
          <strong>ART STUDIO</strong>
        </a>
        <nav aria-label="Runtime navigation">
          <a href="/">Studio</a>
          <a href="#jobs">Jobs</a>
          <a href="#events">Events</a>
        </nav>
        <span className={styles.privateMark}>
          <i /> Owner operations
        </span>
      </header>

      <section className={styles.intro}>
        <div>
          <p className={styles.eyebrow}>Durable production control room</p>
          <h1>
            Every attempt visible. <em>Every output provable.</em>
          </h1>
          <p>
            Monitor capability-scoped workers, inspect immutable attempts, recover expired
            leases and control jobs without exposing the Art Studio API token to the browser.
          </p>
        </div>
        <div className={styles.systemPlate} aria-label="Runtime control guarantees">
          <span>CONTROL PATH</span>
          <strong>HTTPONLY SESSION</strong>
          <span>JOB SOURCE</span>
          <strong>IMMUTABLE JOURNAL</strong>
          <span>OUTPUT PROOF</span>
          <strong>SHA-256 ARTIFACTS</strong>
          <span>EXECUTION</span>
          <strong>WORKER ONLY</strong>
        </div>
      </section>

      <RuntimeOperationsDashboard />

      <footer className={styles.footer}>
        <span>EVAVO Art Studio</span>
        <p>Private durable production operations.</p>
        <small>Browser token isolation · policy-gated control</small>
      </footer>
    </main>
  );
}
