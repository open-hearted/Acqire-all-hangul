"use client";

import { useEffect, useRef, useState } from "react";
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

// ─── Component ───────────────────────────────────────────────────────────────

export default function VowelLoopPage() {
  const [active, setActive] = useState<string | null>(null);
  const [intervalMs, setIntervalMs] = useState(DEFAULT_INTERVAL_MS);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // ended ハンドラのクロージャが古い intervalMs を掴まないよう、常に最新値を ref で参照する
  const intervalRef = useRef(DEFAULT_INTERVAL_MS);
  intervalRef.current = intervalMs;

  function clearPendingTimer() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function playCurrent() {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    audio.play().catch(() => {
      // 再生失敗（自動再生ポリシー等）は静かに無視する
    });
  }

  function handleSelect(vowel: string) {
    clearPendingTimer();
    setActive(vowel);

    const src = audioSrc(vowel);
    if (!audioRef.current) {
      const audio = new Audio(src);
      // ended リスナーは生成時に1回だけ付ける（以後はこの同一インスタンスを使い回す）
      audio.addEventListener("ended", () => {
        clearPendingTimer();
        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          playCurrent();
        }, intervalRef.current);
      });
      audioRef.current = audio;
    } else {
      audioRef.current.pause();
      audioRef.current.src = src;
      audioRef.current.load();
    }
    playCurrent();
  }

  function handleStop() {
    clearPendingTimer();
    setActive(null);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }

  // Space キーで停止
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.code === "Space") {
        e.preventDefault();
        handleStop();
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

  const activeInfo = active ? VOWELS[active] : null;

  return (
    <div className="container">
      <div className="header">
        <h1>母音リピート再生</h1>
        <p>同じ母音を繰り返し聞いて、カテゴリの感覚を養う</p>
      </div>

      <div className="start-card">
        <div className="loop-display">
          {activeInfo ? (
            <>
              <span className="loop-display-char">{active}</span>
              <span className="loop-display-ipa">/{activeInfo.ipa}/</span>
            </>
          ) : (
            <span className="loop-display-placeholder">母音を選んでください</span>
          )}
        </div>

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

        <button
          className="btn-reset"
          style={{
            background: "transparent",
            color: "#757575",
            border: "1px solid #e0e0e0",
          }}
          onClick={handleStop}
          disabled={!active}
        >
          ■ Stop（Spaceキーでも停止）
        </button>
      </div>

      <div className="loop-grid">
        {VOWEL_KEYS.map((vowel) => {
          const info = VOWELS[vowel];
          return (
            <button
              key={vowel}
              className={`vowel-btn ${active === vowel ? "selected" : ""}`}
              onClick={() => handleSelect(vowel)}
            >
              <span className="vowel-char">{vowel}</span>
              <span className="vowel-sub">[{info.ipa}]</span>
            </button>
          );
        })}
      </div>

      <Link href="/" className="link-btn">
        ← トップへ戻る
      </Link>
    </div>
  );
}
