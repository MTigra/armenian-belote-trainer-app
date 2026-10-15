import type { Action, MatchRecord, PlayerView, Seat } from "./types";
export type TrainerPerspective = "player" | "all_hands";
export interface TrainerMoment {
  matchId: string;
  dealNumber: number;
  actionIndex: number;
  revision: number | null;
  seat: Seat;
}
export type TrainerSource =
  | {
      kind: "offline";
      localMatchId: string;
      actionIndex: number;
      view: PlayerView;
    }
  | { kind: "online"; tableCode: string; expectedRevision: number }
  | {
      kind: "review";
      localMatchId: string;
      perspective: TrainerPerspective;
      seat: Seat;
      dealNumber: number;
      actionIndex: number;
      record: MatchRecord;
    };
export interface TrainerHistory {
  role: "user" | "coach";
  text: string;
  moment: TrainerMoment;
  perspective: TrainerPerspective;
}
export interface TrainerRequest {
  protocolVersion: 1;
  requestId: string;
  accessCode: string;
  question: string;
  source: TrainerSource;
  history: TrainerHistory[];
}
export interface TrainerAnswer {
  protocolVersion: 1;
  requestId: string;
  moment: TrainerMoment;
  perspective: TrainerPerspective;
  profileVersion: string;
  answerType: "advice" | "rules" | "analysis" | "clarification";
  suggestion: Action | null;
  explanation: string;
  alternatives: { action: Action; explanation: string }[];
  assumptions: string[];
  ruleRefs: string[];
  validation: {
    format: "passed";
    actions: "passed" | "not_applicable";
    strategy: "not_evaluated";
  };
}
