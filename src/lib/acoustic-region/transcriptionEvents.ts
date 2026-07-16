// IPA転写クイズの操作イベント時系列ログ（一次データ）。
// 設計: 【95666】の設計案（保存先: 別ストア + trialId結合）
//
// 記録対象は正誤ではなく「知覚判断の形成過程」。集計値（wordPlayCount 等）は
// このイベント列から計算可能な派生値と位置づけ、ここでは省略しない生ログを持つ。
// 人間向けの時系列要約（buildTranscriptionEventTimeline）は構造化イベントから
// その場で生成する。日本語文は一次データとして保存しない。

import type { AnswerSlot } from "./transcriptionAnalysis";
import { isWildcard } from "./transcriptionAnalysis";
import { isVowelPhoneme } from "./hangulPhonemes";

// ─── ID ──────────────────────────────────────────────────────────────────

export function newEventId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ─── 回答スナップショット ───────────────────────────────────────────────────

/**
 * 画面上の回答スロットのスナップショット。
 * rawSlots は null（空欄）を含む画面そのままの状態（完全復元用）。
 * slots は正規化済み（空欄・空候補を除外）で、既存の formatAnswerSlots 等と対応する。
 */
export interface AnswerSnapshot {
  slots: string[][];
  rawSlots: (string[] | null)[];
}

export function toAnswerSnapshot(heard: AnswerSlot[]): AnswerSnapshot {
  const rawSlots = heard.map((slot) => (slot === null ? null : [...slot.candidates]));
  const slots = rawSlots.filter(
    (candidates): candidates is string[] => candidates !== null && candidates.length > 0
  );
  return { slots, rawSlots };
}

// ─── 参照音素の種類（子音は将来枠。参照音源は現状母音・わたり音のみ） ───────────

const GLIDE_PHONEMES = new Set(["j", "w", "ɰ"]);

export type ReferencePhonemeKind = "vowel" | "glide" | "consonant";

export function referencePhonemeKind(phoneme: string): ReferencePhonemeKind {
  if (GLIDE_PHONEMES.has(phoneme)) return "glide";
  if (isVowelPhoneme(phoneme)) return "vowel";
  return "consonant";
}

// ─── イベント型 ──────────────────────────────────────────────────────────

export type InputSource = "click" | "keyboard" | "auto";

export type TranscriptionEventType =
  | "trial_display"
  | "word_play"
  | "word_play_started"
  | "word_play_ended"
  | "reference_play"
  | "reference_started"
  | "answer_change"
  | "memo_edit"
  | "pre_reference_snapshot"
  | "judge_submit"
  | "answer_revealed"
  | "trial_next"
  | "trial_quit";

export type AnswerChangeOp =
  | "append_phoneme"
  | "replace_phoneme"
  | "inject_family"
  | "or_add"
  | "remove_candidate"
  | "clear_slot"
  | "remove_last";

interface BaseFields {
  seq: number;
  at: string;
  elapsedMs: number;
  source?: InputSource;
}

export interface TrialDisplayEvent extends BaseFields {
  type: "trial_display";
  word: string;
  wordAttemptNumber?: number;
}

export interface WordPlayEvent extends BaseFields {
  type: "word_play" | "word_play_started" | "word_play_ended";
  wordPlayCountAfter?: number;
}

export interface ReferencePlayEvent extends BaseFields {
  type: "reference_play" | "reference_started";
  phoneme: string;
  phonemeKind: ReferencePhonemeKind;
  audioFile: string;
  referenceCountAfter?: number;
  answer?: AnswerSnapshot;
  duringNote?: string;
}

export interface AnswerChangeEvent extends BaseFields {
  type: "answer_change";
  op: AnswerChangeOp;
  phoneme?: string;
  candidates?: string[];
  slotIndex?: number;
  removedCandidate?: string;
  isWildcard?: boolean;
  answer: AnswerSnapshot;
}

export interface MemoEditEvent extends BaseFields {
  type: "memo_edit";
  phase: "during_answer" | "after_judgement";
  text: string;
}

export interface PreReferenceSnapshotEvent extends BaseFields {
  type: "pre_reference_snapshot";
  answer: AnswerSnapshot;
  duringNote: string;
  wordPlayCount: number;
  triggeredByPhoneme: string;
}

export interface JudgeSubmitEvent extends BaseFields {
  type: "judge_submit";
  answer: AnswerSnapshot;
  wordPlayCount: number;
  referencedBeforeSubmit: boolean;
}

export interface SimpleEvent extends BaseFields {
  type: "answer_revealed" | "trial_next" | "trial_quit";
}

export type TranscriptionEvent =
  | TrialDisplayEvent
  | WordPlayEvent
  | ReferencePlayEvent
  | AnswerChangeEvent
  | MemoEditEvent
  | PreReferenceSnapshotEvent
  | JudgeSubmitEvent
  | SimpleEvent;

