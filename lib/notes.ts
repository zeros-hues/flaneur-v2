// The user's own notes about a person: written on the person page, edited in place.
import { eq } from "drizzle-orm";
import { z } from "zod";
import { note, person } from "@/db/schema";
import { db } from "@/lib/db";

export const noteBody = z.string().trim().min(1).max(10_000);

export interface NoteRow {
  id: string;
  body: string;
}

/** Returns null when the person does not exist. */
export async function createNote(personId: string, body: string): Promise<NoteRow | null> {
  const [p] = await db.select({ id: person.id }).from(person).where(eq(person.id, personId));
  if (!p) return null;
  const [row] = await db.insert(note).values({ personId, body }).returning({ id: note.id, body: note.body });
  return row ?? null;
}

/** Returns null when the note does not exist. */
export async function updateNote(id: string, body: string): Promise<NoteRow | null> {
  const [row] = await db.update(note).set({ body }).where(eq(note.id, id)).returning({ id: note.id, body: note.body });
  return row ?? null;
}
