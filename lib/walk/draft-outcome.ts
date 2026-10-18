export async function draftOutcome<T extends { draft: string }>(draft: Promise<T>, copy: Promise<void>) {
  const [result, copied] = await Promise.all([
    draft.then(value => value, () => null), copy.then(() => true, () => false),
  ]);
  if (!result) return { state: "draft_failed" as const };
  return { state: copied ? "copied" as const : "copy_failed" as const, result };
}
