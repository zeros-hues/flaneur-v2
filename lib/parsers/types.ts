export type DatePrecision = "month" | "year" | "absent";

/** A parsed date. `raw` holds the source text when it could not be parsed, so validation can reject it. */
export interface ParsedDate {
  value: string | null; // YYYY-MM-DD; the day is always 01, the month is 01 only when precision is "month"
  precision: DatePrecision;
  invalidRaw: string | null;
}

export interface Section<T> {
  items: T[];
  complete: boolean;
  knownTotal: number | null;
}

export interface ParsedRole {
  title: string;
  companyName: string | null;
  companySlug: string | null;
  location: string | null;
  start: ParsedDate;
  end: ParsedDate;
  isCurrent: boolean;
  description: string | null;
}

export interface ParsedEducation {
  school: string;
  schoolSlug: string | null;
  degree: string | null;
  fieldOfStudy: string | null;
  start: ParsedDate;
  end: ParsedDate;
}

export interface ParsedTopcard {
  name: string;
  headline: string | null;
  location: string | null;
  photoUrl: string | null;
}

/** Sections absent from a snapshot are `undefined`, never empty, so merge leaves them alone. */
export interface ParsedProfile {
  profileUrl: string;
  page: ProfilePage;
  topcard: ParsedTopcard | null;
  about?: string | null;
  experience?: Section<ParsedRole>;
  education?: Section<ParsedEducation>;
  skills?: Section<string>;
  strategies: Record<string, string>;
}

export interface ParsedAuthor {
  kind: "person" | "organisation";
  name: string;
  url: string;
  slug: string;
  headline: string | null;
}

export interface ParsedArtifact {
  urn: string | null;
  sourceUrl: string;
  author: ParsedAuthor;
  bodyText: string | null;
  hashtags: string[];
  postType: "text" | "image" | "video" | "document" | "article";
  reactionCount: number | null;
  commentCount: number | null;
  strategies: Record<string, string>;
}

export type ProfilePage = "main" | "experience";

export type PageKind =
  | { kind: "profile"; page: ProfilePage }
  | { kind: "artifact" }
  | { kind: "unsupported"; reason: string };

export interface SourceAdapter {
  id: string;
  /** Bump when parsing output changes; a suspect flag only applies to the version that raised it. */
  version: string;
  matches(url: string): boolean;
  classify(url: string, captureType: "profile" | "post"): PageKind;
  parseProfile(html: string, url: string): ParsedProfile;
  parseArtifact(html: string, url: string): ParsedArtifact;
}