/** 1試行分のイベントブロック。localStorage 別キーに保存し、trialId で ErrorLogRecord と結合する */
export interface TrialEventBlock {
  schemaVersion: 1;
  sessionId: string;
  trialId: string;
  word: string;
  trialStartedAt: string;
  events: TranscriptionEvent[];
}

// ─── 記録用の可変状態（page.tsx が ref に保持して使う） ───────────────────────

export interface TrialEventState {
  sessionId: string;
  trialId: string;
  word: string;
  trialStartedAt: string;
  trialStartedAtMs: number;
  seq: number;
  events: TranscriptionEvent[];
}

export function createTrialEventState(
  sessionId: string,
  word: string,
  trialStartedAt: string = new Date().toISOString()
): TrialEventState {
  return {
    sessionId,
    trialId: newEventId(),
    word,
    trialStartedAt,
    trialStartedAtMs: new Date(trialStartedAt).getTime(),
    seq: 0,
    events: [],
  };
}

function base(state: TrialEventState, source?: InputSource): BaseFields {
  const at = new Date();
  const fields: BaseFields = {
    seq: state.seq++,
    at: at.toISOString(),
    elapsedMs: at.getTime() - state.trialStartedAtMs,
  };
  if (source) fields.source = source;
  return fields;
}

export function recordTrialDisplay(
  state: TrialEventState,
  opts: { wordAttemptNumber?: number; source?: InputSource } = {}
): TrialDisplayEvent {
  const event: TrialDisplayEvent = {
    ...base(state, opts.source),
    type: "trial_display",
    word: state.word,
    ...(opts.wordAttemptNumber === undefined ? {} : { wordAttemptNumber: opts.wordAttemptNumber }),
  };
  state.events.push(event);
  return event;
}

export function recordWordPlay(
  state: TrialEventState,
  type: "word_play" | "word_play_started" | "word_play_ended",
  opts: { source?: InputSource; wordPlayCountAfter?: number } = {}
): WordPlayEvent {
  const event: WordPlayEvent = {
    ...base(state, opts.source),
    type,
    ...(opts.wordPlayCountAfter === undefined ? {} : { wordPlayCountAfter: opts.wordPlayCountAfter }),
  };
  state.events.push(event);
  return event;
}

export function recordReferencePlay(
  state: TrialEventState,
  type: "reference_play" | "reference_started",
  opts: {
    phoneme: string;
    audioFile: string;
    referenceCountAfter?: number;
    answer?: AnswerSnapshot;
    duringNote?: string;
    source?: InputSource;
  }
): ReferencePlayEvent {
  const event: ReferencePlayEvent = {
    ...base(state, opts.source),
    type,
    phoneme: opts.phoneme,
    phonemeKind: referencePhonemeKind(opts.phoneme),
    audioFile: opts.audioFile,
    ...(opts.referenceCountAfter === undefined ? {} : { referenceCountAfter: opts.referenceCountAfter }),
    ...(opts.answer === undefined ? {} : { answer: opts.answer }),
    ...(opts.duringNote === undefined ? {} : { duringNote: opts.duringNote }),
  };
  state.events.push(event);
  return event;
}

export function recordAnswerChange(
  state: TrialEventState,
  opts: {
    op: AnswerChangeOp;
    answer: AnswerSnapshot;
    phoneme?: string;
    candidates?: string[];
    slotIndex?: number;
    removedCandidate?: string;
    isWildcard?: boolean;
    source?: InputSource;
  }
): AnswerChangeEvent {
  const event: AnswerChangeEvent = {
    ...base(state, opts.source),
    type: "answer_change",
    op: opts.op,
    answer: opts.answer,
    ...(opts.phoneme === undefined ? {} : { phoneme: opts.phoneme }),
    ...(opts.candidates === undefined ? {} : { candidates: opts.candidates }),
    ...(opts.slotIndex === undefined ? {} : { slotIndex: opts.slotIndex }),
    ...(opts.removedCandidate === undefined ? {} : { removedCandidate: opts.removedCandidate }),
    ...(opts.isWildcard === undefined ? {} : { isWildcard: opts.isWildcard }),
  };
  state.events.push(event);
  return event;
}

export function recordMemoEdit(
  state: TrialEventState,
  opts: { phase: "during_answer" | "after_judgement"; text: string }
): MemoEditEvent {
  const event: MemoEditEvent = {
    ...base(state),
    type: "memo_edit",
    phase: opts.phase,
    text: opts.text,
  };
  state.events.push(event);
  return event;
}

export function recordPreReferenceSnapshot(
  state: TrialEventState,
  opts: {
    answer: AnswerSnapshot;
    duringNote: string;
    wordPlayCount: number;
    triggeredByPhoneme: string;
  }
): PreReferenceSnapshotEvent {
  const event: PreReferenceSnapshotEvent = {
    ...base(state),
    type: "pre_reference_snapshot",
    ...opts,
  };
  state.events.push(event);
  return event;
}

