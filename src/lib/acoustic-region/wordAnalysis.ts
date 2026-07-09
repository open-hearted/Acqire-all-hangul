// 単語クイズ（/words）の error_log 連携と誤答の自動分類。
// 設計: docs/acoustic-region-module.md
//
// 語彙マスタの位置つき音素列（wordMaster.ts）と聞こえ方メモ（子母パターン）を
// 突き合わせて、どの位置のどの音素が知覚されなかったかを推定する。
// メモが無い・パターンが正解の部分列にならない場合は未分類（空配列）のまま
// 記録し、heard_pattern を後の分類の手がかりとして残す。
// 正誤の判別は answered_count と correct_phoneme_count の比較で行う
// （stats.ts の isErrorRecord）。

import type { ErrorRegion, NewErrorLog } from "./types";
import { LOCAL_USER_ID } from "./types";
import { isVowelPhoneme } from "./hangulPhonemes";
import { getWordMaster } from "./wordMaster";

/**
 * 聞こえ方メモ（子母パターン）と正解の音素列を突き合わせて誤答領域を推定する。
 *
 * 聞こえたパターンが正解パターンの部分列になっている場合のみ分類する。
 * 左から貪欲に対応づけ（部分列の存在判定として最適）、対応しなかった音素を
 * 知覚されなかった領域とする。隣に同じ音素が残っている場合は統合（merger、
 * 例: 설렁탕の l+l → "l:"）、それ以外は脱落（deletion）。
 * 分類できない場合（メモが空・過剰検出・置換が必要）は null = 未分類。
 */
export function classifyWordAnswer(
  word: string,
  heardPattern: string
): ErrorRegion[] | null {
  const entry = getWordMaster().get(word);
  if (!entry) return null;
  const actual = entry.phonemes;
  const heard = [...heardPattern].filter((c) => c === "子" || c === "母");
  if (heard.length === 0 || heard.length >= actual.length) return null;

  const missed: number[] = [];
  let h = 0;
  for (let a = 0; a < actual.length; a++) {
    const type = isVowelPhoneme(actual[a].phoneme) ? "母" : "子";
    if (h < heard.length && heard[h] === type) h++;
    else missed.push(a);
  }
  if (h < heard.length) return null; // 部分列でない → 未分類

  return missed.map((a) => {
    const ph = actual[a];
    const isMerger =
      actual[a - 1]?.phoneme === ph.phoneme ||
      actual[a + 1]?.phoneme === ph.phoneme;
    return isMerger
      ? { position: ph.position, type: "merger" as const, phoneme: `${ph.phoneme}:` }
      : { position: ph.position, type: "deletion" as const, phoneme: ph.phoneme };
  });
}

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
  const isWrong = input.answeredCount !== input.correctPhonemeCount;
  const errorRegions =
    isWrong && input.heardPattern
      ? (classifyWordAnswer(input.word, input.heardPattern) ?? [])
      : [];
  return {
    userId: input.userId ?? LOCAL_USER_ID,
    word: input.word,
    meaning: input.meaning,
    correctPhonemeCount: input.correctPhonemeCount,
    answeredCount: input.answeredCount,
    heardPattern: input.heardPattern ?? "",
    errorRegions,
    heardPhonemes: null,
    wordKnown: null,
    listeningCondition: null,
    conditionNote: null,
  };
}
