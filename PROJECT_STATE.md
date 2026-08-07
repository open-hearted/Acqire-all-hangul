# PROJECT_STATE.md

> 更新日: 2026-08-07
> 目的: 外部AI（コードを直接読めないAI）との相談用。実装済み機能の重複提案・認識ズレ防止のための現状把握ドキュメント。
> 機能追加のたびにこのファイルを更新すること。

---

## 1. アプリ概要

韓国語（ハングル）の発音を、日本語話者が正確に聞き取れるようにするための自習用リスニング・発音判定アプリ。単純な母音当てクイズから始まり、単語のCV音節判定、IPA（国際音声記号）による精密な聞き取り転写クイズ、聞き取りエラーの傾向分析（音響領域=acoustic region分析）まで一貫して行える。

- **技術スタック**: Next.js 15.5 / React 18 / TypeScript 5（strict）。DB・ORM等は未導入で、データ永続化は**ブラウザのlocalStorageのみ**（Phase 1想定、将来Supabase移行を見込んだ抽象化レイヤーあり）。
- **動作環境**: ブラウザで動作するWebアプリ。PC横配置レイアウトとモバイル両対応。Vercelにデプロイ済み（mainブランチpushで自動デプロイ）。
- **外部サービス**: OpenAI API（`.env.example`にOPENAI_API_KEY等）。転写セッションのAI講評機能で使用、パスワードゲート付き（`AI_ACCESS_PASSWORD`）。それ以外の外部API・DBは無し。

---

## 2. 機能一覧

### 2.1 出題モード（4ページ、独立度が高い）

| ルート | 概要 | 状態 |
|---|---|---|
| `/` (page.tsx) | 元祖クイズ。10母音レッスンの音声を聞いてキーボード入力で回答。独自のlocalStorage（`hangul-quiz-stats`等）を使い、他モジュールとは別系統。 | 完成（レガシー） |
| `/phoneme` | **V単独判定**。母音の音声を聞き、聞こえた「音素の数」を回答する方式（IPA記号そのものではなく個数判定）。 | 完成 |
| `/words` | **単語（CV音節）クイズ**。単語音声を聞き、聞こえたパターン（子音/母音の並び）をテキストで回答。「間違い復習モード」と「⚔️過去の自分との対決モード」（同じ単語の最新誤答と今回の回答を並べて比較）を搭載。 | 完成 |
| `/transcribe` | **IPA転写クイズ**（最も精密・最も開発が活発）。オンスクリーンIPAキーボードで音素ごとに回答を組み立てる。1スロットに複数候補（ブラケット記法、後述）、ワイルドカード（母/子＝種類は分かるが記号が特定できない）、参照音声再生、前後メモ入力に対応。「今日分コピー」「全期間コピー」の聞き取りログエクスポートボタンあり。 | 完成、継続開発中 |
| `/audio-repeat` | **韓国語音声リピート練習**。`public/audio/<CD名>/` のMP3をCD別に一覧表示し、選択・並べ替え・削除した練習リストを指定回数（1/5/10/無限）と間隔（0/0.3/0.5/1/2秒）で連続再生する。 | 完成 |
| `/regions` | **進捗・分析ダッシュボード**。カバー率、混同ペア、未分類誤答、過去の自分との比較などを集計表示。Markdown/JSONクリップボードコピー、JSONファイルダウンロードのエクスポート機能あり。 | 完成 |

### 2.2 回答入力方式

