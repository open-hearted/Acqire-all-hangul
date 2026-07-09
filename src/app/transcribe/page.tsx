"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import wordsData from "@/data/words.json";
import {
  getRepositories,
  buildTranscriptionErrorLog,
  judgeTranscription,
  getWordMaster,
  isWildcard,
  KEYBOARD_VOWELS,
  KEYBOARD_CONSONANTS,
  WILDCARD_VOWEL,
  WILDCARD_CONSONANT,
  type TranscriptionJudgement,
  type TranscriptionGrade,
} from "@/lib/acoustic-region";

// ─── Types / Constants ───────────────────────────────────────────────────────

interface WordEntry {
  w: string;
  e: string;
  p: number;
}

type Phase = "setup" | "quiz" | "result";

interface QuestionResult {
  word: string;
  meaning: string;
  grade: TranscriptionGrade;
  summary: string;
}

const WORDS: WordEntry[] = wordsData as WordEntry[];
const COUNT_OPTIONS = [5, 10, 20];
const MAXLEN_OPTIONS: { label: string; value: number }[] = [
  { label: "〜4音素", value: 4 },
  { label: "〜6音素", value: 6 },
  { label: "〜8音素", value: 8 },
  { label: "全部", value: Infinity },
];

const GRADE_LABEL: Record<TranscriptionGrade, string> = {
  perfect: "完全一致",
  pattern: "配置一致",
  mismatch: "配置不一致",
};

