"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import lessonsData from "@/data/lessons.json";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Lesson {
  id: string;
  audioFile: string;
  answer: string;
  hint: string;
  phonemes: number; // IPAでの音素数（1=単母音, 2=わたり音+母音）
}

type AnswerResult = "correct" | "incorrect" | null;

// 母音ボタンの動作モード: 聞く（音のみ）/ 答える（選択のみ）
type TapMode = "listen" | "answer";

interface Progress {
  currentIndex: number;
  shuffledOrder: number[];
  history: (AnswerResult | null)[];
  started: boolean;
  finished: boolean;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const LESSONS: Lesson[] = lessonsData as Lesson[];
const TOTAL = LESSONS.length;
const STORAGE_KEY = "hangul-quiz-progress";

// 回答ボタンに使う全母音（基本母音 + 合成母音）
const ALL_VOWELS = LESSONS;

// ─── 習熟度ログ ─────────────────────────────────────────────────────────────

// 1タッチごとの記録
interface TapEvent {
  t: number; // 出題からの経過ミリ秒
  kind: "play" | "listen" | "answer"; // 問題音声の再生 / 聞くモードのタップ / 答えるモードのタップ
  char?: string; // タップした文字（play のときは無し）
  result?: "correct" | "incorrect"; // answer のときの判定
}

// 1問ごとの記録（正解するか次の問題へ進むまでの全行動）
interface AttemptLog {
  answer: string; // 出題された文字
  result: "correct" | "incorrect"; // 初回判定の結果（習熟度計算用）
  listens: number; // 初回判定までに聞くモードで音を聞いた回数
  firstListenCorrect: boolean; // 聞くモードで最初にタップしたのが正解の文字だったか
  replays: number; // 問題音声を手動再生した回数
  ms: number; // 出題から初回判定までの時間
  tries: number; // 正解または次へ進むまでに答えた回数
  solvedMs: number | null; // 出題から正解までの時間（正解せず進んだら null）
  events: TapEvent[]; // 全タッチの時系列ログ
  ts: number; // 記録日時 (epoch ms)
}

const STATS_KEY = "hangul-quiz-stats";
const MAX_LOG = 500;
const RECENT_N = 5;

function loadAttempts(): AttemptLog[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AttemptLog[]) : [];
  } catch {
    return [];
  }
}

function saveAttempts(attempts: AttemptLog[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STATS_KEY, JSON.stringify(attempts.slice(-MAX_LOG)));
}

type MasteryLevel = "good" | "soso" | "weak" | "none";

interface VowelStat {
  recentCount: number;
  recentCorrect: number;
  recentImmediate: number; // 聞かずに即正解した回数
  avgSolveSec: number | null; // 直近の正解までの平均秒数
  level: MasteryLevel;
}

// 直近 RECENT_N 回を「即正解=1 / 聞いて正解=0.6 / 不正解=0」で平均して判定
function computeStat(attempts: AttemptLog[], answer: string): VowelStat {
  const recent = attempts.filter((a) => a.answer === answer).slice(-RECENT_N);
  const recentCorrect = recent.filter((a) => a.result === "correct").length;
  const recentImmediate = recent.filter(
    (a) => a.result === "correct" && a.listens === 0
  ).length;
  const solved = recent
    .map((a) => a.solvedMs)
    .filter((v): v is number => typeof v === "number");
  const avgSolveSec = solved.length
    ? Math.round((solved.reduce((s, v) => s + v, 0) / solved.length / 1000) * 10) / 10
    : null;
  let level: MasteryLevel = "none";
  if (recent.length > 0) {
    const score =
      recent.reduce(
        (s, a) =>
          s + (a.result !== "correct" ? 0 : a.listens === 0 ? 1 : 0.6),
        0
      ) / recent.length;
    if (score >= 0.8 && recent.length >= 3) level = "good";
    else if (score >= 0.4) level = "soso";
    else level = "weak";
  }
  return {
    recentCount: recent.length,
    recentCorrect,
    recentImmediate,
    avgSolveSec,
    level,
  };
}

const MASTERY_LABEL: Record<MasteryLevel, string> = {
  good: "◎ 大丈夫",
  soso: "○ もう少し",
  weak: "△ 要練習",
  none: "－ 未挑戦",
};

