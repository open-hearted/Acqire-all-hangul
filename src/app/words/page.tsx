"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import wordsData from "@/data/words.json";

// ─── Types ───────────────────────────────────────────────────────────────────

interface WordEntry {
  w: string; // 単語
  e: string; // 英語の意味
  p: number; // 標準発音ベースの音素数
}

type AnswerResult = "correct" | "incorrect" | null;
type QuizMode = "all" | "wrong";
type Phase = "setup" | "quiz" | "result";

// 1問ごとの記録
interface WordAnswer {
  w: string; // 単語
  p: number; // 正解の音素数
  choice: number; // 選んだ数
  result: "correct" | "incorrect";
  ms: number; // 出題から回答までの時間
  ts: number; // 回答日時 (epoch ms)
  heard?: string; // 自分にどう聞こえたか（例: "子母子" = 子音・母音・子音）任意
}

// セッションごとの記録
interface SessionLog {
  ts: number; // 開始日時 (epoch ms)
  mode: QuizMode;
  total: number; // 出題数
  wrong: number; // 誤答数
  avgMs: number; // 平均回答時間
  durationMs: number; // セッション所要時間
}

// ─── Constants ───────────────────────────────────────────────────────────────

const WORDS: WordEntry[] = wordsData as WordEntry[];
const MAX_PHONEMES = Math.max(...WORDS.map((w) => w.p)); // 18
const COUNT_OPTIONS = [10, 20, 50, 100, Infinity]; // Infinity = 全単語一気

const ANSWERS_KEY = "word-quiz-answers";
const SESSIONS_KEY = "word-quiz-sessions";
const WRONG_KEY = "word-quiz-wrong";
// 回答記録がこの件数に達したら、記録を消さずに新規セッションを停止する
const MAX_ANSWERS = 5000;

function loadJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return (parsed as T) ?? fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value));
}

// 音声ファイル名（? を除去、スペースを _ に置換して生成済み）
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

