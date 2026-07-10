// IPA転写クイズの判定（決定的アラインメント）。
// 設計: docs/acoustic-region-module.md（IPA転写クイズ）
//
// 回答（IPA記号 + ワイルドカード 母/子 の列）と正解の音素列を、置換込みの
// 編集距離アラインメント（Needleman-Wunsch。タイブレークは対角優先で決定的）
// で対応づける。判定器は測定器なので、外部API等は使わずローカルで決定的に動く。
//
// スロットの状態:
//   match        IPAまで一致（検出+同定）
//   category     ワイルドカードで子母の種類だけ一致（検出したが同定せず）
//   substitution 別のIPAを選んだ（置換 = L1カテゴリへの吸収。混同ペアの原資）
//   deletion     正解にあるのに聞こえていない（脱落）
//   insertion    聞こえたが正解にない（過剰検出）
//
// 被覆率上の扱い: category は検出成功（誤答領域にしない）、
// substitution は失敗（写像が間違っている = 未獲得領域）。

import type {
  ErrorRegion,
  NewErrorLog,
  PositionedPhoneme,
  RegionPosition,
  TranscriptionNote,
  TranscriptionLogGrade,
} from "./types";
import { LOCAL_USER_ID } from "./types";
import { isVowelPhoneme } from "./hangulPhonemes";
import { getWordMaster } from "./wordMaster";

// ─── ワイルドカード ──────────────────────────────────────────────────────

/** どのIPAか分からないが母音が聞こえている */
export const WILDCARD_VOWEL = "母";
/** どのIPAか分からないが子音が聞こえている */
export const WILDCARD_CONSONANT = "子";

export function isWildcard(h: string): boolean {
  return h === WILDCARD_VOWEL || h === WILDCARD_CONSONANT;
}

function heardIsVowel(h: string): boolean {
  return h === WILDCARD_VOWEL || (h !== WILDCARD_CONSONANT && isVowelPhoneme(h));
}

// ─── 回答キーボードの音素目録（IPA全表ではなく韓国語の音素目録に絞る） ────────

/** 母音・わたり音 */
export const KEYBOARD_VOWELS = [
  "a", "ɛ", "e", "ʌ", "o", "u", "ɯ", "i", "j", "w", "ɰ",
];

/** 子音（平音・激音・濃音・鼻音/流音・終声専用） */
export const KEYBOARD_CONSONANTS = [
  "k", "t", "p", "s", "tɕ", "h", "n", "m", "ɾ",
  "kʰ", "tʰ", "pʰ", "tɕʰ",
  "k͈", "t͈", "p͈", "s͈", "tɕ͈",
  "l", "ŋ", "k̚", "t̚", "p̚",
];

// ─── アラインメント ──────────────────────────────────────────────────────

export type SlotKind =
  | "match"
  | "category"
  | "substitution"
  | "deletion"
  | "insertion";

export interface AlignedSlot {
  kind: SlotKind;
  /** 正解側の音素（insertion のとき undefined） */
  actual?: PositionedPhoneme;
  /** 回答側の記号（deletion のとき undefined） */
  heard?: string;
  /** 回答時に選択した候補。OR入力では複数の候補をそのまま保持する。 */
  heardCandidates?: string[];
  /** 正解を含む複数候補の回答（完全一致ではない） */
  isAlternativeMatch?: boolean;
}

/** 画面上の回答スロット。null は削除後も残す空欄。 */
export type AnswerSlot = { candidates: string[] } | null;
type AnswerSlotInput = string | AnswerSlot;

const COST_MATCH = 0;
const COST_CATEGORY = 0.25; // ワイルドカードで種類が合う
const COST_SUB_SAME = 0.6; // 同じ種類内の置換（例: ʌ→o）
const COST_SUB_CROSS = 1.4; // 種類をまたぐ置換
const COST_GAP = 1.0; // 脱落/挿入

function slotCost(actual: PositionedPhoneme, heard: string): number {
  if (heard === actual.phoneme) return COST_MATCH;
  const sameCategory = heardIsVowel(heard) === isVowelPhoneme(actual.phoneme);
  if (isWildcard(heard)) return sameCategory ? COST_CATEGORY : COST_SUB_CROSS;
  return sameCategory ? COST_SUB_SAME : COST_SUB_CROSS;
}

function slotKind(actual: PositionedPhoneme, heard: string): SlotKind {
  if (heard === actual.phoneme) return "match";
  if (
    isWildcard(heard) &&
    heardIsVowel(heard) === isVowelPhoneme(actual.phoneme)
  ) {
    return "category";
  }
  return "substitution";
}

function normalizeAnswerSlots(heard: AnswerSlotInput[]): string[][] {
  return heard.flatMap((slot) => {
    if (slot === null) return [];
    if (typeof slot === "string") return [[slot]];
    return slot.candidates.length > 0 ? [[...slot.candidates]] : [];
  });
}

function candidatesCost(actual: PositionedPhoneme, candidates: string[]): number {
  return Math.min(...candidates.map((heard) => slotCost(actual, heard)));
}

