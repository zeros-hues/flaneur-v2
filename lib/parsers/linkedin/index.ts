// LinkedIn adapter. Disposable: every LinkedIn selector lives in this folder and nowhere else.
import type { PageKind, SourceAdapter } from "../types";
import { parsePost } from "./post";
import { parseProfile } from "./profile";
import { pathOf } from "./shared";

export const linkedinAdapter: SourceAdapter = {
  id: "linkedin",
  version: "linkedin@1",

  matches(url) {
    const host = new URL(url).hostname;
    return host === "linkedin.com" || host.endsWith(".linkedin.com");
  },

  classify(url, captureType): PageKind {
    if (captureType === "post") return { kind: "artifact" };
    const path = pathOf(url);
    if (/^\/in\/[^/]+\/$/.test(path)) return { kind: "profile", page: "main" };
    if (/^\/in\/[^/]+\/details\/experience\/$/.test(path)) return { kind: "profile", page: "experience" };
    return { kind: "unsupported", reason: `unsupported profile page ${path} (no sample HTML yet)` };
  },

  parseProfile(html, url) {
    const kind = linkedinAdapter.classify(url, "profile");
    if (kind.kind !== "profile") throw new Error(`not a supported profile page: ${url}`);
    return parseProfile(html, url, kind.page);
  },

  parseArtifact(html, url) {
    return parsePost(html, url);
  },
};
