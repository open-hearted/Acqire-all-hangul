"use client";

import { useRef, useState, useEffect } from "react";
import Link from "next/link";
import { VOWELS } from "@/lib/acoustic-region";

// ─── Constants ───────────────────────────────────────────────────────────────

// VOWELS のキー順（8単母音→jわたり音→wわたり音→ɰ）をそのままボタン順にする
const VOWEL_KEYS = Object.keys(VOWELS);

const MIN_INTERVAL_MS = 0;
const MAX_INTERVAL_MS = 3000;
const STEP_INTERVAL_MS = 100;
const DEFAULT_INTERVAL_MS = 800;

const RESULT_ROW_SIZE = 10;

function audioSrc(hangul: string) {
  return `/audio/${encodeURIComponent(hangul)}.mp3`;
}

// Fisher-Yates。avoidFirst が指定され、かつシャッフル結果の先頭がそれと
// 一致してしまった場合は先頭を別位置と入れ替える（単一リピートへの退化を防ぐ）
function shuffleAvoidingRepeat(vowels: string[], avoidFirst?: string): string[] {
  const arr = [...vowels];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  if (avoidFirst !== undefined && arr.length > 1 && arr[0] === avoidFirst) {
    const swapIdx = 1 + Math.floor(Math.random() * (arr.length - 1));
    [arr[0], arr[swapIdx]] = [arr[swapIdx], arr[0]];
  }
  return arr;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function VowelLoopPage() {
  const [selected, setSelected] = useState<string[]>([]);
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [sequence, setSequence] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [intervalMs, setIntervalMs] = useState(DEFAULT_INTERVAL_MS);
  const [shuffle, setShuffle] = useState(true);
  const [testMode, setTestMode] = useState(false);
  // Stop 時点の再生順序（表示用）。次の Start でクリアする
  const [lastOrder, setLastOrder] = useState<string[] | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Pause が「間隔待ち中（timerRef 稼働中）」に押されたかどうか。
  // true なら Resume 時にタイマーの残り時間を待たず次の母音へ即進む。
  const pausedDuringWaitRef = useRef(false);
  // テストモード中に実際に再生した母音を再生順で記録する（localStorageには残さない）
  const recordedOrderRef = useRef<string[]>([]);

  // クロージャが古い値を掴まないよう、常に最新値を ref に同期する（render時に反映）
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const sequenceRef = useRef(sequence);
  sequenceRef.current = sequence;
  const currentIndexRef = useRef(currentIndex);
  currentIndexRef.current = currentIndex;
  const intervalRef = useRef(intervalMs);
  intervalRef.current = intervalMs;
  const shuffleRef = useRef(shuffle);
  shuffleRef.current = shuffle;
  const testModeRef = useRef(testMode);
  testModeRef.current = testMode;

  function clearPendingTimer() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function playVowelAt(vowel: string) {
    const audio = audioRef.current;
    if (!audio) return;
    if (testModeRef.current) {
      recordedOrderRef.current = [...recordedOrderRef.current, vowel];
    }
    audio.pause();
    audio.src = audioSrc(vowel);
    audio.load();
    audio.play().catch(() => {
      // 再生失敗（自動再生ポリシー等）は静かに無視する
    });
  }

  function ensureAudio(): HTMLAudioElement {
    if (audioRef.current) return audioRef.current;
    const audio = new Audio();
    // ended リスナーは生成時に1回だけ付ける（以後はこの同一インスタンスを使い回す）
    audio.addEventListener("ended", () => {
      clearPendingTimer();
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        advanceAndPlay();
      }, intervalRef.current);
    });
    audioRef.current = audio;
    return audio;
  }

  // 現在の再生位置から次へ進める。1サイクル終わっていれば次サイクルの
  // 順序を組み直す（シャッフルON時は直前サイクル最後の母音との連続を回避）
  function advanceAndPlay() {
    const sel = selectedRef.current;
    if (sel.length === 0) {
      stopPlayback();
      return;
    }
    const seq = sequenceRef.current;
    const prevLast = seq[seq.length - 1];
    let nextSeq = seq;
    let nextIdx = currentIndexRef.current + 1;

    if (nextIdx >= seq.length) {
      if (sel.length === 1) {
        nextSeq = [sel[0]];
      } else if (shuffleRef.current) {
        nextSeq = shuffleAvoidingRepeat(sel, prevLast);
      } else {
        nextSeq = [...sel];
      }
      nextIdx = 0;
      setSequence(nextSeq);
    }
    setCurrentIndex(nextIdx);
    playVowelAt(nextSeq[nextIdx]);
  }

  function handleStart() {
    const sel = selected;
    if (sel.length === 0) return;
    clearPendingTimer();
    pausedDuringWaitRef.current = false;
    setPaused(false);
    recordedOrderRef.current = [];
    setLastOrder(null);
    const seq =
      sel.length === 1
        ? [sel[0]]
        : shuffle
          ? shuffleAvoidingRepeat(sel)
          : [...sel];
    setSequence(seq);
    setCurrentIndex(0);
    setPlaying(true);
    ensureAudio();
    playVowelAt(seq[0]);
  }

  function stopPlayback() {
    clearPendingTimer();
    pausedDuringWaitRef.current = false;
    setPaused(false);
    setPlaying(false);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    if (testModeRef.current && recordedOrderRef.current.length > 0) {
      setLastOrder([...recordedOrderRef.current]);
    }
  }

  // 一時停止。「音声再生中」「間隔待ち中」の2状態を区別して扱う（実装の急所）。
  // 間隔待ち中は timerRef が生きているのでそれを clearTimeout する。
  // 音声再生中は timerRef が null（ended がまだ来ていない）なので audio.pause() する。
  function pausePlayback() {
    if (!playing || paused) return;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
      pausedDuringWaitRef.current = true;
    } else {
      pausedDuringWaitRef.current = false;
      audioRef.current?.pause();
    }
    setPaused(true);
  }

  // 再開。間隔待ち中に一時停止したなら、残り時間を待たず次の母音へ進む
  // （＝実装がシンプルで済み、待ち時間差分の追跡バグを避けられる）。
  // 音声再生中に一時停止したなら、同じ音声の続きから play() する。
  function resumePlayback() {
    if (!playing || !paused) return;
    setPaused(false);
    if (pausedDuringWaitRef.current) {
      pausedDuringWaitRef.current = false;
      advanceAndPlay();
    } else {
      audioRef.current?.play().catch(() => {
        // 再生失敗は静かに無視する
      });
    }
  }

  function toggleVowel(vowel: string) {
    setSelected((prev) =>
      prev.includes(vowel) ? prev.filter((v) => v !== vowel) : [...prev, vowel]
    );
  }

  function handleClearSelection() {
    stopPlayback();
    setSelected([]);
  }

  // Start/Stop トグル（Ctrl+Enter から呼ぶ）
  const startStopRef = useRef<() => void>(() => {});
  startStopRef.current = () => {
    if (playing) stopPlayback();
    else handleStart();
  };

  // Pause/Resume トグル（Space から呼ぶ）。停止中は何もしない（誤爆防止）
  const pauseResumeRef = useRef<() => void>(() => {});
  pauseResumeRef.current = () => {
    if (!playing) return;
    if (paused) resumePlayback();
    else pausePlayback();
  };

  // キーボードショートカット: Space=一時停止/再開、Ctrl+Enter=開始/停止
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.code === "Space") {
        e.preventDefault();
        pauseResumeRef.current();
      } else if (e.ctrlKey && e.code === "Enter") {
        e.preventDefault();
        startStopRef.current();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // アンマウント時のクリーンアップ
  useEffect(() => {
    return () => {
      clearPendingTimer();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    };
  }, []);

  const currentVowel = playing ? sequence[currentIndex] : null;
  const showShuffleIndicator = shuffle && selected.length >= 2;
  // テストモード中の再生時は、順序が推測できる手がかりを一切出さない
  const concealPlayback = testMode && playing;

  return (
    <div className="container">
      <div className="header">
        <h1>母音リピート再生</h1>
        <p>1つなら同じ母音を繰り返し、複数選ぶと切り替えて聞き比べる</p>
      </div>

      <div className="start-card">
        <div className="loop-display">
          {concealPlayback ? (
            <span className="loop-display-char loop-display-hidden">?</span>
          ) : currentVowel ? (
            <span className="loop-display-char">{currentVowel}</span>
          ) : (
            <span className="loop-display-placeholder">母音を選んでください</span>
          )}
        </div>

        {selected.length > 0 && (
          <div className="loop-sequence">
            {(concealPlayback
              ? VOWEL_KEYS.filter((v) => selected.includes(v))
              : selected
            ).map((vowel) => (
              <span
                key={vowel}
                className={`loop-sequence-item ${
                  !concealPlayback && playing && currentVowel === vowel
                    ? "current"
                    : ""
                }`}
              >
                {vowel}
              </span>
            ))}
            {showShuffleIndicator && (
              <span className="loop-shuffle-indicator">シャッフル中</span>
            )}
          </div>
        )}

        <div className="input-wrap">
          <span className="input-label">
            繰り返し間隔: {(intervalMs / 1000).toFixed(1)}秒
          </span>
          <input
            type="range"
            min={MIN_INTERVAL_MS}
            max={MAX_INTERVAL_MS}
            step={STEP_INTERVAL_MS}
            value={intervalMs}
            onChange={(e) => setIntervalMs(Number(e.target.value))}
            className="loop-slider"
          />
        </div>

        <label className="loop-shuffle-toggle">
          <input
            type="checkbox"
            checked={shuffle}
            onChange={(e) => setShuffle(e.target.checked)}
          />
          シャッフル（選択が2つ以上のとき有効）
        </label>

        <label className="loop-shuffle-toggle">
          <input
            type="checkbox"
            checked={testMode}
            onChange={(e) => setTestMode(e.target.checked)}
          />
          テストモード（再生中は母音を隠し、停止後に順序を表示）
        </label>

        <div className="loop-btn-row">
          <button
            className="btn-reset"
            onClick={() => startStopRef.current()}
            disabled={!playing && selected.length === 0}
          >
            {playing ? "■ Stop" : "▶ Start"}
          </button>

          <button
            className="btn-reset"
            style={{ background: "#5c6bc0" }}
            onClick={() => pauseResumeRef.current()}
            disabled={!playing}
          >
            {paused ? "▶ Resume" : "⏸ Pause"}
          </button>
        </div>

        <p className="loop-shortcuts-hint">
          ショートカット: Space = 一時停止/再開　·　Ctrl+Enter = 開始/停止
        </p>

        <button
          className="btn-reset"
          style={{
            background: "transparent",
            color: "#757575",
            border: "1px solid #e0e0e0",
          }}
          onClick={handleClearSelection}
          disabled={selected.length === 0}
        >
          全て解除
        </button>
      </div>

      {lastOrder && lastOrder.length > 0 && (
        <div className="loop-result">
          <h2 className="loop-result-title">再生順序（{lastOrder.length}音）</h2>
          {chunk(lastOrder, RESULT_ROW_SIZE).map((row, i) => {
            const start = i * RESULT_ROW_SIZE + 1;
            const end = start + row.length - 1;
            return (
              <div key={i} className="loop-result-row">
                <span className="loop-result-range">
                  {start}-{end}:
                </span>
                <span className="loop-result-vowels">{row.join(" ")}</span>
              </div>
            );
          })}
        </div>
      )}

      <div className="loop-grid">
        {VOWEL_KEYS.map((vowel) => (
          <button
            key={vowel}
            className={`vowel-btn ${selected.includes(vowel) ? "selected" : ""}`}
            onClick={() => toggleVowel(vowel)}
          >
            <span className="vowel-char">{vowel}</span>
          </button>
        ))}
      </div>

      <Link href="/" className="link-btn">
        ← トップへ戻る
      </Link>
    </div>
  );
}
