// リポジトリ層の抽象。設計: docs/acoustic-region-module.md（Phase 1）
//
// Phase 1 は localStorage 実装（localStorageRepository.ts）を使い、
// Phase 2 でこのインターフェースを実装した Supabase 版に差し替える。
// そのため全メソッドを非同期にしてある。

import type { ErrorLogRecord, NewErrorLog, WordRecord } from "./types";
import type { TrialEventBlock } from "./transcriptionEvents";

/**
 * 誤答ログ（error_log）リポジトリ。
 * 削除APIは意図的に提供しない: 過去の誤答レコードが出題プールと
 * 「過去の自分との対決」の原資のため、削除しないことがデータモデルの前提。
 */
export interface ErrorLogRepository {
  /** 1回の出題結果を追記する。id と createdAt は実装側が採番する */
  append(input: NewErrorLog): Promise<ErrorLogRecord>;

  /** ユーザーの全誤答ログを createdAt 昇順で返す（被覆率・出題プールの原資） */
  listByUser(userId: string): Promise<ErrorLogRecord[]>;

  /** 同一語の再測定推移（例: 운동화 6/8 → 8/8）用。createdAt 昇順 */
  listByWord(userId: string, word: string): Promise<ErrorLogRecord[]>;
}

/** 語彙マスタ（words）リポジトリ */
export interface WordRepository {
  /** word をキーに upsert する（マスタ投入・更新用） */
  saveAll(words: WordRecord[]): Promise<void>;

  list(): Promise<WordRecord[]>;

  findByWord(word: string): Promise<WordRecord | null>;

  /** 指定の音響領域タグを含む語彙を返す（「同じ音響領域に属する別語彙」の選定用） */
  listByRegion(regionTag: string): Promise<WordRecord[]>;
}

/**
 * IPA転写クイズの操作イベント時系列ログ（event_log）リポジトリ。
 * error_log とは別ストア。trialId で ErrorLogRecord.trialId と結合する。
 * 削除APIは提供しない（error_log と同じ理由に加え、event_log 単独は
 * 診断の一次データであり再現不可能なため）。
 */
export interface EventLogRepository {
  /** 1試行分のイベントブロックを保存する。同じ trialId の既存ブロックは丸ごと置き換える（逐次フラッシュ用） */
  saveBlock(block: TrialEventBlock): Promise<void>;

  /** 全イベントブロックを返す（時系列要約エクスポート用） */
  listAll(): Promise<TrialEventBlock[]>;

  /** セッション単位のイベントブロックを返す */
  listBySession(sessionId: string): Promise<TrialEventBlock[]>;

  /** trialId 単位のイベントブロックを返す */
  getByTrial(trialId: string): Promise<TrialEventBlock | null>;
}

/** モジュールが必要とするリポジトリ一式。差し替え時はこの単位で入れ替える */
export interface AcousticRegionRepositories {
  errorLogs: ErrorLogRepository;
  words: WordRepository;
  events: EventLogRepository;
}
