import type {
  Position,
  CandidateListItem,
  CandidateDetail,
  UploadResult,
  EmailPollResult,
  EmailStats,
  CandidateStatus,
  Grade,
  UniversityTier,
} from './types';

export const API_BASE = 'https://hrapi.keiten-jp.com';
export const WS_URL = 'wss://hrapi.keiten-jp.com/ws';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ── Positions ────────────────────────────────────────────────────

export function getPositions(): Promise<Position[]> {
  return request('/api/positions');
}

export function getPosition(id: string): Promise<Position> {
  return request(`/api/positions/${id}`);
}

export function createPosition(data: {
  title: string;
  department?: string;
  description?: string;
  skillConfig?: Position['skillConfig'];
  status?: Position['status'];
  locale?: Position['locale'];
}): Promise<Position> {
  return request('/api/positions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export function updatePosition(id: string, data: Partial<Omit<Position, 'id' | 'createdAt'>>): Promise<Position> {
  return request(`/api/positions/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export function deletePosition(id: string): Promise<{ deleted: boolean }> {
  return request(`/api/positions/${id}`, { method: 'DELETE' });
}

// ── Candidates ───────────────────────────────────────────────────

export interface CandidateFilters {
  positionId?: string;
  status?: CandidateStatus;
  grade?: Grade;
  universityTier?: UniversityTier;
  jlptLevel?: string;
}

export function getCandidates(filters?: CandidateFilters): Promise<CandidateListItem[]> {
  const params = new URLSearchParams();
  if (filters) {
    for (const [key, value] of Object.entries(filters)) {
      if (value) params.set(key, value);
    }
  }
  const qs = params.toString();
  return request(`/api/candidates${qs ? `?${qs}` : ''}`);
}

export function getCandidate(id: string): Promise<CandidateDetail> {
  return request(`/api/candidates/${id}`);
}

export function updateCandidate(
  id: string,
  data: Partial<Pick<CandidateDetail, 'status' | 'notes' | 'phone' | 'email'>>
): Promise<CandidateDetail> {
  return request(`/api/candidates/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

// ── Resumes ──────────────────────────────────────────────────────

export function uploadResume(
  file: File,
  positionId: string,
  name?: string
): Promise<UploadResult> {
  const form = new FormData();
  form.append('file', file);
  form.append('positionId', positionId);
  if (name) form.append('name', name);
  return request('/api/resumes/upload', { method: 'POST', body: form });
}

// ── Email ────────────────────────────────────────────────────────

export function pollInbox(positionId: string): Promise<EmailPollResult> {
  return request('/api/email/poll', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ positionId }),
  });
}

export function getEmailStats(): Promise<EmailStats> {
  return request('/api/email/stats');
}