function bestCandidate(actual: PositionedPhoneme, candidates: string[]): string {
  return candidates.reduce((best, candidate) =>
    slotCost(actual, candidate) < slotCost(actual, best) ? candidate : best
  );
}

function makeAlignedSlot(
  actual: PositionedPhoneme,
  candidates: string[]
): AlignedSlot {
  const exact = candidates.includes(actual.phoneme);
  const best = bestCandidate(actual, candidates);
  return {
    kind: slotKind(actual, best),
    actual,
    heard: candidates.length === 1 ? candidates[0] : undefined,
    heardCandidates: candidates,
    isAlternativeMatch: candidates.length > 1 && exact,
  };
}

/**
 * 正解の音素列と回答列を対応づける。
 * DPのタイブレークは 対角（一致/置換）> 上（脱落）> 左（挿入）で決定的。
 */
export function alignTranscription(
  actual: PositionedPhoneme[],
  heard: AnswerSlotInput[]
): AlignedSlot[] {
  const heardSlots = normalizeAnswerSlots(heard);
  const n = actual.length;
  const m = heardSlots.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    Array(m + 1).fill(0)
  );
  for (let i = 1; i <= n; i++) dp[i][0] = i * COST_GAP;
  for (let j = 1; j <= m; j++) dp[0][j] = j * COST_GAP;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j - 1] + candidatesCost(actual[i - 1], heardSlots[j - 1]),
        dp[i - 1][j] + COST_GAP,
        dp[i][j - 1] + COST_GAP
      );
    }
  }
  // 逆追跡（対角優先）
  const slots: AlignedSlot[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (
      i > 0 &&
      j > 0 &&
      dp[i][j] ===
        dp[i - 1][j - 1] + candidatesCost(actual[i - 1], heardSlots[j - 1])
    ) {
      slots.push(makeAlignedSlot(actual[i - 1], heardSlots[j - 1]));
      i--;
      j--;
    } else if (i > 0 && dp[i][j] === dp[i - 1][j] + COST_GAP) {
      slots.push({ kind: "deletion", actual: actual[i - 1] });
      i--;
    } else {
      const candidates = heardSlots[j - 1];
      slots.push({
        kind: "insertion",
        heard: candidates.length === 1 ? candidates[0] : undefined,
        heardCandidates: candidates,
      });
      j--;
    }
  }
  return slots.reverse();
}

// ─── 判定 ────────────────────────────────────────────────────────────────

/**
 * 説明調の判定グレード:
 *   perfect  IPAも全部合っている
 *   pattern  子音・母音の配置は合っている（ワイルドカード/置換を含む）
 *   mismatch 配置が違う（脱落/挿入がある）
 */
export type TranscriptionGrade = "perfect" | "pattern" | "mismatch";

export interface TranscriptionJudgement {
  slots: AlignedSlot[];
  grade: TranscriptionGrade;
  errorRegions: ErrorRegion[];
  /** 正解を含む複数候補の数。完全一致には数えない。 */
  alternativeMatchCount: number;
  /** 説明調のフィードバック文 */
  summary: string;
}

function positionLabel(p: RegionPosition): string {
  return p === "initial" ? "初声" : p === "medial" ? "中声" : "終声";
}

/** 挿入スロットの位置は直前の正解音素の位置を引き継ぐ（先頭なら initial） */
function insertionPosition(slots: AlignedSlot[], index: number): RegionPosition {
  for (let i = index - 1; i >= 0; i--) {
    const a = slots[i].actual;
    if (a) return a.position;
  }
  return "initial";
}

