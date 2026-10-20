import { verifiedExcerpt, type Candidate, type TruthLayer } from "./evidence";
import { currentDerivation } from "../processing/invalidation";
import { dependentObservationIds, type ObservationDependency } from "../processing/dependencies";
import { capturedSourceEvidence, type CapturedSourceRow } from "./captured-source";

export interface ObservationRow {
  id: string; subjectId: string; layer: TruthLayer; text: string; supportStatus: string;
  semanticRole?: string;
  inactive?: boolean;
  derivation?: { snapshotId: string | null; fingerprint: string | null; identityObservationId: string | null;
    representationId: string | null } | null;
}
export interface LocatorRow {
  evidenceId: string; observationId: string; snapshotId: string; representationSnapshotId: string;
  text: string; start: number; end: number; quote: string; excerpt: string | null; role: string;
  representationId?: string;
  sourceUrl?:string;
}
export interface ReaderData {
  objects: { id: string; kind: string }[];
  observations: ObservationRow[];
  locators: LocatorRow[];
  facts: { observationId: string; field: string; value: string }[];
  encounters: { id: string; snapshotId: string | null; occurredAt: string; clockVerified: boolean }[];
  links: { encounterId: string; objectId: string; relation: string }[];
  derivationHeads?: { snapshotId: string; fingerprint: string; identityObservationId: string | null; identityActive: boolean }[];
  dependencies?: ObservationDependency[];
  legacyNotes?: {id:string;personId:string|null;artifactId:string|null;snapshotId:string|null;body:string}[];
  capturedSources?: CapturedSourceRow[];
}

/** SQL supplies active, non-reviewed, non-superseded observations. This maps without identity merges. */
export function readCandidates(data: ReaderData) {
  const candidates = new Map<string, Candidate>();
  for (const object of data.objects) {
    if (candidates.has(object.id)) throw new Error("DUPLICATE_READER_OBJECT");
    candidates.set(object.id, { id: object.id, evidence: [], facts: [], encounters: [], completeFields: [] });
  }
  const targets = (subjectId: string) => new Set([
    ...(candidates.has(subjectId) ? [subjectId] : []),
    ...data.links.filter((link) => link.encounterId === subjectId &&
      ["noticed", "source", "author"].includes(link.relation) && candidates.has(link.objectId)).map((link) => link.objectId),
  ]);
  const seen = new Set<string>();
  const roots = data.observations.filter((observation) => {
    if (observation.inactive) return true;
    if (!observation.derivation) return false;
    const heads = (data.derivationHeads ?? []).filter((head) => head.snapshotId === observation.derivation!.snapshotId);
    return !observation.derivation.representationId || !currentDerivation(observation.derivation, heads.length === 1 ? heads[0]! : null);
  }).map((observation) => observation.id);
  const inactive = dependentObservationIds(data.observations, data.dependencies ?? [], roots);
  for (const observation of data.observations) {
    if (seen.has(observation.id)) throw new Error("DUPLICATE_READER_OBSERVATION");
    seen.add(observation.id);
    if (inactive.has(observation.id)) continue;
    const locators = data.locators.filter((locator) => locator.observationId === observation.id &&
      (!observation.derivation || (locator.representationId === observation.derivation.representationId &&
        locator.snapshotId === observation.derivation.snapshotId)) &&
      locator.role === "supports" && locator.snapshotId === locator.representationSnapshotId &&
      locator.quote === locator.excerpt && verifiedExcerpt(locator.text, locator.start, locator.end, locator.quote) &&
      locator.quote.includes(observation.text));
    const verified = observation.layer === "user" || (observation.layer !== "inferred" &&
      observation.supportStatus === "verified" && locators.length > 0);
    for (const target of targets(observation.subjectId)) {
      const candidate = candidates.get(target)!;
      const id = `observation:${observation.id}:object:${target}`;
      let sourceUrl:string|undefined;
      try{const url=new URL(locators[0]?.sourceUrl??"");if(["https:","http:"].includes(url.protocol)&&!url.username&&!url.password)sourceUrl=url.href;}catch{/* No unsafe source link. */}
      candidate.evidence.push({ id, objectId: target, text: observation.text, layer: observation.layer, verified,
        provenance: { observationId: observation.id, supportStatus: observation.supportStatus,
          ...(locators[0]?{snapshotId:locators[0].snapshotId}:{}),...(sourceUrl?{sourceUrl}:{}),
          locatorEvidenceIds: locators.map((locator) => locator.evidenceId) } });
      // Structured projections are usable only when the assertion agrees with the actual value.
      for (const fact of data.facts.filter((fact) => fact.observationId === observation.id && fact.value === observation.text))
        candidate.facts.push({ field: fact.field, value: fact.value, evidenceId: id });
    }
  }
  for (const encounter of data.encounters) {
    for (const target of targets(encounter.id)) {
      const candidate = candidates.get(target)!;
      const id = `encounter:${encounter.id}:object:${target}`;
      candidate.evidence.push({ id, objectId: target,
        text: `Encounter recorded at ${encounter.occurredAt}.`, layer: "extracted", verified: encounter.clockVerified,
        provenance: { encounterId: encounter.id, ...(encounter.snapshotId ? { snapshotId: encounter.snapshotId } : {}) } });
      candidate.encounters!.push({ occurredAt: encounter.occurredAt, evidenceId: id });
    }
  }
  for(const note of data.legacyNotes??[]){
    if(seen.has(note.id))continue;
    const encounter=note.snapshotId?data.encounters.find(e=>e.snapshotId===note.snapshotId):null;
    const subject=encounter?.id??note.artifactId??note.personId;
    const ids=subject?targets(subject):new Set<string>();
    for(const id of ids){if(!id || !candidates.has(id))continue;
      candidates.get(id)!.evidence.push({id:`legacy-note:${note.id}:object:${id}`,objectId:id,text:note.body,layer:"user",verified:true,
        provenance:{legacyNoteId:note.id,supportStatus:"legacy_unverified"}});
    }
  }
  for (const source of data.capturedSources ?? []) {
    const heads = (data.derivationHeads ?? []).filter(head => head.snapshotId === source.snapshotId);
    const head = heads.length === 1 ? heads[0] : null;
    if (!head || head.fingerprint !== source.fingerprint) continue;
    for (const evidence of capturedSourceEvidence(source, head.identityActive ? head.identityObservationId : null))
      candidates.get(evidence.objectId)?.evidence.push(evidence);
  }
  const result = [...candidates.values()].sort((a, b) => a.id.localeCompare(b.id));
  return { candidates: result, population: { defined: true, total: result.length,
    indexed: result.filter((candidate) => candidate.evidence.some((evidence) => evidence.text.trim() && !evidence.provenance?.encounterId)).length } };
}
