// Step 2: the answer prompt, and parsing the citations the model appends.
import { formatMonth } from "@/lib/views/format";
import type { Retrieved } from "./retrieve";

// Long posts are cut so twelve documents stay well inside the context window.
const MAX_DOC_CHARS = 2000;

export const SYSTEM_PROMPT = `You are answering a question using only the documents provided.
Each document is labelled with its author and date.
Answer in 2-4 sentences, directly and plainly.
After your answer, list the sources you drew on as:
[Author name, approximate date]
If the documents do not contain enough information to answer,
say so plainly. Do not invent or infer beyond what is written.
Refer to people by their full name, not by gendered pronouns.
Do not guess someone's pronouns from their name.`;

/**
 * Numbered documents, each labelled with author, kind and approximate date. When one person
 * contributes several documents (a post and their synthesis, say), each is marked with the
 * others so the model knows they share an author.
 */
export function userMessage(question: string, docs: Retrieved[]): string {
  const byPerson = new Map<string, number[]>();
  docs.forEach((d, i) => byPerson.set(d.personId, [...(byPerson.get(d.personId) ?? []), i + 1]));

  const documents = docs.map((d, i) => {
    const kind = d.kind === "post" ? "post" : "profile summary";
    const others = (byPerson.get(d.personId) ?? []).filter((n) => n !== i + 1);
    const same = others.length ? ` (same person as document${others.length > 1 ? "s" : ""} ${others.join(", ")})` : "";
    const text = d.text.length > MAX_DOC_CHARS ? `${d.text.slice(0, MAX_DOC_CHARS)}…` : d.text;
    return `${i + 1}. ${d.personName}, ${formatMonth(d.capturedAt)} — ${kind}${same}\n"""\n${text.trim()}\n"""`;
  });

  return `Question: ${question}\nDocuments:\n${documents.join("\n\n")}`;
}

interface Citation {
  author: string;
  date: string;
}

const CITATION = /^\s*(?:[-*•]|\d+\.)?\s*\[([^\]]+?),\s*([^\]]+)\]\s*$/;
const SOURCES_HEADING = /^\s*\**\s*sources?\s*(?:drawn on)?\s*:?\s*\**\s*$/i;

/** Splits the model's reply into the answer and its trailing [Author, date] citation lines. */
export function splitCitations(reply: string): { answer: string; citations: Citation[] } {
  const lines = reply.trimEnd().split("\n");
  const citations: Citation[] = [];
  let end = lines.length;
  while (end > 0) {
    const line = lines[end - 1] ?? "";
    const match = CITATION.exec(line);
    if (match?.[1] && match[2]) citations.unshift({ author: match[1].trim(), date: match[2].trim() });
    else if (!line.trim() || SOURCES_HEADING.test(line)) {
      // Blank lines and a "Sources:" heading between answer and list are dropped too.
    } else break;
    end--;
  }
  return { answer: lines.slice(0, end).join("\n").trim(), citations };
}

const normalise = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
const tokens = (s: string) => normalise(s).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
// Kind words from the document labels that the model sometimes echoes into the author name.
const LABEL_WORDS = new Set(["post", "profile", "summary", "synthesis"]);

/** The model often shortens names ("Behera"): every cited name token must appear in the author's name. */
function sameAuthor(cited: string, name: string): boolean {
  const wanted = tokens(cited).filter((t) => !LABEL_WORDS.has(t));
  const have = new Set(tokens(name));
  return wanted.length > 0 && wanted.every((t) => have.has(t));
}

/**
 * The retrieved documents the model cited. A citation matches documents by author; when its
 * date also matches one of that author's documents, only those are kept.
 */
export function citedDocuments(docs: Retrieved[], citations: Citation[]): Retrieved[] {
  const cited = new Set<Retrieved>();
  for (const c of citations) {
    const byAuthor = docs.filter((d) => sameAuthor(c.author, d.personName));
    const byDate = byAuthor.filter((d) => normalise(formatMonth(d.capturedAt)) === normalise(c.date));
    for (const d of byDate.length ? byDate : byAuthor) cited.add(d);
  }
  return docs.filter((d) => cited.has(d));
}
