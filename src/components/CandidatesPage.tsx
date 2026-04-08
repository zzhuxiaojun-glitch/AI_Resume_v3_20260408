import { useState, useEffect, useCallback } from 'react';
import { Search, Download, Eye, RefreshCw } from 'lucide-react';
import { getCandidates, getPositions, updateCandidate } from '../lib/api';
import type { CandidateListItem, Position, CandidateStatus, Grade } from '../lib/types';
import type { useHRWebSocket } from '../hooks/useWebSocket';

const STATUS_OPTIONS: { value: CandidateStatus; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'screening', label: 'Screening' },
  { value: 'shortlisted', label: 'Shortlisted' },
  { value: 'interviewed', label: 'Interviewed' },
  { value: 'hired', label: 'Hired' },
  { value: 'rejected', label: 'Rejected' },
];

const GRADE_COLORS: Record<string, string> = {
  A: 'bg-green-100 text-green-800',
  B: 'bg-blue-100 text-blue-800',
  C: 'bg-yellow-100 text-yellow-800',
  D: 'bg-orange-100 text-orange-800',
  F: 'bg-red-100 text-red-800',
};

const STATUS_COLORS: Record<string, string> = {
  new: 'bg-slate-100 text-slate-700',
  screening: 'bg-yellow-100 text-yellow-700',
  shortlisted: 'bg-blue-100 text-blue-700',
  interviewed: 'bg-purple-100 text-purple-700',
  hired: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
};

interface Props {
  onViewDetail: (id: string) => void;
  ws: ReturnType<typeof useHRWebSocket>;
}

