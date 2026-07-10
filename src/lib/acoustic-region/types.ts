// 音響領域学習モジュールのデータモデル。
// 設計: docs/acoustic-region-module.md
//
// ドメイン型は camelCase。Phase 2 の Supabase 移行時は
// リポジトリ実装層で snake_case カラムへマッピングする
// （userId → user_id, correctPhonemeCount → correct_phoneme_count, ...）。

// ─── 音響領域分類（位置 × タイプ のマトリクス） ─────────────────────────────

/** 音節内の位置: 初声 / 中声 / 終声 */
export type RegionPosition = "initial" | "medial" | "final";

/**
 * 知覚エラーのタイプ: 脱落 / 統合（2音素を1音に） / 過剰検出 / 置換。
 * substitution は IPA転写クイズで取れる同定エラー（例: /ʌ/ を /o/ と知覚 =
 * L1カテゴリへの吸収）。検出はできているが写像が間違っているため、
 * 被覆率上は失敗として扱う。
 */
export type RegionErrorType = "deletion" | "merger" | "insertion" | "substitution";

/**
 * 1つの音響領域 = 位置 × タイプ × 音素。
 * 例: 셋 の終声 t̚ を落とした → { position: "final", type: "deletion", phoneme: "t̚" }
 * 例: ʌ を o と聞いた → { position: "medial", type: "substitution", phoneme: "ʌ", heard: "o" }
 */
export interface ErrorRegion {
  position: RegionPosition;
  type: RegionErrorType;
  /** 落ちた/統合された/過剰検出された/置換された具体的な音素（IPA。例: t̚, l, ŋ, h, w） */
  phoneme: string;
  /** substitution のとき: 何に聞こえたか（IPA または ワイルドカード 母/子） */
  heard?: string;
  /**
   * ORで入力された候補。複数候補のときは heard に代表値を捏造せず、
   * こちらに入力どおり保存する。
   */
  heardCandidates?: string[];
}

/**
 * 音響領域の同一性キー（例: "final:deletion:t̚"）。
 * 被覆率の集計や「同じ音響領域に属する別語彙」の選定でのグルーピングに使う。
 */
export function regionKey(region: ErrorRegion): string {
  return `${region.position}:${region.type}:${region.phoneme}`;
}

// ─── 聴取環境 ────────────────────────────────────────────────────────────

/**
 * 聴取環境（任意記録）。集計に使うため自由記述ではなく選択式に絞る。
 * セッション単位で選択し、そのセッション中の全レコードに非正規化して持たせる。
 * 集計では noisy を除外ではなく層別に使う（騒音下でも検出できる領域 =
 * 写像が確立した領域、静かな環境でしか検出できない領域 = まだ脆い領域）。
 */
export type ListeningCondition = "quiet" | "noisy";

// ─── IPA転写メモ ───────────────────────────────────────────────────────────

export type TranscriptionNote = {
  id: string;
  phase: "during_answer" | "after_judgement";
  text: string;
  createdAt: string;
};

/** IPA転写クイズの判定結果。保存時点の判定を固定する。 */
export type TranscriptionLogGrade = "perfect" | "pattern" | "mismatch";

// ─── 誤答ログ（error_log） ────────────────────────────────────────────────

/**
 * 1レコード = 1回の出題結果。削除しない
 * （過去の誤答が出題プールと「過去の自分との対決」の原資になるため）。
 */
export interface ErrorLogRecord {
  id: string;
  userId: string;
  /** 出題された単語（例: 셋） */
  word: string;
  /** 単語の意味（例: 3）。意味ごと投入するコンセプトのため必須 */
  meaning: string;
  /** 正解の音素数 */
  correctPhonemeCount: number;
  /** 回答した音素数 */
  answeredCount: number;
  /** 聞こえ方メモ（例: "子母"） */
  heardPattern: string;
  /** 知覚できなかった音響領域の配列 */
  errorRegions: ErrorRegion[];
  /**
   * IPA転写クイズの回答列（任意）。null = 転写なし（カウント方式の出題）。
   * 要素は IPA記号 または ワイルドカード "母"/"子"（聞こえたが同定できず）
   */
  heardPhonemes: string[] | null;
  /**
   * IPA転写クイズのOR候補を含む回答スロット（任意）。
   * 旧記録はこのフィールドを持たず、heardPhonemes を単一候補として読む。
   */
  heardCandidateSlots?: string[][] | null;
  /** IPA転写クイズのメモ（任意）。旧記録はこのフィールドを持たない。 */
  transcriptionNotes?: TranscriptionNote[] | null;
  /** IPA転写クイズのセッション識別子（旧記録は未設定） */
  sessionId?: string;
  /** セッション開始時刻。終了時刻は同セッションの最後の createdAt から得る。 */
  sessionStartedAt?: string;
  /** 保存時点の正解IPA列。語彙マスタ変更後も過去ログの意味を固定する。 */
  correctPhonemes?: string[];
  /** 保存時点の転写判定。 */
  transcriptionGrade?: TranscriptionLogGrade;
  /** この問題音声を再生した回数（開始時の自動再生を含む）。 */
  wordPlayCount?: number;
  /** IPA発音例を参照した回数。キーはIPA記号。 */
  ipaReferenceCounts?: Record<string, number>;
  /** この単語がIPA転写クイズに出た累計回数（当該試行時点）。 */
  wordAttemptNumber?: number;
  /**
   * 「この単語は知っていた」（任意）。null = 未回答。
   * true なのに転写できない語 = 音韻表現の再結線が必要な語
   */
  wordKnown: boolean | null;
  /** 聴取環境（任意）。null = 未記録 */
  listeningCondition: ListeningCondition | null;
  /** 聴取環境の自由メモ（例: 電車内）。任意。集計には使わず補足専用 */
  conditionNote: string | null;
  /** ISO 8601 文字列（timestamptz 相当） */
  createdAt: string;
}

/** 追記時の入力。id / createdAt はリポジトリが採番する */
export type NewErrorLog = Omit<ErrorLogRecord, "id" | "createdAt">;

// ─── 語彙マスタ（words） ──────────────────────────────────────────────────

/** 位置つき音素（phonemes カラムの要素） */
export interface PositionedPhoneme {
  position: RegionPosition;
  /** IPA 表記の音素 */
  phoneme: string;
}

export interface WordRecord {
  id: string;
  word: string;
  /** 日本語の意味。音だけの訓練にしないため必須 */
  meaningJa: string;
  phonemeCount: number;
  /** 位置つき音素列 */
  phonemes: PositionedPhoneme[];
  /** この語が含む音響領域タグ（例: 終声閉鎖音、流音重複） */
  regions: string[];
  /** 音声参照。URL+タイムスタンプ形式（既存の可変ループ機能と同じコンテンツモデル） */
  audioRef: string;
}

// ─── ユーザー ────────────────────────────────────────────────────────────

/**
 * Phase 1 の固定ユーザーID。
 * user_id は全レコードに最初から持たせる（Phase 2 のログイン機能への布石）。
 */
export const LOCAL_USER_ID = "local-user";
