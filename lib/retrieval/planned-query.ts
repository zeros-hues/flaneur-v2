import { planQuery, type PlannerProvider } from "./planner";
import { evidenceQuery, type AnswerProvider, type RetrievalReader } from "./pipeline";
import {RelationshipClarification} from './relationship-filters';

/** Disconnected application boundary: clarify before retrieval, retrieve before synthesis. */
export async function plannedQuery(question: string, referenceInstant: string, dependencies: {
  planner: PlannerProvider; reader: RetrievalReader; answer?: AnswerProvider;
}) {
  const plan = await planQuery(question, referenceInstant, dependencies.planner);
  if (plan.state !== "planned") return { plan, result: null };
  try {
    return { plan, result: await evidenceQuery(plan.request, dependencies.reader, dependencies.answer) };
  } catch(error) {
    if(error instanceof RelationshipClarification)return {plan:{state:'clarification' as const,interpretation:plan.interpretation,ambiguities:error.questions},result:null};
    return { plan, result: null, error: "RETRIEVAL_UNAVAILABLE" as const };
  }
}