- **IPA入力（`/transcribe`）**: 母音・半母音・子音の各ボタンをタップしてスロットに積み上げる方式。
- **子音キーボードのレイアウト（v2）**: 初声・語中ゾーンは7列グリッド。列1〜5がファミリー列（ヘッダーボタン＋構成音素を縦積み）、列6が単独子音（ㅁ/m/・ㄴ/n/・ㄹ/ɾ/・ㅎ/h/）、列7が「子音」ワイルドカードボタン（ピンク）と「OR」ボタン（オレンジ）。旧来の n系（ㄴ・ㅇまとめ）ファミリーは廃止し、終声ゾーンに統合。
- **子音ファミリー選択**: 例えば「k系」ボタン1つで `k / kʰ / k͈`（平音・激音・濃音）をまとめて候補セットとして1スロットに投入できるショートカット。ファミリーは k系・t系・p系・s系・チ系（tɕ系）の5種（各 `CONSONANT_FAMILIES` の `members` に個別音素定義あり）。
- **終声（閉じる音）ゾーン**: 初声・語中ゾーンの下に罫線で区切られた9ボタン構成。閉鎖音ヘッダー`[k̚|t̚|p̚]`（濃緑）＋メンバー3種（淡緑）、鼻音ヘッダー`[n|ŋ|m]`（濃紫）＋メンバー3種（淡紫）、単独のㄹ/l/（無彩色）。ヘッダーボタンはファミリーボタンと同様、メンバー全部をOR候補として1スロットに投入する。初声のㄹ/ɾ/（flap）と終声のㄹ/l/（lateral）はハングル表記こそ同じ「ㄹ」だが、別音素としてログ上も区別される。
- **ORボタン（クロスファミリー合成）**: タップすると「次の1回のタップ」だけ有効なワンショットの追記モードになる（`pendingOr` state）。次に音素ボタンまたはファミリー/終声ヘッダーボタンをタップすると、その候補が直前のスロット（選択中のスロット、なければ末尾のスロット）にマージされる（例: t系→OR→ㄴ で `[t|tʰ|t͈|n]`、k系→OR→チ系で `[k|kʰ|k͈|tɕ|tɕʰ|tɕ͈]`）。候補数の上限はない。スロット選択時の「OR候補を追加」トグル（母音含む既存回答の編集用）も同様に上限を撤廃済みで、両者とも無制限に候補を追加できる。データ構造は既存の `heardCandidateSlots`（候補配列）にそのまま追加するだけで変更なし。
- **候補ブラケット記法**: 1スロットに複数のOR候補がある場合、`[a|b]` のようにパイプ区切りでブラケット表示・シリアライズする。データ上は `heardCandidateSlots?: string[][] | null`（各スロットがOR候補の配列）として保持。旧来の単一候補フィールド `heardPhonemes: string[] | null` は後方互換用に代表候補のみ格納。
- **表示**: IPA表記が主表示（19px、終声ゾーンのみ18px、本文色・太字）、ハングルが従表示（18px、本文色）。従来の「ハングル大・IPA小灰色」から主従を逆転し、ボタン内余白も最小限に詰めている。ファミリー列（k系/t系/p系/s系/チ系）は薄い紫背景＋枠線で1つの縦グループとして視覚的にまとまるようにしている。

### 2.3 参照音声ボタン

- `public/audio/`（31ファイル）: 元祖クイズ用 `Lesson001-01.mp3`〜`10.mp3`＋母音ハングル文字名の音源（例 `ㅏ.mp3`）全21種。`/transcribe`のIPAキーボードの母音・半母音ボタンから再生可能。
- `public/word_audios/`（1671ファイル）: `words.json`の全単語1つずつに対応する音源（ファイル名＝ハングル単語そのもの、空白は`_`に置換）。`/words`と`/transcribe`両方で使用。
- **子音単体の参照音声は存在しない**（テキストヒントのみ、`phonemeGuide.ts`）。
- 参照音声の再生回数は問題ごとに `ipaReferenceCounts: Record<string, number>` として記録。単語本体の再生回数は別途 `wordPlayCount` として記録。

### 2.4 ログ記録

1試行（1問）ごとに `ErrorLogRecord` として記録（フィールド一覧は§3）。記録している主な情報: 出題単語・意味、正解音素数と回答数、聞こえたパターン文字列、誤りの領域（位置・種類・音素）、聞こえた候補スロット、転写メモ、セッションID、正解音素スナップショット、転写グレード、単語/参照音声再生回数、単語の出題回数、既知単語フラグ、聴取環境（静か/騒音）とそのメモ、記録日時。

### 2.5 エクスポート機能

- `/transcribe`: 「今日分コピー」「全期間コピー」— 生の聞き取りログをブラケット記法つきテキストとしてクリップボードにコピー（`perceptionLogExport.ts`）。
- `/regions`: Markdownサマリーのクリップボードコピー（AIに貼り付け相談用、`exportSummary.ts`）、生JSONのクリップボードコピー、JSONファイルダウンロード。

### 2.6 判定ロジック

- **`/transcribe`（精密転写）**: Needleman-Wunsch風の編集距離アラインメントによる決定的ローカル判定（`transcriptionAnalysis.ts`）。外部APIは使わない設計方針（「判定器は測定器」という明示的な設計思想）。
  - コスト: 完全一致=0、ワイルドカード一致=0.25、同カテゴリ内代替=0.6、カテゴリ跨ぎ代替=1.4、脱落/挿入=1.0。
  - OR候補スロットは最良候補で採点。正解が候補の中にあるが単一回答でなかった場合は `isAlternativeMatch: true`（完全一致ではなく「候補内一致」として、grade上は"perfect"から"pattern"へ格下げ）。
  - 総合グレード: 脱落/挿入があれば `mismatch`、代替一致等が無ければ `perfect`、それ以外は `pattern`。
