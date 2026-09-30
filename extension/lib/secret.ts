// The capture secret is entered once on the options page and kept in local extension storage,
// never bundled: the built extension is served publicly.
const KEY = "captureSecret";

export async function readSecret(): Promise<string | null> {
  const stored: Record<string, unknown> = await chrome.storage.local.get(KEY);
  const value = stored[KEY];
  return typeof value === "string" && value ? value : null;
}

export async function writeSecret(secret: string): Promise<void> {
  await chrome.storage.local.set({ [KEY]: secret });
}
