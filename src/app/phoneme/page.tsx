"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import lessonsData from "@/data/lessons.json";
import { buildVowelErrorLog, getRepositories, VOWELS } from "@/lib/acoustic-region";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Lesson {
  id: string;
  audioFile: string;
  answer: string;
  hint: string;
  phonemes: number; // IPAでの音素数（1=単母音, 2=わたり音+母音）
}

type AnswerResult = "correct" | "incorrect" | null;

interface Progress {
  currentIndex: number;
  shuffledOrder: number[];
  history: (AnswerResult | null)[];
  started: boolean;
  finished: boolean;
}

// 1タッチごとの記録
interface TapEvent {
  t: number; // 出題からの経過ミリ秒
  kind: "play" | "answer"; // 問題音声の再生 / 回答ボタンのタップ
  choice?: number; // answer のとき選んだ音素数
  result?: "correct" | "incorrect";
}

// 1問ごとの記録（正解するか次の問題へ進むまでの全行動）
interface AttemptLog {
  answer: string; // 出題された文字
  phonemes: number; // 正解の音素数
  result: "correct" | "incorrect"; // 初回判定の結果
  replays: number; // 問題音声を手動再生した回数
  ms: number; // 出題から初回判定までの時間
  tries: number; // 正解または次へ進むまでに答えた回数
  solvedMs: number | null; // 出題から正解までの時間（正解せず進んだら null）
  events: TapEvent[]; // 全タッチの時系列ログ
  ts: number; // 記録日時 (epoch ms)
}

// ─── Constants ───────────────────────────────────────────────────────────────

const LESSONS: Lesson[] = lessonsData as Lesson[];
const TOTAL = LESSONS.length;
const STORAGE_KEY = "hangul-phoneme-progress";
const STATS_KEY = "hangul-phoneme-stats";
const MAX_LOG = 500;
const RECENT_N = 5;