- **`/phoneme`（母音カウント判定）**: 回答した音素数と正解数の比較のみ（`vowelAnalysis.ts`）。カウント不足＝融合、超過＝挿入と分類。
- **`/words`（単語パターン判定）**: 自由記述の聞こえたパターン（子/母の並び）を正解パターンの部分列として貪欲マッチ（`wordAnalysis.ts`）。部分列として成立しない場合（置換や挿入が絡む複雑な誤り）は`null`（未分類）を返し、`/regions`の「未分類の誤答」に集計される。既知の制約でありバグではない。

---

## 3. データ構造

### 3.1 `ErrorLogRecord`（1試行分ログ）— `src/lib/acoustic-region/types.ts`

```ts
interface ErrorLogRecord {
  id: string;
  userId: string;
  word: string;                               // 例: "셋"
  meaning: string;                             // 例: "3"（現状はwords.jsonの英語グロス由来）
  correctPhonemeCount: number;
  answeredCount: number;
  heardPattern: string;                        // 例: "子母"
  errorRegions: ErrorRegion[];
  heardPhonemes: string[] | null;              // 旧・単一候補IPA列（カウントのみクイズならnull）
  heardCandidateSlots?: string[][] | null;      // OR候補スロット（新形式）
  transcriptionNotes?: TranscriptionNote[] | null;
  sessionId?: string;
  sessionStartedAt?: string;
  correctPhonemes?: string[];                  // 記録時点の正解IPA列スナップショット
  transcriptionGrade?: "perfect" | "pattern" | "mismatch";
  wordPlayCount?: number;
  ipaReferenceCounts?: Record<string, number>;
  wordAttemptNumber?: number;                  // この単語の何回目の出題か
  wordKnown: boolean | null;                   // 「知っている単語」トグル
  listeningCondition: "quiet" | "noisy" | null;
  conditionNote: string | null;
  createdAt: string;                           // ISO 8601
}

interface ErrorRegion {
  position: "initial" | "medial" | "final";
  type: "deletion" | "merger" | "insertion" | "substitution";
  phoneme: string;
  heard?: string;
  heardCandidates?: string[];
}
```

実データ例（`셋`＝「3」、末尾の /t̚/ が脱落）:
```ts
errorRegions: [{ position: "final", type: "deletion", phoneme: "t̚" }]
```

### 3.2 `WordRecord`（単語マスタ、実行時に`words.json`から構築）

```ts
interface WordRecord {
  id: string;                    // `word:${word}`
  word: string;
  meaningJa: string;             // 現状は英語グロス流用（暫定、実装コメントでも明示）
  phonemeCount: number;
  phonemes: { position: string; phoneme: string }[];
  regions: string[];             // 例: ["final:t̚", "medial:j"]
  audioRef: string;              // `/word_audios/<word>.mp3`
}
```

生データ `src/data/words.json`（1671件）実データ例:
```json
{"w":"가게","e":"store, shop","p":4}
```
（`w`=単語、`e`=英語グロス、`p`=音素数。`w`→IPA変換は`hangulPhonemes.ts`の韓国語音韻規則エンジン（濃音化・激音化・鼻音化・流音化・口蓋化・連音化・終声中和・特定複合語のㄴ挿入など）で実行時に生成）

`src/data/lessons.json`（30件、元祖クイズ用）:
```json
{ "id": "Lesson001-01", "audioFile": "ㅏ.mp3", "answer": "ㅏ", "hint": "基本母音 1", "phonemes": 1 }
```

### 3.3 音声ファイル管理

- `public/audio/`: `Lesson001-NN.mp3`（10件）＋ 母音ハングル文字名（例 `ㅏ.mp3`、全21種）
- `public/word_audios/`: 単語そのものをファイル名にした1671件（スペースは`_`、`?`は除去）
- 子音単体の音声ファイルは存在しない

---

## 4. ファイル構成