function formatDate(ts: number) {
  return new Date(ts).toLocaleString("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function WordPhonemeQuizPage() {
  const [hydrated, setHydrated] = useState(false);
  const [phase, setPhase] = useState<Phase>("setup");
  const [mode, setMode] = useState<QuizMode>("all");
  const [count, setCount] = useState(20);

  const [questions, setQuestions] = useState<WordEntry[]>([]);
  const [index, setIndex] = useState(0);
  const [chosen, setChosen] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);
  const [feedback, setFeedback] = useState<AnswerResult>(null);
  const [heard, setHeard] = useState(""); // 聞こえ方メモ（"子母子" 形式）

  const [sessions, setSessions] = useState<SessionLog[]>([]);
  const [wrongPool, setWrongPool] = useState<string[]>([]);
  const [sessionAnswers, setSessionAnswers] = useState<WordAnswer[]>([]);
  const [answersCount, setAnswersCount] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const autoNextRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const qStartRef = useRef(Date.now());
  const sessionStartRef = useRef(Date.now());

  useEffect(() => {
    setSessions(loadJson<SessionLog[]>(SESSIONS_KEY, []));
    setWrongPool(loadJson<string[]>(WRONG_KEY, []));
    setAnswersCount(loadJson<WordAnswer[]>(ANSWERS_KEY, []).length);
    setHydrated(true);
  }, []);

  useEffect(() => {
    return () => {
      if (autoNextRef.current) clearTimeout(autoNextRef.current);
    };
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

  function startSession(selectedMode: QuizMode) {
    if (answersCount >= MAX_ANSWERS) return; // 記録上限: 新規セッション停止
    const source =
      selectedMode === "all"
        ? WORDS
        : WORDS.filter((w) => wrongPool.includes(w.w));
    if (source.length === 0) return;
    const qs = shuffle(source).slice(0, count);
    setMode(selectedMode);
    setQuestions(qs);
    setIndex(0);
    setChosen(null);
    setChecked(false);
    setFeedback(null);
    setSessionAnswers([]);
    sessionStartRef.current = Date.now();
    qStartRef.current = Date.now();
    setPhase("quiz");
    playWord(qs[0].w); // スタートのタップ操作内で再生して自動再生制限を回避
  }

  function finishSession(answers: WordAnswer[]) {
    const wrong = answers.filter((a) => a.result === "incorrect").length;
    const avgMs = answers.length
      ? Math.round(answers.reduce((s, a) => s + a.ms, 0) / answers.length)
      : 0;
    const log: SessionLog = {
      ts: sessionStartRef.current,
      mode,
      total: answers.length,
      wrong,
      avgMs,
      durationMs: Date.now() - sessionStartRef.current,
    };
    const nextSessions = [...sessions, log];
    setSessions(nextSessions);
    saveJson(SESSIONS_KEY, nextSessions);
    setPhase("result");
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }

  // 聞こえ方メモが入力されていれば、直前の回答記録に添付する
  function attachHeard(answers: WordAnswer[]): WordAnswer[] {
    if (!heard || answers.length === 0) return answers;
    const updated = [...answers];
    updated[updated.length - 1] = { ...updated[updated.length - 1], heard };
    setSessionAnswers(updated);
    const all = loadJson<WordAnswer[]>(ANSWERS_KEY, []);
    if (all.length > 0) {
      all[all.length - 1] = { ...all[all.length - 1], heard };
      saveJson(ANSWERS_KEY, all);
    }
    return updated;
  }

  function advance(answers: WordAnswer[]) {
    if (autoNextRef.current) {
      clearTimeout(autoNextRef.current);
      autoNextRef.current = null;
    }
    setHeard("");
    const nextIndex = index + 1;
    if (nextIndex >= questions.length) {
      finishSession(answers);
      return;
    }
    setIndex(nextIndex);
    setChosen(null);
    setChecked(false);
    setFeedback(null);
    qStartRef.current = Date.now();
    playWord(questions[nextIndex].w);
  }

  // ── Answer ────────────────────────────────────────────────────────────────

  function handleAnswer(choice: number) {
    if (checked || !question) return;

    const result: AnswerResult = choice === question.p ? "correct" : "incorrect";
    setChosen(choice);
    setChecked(true);
    setFeedback(result);

    const answer: WordAnswer = {
      w: question.w,
      p: question.p,
      choice,
      result: result === "correct" ? "correct" : "incorrect",
      ms: Date.now() - qStartRef.current,
      ts: Date.now(),
    };
    const answers = [...sessionAnswers, answer];
    setSessionAnswers(answers);

    // 全回答ログに追記（削除はしない。進行中のセッションは上限を超えても記録する）
    const all = loadJson<WordAnswer[]>(ANSWERS_KEY, []);
    const nextAll = [...all, answer];
    saveJson(ANSWERS_KEY, nextAll);
    setAnswersCount(nextAll.length);

    // 間違いプールを更新（誤答で追加、正解で除外）
    let pool = wrongPool;
    if (result === "incorrect" && !pool.includes(question.w)) {
      pool = [...pool, question.w];
    } else if (result === "correct" && pool.includes(question.w)) {
      pool = pool.filter((w) => w !== question.w);
    }
    if (pool !== wrongPool) {
      setWrongPool(pool);
      saveJson(WRONG_KEY, pool);
    }

    if (result === "correct") {
      autoNextRef.current = setTimeout(() => advance(answers), 400);
    }
  }

  function handleClearRecords() {
    if (!window.confirm("単語クイズの記録（履歴・間違いプール）をすべて消しますか？")) return;
    setSessions([]);
    setWrongPool([]);
    setAnswersCount(0);
    localStorage.removeItem(SESSIONS_KEY);
    localStorage.removeItem(WRONG_KEY);
    localStorage.removeItem(ANSWERS_KEY);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (!hydrated) return null;

  const header = (
    <div className="header">
      <h1>単語の音素数クイズ</h1>
      <p>TOPIK I 全{WORDS.length}語</p>
    </div>
  );

  // Setup screen
  if (phase === "setup") {
    const recent = [...sessions].reverse().slice(0, 10);
    const logFull = answersCount >= MAX_ANSWERS;
    return (
      <div className="container">
        {header}
        {logFull && (
          <div className="admin-notice">
            回答記録が{MAX_ANSWERS}件に達しました。記録を守るため、新しいクイズは一時停止しています。
            記録はすべて残っています（クラウド保存への移行までお待ちください。すぐ再開したい場合は「記録をリセット」で消去もできます）。
          </div>
        )}
        <div className="start-card">
          <h2>単語を聞いて音素数を答えよう！</h2>
          <p>
            音声を聞いて、その単語の音素数（発音ベース）を数字ボタンで答えます。
            例: 가게=4、여행=5、축하=4（激音化で1減）
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
                  {Number.isFinite(n) ? `${n}問` : "全部"}
                </button>
              ))}
            </div>
          </div>
          <button
            className="btn-reset"
            onClick={() => startSession("all")}
            disabled={logFull}
          >
            スタート（全単語からランダム）
          </button>
          <button
            className="btn-reset"
            style={{ background: "#e65100" }}
            onClick={() => startSession("wrong")}
            disabled={wrongPool.length === 0 || logFull}
          >
            間違えた単語だけ（{wrongPool.length}語）
          </button>
          <p style={{ fontSize: "0.8rem", color: "#757575" }}>
            回答記録: {answersCount} / {MAX_ANSWERS}件
          </p>
          <Link href="/" className="link-btn">
            ← 母音クイズへ
          </Link>
        </div>

        {recent.length > 0 && (
          <div className="stats-section">
            <h2>履歴（直近{recent.length}回）</h2>
            {recent.map((s, i) => (
              <div key={i} className="history-row">
                <span className="history-date">{formatDate(s.ts)}</span>
                <span className={`history-result ${s.wrong === 0 ? "good" : ""}`}>
                  {s.total}語中 {s.wrong}語ミス
                </span>
                <span className="history-time">
                  平均{(s.avgMs / 1000).toFixed(1)}秒
                  {s.mode === "wrong" ? "・復習" : ""}
                </span>
              </div>
            ))}
            <button className="stats-clear" onClick={handleClearRecords}>
              記録をリセット
            </button>
          </div>
        )}
      </div>
    );
  }

  // Result screen
  if (phase === "result") {
    const wrongAnswers = sessionAnswers.filter((a) => a.result === "incorrect");
    const correctCount = sessionAnswers.length - wrongAnswers.length;
    const avgSec = sessionAnswers.length
      ? (
          sessionAnswers.reduce((s, a) => s + a.ms, 0) /
          sessionAnswers.length /
          1000
        ).toFixed(1)
      : "0";
    return (
      <div className="container">
        {header}
        <div className="result-card">
          <h2>クイズ完了！</h2>
          <div className="result-score">
            {correctCount}{" "}
            <span>/ {sessionAnswers.length} 正解・平均{avgSec}秒</span>
          </div>
          <button className="btn-reset" onClick={() => startSession(mode)}>
            もう一度（同じ設定）
          </button>
          <button
            className="btn-reset"
            style={{ background: "transparent", color: "#757575", border: "1px solid #e0e0e0" }}
            onClick={() => setPhase("setup")}
          >
            設定に戻る
          </button>
        </div>

        {wrongAnswers.length > 0 && (
          <div className="stats-section">
            <h2>間違えた単語（{wrongAnswers.length}語）</h2>
            {wrongAnswers.map((a, i) => {
              const entry = WORDS.find((w) => w.w === a.w);
              return (
                <div key={i} className="stats-row weak">
                  <button
                    className="stats-char"
                    onClick={() => playWord(a.w)}
                    title="タップで音を聞く"
                  >
                    {a.w} 🔊
                  </button>
                  <span className="stats-level">{a.p}音素</span>
                  <span className="stats-detail">
                    {a.choice}と回答
                    {a.heard ? `・聞こえ: ${a.heard}` : ""}・
                    {entry ? entry.e : ""}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // Quiz screen
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
        <div className="question-label">
          問題 {index + 1}
          {mode === "wrong" ? "（復習）" : ""}
        </div>

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

        <div className="input-wrap">
          <span className="input-label">
            聞こえた単語の音素数をタップすると、すぐに判定されます
          </span>
          <div className="num-grid">
            {Array.from({ length: MAX_PHONEMES }, (_, i) => i + 1).map((n) => {
              let stateClass = "";
              if (checked) {
                if (n === question.p) stateClass = "correct";
                else if (n === chosen) stateClass = "incorrect";
              }
              return (
                <button
                  key={n}
                  className={`num-btn ${stateClass}`}
                  onClick={() => handleAnswer(n)}
                >
                  {n}
                </button>
              );
            })}
          </div>
        </div>

        {feedback && (
          <div className={`feedback ${feedback}`} role="alert" aria-live="polite">
            {feedback === "correct"
              ? `✅ 正解！${question.w}（${question.e}）は ${question.p}音素`
              : `❌ 不正解。${question.w}（${question.e}）は ${question.p}音素`}
          </div>
        )}

        {feedback === "incorrect" && (
          <>
            {/* 聞こえ方メモ（任意）: 子/母ボタンで組み立てる */}
            <div className="input-wrap">
              <span className="input-label">
                聞こえ方をメモ（任意）:{" "}
                {heard
                  ? `${heard}（${heard.length}音素に聞こえた）`
                  : "「子」「母」を聞こえた順にタップ"}
              </span>
              <div className="memo-row">
                <button
                  type="button"
                  className="memo-btn"
                  onClick={() => setHeard(heard + "子")}
                >
                  子音
                </button>
                <button
                  type="button"
                  className="memo-btn"
                  onClick={() => setHeard(heard + "母")}
                >
                  母音
                </button>
                <button
                  type="button"
                  className="memo-btn"
                  onClick={() => setHeard(heard.slice(0, -1))}
                  disabled={heard.length === 0}
                >
                  ⌫ 消す
                </button>
              </div>
            </div>
            <div className="btn-row">
              <button
                className="btn-next"
                onClick={() => advance(attachHeard(sessionAnswers))}
              >
                {index + 1 < questions.length ? "次の問題 →" : "結果を見る"}
              </button>
            </div>
          </>
        )}
      </div>

      <button
        className="btn-reset"
        onClick={() => finishSession(attachHeard(sessionAnswers))}
        style={{ background: "transparent", color: "#757575", border: "1px solid #e0e0e0" }}
      >
        ここで終了する
      </button>
    </div>
  );
}
