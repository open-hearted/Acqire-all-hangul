// リポジトリの localStorage 実装（Phase 1）。
// 設計: docs/acoustic-region-module.md
//
// ストレージ本体は JsonStore として注入可能にしてあり、
// SSR（window なし）では自動的にメモリ実装へフォールバックする。
// Phase 2 では repository.ts のインターフェースを実装した Supabase 版に差し替える。

import type {
  ErrorLogRepository,
  WordRepository,
  EventLogRepository,
  AcousticRegionRepositories,
} from "./repository";
import type { ErrorLogRecord, NewErrorLog, WordRecord } from "./types";
import type { TrialEventBlock } from "./transcriptionEvents";

// ─── JsonStore: localStorage の薄い抽象（SSR/テスト用の差し替え口） ──────────

export interface JsonStore {
  get<T>(key: string, fallback: T): T;
  set(key: string, value: unknown): void;
}

export function createLocalStorageStore(): JsonStore {
  return {
    get<T>(key: string, fallback: T): T {
      if (typeof window === "undefined") return fallback;
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return fallback;
        return (JSON.parse(raw) as T) ?? fallback;
      } catch {
        return fallback;
      }
    },
    set(key: string, value: unknown) {
      if (typeof window === "undefined") return;
      localStorage.setItem(key, JSON.stringify(value));
    },
  };
}

export function createMemoryStore(): JsonStore {
  const map = new Map<string, string>();
  return {
    get<T>(key: string, fallback: T): T {
      const raw = map.get(key);
      if (!raw) return fallback;
      try {
        return (JSON.parse(raw) as T) ?? fallback;
      } catch {
        return fallback;
      }
    },
    set(key: string, value: unknown) {
      map.set(key, JSON.stringify(value));
    },
  };
}

// ─── ストレージキー ──────────────────────────────────────────────────────

const ERROR_LOG_KEY = "acoustic-region:error-log:v1";
const WORDS_KEY = "acoustic-region:words:v1";
const EVENT_LOG_KEY = "acoustic-region:event-log:v1";

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // crypto.randomUUID が無い環境向けの簡易フォールバック
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ─── ErrorLogRepository ─────────────────────────────────────────────────

class LocalErrorLogRepository implements ErrorLogRepository {
  constructor(private readonly store: JsonStore) {}

  private readAll(): ErrorLogRecord[] {
    return this.store.get<ErrorLogRecord[]>(ERROR_LOG_KEY, []);
  }

  async append(input: NewErrorLog): Promise<ErrorLogRecord> {
    const existing = this.readAll();
    const isTranscription = Array.isArray(input.heardPhonemes);
    const wordAttemptNumber =
      input.wordAttemptNumber ??
      (isTranscription
        ? existing.filter(
            (record) =>
              record.userId === input.userId &&
              record.word === input.word &&
              Array.isArray(record.heardPhonemes)
          ).length + 1
        : undefined);
    const record: ErrorLogRecord = {
      ...input,
      ...(wordAttemptNumber === undefined ? {} : { wordAttemptNumber }),
      id: newId(),
      createdAt: new Date().toISOString(),
    };
    // 追記のみ。既存レコードは削除しない（出題プールの原資のため）
    this.store.set(ERROR_LOG_KEY, [...existing, record]);
    return record;
  }

  async listByUser(userId: string): Promise<ErrorLogRecord[]> {
    return this.readAll().filter((r) => r.userId === userId);
  }

  async listByWord(userId: string, word: string): Promise<ErrorLogRecord[]> {
    return this.readAll().filter(
      (r) => r.userId === userId && r.word === word
    );
  }
}

// ─── WordRepository ──────────────────────────────────────────────────────

class LocalWordRepository implements WordRepository {
  constructor(private readonly store: JsonStore) {}

  private readAll(): WordRecord[] {
    return this.store.get<WordRecord[]>(WORDS_KEY, []);
  }

  async saveAll(words: WordRecord[]): Promise<void> {
    const byWord = new Map(this.readAll().map((w) => [w.word, w]));
    for (const incoming of words) {
      const existing = byWord.get(incoming.word);
      // 既存語は id を維持して上書き（upsert）
      byWord.set(
        incoming.word,
        existing ? { ...incoming, id: existing.id } : incoming
      );
    }
    this.store.set(WORDS_KEY, [...byWord.values()]);
  }

  async list(): Promise<WordRecord[]> {
    return this.readAll();
  }

  async findByWord(word: string): Promise<WordRecord | null> {
    return this.readAll().find((w) => w.word === word) ?? null;
  }

  async listByRegion(regionTag: string): Promise<WordRecord[]> {
    return this.readAll().filter((w) => w.regions.includes(regionTag));
  }
}

// ─── EventLogRepository ──────────────────────────────────────────────────

class LocalEventLogRepository implements EventLogRepository {
  constructor(private readonly store: JsonStore) {}

  private readAll(): TrialEventBlock[] {
    return this.store.get<TrialEventBlock[]>(EVENT_LOG_KEY, []);
  }

  async saveBlock(block: TrialEventBlock): Promise<void> {
    const existing = this.readAll();
    const idx = existing.findIndex((b) => b.trialId === block.trialId);
    if (idx === -1) {
      this.store.set(EVENT_LOG_KEY, [...existing, block]);
    } else {
      const next = [...existing];
      next[idx] = block;
      this.store.set(EVENT_LOG_KEY, next);
    }
  }

  async listAll(): Promise<TrialEventBlock[]> {
    return this.readAll();
  }

  async listBySession(sessionId: string): Promise<TrialEventBlock[]> {
    return this.readAll().filter((b) => b.sessionId === sessionId);
  }

  async getByTrial(trialId: string): Promise<TrialEventBlock | null> {
    return this.readAll().find((b) => b.trialId === trialId) ?? null;
  }
}

// ─── Factory ─────────────────────────────────────────────────────────────

export function createLocalRepositories(
  store: JsonStore = createLocalStorageStore()
): AcousticRegionRepositories {
  return {
    errorLogs: new LocalErrorLogRepository(store),
    words: new LocalWordRepository(store),
    events: new LocalEventLogRepository(store),
  };
}
