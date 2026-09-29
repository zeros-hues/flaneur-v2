// Enrichment entry points. Both are safe to re-run: stale checks use the stored prompt
// version, and concept edges are updated by diff so nothing is double-counted.
import { artifactById, artifactsOfPerson, enrichArtifacts } from "./concepts";
import { recountAndPromote } from "./edges";
import { classifyRoles } from "./roles";
import { synthesisePerson } from "./synthesis";

export interface EnrichOptions {
  /** Redo rows already enriched with the current prompt version. */
  force?: boolean;
}

export interface EnrichSummary {
  roles: number;
  artifacts: number;
  synthesis: boolean;
  promoted: string[];
}

async function step<T>(name: string, id: string, fallback: T, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    console.error(`[enrich] ${name} for ${id} failed`, error);
    return fallback;
  }
}

/** Roles → concepts on the person's posts (with dedupe and edges) → synthesis → topic promotion. */
export async function enrichPerson(personId: string, options: EnrichOptions = {}): Promise<EnrichSummary> {
  const force = options.force ?? false;
  const roles = await step("role classification", personId, 0, () => classifyRoles(personId, force));
  const artifacts = await step("concepts", personId, 0, () => enrichArtifacts(artifactsOfPerson(personId), force));
  // Synthesis always reruns: its inputs (about, roles, posts) may have changed with this capture.
  const synthesis = await step("synthesis", personId, false, () => synthesisePerson(personId));
  const promoted = await step("promotion", personId, [], recountAndPromote);
  return { roles, artifacts, synthesis, promoted };
}

/** Concepts, edges and embedding for one artifact, for posts with no person (organisation authors). */
export async function enrichArtifact(artifactId: string, options: EnrichOptions = {}): Promise<EnrichSummary> {
  const force = options.force ?? false;
  const artifacts = await step("concepts", artifactId, 0, () => enrichArtifacts(artifactById(artifactId), force));
  const promoted = await step("promotion", artifactId, [], recountAndPromote);
  return { roles: 0, artifacts, synthesis: false, promoted };
}
