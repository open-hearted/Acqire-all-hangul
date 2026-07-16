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
  PHONEME_GUIDE,
  LOCAL_USER_ID,
  type TranscriptionJudgement,
  type TranscriptionGrade,
} from "@/lib/acoustic-region";
import type { AnswerSlot } from "@/lib/acoustic-region/transcriptionAnalysis";
import type {
  ErrorLogRecord,
  TranscriptionNote,
} from "@/lib/acoustic-region/types";
import { buildPerceptionLogExport } from "@/lib/acoustic-region/perceptionLogExport";

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
  correctPhonemes: string[];
  answerSlots: AnswerSlot[];
  alternativeMatchCount: number;
  transcriptionNotes: TranscriptionNote[];
}

interface VowelButtonInfo {
  phoneme: string;
  hangul: string;
  audioFile: string;
  area: string;
}

interface ConsonantButtonInfo {
  phoneme: string;
  hangul: string;
  hint: string;
}

interface PhonemeFamilyMember {
  phoneme: string;
  hangul: string;
}

interface PhonemeFamilyInfo {
  label: string;
  hangul: string;
  members: PhonemeFamilyMember[];
}

interface FinalGroupInfo {
  label: string;
  bracket: string;
  members: PhonemeFamilyMember[];
}

const WORDS: WordEntry[] = wordsData as WordEntry[];
const COUNT_OPTIONS = [1, 5, 10, 20];
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

const BASIC_VOWELS: VowelButtonInfo[] = [
  { phoneme: "i", hangul: "ㅣ", audioFile: "ㅣ.mp3", area: "vowel-i" },
  { phoneme: "ɯ", hangul: "ㅡ", audioFile: "ㅡ.mp3", area: "vowel-eu" },
  { phoneme: "u", hangul: "ㅜ", audioFile: "ㅜ.mp3", area: "vowel-u" },
  { phoneme: "e", hangul: "ㅔ", audioFile: "ㅔ.mp3", area: "vowel-e" },
  { phoneme: "ɛ", hangul: "ㅐ", audioFile: "ㅐ.mp3", area: "vowel-ae" },
  { phoneme: "ʌ", hangul: "ㅓ", audioFile: "ㅓ.mp3", area: "vowel-eo" },
  { phoneme: "o", hangul: "ㅗ", audioFile: "ㅗ.mp3", area: "vowel-o" },
  { phoneme: "a", hangul: "ㅏ", audioFile: "ㅏ.mp3", area: "vowel-a" },
];

const GLIDES: VowelButtonInfo[] = [
  { phoneme: "j", hangul: "例 ㅑ", audioFile: "ㅑ.mp3", area: "" },
  { phoneme: "w", hangul: "例 ㅘ", audioFile: "ㅘ.mp3", area: "" },
  { phoneme: "ɰ", hangul: "例 ㅢ", audioFile: "ㅢ.mp3", area: "" },
];

const VOWEL_FAMILIES: PhonemeFamilyInfo[] = [
  {
    label: "ㅔ・ㅐ",
    hangul: "ㅔ・ㅐ",
    members: [
      { phoneme: "e", hangul: "ㅔ" },
      { phoneme: "ɛ", hangul: "ㅐ" },
    ],
  },
  {
    label: "う系",
    hangul: "う系",
    members: [
      { phoneme: "ɯ", hangul: "ㅡ" },
      { phoneme: "u", hangul: "ㅜ" },
      { phoneme: "o", hangul: "ㅗ" },
    ],
  },
  {
    label: "お系",
    hangul: "お系",
    members: [
      { phoneme: "o", hangul: "ㅗ" },
      { phoneme: "ʌ", hangul: "ㅓ" },
    ],
  },
];

const CONSONANT_FAMILIES: PhonemeFamilyInfo[] = [
  {
    label: "k系",
    hangul: "ㄱ・ㅋ・ㄲ",
    members: [
      { phoneme: "k", hangul: "ㄱ" },
      { phoneme: "kʰ", hangul: "ㅋ" },
      { phoneme: "k͈", hangul: "ㄲ" },
    ],
  },
  {
    label: "t系",
    hangul: "ㄷ・ㅌ・ㄸ",
    members: [
      { phoneme: "t", hangul: "ㄷ" },
      { phoneme: "tʰ", hangul: "ㅌ" },
      { phoneme: "t͈", hangul: "ㄸ" },
    ],
  },
  {
    label: "p系",
    hangul: "ㅂ・ㅍ・ㅃ",
    members: [
      { phoneme: "p", hangul: "ㅂ" },
      { phoneme: "pʰ", hangul: "ㅍ" },
      { phoneme: "p͈", hangul: "ㅃ" },
    ],
  },
  {
    label: "s系",
    hangul: "ㅅ・ㅆ",
    members: [
      { phoneme: "s", hangul: "ㅅ" },
      { phoneme: "s͈", hangul: "ㅆ" },
    ],
  },
  {
    label: "チ系",
    hangul: "ㅈ・ㅊ・ㅉ",
    members: [
      { phoneme: "tɕ", hangul: "ㅈ" },
      { phoneme: "tɕʰ", hangul: "ㅊ" },
      { phoneme: "tɕ͈", hangul: "ㅉ" },
    ],
  },
];

const STANDALONE_CONSONANTS: ConsonantButtonInfo[] = [
  { phoneme: "m", hangul: "ㅁ", hint: "" },
  { phoneme: "n", hangul: "ㄴ", hint: "" },
  { phoneme: "ɾ", hangul: "ㄹ", hint: "語頭・語中" },
  { phoneme: "h", hangul: "ㅎ", hint: "" },
];

