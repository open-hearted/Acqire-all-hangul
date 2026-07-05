// 音響領域の被覆率の集計。設計: docs/acoustic-region-module.md（進捗表示）
//
// 進捗は正答率ではなく「音響領域ごとの検出成功率」で見る。
// 分母 = その領域が試された回数、分子 = 検出に成功した回数。

import type { ErrorLogRecord, ErrorRegion, RegionPosition } from "./types";
import { regionKey } from "./types";
import { VOWELS } from "./vowelAnalysis";
import { getWordMaster } from "./wordMaster";

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

// ─── 単語の被覆率（語彙マスタの領域タグベース） ─────────────────────────────

export interface TagCoverage {
  /** 領域タグ（例: "final:t̚"） */
  tag: string;
  position: RegionPosition;
  phoneme: string;
  /** この領域を含む語が出題された回数（分母） */
  attempts: number;
  /** この領域で誤答しなかった回数（分子） */
  detected: number;
  /** この領域を試した単語（表示用） */
  words: string[];
}

export function tagCoverageRate(c: TagCoverage): number {
  return c.attempts === 0 ? 0 : c.detected / c.attempts;
}

/** ErrorRegion → 領域タグ（merger の "l:" は基底音素 "l" に落とす） */
export function errorRegionTag(region: ErrorRegion): string {
  return `${region.position}:${region.phoneme.replace(/:$/, "")}`;
}

/**
 * 単語クイズ由来のレコードから、語彙マスタの領域タグごとの検出成功率を集計する。
 * 出題された語が含む全領域が分母になり、誤答領域に該当した分だけ分子が減る。
 * 未分類の誤答（どの領域で失敗したか不明）は集計から除外する。
 * 知覚不能順（成功率の低い順）で返す。
 */
export function computeWordCoverage(
  records: ErrorLogRecord[]
): TagCoverage[] {
  const master = getWordMaster();
  const map = new Map<string, TagCoverage>();
  for (const r of records) {
    const entry = master.get(r.word);
    if (!entry) continue; // 母音クイズ由来などはここでは扱わない
    const wrong = r.answeredCount !== r.correctPhonemeCount;
    if (wrong && r.errorRegions.length === 0) continue; // 未分類誤答は除外
    const errTags = new Set(r.errorRegions.map(errorRegionTag));
    for (const tag of entry.regions) {
      let cov = map.get(tag);
      if (!cov) {
        const [position, phoneme] = tag.split(":") as [RegionPosition, string];
        cov = { tag, position, phoneme, attempts: 0, detected: 0, words: [] };
        map.set(tag, cov);
      }
      cov.attempts += 1;
      if (!errTags.has(tag)) cov.detected += 1;
      if (!cov.words.includes(r.word)) cov.words.push(r.word);
    }
  }
  return [...map.values()].sort(
    (a, b) => tagCoverageRate(a) - tagCoverageRate(b)
  );
}

/** 出題結果が誤答かどうか（領域分類の有無に依らない） */
export function isErrorRecord(r: ErrorLogRecord): boolean {
  return r.answeredCount !== r.correctPhonemeCount || r.errorRegions.length > 0;
}

/**
 * 誤答だが error_regions が未分類のレコード（新しい順）。
 * 単語クイズ由来の誤答は音素列マスタが未整備のため自動分類できず、ここに入る。
 * heard_pattern が後の分類の手がかりになる。
 */
export function listUnclassifiedErrors(
  records: ErrorLogRecord[]
): ErrorLogRecord[] {
  return records
    .filter(
      (r) =>
        r.answeredCount !== r.correctPhonemeCount && r.errorRegions.length === 0
    )
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
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

// ─── 再測定の推移（過去の自分との対決） ─────────────────────────────────────

export interface WordProgress {
  word: string;
  meaning: string;
  /** 最新レコード時点の正解音素数 */
  correctPhonemeCount: number;
  /** 回答した音素数の時系列（例: [6, 7, 8]） */
  history: number[];
  /** 最新の再測定で正解したか */
  latestCorrect: boolean;
  lastAt: string;
}

/**
 * 同一語の再測定推移（例: 운동화 6/8 → 8/8）。
 * 2回以上出題され、誤答が1回でもある語だけを対象にする（全勝の語は推移に意味がない）。
 * 最近測定した順で返す。
 */
export function computeWordProgress(
  records: ErrorLogRecord[]
): WordProgress[] {
  const byWord = new Map<string, ErrorLogRecord[]>();
  for (const r of records) {
    const list = byWord.get(r.word);
    if (list) list.push(r);
    else byWord.set(r.word, [r]);
  }
  const out: WordProgress[] = [];
  for (const list of byWord.values()) {
    if (list.length < 2 || !list.some(isErrorRecord)) continue;
    const latest = list[list.length - 1];
    out.push({
      word: latest.word,
      meaning: latest.meaning,
      correctPhonemeCount: latest.correctPhonemeCount,
      history: list.map((r) => r.answeredCount),
      latestCorrect: !isErrorRecord(latest),
      lastAt: latest.createdAt,
    });
  }
  return out.sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1));
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

/** 例: 終声 /t̚/ */
export function tagLabel(c: Pick<TagCoverage, "position" | "phoneme">): string {
  return `${POSITION_LABEL[c.position]} /${c.phoneme}/`;
}
