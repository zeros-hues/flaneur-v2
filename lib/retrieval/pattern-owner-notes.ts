import type { Candidate } from './evidence';
import type { ReaderData } from './reader';
import type { PatternInputNote } from './pattern-types';

/** Current V2 User words only. Artifact authorship/legacy person_id never supplies Person attribution. */
export function patternOwnerNotes(person: Candidate, data: ReaderData): PatternInputNote[] {
  return data.observations.filter(observation => {
    if (observation.layer !== 'user' || !['note', 'reason_for_noticing'].includes(observation.semanticRole ?? '') ||
        !person.evidence.some(evidence => evidence.provenance?.observationId === observation.id && evidence.verified)) return false;
    if (observation.subjectId === person.id) return true;
    const encounter = data.encounters.find(encounter => encounter.id === observation.subjectId);
    if (!encounter?.snapshotId || !data.links.some(link => link.encounterId === encounter.id && link.objectId === person.id && link.relation === 'noticed')) return false;
    const heads = data.derivationHeads?.filter(head => head.snapshotId === encounter.snapshotId) ?? [];
    return heads.length === 1 && heads[0]!.identityActive && data.observations.some(proof =>
      proof.id === heads[0]!.identityObservationId && proof.subjectId === person.id);
  }).map(observation => ({ id: observation.id, body: observation.text, targetKind: 'person' }));
}