export function CandidatesPage({ onViewDetail, ws }: Props) {
  const [candidates, setCandidates] = useState<CandidateListItem[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [gradeFilter, setGradeFilter] = useState<Grade | ''>('');
  const [statusFilter, setStatusFilter] = useState<CandidateStatus | ''>('');
  const [positionFilter, setPositionFilter] = useState('');
  const [sortBy, setSortBy] = useState<'score' | 'date'>('score');

  const load = useCallback(async () => {
    const [cands, pos] = await Promise.all([getCandidates(), getPositions()]);
    setCandidates(cands);
    setPositions(pos);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Real-time: add new candidate to list
  useEffect(() => {
    return ws.on('candidate:new', () => {
      getCandidates().then(setCandidates);
    });
  }, [ws]);

  // Real-time: update score on existing candidate
  useEffect(() => {
    return ws.on('candidate:scored', (event) => {
      setCandidates((prev) =>
        prev.map((c) =>
          c.id === event.candidateId
            ? { ...c, totalScore: event.totalScore, grade: event.grade, educationScore: event.educationScore }
            : c
        )
      );
    });
  }, [ws]);

  const handleStatusChange = async (candidateId: string, newStatus: CandidateStatus) => {
    try {
      await updateCandidate(candidateId, { status: newStatus });
      setCandidates((prev) =>
        prev.map((c) => (c.id === candidateId ? { ...c, status: newStatus } : c))
      );
    } catch {
      alert('Failed to update status');
    }
  };

  const handleExportCSV = () => {
    const filtered = getFiltered();
    const posMap = Object.fromEntries(positions.map((p) => [p.id, p.title]));
    const header = 'Name,Email,Phone,Position,Education,University,Score,Grade,Status';
    const rows = filtered.map((c) =>
      [
        `"${(c.name ?? '').replace(/"/g, '""')}"`,
        c.email ?? '',
        c.phone ?? '',
        `"${(posMap[c.positionId] ?? '').replace(/"/g, '""')}"`,
        c.education ?? '',
        c.university ?? '',
        c.totalScore?.toFixed(2) ?? '',
        c.grade ?? '',
        c.status,
      ].join(',')
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `candidates_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const getFiltered = () => {
    let list = [...candidates];
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(term) ||
          c.email?.toLowerCase().includes(term) ||
          c.phone?.includes(term) ||
          c.skills?.some((s) => s.toLowerCase().includes(term))
      );
    }
    if (gradeFilter) list = list.filter((c) => c.grade === gradeFilter);
    if (statusFilter) list = list.filter((c) => c.status === statusFilter);
    if (positionFilter) list = list.filter((c) => c.positionId === positionFilter);
    list.sort((a, b) =>
      sortBy === 'score'
        ? (b.totalScore ?? -1) - (a.totalScore ?? -1)
        : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    return list;
  };

  const posMap = Object.fromEntries(positions.map((p) => [p.id, p.title]));
  const filtered = getFiltered();

  if (loading) return <div className="text-center py-12 text-slate-500">Loading...</div>;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Candidates</h1>
        <button
          onClick={handleExportCSV}
          className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
        >
          <Download className="w-4 h-4 mr-2" />
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="lg:col-span-2 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search name, email, skills..."
              className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <select
            value={positionFilter}
            onChange={(e) => setPositionFilter(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Positions</option>
            {positions.map((p) => (
              <option key={p.id} value={p.id}>{p.title}</option>
            ))}
          </select>
          <select
            value={gradeFilter}
            onChange={(e) => setGradeFilter(e.target.value as Grade | '')}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Grades</option>
            {(['A', 'B', 'C', 'D', 'F'] as Grade[]).map((g) => (
              <option key={g} value={g}>Grade {g}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as CandidateStatus | '')}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Status</option>
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
          <span className="text-sm text-slate-500">
            {filtered.length} / {candidates.length} candidates
          </span>
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-500">Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'score' | 'date')}
              className="text-sm px-2 py-1 border border-slate-300 rounded-lg"
            >
              <option value="score">Score ↓</option>
              <option value="date">Newest first</option>
            </select>
          </div>
        </div>
      </div>

      {/* List */}
      <div className="space-y-3">
        {filtered.map((c) => (
          <div key={c.id} className="bg-white rounded-lg shadow-sm border border-slate-200 p-5 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center flex-wrap gap-2 mb-2">
                  <h3 className="text-base font-semibold text-slate-800">{c.name || 'Unknown'}</h3>
                  {c.grade && (
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${GRADE_COLORS[c.grade] ?? 'bg-slate-100 text-slate-700'}`}>
                      Grade {c.grade}
                    </span>
                  )}
                  <select
                    value={c.status}
                    onChange={(e) => handleStatusChange(c.id, e.target.value as CandidateStatus)}
                    onClick={(e) => e.stopPropagation()}
                    className={`px-2 py-0.5 rounded-full text-xs font-medium border-0 focus:ring-2 focus:ring-blue-500 cursor-pointer ${STATUS_COLORS[c.status] ?? 'bg-slate-100 text-slate-700'}`}
                  >
                    {STATUS_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1 text-sm text-slate-600 mb-2">
                  <div>
                    <span className="font-medium">Score:</span>{' '}
                    <span className="font-bold text-blue-600">
                      {c.totalScore != null ? c.totalScore.toFixed(1) : '—'}
                    </span>
                  </div>
                  <div><span className="font-medium">Position:</span> {posMap[c.positionId] ?? '—'}</div>
                  <div><span className="font-medium">University:</span> {c.university ?? '—'}</div>
                  <div><span className="font-medium">JLPT:</span> {c.jlptLevel ?? '—'}</div>
                </div>

                {(c.email || c.phone) && (
                  <div className="text-sm text-slate-500 mb-2">
                    {c.email && <span className="mr-4">{c.email}</span>}
                    {c.phone && <span>{c.phone}</span>}
                  </div>
                )}

                {c.skills && c.skills.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {c.skills.slice(0, 8).map((skill, i) => (
                      <span key={i} className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded">
                        {skill}
                      </span>
                    ))}
                    {c.skills.length > 8 && (
                      <span className="text-xs text-slate-400 py-0.5">+{c.skills.length - 8} more</span>
                    )}
                  </div>
                )}
              </div>

              <button
                onClick={() => onViewDetail(c.id)}
                className="ml-4 flex items-center px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm shrink-0"
              >
                <Eye className="w-4 h-4 mr-1.5" />
                View
              </button>
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="text-center py-16 text-slate-400">
            <RefreshCw className="w-8 h-8 mx-auto mb-3 opacity-40" />
            <p>No candidates found.</p>
          </div>
        )}
      </div>
    </div>
  );
}
