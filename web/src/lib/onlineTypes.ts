import type {
  Action,
  MatchRecord,
  PlayerView,
  Seat,
  Totals,
  GameState,
} from "./types";
export interface GuestIdentity {
  id: string;
  nickname: string;
  token: string;
  origin: string;
  tableCode: string | null;
}
export interface GuestStatus {
  id: string;
  nickname: string;
  tableCode: string | null;
}
export interface TableMember {
  id: string;
  nickname: string;
  seat: Seat;
  connected: boolean;
  bot: boolean;
}
export interface TableSnapshot {
  id: string;
  code: string;
  name: string;
  hostId: string;
  timerSeconds: number | null;
  createdAt: number;
  revision: number;
  status: "LOBBY" | "PLAYING" | "FINISHED";
  selfSeat: Seat;
  members: TableMember[];
  view: PlayerView | null;
  actionCount: number;
  deadlines: Partial<Record<Seat, number>>;
  serverTime: number;
  result: GameState["result"];
  winner: GameState["winner"];
}
export interface OnlineCommand {
  requestId: string;
  type: "start" | "action" | "advance" | "seat" | "leave";
  expectedRevision: number;
  action?: Action;
  seat?: Seat;
}
export interface MatchReceipt {
  id: string;
  createdAt: number;
  finishedAt: number;
  record: MatchRecord;
  scores: Totals;
  winner: GameState["winner"];
  seat: Seat;
  players: Record<Seat, string>;
  timerSeconds: number | null;
}
export interface OnlineMessage {
  type: "state" | "ack" | "left" | "finished" | "error";
  protocolVersion: number;
  snapshot: TableSnapshot | null;
  requestId: string | null;
  error: { code: string; message: string } | null;
  match: MatchReceipt | null;
}
export type ConnectionState =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "ended";
