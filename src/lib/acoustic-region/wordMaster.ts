// 語彙マスタ（words）。設計: docs/acoustic-region-module.md
//
// 位置つき音素列は words.json + hangulPhonemes.ts から実行時に導出する
// （静的データの二重管理を避ける。1671語の変換は起動時1回で数ms程度）。
// WordRepository（ストレージ）への投入は Supabase 移行時に行う想定で、
// Phase 1 の分析・出題はこのメモリ上のマスタを直接参照する。

import wordsData from "../../data/words.json";
import type { WordRecord } from "./types";
import { toPhonemes, regionTags } from "./hangulPhonemes";

interface RawWord {
  w: string;
  e: string;
  p: number;
}

let master: Map<string, WordRecord> | null = null;

/** 単語 → WordRecord のマスタ（初回アクセス時に words.json から構築） */
export function getWordMaster(): Map<string, WordRecord> {
  if (!master) {
    master = new Map();
    for (const { w, e, p } of wordsData as RawWord[]) {
      const phonemes = toPhonemes(w);
      master.set(w, {
        id: `word:${w}`,
        word: w,
        // Phase 1 のデータ都合で英語（words.json の e）。meaning_ja 整備後に置き換える
        meaningJa: e,
        phonemeCount: p,
        phonemes,
        regions: regionTags(phonemes),
        // 既存の単語クイズと同じ音声ファイル命名規則
        audioRef: `/word_audios/${w.replace(/\?/g, "").replace(/ /g, "_")}.mp3`,
      });
    }
  }
  return master;
}

/** 指定の音響領域タグ（例: "final:t̚"）を含む語彙を返す（出題候補の選定用） */
export function wordsByRegion(regionTag: string): WordRecord[] {
  return [...getWordMaster().values()].filter((w) =>
    w.regions.includes(regionTag)
  );
}
