// TOPIK I 語彙の音素数を計算し、音素数順に並べたCSVを生成する
//
// 数え方（IPAベース）:
//   初声の子音 = 1（無音のㅇは0。濃音ㄲㄸㅃㅆㅉも1音素）
//   母音       = 1（単母音 ㅏㅐㅓㅔㅗㅜㅡㅣ）または 2（わたり音つき ㅑㅒㅕㅖㅘㅙㅚㅛㅝㅞㅟㅠㅢ）
//   終声       = 1（二重パッチムも発音される子音は1つなので1）
//   ハングル以外の文字（スペース・記号）は数えない

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const PARTS = ["topik1-part1.tsv", "topik1-part2.tsv", "topik1-part3.tsv"];
const OUT = path.join(DATA_DIR, "topik1-by-phonemes.csv");

// 中声21種のうち2音素の母音のインデックス
// 順序: ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ
const TWO_PHONEME_MEDIALS = new Set([2, 3, 6, 7, 9, 10, 11, 12, 14, 15, 16, 17, 19]);
const SILENT_INITIAL = 11; // ㅇ

function countPhonemes(word) {
  let count = 0;
  for (const ch of word) {
    const code = ch.codePointAt(0) - 0xac00;
    if (code < 0 || code > 0xd7a3 - 0xac00) continue; // ハングル音節以外は無視
    const initial = Math.floor(code / 588);
    const medial = Math.floor((code % 588) / 28);
    const final = code % 28;
    if (initial !== SILENT_INITIAL) count += 1;
    count += TWO_PHONEME_MEDIALS.has(medial) ? 2 : 1;
    if (final !== 0) count += 1;
  }
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
