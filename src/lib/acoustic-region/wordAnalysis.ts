// 単語クイズ（/words）の error_log 連携。
// 設計: docs/acoustic-region-module.md
//
// 語彙マスタの位置つき音素列が未整備のため、単語の誤答は母音クイズと違って
// error_regions を自動導出できない。誤答は未分類（空配列）のまま記録し、
// heard_pattern を後の分類の手がかりとして残す。
// 正誤の判別は answered_count と correct_phoneme_count の比較で行う
// （stats.ts の isErrorRecord）。

import type { NewErrorLog } from "./types";
import { LOCAL_USER_ID } from "./types";

export interface WordAnswerInput {
  word: string;
  /** 意味（Phase 1 のデータ都合で英語。meaning_ja 整備後に置き換える） */
  meaning: string;
  correctPhonemeCount: number;
  answeredCount: number;
  /** 聞こえ方メモ（例: "子母"）。誤答時のみ入力される想定 */
  heardPattern?: string;
  userId?: string;
}

export function buildWordErrorLog(input: WordAnswerInput): NewErrorLog {
  return {
    userId: input.userId ?? LOCAL_USER_ID,
    word: input.word,
    meaning: input.meaning,
    correctPhonemeCount: input.correctPhonemeCount,
    answeredCount: input.answeredCount,
    heardPattern: input.heardPattern ?? "",
    errorRegions: [],
    listeningCondition: null,
    conditionNote: null,
  };
}
