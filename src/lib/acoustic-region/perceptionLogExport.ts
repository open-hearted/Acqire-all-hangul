import type { ErrorLogRecord } from "./types";
import { isWildcard } from "./transcriptionAnalysis";

type IndexedRecord = { record: ErrorLogRecord; number: number };

function localDay(iso: string): string {
  const date = new Date(iso);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function localTime(iso: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

function transcriptionRecords(records: ErrorLogRecord[]): ErrorLogRecord[] {
  return records
    .filter((record) => Array.isArray(record.heardPhonemes))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function formatPhoneme(phoneme: string): string {
  return isWildcard(phoneme) ? `${phoneme}?` : phoneme;
}

function formatAnswer(record: ErrorLogRecord): string {
  const slots = record.heardCandidateSlots;
  if (slots && slots.length > 0) {
    return slots
      .filter((candidates) => candidates.length > 0)
      .map((candidates) => {
        const formatted = candidates.map(formatPhoneme);
        return formatted.length > 1 ? `[${formatted.join("|")}]` : formatted[0];
      })
      .join(" ");
  }
  return record.heardPhonemes?.map(formatPhoneme).join(" ") || "-";
}

function formatReferences(record: ErrorLogRecord): string {
  if (record.ipaReferenceCounts === undefined) return "-";
  const entries = Object.entries(record.ipaReferenceCounts)
    .filter(([, count]) => count > 0)
    .sort(([a], [b]) => a.localeCompare(b));
  return entries.length === 0
    ? "なし"
    : entries.map(([phoneme, count]) => `/${phoneme}/×${count}`).join(", ");
}

function notesFor(record: ErrorLogRecord, phase: "during_answer" | "after_judgement"): string | null {
  const notes = (record.transcriptionNotes ?? [])
    .filter((note) => note.phase === phase)
    .map((note) => note.text.replace(/\s*\n\s*/g, " / "));
  return notes.length > 0 ? notes.join(" / ") : null;
}

function periodLabel(records: IndexedRecord[]): string {
  if (records.length === 0) return "記録なし";
  const first = localDay(records[0].record.createdAt);
  const last = localDay(records[records.length - 1].record.createdAt);
  return first === last ? first : `${first}〜${last}`;
}

function sessionKey(record: ErrorLogRecord): string {
  return record.sessionId ?? `legacy:${localDay(record.createdAt)}`;
}

/**
 * Claude等へ渡すための、IPA転写クイズ生ログエクスポート。
 * 旧記録の取得不能な値は仕様どおり "-" で表す。
 */
export function buildPerceptionLogExport(
  records: ErrorLogRecord[],
  scope: "today" | "all",
  now = new Date()
): string {
  const all = transcriptionRecords(records).map((record, index) => ({
    record,
    number: index + 1,
  }));
  const today = localDay(now.toISOString());
  const selected = scope === "today"
    ? all.filter(({ record }) => localDay(record.createdAt) === today)
    : all;
  const lines = [`# 知覚ログ ${scope === "today" ? today : periodLabel(selected)}`];

  if (selected.length === 0) return `${lines[0]}\n`;

  const sessions = new Map<string, IndexedRecord[]>();
  for (const item of selected) {
    const key = sessionKey(item.record);
    const group = sessions.get(key) ?? [];
    group.push(item);
    sessions.set(key, group);
  }

  for (const group of sessions.values()) {
    const first = group[0].record;
    const last = group[group.length - 1].record;
    const gradeKnown = group.every((item) => item.record.transcriptionGrade !== undefined);
    const perfect = gradeKnown
      ? group.filter((item) => item.record.transcriptionGrade === "perfect").length
      : "-";
    lines.push("");
    lines.push(
      `## ${localTime(first.sessionStartedAt ?? first.createdAt)}-${localTime(last.createdAt)} | ${group.length}語 | 完全一致${perfect}`
    );

    for (const { record, number } of group) {
      lines.push("");
      lines.push(`${number}. ${record.word} | ${record.meaning} | ${record.wordAttemptNumber ?? "-"}`);
      lines.push(`正: /${record.correctPhonemes?.join(" ") ?? "-"}/`);
      lines.push(`答: /${formatAnswer(record)}/`);
      lines.push(`再生: 本音声${record.wordPlayCount ?? "-"}回 | 参照: ${formatReferences(record)}`);
      const during = notesFor(record, "during_answer");
      const after = notesFor(record, "after_judgement");
      if (during) lines.push(`メモ中: ${during}`);
      if (after) lines.push(`メモ後: ${after}`);
    }
  }

  return `${lines.join("\n").trimEnd()}\n`;
}
