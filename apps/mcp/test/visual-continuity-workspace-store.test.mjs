import assert from "node:assert/strict";
import test from "node:test";

import {
  visualContinuityApprovalReferenceName,
  visualContinuityHandoffReferenceName,
  visualContinuitySessionReferenceName,
  visualContinuityWorkspaceNamespace,
} from "../dist/visual-continuity-workspace-store.js";

const longId = (suffix) => `${"a".repeat(158)}${suffix}`;

function assertSafeSegment(segment) {
  assert.match(segment, /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u);
  assert.ok(segment.length <= 128);
}

test("continuity workspace keys remain safe at maximum protocol ID length", () => {
  const projectId = longId("1");
  const bibleId = longId("2");
  const sessionId = longId("3");
  const workItemId = longId("4");
  const receiverId = longId("5");

  const namespace = visualContinuityWorkspaceNamespace(projectId, bibleId);
  const namespaceSegments = namespace.split("/");
  assert.equal(namespaceSegments.length, 3);
  namespaceSegments.forEach(assertSafeSegment);

  const session = visualContinuitySessionReferenceName(sessionId);
  const approval = visualContinuityApprovalReferenceName(
    sessionId,
    workItemId,
  );
  const handoff = visualContinuityHandoffReferenceName(
    sessionId,
    "3d-studio",
    receiverId,
  );
  [session, approval, handoff].forEach(assertSafeSegment);

  assert.equal(
    namespace,
    visualContinuityWorkspaceNamespace(projectId, bibleId),
  );
  assert.equal(
    approval,
    visualContinuityApprovalReferenceName(sessionId, workItemId),
  );
});

test("equal readable prefixes still receive distinct digest-backed keys", () => {
  const sharedPrefix = "same-prefix-".padEnd(80, "x");
  const first = `${sharedPrefix}first`;
  const second = `${sharedPrefix}second`;
  assert.notEqual(
    visualContinuitySessionReferenceName(first),
    visualContinuitySessionReferenceName(second),
  );
  assert.notEqual(
    visualContinuityWorkspaceNamespace(first, "bible"),
    visualContinuityWorkspaceNamespace(second, "bible"),
  );
});
