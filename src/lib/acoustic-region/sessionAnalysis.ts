// IPA転写クイズ1セッション分を、AIへ渡す前にローカルで決定的に集計する。
// AIには生の全回答ではなく、件数・混同パターン・少数の代表例だけを渡す。

import { alignTranscription, isWildcard } from "./transcriptionAnalysis";
import type {
  SlotKind,
  TranscriptionGrade,
} from "./transcriptionAnalysis";
import type { PositionedPhoneme, RegionPosition } from "./types";

export interface TranscriptionSessionResult {
  word: string;
  meaning: string;
  grade: TranscriptionGrade;
  summary: string;
  correctPhonemes: PositionedPhoneme[];
  heardPhonemes: string[];
  wordKnown: boolean | null;
}

export interface AnalysisExample {
  word: string;
  meaning: string;
  correct: string;
  input: string;
}

export interface TranscriptionErrorPattern {
  kind: Exclude<SlotKind, "match">;
  position: RegionPosition;
  expected: string | null;
  heard: string | null;
  count: number;
  examples: AnalysisExample[];
}

export interface TranscriptionSessionAnalysis {
  schemaVersion: 1;
  analyzedAt: string;
  totalQuestions: number;
  grades: Record<TranscriptionGrade, number>;
  wordKnownButNotPerfect: number;
  slotCounts: Record<Exclude<SlotKind, "match">, number>;
  totalNonMatchSlots: number;
  patternsIncluded: number;
  patternsOmitted: number;
  patterns: TranscriptionErrorPattern[];
}

const MAX_PATTERNS_FOR_AI = 40;
const MAX_EXAMPLES_PER_PATTERN = 3;

export function formatPhonemeSequence(phonemes: string[]): string {
  return phonemes.map((p) => (isWildcard(p) ? `${p}?` : p)).join(" ");
}

function patternKey(
  kind: Exclude<SlotKind, "match">,
  position: RegionPosition,
  expected: string | null,
  heard: string | null
): string {
  return `${kind}\u0000${position}\u0000${expected ?? ""}\u0000${heard ?? ""}`;
}

export function aggregateTranscriptionSession(
  results: TranscriptionSessionResult[]
): TranscriptionSessionAnalysis {
  const grades: Record<TranscriptionGrade, number> = {
    perfect: 0,
    pattern: 0,
    mismatch: 0,
  };
  const slotCounts: Record<Exclude<SlotKind, "match">, number> = {
    category: 0,
    substitution: 0,
    deletion: 0,
    insertion: 0,
  };
  const patterns = new Map<string, TranscriptionErrorPattern>();
  let wordKnownButNotPerfect = 0;

  for (const result of results) {
    grades[result.grade]++;
    if (result.wordKnown === true && result.grade !== "perfect") {
      wordKnownButNotPerfect++;
    }

    const slots = alignTranscription(
      result.correctPhonemes,
      result.heardPhonemes
    );
    let nearestPosition: RegionPosition = "initial";

    for (const slot of slots) {
      if (slot.actual) nearestPosition = slot.actual.position;
      if (slot.kind === "match") continue;

      const kind = slot.kind;
      const position = slot.actual?.position ?? nearestPosition;
      const expected = slot.actual?.phoneme ?? null;
      const heard = slot.heard ?? null;
      slotCounts[kind]++;

      const key = patternKey(kind, position, expected, heard);
      let pattern = patterns.get(key);
      if (!pattern) {
        pattern = {
          kind,
          position,
          expected,
          heard,
          count: 0,
          examples: [],
        };
        patterns.set(key, pattern);
      }
      pattern.count++;
      if (pattern.examples.length < MAX_EXAMPLES_PER_PATTERN) {
        pattern.examples.push({
          word: result.word,
          meaning: result.meaning,
          correct: formatPhonemeSequence(
            result.correctPhonemes.map((p) => p.phoneme)
          ),
          input: formatPhonemeSequence(result.heardPhonemes),
        });
      }
    }
  }

  const sortedPatterns = [...patterns.values()].sort(
    (a, b) =>
      b.count - a.count ||
      `${a.kind}:${a.position}:${a.expected}:${a.heard}`.localeCompare(
        `${b.kind}:${b.position}:${b.expected}:${b.heard}`
      )
  );
  const included = sortedPatterns.slice(0, MAX_PATTERNS_FOR_AI);

  return {
    schemaVersion: 1,
    analyzedAt: new Date().toISOString(),
    totalQuestions: results.length,
    grades,
    wordKnownButNotPerfect,
    slotCounts,
    totalNonMatchSlots: Object.values(slotCounts).reduce(
      (sum, count) => sum + count,
      0
    ),
    patternsIncluded: included.length,
    patternsOmitted: Math.max(0, sortedPatterns.length - included.length),
    patterns: included,
  };
}
