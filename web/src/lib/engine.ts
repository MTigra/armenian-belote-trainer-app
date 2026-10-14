import {
  startGame,
  applyAction,
  playerView,
  automaticAction,
  nextDeal,
  matchRecord,
  replayMatch,
  validateSnapshot,
} from "@blot/game-core";
import type {
  Action,
  GameState,
  MatchRecord,
  PlayerView,
  Seat,
  SavedMatch,
  Session,
} from "./types";
export const PROFILE = "armenian-training-0.1";
export const stateOf = (snapshot: string): GameState => JSON.parse(snapshot);
export const viewOf = (snapshot: string, seat: Seat = "SOUTH"): PlayerView =>
  JSON.parse(playerView(snapshot, seat));
export const act = (snapshot: string, action: Action) =>
  applyAction(snapshot, JSON.stringify(action));
export const auto = (snapshot: string, seat: Seat) =>
  act(snapshot, JSON.parse(automaticAction(snapshot, seat)) as Action);
export const randomSeed = () => crypto.getRandomValues(new Int32Array(1))[0];
export function newSession(
  seed = randomSeed(),
  dealer: Seat = (["SOUTH", "WEST", "NORTH", "EAST"] as Seat[])[
    Math.abs(seed % 4)
  ],
): Session {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    snapshot: startGame(seed, dealer),
    createdAt: now,
    updatedAt: now,
    chat: [],
  };
}
export const dealNext = (snapshot: string, seed = randomSeed()) =>
  nextDeal(snapshot, seed);
export function botSeat(view: PlayerView): Seat | null {
  if (view.phase === "REDOUBLE")
    return view.auction.pendingRedouble.find((s) => s !== "SOUTH") ?? null;
  if (view.phase === "BIDDING")
    return view.auction.turn === "SOUTH" ? null : view.auction.turn;
  if (view.phase === "PLAYING") return view.turn === "SOUTH" ? null : view.turn;
  return null;
}
export function archive(session: Session): SavedMatch {
  const state = stateOf(session.snapshot);
  return {
    id: session.id,
    createdAt: session.createdAt,
    finishedAt: Date.now(),
    record: JSON.parse(matchRecord(session.snapshot)),
    chat: session.chat,
    scores: state.scores,
    winner: state.winner,
  };
}
export function validateSession(session: Session): Session {
  if (
    !session ||
    typeof session.snapshot !== "string" ||
    typeof session.id !== "string" ||
    !Array.isArray(session.chat)
  )
    throw new Error("Некорректное сохранение");
  validateSnapshot(session.snapshot);
  return session;
}
export function validateRecord(value: unknown): {
  record: MatchRecord;
  state: GameState;
} {
  const text = JSON.stringify(value);
  const snapshot = replayMatch(text);
  const state = stateOf(snapshot);
  if (state.phase !== "MATCH_FINISHED")
    throw new Error("Запись не содержит завершённый матч");
  return { record: JSON.parse(matchRecord(snapshot)), state };
}
export function replayAt(record: MatchRecord, actionCount: number): string {
  const count = Math.max(0, Math.min(record.actions.length, actionCount));
  const partial = {
    ...record,
    actions: record.actions.slice(0, count),
    setups: record.setups.filter((s) => s.actionOffset <= count),
  };
  return replayMatch(JSON.stringify(partial));
}
