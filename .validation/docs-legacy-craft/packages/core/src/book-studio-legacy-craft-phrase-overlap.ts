import type {
  EvavoCraftPhraseOverlapFinding,
  EvavoCraftPhraseOverlapScan,
  EvavoCraftPhraseReference,
} from "./book-studio-legacy-craft-genome-types";
import { cleanCraftIds, craftWords, sha256CraftText } from "./book-studio-legacy-craft-genome-utils";

function longestOverlap(candidate: string[], reference: string[], minimum: number): Array<{ candidateIndex: number; referenceIndex: number; length: number }> {
  const index = new Map<string, number[]>();
  for (let position = 0; position <= reference.length - minimum; position += 1) {
    const key = reference.slice(position, position + minimum).join("\u241f");
    const positions = index.get(key) ?? [];
    if (positions.length < 32) positions.push(position);
    index.set(key, positions);
  }
  const matches: Array<{ candidateIndex: number; referenceIndex: number; length: number }> = [];
  for (let candidateIndex = 0; candidateIndex <= candidate.length - minimum; candidateIndex += 1) {
    const key = candidate.slice(candidateIndex, candidateIndex + minimum).join("\u241f");
    for (const referenceIndex of index.get(key) ?? []) {
      let length = minimum;
      while (candidateIndex + length < candidate.length && referenceIndex + length < reference.length && candidate[candidateIndex + length] === reference[referenceIndex + length] && length < 96) length += 1;
      matches.push({ candidateIndex, referenceIndex, length });
    }
  }
  return matches.sort((left, right) => right.length - left.length || left.candidateIndex - right.candidateIndex);
}

export function scanEvavoCraftPhraseOverlap(input: {
  scanId: string;
  candidateId: string;
  candidateText: string;
  references: EvavoCraftPhraseReference[];
  warningNgram?: number;
  blockingNgram?: number;
}): EvavoCraftPhraseOverlapScan {
  const warningNgram = input.warningNgram ?? 8;
  const blockingNgram = input.blockingNgram ?? 12;
  if (!input.scanId.trim() || !input.candidateId.trim() || !input.candidateText.trim()) throw new Error("Craft phrase-overlap scan requires stable scan, candidate and non-empty text identity.");
  if (input.candidateText.length > 500_000) throw new Error("Craft phrase-overlap candidate text exceeds the 500,000 character bound.");
  if (!Number.isInteger(warningNgram) || warningNgram < 5 || warningNgram > 20) throw new Error("Craft phrase-overlap warningNgram must be an integer from 5 to 20.");
  if (!Number.isInteger(blockingNgram) || blockingNgram <= warningNgram || blockingNgram > 40) throw new Error("Craft phrase-overlap blockingNgram must be greater than warningNgram and no more than 40.");
  if (!input.references.length || input.references.length > 64) throw new Error("Craft phrase-overlap scan requires 1-64 references.");
  if (new Set(input.references.map((item) => item.referenceId)).size !== input.references.length) throw new Error("Craft phrase-overlap reference IDs must be unique.");

  const totalReferenceCharacters = input.references.reduce((sum, reference) => sum + reference.text.length, 0);
  if (input.references.some((reference) => reference.text.length > 1_000_000) || totalReferenceCharacters > 5_000_000) throw new Error("Craft phrase-overlap references exceed bounded per-reference or total text limits.");

  const candidateTokens = craftWords(input.candidateText);
  const findings: EvavoCraftPhraseOverlapFinding[] = [];
  const referenceFingerprints: Array<{ referenceId: string; textSha256: string }> = [];

  for (const reference of [...input.references].sort((left, right) => left.referenceId.localeCompare(right.referenceId))) {
    if (!reference.referenceId.trim() || !reference.text.trim() || !cleanCraftIds(reference.rightsEvidenceIds).length) throw new Error(`Craft phrase reference ${reference.referenceId || "<unknown>"} requires identity, text and rights evidence.`);
    if (reference.allowQuotedUse && !["public_domain", "licensed", "user_owned", "project_owned"].includes(reference.sourceKind)) throw new Error(`Craft phrase reference ${reference.referenceId} cannot authorise quoted use for source kind ${reference.sourceKind}.`);
    const textSha256 = sha256CraftText(reference.text);
    if (reference.textSha256 && reference.textSha256 !== textSha256) throw new Error(`Craft phrase reference ${reference.referenceId} does not match its declared SHA-256 identity.`);
    referenceFingerprints.push({ referenceId: reference.referenceId, textSha256 });

    const matches = longestOverlap(candidateTokens, craftWords(reference.text), warningNgram);
    const occupied: Array<[number, number]> = [];
    for (const match of matches) {
      if (findings.filter((item) => item.referenceId === reference.referenceId).length >= 20) break;
      const end = match.candidateIndex + match.length;
      if (occupied.some(([start, previousEnd]) => match.candidateIndex < previousEnd && end > start)) continue;
      occupied.push([match.candidateIndex, end]);
      const allowedQuotedUse = reference.allowQuotedUse === true;
      const severity: EvavoCraftPhraseOverlapFinding["severity"] = allowedQuotedUse ? "info" : match.length >= blockingNgram ? "blocking" : "warning";
      const matchedText = candidateTokens.slice(match.candidateIndex, end).join(" ");
      findings.push({
        findingId: `craft-overlap:${sha256CraftText(`${input.candidateId}\n${reference.referenceId}\n${match.candidateIndex}\n${match.referenceIndex}\n${matchedText}`).slice(7, 23)}`,
        referenceId: reference.referenceId,
        overlapWords: match.length,
        matchedText: matchedText.length > 240 ? `${matchedText.slice(0, 237)}...` : matchedText,
        candidateTokenIndex: match.candidateIndex,
        referenceTokenIndex: match.referenceIndex,
        severity,
        allowedQuotedUse,
      });
    }
  }

  const blockingFindingIds = findings.filter((item) => item.severity === "blocking").map((item) => item.findingId);
  return {
    outputKind: "evavo_book_studio_craft_phrase_overlap_scan",
    schemaVersion: 1,
    scanId: input.scanId,
    candidateId: input.candidateId,
    candidateTextSha256: sha256CraftText(input.candidateText),
    warningNgram,
    blockingNgram,
    referenceFingerprints,
    findings,
    blockingFindingIds,
    accepted: blockingFindingIds.length === 0,
    boundary: "This deterministic scan detects contiguous phrase reuse against supplied, rights-tracked comparison material. It does not decide copyright law or literary quality; blocking matches must be removed, justified as authorised quotation, or reviewed by a qualified human before canonical admission.",
  };
}
