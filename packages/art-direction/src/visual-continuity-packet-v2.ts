import type {
  CompiledVisualContinuityBible,
  CompiledVisualContinuitySession,
  VisualContinuityPacketJob,
  VisualContinuityWorkPacket,
} from "./visual-continuity-types.js";
import {
  compileNextVisualContinuityWorkPacket as compileHardenedVisualContinuityPacket,
} from "./visual-continuity-hardening.js";
import { fail, freeze, hash } from "./visual-continuity-internal.js";

function canonicalReferences(
  bible: CompiledVisualContinuityBible,
  session: CompiledVisualContinuitySession,
  job: VisualContinuityPacketJob,
): VisualContinuityPacketJob["references"] {
  const item = session.workItems.find(
    (candidate) => candidate.id === job.workItemId,
  );
  if (!item) {
    fail(
      "VISUAL_CONTINUITY_REFERENCE_INVALID",
      `Unknown work item ${job.workItemId}.`,
    );
  }
  const mapProfiles = bible.mapProfiles.filter((profile) =>
    item.mapProfileIds.includes(profile.id),
  );
  const symbolIds = new Set(
    mapProfiles.flatMap((profile) => profile.symbolIds),
  );
  const symbolReferenceIds = new Set(
    bible.mapSymbols
      .filter((symbol) => symbolIds.has(symbol.id))
      .flatMap((symbol) => symbol.referenceIds),
  );
  const references = new Map(
    job.references.map((reference) => [reference.id, reference] as const),
  );
  for (const reference of bible.references) {
    if (!symbolReferenceIds.has(reference.id) || references.has(reference.id)) {
      continue;
    }
    references.set(reference.id, {
      id: reference.id,
      role: reference.role,
      uri: reference.uri,
      sha256: reference.sha256,
      required: reference.role !== "negative-reference",
    });
  }
  return [...references.values()].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
}

export function compileNextVisualContinuityWorkPacket(
  bible: CompiledVisualContinuityBible,
  session: CompiledVisualContinuitySession,
): VisualContinuityWorkPacket {
  const packet = compileHardenedVisualContinuityPacket(bible, session);
  const jobs = packet.jobs.map((job) => {
    const { jobSha256: _jobSha256, ...jobWithoutDigest } = job;
    const unsignedJob = {
      ...jobWithoutDigest,
      references: canonicalReferences(bible, session, job),
    };
    return freeze({
      ...unsignedJob,
      jobSha256: hash(unsignedJob),
    });
  });
  const { packetSha256: _packetSha256, ...packetWithoutDigest } = packet;
  const unsignedPacket = {
    ...packetWithoutDigest,
    jobs,
    resume: {
      ...packet.resume,
      token: hash({
        bibleSha256: packet.bibleSha256,
        sessionSha256: packet.sessionSha256,
        jobSha256s: jobs.map((job) => job.jobSha256),
      }),
    },
  };
  return freeze({
    ...unsignedPacket,
    packetSha256: hash(unsignedPacket),
  });
}