export function recordJudgeSubmit(
  state: TrialEventState,
  opts: {
    answer: AnswerSnapshot;
    wordPlayCount: number;
    referencedBeforeSubmit: boolean;
    source?: InputSource;
  }
): JudgeSubmitEvent {
  const event: JudgeSubmitEvent = {
    ...base(state, opts.source),
    type: "judge_submit",
    answer: opts.answer,
    wordPlayCount: opts.wordPlayCount,
    referencedBeforeSubmit: opts.referencedBeforeSubmit,
  };
  state.events.push(event);
  return event;
}

export function recordSimpleEvent(
  state: TrialEventState,
  type: "answer_revealed" | "trial_next" | "trial_quit",
  opts: { source?: InputSource } = {}
): SimpleEvent {
  const event: SimpleEvent = {
    ...base(state, opts.source),
    type,
  };
  state.events.push(event);
  return event;
}

export function toTrialEventBlock(state: TrialEventState): TrialEventBlock {
  return {
    schemaVersion: 1,
    sessionId: state.sessionId,
    trialId: state.trialId,
    word: state.word,
    trialStartedAt: state.trialStartedAt,
    events: [...state.events],
  };
}

// ─── 人間向け時系列要約（エクスポート用。都度生成し、日本語文は保存しない） ────

function formatPhoneme(phoneme: string): string {
  return isWildcard(phoneme) ? `${phoneme}?` : phoneme;
}

function formatSnapshotSlots(slots: string[][]): string {
  if (slots.length === 0) return "(空欄)";
  return slots
    .map((candidates) =>
      candidates.length > 1
        ? `[${candidates.map(formatPhoneme).join("|")}]`
        : formatPhoneme(candidates[0])
    )
    .join(" ");
}

function sourceLabel(source?: InputSource): string {
  if (source === "keyboard") return "キーボード";
  if (source === "auto") return "自動再生";
  if (source === "click") return "クリック";
  return "-";
}

function opLabel(op: AnswerChangeOp): string {
  switch (op) {
    case "append_phoneme":
      return "追加";
    case "replace_phoneme":
      return "置換";
    case "inject_family":
      return "系統投入";
    case "or_add":
      return "OR追記";
    case "remove_candidate":
      return "候補削除";
    case "clear_slot":
      return "空欄化";
    case "remove_last":
      return "末尾削除";
  }
}

function formatElapsed(elapsedMs: number): string {
  return `+${(elapsedMs / 1000).toFixed(1)}s`;
}

/** 1試行分のイベントブロックを、人間が読める時系列テキストへ整形する（都度生成・非保存） */
export function formatTrialEventTimeline(block: TrialEventBlock): string {
  const lines: string[] = [`## ${block.word}（trial ${block.trialId.slice(0, 8)}）`];
  for (const event of block.events) {
    const t = formatElapsed(event.elapsedMs);
    switch (event.type) {
      case "trial_display":
        lines.push(`${t} 問題表示${event.wordAttemptNumber ? `（累計${event.wordAttemptNumber}回目）` : ""}`);
        break;
      case "word_play":
        lines.push(`${t} 単語音声トリガー（${sourceLabel(event.source)}）`);
        break;
      case "word_play_started":
        lines.push(`${t} 単語音声 再生開始`);
        break;
      case "word_play_ended":
        lines.push(`${t} 単語音声 再生終了`);
        break;
      case "reference_play":
        lines.push(
          `${t} IPA参照押下 /${event.phoneme}/（${event.phonemeKind}）` +
            (event.answer ? ` 時点の回答: ${formatSnapshotSlots(event.answer.slots)}` : "")
        );
        break;
      case "reference_started":
        lines.push(`${t} IPA参照音 再生開始 /${event.phoneme}/`);
        break;
      case "answer_change":
        lines.push(
          `${t} 回答変更（${opLabel(event.op)}）→ ${formatSnapshotSlots(event.answer.slots)}`
        );
        break;
      case "memo_edit":
        lines.push(
          `${t} メモ確定（${event.phase === "during_answer" ? "回答中" : "判定後"}）: ${event.text}`
        );
        break;
      case "pre_reference_snapshot":
        lines.push(
          `${t} 参照直前スナップショット: 回答=${formatSnapshotSlots(event.answer.slots)}` +
            ` 単語再生${event.wordPlayCount}回 メモ="${event.duringNote}"`
        );
        break;
      case "judge_submit":
        lines.push(
          `${t} 最終回答送信: ${formatSnapshotSlots(event.answer.slots)}` +
            `（参照経験: ${event.referencedBeforeSubmit ? "あり" : "なし"}、単語再生${event.wordPlayCount}回）`
        );
        break;
      case "answer_revealed":
        lines.push(`${t} 正解表示`);
        break;
      case "trial_next":
        lines.push(`${t} 次の問題へ移動`);
        break;
      case "trial_quit":
        lines.push(`${t} 途中終了`);
        break;
    }
  }
  return lines.join("\n");
}

/** 複数試行ブロックをまとめた時系列要約 */
export function buildTranscriptionEventTimeline(blocks: TrialEventBlock[]): string {
  if (blocks.length === 0) return "記録なし";
  return blocks.map(formatTrialEventTimeline).join("\n\n");
}
