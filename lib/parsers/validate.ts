import type { ParsedArtifact, ParsedDate, ParsedProfile } from "./types";

export interface ValidationFailure {
  reason: string;
  details: Record<string, unknown>;
}

const MAX_ROLES = 60;

// UI strings that show up where a name should be when a page is logged out, private or half-rendered.
const NAME_DENYLIST = new Set(
  [
    "linkedin member",
    "linkedin",
    "sign in",
    "join now",
    "log in",
    "feed post",
    "show all",
    "see more",
    "message",
    "connect",
    "follow",
    "more",
  ].map((s) => s.toLowerCase()),
);

const PROFILE_URL = /^https:\/\/www\.linkedin\.com\/in\/[^/?#\s]+\/$/;
const ENTITY_URL = /^https:\/\/www\.linkedin\.com\/(in|company|showcase)\/[^/?#\s]+\/$/;
const URN = /^urn:li:[A-Za-z]+:\d+$/;

function badName(name: string | null | undefined): string | null {
  const trimmed = name?.trim() ?? "";
  if (trimmed === "") return "name missing";
  if (NAME_DENYLIST.has(trimmed.toLowerCase())) return `name is a UI string: "${trimmed}"`;
  return null;
}

const dateOk = (d: ParsedDate) => d.invalidRaw === null && (d.precision === "absent") === (d.value === null);

export function validateProfile(
  profile: ParsedProfile,
  ctx: { personExists: boolean },
): ValidationFailure | null {
  if (!PROFILE_URL.test(profile.profileUrl)) {
    return { reason: "malformed profile_url", details: { profileUrl: profile.profileUrl } };
  }

  if (profile.page === "main") {
    const problem = badName(profile.topcard?.name);
    if (problem) return { reason: problem, details: { name: profile.topcard?.name ?? null } };
  } else if (!ctx.personExists) {
    // Details pages carry no name, so they can only enrich someone already captured.
    return {
      reason: "details page for a person not captured yet; capture the main profile first",
      details: { profileUrl: profile.profileUrl, page: profile.page },
    };
  }

  const roles = profile.experience?.items ?? [];
  if (roles.length > MAX_ROLES) {
    return { reason: `role count ${roles.length} exceeds ${MAX_ROLES}`, details: { count: roles.length } };
  }

  const dated = [
    ...roles.map((r, index) => ({ section: "experience", index, label: r.title, start: r.start, end: r.end })),
    ...(profile.education?.items ?? []).map((e, index) => ({ section: "education", index, label: e.school, start: e.start, end: e.end })),
  ];
  const badDates = dated.filter((d) => !dateOk(d.start) || !dateOk(d.end));
  if (badDates.length > 0) {
    return {
      reason: "unparseable dates",
      details: {
        entries: badDates.map((d) => ({ ...d, start: d.start.invalidRaw, end: d.end.invalidRaw })),
      },
    };
  }

  return null;
}

export function validateArtifact(artifact: ParsedArtifact): ValidationFailure | null {
  const problem = badName(artifact.author.name);
  if (problem) return { reason: `author ${problem}`, details: { name: artifact.author.name } };
  if (!ENTITY_URL.test(artifact.author.url)) {
    return { reason: "malformed author url", details: { url: artifact.author.url } };
  }
  if (artifact.urn !== null && !URN.test(artifact.urn)) {
    return { reason: "malformed urn", details: { urn: artifact.urn } };
  }
  return null;
}
