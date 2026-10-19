import type { PatternInputRole } from './pattern-types';

// Witnesses for the four existing statements, not a title classification system.
// Stored domain only selects a statement to test. Unknown/ambiguous work abstains.
const witnesses: Record<string, RegExp> = {
  web: /\b(?:web\s*(?:design(?:er|ing)?|develop(?:er|ment)?|engineer(?:ing)?)|front[ -]?end\s+(?:web\s+)?(?:develop(?:er|ment)?|engineer(?:ing)?|lead))\b/i,
  'industrial-design': /\b(?:industrial\s+design(?:er|ing)?|furniture\s+design(?:er|ing)?|(?:design(?:ing)?|creating)\s+(?:bespoke\s+)?furniture|physical\s+product\s+design(?:er|ing)?)\b/i,
  'ui-ux': /\b(?:ui\s*\/\s*ux|ux|ui|user\s+experience|user\s+interface|interface\s+design|interaction\s+design)\b/i,
  creative: /\b(?:creative\s+director|creative\s+direction|(?:brand|branding|graphic|visual)\s+(?:&\s*brand\s+)?design(?:er|ing)?)\b/i,
};

export function relevantPatternNote(domain: string, body: string): boolean {
  return witnesses[domain]?.test(body) ?? false;
}

export function qualifyPatternRole(role: PatternInputRole): { detail: string; basis: 'title' | 'description' } | undefined {
  const witness = role.domain ? witnesses[role.domain.trim()] : undefined;
  if (!witness) return;
  if (witness.test(role.title)) return { detail: `Qualifying role title: ${role.title}`, basis: 'title' };
  // Management descriptions can discuss a craft without claiming its practice.
  if (/\b(?:product|program|support)\s+manager\b/i.test(role.title)) return;
  const sentences = role.description?.split(/(?<=[.!?])\s+|\n+/) ?? [];
  const sentence = sentences.find(text => /\b(?:creating|designing)\s+(?:bespoke\s+)?furniture\b/i.test(text) && witness.test(text))
    ?? sentences.find(text => witness.test(text));
  if (sentence) return { detail: sentence.trim(), basis: 'description' };
}
