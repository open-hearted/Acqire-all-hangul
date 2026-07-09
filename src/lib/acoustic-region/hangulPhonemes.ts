// ハングル → 位置つきIPA音素列の変換（標準発音ベース）。
// 設計: docs/acoustic-region-module.md（語彙マスタ words.phonemes）
//
// scripts/count-phonemes.js の音素数ロジックを音素列の生成に拡張したもの。
// 音素数に影響する規則（激音化・ㅎ脱落・連音・ㄴ挿入・ㅖ/ㅢの単母音化）は
// count-phonemes.js と同一の判定で、生成される列の長さは words.json の
// 音素数 p と全語彙で一致する（一致検証はビルド時ではなくテストで行う）。
// 加えて、音素数は変えないが音の種類が変わる規則も反映する:
// 鼻音化（습니다→슴니다）、流音化（연락→열락）、濃音化（학교→학꾜）、
// 口蓋音化（같이→가치）、終声の中和（옷→옫 = t̚）。

import type { PositionedPhoneme } from "./types";

// ─── 字母テーブル ────────────────────────────────────────────────────────

// 初声19種 ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ（"" = 無音のㅇ）
const ONSET_IPA = [
  "k", "k͈", "n", "t", "t͈", "ɾ", "m", "p", "p͈", "s", "s͈", "",
  "tɕ", "tɕ͈", "tɕʰ", "kʰ", "tʰ", "pʰ", "h",
];
const O_SILENT = 11;
const O_NIEUN = 2;
const O_RIEUL = 5;
const O_MIEUM = 6;
const O_HIEUT = 18;
// ㅎパッチムと融合する初声とその融合形（좋다[조타], 많소[만쏘]）
const H_FUSION: Record<number, string> = { 0: "kʰ", 3: "tʰ", 9: "s͈", 12: "tɕʰ" };
// 阻害音の平音初声 → 濃音（先行する閉鎖音終声で濃音化: 학교[학꾜]）
const TENSE: Record<number, string> = { 0: "k͈", 3: "t͈", 7: "p͈", 9: "s͈", 12: "tɕ͈" };

// 中声21種 ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ
const VOWEL_IPA: string[][] = [
  ["a"], ["ɛ"], ["j", "a"], ["j", "ɛ"], ["ʌ"], ["e"], ["j", "ʌ"], ["j", "e"],
  ["o"], ["w", "a"], ["w", "ɛ"], ["w", "e"], ["j", "o"], ["u"], ["w", "ʌ"],
  ["w", "e"], ["w", "i"], ["j", "u"], ["ɯ"], ["ɰ", "i"], ["i"],
];
const V_YE = 7; // ㅖ
const V_UI = 19; // ㅢ
const V_I = 20; // ㅣ
// ㄴ挿入の対象となる中声（이야여요유）
const N_INSERT_VOWELS = new Set([V_I, 2, 6, 12, 17]);

// 終声28種 → 字母の配列（二重パッチムは分解）
const CODA_JAMOS: string[][] = [
  [], ["ㄱ"], ["ㄲ"], ["ㄱ", "ㅅ"], ["ㄴ"], ["ㄴ", "ㅈ"], ["ㄴ", "ㅎ"], ["ㄷ"],
  ["ㄹ"], ["ㄹ", "ㄱ"], ["ㄹ", "ㅁ"], ["ㄹ", "ㅂ"], ["ㄹ", "ㅅ"], ["ㄹ", "ㅌ"],
  ["ㄹ", "ㅍ"], ["ㄹ", "ㅎ"], ["ㅁ"], ["ㅂ"], ["ㅂ", "ㅅ"], ["ㅅ"], ["ㅆ"],
  ["ㅇ"], ["ㅈ"], ["ㅊ"], ["ㅋ"], ["ㅌ"], ["ㅍ"], ["ㅎ"],
];
const OBSTRUENT_CODAS = new Set(["ㄱ", "ㄲ", "ㅋ", "ㄷ", "ㅌ", "ㅂ", "ㅍ", "ㅅ", "ㅆ", "ㅈ", "ㅊ"]);

