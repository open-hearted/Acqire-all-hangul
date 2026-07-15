import { createHash, timingSafeEqual } from "node:crypto";
import type { TranscriptionSessionAnalysis } from "@/lib/acoustic-region";
import { analyzeTranscriptionWithAi } from "@/lib/ai/transcriptionAnalyzer";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_REQUEST_BYTES = 128_000;

function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function secretMatches(provided: string, expected: string): boolean {
  const providedHash = createHash("sha256").update(provided).digest();
  const expectedHash = createHash("sha256").update(expected).digest();
  return timingSafeEqual(providedHash, expectedHash);
}

function isValidAnalysis(value: unknown): value is TranscriptionSessionAnalysis {
  if (!value || typeof value !== "object") return false;
  const analysis = value as Partial<TranscriptionSessionAnalysis>;
  return (
    analysis.schemaVersion === 1 &&
    Number.isInteger(analysis.totalQuestions) &&
    (analysis.totalQuestions ?? 0) > 0 &&
    (analysis.totalQuestions ?? 0) <= 10_000 &&
    Array.isArray(analysis.patterns) &&
    analysis.patterns.length <= 40
  );
}

export async function POST(request: Request): Promise<Response> {
  const expectedPassword = process.env.AI_ACCESS_PASSWORD;
  if (!expectedPassword || !process.env.OPENAI_API_KEY) {
    return json({ error: "AI機能のサーバー設定が完了していません" }, 503);
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_REQUEST_BYTES) {
    return json({ error: "送信データが大きすぎます" }, 413);
  }

  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > MAX_REQUEST_BYTES) {
    return json({ error: "送信データが大きすぎます" }, 413);
  }

  let body: { password?: unknown; analysis?: unknown };
  try {
    body = JSON.parse(raw) as { password?: unknown; analysis?: unknown };
  } catch {
    return json({ error: "送信データが正しくありません" }, 400);
  }

  if (
    typeof body.password !== "string" ||
    !secretMatches(body.password, expectedPassword)
  ) {
    return json({ error: "アクセスパスワードが違います" }, 401);
  }
  if (!isValidAnalysis(body.analysis)) {
    return json({ error: "分析データが正しくありません" }, 400);
  }

  try {
    const result = await analyzeTranscriptionWithAi(body.analysis);
    return json(result);
  } catch (error) {
    console.error("AI transcription analysis failed", error);
    return json({ error: "AI分析に失敗しました。しばらくしてから再試行してください" }, 502);
  }
}
