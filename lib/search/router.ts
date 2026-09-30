// Step 1: turns a plain-language query into a routed query with one Groq call.
import { generateJson } from "@/lib/enrich/groq";
import { DOMAINS, MODES } from "@/lib/enrich/prompts";
import { normaliseRouted, routedQuery, type RoutedQuery } from "./types";

const nullable = (type: string) => ({ type: [type, "null"] });

// Strict structured output requires every property; absent filters come back as null.
const routeSchema = {
  type: "object",
  properties: {
    kind: { type: "string", enum: ["semantic", "structural", "hybrid"] },
    semantic_text: nullable("string"),
    filters: {
      type: "object",
      properties: {
        domain_from: nullable("string"),
        domain_to: nullable("string"),
        domain_any: { type: ["array", "null"], items: { type: "string" } },
        mode: { type: ["array", "null"], items: { type: "string", enum: [...MODES] } },
        active_before: nullable("string"),
        active_after: nullable("string"),
      },
      required: ["domain_from", "domain_to", "domain_any", "mode", "active_before", "active_after"],
      additionalProperties: false,
    },
    interpretation: { type: "string" },
  },
  required: ["kind", "semantic_text", "filters", "interpretation"],
  additionalProperties: false,
};

const routePrompt = (query: string, today: string) => `You route searches over a personal network of people.
Each person has a work history of roles. Each role is classified with:
- domain: one of ${DOMAINS.join(", ")}, or "other:<label>" (e.g. "other:law", "other:education")
- mode: one of ${MODES.join(", ")} (ic = individual contributor, lead = manages a team,
  founder, academic = student or researcher, advisory = advisor or board member)
- start and end dates
Each person also has a short written summary and topics from their posts, searchable by meaning.

Convert the query into JSON:
kind: "structural" if it is only about role domains, modes or dates; "semantic" if it is only
  about what people work on, think about or post about; "hybrid" if it has both parts.
semantic_text: for semantic or hybrid, a descriptive phrase of the subject matter to match
  against summaries (e.g. "haptics and tactile feedback in surgical devices"). Otherwise null.
filters (null for anything the query does not ask for):
  domain_from, domain_to: a career move from one domain into another ("mechanical engineers
    who moved into ML" -> domain_from "mechanical", domain_to "ml"). Either may be null when
    only one side is named.
  domain_any: people who have worked in any of these domains.
  mode: role modes the query asks for ("founders" -> ["founder"]).
  active_after: YYYY-MM-DD; the role was ongoing on or after this date.
  active_before: YYYY-MM-DD; the role had started before this date.
  Today is ${today}; resolve relative dates ("last 3 years") against it.
  Use only the listed domain values or "other:<label>". Do not invent filters the query does not ask for.
interpretation: one plain sentence restating how you understood the query, naming each
  filter you applied, so the user can spot a misreading.

Query: """${query}"""`;

/** Returns null when the query cannot be interpreted (call failed, invalid output, or nothing usable). */
export async function routeQuery(query: string): Promise<RoutedQuery | null> {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const raw = await generateJson(routePrompt(query, today), routeSchema, routedQuery);
    return normaliseRouted(raw);
  } catch (error) {
    console.error("[search] routing failed", error);
    return null;
  }
}
