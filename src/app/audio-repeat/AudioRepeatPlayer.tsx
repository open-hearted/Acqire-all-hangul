"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AUDIO_REPEAT_LESSONS } from "@/data/audioRepeatLessons";

export interface AudioTrack {
  id: string;
  cd: string;
  fileName: string;
  label: string;
  src: string;
}

export interface AudioGroup {
  name: string;
  tracks: AudioTrack[];
}

type RepeatCount = 1 | 5 | 10 | "infinite";
type IntervalSeconds = 0 | 0.3 | 0.5 | 1 | 2;
type PlaybackState = "idle" | "playing" | "paused" | "waiting";

const REPEAT_OPTIONS: RepeatCount[] = [1, 5, 10, "infinite"];
const INTERVAL_OPTIONS: IntervalSeconds[] = [0, 0.3, 0.5, 1, 2];

export default function AudioRepeatPlayer({
  groups,
}: {
  groups: AudioGroup[];
}) {
  const lessonGroups = groups.filter(
    (group) => AUDIO_REPEAT_LESSONS[group.name.toUpperCase()],
  );
  const [selectedLesson, setSelectedLesson] = useState(
    lessonGroups[0]?.name ?? "",
  );
  const [quickTrack, setQuickTrack] = useState<AudioTrack | null>(null);
  const [quickTapMode, setQuickTapMode] = useState<"repeat" | "add">("repeat");
  const [practiceList, setPracticeList] = useState<AudioTrack[]>([]);
  const [repeatCount, setRepeatCount] = useState<RepeatCount>(5);
  const [intervalSeconds, setIntervalSeconds] = useState<IntervalSeconds>(0.5);
  const [playbackState, setPlaybackState] = useState<PlaybackState>("idle");
  const [currentIndex, setCurrentIndex] = useState<number | null>(null);
  const [currentRepeat, setCurrentRepeat] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef(practiceList);
  const settingsRef = useRef({ repeatCount, intervalSeconds });

  useEffect(() => {
    listRef.current = practiceList;
  }, [practiceList]);

  useEffect(() => {
    settingsRef.current = { repeatCount, intervalSeconds };
  }, [repeatCount, intervalSeconds]);

  function clearTimer() {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  }

  function stop() {
    clearTimer();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setPlaybackState("idle");
    setQuickTrack(null);
    setCurrentIndex(null);
    setCurrentRepeat(0);
  }

  useEffect(
    () => () => {
      clearTimer();
      audioRef.current?.pause();
    },
    [],
  );

  function startQuickRepeat(track: AudioTrack) {
    stop();
    setQuickTrack(track);

    const playOnce = () => {
      const audio = audioRef.current ?? new Audio();
      audioRef.current = audio;
      audio.src = track.src;
      audio.currentTime = 0;
      audio.onerror = stop;
      audio.onended = () => {
        setPlaybackState("waiting");
        timerRef.current = setTimeout(playOnce, 2000);
      };
      setPlaybackState("playing");
      audio.load();
      timerRef.current = setTimeout(() => audio.play().catch(stop), 50);
    };

    playOnce();
  }

  function findLessonTrack(cd: string, label: string) {
    const group = groups.find((candidate) => candidate.name === cd);
    return (
      group?.tracks.find((track) => track.label === label) ??
      group?.tracks.find((track) =>
        track.fileName.replace(/\.mp3$/i, "").endsWith(label),
      )
    );
  }

  function playAt(index: number, repetition: number) {
    const track = listRef.current[index];
    if (!track) {
      stop();
      return;
    }
    clearTimer();
    const audio = audioRef.current ?? new Audio();
    audioRef.current = audio;
    audio.onended = () => handleEnded(index, repetition);
    audio.onerror = stop;
    audio.src = track.src;
    audio.currentTime = 0;
    setCurrentIndex(index);
    setCurrentRepeat(repetition);
    setPlaybackState("playing");
    audio.load();
    timerRef.current = setTimeout(() => audio.play().catch(stop), 50);
  }

  function handleEnded(index: number, repetition: number) {
    const { repeatCount: repeats, intervalSeconds: interval } =
      settingsRef.current;
    let nextIndex = index + 1;
    let nextRepeat = repetition;

    if (repeats === "infinite") {
      nextIndex = nextIndex % listRef.current.length;
    } else {
      if (nextIndex >= listRef.current.length) {
        // リスト終端に達した場合、次の繰り返しへ
        nextIndex = 0;
        nextRepeat = repetition + 1;
        if (nextRepeat > repeats) {
          stop();
          return;
        }
      }
    }

    setPlaybackState("waiting");
    timerRef.current = setTimeout(
      () => playAt(nextIndex, nextRepeat),
      interval * 1000,
    );
  }

  function togglePause() {
    if (playbackState === "playing") {
      audioRef.current?.pause();
      setPlaybackState("paused");
    } else if (playbackState === "paused") {
      audioRef.current
        ?.play()
        .then(() => setPlaybackState("playing"))
        .catch(stop);
    }
  }

  function addTrack(track: AudioTrack) {
    setPracticeList((current) =>
      current.some((item) => item.id === track.id)
        ? current
        : [...current, track],
    );
  }

  function updateList(next: AudioTrack[]) {
    stop();
    setPracticeList(next);
  }

  function moveTrack(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= practiceList.length) return;
    const next = [...practiceList];
    [next[index], next[target]] = [next[target], next[index]];
    updateList(next);
  }

  function playSingleTrack(track: AudioTrack) {
    const audio = new Audio();
    audio.src = track.src;
    audio.load();
    setTimeout(() => audio.play().catch(() => {}), 50);
  }

  const currentTrack =
    currentIndex === null ? null : practiceList[currentIndex];
  const status = quickTrack
    ? `${quickTrack.label}：2秒間隔で${playbackState === "waiting" ? "待機中" : playbackState === "paused" ? "一時停止" : "無限リピート中"}`
    : currentTrack
      ? `${currentTrack.label}（${currentRepeat}回目）${playbackState === "paused" ? "：一時停止" : playbackState === "waiting" ? "：待機中" : ""}`
      : "停止中";

  return (
    <main className="container audio-repeat-page">
      <header className="header">
        <h1>韓国語音声リピート練習</h1>
        <p>練習したい音声を選び、好きな順番で繰り返し聞けます。</p>
      </header>

      {lessonGroups.length > 0 && (
        <section className="card audio-repeat-quick">
          <div className="audio-repeat-heading-row">
            <div>
              <h2>教材順にすぐ練習</h2>
              <p>{quickTapMode === "repeat" ? "文字や単語を押すと、2秒間隔で無限リピートします。" : "文字や単語を押すと、自由リストに追加します。"}</p>
            </div>
            <select
              value={selectedLesson}
              onChange={(event) => {
                stop();
                setSelectedLesson(event.target.value);
              }}
              aria-label="練習するCD"
            >
              {lessonGroups.map((group) => (
                <option key={group.name} value={group.name}>
                  {group.name}
                </option>
              ))}
            </select>
          </div>
          <div className="mode-toggle">
            <button type="button" className={quickTapMode === "repeat" ? "active" : ""} onClick={() => setQuickTapMode("repeat")}>▶ すぐ練習</button>
            <button type="button" className={quickTapMode === "add" ? "active" : ""} onClick={() => setQuickTapMode("add")}>＋ リストに追加</button>
          </div>
          {selectedLesson &&
            (() => {
              const lesson = AUDIO_REPEAT_LESSONS[selectedLesson.toUpperCase()];
              return (
                <>
                  <h3>文字</h3>
                  <div className="audio-repeat-character-grid">
                    {lesson.characters.map((label) => {
                      const track = findLessonTrack(selectedLesson, label);
                      return (
                        <button
                          key={label}
                          type="button"
                          className={
                            quickTapMode === "repeat"
                              ? quickTrack?.id === track?.id ? "active" : ""
                              : practiceList.some((item) => item.id === track?.id) ? "active" : ""
                          }
                          disabled={!track}
                          onClick={() => {
                            if (!track) return;
                            if (quickTapMode === "repeat") startQuickRepeat(track);
                            else addTrack(track);
                          }}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                  <h3>単語</h3>
                  <div className="audio-repeat-word-grid">
                    {lesson.words.map((label) => {
                      const track = findLessonTrack(selectedLesson, label);
                      return (
                        <button
                          key={label}
                          type="button"
                          className={
                            quickTapMode === "repeat"
                              ? quickTrack?.id === track?.id ? "active" : ""
                              : practiceList.some((item) => item.id === track?.id) ? "active" : ""
                          }
                          disabled={!track}
                          onClick={() => {
                            if (!track) return;
                            if (quickTapMode === "repeat") startQuickRepeat(track);
                            else addTrack(track);
                          }}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                  {quickTapMode === "repeat" ? (
                    <div className="audio-repeat-quick-player" aria-live="polite">
                      <span>
                        {quickTrack
                          ? `${quickTrack.label}${playbackState === "paused" ? "：一時停止" : ""}`
                          : ""}
                      </span>
                      <button type="button" disabled={!quickTrack} onClick={stop}>
                        ■ 停止
                      </button>
                    </div>
                  ) : (
                    <div className="audio-repeat-quick-player" aria-live="polite">
                      <span>
                        {currentTrack
                          ? `${currentTrack.label}${playbackState === "paused" ? "：一時停止" : ""}`
                          : ""}
                      </span>
                      <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
                        <button type="button" disabled={!practiceList.length} onClick={() => { stop(); playAt(0, 1); }}>
                          ▶ 再生
                        </button>
                        <button type="button" disabled={currentTrack === null} onClick={togglePause}>
                          {playbackState === "paused" ? "▶ 再開" : "⏸"}
                        </button>
                        <button type="button" disabled={currentTrack === null} onClick={stop}>
                          ■ 停止
                        </button>
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
        </section>
      )}

      <div className="audio-repeat-custom-heading">
        <h2>自由リスト</h2>
        <p>複数の音声を選び、回数や間隔を自由に設定できます。</p>
      </div>
      <div className="audio-repeat-layout">
        <div className="audio-repeat-sidebar">
          <section className="card">
            <div className="audio-repeat-heading-row">
              <h2>練習リスト</h2>
              <button
                type="button"
                className="audio-repeat-text-button"
                disabled={!practiceList.length}
                onClick={() => updateList([])}
              >
                すべて削除
              </button>
            </div>
            {!practiceList.length && (
              <p className="audio-repeat-empty">
                上の「教材順にすぐ練習」から音声を追加してください。
              </p>
            )}
            <ol className="audio-repeat-practice-list">
              {practiceList.map((track, index) => (
                <li
                  key={track.id}
                  className={currentIndex === index ? "current" : ""}
                >
                  <div>
                    <strong>{track.label}</strong>
                    <small>{track.cd}</small>
                  </div>
                  <div className="audio-repeat-order-buttons">
                    <button
                      type="button"
                      onClick={() => playSingleTrack(track)}
                      aria-label={`${track.label}を再生`}
                      title="1回再生"
                    >
                      ▶
                    </button>
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => moveTrack(index, -1)}
                      aria-label={`${track.label}を上へ移動`}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      disabled={index === practiceList.length - 1}
                      onClick={() => moveTrack(index, 1)}
                      aria-label={`${track.label}を下へ移動`}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        updateList(
                          practiceList.filter(
                            (_, itemIndex) => itemIndex !== index,
                          ),
                        )
                      }
                      aria-label={`${track.label}を削除`}
                    >
                      ×
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section className="card audio-repeat-settings">
            <h2>練習設定</h2>
            <fieldset>
              <legend>リピート回数</legend>
              <div className="audio-repeat-options">
                {REPEAT_OPTIONS.map((value) => (
                  <button
                    type="button"
                    className={repeatCount === value ? "active" : ""}
                    onClick={() => setRepeatCount(value)}
                    key={value}
                  >
                    {value === "infinite" ? "無限" : `${value}回`}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend>音声間隔</legend>
              <div className="audio-repeat-options">
                {INTERVAL_OPTIONS.map((value) => (
                  <button
                    type="button"
                    className={intervalSeconds === value ? "active" : ""}
                    onClick={() => setIntervalSeconds(value)}
                    key={value}
                  >
                    {value}秒
                  </button>
                ))}
              </div>
            </fieldset>
            <p className="audio-repeat-status" aria-live="polite">
              {status}
            </p>
            <div className="audio-repeat-controls">
              <button
                type="button"
                className="btn-reset"
                disabled={!practiceList.length || playbackState !== "idle"}
                onClick={() => playAt(0, 1)}
              >
                ▶ 再生
              </button>
              <button
                type="button"
                disabled={
                  playbackState !== "playing" && playbackState !== "paused"
                }
                onClick={togglePause}
              >
                {playbackState === "paused" ? "▶ 再開" : "⏸ 一時停止"}
              </button>
              <button
                type="button"
                disabled={playbackState === "idle"}
                onClick={stop}
              >
                ■ 停止
              </button>
            </div>
          </section>
        </div>
      </div>
      <Link href="/" className="link-btn">
        ← トップへ戻る
      </Link>
    </main>
  );
}
