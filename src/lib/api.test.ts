import { describe, it, expect } from 'vitest';
import {
  getPositions,
  getPosition,
  createPosition,
  updatePosition,
  deletePosition,
  getCandidates,
  getCandidate,
  updateCandidate,
  uploadResume,
  pollInbox,
  getEmailStats,
} from './api';
import { mockPosition, mockCandidate, mockCandidateDetail } from '../test/mocks/handlers';

describe('getPositions', () => {
  it('returns list of positions', async () => {
    const positions = await getPositions();
    expect(positions).toHaveLength(1);
    expect(positions[0].id).toBe('pos-1');
    expect(positions[0].title).toBe('软件开发工程师');
    expect(positions[0].skillConfig.must).toContain('TypeScript');
  });
});

describe('getPosition', () => {
  it('returns a single position by id', async () => {
    const position = await getPosition('pos-1');
    expect(position.id).toBe('pos-1');
    expect(position.department).toBe('研发部');
  });

  it('throws on 404', async () => {
    await expect(getPosition('not-found')).rejects.toThrow();
  });
});

describe('createPosition', () => {
  it('creates and returns a new position', async () => {
    const position = await createPosition({
      title: '测试职位',
      skillConfig: { must: ['Go'], nice: [], reject: [] },
    });
    expect(position.title).toBe('测试职位');
  });
});

describe('updatePosition', () => {
  it('patches a position and returns updated data', async () => {
    const position = await updatePosition('pos-1', { title: '新职位名称' });
    expect(position.title).toBe('新职位名称');
  });

  it('throws on 404', async () => {
    await expect(updatePosition('not-found', { title: 'x' })).rejects.toThrow();
  });
});

describe('deletePosition', () => {
  it('deletes a position and returns deleted:true', async () => {
    const result = await deletePosition('pos-1');
    expect(result.deleted).toBe(true);
  });
});

describe('getCandidates', () => {
  it('returns candidates list', async () => {
    const candidates = await getCandidates();
    expect(candidates).toHaveLength(1);
    expect(candidates[0].id).toBe('cand-1');
    expect(candidates[0].grade).toBe('A');
    expect(candidates[0].totalScore).toBe(85.5);
  });

  it('accepts filter params without error', async () => {
    const candidates = await getCandidates({ positionId: 'pos-1', grade: 'A', status: 'screening' });
    expect(Array.isArray(candidates)).toBe(true);
  });
});

describe('getCandidate', () => {
  it('returns candidate detail with scores array', async () => {
    const candidate = await getCandidate('cand-1');
    expect(candidate.id).toBe('cand-1');
    expect(Array.isArray(candidate.scores)).toBe(true);
    expect(candidate.scores[0].grade).toBe('A');
    expect(candidate.scores[0].matchedSkills).toContain('TypeScript');
  });

  it('throws on 404', async () => {
    await expect(getCandidate('not-found')).rejects.toThrow();
  });
});

describe('updateCandidate', () => {
  it('patches candidate status and notes', async () => {
    const candidate = await updateCandidate('cand-1', {
      status: 'shortlisted',
      notes: '推进面试',
    });
    expect(candidate.status).toBe('shortlisted');
    expect(candidate.notes).toBe('推进面试');
  });
});

describe('uploadResume', () => {
  it('uploads a file and returns candidate + score', async () => {
    const file = new File(['resume content'], 'resume.pdf', { type: 'application/pdf' });
    const result = await uploadResume(file, 'pos-1', '张三');
    expect(result.candidate.id).toBe('cand-1');
    expect(result.score.grade).toBe('A');
    expect(typeof result.resumeText).toBe('string');
  });
});

describe('pollInbox', () => {
  it('triggers email poll and returns candidate ids', async () => {
    const result = await pollInbox('pos-1');
    expect(result.count).toBe(1);
    expect(result.candidateIds).toContain('cand-1');
  });

  it('throws on missing positionId', async () => {
    await expect(pollInbox('')).rejects.toThrow();
  });
});

describe('getEmailStats', () => {
  it('returns email processing statistics', async () => {
    const stats = await getEmailStats();
    expect(stats.emails.total).toBe(100);
    expect(stats.candidates.total).toBe(80);
  });
});
