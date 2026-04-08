// Types matching the v2 backend schema

export interface SkillConfig {
  must: string[];
  nice: string[];
  reject: string[];
}

export interface ScoringWeights {
  must: number;
  nice: number;
  education: number;
  reject: number;
}

export interface Position {
  id: string;
  title: string;
  department: string | null;
  description: string | null;
  skillConfig: SkillConfig;
  scoringWeights: ScoringWeights;
  status: 'open' | 'closed' | 'draft';
  locale: 'zh' | 'ja';
  createdAt: string;
  updatedAt: string;
}

export type CandidateStatus =
  | 'new'
  | 'screening'
  | 'shortlisted'
  | 'interviewed'
  | 'rejected'
  | 'hired';

export type Grade = 'A' | 'B' | 'C' | 'D' | 'F';

export type UniversityTier = 'S' | 'A' | 'B' | 'C' | 'D';

export type JlptLevel = 'N1' | 'N2' | 'N3' | 'N4' | 'N5';

/** Candidate as returned by GET /api/candidates (list view with joined score) */
export interface CandidateListItem {
  id: string;
  positionId: string;
  name: string;
  email: string | null;
  phone: string | null;
  education: string | null;
  university: string | null;
  universityTier: UniversityTier | null;
  jlptLevel: JlptLevel | null;
  skills: string[] | null;
  status: CandidateStatus;
  notes: string | null;
  createdAt: string;
  // From LEFT JOIN scores:
  totalScore: number | null;
  educationScore: number | null;
  grade: Grade | null;
}

export interface Score {
  id: string;
  candidateId: string;
  positionId: string;
  totalScore: number;
  mustScore: number;
  niceScore: number;
  rejectPenalty: number;
  educationScore: number;
  grade: Grade;
  matchedSkills: string[];
  missingSkills: string[];
  explanation: string | null;
  createdAt: string;
}

/** Candidate as returned by GET /api/candidates/:id (detail with scores array) */
export interface CandidateDetail {
  id: string;
  positionId: string;
  name: string;
  email: string | null;
  phone: string | null;
  education: string | null;
  university: string | null;
  universityTier: UniversityTier | null;
  jlptLevel: JlptLevel | null;
  age: number | null;
  gender: string | null;
  educationLevel: string | null;
  major: string | null;
  workYears: number | null;
  relocationWilling: boolean | null;
  skills: string[] | null;
  status: CandidateStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  scores: Score[];
}

export interface UploadResult {
  candidate: CandidateDetail;
  score: Score;
  resumeText: string;
}

export interface EmailPollResult {
  candidateIds: string[];
  count: number;
}

export interface EmailStats {
  emails: {
    total: number;
    byClassification: Record<string, number>;
    byStatus?: Record<string, number>;
    breakdown?: Array<{
      classification: string;
      status: string;
      hasAttachment: boolean;
      count: number;
    }>;
  };
  candidates: {
    total: number;
    withScore: number;
    withoutScore: number;
  };
  resumes: {
    total: number;
    withFile: number;
    withoutFile: number;
  };
}

// WebSocket event types
export interface HeartbeatEvent {
  type: 'heartbeat';
  timestamp: string;
  connectedClients: number;
}

export interface CandidateNewEvent {
  type: 'candidate:new';
  candidateId: string;
  name: string;
  email?: string;
  positionId: string;
  positionTitle: string;
  source: 'email' | 'upload';
  timestamp: string;
}

export interface CandidateScoredEvent {
  type: 'candidate:scored';
  candidateId: string;
  name: string;
  positionId: string;
  totalScore: number;
  grade: Grade;
  matchedSkills: string[];
  educationScore: number;
  timestamp: string;
}

export interface InboxSummaryEvent {
  type: 'inbox:summary';
  totalProcessed: number;
  gradeDistribution: { A: number; B: number; C: number; D: number; F: number };
  topCandidates: Array<{
    candidateId: string;
    name: string;
    grade: string;
    totalScore: number;
  }>;
  timestamp: string;
}

export interface WsErrorEvent {
  type: 'error';
  message: string;
}

export type ServerEvent =
  | HeartbeatEvent
  | CandidateNewEvent
  | CandidateScoredEvent
  | InboxSummaryEvent
  | WsErrorEvent;
