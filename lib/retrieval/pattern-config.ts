/** Centralized configuration and weights for Milestone C Pattern Discovery. */

export const PATTERN_CONFIG = {
  /**
   * Conservative minimum support threshold: at least 3 independent People required.
   * A person counts only once regardless of roles, artifacts, notes, or links.
   */
  MIN_SUPPORT_PEOPLE: 3,

  /** Maximum number of surfaced patterns to return (bounded finite set). */
  MAX_SURFACED_PATTERNS: 3,

  /**
   * Specificity weights for role domains.
   * Penalizes broad umbrella categories (e.g. 'creative') in favor of specific disciplines.
   */
  DOMAIN_SPECIFICITY: {
    "industrial-design": 0.85,
    "web": 0.80,
    "ui-ux": 0.75,
    "ml": 0.70,
    "business": 0.60,
    "creative": 0.45, // Broad umbrella penalty
    "other:education": 0.50,
  } as Record<string, number>,

  DEFAULT_DOMAIN_SPECIFICITY: 0.55,

  /** Specificity weights for user attention themes (from notes). */
  ATTENTION_THEME_SPECIFICITY: {
    awards_recognition: 0.85,
    distinctive_portfolio: 0.80,
    branding: 0.75,
  } as Record<string, number>,

  /** Bonus added when user notes explicitly corroborate a structured domain pattern. */
  NOTE_CORROBORATION_WEIGHT: 0.15,

  /** Human-readable headline and observational copy templates. */
  DOMAIN_COPY: {
    web: {
      headline: "Creative web engineering and interaction craft",
      observationCopy: "Several people you saved work in creative web development and interaction-focused roles.",
    },
    "industrial-design": {
      headline: "Industrial design and physical product craft",
      observationCopy: "You tend to notice people working in industrial and product design.",
    },
    "ui-ux": {
      headline: "Product and interface design",
      observationCopy: "A number of the people you saved focus on product and interface design.",
    },
    creative: {
      headline: "Creative direction and visual systems",
      observationCopy: "Multiple people you saved work across creative direction and brand systems.",
    },
  } as Record<string, { headline: string; observationCopy: string }>,

  ATTENTION_COPY: {
    awards_recognition: {
      headline: "Industry recognition and design awards",
      observationCopy: "You repeatedly noted industry recognition (Awwwards, SOTD) when noticing people.",
    },
    distinctive_portfolio: {
      headline: "Distinctive portfolios and personal sites",
      observationCopy: "You repeatedly noted distinctive portfolios and personal sites when saving people.",
    },
    branding: {
      headline: "Brand identity and studio practice",
      observationCopy: "You repeatedly noted branding and studio practice in your notes.",
    },
  } as Record<string, { headline: string; observationCopy: string }>,
};
