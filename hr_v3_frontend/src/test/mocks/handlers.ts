import { http, HttpResponse } from 'msw';

const BASE = 'https://hrapi.keiten-jp.com';

export const mockPosition = {
  id: 'pos-1',
  title: '软件开发工程师',
  department: '研发部',
  description: '负责后端开发',
  skillConfig: { must: ['TypeScript', 'React'], nice: ['Docker'], reject: [] },
  scoringWeights: { must: 0.5, nice: 0.2, education: 0.2, reject: 0.1 },
  status: 'open',
  locale: 'zh',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

export const mockCandidate = {
  id: 'cand-1',
  positionId: 'pos-1',
  name: '张三',
  email: 'zhang@example.com',
  phone: '13800138000',
  education: '本科',
  university: '清华大学',
  universityTier: 'S',
  jlptLevel: 'N2',
  skills: ['TypeScript', 'React'],
  status: 'screening',
  notes: null,
  createdAt: '2026-02-01T00:00:00.000Z',
  totalScore: 85.5,
  educationScore: 95.0,
  grade: 'A',
};

export const mockCandidateDetail = {
  id: 'cand-1',
  positionId: 'pos-1',
  name: '张三',
  email: 'zhang@example.com',
  phone: '13800138000',
  education: '本科',
  university: '清华大学',
  universityTier: 'S',
  jlptLevel: 'N2',
  skills: ['TypeScript', 'React'],
  status: 'screening',
  notes: null,
  createdAt: '2026-02-01T00:00:00.000Z',
  updatedAt: '2026-02-01T00:00:00.000Z',
  scores: [
    {
      id: 'score-1',
      candidateId: 'cand-1',
      positionId: 'pos-1',
      totalScore: 85.5,
      mustScore: 90.0,
      niceScore: 70.0,
      rejectPenalty: 0.0,
      educationScore: 95.0,
      grade: 'A',
      matchedSkills: ['TypeScript', 'React'],
      missingSkills: ['Docker'],
      explanation: '候选人前端能力较强',
      createdAt: '2026-02-01T00:00:05.000Z',
    },
  ],
};

export const handlers = [
  http.get(`${BASE}/health`, () =>
    HttpResponse.json({ status: 'ok', timestamp: '2026-04-08T00:00:00.000Z' })
  ),

  http.get(`${BASE}/api/positions`, () =>
    HttpResponse.json([mockPosition])
  ),

  http.get(`${BASE}/api/positions/:id`, ({ params }) => {
    if (params.id === 'pos-1') return HttpResponse.json(mockPosition);
    return HttpResponse.json({ error: 'Position not found' }, { status: 404 });
  }),

  http.post(`${BASE}/api/positions`, async ({ request }) => {
    const body = await request.json() as Record<string, unknown>;
    return HttpResponse.json({ ...mockPosition, ...body }, { status: 201 });
  }),

  http.patch(`${BASE}/api/positions/:id`, async ({ params, request }) => {
    if (params.id !== 'pos-1')
      return HttpResponse.json({ error: 'Position not found' }, { status: 404 });
    const body = await request.json() as Record<string, unknown>;
    return HttpResponse.json({ ...mockPosition, ...body });
  }),

  http.delete(`${BASE}/api/positions/:id`, ({ params }) => {
    if (params.id !== 'pos-1')
      return HttpResponse.json({ error: 'Position not found' }, { status: 404 });
    return HttpResponse.json({ deleted: true });
  }),

  http.get(`${BASE}/api/candidates`, () =>
    HttpResponse.json([mockCandidate])
  ),

  http.get(`${BASE}/api/candidates/:id`, ({ params }) => {
    if (params.id === 'cand-1') return HttpResponse.json(mockCandidateDetail);
    return HttpResponse.json({ error: 'Candidate not found' }, { status: 404 });
  }),

  http.patch(`${BASE}/api/candidates/:id`, async ({ params, request }) => {
    if (params.id !== 'cand-1')
      return HttpResponse.json({ error: 'Candidate not found' }, { status: 404 });
    const body = await request.json() as Record<string, unknown>;
    return HttpResponse.json({ ...mockCandidateDetail, ...body });
  }),

  http.post(`${BASE}/api/resumes/upload`, () =>
    HttpResponse.json(
      {
        candidate: mockCandidateDetail,
        score: mockCandidateDetail.scores[0],
        resumeText: '张三，毕业于清华大学...',
      },
      { status: 201 }
    )
  ),

  http.post(`${BASE}/api/email/poll`, async ({ request }) => {
    const body = await request.json() as Record<string, unknown>;
    if (!body.positionId)
      return HttpResponse.json({ error: 'positionId is required' }, { status: 400 });
    return HttpResponse.json({ candidateIds: ['cand-1'], count: 1 });
  }),

  http.get(`${BASE}/api/email/stats`, () =>
    HttpResponse.json({
      emails: { total: 100, byClassification: { resume: 80, not_resume: 20, uncertain: 0 } },
      candidates: { total: 80, withScore: 75, withoutScore: 5 },
      resumes: { total: 80, withFile: 40, withoutFile: 40 },
    })
  ),
];
