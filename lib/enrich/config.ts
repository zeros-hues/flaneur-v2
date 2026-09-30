import { EMBEDDING_DIMENSIONS } from "@/db/schema/columns";

export const EMBEDDING_MODEL_ID = "gemini-embedding-001";
/** Stored on every embedded row; includes the dimension so a size change is detectable too. */
export const EMBEDDING_MODEL = `${EMBEDDING_MODEL_ID}@${EMBEDDING_DIMENSIONS}`;

// Groq chat model, pinned by exact name: an alias would change outputs under an unchanged prompt version.
export const LLM_MODEL = "openai/gpt-oss-120b";

/** Bump the vN when a prompt changes; rows with an older string are re-enriched. */
export const PROMPT_VERSIONS = {
  role: `role-v3+${LLM_MODEL}`,
  concepts: `concepts-v1+${LLM_MODEL}`,
  synthesis: `synthesis-v2+${LLM_MODEL}`,
  hashtag: "hashtag-v1",
} as const;

/** A new label with cosine similarity above this links to the existing concept. */
export const DEDUPE_THRESHOLD = 0.93;

/** Concept → topic promotion: share of all artifacts, gated so small corpora don't promote everything. */
export const TOPIC_SHARE = 0.15;
export const TOPIC_MIN_CORPUS = 50;
export const TOPIC_MIN_ARTIFACTS = 5;
