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

// ─── Component ───────────────────────────────────────────────────────────────

export default function VowelLoopPage() {
  const [selected, setSelected] = useState<string[]>([]);
  const [playing, setPlaying] = useState(false);
  const [sequence, setSequence] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [intervalMs, setIntervalMs] = useState(DEFAULT_INTERVAL_MS);
  const [shuffle, setShuffle] = useState(true);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  function clearPendingTimer() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function playVowelAt(vowel: string) {
    const audio = audioRef.current;
    if (!audio) return;
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
    setPlaying(false);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
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

  // Start/Stop トグル。Space キーからも同じ関数を呼ぶ
  const toggleRef = useRef<() => void>(() => {});
  toggleRef.current = () => {
    if (playing) stopPlayback();
    else handleStart();
  };

  // Space キーで Start/Stop トグル
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.code === "Space") {
        e.preventDefault();
        toggleRef.current();
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

  return (
    <div className="container">
      <div className="header">
        <h1>母音リピート再生</h1>
        <p>1つなら同じ母音を繰り返し、複数選ぶと切り替えて聞き比べる</p>
      </div>

      <div className="start-card">
        <div className="loop-display">
          {currentVowel ? (
            <span className="loop-display-char">{currentVowel}</span>
          ) : (
            <span className="loop-display-placeholder">母音を選んでください</span>
          )}
        </div>

        {selected.length > 0 && (
          <div className="loop-sequence">
            {selected.map((vowel) => (
              <span
                key={vowel}
                className={`loop-sequence-item ${
                  playing && currentVowel === vowel ? "current" : ""
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

        <button
          className="btn-reset"
          onClick={() => toggleRef.current()}
          disabled={!playing && selected.length === 0}
        >
          {playing ? "■ Stop（Spaceキーでも停止）" : "▶ Start（Spaceキーでも開始）"}
        </button>

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
