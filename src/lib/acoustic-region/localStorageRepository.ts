// リポジトリの localStorage 実装（Phase 1）。
// 設計: docs/acoustic-region-module.md
//
// ストレージ本体は JsonStore として注入可能にしてあり、
// SSR（window なし）では自動的にメモリ実装へフォールバックする。
// Phase 2 では repository.ts のインターフェースを実装した Supabase 版に差し替える。

import type {
  ErrorLogRepository,
  WordRepository,
  AcousticRegionRepositories,
} from "./repository";
import type { ErrorLogRecord, NewErrorLog, WordRecord } from "./types";

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
    const record: ErrorLogRecord = {
      ...input,
      id: newId(),
      createdAt: new Date().toISOString(),
    };
    // 追記のみ。既存レコードは削除しない（出題プールの原資のため）
    this.store.set(ERROR_LOG_KEY, [...this.readAll(), record]);
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

// ─── Factory ─────────────────────────────────────────────────────────────

export function createLocalRepositories(
  store: JsonStore = createLocalStorageStore()
): AcousticRegionRepositories {
  return {
    errorLogs: new LocalErrorLogRepository(store),
    words: new LocalWordRepository(store),
  };
}