// Fisher-Yates shuffle
function shuffleIndices(): number[] {
  const arr = Array.from({ length: TOTAL }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function makeInitialProgress(withShuffle = false): Progress {
  return {
    currentIndex: 0,
    shuffledOrder: withShuffle
      ? shuffleIndices()
      : Array.from({ length: TOTAL }, (_, i) => i),
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
  avgSolveSec: number | null;
  level: MasteryLevel;
}

// 直近 RECENT_N 回の正答率で判定（正解=1 / 不正解=0）
function computeStat(attempts: AttemptLog[], answer: string): VowelStat {
  const recent = attempts.filter((a) => a.answer === answer).slice(-RECENT_N);
  const recentCorrect = recent.filter((a) => a.result === "correct").length;
  const solved = recent
    .map((a) => a.solvedMs)
    .filter((v): v is number => typeof v === "number");
  const avgSolveSec = solved.length
    ? Math.round((solved.reduce((s, v) => s + v, 0) / solved.length / 1000) * 10) / 10
    : null;
  let level: MasteryLevel = "none";
  if (recent.length > 0) {
    const score = recentCorrect / recent.length;
    if (score >= 0.8 && recent.length >= 3) level = "good";
    else if (score >= 0.4) level = "soso";
    else level = "weak";
  }
  return { recentCount: recent.length, recentCorrect, avgSolveSec, level };
}

const MASTERY_LABEL: Record<MasteryLevel, string> = {
  good: "◎ 大丈夫",
  soso: "○ もう少し",
  weak: "△ 要練習",
  none: "－ 未挑戦",
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function PhonemeQuizPage() {
  const [progress, setProgress] = useState<Progress>(makeInitialProgress);
  const [chosen, setChosen] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<AnswerResult>(null);
  const [checked, setChecked] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [attempts, setAttempts] = useState<AttemptLog[]>([]);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const autoNextRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 現在の問題に対する行動の記録
  const replaysRef = useRef(0);
  const qStartRef = useRef<number>(Date.now());
  const eventsRef = useRef<TapEvent[]>([]);
  const firstJudgeRef = useRef<{
    result: "correct" | "incorrect";
    ms: number;
  } | null>(null);

  function resetQuestionTracking() {
    replaysRef.current = 0;
    qStartRef.current = Date.now();
    eventsRef.current = [];
    firstJudgeRef.current = null;
  }

  function appendAttempt(a: AttemptLog) {
    setAttempts((prev) => {
      const next = [...prev, a].slice(-MAX_LOG);
      saveAttempts(next);
      return next;
    });
  }

  function recordEvent(
    kind: TapEvent["kind"],
    choice?: number,
    result?: "correct" | "incorrect"
  ) {
    const e: TapEvent = { t: Date.now() - qStartRef.current, kind };
    if (choice !== undefined) e.choice = choice;
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
      phonemes: target.phonemes,
      result: fj.result,
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
    setProgress(loadProgress());
    setAttempts(loadAttempts());
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

  const lessonIndex = progress.shuffledOrder[progress.currentIndex];
  const lesson = LESSONS[lessonIndex];
  const scoreCorrect = progress.history.filter((h) => h === "correct").length;

  // ── Handlers ──────────────────────────────────────────────────────────────

  function clearAutoNext() {
    if (autoNextRef.current) {
      clearTimeout(autoNextRef.current);
      autoNextRef.current = null;
    }
  }

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

  function playVowelAudio(audioFile: string) {
    const src = `/audio/${encodeURIComponent(audioFile)}`;
    const audio = new Audio(src);
    audio.play().catch(() => {
      // Audio playback failed
    });
  }

  function handlePlay() {
    if (!lesson) return;
    replaysRef.current += 1;
    recordEvent("play");
    playLessonAudio(lesson);
  }

  function handleStart() {
    clearAutoNext();
    const fresh = makeInitialProgress(true);
    fresh.started = true;
    setProgress(fresh);
    setChosen(null);
    setFeedback(null);
    setChecked(false);
    resetQuestionTracking();
  }

  function handleReset() {
    clearAutoNext();
    if (lesson) finalizeAttempt(lesson);
    const fresh = makeInitialProgress(true);
    setProgress(fresh);
    setChosen(null);
    setFeedback(null);
    resetQuestionTracking();
    setChecked(false);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }

  // 1音素/2音素ボタンで即判定
  function handleAnswer(choice: number) {
    if (checked || !lesson) return;

    setChosen(choice);

    const result: AnswerResult =
      choice === lesson.phonemes ? "correct" : "incorrect";

    setFeedback(result);
    setChecked(true);

    recordEvent("answer", choice, result === "correct" ? "correct" : "incorrect");

    if (firstJudgeRef.current === null) {
      firstJudgeRef.current = {
        result: result === "correct" ? "correct" : "incorrect",
        ms: Date.now() - qStartRef.current,
      };
      // 音響領域分析用の error_log にも初回判定を記録する
      // （正答も記録: 領域ごとの検出成功率の分母になる）
      const errorLog = buildVowelErrorLog(lesson.answer, choice);
      if (errorLog) {
        getRepositories()
          .errorLogs.append(errorLog)
          .catch(() => {
            // 記録失敗はクイズ進行を妨げない
          });
      }
    }

    const newHistory = [...progress.history];
    newHistory[progress.currentIndex] = result;
    const updated = { ...progress, history: newHistory };
    setProgress(updated);

    if (result === "correct") {
      finalizeAttempt(lesson);
      const nextIndex = updated.currentIndex + 1;
      autoNextRef.current = setTimeout(() => {
        autoNextRef.current = null;
        setChosen(null);
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
    setChosen(null);
    setFeedback(null);
    setChecked(false);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }

  function handleNext() {
    clearAutoNext();
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
      playLessonAudio(LESSONS[progress.shuffledOrder[nextIndex]]);
    }
    setChosen(null);
    setFeedback(null);
    setChecked(false);
    resetQuestionTracking();
  }

  function handleClearStats() {
    if (!window.confirm("音素数クイズの記録をすべて消しますか？")) return;
    setAttempts([]);
    if (typeof window !== "undefined") localStorage.removeItem(STATS_KEY);
  }

  // 正解の説明文（例: ㅑ /ja/ は 2音素）
  function answerText(target: Lesson) {
    return `${target.answer} /${VOWELS[target.answer]?.ipa ?? "?"}/ は ${target.phonemes}音素`;
  }

  // 音ごとの習熟度（スタート画面と結果画面で表示）
  function renderStats() {
    return (
      <div className="stats-section">
        <h2>音ごとの習熟度（音素数）</h2>
        {LESSONS.map((vowel) => {
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
                  ? `直近${s.recentCount}回: 正解${s.recentCorrect}` +
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
          <h1>音素数クイズ</h1>
          <p>この音は 1音素？ 2音素？</p>
        </div>
        <div className="start-card">
          <h2>音声を聞いて音素数を答えよう！</h2>
          <p>
            単母音（ㅏ ㅓ ㅗ ㅜ ㅡ ㅣ ㅐ ㅔ）は1音素、
            わたり音つき（ㅑ ㅕ ㅛ ㅠ ㅒ ㅖ ㅘ ㅙ ㅚ ㅝ ㅞ ㅟ ㅢ）は2音素です。
            全 {TOTAL} 問がランダムな順番で出題されます。
          </p>
          <button className="btn-reset" onClick={handleStart}>
            スタート
          </button>
          <Link href="/" className="link-btn">
            ← 文字を当てるクイズへ
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
          <h1>音素数クイズ</h1>
          <p>この音は 1音素？ 2音素？</p>
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
          <Link href="/" className="link-btn">
            ← 文字を当てるクイズへ
          </Link>
        </div>
        {renderStats()}
      </div>
    );
  }

  // Quiz screen
  return (
    <div className="container">
      <div className="header">
        <h1>音素数クイズ</h1>
        <p>この音は 1音素？ 2音素？</p>
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
          <span className="input-label">
            聞こえた音の音素数をタップすると、すぐに判定されます
          </span>
          <div className="phoneme-row">
            {[1, 2].map((n) => {
              let stateClass = "";
              if (checked) {
                if (n === lesson.phonemes) stateClass = "correct";
                else if (n === chosen) stateClass = "incorrect";
              }
              return (
                <button
                  key={n}
                  className={`phoneme-btn ${stateClass}`}
                  onClick={() => handleAnswer(n)}
                >
                  {n}音素
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
            {feedback === "correct" && `✅ 正解！${answerText(lesson)}`}
            {feedback === "incorrect" && `❌ 不正解。${answerText(lesson)}`}
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
