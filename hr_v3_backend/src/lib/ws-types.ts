/**
 * @file WebSocket 消息类型定义
 * @description 定义 WS Server→Client 和 Client→Server 的所有消息类型，
 *              提供 type guard 验证客户端消息、序列化服务端事件。
 */

/* ── Server → Client 事件类型 ───────────────────────────────── */

export interface CandidateNewEvent {
  type: "candidate:new";
  candidateId: string;
  name: string;
  email: string | undefined;
  positionId: string;
  positionTitle: string;
  source: "email" | "upload";
  timestamp: string;
}

export interface CandidateScoredEvent {
  type: "candidate:scored";
  candidateId: string;
  name: string;
  positionId: string;
  /** 综合评分（0.00-100.00，保留两位小数） */
  totalScore: number;
  /** 评级：A(>=80.00) B(>=65.00) C(>=50.00) D(>=35.00) F(<35.00) */
  grade: "A" | "B" | "C" | "D" | "F";
  matchedSkills: string[];
  /** 学历/院校评分（0.00-100.00，保留两位小数） */
  educationScore: number;
  timestamp: string;
}

export interface InboxSummaryEvent {
  type: "inbox:summary";
  totalProcessed: number;
  gradeDistribution: { A: number; B: number; C: number; D: number; F: number };
  topCandidates: Array<{
    candidateId: string;
    name: string;
    /** 评级 */
    grade: string;
    /** 综合评分（0.00-100.00，保留两位小数） */
    totalScore: number;
  }>;
  timestamp: string;
}

export interface HeartbeatEvent {
  type: "heartbeat";
  timestamp: string;
  connectedClients: number;
}

export interface ErrorEvent {
  type: "error";
  message: string;
}

export type ServerEvent =
  | CandidateNewEvent
  | CandidateScoredEvent
  | InboxSummaryEvent
  | HeartbeatEvent
  | ErrorEvent;

/* ── Client → Server 消息类型 ──────────────────────────────── */

export interface PingMessage {
  type: "ping";
}

export interface SubscribeMessage {
  type: "subscribe";
  positionId?: string;
}

export type ClientMessage = PingMessage | SubscribeMessage;

/* ── Type Guard ────────────────────────────────────────────── */

const VALID_CLIENT_TYPES = new Set(["ping", "subscribe"]);

export function isValidClientMessage(data: unknown): data is ClientMessage {
  if (data === null || typeof data !== "object") return false;

  const obj = data as Record<string, unknown>;
  if (typeof obj.type !== "string" || !VALID_CLIENT_TYPES.has(obj.type))
    return false;

  if (
    obj.type === "subscribe" &&
    obj.positionId !== undefined &&
    typeof obj.positionId !== "string"
  )
    return false;

  return true;
}

/* ── Serialization ─────────────────────────────────────────── */

export function serializeEvent(event: ServerEvent): string {
  return JSON.stringify(event);
}
