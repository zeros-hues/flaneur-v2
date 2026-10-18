import { pgEnum } from "drizzle-orm/pg-core";

export const datePrecision = pgEnum("date_precision", ["month", "year", "absent"]);

export const roleMode = pgEnum("role_mode", ["ic", "lead", "founder", "academic", "advisory"]);

export const artifactType = pgEnum("artifact_type", ["post", "connection_request", "profile_page",
  "social_post", "article", "project", "portfolio_page", "personal_website"]);

export const artifactStatus = pgEnum("artifact_status", [
  "pending",
  "accepted",
  "messaged",
  "replied",
  "gone_quiet",
]);

export const captureType = pgEnum("capture_type", ["profile", "post"]);

export const conceptKind = pgEnum("concept_kind", ["concept", "topic"]);

export const conceptLinkSource = pgEnum("concept_link_source", ["hashtag", "inferred"]);

export const profileSection = pgEnum("profile_section", [
  "experience",
  "education",
  "skills",
  "about",
  "activity",
]);

export const scheduleAction = pgEnum("schedule_action", [
  "say_hello",
  "keep_walking",
  "street_closed",
  "just_passing",
]);
