// "say hello": a short first message, drafted from the user's note and the person's synthesis.
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { generateText } from "@/lib/enrich/groq";

export interface HelloDraft {
  draft: string;
  profile_url: string;
}

const SYSTEM = `You draft a short, warm first message that the user will send to someone in their network on LinkedIn.
Write 2 or 3 sentences, under 60 words, plain text. No subject line, no sign-off, no emoji, no hashtags.
Open with the person's first name. Ground every detail in the note and summary you are given; never invent facts.
Write in the user's own voice, as "I", speaking to the person as "you".
Never use gendered pronouns (he, she, him, her, his, hers) for anyone. Use names, or "you".
Return only the message.`;

// A guessed pronoun is the one thing a draft must never contain.
const PRONOUN = /\b(he|she|him|her|his|hers|himself|herself)\b/i;

interface Row {
  name: string;
  synthesis: string | null;
  profile_url: string;
  note: string | null;
  post: string | null;
  [key: string]: unknown;
}

/** Null when the item has no person behind it (an organisation's post) or does not exist. */
export async function draftHello(artifactId: string): Promise<HelloDraft | null> {
  const [row] = await db.execute<Row>(sql`
    select p.name, p.synthesis, p.profile_url, a.body_text as post,
      coalesce(
        (select n.body from note n where n.artifact_id = a.id order by n.created_at desc limit 1),
        (select n.body from note n where n.person_id = p.id order by n.created_at desc limit 1)
      ) as note
    from artifact a join person p on p.id = a.person_id
    where a.id = ${artifactId}`);
  if (!row) return null;

  const context = [
    `Their name: ${row.name}`,
    row.note ? `The user's note about them: """${row.note}"""` : null,
    row.synthesis ? `A summary of who they are: """${row.synthesis}"""` : null,
    !row.note && row.post ? `A post of theirs the user saved: """${row.post.slice(0, 600)}"""` : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  let draft = await generateText(SYSTEM, context);
  if (PRONOUN.test(draft)) {
    draft = await generateText(`${SYSTEM}\nYour last draft used a gendered pronoun. Rewrite without any.`, context);
  }
  return { draft: draft.trim(), profile_url: row.profile_url };
}