function audioSrc(word: string) {
  const file = word.replace(/\?/g, "").replace(/ /g, "_");
  return `/word_audios/${encodeURIComponent(file)}.mp3`;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function TranscribeQuizPage() {
  const [hydrated, setHydrated] = useState(false);
  const [phase, setPhase] = useState<Phase>("setup");
  const [count, setCount] = useState(10);
  const [maxLen, setMaxLen] = useState(6);

  const [questions, setQuestions] = useState<WordEntry[]>([]);
  const [index, setIndex] = useState(0);
  const [heard, setHeard] = useState<string[]>([]);
  const [judgement, setJudgement] = useState<TranscriptionJudgement | null>(
    null
  );
  const [known, setKnown] = useState<boolean | null>(null);
  const [results, setResults] = useState<QuestionResult[]>([]);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    setHydrated(true);
  }, []);

  const question = questions[index];

  // ── Audio ─────────────────────────────────────────────────────────────────

  function playWord(word: string) {
    const src = audioSrc(word);
    if (!audioRef.current) {
      audioRef.current = new Audio(src);
    } else {
      audioRef.current.pause();
      audioRef.current.src = src;
      audioRef.current.load();
    }
    audioRef.current.play().catch(() => {
      // Audio playback failed (e.g. browser autoplay policy)
    });
  }

  // ── Session flow ──────────────────────────────────────────────────────────

  function startSession() {
    const source = WORDS.filter((w) => w.p <= maxLen);
    if (source.length === 0) return;
    const qs = shuffle(source).slice(0, count);
    setQuestions(qs);
    setIndex(0);
    setHeard([]);
    setJudgement(null);
    setKnown(null);
    setResults([]);
    setPhase("quiz");
    playWord(qs[0].w);
  }

  // 判定（1問につき1回。ここではまだ記録しない: 「知っていた」の入力を待つ）
  function handleJudge() {
    if (!question || judgement || heard.length === 0) return;
    const entry = getWordMaster().get(question.w);
    if (!entry) return;
    setJudgement(judgeTranscription(entry.phonemes, heard));
  }

  // 記録して次へ（判定済みの問題のみ記録する）
  function recordCurrent(): QuestionResult[] {
    if (!question || !judgement) return results;
    const built = buildTranscriptionErrorLog({
      word: question.w,
      heard,
      wordKnown: known,
    });
    if (built) {
      getRepositories()
        .errorLogs.append(built.log)
        .catch(() => {
          // 記録失敗はクイズ進行を妨げない
        });
    }
    const next = [
      ...results,
      {
        word: question.w,
        meaning: question.e,
        grade: judgement.grade,
        summary: judgement.summary,
      },
    ];
    setResults(next);
    return next;
  }

  function handleNext() {
    const nextResults = recordCurrent();
    const nextIndex = index + 1;
    setHeard([]);
    setJudgement(null);
    setKnown(null);
    if (nextIndex >= questions.length) {
      setPhase("result");
      if (audioRef.current) audioRef.current.pause();
      return;
    }
    setIndex(nextIndex);
    playWord(questions[nextIndex].w);
    void nextResults;
  }

  function handleQuit() {
    recordCurrent();
    setHeard([]);
    setJudgement(null);
    setKnown(null);
    setPhase("result");
    if (audioRef.current) audioRef.current.pause();
  }

  // ── Render helpers ────────────────────────────────────────────────────────

  function renderKeyboard() {
    const disabled = judgement !== null;
    return (
      <div className="input-wrap">
        <span className="input-label">
          聞こえた順に1音素ずつタップ。分からないけど聞こえている音は「母?」「子?」
        </span>
        <div className="ipa-group-label">母音・わたり音</div>
        <div className="ipa-grid">
          {KEYBOARD_VOWELS.map((p) => (
            <button
              key={p}
              type="button"
              className="ipa-btn vowel"
              disabled={disabled}
              onClick={() => setHeard([...heard, p])}
            >
              {p}
            </button>
          ))}
          <button
            type="button"
            className="ipa-btn vowel wildcard"
            disabled={disabled}
            onClick={() => setHeard([...heard, WILDCARD_VOWEL])}
          >
            母?
          </button>
        </div>
        <div className="ipa-group-label">子音</div>
        <div className="ipa-grid">
          {KEYBOARD_CONSONANTS.map((p) => (
            <button
              key={p}
              type="button"
              className="ipa-btn"
              disabled={disabled}
              onClick={() => setHeard([...heard, p])}
            >
              {p}
            </button>
          ))}
          <button
            type="button"
            className="ipa-btn wildcard"
            disabled={disabled}
            onClick={() => setHeard([...heard, WILDCARD_CONSONANT])}
          >
            子?
          </button>
        </div>
        <div className="ipa-grid">
          <button
            type="button"
            className="ipa-btn"
            disabled={disabled || heard.length === 0}
            onClick={() => setHeard(heard.slice(0, -1))}
          >
            ⌫ 消す
          </button>
        </div>
      </div>
    );
  }

  function renderSlots(j: TranscriptionJudgement) {
    return (
      <div className="slot-row">
        {j.slots.map((slot, i) => (
          <div key={i} className={`slot ${slot.kind}`}>
            <span className="slot-heard">
              {slot.kind === "deletion"
                ? "―"
                : isWildcard(slot.heard ?? "")
                  ? `${slot.heard}?`
                  : slot.heard}
            </span>
            <span className="slot-actual">
              {slot.kind === "insertion" ? "余分" : slot.actual?.phoneme}
            </span>
          </div>
        ))}
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (!hydrated) return null;

  const header = (
    <div className="header">
      <h1>IPA転写クイズ</h1>
      <p>聞こえた音を1音素ずつIPAで書き取る（精密測定）</p>
    </div>
  );

  // Setup
  if (phase === "setup") {
    const poolSize = WORDS.filter((w) => w.p <= maxLen).length;
    return (
      <div className="container">
        {header}
        <div className="start-card">
          <h2>聞こえた音をそのまま書き取ろう</h2>
          <p>
            音声を聞いて、聞こえた音素を順番にタップします。
            どのIPAか分からないけど何か聞こえている時は「母?」「子?」を使ってください
            — 当てずっぽうより正確な記録になります。
          </p>
          <div className="input-wrap">
            <span className="input-label">出題数</span>
            <div className="mode-toggle">
              {COUNT_OPTIONS.map((n) => (
                <button
                  key={n}
                  type="button"
                  className={count === n ? "active" : ""}
                  onClick={() => setCount(n)}
                >
                  {n}問
                </button>
              ))}
            </div>
          </div>
          <div className="input-wrap">
            <span className="input-label">単語の長さ（{poolSize}語が対象）</span>
            <div className="mode-toggle">
              {MAXLEN_OPTIONS.map((o) => (
                <button
                  key={o.label}
                  type="button"
                  className={maxLen === o.value ? "active" : ""}
                  onClick={() => setMaxLen(o.value)}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <button className="btn-reset" onClick={startSession}>
            スタート
          </button>
          <Link href="/regions" className="link-btn">
            音響領域の分析へ →
          </Link>
          <Link href="/words" className="link-btn">
            ← 単語の音素数クイズへ
          </Link>
        </div>
      </div>
    );
  }

  // Result
  if (phase === "result") {
    const byGrade = (g: TranscriptionGrade) =>
      results.filter((r) => r.grade === g).length;
    return (
      <div className="container">
        {header}
        <div className="result-card">
          <h2>クイズ完了！</h2>
          <div className="result-score">
            {byGrade("perfect")}{" "}
            <span>
              / {results.length} 完全一致・配置一致 {byGrade("pattern")}・
              配置不一致 {byGrade("mismatch")}
            </span>
          </div>
          <button className="btn-reset" onClick={startSession}>
            もう一度（同じ設定）
          </button>
          <button
            className="btn-reset"
            style={{ background: "transparent", color: "#757575", border: "1px solid #e0e0e0" }}
            onClick={() => setPhase("setup")}
          >
            設定に戻る
          </button>
          <Link href="/regions" className="link-btn">
            音響領域の分析へ →
          </Link>
        </div>

        {results.length > 0 && (
          <div className="stats-section">
            <h2>内訳</h2>
            {results.map((r, i) => (
              <div
                key={i}
                className={`stats-row ${
                  r.grade === "perfect"
                    ? "good"
                    : r.grade === "pattern"
                      ? "soso"
                      : "weak"
                }`}
              >
                <button
                  className="stats-char"
                  onClick={() => playWord(r.word)}
                  title="タップで音を聞く"
                >
                  {r.word} 🔊
                </button>
                <span className="stats-level">{GRADE_LABEL[r.grade]}</span>
                <span className="stats-detail">
                  {r.meaning}・{r.summary}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Quiz
  return (
    <div className="container">
      {header}

      <div>
        <div className="progress-wrap">
          <div
            className="progress-bar"
            style={{ width: `${((index + 1) / questions.length) * 100}%` }}
          />
        </div>
        <div className="progress-label">
          {index + 1} / {questions.length}
        </div>
      </div>

      <div className="card">
        <div className="question-label">問題 {index + 1}（IPA転写）</div>

        <button className="btn-audio" onClick={() => playWord(question.w)}>
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M8 5v14l11-7z" />
          </svg>
          音声を再生する
        </button>

        {/* 入力中の列 */}
        <div className="heard-line">
          {heard.length === 0 ? (
            <span className="heard-empty">（ここに入力した音素が並びます）</span>
          ) : (
            heard.map((h, i) => (
              <span key={i} className="heard-chip">
                {isWildcard(h) ? `${h}?` : h}
              </span>
            ))
          )}
        </div>

        {!judgement && renderKeyboard()}

        {!judgement && (
          <button
            className="btn-reset"
            onClick={handleJudge}
            disabled={heard.length === 0}
          >
            判定する（{heard.length}音素）
          </button>
        )}

        {judgement && (
          <>
            <div
              className={`feedback ${
                judgement.grade === "perfect" ? "correct" : "incorrect"
              }`}
              role="alert"
              aria-live="polite"
            >
              {judgement.summary}
            </div>
            {renderSlots(judgement)}
            <p style={{ fontSize: "0.9rem", color: "#424242" }}>
              正解: {question.w}（{question.e}）＝ /
              {getWordMaster()
                .get(question.w)
                ?.phonemes.map((p) => p.phoneme)
                .join(" ")}
              /
            </p>
            <button
              type="button"
              className={`known-btn ${known ? "active" : ""}`}
              onClick={() => setKnown(known ? null : true)}
            >
              ✔ この単語は知っていた
            </button>
            <div className="btn-row">
              <button className="btn-next" onClick={handleNext}>
                {index + 1 < questions.length ? "次の問題 →" : "結果を見る"}
              </button>
            </div>
          </>
        )}
      </div>

      <button
        className="btn-reset"
        onClick={handleQuit}
        style={{ background: "transparent", color: "#757575", border: "1px solid #e0e0e0" }}
      >
        ここで終了する
      </button>
    </div>
  );
}
