// TOPIK I 語彙の音素数を「現代韓国語の標準発音」（連音・同化を考慮）で計算し、
// 音素数順に並べたCSVを生成する
//
// 数え方（IPAベース・発音形）:
//   子音 = 1（濃音ㄲㄸㅃㅆㅉも1音素。初声のㅇは無音=0）
//   母音 = 1（単母音 ㅏㅐㅓㅔㅗㅜㅡㅣ）または 2（わたり音つき ㅑㅒㅕㅖㅘㅙㅚㅛㅝㅞㅟㅠㅢ）
//
// 音素数に影響する発音規則:
//   1. 激音化: ㄱㄷㅂㅈㅅ(パッチム)+ㅎ / ㅎ(パッチム)+ㄱㄷㅈㅅ → 融合して1子音 (-1)
//      例: 축하[추카], 못하다[모타다], 좋다[조타], 그렇게[그러케]
//   2. ㅎ脱落: パッチムのㅎ(ㄶㅀ含む)+母音 → ㅎ消失 (-1)  例: 좋아하다[조아하다]
//   3. 連音: 二重パッチム+母音 → 両方の子音を発音 (+1)  例: 없이[업씨]
//      （子音の前・語末では二重パッチムは1子音に簡素化）
//   4. ㄴ挿入(合成語): 서울역[서울력], 지하철역, 한국요리[한궁뇨리], 일본요리, 웬일[웬닐] (+1)
//   5. ㅖの単母音化: 계몌폐혜の「ㅖ」→[ㅔ] (-1)  例: 시계[시게], 세계[세게]（례は[례]のまま）
//   6. ㅢの単母音化: 子音初声+ㅢ→[ㅣ] 例: 흰색[힌색] / 語中の의→[이] 例: 거의[거이], 회의[회이] (-1)
//   ※ 鼻音化・流音化・濃音化・口蓋音化は音の種類が変わるだけで音素数は不変

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const PARTS = ["topik1-part1.tsv", "topik1-part2.tsv", "topik1-part3.tsv"];
const OUT = path.join(DATA_DIR, "topik1-by-phonemes.csv");

// 中声21種: ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ
const TWO_PHONEME_MEDIALS = new Set([2, 3, 6, 7, 9, 10, 11, 12, 14, 15, 16, 17, 19]);
const V_YE = 7; // ㅖ
const V_UI = 19; // ㅢ
const O_SILENT = 11; // 初声ㅇ
const O_RIEUL = 5; // 初声ㄹ
const O_HIEUT = 18; // 初声ㅎ
const MERGABLE_ONSETS = new Set([0, 3, 9, 12]); // ㅎパッチムと融合する初声 ㄱㄷㅅㅈ

// 終声28種 → 字母の配列（二重パッチムは分解）
const CODA = [
  [], ["ㄱ"], ["ㄲ"], ["ㄱ", "ㅅ"], ["ㄴ"], ["ㄴ", "ㅈ"], ["ㄴ", "ㅎ"], ["ㄷ"],
  ["ㄹ"], ["ㄹ", "ㄱ"], ["ㄹ", "ㅁ"], ["ㄹ", "ㅂ"], ["ㄹ", "ㅅ"], ["ㄹ", "ㅌ"],
  ["ㄹ", "ㅍ"], ["ㄹ", "ㅎ"], ["ㅁ"], ["ㅂ"], ["ㅂ", "ㅅ"], ["ㅅ"], ["ㅆ"],
  ["ㅇ"], ["ㅈ"], ["ㅊ"], ["ㅋ"], ["ㅌ"], ["ㅍ"], ["ㅎ"],
];
const OBSTRUENT_CODAS = new Set(["ㄱ", "ㄲ", "ㅋ", "ㄷ", "ㅌ", "ㅂ", "ㅍ", "ㅅ", "ㅆ", "ㅈ", "ㅊ"]);

// ㄴ挿入が起きる合成語（このリストに限る）
const N_INSERTION = new Set(["서울역", "지하철역", "한국요리", "일본요리", "웬일"]);