// 終声の中和（七終声）
const CODA_NEUTRAL: Record<string, string> = {
  "ㄱ": "k̚", "ㄲ": "k̚", "ㅋ": "k̚",
  "ㄷ": "t̚", "ㅌ": "t̚", "ㅅ": "t̚", "ㅆ": "t̚", "ㅈ": "t̚", "ㅊ": "t̚", "ㅎ": "t̚",
  "ㄴ": "n", "ㄹ": "l", "ㅁ": "m", "ㅂ": "p̚", "ㅍ": "p̚", "ㅇ": "ŋ",
};
// 中和形 + ㅎ → 激音（축하[추카], 못하다[모타다]）
const ASPIRATE: Record<string, string> = { "k̚": "kʰ", "t̚": "tʰ", "p̚": "pʰ" };
// 中和形 + ㄴ/ㅁ → 鼻音化（습니다[슴니다]）
const NASALIZE: Record<string, string> = { "k̚": "ŋ", "t̚": "n", "p̚": "m" };
// 連音時の字母 → 初声IPA（없이[업씨]の ㅅ など。ㅇは連音しない）
const LIAISON_IPA: Record<string, string> = {
  "ㄱ": "k", "ㄲ": "k͈", "ㄴ": "n", "ㄷ": "t", "ㄹ": "ɾ", "ㅁ": "m", "ㅂ": "p",
  "ㅅ": "s", "ㅆ": "s͈", "ㅈ": "tɕ", "ㅊ": "tɕʰ", "ㅋ": "kʰ", "ㅌ": "tʰ", "ㅍ": "pʰ",
};
// 連音した平音の濃音形（없이[업씨]: 閉鎖音終声が残る場合）
const LIAISON_TENSE: Record<string, string> = {
  "ㄱ": "k͈", "ㄷ": "t͈", "ㅂ": "p͈", "ㅅ": "s͈", "ㅈ": "tɕ͈",
};

// ㄴ挿入が起きる合成語（count-phonemes.js と同じリストに限る）
const N_INSERTION = new Set(["서울역", "지하철역", "한국요리", "일본요리", "웬일"]);

// ─── 分解 ────────────────────────────────────────────────────────────────

interface Syllable {
  onset: number;
  vowel: number;
  coda: string[];
}

function decompose(word: string): Syllable[][] {
  const groups: Syllable[][] = [];
  let current: Syllable[] = [];
  for (const ch of word) {
    const code = ch.codePointAt(0)! - 0xac00;
    if (code >= 0 && code <= 0xd7a3 - 0xac00) {
      current.push({
        onset: Math.floor(code / 588),
        vowel: Math.floor((code % 588) / 28),
        coda: CODA_JAMOS[code % 28],
      });
    } else if (current.length) {
      groups.push(current);
      current = [];
    }
  }
  if (current.length) groups.push(current);
  return groups;
}

// ─── 変換 ────────────────────────────────────────────────────────────────

/**
 * 単語を標準発音ベースの位置つきIPA音素列に変換する。
 * 位置は発音形の音節構造に基づく（連音した終声は次音節の初声=initial になる）。
 */
