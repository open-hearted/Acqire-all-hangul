"use client";

import { useEffect, useRef, useState } from "react";
import lessonsData from "@/data/lessons.json";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Lesson {
  id: string;
  audioFile: string;
  answer: string;
  hint: string;
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

// 基本母音（最初の10個）
const BASIC_VOWELS = LESSONS.slice(0, 10);

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

  const audioRef = useRef<HTMLAudioElement | null>(null);
  // 正解時の自動遷移タイマー
  const autoNextRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hydrate from localStorage after mount
  useEffect(() => {
    const stored = loadProgress();
    setProgress(stored);
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
  }

  function handleReset() {
    clearAutoNext();
    const fresh = makeInitialProgress(true);
    setProgress(fresh);
    setSelected(null);
    setMode("listen");
    setFeedback(null);
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
    playLessonAudio(lesson);
  }

  function playVowelAudio(audioFile: string) {
    const src = `/audio/${encodeURIComponent(audioFile)}`;
    const audio = new Audio(src);
    audio.play().catch(() => {
      // Audio playback failed
    });
  }

  // 聞くモード: 音だけ鳴らす / 答えるモード: 選択だけする（答え合わせ後は変更不可）
  function handleVowelTap(vowel: Lesson) {
    if (mode === "listen") {
      playVowelAudio(vowel.audioFile);
      return;
    }
    if (!checked) setSelected(vowel.answer);
  }

  function handleCheck() {
    if (!lesson || selected === null) return;

    const result: AnswerResult =
      selected === lesson.answer ? "correct" : "incorrect";

    setFeedback(result);
    setChecked(true);

    const newHistory = [...progress.history];
    newHistory[progress.currentIndex] = result;
    const updated = { ...progress, history: newHistory };
    setProgress(updated);

    // 正解なら少し見せてから自動で次の問題へ進み、音声を再生する
    if (result === "correct") {
      const nextIndex = updated.currentIndex + 1;
      autoNextRef.current = setTimeout(() => {
        autoNextRef.current = null;
        setSelected(null);
        setMode("listen");
        setFeedback(null);
        setChecked(false);
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
        </div>
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
              ? "タップすると音が鳴ります（選択はされません）"
              : "答えの文字をタップして選んでください（音は鳴りません）"}
          </span>
          <div className="vowels-grid">
            {BASIC_VOWELS.map((vowel) => {
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
          <div className={`selected-display ${selected ? "" : "empty"}`}>
            {selected ?? "まだ選んでいません"}
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

        {/* Buttons */}
        <div className="btn-row">
          {!checked ? (
            <button
              className="btn-check"
              onClick={handleCheck}
              disabled={selected === null}
            >
              答え合わせ
            </button>
          ) : (
            <>
              <button className="btn-retry" onClick={handleRetry}>
                もう一度
              </button>
              <button className="btn-next" onClick={handleNext}>
                {progress.currentIndex + 1 < TOTAL ? "次の問題 →" : "結果を見る"}
              </button>
            </>
          )}
        </div>
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
