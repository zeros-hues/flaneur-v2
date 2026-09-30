// "Ask your city": answers a question from what captured people actually wrote.
import { generateText } from "@/lib/enrich/groq";
import { citedDocuments, splitCitations, SYSTEM_PROMPT, userMessage } from "./prompt";
import { corpusSize, retrieve, type Retrieved } from "./retrieve";

export const EMPTY_ANSWER = "Nothing in your city speaks to this yet.";
const SNIPPET_CHARS = 120;

export interface AskSource {
  person_name: string;
  artifact_id: string | null;
  person_id: string;
  snippet: string;
  captured_at: string;
}

export interface AskResult {
  answer: string;
  sources: AskSource[];
  retrieved_count: number;
  corpus_size: number;
}

const toSource = (d: Retrieved): AskSource => ({
  person_name: d.personName,
  artifact_id: d.artifactId,
  person_id: d.personId,
  snippet: d.text.replace(/\s+/g, " ").trim().slice(0, SNIPPET_CHARS),
  captured_at: d.capturedAt.toISOString(),
});

export async function askCity(question: string): Promise<AskResult> {
  const [docs, corpus] = await Promise.all([retrieve(question), corpusSize()]);
  if (!docs.length) return { answer: EMPTY_ANSWER, sources: [], retrieved_count: 0, corpus_size: corpus };

  const reply = await generateText(SYSTEM_PROMPT, userMessage(question, docs));
  const { answer, citations } = splitCitations(reply);
  const cited = citedDocuments(docs, citations);

  return {
    answer: answer || reply,
    // Only what the model drew on; if its citations can't be matched, everything retrieved.
    sources: (cited.length ? cited : docs).map(toSource),
    retrieved_count: docs.length,
    corpus_size: corpus,
  };
}