function decompose(word) {
  // 連続したハングル音節のかたまりごとに分ける（スペース等で切る）
  const groups = [];
  let current = [];
  for (const ch of word) {
    const code = ch.codePointAt(0) - 0xac00;
    if (code >= 0 && code <= 0xd7a3 - 0xac00) {
      current.push({
        onset: Math.floor(code / 588),
        vowel: Math.floor((code % 588) / 28),
        coda: CODA[code % 28],
      });
    } else if (current.length) {
      groups.push(current);
      current = [];
    }
  }
  if (current.length) groups.push(current);
  return groups;
}

function countPhonemes(word) {
  let count = 0;
  for (const syls of decompose(word)) {
    syls.forEach((syl, i) => {
      const next = i + 1 < syls.length ? syls[i + 1] : null;

      // 初声（ㅎがパッチムの阻害音と融合する場合も1子音として数えるのでそのまま+1）
      if (syl.onset !== O_SILENT) count += 1;

      // 中声
      let v = TWO_PHONEME_MEDIALS.has(syl.vowel) ? 2 : 1;
      if (syl.vowel === V_YE && syl.onset !== O_SILENT && syl.onset !== O_RIEUL) v = 1; // 계→[게]
      if (syl.vowel === V_UI && (syl.onset !== O_SILENT || i > 0)) v = 1; // 흰→[힌], 語中의→[이]
      count += v;

      // 終声
      if (syl.coda.length === 0) return;
      const cl = [...syl.coda];
      if (next && next.onset === O_SILENT) {
        // 母音が続く: ㅎは脱落、残りは連音で全て発音
        if (cl[cl.length - 1] === "ㅎ") cl.pop();
        count += cl.length;
      } else if (next && next.onset === O_HIEUT) {
        // ㅎが続く: 阻害音は融合(激音化)して初声側の1音素になる
        if (OBSTRUENT_CODAS.has(cl[cl.length - 1])) cl.pop();
        count += Math.min(cl.length, 1);
      } else if (next && cl[cl.length - 1] === "ㅎ" && MERGABLE_ONSETS.has(next.onset)) {
        // ㅎパッチム+ㄱㄷㅅㅈ: 融合(激音化)  例: 좋다[조타], 많다[만타]
        cl.pop();
        count += cl.length;
      } else {
        // 子音の前・語末: 二重パッチムは1子音に簡素化
        count += 1;
      }
    });
  }
  if (N_INSERTION.has(word)) count += 1; // ㄴ挿入
  return count;
}

const rows = [];
for (const part of PARTS) {
  const text = fs.readFileSync(path.join(DATA_DIR, part), "utf8");
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const [no, word, english] = line.split("\t");
    rows.push({ no: Number(no), word, english: english ?? "", phonemes: countPhonemes(word) });
  }
}

rows.sort((a, b) => a.phonemes - b.phonemes || a.no - b.no);

function csvField(s) {
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// アプリ用JSON（音素数クイズの出題データ）
const wordsJson = rows
  .slice()
  .sort((a, b) => a.no - b.no)
  .map((r) => ({ w: r.word, e: r.english, p: r.phonemes }));
fs.writeFileSync(
  path.join(__dirname, "..", "src", "data", "words.json"),
  JSON.stringify(wordsJson),
  "utf8"
);

const header = "phonemes,word,english,no";
const body = rows
  .map((r) => [r.phonemes, csvField(r.word), csvField(r.english), r.no].join(","))
  .join("\n");
fs.writeFileSync(OUT, "﻿" + header + "\n" + body + "\n", "utf8");

// 分布を表示
const dist = new Map();
for (const r of rows) dist.set(r.phonemes, (dist.get(r.phonemes) ?? 0) + 1);
console.log(`total: ${rows.length} words -> ${path.basename(OUT)}`);
for (const [k, v] of [...dist.entries()].sort((a, b) => a[0] - b[0])) {
  console.log(`${String(k).padStart(2)} phonemes: ${String(v).padStart(4)} ${"#".repeat(Math.ceil(v / 10))}`);
}

// 検算用サンプル
for (const w of ["축하", "못하다", "좋다", "좋아하다", "없이", "없다", "서울역", "시계", "흰색", "거의", "많이", "그렇게", "여행", "처음 뵙겠습니다"]) {
  console.log(`${w} = ${countPhonemes(w)}`);
}