// Fisher-Yates shuffle
function shuffleIndices(): number[] {
  const arr = Array.from({ length: TOTAL }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// 回答ボタンの並び（ALL_VOWELS のインデックス）をシャッフル
function shuffleVowelOrder(): number[] {
  const arr = Array.from({ length: ALL_VOWELS.length }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function makeInitialProgress(withShuffle = false): Progress {
  return {
    currentIndex: 0,
    shuffledOrder: withShuffle ? shuffleIndices() : Array.from({ length: TOTAL }, (_, i) => i),
    history: Array(TOTAL).fill(null),
    started: false,
    finished: false,
  };
}

function loadProgress(): Progress {
  if (typeof window === "undefined") return makeInitialProgress();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return makeInitialProgress();
    const parsed = JSON.parse(raw) as Partial<Progress>;
    if (
      typeof parsed.currentIndex !== "number" ||
      !Array.isArray(parsed.history) ||
      !Array.isArray(parsed.shuffledOrder)
    ) {
      return makeInitialProgress();
    }
    return {
      currentIndex: parsed.currentIndex,
      shuffledOrder:
        parsed.shuffledOrder.length === TOTAL
          ? parsed.shuffledOrder
          : shuffleIndices(),
      history:
        parsed.history.length === TOTAL
          ? parsed.history
          : Array(TOTAL).fill(null),
      started: Boolean(parsed.started),
      finished: Boolean(parsed.finished),
    };
  } catch {
    return makeInitialProgress();
  }
}

function saveProgress(p: Progress) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function QuizPage() {
  const [progress, setProgress] = useState<Progress>(makeInitialProgress);
  const [selected, setSelected] = useState<string | null>(null);
  const [mode, setMode] = useState<TapMode>("listen");
  const [feedback, setFeedback] = useState<AnswerResult>(null);
  const [checked, setChecked] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const [attempts, setAttempts] = useState<AttemptLog[]>([]);
  // 回答ボタンの表示順（問題ごとにシャッフル）
  const [buttonOrder, setButtonOrder] = useState<number[]>(() =>
    Array.from({ length: ALL_VOWELS.length }, (_, i) => i)
  );

  const audioRef = useRef<HTMLAudioElement | null>(null);
  // 正解時の自動遷移タイマー
  const autoNextRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 現在の問題に対する行動の記録（正解するか次へ進むときに AttemptLog にまとめる）
  const listenTapsRef = useRef<string[]>([]);
  const replaysRef = useRef(0);
  const qStartRef = useRef<number>(Date.now());
  const eventsRef = useRef<TapEvent[]>([]);
  const firstJudgeRef = useRef<{
    result: "correct" | "incorrect";
    listens: number;
    firstListenCorrect: boolean;
    ms: number;
  } | null>(null);

  // 次の問題に向けて行動記録をリセットし、回答ボタンの並びもシャッフルする
  function resetQuestionTracking() {
    listenTapsRef.current = [];
    replaysRef.current = 0;
    qStartRef.current = Date.now();
    eventsRef.current = [];
    firstJudgeRef.current = null;
    setButtonOrder(shuffleVowelOrder());
  }

  function appendAttempt(a: AttemptLog) {
    setAttempts((prev) => {
      const next = [...prev, a].slice(-MAX_LOG);
      saveAttempts(next);
      return next;
    });
  }

  // タッチ1回分を時系列ログに追加
  function recordEvent(
    kind: TapEvent["kind"],
    char?: string,
    result?: "correct" | "incorrect"
  ) {
    const e: TapEvent = { t: Date.now() - qStartRef.current, kind };
    if (char !== undefined) e.char = char;
    if (result !== undefined) e.result = result;
    eventsRef.current.push(e);
  }

  // 現在の問題の記録を確定して保存（一度も判定していなければ何もしない）
  function finalizeAttempt(target: Lesson) {
    const fj = firstJudgeRef.current;
    if (!fj) return;
    firstJudgeRef.current = null; // 二重記録防止
    const answers = eventsRef.current.filter((e) => e.kind === "answer");
    const correctEv = answers.find((e) => e.result === "correct");
    appendAttempt({
      answer: target.answer,
      result: fj.result,
      listens: fj.listens,
      firstListenCorrect: fj.firstListenCorrect,
      replays: replaysRef.current,
      ms: fj.ms,
      tries: answers.length,
      solvedMs: correctEv ? correctEv.t : null,
      events: eventsRef.current,
      ts: Date.now(),
    });
  }

  // Hydrate from localStorage after mount
  useEffect(() => {
    const stored = loadProgress();
    setProgress(stored);
    setAttempts(loadAttempts());
    setButtonOrder(shuffleVowelOrder());
    setHydrated(true);
  }, []);

  // Clear pending auto-advance on unmount
  useEffect(() => {
    return () => {
      if (autoNextRef.current) clearTimeout(autoNextRef.current);
    };
  }, []);

  // Persist whenever progress changes
  useEffect(() => {
    if (hydrated) saveProgress(progress);
  }, [progress, hydrated]);

  // Current lesson resolved via shuffled order
  const lessonIndex = progress.shuffledOrder[progress.currentIndex];
  const lesson = LESSONS[lessonIndex];
  const scoreCorrect = progress.history.filter((h) => h === "correct").length;

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleStart() {
    clearAutoNext();
    const fresh = makeInitialProgress(true);
    fresh.started = true;
    setProgress(fresh);
    setSelected(null);
    setMode("listen");
    setFeedback(null);
    setChecked(false);
    resetQuestionTracking();
  }

  function handleReset() {
    clearAutoNext();
    // 回答途中でリセットした場合も判定済みの分は記録を確定する
    if (lesson) finalizeAttempt(lesson);
    const fresh = makeInitialProgress(true);
    setProgress(fresh);
    setSelected(null);
    setMode("listen");
    setFeedback(null);
    resetQuestionTracking();
    setChecked(false);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }

  function clearAutoNext() {
    if (autoNextRef.current) {
      clearTimeout(autoNextRef.current);
      autoNextRef.current = null;
    }
  }

  // 問題音声の再生。ユーザー操作で一度再生済みの Audio 要素を使い回すことで、
  // 自動再生時もモバイルブラウザの再生制限にかかりにくくする
  function playLessonAudio(target: Lesson) {
    const src = `/audio/${encodeURIComponent(target.audioFile)}`;
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

  function handlePlay() {
    if (!lesson) return;
    replaysRef.current += 1;
    recordEvent("play");
    playLessonAudio(lesson);
  }

  function playVowelAudio(audioFile: string) {
    const src = `/audio/${encodeURIComponent(audioFile)}`;
    const audio = new Audio(src);
    audio.play().catch(() => {
      // Audio playback failed
    });
  }

  // 聞くモード: 音だけ鳴らす / 答えるモード: タップした文字で即判定
  function handleVowelTap(vowel: Lesson) {
    if (mode === "listen") {
      // 初回判定前の聞いた回数は習熟度の「即答」判定に使う
      if (firstJudgeRef.current === null) listenTapsRef.current.push(vowel.answer);
      recordEvent("listen", vowel.answer);
      playVowelAudio(vowel.audioFile);
      return;
    }
    if (checked || !lesson) return;

    setSelected(vowel.answer);

    const result: AnswerResult =
      vowel.answer === lesson.answer ? "correct" : "incorrect";

    setFeedback(result);
    setChecked(true);

    recordEvent(
      "answer",
      vowel.answer,
      result === "correct" ? "correct" : "incorrect"
    );

    // 初回判定のスナップショット（習熟度は初回判定で評価する）
    if (firstJudgeRef.current === null) {
      firstJudgeRef.current = {
        result: result === "correct" ? "correct" : "incorrect",
        listens: listenTapsRef.current.length,
        firstListenCorrect: listenTapsRef.current[0] === lesson.answer,
        ms: Date.now() - qStartRef.current,
      };
    }

    // 正解したらこの問題の記録を確定して保存
    if (result === "correct") finalizeAttempt(lesson);

    const newHistory = [...progress.history];
    newHistory[progress.currentIndex] = result;
    const updated = { ...progress, history: newHistory };
    setProgress(updated);

    // 正解なら一瞬見せてから自動で次の問題へ進み、音声を再生する
    if (result === "correct") {
      const nextIndex = updated.currentIndex + 1;
      autoNextRef.current = setTimeout(() => {
        autoNextRef.current = null;
        setSelected(null);
        setMode("listen");
        setFeedback(null);
        setChecked(false);
        resetQuestionTracking();
        if (nextIndex >= TOTAL) {
          setProgress({ ...updated, finished: true });
          if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
          }
        } else {
          setProgress({ ...updated, currentIndex: nextIndex });
          playLessonAudio(LESSONS[updated.shuffledOrder[nextIndex]]);
        }
      }, 400);
    }
  }

  function handleRetry() {
    clearAutoNext();
    setSelected(null);
    setFeedback(null);
    setChecked(false);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }

  function handleNext() {
    clearAutoNext();
    // 正解しないまま次へ進む場合もここまでの記録を確定する
    if (lesson) finalizeAttempt(lesson);
    const nextIndex = progress.currentIndex + 1;
    if (nextIndex >= TOTAL) {
      setProgress({ ...progress, finished: true });
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    } else {
      setProgress({ ...progress, currentIndex: nextIndex });
      // 手動で次に進んだ場合も次の問題の音声を再生
      playLessonAudio(LESSONS[progress.shuffledOrder[nextIndex]]);
    }
    setSelected(null);
    setMode("listen");
    setFeedback(null);
    setChecked(false);
    resetQuestionTracking();
  }

  function handleClearStats() {
    if (!window.confirm("習熟度の記録をすべて消しますか？")) return;
    setAttempts([]);
    if (typeof window !== "undefined") localStorage.removeItem(STATS_KEY);
  }

  // 音ごとの習熟度セクション（スタート画面と結果画面で表示）
  function renderStats() {
    return (
      <div className="stats-section">
        <h2>音ごとの習熟度</h2>
        {ALL_VOWELS.map((vowel) => {
          const s = computeStat(attempts, vowel.answer);
          return (
            <div key={vowel.id} className={`stats-row ${s.level}`}>
              <button
                className="stats-char"
                onClick={() => playVowelAudio(vowel.audioFile)}
                title="タップで音を聞く"
              >
                {vowel.answer} 🔊
              </button>
              <span className="stats-level">{MASTERY_LABEL[s.level]}</span>
              <span className="stats-detail">
                {s.recentCount > 0
                  ? `直近${s.recentCount}回: 正解${s.recentCorrect}・即答${s.recentImmediate}` +
                    (s.avgSolveSec !== null ? `・平均${s.avgSolveSec}秒` : "")
                  : "まだ記録がありません"}
              </span>
            </div>
          );
        })}
        {attempts.length > 0 && (
          <button className="stats-clear" onClick={handleClearStats}>
            記録をリセット
          </button>
        )}
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (!hydrated) return null;

  // Start screen
  if (!progress.started) {
    return (
      <div className="container">
        <div className="header">
          <h1>ハングル習得クイズ</h1>
          <p>한글 퀴즈 · Hangul Quiz</p>
        </div>
        <div className="start-card">
          <h2>音声を聞いてハングルを選ぼう！</h2>
          <p>
            全 {TOTAL}{" "}
            問の音声を聞いて、同じ音の母音ボタンを選んで答えます。
            「🔊 聞く / ✏️ 答える」の切り替えで、聞き比べと回答を分けて操作できます。
          </p>
          <button className="btn-reset" onClick={handleStart}>
            スタート
          </button>
          <Link href="/phoneme" className="link-btn">
            音素数クイズ（母音）へ →
          </Link>
          <Link href="/words" className="link-btn">
            単語の音素数クイズへ →
          </Link>
          <Link href="/transcribe" className="link-btn">
            IPA転写クイズ（精密測定）へ →
          </Link>
          <Link href="/regions" className="link-btn">
            音響領域の分析へ →
          </Link>
        </div>
        {renderStats()}
      </div>
    );
  }

  // Finished screen
  if (progress.finished) {
    return (
      <div className="container">
        <div className="header">
          <h1>ハングル習得クイズ</h1>
          <p>한글 퀴즈 · Hangul Quiz</p>
        </div>
        <div className="result-card">
          <h2>クイズ完了！</h2>
          <div className="result-score">
            {scoreCorrect}{" "}
            <span>
              / {TOTAL} 正解
            </span>
          </div>
          <div className="history-grid">
            {progress.history.map((h, i) => (
              <div
                key={i}
                className={`history-dot ${h === "correct" ? "correct" : h === "incorrect" ? "incorrect" : ""}`}
              >
                {i + 1}
              </div>
            ))}
          </div>
          <button className="btn-reset" onClick={handleReset}>
            もう一度（シャッフル）
          </button>
        </div>
        {renderStats()}
      </div>
    );
  }

  // Quiz screen
  return (
    <div className="container">
      <div className="header">
        <h1>ハングル習得クイズ</h1>
        <p>한글 퀴즈 · Hangul Quiz</p>
      </div>

      {/* Progress */}
      <div>
        <div className="progress-wrap">
          <div
            className="progress-bar"
            style={{
              width: `${((progress.currentIndex + 1) / TOTAL) * 100}%`,
            }}
          />
        </div>
        <div className="progress-label">
          {progress.currentIndex + 1} / {TOTAL}
        </div>
      </div>

      {/* Question card */}
      <div className="card">
        <div className="question-label">問題 {progress.currentIndex + 1}</div>

        {/* Play audio */}
        <button className="btn-audio" onClick={handlePlay}>
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

        {/* Answer buttons */}
        <div className="input-wrap">
          <div className="mode-toggle" role="tablist" aria-label="ボタンの動作">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "listen"}
              className={mode === "listen" ? "active" : ""}
              onClick={() => setMode("listen")}
            >
              🔊 聞く
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "answer"}
              className={mode === "answer" ? "active" : ""}
              onClick={() => setMode("answer")}
            >
              ✏️ 答える
            </button>
          </div>
          <span className="input-label">
            {mode === "listen"
              ? "タップすると音が鳴ります（回答にはなりません）"
              : "答えの文字をタップすると、すぐに判定されます"}
          </span>
          <div className="vowels-grid">
            {buttonOrder.map((orderIndex) => {
              const vowel = ALL_VOWELS[orderIndex];
              let stateClass = "";
              if (checked) {
                if (vowel.answer === lesson.answer) stateClass = "correct";
                else if (vowel.answer === selected) stateClass = "incorrect";
              } else if (vowel.answer === selected) {
                stateClass = "selected";
              }
              return (
                <button
                  key={vowel.id}
                  className={`vowel-btn ${stateClass}`}
                  onClick={() => handleVowelTap(vowel)}
                  title={vowel.hint}
                >
                  <span className="vowel-char">{vowel.answer}</span>
                  {mode === "listen" && <span className="vowel-sub">🔊</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* Feedback */}
        {feedback && (
          <div
            className={`feedback ${feedback}`}
            role="alert"
            aria-live="polite"
          >
            {feedback === "correct" &&
              (progress.currentIndex + 1 < TOTAL
                ? "✅ 正解！次の問題へ →"
                : "✅ 正解！")}
            {feedback === "incorrect" && `❌ 不正解。正解：${lesson.answer}`}
          </div>
        )}

        {/* Buttons (不正解のときだけ表示) */}
        {feedback === "incorrect" && (
          <div className="btn-row">
            <button className="btn-retry" onClick={handleRetry}>
              もう一度
            </button>
            <button className="btn-next" onClick={handleNext}>
              {progress.currentIndex + 1 < TOTAL ? "次の問題 →" : "結果を見る"}
            </button>
          </div>
        )}
      </div>

      {/* Score history */}
      <div className="score-section">
        <h2>回答履歴</h2>
        <div className="history-grid">
          {progress.history.map((h, i) => (
            <div
              key={i}
              className={`history-dot ${
                i === progress.currentIndex
                  ? "current"
                  : h === "correct"
                    ? "correct"
                    : h === "incorrect"
                      ? "incorrect"
                      : ""
              }`}
            >
              {i + 1}
            </div>
          ))}
        </div>
      </div>

      {/* Reset / Reshuffle */}
      <button
        className="btn-reset"
        onClick={handleReset}
        style={{ background: "transparent", color: "#757575", border: "1px solid #e0e0e0" }}
      >
        リセット＆シャッフル
      </button>
    </div>
  );
}
