import { linkedinAdapter } from "./linkedin/index";
import type { SourceAdapter } from "./types";

export const ADAPTERS: readonly SourceAdapter[] = [linkedinAdapter];

export function adapterFor(url: string): SourceAdapter | null {
  return ADAPTERS.find((a) => a.matches(url)) ?? null;
}