const FINAL_STOP_GROUP: FinalGroupInfo = {
  label: "閉鎖音",
  bracket: "[k̚|t̚|p̚]",
  members: [
    { phoneme: "k̚", hangul: "ㄱ系" },
    { phoneme: "t̚", hangul: "ㄷ系" },
    { phoneme: "p̚", hangul: "ㅂ系" },
  ],
};

const FINAL_NASAL_GROUP: FinalGroupInfo = {
  label: "鼻音",
  bracket: "[n|ŋ|m]",
  members: [
    { phoneme: "n", hangul: "ㄴ" },
    { phoneme: "ŋ", hangul: "ㅇ" },
    { phoneme: "m", hangul: "ㅁ" },
  ],
};

const FINAL_L: ConsonantButtonInfo = { phoneme: "l", hangul: "ㄹ", hint: "終声" };

function formatAnswerSlots(slots: AnswerSlot[]): string {
  return slots
    // 入力中は空欄スロットを残すが、回答ログには実際に選んだ音素だけを出す。
    .filter(
      (slot): slot is Exclude<AnswerSlot, null> =>
        slot !== null && slot.candidates.length > 0
    )
    .map((slot) => {
      const candidates = slot.candidates.map((phoneme) =>
        isWildcard(phoneme) ? `${phoneme}?` : phoneme
      );
      return candidates.length === 1 ? candidates[0] : `[${candidates.join("|")}]`;
    })
    .join(" ");
}

function formatSlotCandidates(candidates: string[]): string {
  const text = candidates.map((phoneme) =>
    isWildcard(phoneme) ? `${phoneme}?` : phoneme
  );
  return text.length > 1 ? `[${text.join(" | ")}]` : text[0] ?? "空欄";
}

function isVowelAnswer(phoneme: string): boolean {
  return phoneme === WILDCARD_VOWEL || KEYBOARD_VOWELS.includes(phoneme);
}

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

function newNoteId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function trimNoteText(text: string): string {
  return text.trim().slice(0, 1000);
}

function notePhaseLabel(phase: TranscriptionNote["phase"]): string {
  return phase === "during_answer" ? "回答中のメモ" : "判定後のメモ";
}

function formatNoteTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatOrCandidates(slots?: string[][] | null): string {
  if (!slots || slots.length === 0) return "なし";
  const multi = slots
    .map((candidates, idx) => ({ candidates, idx }))
    .filter((slot) => slot.candidates.length > 1);
  if (multi.length === 0) return "なし";
  return multi
    .map((slot) => `#${slot.idx + 1}[${slot.candidates.join(" | ")}]`)
    .join(" ");
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function TranscribeQuizPage() {
  const [hydrated, setHydrated] = useState(false);
  const [phase, setPhase] = useState<Phase>("setup");
  const [count, setCount] = useState(10);
  const [maxLen, setMaxLen] = useState(6);

  const [questions, setQuestions] = useState<WordEntry[]>([]);
  const [index, setIndex] = useState(0);
  const [heard, setHeard] = useState<AnswerSlot[]>([]);
  const [activeSlot, setActiveSlot] = useState<number | null>(null);
  const [orMode, setOrMode] = useState(false);
  const [pendingOr, setPendingOr] = useState(false);
  const [judgement, setJudgement] = useState<TranscriptionJudgement | null>(
    null
  );
  const [known, setKnown] = useState<boolean | null>(null);
  const [results, setResults] = useState<QuestionResult[]>([]);
  const [duringAnswerNote, setDuringAnswerNote] = useState("");
  const [afterJudgementDraft, setAfterJudgementDraft] = useState("");
  const [currentNotes, setCurrentNotes] = useState<TranscriptionNote[]>([]);
  const [memoHistoryOpen, setMemoHistoryOpen] = useState(false);
  const [memoHistory, setMemoHistory] = useState<ErrorLogRecord[]>([]);
  const [copyToast, setCopyToast] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const sessionStartedAtRef = useRef<string | null>(null);
  const wordPlayCountRef = useRef(0);
  const ipaReferenceCountsRef = useRef<Record<string, number>>({});
  const copyToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated || phase !== "setup") return;
    getRepositories()
      .errorLogs.listByUser(LOCAL_USER_ID)
      .then((records) => {
        const withNotes = records
          .filter(
            (record) =>
              Array.isArray(record.transcriptionNotes) &&
              record.transcriptionNotes.length > 0 &&
              Array.isArray(record.heardPhonemes)
          )
          .sort(
            (a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
        setMemoHistory(withNotes);
      })
      .catch(() => setMemoHistory([]));
  }, [hydrated, phase]);

  const question = questions[index];

  // ── Audio ─────────────────────────────────────────────────────────────────

  function resetQuestionActivity() {
    wordPlayCountRef.current = 0;
    ipaReferenceCountsRef.current = {};
  }

  function playWord(word: string, countQuestionPlayback = false) {
    if (countQuestionPlayback) wordPlayCountRef.current += 1;
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
    setActiveSlot(null);
    setOrMode(false);
    setPendingOr(false);
    setJudgement(null);
    setKnown(null);
    setResults([]);
    setDuringAnswerNote("");
    setAfterJudgementDraft("");
    setCurrentNotes([]);
    sessionIdRef.current = newNoteId();
    sessionStartedAtRef.current = new Date().toISOString();
    resetQuestionActivity();
    setPhase("quiz");
    playWord(qs[0].w, true);
  }

  function appendNote(
    phaseType: TranscriptionNote["phase"],
    text: string,
    notes: TranscriptionNote[] = currentNotes
  ): TranscriptionNote[] {
    const normalized = trimNoteText(text);
    if (!normalized) return notes;
    const next = [
      ...notes,
      {
        id: newNoteId(),
        phase: phaseType,
        text: normalized,
        createdAt: new Date().toISOString(),
      },
    ];
    setCurrentNotes(next);
    return next;
  }

  function flushAfterJudgementDraft(
    notes: TranscriptionNote[] = currentNotes
  ): TranscriptionNote[] {
    if (!judgement) return notes;
    const normalized = trimNoteText(afterJudgementDraft);
    if (!normalized) return notes;
    const next = appendNote("after_judgement", normalized, notes);
    setAfterJudgementDraft("");
    return next;
  }

  // 判定（1問につき1回。ここではまだ記録しない: 「知っていた」の入力を待つ）
  function handleJudge() {
    const answeredSlots = heard.filter(
      (slot): slot is Exclude<AnswerSlot, null> =>
        slot !== null && slot.candidates.length > 0
    );
    if (!question || judgement || answeredSlots.length === 0) return;
    const entry = getWordMaster().get(question.w);
    if (!entry) return;
    const during = trimNoteText(duringAnswerNote);
    if (during) {
      appendNote("during_answer", during, []);
    } else {
      setCurrentNotes([]);
    }
    setDuringAnswerNote("");
    setActiveSlot(null);
    setOrMode(false);
    setPendingOr(false);
    setJudgement(judgeTranscription(entry.phonemes, heard));
  }

  // 記録して次へ（判定済みの問題のみ記録する）
  function recordCurrent(): QuestionResult[] {
    if (!question || !judgement) return results;
    const wordMaster = getWordMaster().get(question.w);
    if (!wordMaster) return results;
    const finalizedNotes = flushAfterJudgementDraft(currentNotes);
    const built = buildTranscriptionErrorLog({
      word: question.w,
      heard,
      wordKnown: known,
      transcriptionNotes: finalizedNotes,
      sessionId: sessionIdRef.current ?? undefined,
      sessionStartedAt: sessionStartedAtRef.current ?? undefined,
      wordPlayCount: wordPlayCountRef.current,
      ipaReferenceCounts: { ...ipaReferenceCountsRef.current },
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
        correctPhonemes: wordMaster.phonemes.map((p) => p.phoneme),
        answerSlots: [...heard],
        alternativeMatchCount: judgement.alternativeMatchCount,
        transcriptionNotes: finalizedNotes,
      },
    ];
    setResults(next);
    return next;
  }

  function handleNext() {
    const nextResults = recordCurrent();
    const nextIndex = index + 1;
    setHeard([]);
    setActiveSlot(null);
    setOrMode(false);
    setPendingOr(false);
    setJudgement(null);
    setKnown(null);
    setCurrentNotes([]);
    setAfterJudgementDraft("");
    setDuringAnswerNote("");
    if (nextIndex >= questions.length) {
      setPhase("result");
      if (audioRef.current) audioRef.current.pause();
      return;
    }
    setIndex(nextIndex);
    resetQuestionActivity();
    playWord(questions[nextIndex].w, true);
    void nextResults;
  }

  function handleQuit() {
    recordCurrent();
    setHeard([]);
    setActiveSlot(null);
    setOrMode(false);
    setPendingOr(false);
    setJudgement(null);
    setKnown(null);
    setCurrentNotes([]);
    setAfterJudgementDraft("");
    setDuringAnswerNote("");
    setPhase("result");
    if (audioRef.current) audioRef.current.pause();
  }

  // ── Render helpers ────────────────────────────────────────────────────────

  function playGuideAudio(audioFile: string, phoneme?: string) {
    if (phoneme && phase === "quiz" && question) {
      ipaReferenceCountsRef.current = {
        ...ipaReferenceCountsRef.current,
        [phoneme]: (ipaReferenceCountsRef.current[phoneme] ?? 0) + 1,
      };
    }
    const src = `/audio/${encodeURIComponent(audioFile)}`;
    if (!audioRef.current) {
      audioRef.current = new Audio(src);
    } else {
      audioRef.current.pause();
      audioRef.current.src = src;
      audioRef.current.load();
    }
    audioRef.current.play().catch(() => {});
  }

  async function copyPerceptionLogs(scope: "today" | "all") {
    try {
      const records = await getRepositories().errorLogs.listByUser(LOCAL_USER_ID);
      const text = buildPerceptionLogExport(records, scope);
      if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(text);
      setCopyToast(scope === "today" ? "今日分をコピーしました" : "全期間をコピーしました");
    } catch {
      setCopyToast("コピーできませんでした");
    }
    if (copyToastTimerRef.current) clearTimeout(copyToastTimerRef.current);
    copyToastTimerRef.current = setTimeout(() => setCopyToast(null), 2200);
  }

  function appendOrCandidates(candidates: string[]) {
    const targetIndex = activeSlot !== null ? activeSlot : heard.length - 1;
    setPendingOr(false);
    if (targetIndex < 0 || heard[targetIndex] === null) return;
    const target = heard[targetIndex]!;
    const merged = [...target.candidates];
    for (const candidate of candidates) {
      if (!merged.includes(candidate)) merged.push(candidate);
    }
    const next = [...heard];
    next[targetIndex] = { candidates: merged };
    setHeard(next);
    if (activeSlot !== null) setActiveSlot(null);
  }

  function togglePendingOr() {
    if (judgement) return;
    setPendingOr((prev) => !prev);
  }

  function inputPhoneme(phoneme: string) {
    if (judgement) return;
    if (pendingOr) {
      appendOrCandidates([phoneme]);
      return;
    }
    if (orMode && activeSlot !== null) {
      const target = heard[activeSlot];
      const candidates = target?.candidates ?? [];
      const sameCategory = candidates.every(
        (candidate) => isVowelAnswer(candidate) === isVowelAnswer(phoneme)
      );
      if (candidates.includes(phoneme) || !sameCategory) {
        return;
      }
      const next = [...heard];
      next[activeSlot] = { candidates: [...candidates, phoneme] };
      setHeard(next);
      return;
    }
    if (activeSlot === null) {
      setHeard([...heard, { candidates: [phoneme] }]);
      return;
    }
    const next = [...heard];
    next[activeSlot] = { candidates: [phoneme] };
    setHeard(next);
    setActiveSlot(null);
  }

  function inputConsonantFamily(candidates: string[]) {
    if (judgement) return;
    if (pendingOr) {
      appendOrCandidates(candidates);
      return;
    }
    if (orMode) return;
    const next = [...heard];
    const slot: AnswerSlot = { candidates: [...candidates] };
    if (activeSlot === null) {
      next.push(slot);
    } else {
      next[activeSlot] = slot;
      setActiveSlot(null);
    }
    setHeard(next);
  }

  function deleteSlot(slotIndex: number) {
    if (judgement) return;
    const next = [...heard];
    next[slotIndex] = null;
    setHeard(next);
    setActiveSlot(slotIndex);
    setOrMode(false);
    setPendingOr(false);
  }

  function deleteCandidate(slotIndex: number, candidate: string) {
    if (judgement || heard[slotIndex] === null) return;
    const next = [...heard];
    const candidates = next[slotIndex]!.candidates.filter((p) => p !== candidate);
    next[slotIndex] = candidates.length > 0 ? { candidates } : null;
    setHeard(next);
    setActiveSlot(slotIndex);
  }

  function deleteLastPhoneme() {
    if (judgement) return;
    for (let i = heard.length - 1; i >= 0; i--) {
      if (heard[i] !== null && heard[i]!.candidates.length > 0) {
        deleteSlot(i);
        return;
      }
    }
  }

  function isInputDisabled(phoneme: string): boolean {
    if (judgement) return true;
    if (!orMode || activeSlot === null) return false;
    const candidates = heard[activeSlot]?.candidates ?? [];
    return (
      candidates.includes(phoneme) ||
      (candidates.length > 0 &&
        isVowelAnswer(candidates[0]) !== isVowelAnswer(phoneme))
    );
  }

  function renderVowelChoice(info: VowelButtonInfo, isGlide = false) {
    return (
      <div
        key={info.phoneme}
        className={`vowel-choice ${isGlide ? "glide" : ""}`}
        style={info.area ? { gridArea: info.area } : undefined}
      >
        <button
          type="button"
          className="vowel-answer-btn"
          disabled={isInputDisabled(info.phoneme)}
          onClick={() => inputPhoneme(info.phoneme)}
          aria-label={`${info.hangul}、IPA ${info.phoneme} を回答に入れる`}
        >
          <span className="vowel-hangul">{info.hangul}</span>
          <span className="vowel-ipa">/{info.phoneme}/</span>
        </button>
        <button
          type="button"
          className="vowel-audio-btn"
          onClick={() => playGuideAudio(info.audioFile, info.phoneme)}
          aria-label={`${info.hangul} の発音例を再生`}
          title={isGlide ? "わたり音を含む発音例" : "発音例を再生"}
        >
          🔊
        </button>
      </div>
    );
  }

  // 将来のIPAガイド再公開に備えて実装を保持（現在はUIから呼び出しを削除済み）
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function renderGuideSection(isOpen: boolean, onToggle: () => void) {
    return (
      <div className="stats-section" style={{ marginTop: "1rem" }}>
        <button
          className="btn-reset"
          style={{ width: "100%", textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px", background: "transparent", color: "inherit" }}
          onClick={onToggle}
        >
          <span style={{ fontWeight: "bold", fontSize: "1.1rem" }}>IPA一覧（解説つき）</span>
          <span>{isOpen ? "▲ 閉じる" : "▼ 開く"}</span>
        </button>
        {isOpen && (
          <div style={{ marginTop: "10px" }}>
            <div className="ipa-group-label" style={{ marginTop: "0" }}>母音・わたり音</div>
            {KEYBOARD_VOWELS.map(p => {
              const guide = PHONEME_GUIDE[p];
              if (!guide) return null;
              return (
                <div key={p} className="stats-row" style={{ cursor: guide.audioExample ? "pointer" : "default" }} onClick={() => guide.audioExample && playGuideAudio(guide.audioExample, p)}>
                  <span className="stats-char vowel">{p} {guide.audioExample ? "🔊" : ""}</span>
                  <span className="stats-level">{guide.label}</span>
                  <span className="stats-detail">{guide.hint}</span>
                </div>
              );
            })}
            
            <div className="ipa-group-label" style={{ marginTop: "1rem" }}>子音</div>
            {KEYBOARD_CONSONANTS.map(p => {
              const guide = PHONEME_GUIDE[p];
              if (!guide) return null;
              return (
                <div key={p} className="stats-row">
                  <span className="stats-char">{p}</span>
                  <span className="stats-level">{guide.label}</span>
                  <span className="stats-detail">{guide.hint}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  function renderKeyboard() {
    const disabled = judgement !== null;
    return (
      <div className="input-wrap transcription-keyboard">
        <div className="vowel-input-panel">
          <div className="ipa-group-label">基本母音（ハングル / IPA）</div>
          <div className="vowel-map">
            {BASIC_VOWELS.map((info) => renderVowelChoice(info))}
          </div>

          <div className="ipa-group-label">母音ファミリー</div>
          <div className="vowel-family-row">
            {VOWEL_FAMILIES.map((family) => {
              const familyPhonemes = family.members.map((member) => member.phoneme);
              return (
                <button
                  key={family.label}
                  type="button"
                  className="vowel-family-btn"
                  disabled={disabled || orMode}
                  onClick={() => inputConsonantFamily(familyPhonemes)}
                  aria-label={`${family.hangul}、候補 ${familyPhonemes.join("、")} を1音素分として回答に入れる`}
                  title={`${family.hangul}：/${familyPhonemes.join(" | ")}/ を候補にする`}
                >
                  <span className="vowel-family-hangul">{family.hangul}</span>
                  <span className="vowel-family-bracket">[{familyPhonemes.join("|")}]</span>
                </button>
              );
            })}
          </div>

          <div className="ipa-group-label">わたり音</div>
          <div className="glide-grid">
            {GLIDES.map((info) => renderVowelChoice(info, true))}
          </div>

          <div className="unknown-vowel-row">
            <button
              type="button"
              className="ipa-btn vowel wildcard unknown-vowel-btn"
              disabled={isInputDisabled(WILDCARD_VOWEL)}
              onClick={() => inputPhoneme(WILDCARD_VOWEL)}
            >
              母?　母音は聞こえたが分からない
            </button>
          </div>
        </div>

        <div className="consonant-input-panel">
          <div className="ipa-group-label">子音（初声・語中）</div>
          <div className="consonant-onset-grid" aria-label="初声・語中の子音">
            {CONSONANT_FAMILIES.map((family) => {
              const familyPhonemes = family.members.map((member) => member.phoneme);
              return (
                <div key={family.label} className="consonant-family-column">
                  <button
                    type="button"
                    className="consonant-family-btn"
                    disabled={disabled || orMode}
                    onClick={() => inputConsonantFamily(familyPhonemes)}
                    aria-label={`${family.label}、${family.hangul}、候補 ${familyPhonemes.join("、")} を1音素分として回答に入れる`}
                    title={`${family.hangul}：/${familyPhonemes.join(" | ")}/ を候補にする`}
                  >
                    <span>{family.label}</span>
                    <span className="consonant-family-hangul">{family.hangul}</span>
                  </button>
                  {family.members.map((member) => (
                    <button
                      key={member.phoneme}
                      type="button"
                      className="ipa-btn consonant-choice"
                      disabled={isInputDisabled(member.phoneme)}
                      onClick={() => inputPhoneme(member.phoneme)}
                      aria-label={`${member.hangul}、IPA ${member.phoneme} を回答に入れる`}
                      title={member.hangul}
                    >
                      <span className="consonant-hangul">{member.hangul}</span>
                      <span className="consonant-ipa">/{member.phoneme}/</span>
                    </button>
                  ))}
                </div>
              );
            })}
            <div className="consonant-standalone-column">
              {STANDALONE_CONSONANTS.map((consonant) => (
                <button
                  key={consonant.phoneme}
                  type="button"
                  className="ipa-btn consonant-choice"
                  disabled={isInputDisabled(consonant.phoneme)}
                  onClick={() => inputPhoneme(consonant.phoneme)}
                  aria-label={`${consonant.hangul}、IPA ${consonant.phoneme}${consonant.hint ? `、${consonant.hint}` : ""} を回答に入れる`}
                  title={consonant.hint ? `${consonant.hangul} ${consonant.hint}` : consonant.hangul}
                >
                  <span className="consonant-hangul">{consonant.hangul}</span>
                  <span className="consonant-ipa">/{consonant.phoneme}/</span>
                </button>
              ))}
            </div>
            <div className="consonant-utility-column">
              <button
                type="button"
                className="ipa-btn wildcard consonant-wildcard-btn"
                disabled={isInputDisabled(WILDCARD_CONSONANT)}
                onClick={() => inputPhoneme(WILDCARD_CONSONANT)}
              >
                子音
              </button>
              <button
                type="button"
                className={`consonant-or-btn ${pendingOr ? "pending" : ""}`}
                disabled={disabled || (activeSlot === null && heard.length === 0)}
                onClick={togglePendingOr}
                aria-pressed={pendingOr}
                aria-label="OR。次にタップした音または系統を直前の音素に追記する"
                title="次にタップした音/系統を直前の音素にOR候補として追記します"
              >
                OR
              </button>
            </div>
          </div>

          <div className="consonant-final-section">
            <div className="ipa-group-label">終声（閉じる音）</div>
            <div className="consonant-final-grid" aria-label="終声の子音">
              <button
                type="button"
                className="consonant-final-header stops"
                disabled={disabled || orMode}
                onClick={() => inputConsonantFamily(FINAL_STOP_GROUP.members.map((m) => m.phoneme))}
                aria-label={`${FINAL_STOP_GROUP.label}、候補 ${FINAL_STOP_GROUP.members.map((m) => m.phoneme).join("、")} を1音素分として回答に入れる`}
                title={`${FINAL_STOP_GROUP.bracket} を候補にする`}
              >
                <span>{FINAL_STOP_GROUP.label}</span>
                <span className="consonant-final-bracket">{FINAL_STOP_GROUP.bracket}</span>
              </button>
              {FINAL_STOP_GROUP.members.map((member) => (
                <button
                  key={member.phoneme}
                  type="button"
                  className="consonant-final-choice stops"
                  disabled={isInputDisabled(member.phoneme)}
                  onClick={() => inputPhoneme(member.phoneme)}
                  aria-label={`${member.hangul}、IPA ${member.phoneme}、終声 を回答に入れる`}
                  title={member.hangul}
                >
                  <span className="consonant-hangul">{member.hangul}</span>
                  <span className="consonant-ipa final-ipa">/{member.phoneme}/</span>
                </button>
              ))}
              <button
                type="button"
                className="consonant-final-header nasals"
                disabled={disabled || orMode}
                onClick={() => inputConsonantFamily(FINAL_NASAL_GROUP.members.map((m) => m.phoneme))}
                aria-label={`${FINAL_NASAL_GROUP.label}、候補 ${FINAL_NASAL_GROUP.members.map((m) => m.phoneme).join("、")} を1音素分として回答に入れる`}
                title={`${FINAL_NASAL_GROUP.bracket} を候補にする`}
              >
                <span>{FINAL_NASAL_GROUP.label}</span>
                <span className="consonant-final-bracket">{FINAL_NASAL_GROUP.bracket}</span>
              </button>
              {FINAL_NASAL_GROUP.members.map((member) => (
                <button
                  key={member.phoneme}
                  type="button"
                  className="consonant-final-choice nasals"
                  disabled={isInputDisabled(member.phoneme)}
                  onClick={() => inputPhoneme(member.phoneme)}
                  aria-label={`${member.hangul}、IPA ${member.phoneme}、終声 を回答に入れる`}
                  title={member.hangul}
                >
                  <span className="consonant-hangul">{member.hangul}</span>
                  <span className="consonant-ipa final-ipa">/{member.phoneme}/</span>
                </button>
              ))}
              <button
                type="button"
                className="consonant-final-choice neutral"
                disabled={isInputDisabled(FINAL_L.phoneme)}
                onClick={() => inputPhoneme(FINAL_L.phoneme)}
                aria-label={`${FINAL_L.hangul}、IPA ${FINAL_L.phoneme}、終声 を回答に入れる`}
                title={`${FINAL_L.hangul} ${FINAL_L.hint}`}
              >
                <span className="consonant-hangul">{FINAL_L.hangul}</span>
                <span className="consonant-ipa final-ipa">/{FINAL_L.phoneme}/</span>
              </button>
            </div>
          </div>

          <div className="ipa-grid keyboard-delete-row">
            <button
              type="button"
              className="ipa-btn"
              disabled={disabled || heard.every((slot) => slot === null)}
              onClick={deleteLastPhoneme}
            >
              ⌫ 最後の音素を空欄にする
            </button>
          </div>
        </div>
      </div>
    );
  }

  function renderSlots(j: TranscriptionJudgement) {
    return (
      <div className="slot-row">
        {j.slots.map((slot, i) => (
          <div key={i} className={`slot ${slot.isAlternativeMatch ? "alternative" : slot.kind}`}>
            <span className="slot-heard">
              {slot.kind === "deletion"
                ? "―"
                : formatSlotCandidates(slot.heardCandidates ?? (slot.heard ? [slot.heard] : []))}
            </span>
            <span className="slot-actual">
              {slot.kind === "insertion" ? "余分" : slot.actual?.phoneme}
            </span>
          </div>
        ))}
      </div>
    );
  }

  function renderNotes(notes: TranscriptionNote[]) {
    if (notes.length === 0) return null;
    return (
      <div className="transcribe-note-list">
        {notes.map((note) => (
          <div key={note.id} className="stats-row none transcribe-note-item">
            <span className="stats-level">{notePhaseLabel(note.phase)}</span>
            <span className="stats-char transcribe-note-time">
              {formatNoteTimestamp(note.createdAt)}
            </span>
            <span className="stats-detail transcribe-note-text">
              {note.text}
            </span>
          </div>
        ))}
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (!hydrated) return null;

  // Setup
  if (phase === "setup") {
    const poolSize = WORDS.filter((w) => w.p <= maxLen).length;
    return (
      <div className="container">
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

          <div className="transcribe-export-actions" aria-label="知覚ログをコピー">
            <button
              type="button"
              className="transcribe-export-btn"
              onClick={() => void copyPerceptionLogs("today")}
            >
              今日分コピー
            </button>
            <button
              type="button"
              className="transcribe-export-btn"
              onClick={() => void copyPerceptionLogs("all")}
            >
              全期間コピー
            </button>
          </div>
          {copyToast && (
            <div className="transcribe-copy-toast" role="status" aria-live="polite">
              {copyToast}
            </div>
          )}

          {/* 将来再公開のため IPA ガイドのコンテンツ実装は残し、現在は UI から非表示 */}

          <div className="stats-section" style={{ marginTop: "1rem" }}>
            <button
              className="btn-reset"
              style={{ width: "100%", textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px", background: "transparent", color: "inherit" }}
              onClick={() => setMemoHistoryOpen(!memoHistoryOpen)}
            >
              <span style={{ fontWeight: "bold", fontSize: "1.1rem" }}>過去の回答メモ</span>
              <span>{memoHistoryOpen ? "▲ 閉じる" : `▼ 開く（${memoHistory.length}件）`}</span>
            </button>
            {memoHistoryOpen && (
              <div style={{ marginTop: "0.6rem" }}>
                {memoHistory.length === 0 && (
                  <p style={{ fontSize: "0.9rem", color: "#616161" }}>
                    まだメモ付きのIPA転写記録はありません。
                  </p>
                )}
                {memoHistory.map((record) => {
                  const correct =
                    getWordMaster()
                      .get(record.word)
                      ?.phonemes.map((p) => p.phoneme)
                      .join(" ") ?? "-";
                  const answer =
                    record.heardCandidateSlots && record.heardCandidateSlots.length > 0
                      ? record.heardCandidateSlots
                          .map((candidates) =>
                            candidates.length === 0
                              ? "□"
                              : candidates.length > 1
                                ? `[${candidates.map((p) => (isWildcard(p) ? `${p}?` : p)).join(" | ")}]`
                                : (isWildcard(candidates[0]) ? `${candidates[0]}?` : candidates[0])
                          )
                          .join(" ")
                      : (record.heardPhonemes ?? [])
                          .map((p) => (isWildcard(p) ? `${p}?` : p))
                          .join(" ");
                  return (
                    <div key={record.id} className="stats-row none" style={{ alignItems: "flex-start" }}>
                      <span className="stats-char" style={{ minWidth: "auto" }}>
                        {record.word}
                      </span>
                      <span className="stats-level" style={{ minWidth: "auto" }}>
                        {formatNoteTimestamp(record.createdAt)}
                      </span>
                      <div className="stats-detail" style={{ whiteSpace: "pre-wrap" }}>
                        <div>意味: {record.meaning}</div>
                        <div>正解IPA: /{correct}/</div>
                        <div>回答IPA: /{answer}/</div>
                        <div>OR候補: {formatOrCandidates(record.heardCandidateSlots)}</div>
                        {(record.transcriptionNotes ?? []).map((note) => (
                          <div key={note.id}>
                            {notePhaseLabel(note.phase)} ({formatNoteTimestamp(note.createdAt)}): {note.text}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <Link href="/regions" className="link-btn link-btn-disabled" aria-disabled="true" tabIndex={-1} onClick={(event) => event.preventDefault()}>
            音響領域の分析へ →
          </Link>
          <Link href="/words" className="link-btn link-btn-disabled" aria-disabled="true" tabIndex={-1} onClick={(event) => event.preventDefault()}>
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
    const alternativeCount = results.filter(
      (r) => r.alternativeMatchCount > 0
    ).length;
    return (
      <div className="container transcribe-result-page">
        <div className="transcribe-result-layout">
          <div className="result-card transcribe-result-summary">
            <h2>クイズ完了！</h2>
            <div className="result-score">
              {byGrade("perfect")} {" "}
              <span>
                / {results.length} 完全一致・候補内一致 {alternativeCount}・配置一致 {byGrade("pattern") - alternativeCount}・
                配置不一致 {byGrade("mismatch")}
              </span>
            </div>
            <button className="btn-reset" onClick={startSession}>
              もう一度（同じ設定）
            </button>
            <button
              className="btn-reset btn-muted"
              onClick={() => setPhase("setup")}
            >
              IPA転写クイズトップに戻る
            </button>
            <Link href="/regions" className="link-btn link-btn-disabled" aria-disabled="true" tabIndex={-1} onClick={(event) => event.preventDefault()}>
              音響領域の分析へ →
            </Link>
          </div>

          {results.length > 0 && (
            <div className="stats-section transcribe-result-breakdown">
              <h2>内訳</h2>
              <div className="transcribe-result-list">
                {results.map((r, i) => (
                  <div
                    key={i}
                    className={`stats-row ${
                      r.grade === "perfect"
                        ? "good"
                        : r.alternativeMatchCount > 0
                          ? "soso"
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
                    <span className="stats-level">
                      {r.alternativeMatchCount > 0 ? "候補内一致" : GRADE_LABEL[r.grade]}
                    </span>
                    <div className="stats-detail transcription-result-detail">
                      <span>{r.meaning}・{r.summary}</span>
                      <span><strong>正解：</strong>/{r.correctPhonemes.join(" ")}/</span>
                      <span><strong>回答：</strong>/{formatAnswerSlots(r.answerSlots)}/</span>
                      {r.transcriptionNotes.length > 0 && (
                        <div className="transcribe-result-note-list">
                          {r.transcriptionNotes.map((note) => (
                            <div key={note.id} className="transcribe-result-note-item">
                              <strong>{notePhaseLabel(note.phase)}:</strong> {note.text}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Quiz
  const answeredPhonemeCount = heard.filter((slot) => slot !== null).length;
  return (
    <div className="container transcribe-quiz-page">
      <div className="card transcribe-quiz-card">
        <div className="transcribe-segment-progress" aria-label="問題進捗">
          {Array.from({ length: questions.length }, (_, i) => (
            <span
              key={i}
              className={`transcribe-segment ${i <= index ? "filled" : ""}`}
            />
          ))}
        </div>
        <div className="question-label">問題 {index + 1}（IPA転写）</div>

        <div className="transcribe-audio-answer-row">
          <button className="btn-audio" onClick={() => playWord(question.w, true)}>
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
            再生
          </button>

          <div className="transcribe-input-column">
            <div className="input-wrap transcribe-during-note-wrap transcribe-during-note-inline">
              <label className="input-label" htmlFor="transcription-during-note">
                聞こえた感じメモ（任意）
              </label>
              <textarea
                id="transcription-during-note"
                className="heard-note-area transcribe-during-note"
                placeholder="例:「イヤギ」って感じに聞こえた"
                value={duringAnswerNote}
                maxLength={1000}
                onChange={(event) => setDuringAnswerNote(event.target.value)}
                rows={3}
              />
            </div>

            {/* 入力中の列 */}
            <div className="heard-line" aria-label="回答音素スロット">
            {heard.length === 0 ? (
              <span className="heard-empty">（ここに入力した音素が並びます）</span>
            ) : (
              heard.map((slot, i) => (
                <div
                  key={i}
                  className={`heard-slot ${slot === null ? "empty" : ""} ${
                    activeSlot === i ? "active" : ""
                  } ${orMode && activeSlot === i ? "or-active" : ""}`}
                >
                  <button
                    type="button"
                    className="heard-slot-value"
                    disabled={judgement !== null || orMode}
                    onClick={() => {
                      setActiveSlot(i);
                      setOrMode(false);
                      setPendingOr(false);
                    }}
                    aria-label={`${i + 1}番目のスロットを選択`}
                  >
                    {slot === null ? "空欄" : formatSlotCandidates(slot.candidates)}
                  </button>
                  {slot !== null && (
                    <button
                      type="button"
                      className="heard-slot-delete"
                      disabled={judgement !== null || (orMode && activeSlot !== i)}
                      onClick={() => deleteSlot(i)}
                      aria-label={`${i + 1}番目の音素を削除して空欄にする`}
                    >
                      ×
                    </button>
                  )}
                  {slot !== null && activeSlot === i && slot.candidates.length > 1 && (
                    <div className="heard-candidate-editor" aria-label={`${i + 1}番目の候補を削除`}>
                      {slot.candidates.map((candidate) => (
                        <button
                          key={candidate}
                          type="button"
                          className="heard-candidate-delete"
                          disabled={judgement !== null}
                          onClick={() => deleteCandidate(i, candidate)}
                          aria-label={`${candidate} を候補から削除`}
                        >
                          {isWildcard(candidate) ? `${candidate}?` : candidate} ×
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
            {activeSlot !== null && (
              <>
                {(heard[activeSlot] === null || isVowelAnswer(heard[activeSlot]!.candidates[0])) && (
                  <button
                    type="button"
                    className={`heard-append-btn ${orMode ? "active" : ""}`}
                    onClick={() => setOrMode(!orMode)}
                    aria-pressed={orMode}
                  >
                    {orMode ? "OR入力を終了" : "OR候補を追加"}
                  </button>
                )}
                <button
                  type="button"
                  className="heard-append-btn"
                  onClick={() => {
                    setActiveSlot(null);
                    setOrMode(false);
                    setPendingOr(false);
                  }}
                >
                  ＋ 末尾に追加へ戻る
                </button>
              </>
            )}
            </div>
          </div>
        </div>
        {!judgement && heard.length > 0 && (
          <p className="heard-edit-help">
            スロットを選んで音素ボタンを押すと置換できます。OR候補を追加すると同じスロットにいくつでも追加できます。×で消しても空欄は残ります。
          </p>
        )}

        {!judgement && renderKeyboard()}

        {!judgement && (
          <div className="transcribe-note-judge-row">
            <button
              className="btn-reset transcribe-judge"
              onClick={handleJudge}
              disabled={answeredPhonemeCount === 0}
            >
              判定する（{answeredPhonemeCount}音素）
            </button>
          </div>
        )}

        {judgement && (
          <>
            <div
              className={`feedback ${
                judgement.grade === "perfect"
                  ? "correct"
                  : judgement.alternativeMatchCount > 0
                    ? "unset"
                    : "incorrect"
              }`}
              role="alert"
              aria-live="polite"
            >
              {judgement.summary}
            </div>
            <div className="transcribe-post-judge-grid">
              <div className="transcribe-post-main">
                {renderSlots(judgement)}
                <p className="transcribe-answer-line">
                  正解: {question.w}（{question.e}）＝ /
                  {getWordMaster()
                    .get(question.w)
                    ?.phonemes.map((p) => p.phoneme)
                    .join(" ")}
                  /
                </p>
                <p className="transcribe-answer-line">
                  回答: /{formatAnswerSlots(heard)}/
                </p>
              </div>
              <div className="transcribe-post-note-panel">
                <div className="input-wrap transcribe-after-note-wrap">
                  <label className="input-label" htmlFor="transcription-after-note">
                    判定後のメモを追加（任意）
                  </label>
                  <div className="transcribe-after-note-controls">
                    <textarea
                      id="transcription-after-note"
                      className="heard-note-area transcribe-after-note"
                      value={afterJudgementDraft}
                      maxLength={1000}
                      onChange={(event) => setAfterJudgementDraft(event.target.value)}
                      rows={3}
                    />
                    <button
                      type="button"
                      className="btn-reset transcribe-note-add"
                      onClick={() => {
                        const normalized = trimNoteText(afterJudgementDraft);
                        if (!normalized) return;
                        appendNote("after_judgement", normalized);
                        setAfterJudgementDraft("");
                      }}
                      disabled={trimNoteText(afterJudgementDraft).length === 0}
                    >
                      メモを追加
                    </button>
                  </div>
                </div>
                <div className="transcribe-note-panel-scroll">{renderNotes(currentNotes)}</div>
              </div>
            </div>
            <div className="transcribe-post-actions">
              <button
                type="button"
                className={`known-btn ${known ? "active" : ""}`}
                onClick={() => setKnown(known ? null : true)}
              >
                ✔ この単語は知っていた
              </button>
              <button className="btn-next transcribe-next" onClick={handleNext}>
                {index + 1 < questions.length ? "次の問題 →" : "結果を見る"}
              </button>
              <button
                className="btn-reset transcribe-quit transcribe-quit-inline btn-muted"
                onClick={handleQuit}
              >
                ここで終了する
              </button>
            </div>
          </>
        )}
      </div>

      {!judgement && (
        <button
          className="btn-reset transcribe-quit btn-muted"
          onClick={handleQuit}
        >
          ここで終了する
        </button>
      )}
    </div>
  );
}
