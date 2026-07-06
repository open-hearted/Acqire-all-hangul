// 基本母音クイズ（音素数クイズ）のエラー分析。
// 設計: docs/acoustic-region-module.md
//
// 母音クイズは1音節・回答が音素数のみなので、単語クイズと違って
// 聞こえ方メモなしで error_regions を一意に導出できる。
// - 2音素（わたり音+母音）を1と回答 → 中声のわたり音の統合（merger）。
//   日本語はわたり音を拗音として母音と一体のモーラ単位で扱うため、
//   /ja/ 等を1つの音として写像する
// - 1音素を2と回答 → 過剰検出（insertion）
// - 正答 → errorRegions は空配列（領域ごとの検出成功率の分母になる）

import type { ErrorRegion, NewErrorLog } from "./types";
import { LOCAL_USER_ID } from "./types";

// ─── 母音テーブル ────────────────────────────────────────────────────────

export interface VowelInfo {
  /** IPA 表記（例: ja） */
  ipa: string;
  /** わたり音（2音素母音のみ。単母音は null） */
  glide: "j" | "w" | "ɰ" | null;
}

export const VOWELS: Record<string, VowelInfo> = {
  // 単母音（1音素）
  "ㅏ": { ipa: "a", glide: null },
  "ㅓ": { ipa: "ʌ", glide: null },
  "ㅗ": { ipa: "o", glide: null },
  "ㅜ": { ipa: "u", glide: null },
  "ㅡ": { ipa: "ɯ", glide: null },
  "ㅣ": { ipa: "i", glide: null },
  "ㅐ": { ipa: "ɛ", glide: null },
  "ㅔ": { ipa: "e", glide: null },
  // j 系わたり音（2音素）
  "ㅑ": { ipa: "ja", glide: "j" },
  "ㅕ": { ipa: "jʌ", glide: "j" },
  "ㅛ": { ipa: "jo", glide: "j" },
  "ㅠ": { ipa: "ju", glide: "j" },
  "ㅒ": { ipa: "jɛ", glide: "j" },
  "ㅖ": { ipa: "je", glide: "j" },
  // w 系わたり音（2音素）
  "ㅘ": { ipa: "wa", glide: "w" },
  "ㅙ": { ipa: "wɛ", glide: "w" },
  "ㅚ": { ipa: "we", glide: "w" },
  "ㅝ": { ipa: "wʌ", glide: "w" },
  "ㅞ": { ipa: "we", glide: "w" },
  "ㅟ": { ipa: "wi", glide: "w" },
  // ɰ 系（2音素）
  "ㅢ": { ipa: "ɰi", glide: "ɰ" },
};

export function vowelPhonemeCount(info: VowelInfo): number {
  return info.glide ? 2 : 1;
}

// ─── 分類 ────────────────────────────────────────────────────────────────

/**
 * 母音クイズの1回答を音響領域に分類する。
 * 母音単体の出題なので位置は常に medial（中声）。
 * 正答なら空配列。未知の母音字は null。
 */
export function classifyVowelAnswer(
  vowel: string,
  answeredCount: number
): ErrorRegion[] | null {
  const info = VOWELS[vowel];
  if (!info) return null;
  const correct = vowelPhonemeCount(info);
  if (answeredCount === correct) return [];
  if (answeredCount < correct && info.glide) {
    // わたり音+母音を1音に統合して知覚した
    return [{ position: "medial", type: "merger", phoneme: info.glide }];
  }
  // 実際より多く知覚した（過剰検出）
  return [{ position: "medial", type: "insertion", phoneme: info.ipa }];
}

/**
 * 母音クイズの1回答を error_log レコード入力に変換する。
 * meaning: 単母音に語彙的意味はないため IPA 読みを充てる
 * （意味ごと投入するのは訓練の出力側。母音クイズは領域検出の入力側）。
 */
export function buildVowelErrorLog(
  vowel: string,
  answeredCount: number,
  userId: string = LOCAL_USER_ID
): NewErrorLog | null {
  const info = VOWELS[vowel];
  const errorRegions = classifyVowelAnswer(vowel, answeredCount);
  if (!info || errorRegions === null) return null;
  return {
    userId,
    word: vowel,
    meaning: `/${info.ipa}/`,
    correctPhonemeCount: vowelPhonemeCount(info),
    answeredCount,
    heardPattern: "",
    errorRegions,
    heardPhonemes: null,
    wordKnown: null,
    listeningCondition: null,
    conditionNote: null,
  };
}
