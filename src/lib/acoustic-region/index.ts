// 音響領域学習モジュールの公開エントリポイント。
// 設計: docs/acoustic-region-module.md
//
// 利用側は getRepositories() 経由でのみストレージに触れること。
// Phase 2（Supabase 移行）はこのファクトリの返す実装を差し替えるだけで済む。

import type { AcousticRegionRepositories } from "./repository";
import { createLocalRepositories } from "./localStorageRepository";

export * from "./types";
export type {
  ErrorLogRepository,
  WordRepository,
  AcousticRegionRepositories,
} from "./repository";
export {
  createLocalRepositories,
  createLocalStorageStore,
  createMemoryStore,
} from "./localStorageRepository";
export type { JsonStore } from "./localStorageRepository";
export {
  VOWELS,
  vowelPhonemeCount,
  classifyVowelAnswer,
  buildVowelErrorLog,
} from "./vowelAnalysis";
export type { VowelInfo } from "./vowelAnalysis";
export { buildWordErrorLog, classifyWordAnswer } from "./wordAnalysis";
export type { WordAnswerInput } from "./wordAnalysis";
export {
  toPhonemes,
  toPattern,
  isVowelPhoneme,
  regionTags,
} from "./hangulPhonemes";
export { getWordMaster, wordsByRegion } from "./wordMaster";
export { buildExportSummary } from "./exportSummary";
export {
  WILDCARD_VOWEL,
  WILDCARD_CONSONANT,
  isWildcard,
  KEYBOARD_VOWELS,
  KEYBOARD_CONSONANTS,
  alignTranscription,
  judgeTranscription,
  buildTranscriptionErrorLog,
} from "./transcriptionAnalysis";
export type {
  AlignedSlot,
  SlotKind,
  TranscriptionGrade,
  TranscriptionJudgement,
  TranscriptionAnswerInput,
} from "./transcriptionAnalysis";
export {
  computeVowelCoverage,
  computeWordCoverage,
  tallyErrorRegions,
  coverageRate,
  tagCoverageRate,
  errorRegionTag,
  regionLabel,
  tagLabel,
  isErrorRecord,
  listUnclassifiedErrors,
  computeWordProgress,
  tallyConfusions,
} from "./stats";
export type {
  RegionCoverage,
  RegionErrorTally,
  TagCoverage,
  WordProgress,
  ConfusionPair,
} from "./stats";

let repositories: AcousticRegionRepositories | null = null;

/** アプリ全体で共有するリポジトリ一式（Phase 1 は localStorage 実装） */
export function getRepositories(): AcousticRegionRepositories {
  if (!repositories) {
    repositories = createLocalRepositories();
  }
  return repositories;
}