export function judgeTranscription(
  actual: PositionedPhoneme[],
  heard: AnswerSlotInput[]
): TranscriptionJudgement {
  const slots = alignTranscription(actual, heard);
  const errorRegions: ErrorRegion[] = [];
  const subs: string[] = [];
  const dels: string[] = [];
  const inss: string[] = [];
  let categoryCount = 0;
  let alternativeMatchCount = 0;

  slots.forEach((slot, idx) => {
    if (slot.kind === "category") categoryCount++;
    if (slot.isAlternativeMatch) alternativeMatchCount++;
    if (slot.kind === "substitution" && slot.actual && slot.heardCandidates) {
      errorRegions.push({
        position: slot.actual.position,
        type: "substitution",
        phoneme: slot.actual.phoneme,
        ...(slot.heard ? { heard: slot.heard } : {}),
        ...(slot.heardCandidates.length > 1
          ? { heardCandidates: slot.heardCandidates }
          : {}),
      });
      const heardLabel = slot.heardCandidates.length > 1
        ? `候補 /${slot.heardCandidates.join(" | ")}/`
        : isWildcard(slot.heardCandidates[0])
          ? `「${slot.heardCandidates[0]}?」`
          : `/${slot.heardCandidates[0]}/`;
      subs.push(
        `${positionLabel(slot.actual.position)} /${slot.actual.phoneme}/ を${heardLabel}と知覚`
      );
    }
    if (slot.kind === "deletion" && slot.actual) {
      const ph = slot.actual;
      // 隣に同じ音素が残っていれば統合（例: 설렁탕の l+l → l:）
      const isMerger = slots.some(
        (s, k) =>
          Math.abs(k - idx) === 1 &&
          s.kind !== "deletion" &&
          s.actual?.phoneme === ph.phoneme
      );
      errorRegions.push(
        isMerger
          ? { position: ph.position, type: "merger", phoneme: `${ph.phoneme}:` }
          : { position: ph.position, type: "deletion", phoneme: ph.phoneme }
      );
      dels.push(`${positionLabel(ph.position)} /${ph.phoneme}/ が欠落`);
    }
    if (slot.kind === "insertion" && slot.heardCandidates) {
      const position = insertionPosition(slots, idx);
      errorRegions.push({
        position,
        type: "insertion",
        phoneme:
          slot.heardCandidates.length === 1
            ? isWildcard(slot.heardCandidates[0])
              ? "?"
              : slot.heardCandidates[0]
            : "?",
        ...(slot.heardCandidates.length > 1
          ? { heardCandidates: slot.heardCandidates }
          : {}),
      });
      const heardLabel = slot.heardCandidates.length > 1
        ? `候補 /${slot.heardCandidates.join(" | ")}/ が余分`
        : isWildcard(slot.heardCandidates[0])
          ? `「${slot.heardCandidates[0]}?」が余分`
          : `/${slot.heardCandidates[0]}/ が余分`;
      inss.push(
        heardLabel
      );
    }
  });

  const hasGap = dels.length > 0 || inss.length > 0;
  const grade: TranscriptionGrade = hasGap
    ? "mismatch"
    : subs.length === 0 && categoryCount === 0 && alternativeMatchCount === 0
      ? "perfect"
      : "pattern";

  const parts: string[] = [];
  if (grade === "perfect") {
    parts.push("完全一致！IPAも全部合っています");
  } else if (grade === "pattern") {
    parts.push("子音・母音の配置は合っています");
    if (alternativeMatchCount > 0) {
      parts.push(`${alternativeMatchCount}音素は候補内一致`);
    }
    if (categoryCount > 0) parts.push(`${categoryCount}音素は種類まで特定せず`);
    if (subs.length > 0) parts.push(subs.join("、"));
  } else {
    parts.push("配置が違います");
    if (dels.length > 0) parts.push(dels.join("、"));
    if (inss.length > 0) parts.push(inss.join("、"));
    if (subs.length > 0) parts.push(subs.join("、"));
  }

  return {
    slots,
    grade,
    errorRegions,
    alternativeMatchCount,
    summary: parts.join("。"),
  };
}

// ─── error_log レコードの組み立て ─────────────────────────────────────────

export interface TranscriptionAnswerInput {
  word: string;
  heard: AnswerSlotInput[];
  wordKnown: boolean | null;
  transcriptionNotes?: TranscriptionNote[] | null;
  sessionId?: string;
  sessionStartedAt?: string;
  wordPlayCount?: number;
  ipaReferenceCounts?: Record<string, number>;
  userId?: string;
}

/**
 * IPA転写クイズの1回答を error_log レコード入力に変換する。
 * 語彙マスタに無い語は null。
 */
export function buildTranscriptionErrorLog(
  input: TranscriptionAnswerInput
): { log: NewErrorLog; judgement: TranscriptionJudgement } | null {
  const entry = getWordMaster().get(input.word);
  if (!entry) return null;
  const heardCandidateSlots = normalizeAnswerSlots(input.heard);
  const judgement = judgeTranscription(entry.phonemes, input.heard);
  return {
    judgement,
    log: {
      userId: input.userId ?? LOCAL_USER_ID,
      word: input.word,
      meaning: entry.meaningJa,
      correctPhonemeCount: entry.phonemeCount,
      answeredCount: heardCandidateSlots.length,
      heardPattern: heardCandidateSlots
        .map((candidates) =>
          candidates.some((h) => heardIsVowel(h)) ? "母" : "子"
        )
        .join(""),
      errorRegions: judgement.errorRegions,
      // 旧フィールドには互換用の先頭候補だけを残す。候補の完全な記録は
      // heardCandidateSlots を正として利用する。
      heardPhonemes: heardCandidateSlots.map((candidates) => candidates[0]),
      heardCandidateSlots,
      transcriptionNotes: input.transcriptionNotes ?? null,
      sessionId: input.sessionId,
      sessionStartedAt: input.sessionStartedAt,
      correctPhonemes: entry.phonemes.map((p) => p.phoneme),
      transcriptionGrade: judgement.grade as TranscriptionLogGrade,
      wordPlayCount: input.wordPlayCount,
      ipaReferenceCounts: input.ipaReferenceCounts,
      wordKnown: input.wordKnown,
      listeningCondition: null,
      conditionNote: null,
    },
  };
}