```
src/
  app/
    page.tsx                       "/" 元祖10母音クイズ（独自localStorage系統）
    phoneme/page.tsx                "/phoneme" 母音数当てクイズ
    words/page.tsx                  "/words" 単語クイズ（誤答復習・過去の自分との対決モード含む）
    regions/page.tsx                "/regions" 進捗・分析ダッシュボード＋エクスポート
    transcribe/page.tsx             "/transcribe" IPA転写クイズ（メイン開発対象）
    api/analyze-transcription/route.ts  転写セッションをOpenAIへ送りAI講評を返すAPI（パスワードゲート）
  data/
    words.json                      単語マスタ1671件
    lessons.json                    元祖クイズ用レッスン30件
  lib/
    ai/
      transcriptionAnalyzer.ts      OpenAI Responses API呼び出しラッパー（プロバイダ切替は未実装スタブ、openai固定）
    acoustic-region/                 中核ドメインモジュール（詳細設計は docs/acoustic-region-module.md）
      types.ts                       ドメイン型定義
      index.ts                       公開バレルエクスポート、リポジトリのシングルトン取得
      repository.ts                  ErrorLog/WordRepositoryインターフェース（Phase2 Supabase移行の差し替え点）
      localStorageRepository.ts      Phase1実装（localStorage、SSR安全なメモリfallback付き）
      hangulPhonemes.ts              ハングル→IPA音素変換（韓国語音韻規則エンジン）
      wordMaster.ts                  words.jsonからWordRecordマップを実行時構築
      vowelAnalysis.ts                母音数当てクイズの誤り分類
      wordAnalysis.ts                 単語クイズの誤り分類（部分列マッチ）
      transcriptionAnalysis.ts        IPA転写の採点エンジン（編集距離）、キーボード音素リスト
      sessionAnalysis.ts              (未コミット) 転写セッションをAI相談用にコンパクト集計
      perceptionLogExport.ts          (未コミット) ブラケット記法つき生ログのエクスポートテキスト生成
      stats.ts                        カバー率・混同ペア・進捗の集計
      phonemeGuide.ts                 IPA音素→日本語ヒント＋参照音声パスのマップ
      exportSummary.ts                /regions用Markdownサマリー生成
public/
  audio/                            参照音声31件
  word_audios/                      単語音声1671件
docs/
  acoustic-region-module.md          acoustic-regionモジュールの正式設計ドキュメント（日本語、コードとほぼ一致）
  theory.md                          アプリ設計の背後にある学習理論「四段連鎖モデル」の記録
README.md                            古い内容のまま（元祖クイズのみ記載、acoustic-region以降は未記載）
.env.example                        (未コミット) OPENAI_API_KEY, AI_ACCESS_PASSWORD, AI_PROVIDER, OPENAI_MODEL
```

---

## 5. 未完成・既知の課題

- **AI講評機能はバックエンドのみ完成、UI未接続**: `src/app/api/analyze-transcription/route.ts`・`src/lib/ai/transcriptionAnalyzer.ts`・`src/lib/acoustic-region/sessionAnalysis.ts`は未コミット（git untracked）。パスワード認証・サイズ制限・スキーマ検証まで実装済みで機能的には完結しているが、`/transcribe`や`/regions`側からこのAPIを呼び出すUI（ボタン等）はまだ存在しない。次の作業ステップと推測される。
- **`meaningJa`が暫定的に英語**: `words.json`に日本語の意味データがまだ無いため、`wordMaster.ts`は英語グロス（`e`フィールド）を流用している。日本語意味データ整備後に置き換え予定（コードコメントで明示）。
- **単語クイズの誤答未分類バケット**: `classifyWordAnswer`は部分列として成立しない回答（置換・挿入が絡む場合）を`null`（未分類）として`/regions`に集計する仕様上の既知の限界。バグではない。
- **AIプロバイダ切替は未実装**: `AI_PROVIDER`は将来の他プロバイダ対応を見込んだスイッチだが、現状`"openai"`以外を指定するとエラーになる。
- **ストレージはPhase 1（localStorageのみ）**: マルチユーザー・永続化なし。`repository.ts`の抽象化とダミーの`userId = "local-user"`は将来のSupabase移行・ログイン機能に備えた先行実装で、現状は未使用の下地。
- **READMEが実態と乖離**: 元祖クイズのみを記載しており、`/phoneme`・`/words`・`/transcribe`・`/regions`やacoustic-regionモジュール全体について触れていない。外部AIへの説明はこのPROJECT_STATE.mdおよび`docs/acoustic-region-module.md`を優先すること。
- **開発が最も活発なのは`/transcribe`**: 直近のコミット履歴（候補ブラケット記法、子音ファミリー、PC横配置レイアウト、メモ機能等）はほぼ全てこのページに集中しており、仕様変更が最も頻繁な部分。
