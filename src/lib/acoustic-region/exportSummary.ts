// error_log の分析用エクスポート。設計: docs/acoustic-region-module.md
//
// AIチャット等に貼り付けて「次に何を訓練すべきか」を相談するための
// 自己記述的なMarkdownサマリを組み立てる。貼り付け先には前提context が
// 無いので、データモデルの意味説明を冒頭に含める。

import type { ErrorLogRecord } from "./types";
import {
  computeVowelCoverage,
  computeWordCoverage,
  coverageRate,
  tagCoverageRate,
  tallyErrorRegions,
  tallyConfusions,
  computeWordProgress,
  listUnclassifiedErrors,
  isErrorRecord,
  regionLabel,
  tagLabel,
} from "./stats";

function pct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

function day(iso: string): string {
  return iso.slice(0, 10);
}

export function buildExportSummary(records: ErrorLogRecord[]): string {
  const L: string[] = [];
  const errors = records.filter(isErrorRecord);
  const first = records[0]?.createdAt;
  const last = records[records.length - 1]?.createdAt;

  L.push("# 韓国語 音響領域学習ログ（自動エクスポート）");
  L.push("");
  L.push("## このデータについて");
  L.push("- 学習者のL1は日本語。目的は、日本語の音韻体系に存在しない音響領域を特定し、その領域に語彙を意味ごと投入して韓国語の音韻空間を構築すること（HVPT + lexically guided perceptual learning）");
  L.push("- 位置: 初声/中声/終声（発音形の音節構造ベース）");
  L.push("- エラータイプ: 脱落（音が聞こえない）/ 統合（2音素を1音に）/ 過剰検出（無い音を聞いた）/ 置換（別の音として知覚 = L1カテゴリへの吸収）");
  L.push("- 被覆率 = 音響領域ごとの検出成功率。正答率ではない。低い領域ほど「日本語に写像が無い領域」");
  L.push("- 「母?」「子?」= 聞こえたがどのIPAか同定できなかった回答（検出成功・同定失敗）");
  L.push("");
  L.push(
    `## 記録の規模: 全${records.length}回の出題（うち誤答${errors.length}回）` +
      (first && last ? `、期間 ${day(first)} 〜 ${day(last)}` : "")
  );

  const vowelCov = computeVowelCoverage(records);
  if (vowelCov.length > 0) {
    L.push("");
    L.push("## 母音の音響領域 被覆率（知覚不能順）");
    for (const c of vowelCov) {
      L.push(
        `- ${regionLabel(c.region)}: 検出 ${c.detected}/${c.attempts}（${pct(coverageRate(c))}） 対象: ${c.words.join(" ")}`
      );
    }
  }

  const wordCov = computeWordCoverage(records);
  if (wordCov.length > 0) {
    L.push("");
    L.push("## 単語の音響領域 被覆率（知覚不能順・悪い方から最大20領域）");
    for (const c of wordCov.slice(0, 20)) {
      L.push(
        `- ${tagLabel(c)}: 検出 ${c.detected}/${c.attempts}（${pct(tagCoverageRate(c))}） 例: ${c.words.slice(0, 5).join(" ")}`
      );
    }
  }

  const confusions = tallyConfusions(records);
  if (confusions.length > 0) {
    L.push("");
    L.push("## 混同ペア（何を何と聞いたか・IPA転写）");
    for (const c of confusions) {
      L.push(
        `- /${c.phoneme}/ → ${c.heard === "母" || c.heard === "子" ? `${c.heard}?（同定できず）` : `/${c.heard}/`}: ${c.count}回（${c.words.slice(0, 5).join(" ")}）`
      );
    }
  }

  const tally = tallyErrorRegions(records);
  if (tally.length > 0) {
    L.push("");
    L.push("## 誤答領域の分布（出現回数順・最大20）");
    for (const t of tally.slice(0, 20)) {
      L.push(
        `- ${regionLabel(t.region)}: ${t.count}回（${t.words.slice(0, 5).join(" ")}）`
      );
    }
  }

  const progress = computeWordProgress(records);
  if (progress.length > 0) {
    L.push("");
    L.push("## 再測定の推移（回答音素数の時系列・最近測定順・最大15語）");
    for (const p of progress.slice(0, 15)) {
      L.push(
        `- ${p.word}（${p.meaning}）: ${p.history.join(" → ")}（正解 ${p.correctPhonemeCount}）${p.latestCorrect ? " 最新は正解" : ""}`
      );
    }
  }

  const knownButWrong = new Map<string, ErrorLogRecord>();
  for (const r of errors) {
    if (r.wordKnown === true) knownButWrong.set(r.word, r);
  }
  if (knownButWrong.size > 0) {
    L.push("");
    L.push("## 「知っていた」のに聞き取れなかった語（音韻表現の再結線候補）");
    for (const r of knownButWrong.values()) {
      L.push(`- ${r.word}（${r.meaning}）: ${r.answeredCount}/${r.correctPhonemeCount}音素`);
    }
  }

  const unclassified = listUnclassifiedErrors(records);
  if (unclassified.length > 0) {
    L.push("");
    L.push(`## 未分類の誤答（領域不明・最新10/全${unclassified.length}件）`);
    for (const r of unclassified.slice(0, 10)) {
      L.push(
        `- ${r.word}（${r.meaning}）: ${r.answeredCount}/${r.correctPhonemeCount}音素` +
          (r.heardPattern ? ` 聞こえ: ${r.heardPattern}` : "")
      );
    }
  }

  L.push("");
  L.push("---");
  L.push(
    "上記のデータをもとに、(1) 優先して訓練すべき音響領域とその根拠、(2) 具体的な練習方法、(3) 次の測定で確かめるべき仮説、を提案してください。"
  );
  return L.join("\n");
}
