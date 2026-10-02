// The generative UI contract: the server decides composition, the client renders blocks in order.
import type { AskSource } from "@/lib/ask";
import type { Coverage, EmptyReason, RoutedQuery, SearchHit } from "@/lib/search/types";

export interface MarginItem {
  concept_id: string;
  label: string;
}

export type Block =
  /** drawn_from: how many items the answer was retrieved from (its footnote). */
  | { type: "answer"; text: string; sources: AskSource[]; drawn_from: number }
  | { type: "people"; items: SearchHit[]; coverage: Coverage }
  | { type: "rule" }
  | { type: "margin"; items: MarginItem[] }
  | { type: "empty"; reason: EmptyReason };

export type BlockType = Block["type"];

export interface QueryResponse {
  blocks: Block[];
  /** The search's routing, for "save this search"; null when no people search ran or it could not be routed. */
  routed_json: RoutedQuery | null;
}
