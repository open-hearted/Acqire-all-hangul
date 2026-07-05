"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  getRepositories,
  computeVowelCoverage,
  computeWordCoverage,
  tallyErrorRegions,
  coverageRate,
  tagCoverageRate,
  regionLabel,
  tagLabel,
  isErrorRecord,
  listUnclassifiedErrors,
  computeWordProgress,
  LOCAL_USER_ID,
  type ErrorLogRecord,
  type RegionCoverage,
  type TagCoverage,
} from "@/lib/acoustic-region";

// 検出成功率 → 表示レベル（既存の stats-row のスタイルを流用）
function levelOf(rate: number, attempts: number): "good" | "soso" | "weak" {
  if (rate >= 0.8 && attempts >= 3) return "good";
  if (rate >= 0.4) return "soso";
  return "weak";
}

function coverageLevel(c: RegionCoverage): "good" | "soso" | "weak" {
  return levelOf(coverageRate(c), c.attempts);
}

function tagCoverageLevel(c: TagCoverage): "good" | "soso" | "weak" {
  return levelOf(tagCoverageRate(c), c.attempts);
}

// 単語リストの表示（多すぎる場合は先頭だけ）
function wordList(words: string[], max = 4): string {
  return words.length <= max
    ? words.join(" ")
    : `${words.slice(0, max).join(" ")} 他${words.length - max}語`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function RegionAnalysisPage() {
  const [records, setRecords] = useState<ErrorLogRecord[] | null>(null);

  useEffect(() => {
    getRepositories()
      .errorLogs.listByUser(LOCAL_USER_ID)
      .then(setRecords)
      .catch(() => setRecords([]));
  }, []);

  if (records === null) return null;

  const coverage = computeVowelCoverage(records);
  const wordCoverage = computeWordCoverage(records);
  const progress = computeWordProgress(records);
  const errorTally = tallyErrorRegions(records);
  const unclassified = listUnclassifiedErrors(records);
  const errorCount = records.filter(isErrorRecord).length;

  return (
    <div className="container">
      <div className="header">
        <h1>音響領域の分析</h1>
        <p>正答率ではなく、音響領域ごとの検出成功率で見る</p>
      </div>

      <div className="start-card">
        <h2>記録の状況</h2>
        <p>
          全 {records.length} 回の出題記録（うち誤答 {errorCount} 回）。
          記録は削除されず、出題プールと「過去の自分との対決」の原資になります。
        </p>
        {records.length === 0 && (
          <p>
            まだ記録がありません。母音クイズを解くと、初回判定が自動でここに
            貯まります。
          </p>
        )}
        <Link href="/phoneme" className="link-btn">
          音素数クイズ（母音）へ →
        </Link>
        <Link href="/words" className="link-btn">
          単語の音素数クイズへ →
        </Link>
        <Link href="/" className="link-btn">
          ← ホームへ
        </Link>
      </div>

      {progress.length > 0 && (
        <div className="stats-section">
          <h2>⚔️ 過去の自分との対決（再測定の推移）</h2>
          {progress.slice(0, 20).map((p) => (
            <div
              key={p.word}
              className={`stats-row ${p.latestCorrect ? "good" : "weak"}`}
            >
              <span className="stats-char">{p.word}</span>
              <span className="stats-level">
                {p.history[p.history.length - 1]}/{p.correctPhonemeCount}
                {p.latestCorrect ? " 勝" : ""}
              </span>
              <span className="stats-detail">
                {p.history.join(" → ")}（正解 {p.correctPhonemeCount}）・
                {p.meaning}
              </span>
            </div>
          ))}
        </div>
      )}

      {coverage.length > 0 && (
        <div className="stats-section">
          <h2>母音の音響領域 被覆率（知覚不能順）</h2>
          {coverage.map((c) => (
            <div key={c.key} className={`stats-row ${coverageLevel(c)}`}>
              <span className="stats-char">{c.words.join(" ")}</span>
              <span className="stats-level">
                {Math.round(coverageRate(c) * 100)}%
              </span>
              <span className="stats-detail">
                {regionLabel(c.region)}・検出 {c.detected} / {c.attempts} 回
              </span>
            </div>
          ))}
        </div>
      )}

      {wordCoverage.length > 0 && (
        <div className="stats-section">
          <h2>単語の音響領域 被覆率（知覚不能順）</h2>
          {wordCoverage.map((c) => (
            <div key={c.tag} className={`stats-row ${tagCoverageLevel(c)}`}>
              <span className="stats-char">{tagLabel(c)}</span>
              <span className="stats-level">
                {Math.round(tagCoverageRate(c) * 100)}%
              </span>
              <span className="stats-detail">
                検出 {c.detected} / {c.attempts} 回・{wordList(c.words)}
              </span>
            </div>
          ))}
        </div>
      )}

      {unclassified.length > 0 && (
        <div className="stats-section">
          <h2>未分類の誤答（領域分類待ち・新しい順）</h2>
          {unclassified.slice(0, 20).map((r) => (
            <div key={r.id} className="stats-row none">
              <span className="stats-char">{r.word}</span>
              <span className="stats-level">
                {r.answeredCount}/{r.correctPhonemeCount}
              </span>
              <span className="stats-detail">
                {r.meaning}
                {r.heardPattern ? `・聞こえ: ${r.heardPattern}` : ""}・
                {formatDate(r.createdAt)}
              </span>
            </div>
          ))}
          {unclassified.length > 20 && (
            <p style={{ fontSize: "0.8rem", color: "#757575" }}>
              ほか {unclassified.length - 20} 件
            </p>
          )}
        </div>
      )}

      {errorTally.length > 0 && (
        <div className="stats-section">
          <h2>誤答領域の分布（全記録）</h2>
          {errorTally.map((t) => (
            <div key={t.key} className="stats-row weak">
              <span className="stats-char">{t.words.join(" ")}</span>
              <span className="stats-level">{t.count}回</span>
              <span className="stats-detail">
                {regionLabel(t.region)}・最終 {formatDate(t.lastAt)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
