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
  type TranscriptionJudgement,
  type TranscriptionGrade,
} from "@/lib/acoustic-region";

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
  answerSlots: Array<string | null>;
}

interface VowelButtonInfo {
  phoneme: string;
  hangul: string;
  audioFile: string;
  area: string;
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

function formatAnswerSlots(slots: Array<string | null>): string {
  return slots
    .map((phoneme) =>
      phoneme === null ? "□" : isWildcard(phoneme) ? `${phoneme}?` : phoneme
    )
    .join(" ");
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

// ─── Component ───────────────────────────────────────────────────────────────

export default function TranscribeQuizPage() {
  const [hydrated, setHydrated] = useState(false);
  const [phase, setPhase] = useState<Phase>("setup");
  const [count, setCount] = useState(10);
  const [maxLen, setMaxLen] = useState(6);

  const [questions, setQuestions] = useState<WordEntry[]>([]);
  const [index, setIndex] = useState(0);
  const [heard, setHeard] = useState<Array<string | null>>([]);
  const [activeSlot, setActiveSlot] = useState<number | null>(null);
  const [judgement, setJudgement] = useState<TranscriptionJudgement | null>(
    null
  );
  const [known, setKnown] = useState<boolean | null>(null);
  const [results, setResults] = useState<QuestionResult[]>([]);
  const [guideOpen, setGuideOpen] = useState(false);
  const [setupGuideOpen, setSetupGuideOpen] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    setHydrated(true);
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

  function startSession() {
    const source = WORDS.filter((w) => w.p <= maxLen);
    if (source.length === 0) return;
    const qs = shuffle(source).slice(0, count);
    setQuestions(qs);
    setIndex(0);
    setHeard([]);
    setActiveSlot(null);
    setJudgement(null);
    setKnown(null);
    setResults([]);
    setPhase("quiz");
    playWord(qs[0].w);
  }

  // 判定（1問につき1回。ここではまだ記録しない: 「知っていた」の入力を待つ）
  function handleJudge() {
    const heardPhonemes = heard.filter((p): p is string => p !== null);
    if (!question || judgement || heardPhonemes.length === 0) return;
    const entry = getWordMaster().get(question.w);
    if (!entry) return;
    setActiveSlot(null);
    setJudgement(judgeTranscription(entry.phonemes, heardPhonemes));
  }

  // 記録して次へ（判定済みの問題のみ記録する）
  function recordCurrent(): QuestionResult[] {
    if (!question || !judgement) return results;
    const heardPhonemes = heard.filter((p): p is string => p !== null);
    const wordMaster = getWordMaster().get(question.w);
    if (!wordMaster) return results;
    const built = buildTranscriptionErrorLog({
      word: question.w,
      heard: heardPhonemes,
      wordKnown: known,
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
    setJudgement(null);
    setKnown(null);
    if (nextIndex >= questions.length) {
      setPhase("result");
      if (audioRef.current) audioRef.current.pause();
      return;
    }
    setIndex(nextIndex);
    playWord(questions[nextIndex].w);
    void nextResults;
  }

  function handleQuit() {
    recordCurrent();
    setHeard([]);
    setActiveSlot(null);
    setJudgement(null);
    setKnown(null);
    setPhase("result");
    if (audioRef.current) audioRef.current.pause();
  }

  // ── Render helpers ────────────────────────────────────────────────────────

  function playGuideAudio(audioFile: string) {
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

  function inputPhoneme(phoneme: string) {
    if (judgement) return;
    if (activeSlot === null) {
      setHeard([...heard, phoneme]);
      return;
    }
    const next = [...heard];
    next[activeSlot] = phoneme;
    setHeard(next);
    setActiveSlot(null);
  }

  function deleteSlot(slotIndex: number) {
    if (judgement) return;
    const next = [...heard];
    next[slotIndex] = null;
    setHeard(next);
    setActiveSlot(slotIndex);
  }

  function deleteLastPhoneme() {
    if (judgement) return;
    for (let i = heard.length - 1; i >= 0; i--) {
      if (heard[i] !== null) {
        deleteSlot(i);
        return;
      }
    }
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
          disabled={judgement !== null}
          onClick={() => inputPhoneme(info.phoneme)}
          aria-label={`${info.hangul}、IPA ${info.phoneme} を回答に入れる`}
        >
          <span className="vowel-hangul">{info.hangul}</span>
          <span className="vowel-ipa">/{info.phoneme}/</span>
        </button>
        <button
          type="button"
          className="vowel-audio-btn"
          onClick={() => playGuideAudio(info.audioFile)}
          aria-label={`${info.hangul} の発音例を再生`}
          title={isGlide ? "わたり音を含む発音例" : "発音例を再生"}
        >
          🔊
        </button>
      </div>
    );
  }

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
                <div key={p} className="stats-row" style={{ cursor: guide.audioExample ? "pointer" : "default" }} onClick={() => guide.audioExample && playGuideAudio(guide.audioExample)}>
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
        <div className="keyboard-toolbar" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
          <span className="input-label" style={{ marginBottom: 0 }}>
            聞こえた順に1音素ずつタップ。分からないけど聞こえている音は「母?」「子?」
          </span>
          <button
            type="button"
            className="btn-reset"
            style={{ width: "auto", fontSize: "0.8rem", padding: "4px 8px", background: "#f5f5f5", color: "#333", marginLeft: "10px", flexShrink: 0 }}
            onClick={() => setGuideOpen(!guideOpen)}
          >
            {guideOpen ? "閉じる" : "？IPAの読み方"}
          </button>
        </div>
        
        {guideOpen && (
          <div className="ipa-inline-guide" style={{ marginBottom: "16px", padding: "10px", background: "#fafafa", borderRadius: "8px", border: "1px solid #ddd" }}>
            <div className="ipa-group-label" style={{ marginTop: "0" }}>母音・わたり音</div>
            {KEYBOARD_VOWELS.map(p => {
              const guide = PHONEME_GUIDE[p];
              if (!guide) return null;
              return (
                <div key={p} className="stats-row" style={{ padding: "8px", background: "#fff", cursor: guide.audioExample ? "pointer" : "default" }} onClick={() => guide.audioExample && playGuideAudio(guide.audioExample)}>
                  <span className="stats-char vowel" style={{ fontSize: "1.2rem" }}>{p} {guide.audioExample ? <span style={{fontSize: "0.9rem"}}>🔊</span> : ""}</span>
                  <span className="stats-level" style={{ fontSize: "0.9rem" }}>{guide.label}</span>
                  <span className="stats-detail" style={{ fontSize: "0.85rem" }}>{guide.hint}</span>
                </div>
              );
            })}
            
            <div className="ipa-group-label" style={{ marginTop: "1rem" }}>子音</div>
            {KEYBOARD_CONSONANTS.map(p => {
              const guide = PHONEME_GUIDE[p];
              if (!guide) return null;
              return (
                <div key={p} className="stats-row" style={{ padding: "8px", background: "#fff" }}>
                  <span className="stats-char" style={{ fontSize: "1.2rem" }}>{p}</span>
                  <span className="stats-level" style={{ fontSize: "0.9rem" }}>{guide.label}</span>
                  <span className="stats-detail" style={{ fontSize: "0.85rem" }}>{guide.hint}</span>
                </div>
              );
            })}
          </div>
        )}

        <div className="vowel-input-panel">
          <div className="ipa-group-label">基本母音（ハングル / IPA）</div>
          <p className="ipa-input-help">文字部分は回答、🔊は発音例だけを再生します。</p>
          <div className="vowel-map">
            {BASIC_VOWELS.map((info) => renderVowelChoice(info))}
          </div>

          <div className="ipa-group-label">わたり音</div>
          <p className="ipa-input-help">単独音ではありません。🔊は母音と組み合わせた発音例です。</p>
          <div className="glide-grid">
            {GLIDES.map((info) => renderVowelChoice(info, true))}
          </div>

          <div className="unknown-vowel-row">
            <button
              type="button"
              className="ipa-btn vowel wildcard unknown-vowel-btn"
              disabled={disabled}
              onClick={() => inputPhoneme(WILDCARD_VOWEL)}
            >
              母?　母音は聞こえたが分からない
            </button>
          </div>
        </div>

        <div className="consonant-input-panel">
          <div className="ipa-group-label">子音</div>
          <div className="ipa-grid consonant-grid">
            {KEYBOARD_CONSONANTS.map((p) => (
              <button
                key={p}
                type="button"
                className="ipa-btn"
                disabled={disabled}
                onClick={() => inputPhoneme(p)}
              >
                {p}
              </button>
            ))}
            <button
              type="button"
              className="ipa-btn wildcard"
              disabled={disabled}
              onClick={() => inputPhoneme(WILDCARD_CONSONANT)}
            >
              子?
            </button>
          </div>
          <div className="ipa-grid keyboard-delete-row">
            <button
              type="button"
              className="ipa-btn"
              disabled={disabled || heard.every((p) => p === null)}
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
          <div key={i} className={`slot ${slot.kind}`}>
            <span className="slot-heard">
              {slot.kind === "deletion"
                ? "―"
                : isWildcard(slot.heard ?? "")
                  ? `${slot.heard}?`
                  : slot.heard}
            </span>
            <span className="slot-actual">
              {slot.kind === "insertion" ? "余分" : slot.actual?.phoneme}
            </span>
          </div>
        ))}
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (!hydrated) return null;

  const header = (
    <div className="header">
      <h1>IPA転写クイズ</h1>
      <p>聞こえた音を1音素ずつIPAで書き取る（精密測定）</p>
    </div>
  );

  // Setup
  if (phase === "setup") {
    const poolSize = WORDS.filter((w) => w.p <= maxLen).length;
    return (
      <div className="container">
        {header}
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
          
          {renderGuideSection(setupGuideOpen, () => setSetupGuideOpen(!setupGuideOpen))}

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
    return (
      <div className="container">
        {header}
        <div className="result-card">
          <h2>クイズ完了！</h2>
          <div className="result-score">
            {byGrade("perfect")}{" "}
            <span>
              / {results.length} 完全一致・配置一致 {byGrade("pattern")}・
              配置不一致 {byGrade("mismatch")}
            </span>
          </div>
          <button className="btn-reset" onClick={startSession}>
            もう一度（同じ設定）
          </button>
          <button
            className="btn-reset"
            style={{ background: "transparent", color: "#757575", border: "1px solid #e0e0e0" }}
            onClick={() => setPhase("setup")}
          >
            IPA転写クイズトップに戻る
          </button>
          <Link href="/regions" className="link-btn link-btn-disabled" aria-disabled="true" tabIndex={-1} onClick={(event) => event.preventDefault()}>
            音響領域の分析へ →
          </Link>
        </div>

        {results.length > 0 && (
          <div className="stats-section">
            <h2>内訳</h2>
            {results.map((r, i) => (
              <div
                key={i}
                className={`stats-row ${
                  r.grade === "perfect"
                    ? "good"
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
                <span className="stats-level">{GRADE_LABEL[r.grade]}</span>
                <div className="stats-detail transcription-result-detail">
                  <span>{r.meaning}・{r.summary}</span>
                  <span><strong>正解：</strong>/{r.correctPhonemes.join(" ")}/</span>
                  <span><strong>回答：</strong>/{formatAnswerSlots(r.answerSlots)}/</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Quiz
  const answeredPhonemeCount = heard.filter((p) => p !== null).length;
  return (
    <div className="container transcribe-quiz-page">
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

      <div className="card transcribe-quiz-card">
        <div className="question-label">問題 {index + 1}（IPA転写）</div>

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

        {/* 入力中の列 */}
        <div className="heard-line" aria-label="回答音素スロット">
          {heard.length === 0 ? (
            <span className="heard-empty">（ここに入力した音素が並びます）</span>
          ) : (
            heard.map((h, i) => (
              <div
                key={i}
                className={`heard-slot ${h === null ? "empty" : ""} ${
                  activeSlot === i ? "active" : ""
                }`}
              >
                <button
                  type="button"
                  className="heard-slot-value"
                  disabled={judgement !== null}
                  onClick={() => setActiveSlot(i)}
                  aria-label={`${i + 1}番目のスロットを選択`}
                >
                  {h === null ? "空欄" : isWildcard(h) ? `${h}?` : h}
                </button>
                {h !== null && (
                  <button
                    type="button"
                    className="heard-slot-delete"
                    disabled={judgement !== null}
                    onClick={() => deleteSlot(i)}
                    aria-label={`${i + 1}番目の音素を削除して空欄にする`}
                  >
                    ×
                  </button>
                )}
              </div>
            ))
          )}
          {activeSlot !== null && (
            <button
              type="button"
              className="heard-append-btn"
              onClick={() => setActiveSlot(null)}
            >
              ＋ 末尾に追加へ戻る
            </button>
          )}
        </div>
        {!judgement && heard.length > 0 && (
          <p className="heard-edit-help">
            スロットを選んで音素ボタンを押すと置換できます。×で消しても空欄は残ります。
          </p>
        )}

        {!judgement && renderKeyboard()}

        {!judgement && (
          <button
            className="btn-reset transcribe-judge"
            onClick={handleJudge}
            disabled={answeredPhonemeCount === 0}
          >
            判定する（{answeredPhonemeCount}音素）
          </button>
        )}

        {judgement && (
          <>
            <div
              className={`feedback ${
                judgement.grade === "perfect" ? "correct" : "incorrect"
              }`}
              role="alert"
              aria-live="polite"
            >
              {judgement.summary}
            </div>
            {renderSlots(judgement)}
            <p style={{ fontSize: "0.9rem", color: "#424242" }}>
              正解: {question.w}（{question.e}）＝ /
              {getWordMaster()
                .get(question.w)
                ?.phonemes.map((p) => p.phoneme)
                .join(" ")}
              /
            </p>
            <p style={{ fontSize: "0.9rem", color: "#424242" }}>
              回答: /{formatAnswerSlots(heard)}/
            </p>
            <button
              type="button"
              className={`known-btn ${known ? "active" : ""}`}
              onClick={() => setKnown(known ? null : true)}
            >
              ✔ この単語は知っていた
            </button>
            <div className="btn-row">
              <button className="btn-next" onClick={handleNext}>
                {index + 1 < questions.length ? "次の問題 →" : "結果を見る"}
              </button>
            </div>
          </>
        )}
      </div>

      <button
        className="btn-reset transcribe-quit"
        onClick={handleQuit}
        style={{ background: "transparent", color: "#757575", border: "1px solid #e0e0e0" }}
      >
        ここで終了する
      </button>
    </div>
  );
}
