// One input, three readings: find people, answer from the corpus, or both, composed as blocks.
import { z } from "zod";
import { askCity } from "@/lib/ask";
import { generateJson } from "@/lib/enrich/groq";
import type { Block, QueryResponse } from "@/lib/query/blocks";
import { marginConcepts } from "@/lib/query/margin";
import { runSearch } from "./index";

export const QUERY_KINDS = ["people_lookup", "question", "mixed"] as const;
export type QueryKind = (typeof QUERY_KINDS)[number];

const classifySchema = {
  type: "object",
  properties: { kind: { type: "string", enum: [...QUERY_KINDS] } },
  required: ["kind"],
  additionalProperties: false,
};
const classification = z.object({ kind: z.enum(QUERY_KINDS) });

const classifyPrompt = (input: string) => `You classify what someone typed into the one search box of a
personal network: people, their work histories, profile summaries and the posts they wrote.

people_lookup: they want to find specific people, by who they are, what they have done or what
  they work on ("founders who moved from mechanical engineering into ML", "people working on haptics").
question: they want an answer drawn from what people have written, not a list of people
  ("what do people think about remote work?", "how are teams using LLMs for code review?").
mixed: they want to find people and also an answer about those people
  ("who works on climate tech and what are they worried about?").

Input: """${input}"""`;

async function classify(input: string): Promise<QueryKind> {
  const { kind } = await generateJson(classifyPrompt(input), classifySchema, classification);
  return kind;
}

/**
 * people_lookup -> [people, margin]; question -> [answer, margin]; mixed -> [answer, rule, people, margin].
 * A mixed query that finds only one half shows that half. With nothing to show: [empty].
 * Throws when a model or database call fails; the caller reports that as an API error.
 */
export async function runQuery(input: string): Promise<QueryResponse> {
  const kind = await classify(input);
  const [search, ask] = await Promise.all([
    kind === "question" ? null : runSearch({ query: input }),
    kind === "people_lookup" ? null : askCity(input),
  ]);
  const routed_json = search?.routed_json ?? null;

  // askCity returns a stock sentence when nothing was retrieved; that is an empty state, not an answer.
  const answer = ask && ask.retrieved_count > 0 ? ask : null;
  const people = search?.results.length ? search : null;
  if (!answer && !people) {
    // A question with nothing retrieved has no search reason of its own: the city is quiet on it.
    return { blocks: [{ type: "empty", reason: search?.empty_reason ?? "insufficient_data" }], routed_json };
  }

  const blocks: Block[] = [];
  if (answer) blocks.push({ type: "answer", text: answer.answer, sources: answer.sources, drawn_from: answer.retrieved_count });
  if (answer && people) blocks.push({ type: "rule" });
  if (people) blocks.push({ type: "people", items: people.results, coverage: people.coverage });

  const sources = answer?.sources ?? [];
  const items = await marginConcepts(
    [...(people?.results.map((p) => p.person_id) ?? []), ...sources.filter((s) => !s.artifact_id).map((s) => s.person_id)],
    sources.flatMap((s) => (s.artifact_id ? [s.artifact_id] : [])),
  );
  blocks.push({ type: "margin", items });
  return { blocks, routed_json };
}
