import { z } from "zod";

// Each prompt pairs a JSON Schema (enforced by Groq strict structured output) with a zod schema
// (validates what is written). Changing any text here means bumping PROMPT_VERSIONS.

export const DOMAINS = [
  "mechanical",
  "industrial-design",
  "ui-ux",
  "ml",
  "clinical",
  "web",
  "hardware",
  "research",
  "business",
  "creative",
] as const;
export const MODES = ["ic", "lead", "founder", "academic", "advisory"] as const;

const domainValue = z
  .string()
  .trim()
  .toLowerCase()
  .refine((d) => (DOMAINS as readonly string[]).includes(d) || /^other:[a-z0-9][a-z0-9 &/+-]{0,39}$/.test(d), {
    message: "domain must be a listed value or other:<label>",
  });

const roleItem = z.object({
  roleId: z.string(),
  domain: domainValue,
  domain_confidence: z.number().min(0).max(1),
  mode: z.enum(MODES),
});
export type RoleResult = z.infer<typeof roleItem>;

// Strict structured output needs an object at the top level, so the array is wrapped in { roles }.
export const roleResult = z.object({ roles: z.array(roleItem) });

/** roleId is constrained to the ids sent, so the model cannot invent or mangle one. */
export const roleSchema = (roleIds: string[]) => ({
  type: "object",
  properties: {
    roles: {
      type: "array",
      items: {
        type: "object",
        properties: {
          roleId: { type: "string", enum: roleIds },
          domain: { type: "string" },
          domain_confidence: { type: "number" },
          mode: { type: "string", enum: [...MODES] },
        },
        required: ["roleId", "domain", "domain_confidence", "mode"],
        additionalProperties: false,
      },
    },
  },
  required: ["roles"],
  additionalProperties: false,
});

export interface RoleInput {
  id: string;
  title: string;
  company: string | null;
  description: string | null;
}

export const rolePrompt = (roles: RoleInput[]) => `Classify each of the job roles below, all held by one person.
Judge each role on its own: read its title, company and description together; no single field decides.

For every role return one object with:
roleId: the role's id exactly as given.
domain: the field of work. Exactly one of: ${DOMAINS.join(", ")}.
If none fits, use "other:<label>" with a short lowercase label, e.g. "other:law".
domain_confidence: 0 to 1, how sure you are of the domain. Be honest; vague roles get low values.
mode: how the person works in this role. Exactly one of:
- ic: individual contributor doing the work
- lead: manages or leads a team or function
- founder: founded or co-founded the organisation
- academic: student, researcher, lecturer or professor at a university or lab
- advisory: advisor, board member, mentor, investor

Return JSON: { "roles": [ ...one object per role... ] }

${roles
  .map(
    (r) => `Role id: ${r.id}
Title: ${r.title}
Company: ${r.company ?? "(unknown)"}
Description: ${r.description?.trim() || "(none)"}`,
  )
  .join("\n\n")}`;

export const conceptResult = z.object({
  concepts: z.array(z.string().trim().min(2).max(80)).max(3),
});

export const conceptSchema = {
  type: "object",
  properties: { concepts: { type: "array", items: { type: "string" } } },
  required: ["concepts"],
  additionalProperties: false,
};

export const conceptPrompt = (body: string) => `Extract the specific ideas this LinkedIn post is about.

Return 1 to 3 concepts as JSON: { "concepts": [...] }. Each is a short lowercase noun phrase naming something specific enough
that two people interested in it would have something to talk about.
Good: "tactile feedback for surgical tools". Bad: "technology".
Bad: generic themes (innovation, leadership, career, AI, growth, teamwork), company names, people's names.
If the post is not about anything specific (greetings, job announcements, congratulations, reposts
without comment), return an empty array.

Post:
"""
${body}
"""`;

export const synthesisResult = z.object({ synthesis: z.string().trim().min(20).max(800) });

export const synthesisSchema = {
  type: "object",
  properties: { synthesis: { type: "string" } },
  required: ["synthesis"],
  additionalProperties: false,
};

export interface SynthesisInput {
  name: string;
  headline: string | null;
  about: string | null;
  roles: string[];
  posts: string[];
}

export const synthesisPrompt = (p: SynthesisInput) => `Write 2 to 3 plain sentences describing what this person works on and cares about,
for someone deciding whether they share interests. Use only the material below; do not invent facts.
Be concrete: name the problems, domains and kinds of work. No praise, no adjectives like "passionate".
Write in the third person. Refer to the person by their name, never with gendered pronouns
(she, her, he, him, his); if the name is unavailable, use "they/them". Return JSON: { "synthesis": "..." }.

Name: ${p.name}
Headline: ${p.headline ?? "(none)"}
About:
"""
${p.about?.trim() || "(none)"}
"""
Roles (most recent first):
${p.roles.length ? p.roles.map((r) => `- ${r}`).join("\n") : "(none)"}
Recent posts:
${p.posts.length ? p.posts.map((b) => `"""\n${b}\n"""`).join("\n") : "(none)"}`;
