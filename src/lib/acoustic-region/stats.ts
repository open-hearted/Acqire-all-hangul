// 音響領域の被覆率の集計。設計: docs/acoustic-region-module.md（進捗表示）
//
// 進捗は正答率ではなく「音響領域ごとの検出成功率」で見る。
// 分母 = その領域が試された回数、分子 = 検出に成功した回数。

import type { ErrorLogRecord, ErrorRegion } from "./types";
import { regionKey } from "./types";
import { VOWELS } from "./vowelAnalysis";

export interface RegionCoverage {
  key: string;
  region: ErrorRegion;
  /** この領域が試された回数（分母） */
  attempts: number;
  /** 検出に成功した回数（分子） */
  detected: number;
  /** この領域を試した文字/単語（表示用） */
  words: string[];
}

export function coverageRate(c: RegionCoverage): number {
  return c.attempts === 0 ? 0 : c.detected / c.attempts;
}

/**
 * 母音クイズ由来のレコード（word が母音字）から領域ごとの検出成功率を集計する。
 * 母音1字が試す領域は一意に決まる:
 * わたり音つき → その glide の統合、単母音 → その母音の過剰検出。
 * 知覚不能順（成功率の低い順）で返す。出題の優先順位もこの順に従う。
 */
export function computeVowelCoverage(
  records: ErrorLogRecord[]
): RegionCoverage[] {
  const map = new Map<string, RegionCoverage>();
  for (const r of records) {
    const info = VOWELS[r.word];
    if (!info) continue; // 単語クイズ由来などはここでは扱わない
    const region: ErrorRegion = info.glide
      ? { position: "medial", type: "merger", phoneme: info.glide }
      : { position: "medial", type: "insertion", phoneme: info.ipa };
    const key = regionKey(region);
    let entry = map.get(key);
    if (!entry) {
      entry = { key, region, attempts: 0, detected: 0, words: [] };
      map.set(key, entry);
    }
    entry.attempts += 1;
    if (r.errorRegions.length === 0) entry.detected += 1;
    if (!entry.words.includes(r.word)) entry.words.push(r.word);
  }
  return [...map.values()].sort((a, b) => coverageRate(a) - coverageRate(b));
}

export interface RegionErrorTally {
  key: string;
  region: ErrorRegion;
  count: number;
  /** 最後にこの領域で誤答した日時（ISO 8601） */
  lastAt: string;
  words: string[];
}

/**
 * 全レコードの error_regions を領域ごとに集計する（出所を問わない）。
 * 分母（試行回数）が分からない語彙由来のレコードも含めて誤答の分布を見るためのもの。
 * 出現回数の多い順で返す。
 */
export function tallyErrorRegions(
  records: ErrorLogRecord[]
): RegionErrorTally[] {
  const map = new Map<string, RegionErrorTally>();
  for (const r of records) {
    for (const region of r.errorRegions) {
      const key = regionKey(region);
      let entry = map.get(key);
      if (!entry) {
        entry = { key, region, count: 0, lastAt: r.createdAt, words: [] };
        map.set(key, entry);
      }
      entry.count += 1;
      if (r.createdAt > entry.lastAt) entry.lastAt = r.createdAt;
      if (!entry.words.includes(r.word)) entry.words.push(r.word);
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

// ─── 表示用ラベル ────────────────────────────────────────────────────────

const POSITION_LABEL: Record<ErrorRegion["position"], string> = {
  initial: "初声",
  medial: "中声",
  final: "終声",
};

const TYPE_LABEL: Record<ErrorRegion["type"], string> = {
  deletion: "脱落",
  merger: "統合",
  insertion: "過剰検出",
};

/** 例: 中声 /j/ の統合 */
export function regionLabel(region: ErrorRegion): string {
  return `${POSITION_LABEL[region.position]} /${region.phoneme}/ の${TYPE_LABEL[region.type]}`;
}
