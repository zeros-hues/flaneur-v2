// Minimal Gemini REST client for embeddings (server-only). The key travels in a header, never in the URL,
// so it cannot leak into logged request errors.
import { z } from "zod";
import { EMBEDDING_DIMENSIONS } from "@/db/schema/columns";
import { EMBEDDING_MODEL_ID } from "./config";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const EMBED_BATCH = 100;
const RETRIES = 3;

function apiKey(): string {
  const key = process.env.GEMINI_API_KEY?.trim().replace(/^"(.*)"$/, "$1");
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  return key;
}

async function post(path: string, body: unknown): Promise<unknown> {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(`${BASE}/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey() },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
    if (response.ok) return response.json();

    const detail = await response.text().catch(() => "");
    // A per-day quota will not recover within any backoff; retrying only burns time.
    const daily = /PerDay/.test(detail);
    const retryable = (response.status === 429 && !daily) || response.status >= 500;
    if (!retryable || attempt >= RETRIES) {
      const quota = /Quota exceeded for metric: [^\n"]*/.exec(detail)?.[0];
      throw new Error(`Gemini ${path} failed: HTTP ${response.status} ${quota ?? detail.slice(0, 300)}`);
    }
    await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
  }
}

export type EmbedTask = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY" | "SEMANTIC_SIMILARITY";

const embedResponse = z.object({
  embeddings: z.array(z.object({ values: z.array(z.number()).length(EMBEDDING_DIMENSIONS) })),
});

/** Embeds many texts, batched into as few calls as the API allows. Output order matches input. */
export async function embed(texts: string[], task: EmbedTask): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    const chunk = texts.slice(i, i + EMBED_BATCH);
    const json = await post(`${EMBEDDING_MODEL_ID}:batchEmbedContents`, {
      requests: chunk.map((text) => ({
        model: `models/${EMBEDDING_MODEL_ID}`,
        content: { parts: [{ text }] },
        taskType: task,
        outputDimensionality: EMBEDDING_DIMENSIONS,
      })),
    });
    const parsed = embedResponse.parse(json);
    if (parsed.embeddings.length !== chunk.length) throw new Error("embedding count mismatch");
    out.push(...parsed.embeddings.map((e) => e.values));
  }
  return out;
}

/** pgvector literal for a query parameter. */
export const toVectorLiteral = (v: number[]) => `[${v.join(",")}]`;
