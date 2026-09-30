// One input, three readings: find people, answer from the corpus, or both.
import { z } from "zod";
import { askCity, type AskSource } from "@/lib/ask";
import { corpusSize } from "@/lib/ask/retrieve";
import { generateJson } from "@/lib/enrich/groq";
import { runSearch } from "./index";
import type { Coverage, EmptyReason, RoutedQuery, SearchHit } from "./types";

export const QUERY_KINDS = ["people_lookup", "question", "mixed"] as const;
export type QueryKind = (typeof QUERY_KINDS)[number];

export interface UnifiedResult {
  kind: QueryKind;
  answer: string | null;
  sources: AskSource[] | null;
  people: SearchHit[] | null;
  coverage: Coverage | null;
  corpus_size: number;
  /** The search's routing, for saving it; null when no search ran or the input could not be routed. */
  routed_json: RoutedQuery | null;
  /** Set only when there is neither an answer nor any people to show. */
  empty_reason: EmptyReason | null;
}

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

/** Throws when a model or database call fails; the caller reports that as an API error. */
export async function runQuery(input: string): Promise<UnifiedResult> {
  const kind = await classify(input);
  const [search, ask, corpus] = await Promise.all([
    kind === "question" ? null : runSearch({ query: input }),
    kind === "people_lookup" ? null : askCity(input),
    kind === "people_lookup" ? corpusSize() : null,
  ]);

  // askCity returns a stock sentence when nothing was retrieved; that is an empty state, not an answer.
  const answer = ask && ask.retrieved_count > 0 ? ask.answer : null;
  const people = search ? search.results : null;
  const empty = !answer && !people?.length;

  return {
    kind,
    answer,
    sources: ask ? (answer ? ask.sources : []) : null,
    people,
    coverage: search ? search.coverage : null,
    corpus_size: ask ? ask.corpus_size : (corpus ?? 0),
    routed_json: search ? search.routed_json : null,
    // A question with nothing retrieved has no search reason of its own: the city is quiet on it.
    empty_reason: empty ? (search?.empty_reason ?? "insufficient_data") : null,
  };
}
