import type { TranscriptionSessionAnalysis } from "@/lib/acoustic-region";

export interface AiAnalysisResult {
  text: string;
  model: string;
}

interface OpenAiContentPart {
  type?: string;
  text?: string;
}

interface OpenAiOutputItem {
  type?: string;
  content?: OpenAiContentPart[];
}

interface OpenAiResponse {
  output_text?: string;
  output?: OpenAiOutputItem[];
  error?: { message?: string } | null;
}

const INSTRUCTIONS = `あなたは韓国語の音韻知覚を支援する日本語の学習コーチです。
入力はIPA転写クイズをアプリ側で決定的に集計したJSONです。

次の規則を守ってください。
- 正解音素 expected と学習者の入力 heard の向きを取り違えない。
- 音声そのものは提供されていないため、発音能力を断定せず「聴取・転写上の傾向」と表現する。
- 件数の多い傾向を優先し、データが少ない場合は断定を避ける。
- 完全一致、配置一致、配置不一致、置換、脱落、挿入、未特定(category)を区別する。
- 回答は日本語で「全体傾向」「優先して練習する音」「具体的な練習方法」「次回の確認項目」の順に簡潔にまとめる。
- 代表例を示す場合は、正解IPAと入力IPAを併記する。
- JSONにない事実や診断を作らない。`;

function extractOutputText(response: OpenAiResponse): string {
  if (response.output_text?.trim()) return response.output_text.trim();
  return (response.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((part) => part.type === "output_text" && part.text)
    .map((part) => part.text?.trim() ?? "")
    .filter(Boolean)
    .join("\n\n");
}

async function analyzeWithOpenAi(
  analysis: TranscriptionSessionAnalysis
): Promise<AiAnalysisResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY が設定されていません");

  const model = process.env.OPENAI_MODEL || "gpt-5.4-mini";
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      reasoning: { effort: "none" },
      instructions: INSTRUCTIONS,
      input: `以下の集計結果を分析してください。\n${JSON.stringify(analysis)}`,
      max_output_tokens: 1600,
      store: false,
    }),
  });

  const data = (await response.json().catch(() => ({}))) as OpenAiResponse;
  if (!response.ok) {
    throw new Error(data.error?.message || `OpenAI API error (${response.status})`);
  }
  const text = extractOutputText(data);
  if (!text) throw new Error("OpenAIから分析文を取得できませんでした");
  return { text, model };
}

/** 将来は AI_PROVIDER の分岐に Gemini 等の実装を追加する。 */
export async function analyzeTranscriptionWithAi(
  analysis: TranscriptionSessionAnalysis
): Promise<AiAnalysisResult> {
  const provider = process.env.AI_PROVIDER || "openai";
  if (provider !== "openai") {
    throw new Error(`未対応のAIプロバイダーです: ${provider}`);
  }
  return analyzeWithOpenAi(analysis);
}