export function toPhonemes(word: string): PositionedPhoneme[] {
  const groups = decompose(word);

  // ㄴ挿入（対象の合成語のみ）: 終声つき音節 + 이야여요유 の無音初声 → ㄴ
  if (N_INSERTION.has(word)) {
    outer: for (const syls of groups) {
      for (let i = 1; i < syls.length; i++) {
        if (
          syls[i].onset === O_SILENT &&
          N_INSERT_VOWELS.has(syls[i].vowel) &&
          syls[i - 1].coda.length > 0
        ) {
          syls[i] = { ...syls[i], onset: O_NIEUN };
          break outer;
        }
      }
    }
  }

  const out: PositionedPhoneme[] = [];
  for (const syls of groups) {
    // 前の音節の終声処理が決めた「次の初声の発音」（undefined = 上書きなし）
    let onsetOverride: string | undefined;

    syls.forEach((syl, i) => {
      const next = i + 1 < syls.length ? syls[i + 1] : null;

      // 初声
      const onsetIpa = onsetOverride !== undefined ? onsetOverride : ONSET_IPA[syl.onset];
      onsetOverride = undefined;
      if (onsetIpa) out.push({ position: "initial", phoneme: onsetIpa });

      // 中声（ㅖ/ㅢの単母音化は count-phonemes.js と同じ判定。元の初声で判定する）
      let vowelSeq = VOWEL_IPA[syl.vowel];
      if (syl.vowel === V_YE && syl.onset !== O_SILENT && syl.onset !== O_RIEUL) {
        vowelSeq = ["e"]; // 시계[시게]
      }
      if (syl.vowel === V_UI && (syl.onset !== O_SILENT || i > 0)) {
        vowelSeq = ["i"]; // 흰색[힌색], 회의[회이]
      }
      for (const v of vowelSeq) out.push({ position: "medial", phoneme: v });

      // 終声
      if (syl.coda.length === 0) return;
      const cl = [...syl.coda];
      const last = cl[cl.length - 1];

      if (next && next.onset === O_SILENT && last !== "ㅇ") {
        // 母音が続く: ㅎは脱落、残りの最後の子音は連音して次の初声になる
        if (last === "ㅎ") cl.pop();
        const moved = cl.pop();
        if (moved) {
          let ipa = LIAISON_IPA[moved];
          // 口蓋音化: ㄷ/ㅌ + 이 → 지/치（같이[가치]）
          if (next.vowel === V_I && moved === "ㄷ") ipa = "tɕ";
          if (next.vowel === V_I && moved === "ㅌ") ipa = "tɕʰ";
          // 残る終声が閉鎖音なら連音した平音は濃音化（없이[업씨]）
          const remaining = cl[cl.length - 1];
          if (remaining && OBSTRUENT_CODAS.has(remaining) && LIAISON_TENSE[moved]) {
            ipa = LIAISON_TENSE[moved];
          }
          onsetOverride = ipa;
        }
        if (cl.length > 0) {
          out.push({ position: "final", phoneme: CODA_NEUTRAL[cl[cl.length - 1]] });
        }
        return;
      }

      if (next && next.onset === O_HIEUT && OBSTRUENT_CODAS.has(last)) {
        // 阻害音終声 + ㅎ: 融合して次の初声の激音になる（축하[추카]）
        onsetOverride = ASPIRATE[CODA_NEUTRAL[last]];
        cl.pop();
        if (cl.length > 0) {
          out.push({ position: "final", phoneme: CODA_NEUTRAL[cl[cl.length - 1]] });
        }
        return;
      }

      if (next && last === "ㅎ" && H_FUSION[next.onset] !== undefined) {
        // ㅎ終声 + ㄱㄷㅅㅈ: 融合（좋다[조타], 많다[만타], 싫습니다[실씀니다]）
        onsetOverride = H_FUSION[next.onset];
        cl.pop();
        if (cl.length > 0) {
          out.push({ position: "final", phoneme: CODA_NEUTRAL[cl[cl.length - 1]] });
        }
        return;
      }

      // 子音の前・語末: 二重パッチムは1子音に簡素化して中和
      const reduced = reduceCoda(cl);
      let neutral = CODA_NEUTRAL[reduced];
      if (next) {
        if ((next.onset === O_NIEUN || next.onset === O_MIEUM) && NASALIZE[neutral]) {
          // 鼻音化: 閉鎖音 + ㄴ/ㅁ（습니다[슴니다]）
          neutral = NASALIZE[neutral];
        } else if (next.onset === O_NIEUN && neutral === "l") {
          // 流音化: ㄹ終声 + ㄴ初声（설날[설랄], 서울역[서울력]）
          onsetOverride = "l";
        } else if (next.onset === O_RIEUL) {
          // ㄹが続く場合の同化
          if (neutral === "n" || neutral === "l") {
            // 流音化: 연락[열락], 설날[설랄]
            neutral = "l";
            onsetOverride = "l";
          } else {
            // ㄹの鼻音化: 음료[음뇨], 독립[동닙]
            if (NASALIZE[neutral]) neutral = NASALIZE[neutral];
            onsetOverride = "n";
          }
        } else if (NASALIZE[neutral] && TENSE[next.onset] !== undefined) {
          // 濃音化: 閉鎖音終声 + 平音（학교[학꾜]）
          onsetOverride = TENSE[next.onset];
        }
      }
      out.push({ position: "final", phoneme: neutral });
    });
  }
  return out;
}

// 二重パッチムの簡素化（子音の前・語末）
const DOUBLE_REDUCE: Record<string, string> = {
  "ㄱㅅ": "ㄱ", "ㄴㅈ": "ㄴ", "ㄴㅎ": "ㄴ", "ㄹㄱ": "ㄱ", "ㄹㅁ": "ㅁ",
  "ㄹㅂ": "ㄹ", "ㄹㅅ": "ㄹ", "ㄹㅌ": "ㄹ", "ㄹㅍ": "ㅍ", "ㄹㅎ": "ㄹ", "ㅂㅅ": "ㅂ",
};

function reduceCoda(cl: string[]): string {
  if (cl.length === 1) return cl[0];
  return DOUBLE_REDUCE[cl.join("")] ?? cl[0];
}

// ─── 派生情報 ────────────────────────────────────────────────────────────

const VOWEL_PHONEMES = new Set([
  "a", "ɛ", "e", "ʌ", "o", "u", "ɯ", "i", "j", "w", "ɰ",
]);

/** 音素が母音・わたり音か（聞こえ方メモの 子/母 パターンとの対応づけ用） */
export function isVowelPhoneme(phoneme: string): boolean {
  return VOWEL_PHONEMES.has(phoneme);
}

/** 音素列 → 子母パターン文字列（例: 셋 → "子母子"） */
export function toPattern(phonemes: PositionedPhoneme[]): string {
  return phonemes.map((p) => (isVowelPhoneme(p.phoneme) ? "母" : "子")).join("");
}

/**
 * この語が試す音響領域タグの一覧（重複なし）。
 * タグは `位置:音素`（例: "final:t̚", "medial:j"）。
 * 誤答領域から同じ領域を含む別語彙を選ぶときのキーになる。
 */
export function regionTags(phonemes: PositionedPhoneme[]): string[] {
  const tags = new Set<string>();
  for (const p of phonemes) tags.add(`${p.position}:${p.phoneme}`);
  return [...tags];
}
