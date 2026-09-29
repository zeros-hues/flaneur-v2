// Minimal Groq chat-completions client (OpenAI-compatible, server-only). Used for every LLM
// call in enrichment; embeddings stay on Gemini (see gemini.ts).
import { z } from "zod";
import { LLM_MODEL } from "./config";

const BASE = "https://api.groq.com/openai/v1";
const RETRIES = 3;
const MAX_RETRY_WAIT_MS = 30_000;

function apiKey(): string {
  const key = process.env.GROQ_API_KEY?.trim().replace(/^"(.*)"$/, "$1");
  if (!key) throw new Error("GROQ_API_KEY is not set");
  return key;
}

async function post(path: string, body: unknown): Promise<unknown> {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey()}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
    if (response.ok) return response.json();

    const detail = await response.text().catch(() => "");
    // A per-day limit will not recover within any backoff; retrying only burns time.
    const daily = /per day/i.test(detail);
    const retryable = (response.status === 429 && !daily) || response.status >= 500;
    if (!retryable || attempt >= RETRIES) {
      throw new Error(`Groq ${path} failed: HTTP ${response.status} ${detail.slice(0, 300)}`);
    }
    const retryAfter = Number(response.headers.get("retry-after"));
    const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt;
    await new Promise((r) => setTimeout(r, Math.min(wait, MAX_RETRY_WAIT_MS)));
  }
}

const chatResponse = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string().nullable() }) })).min(1),
});

/**
 * Structured JSON output at temperature 0. `responseSchema` is a JSON Schema enforced by Groq's
 * strict structured-output mode; `schema` validates what comes back, so a malformed reply
 * throws instead of being written.
 */
export async function generateJson<T>(prompt: string, responseSchema: object, schema: z.ZodType<T>): Promise<T> {
  const json = await post("/chat/completions", {
    model: LLM_MODEL,
    temperature: 0,
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_schema", json_schema: { name: "result", strict: true, schema: responseSchema } },
  });
  const content = chatResponse.parse(json).choices[0]?.message.content ?? "";
  return schema.parse(JSON.parse(content));
}
