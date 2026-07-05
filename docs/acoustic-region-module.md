# 音響領域学習モジュール 設計メモ

## コンセプト（最重要・変更禁止）
- 目的は L1（日本語）音韻体系に存在しない音響領域を特定し、そこに語彙を**意味ごと**投入して対象言語（韓国語）の言語空間を構築すること
- SRS的な「人間の記憶効率」の話ではない。**音韻空間のカバレッジ**の話
- 既に写像できる（＝正しく聞き取れる）音響は訓練対象外。放置してよい
- 理論的背景: HVPT（高変動音素訓練）+ lexically guided perceptual learning
- 記述は常に「音韻体系」を主語にする（例:「日本語は開音節言語で終声がン・ッのみ」）。民族・国籍を主語にしない

## データモデル

### 誤答ログ（error_log）
1レコード = 1回の出題結果。**削除しない**（過去の誤答が後述の出題プールになるため）

| フィールド | 型 | 例 |
|---|---|---|
| id | uuid | |
| user_id | uuid | 当面は固定値でよい（後述） |
| word | text | 셋 |
| meaning | text | 3 |
| correct_phoneme_count | int | 3 |
| answered_count | int | 2 |
| heard_pattern | text | 子母 |
| error_regions | jsonb | 下記の分類の配列 |
| listening_condition | text (nullable) | `quiet` / `noisy`。任意。セッション単位で選択し、各レコードに非正規化して持つ |
| condition_note | text (nullable) | 聴取環境の自由メモ（例: 電車内）。任意。集計には使わず補足専用 |
| created_at | timestamptz | |

聴取環境の記録について:
- 集計の主役は `listening_condition`（選択式）。自由記述は集計できないため enum に絞る
- 集計時は noisy を**除外ではなく層別**に使う（騒音下でも検出できる領域 = 写像が確立した領域、静かな環境でしか検出できない領域 = まだ脆い領域）。Phase 1 は「全体 / 静かな環境のみ」の切り替え表示程度で十分

### 音響領域分類（error_regions の要素）
位置 × タイプ のマトリクス

- 位置: `initial`（初声）/ `medial`（中声）/ `final`（終声）
- タイプ: `deletion`（脱落）/ `merger`（統合: 2音素を1音に）/ `insertion`(過剰検出)
- 音素: 落ちた/統合された具体的な音素（例: `t̚`, `l`, `ŋ`, `h`, `w`）

例: 셋 → `[{position: "final", type: "deletion", phoneme: "t̚"}]`
例: 설렁탕 → `[{position: "medial", type: "merger", phoneme: "l:"}, {position: "final", type: "deletion", phoneme: "ŋ"}]`

### 語彙マスタ（words）
| フィールド | 型 | 備考 |
|---|---|---|
| id | uuid | |
| word | text | |
| meaning_ja | text | 意味は必須。音だけの訓練にしない |
| phoneme_count | int | |
| phonemes | jsonb | 位置つき音素列 |
| regions | jsonb | この語が含む音響領域タグ（終声閉鎖音、流音重複 等） |
| audio_ref | text | URL+タイムスタンプ形式（既存の可変ループ機能と同じコンテンツモデル） |

## 出題ロジック
1. 誤答単語そのものの再出題
2. **同じ音響領域に属する別語彙**の投入（こちらが主）
3. 選定基準は頻度順ではなく**知覚不能順**（誤答率の高い領域を優先）
4. 弱点集中に偏りすぎないよう、誤答領域:新規 = 7:3 程度の配合

## 進捗表示
- 正答率ではなく**音響領域の被覆率**（領域ごとの検出成功率）
- 「過去の自分との対決」: 以前の誤答レコードをそのまま再提示（「あなたは以前これを『母』1音と聞いた。今は？」）。error_log を削除しない理由はこれ
- 同一語の再測定推移（例: 운동화 6/8 → 8/8）

## 実装フェーズ
### Phase 1（今回実装する範囲）
- 上記データモデルでの記録・分類・出題・進捗表示
- ストレージは**ローカル（または既存の仕組み）**でよい。ただし必ずリポジトリ層/ストレージ層を1枚抽象化して、後で差し替え可能にすること
- user_id は全レコードに最初から持たせる。当面は固定値（例: "local-user"）でよい

### Phase 2（今回は実装しない。ただし壊さない設計にする）
- ログイン機能（複数ユーザー: 本人+姪を想定）
- ストレージのSupabase移行（テーブル定義は上記をほぼそのまま使う想定）
- Phase 1 のストレージ抽象と user_id フィールドは、この移行のための布石

## やらないこと
- SRS的な忘却曲線スケジューリング（コンセプトと混同しない）
- 正答済み音響領域への出題比重増加
- 頻度ベースの語彙選定

---

## 実装メモ（コードとの対応）

Phase 1 の骨格は `src/lib/acoustic-region/` に実装されている。

| 設計 | コード |
|---|---|
| データモデル（error_log / words / error_regions） | `types.ts` |
| リポジトリ抽象（Phase 2 で Supabase 実装に差し替える境界） | `repository.ts` |
| localStorage 実装（Phase 1） | `localStorageRepository.ts` |
| 固定ユーザーID `"local-user"` とファクトリ | `index.ts` |
| 基本母音クイズのエラー分析 | `vowelAnalysis.ts` |
| 被覆率の集計（知覚不能順ソート・誤答領域の分布） | `stats.ts` |
| 進捗表示ページ | `src/app/regions/page.tsx`（`/regions`） |

- ドメイン型は TypeScript 慣習の camelCase。Supabase 移行時はリポジトリ実装層で snake_case カラム（`user_id`, `correct_phoneme_count`, `error_regions`, `listening_condition`, `condition_note`, `created_at`, `meaning_ja`, `phoneme_count`, `audio_ref`）へマッピングする
- `ErrorLogRepository` は設計どおり削除APIを持たない（過去の誤答レコードが出題プールと「過去の自分との対決」の原資のため）

### 基本母音クイズのエラー分析

母音クイズ（`/phoneme`）は1音節・回答が音素数のみなので、聞こえ方メモなしで error_regions を一意に自動導出できる。位置は常に `medial`。

- 2音素（わたり音+母音）を1と回答 → `{position: "medial", type: "merger", phoneme: "j"|"w"|"ɰ"}`。日本語音韻体系はわたり音を拗音として母音と一体のモーラ単位で扱うため、/ja/ 等を1つの音として写像する
- 1音素を2と回答 → `{position: "medial", type: "insertion", phoneme: <当該母音のIPA>}`
- 正答も error_log に記録する（errorRegions は空配列。領域ごとの検出成功率の分母になる）
- meaning には IPA 読みを充てる（単母音に語彙的意味はない。意味ごと投入するのは訓練の出力側で、母音クイズは領域検出の入力側として機能する）

判定は各問題の初回回答のみ記録する（「もう一度」での再回答は記録しない）。クイズページ既存の localStorage 記録（`hangul-phoneme-stats`）とは独立に追記される。
