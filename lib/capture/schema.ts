import { z } from "zod";

const LINKEDIN_URN = /^urn:li:[A-Za-z]+:\d+$/;

const linkedinUrl = z.url().refine((value) => {
  const host = new URL(value).hostname;
  return host === "linkedin.com" || host.endsWith(".linkedin.com");
}, "must be a linkedin.com URL");

export const captureBody = z.object({
  type: z.enum(["profile", "post"]),
  sourceUrl: linkedinUrl,
  html: z.string().min(1).max(10_000_000),
  note: z.string().trim().max(5_000).nullable(),
  urn: z.string().regex(LINKEDIN_URN).nullable(),
  extensionVersion: z.string().min(1).max(32),
});

export type CaptureBody = z.infer<typeof captureBody>;
