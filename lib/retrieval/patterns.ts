/**
 * Deterministic Pattern Discovery Engine for Milestone C.
 *
 * Governing Principle:
 * PATTERN -> SUPPORTING PEOPLE -> SUPPORTING FACTS / SIGNALS
 * Never LLM intuition or arbitrary ungrounded synthesis.
 */

import { qualifyPatternRole, relevantPatternNote } from "./pattern-support";
import { PATTERN_CONFIG } from "./pattern-config";
import type {
  DiscoveredPattern,
  PatternDiscoveryInput,
  PatternInputPerson,
  PatternSupportItem,
} from "./pattern-types";

const NORMALIZE = (s: string) => s.normalize("NFKC").toLowerCase().trim();

function deduplicateSignals(signals: PatternSupportItem[]): PatternSupportItem[] {
  const seen = new Set<string>();
  const out: PatternSupportItem[] = [];
  for (const s of signals) {
    const key = `${s.supportKind}:${s.label}:${s.value.trim().toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(s);
    }
  }
  return out;
}

interface CandidateCluster {
  id: string;
  patternType: DiscoveredPattern["patternType"];
  headline: string;
  observationCopy: string;
  dimensionKey: string;
  dimensionValue: string;
  peopleMap: Map<string, { person: PatternInputPerson; signals: PatternSupportItem[] }>;
  specificityScore: number;
}

export function discoverPatterns(input: PatternDiscoveryInput): DiscoveredPattern[] {
  const { people, totalPopulation } = input;
  if (!people.length || totalPopulation < PATTERN_CONFIG.MIN_SUPPORT_PEOPLE) {
    return [];
  }

  const clusters: CandidateCluster[] = [];

  // =========================================================================
  // 1. Structured Role Domain Patterns (from public.role.domain)
  // =========================================================================
  const domainPeople = new Map<string, Set<string>>();
  for (const person of people) {
    for (const role of person.roles) {
      if (role.domain && qualifyPatternRole(role)) {
        const domain = role.domain.trim();
        if (!domainPeople.has(domain)) {
          domainPeople.set(domain, new Set());
        }
        domainPeople.get(domain)!.add(person.id);
      }
    }
  }

  for (const [domain, personIds] of domainPeople.entries()) {
    if (personIds.size >= PATTERN_CONFIG.MIN_SUPPORT_PEOPLE) {
      const copy = PATTERN_CONFIG.DOMAIN_COPY[domain] ?? {
        headline: `Focus on ${domain} roles`,
        observationCopy: `A number of people you saved work in ${domain}.`,
      };

      const peopleMap = new Map<string, { person: PatternInputPerson; signals: PatternSupportItem[] }>();

      for (const personId of personIds) {
        const person = people.find((p) => p.id === personId);
        if (!person) continue;

        const signals: PatternSupportItem[] = [];
        // Attach structured role facts
        for (const role of person.roles) {
          const qualification = qualifyPatternRole(role);
          if (role.domain?.trim() === domain && qualification) {
            const orgText = role.organisationName ? ` @ ${role.organisationName}` : "";
            signals.push({
              personId: person.id,
              personName: person.name,
              supportKind: "structured_fact",
              label: "Role",
              value: `${role.title}${orgText}`,
              detail: qualification.detail,
              provenance: { roleId: role.id, storedDomain: role.domain, classificationConfidence: role.classificationConfidence, classificationProvenance: role.classificationProvenance, legacyStatus: role.legacyStatus ?? "legacy_unverified", qualificationBasis: qualification.basis },
            });
          }
        }

        // Attach owner-authored notes if any mention the domain context
        for (const note of person.notes.filter(note => relevantPatternNote(domain, note.body))) {
          signals.push({
            personId: person.id,
            personName: person.name,
            supportKind: "owner_authored_note",
            label: "Your note",
            value: note.body,
          });
        }

        peopleMap.set(person.id, { person, signals: deduplicateSignals(signals) });
      }

      const specificityScore =
        PATTERN_CONFIG.DOMAIN_SPECIFICITY[domain] ?? PATTERN_CONFIG.DEFAULT_DOMAIN_SPECIFICITY;

      clusters.push({
        id: `pattern:role_domain:${domain}`,
        patternType: "role_domain",
        headline: copy.headline,
        observationCopy: copy.observationCopy,
        dimensionKey: "role_domain",
        dimensionValue: domain,
        peopleMap,
        specificityScore,
      });
    }
  }

  // =========================================================================
  // 2. Structured Organisation / Community Patterns
  // =========================================================================
  const orgPeople = new Map<string, { orgName: string; personIds: Set<string> }>();
  for (const person of people) {
    for (const role of person.roles) {
      if (role.organisationName && role.organisationName.trim()) {
        const key = NORMALIZE(role.organisationName);
        if (!orgPeople.has(key)) {
          orgPeople.set(key, { orgName: role.organisationName.trim(), personIds: new Set() });
        }
        orgPeople.get(key)!.personIds.add(person.id);
      }
    }
  }

  for (const [, { orgName, personIds }] of orgPeople.entries()) {
    if (personIds.size >= PATTERN_CONFIG.MIN_SUPPORT_PEOPLE) {
      const peopleMap = new Map<string, { person: PatternInputPerson; signals: PatternSupportItem[] }>();

      for (const personId of personIds) {
        const person = people.find((p) => p.id === personId);
        if (!person) continue;

        const signals: PatternSupportItem[] = [];
        for (const role of person.roles) {
          if (role.organisationName && NORMALIZE(role.organisationName) === NORMALIZE(orgName)) {
            signals.push({
              personId: person.id,
              personName: person.name,
              supportKind: "structured_fact",
              label: "Organisation",
              value: `${role.title} @ ${role.organisationName}`,
            });
          }
        }
        peopleMap.set(person.id, { person, signals: deduplicateSignals(signals) });
      }

      clusters.push({
        id: `pattern:organisation:${NORMALIZE(orgName)}`,
        patternType: "organisation_community",
        headline: `Shared connection to ${orgName}`,
        observationCopy: `${orgName} recurs across multiple people in your saved trail.`,
        dimensionKey: "organisation",
        dimensionValue: orgName,
        peopleMap,
        specificityScore: 0.9,
      });
    }
  }

  // =========================================================================
  // 3. User Attention Themes (from Owner Notes)
  // =========================================================================
  // Attention themes describe what caught the USER'S attention across people.
  const themeDefinitions = [
    {
      key: "awards_recognition" as const,
      regex: /\b(?:awwwards?|sotd|awards?|jury)\b/i,
      copy: PATTERN_CONFIG.ATTENTION_COPY.awards_recognition ?? {
        headline: "Industry recognition and design awards",
        observationCopy: "You repeatedly noted industry recognition (Awwwards, SOTD) when noticing people.",
      },
      specificity: PATTERN_CONFIG.ATTENTION_THEME_SPECIFICITY.awards_recognition ?? 0.85,
    },
    {
      key: "distinctive_portfolio" as const,
      regex: /\b(?:portfolios?)\b/i,
      copy: PATTERN_CONFIG.ATTENTION_COPY.distinctive_portfolio ?? {
        headline: "Distinctive portfolios and personal sites",
        observationCopy: "You repeatedly noted distinctive portfolios and personal sites when saving people.",
      },
      specificity: PATTERN_CONFIG.ATTENTION_THEME_SPECIFICITY.distinctive_portfolio ?? 0.80,
    },
    {
      key: "branding" as const,
      regex: /\b(?:brand|branding|brand\s+identity)\b/i,
      copy: PATTERN_CONFIG.ATTENTION_COPY.branding ?? {
        headline: "Brand identity and studio practice",
        observationCopy: "You repeatedly noted branding and studio practice in your notes.",
      },
      specificity: PATTERN_CONFIG.ATTENTION_THEME_SPECIFICITY.branding ?? 0.75,
    },
  ];

  for (const theme of themeDefinitions) {
    const peopleMap = new Map<string, { person: PatternInputPerson; signals: PatternSupportItem[] }>();

    for (const person of people) {
      const matchingNotes = person.notes.filter((n) => theme.regex.test(n.body));
      if (matchingNotes.length > 0) {
        const signals: PatternSupportItem[] = matchingNotes.map((n) => ({
          personId: person.id,
          personName: person.name,
          supportKind: "owner_authored_note",
          label: "Your note",
          value: n.body,
        }));

        peopleMap.set(person.id, { person, signals: deduplicateSignals(signals) });
      }
    }

    if (peopleMap.size >= PATTERN_CONFIG.MIN_SUPPORT_PEOPLE) {
      clusters.push({
        id: `pattern:user_attention:${theme.key}`,
        patternType: "user_attention_theme",
        headline: theme.copy.headline,
        observationCopy: theme.copy.observationCopy,
        dimensionKey: "user_attention_theme",
        dimensionValue: theme.key,
        peopleMap,
        specificityScore: theme.specificity,
      });
    }
  }

  // =========================================================================
  // 4. Reviewed Person-Level Concepts (Owner Reviewed Only)
  // =========================================================================
  const conceptPeople = new Map<string, { label: string; personIds: Set<string> }>();
  for (const person of people) {
    for (const c of person.reviewedConcepts ?? []) {
      if (!conceptPeople.has(c.conceptId)) {
        conceptPeople.set(c.conceptId, { label: c.conceptLabel, personIds: new Set() });
      }
      conceptPeople.get(c.conceptId)!.personIds.add(person.id);
    }
  }

  for (const [conceptId, { label, personIds }] of conceptPeople.entries()) {
    if (personIds.size >= PATTERN_CONFIG.MIN_SUPPORT_PEOPLE) {
      const peopleMap = new Map<string, { person: PatternInputPerson; signals: PatternSupportItem[] }>();

      for (const personId of personIds) {
        const person = people.find((p) => p.id === personId);
        if (!person) continue;

        peopleMap.set(person.id, {
          person,
          signals: [
            {
              personId: person.id,
              personName: person.name,
              supportKind: "concept_relationship",
              label: "Reviewed Concept",
              value: label,
              detail: person.reviewedConcepts?.find(concept => concept.conceptId === conceptId)?.reason,
              provenance: { observationId: person.reviewedConcepts?.find(concept => concept.conceptId === conceptId)?.observationId,
                relationshipId: person.reviewedConcepts?.find(concept => concept.conceptId === conceptId)?.relationshipId,
                supportStatus: 'owner_reviewed_interpretation' },
            },
          ],
        });
      }

      clusters.push({
        id: `pattern:reviewed_concept:${conceptId}`,
        patternType: "reviewed_concept",
        headline: `Associated with ${label}`,
        observationCopy: `Multiple people you saved share a reviewed association with ${label}.`,
        dimensionKey: "reviewed_concept",
        dimensionValue: label,
        peopleMap,
        specificityScore: 0.85,
      });
    }
  }

  // =========================================================================
  // 5. Score, Filter, and Sort Discovered Patterns
  // =========================================================================
  const results: DiscoveredPattern[] = [];

  for (const cluster of clusters) {
    const supportingPeopleCount = cluster.peopleMap.size;
    if (supportingPeopleCount < PATTERN_CONFIG.MIN_SUPPORT_PEOPLE) continue;

    // Calculate corroboration bonus if people have owner notes
    let notesCount = 0;
    for (const { signals } of cluster.peopleMap.values()) {
      if (signals.some(signal => signal.supportKind === "owner_authored_note")) notesCount++;
    }
    const noteBonus =
      notesCount >= 2 ? PATTERN_CONFIG.NOTE_CORROBORATION_WEIGHT : 0;

    // Composite score combines support volume, specificity, and corroboration
    const supportRatio = supportingPeopleCount / totalPopulation;
    const compositeScore = supportRatio * cluster.specificityScore + noteBonus;

    const supportingPeople = Array.from(cluster.peopleMap.values()).map(
      ({ person, signals }) => ({
        personId: person.id,
        personName: person.name,
        headline: person.headline,
        signals,
      })
    );

    // Sort people alphabetically for determinism
    supportingPeople.sort((a, b) => a.personName.localeCompare(b.personName));

    results.push({
      id: cluster.id,
      patternType: cluster.patternType,
      headline: cluster.headline,
      observationCopy: cluster.observationCopy,
      dimensionKey: cluster.dimensionKey,
      dimensionValue: cluster.dimensionValue,
      supportingPeopleCount,
      totalPopulation,
      supportingPeople,
      specificityScore: cluster.specificityScore,
      compositeScore,
    });
  }

  // Sort patterns: highest compositeScore first, then highest supportingPeopleCount, then deterministic id
  results.sort(
    (a, b) =>
      b.compositeScore - a.compositeScore ||
      b.supportingPeopleCount - a.supportingPeopleCount ||
      a.id.localeCompare(b.id)
  );

  return results.slice(0, PATTERN_CONFIG.MAX_SURFACED_PATTERNS);
}
