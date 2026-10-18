export interface DependencyObservation { id: string; layer: string; inactive?: boolean }
export interface ObservationDependency { observationId: string; supportingObservationId: string; role: string }

/** Conservatively withdraw non-User derivations that consumed an inactive input. Retain User authorship. */
export function dependentObservationIds(observations: DependencyObservation[], dependencies: ObservationDependency[], roots: string[]) {
  const layers = new Map(observations.map((observation) => [observation.id, observation.layer]));
  const children = new Map<string, string[]>();
  for (const dependency of dependencies) {
    if (dependency.role !== "supports" || layers.get(dependency.observationId) === "user" || !layers.has(dependency.observationId)) continue;
    const ids = children.get(dependency.supportingObservationId) ?? [];
    ids.push(dependency.observationId); children.set(dependency.supportingObservationId, ids);
  }
  const inactive = new Set(roots), queue = [...inactive];
  for (let index = 0; index < queue.length; index++) {
    for (const id of children.get(queue[index]!) ?? []) if (!inactive.has(id)) { inactive.add(id); queue.push(id); }
  }
  return inactive;
}
