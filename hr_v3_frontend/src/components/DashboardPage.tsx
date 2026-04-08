import { useState, useEffect, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { Users, FileCheck, TrendingUp, Briefcase } from 'lucide-react';
import { getCandidates, getPositions } from '../lib/api';
import type { useHRWebSocket } from '../hooks/useWebSocket';

const STATUS_LABELS: Record<string, string> = {
  new: 'New',
  screening: 'Screening',
  shortlisted: 'Shortlisted',
  interviewed: 'Interviewed',
  hired: 'Hired',
  rejected: 'Rejected',
};

const GRADE_COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#f97316', '#ef4444'];

interface Props {
  ws: ReturnType<typeof useHRWebSocket>;
}

export function DashboardPage({ ws }: Props) {
  const [stats, setStats] = useState({
    total: 0,
    totalPositions: 0,
    statusCounts: [] as { status: string; label: string; count: number }[],
    gradeCounts: [] as { grade: string; count: number }[],
    positionCounts: [] as { title: string; count: number }[],
  });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [candidates, positions] = await Promise.all([getCandidates(), getPositions()]);

    const statusMap: Record<string, number> = {};
    const gradeMap: Record<string, number> = {};
    const posMap: Record<string, number> = {};

    for (const c of candidates) {
      statusMap[c.status] = (statusMap[c.status] ?? 0) + 1;
      if (c.grade) gradeMap[c.grade] = (gradeMap[c.grade] ?? 0) + 1;
      posMap[c.positionId] = (posMap[c.positionId] ?? 0) + 1;
    }

    setStats({
      total: candidates.length,
      totalPositions: positions.length,
      statusCounts: Object.entries(STATUS_LABELS).map(([status, label]) => ({
        status,
        label,
        count: statusMap[status] ?? 0,
      })),
      gradeCounts: (['A', 'B', 'C', 'D', 'F'] as const).map((grade) => ({
        grade,
        count: gradeMap[grade] ?? 0,
      })).filter((g) => g.count > 0),
      positionCounts: positions
        .map((p) => ({ title: p.title, count: posMap[p.id] ?? 0 }))
        .filter((p) => p.count > 0),
    });
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Refresh on real-time events
  useEffect(() => ws.on('candidate:new', load), [ws, load]);
  useEffect(() => ws.on('inbox:summary', load), [ws, load]);

  const shortlisted = stats.statusCounts.find((s) => s.status === 'shortlisted')?.count ?? 0;
  const interviewed = stats.statusCounts.find((s) => s.status === 'interviewed')?.count ?? 0;
  const hired = stats.statusCounts.find((s) => s.status === 'hired')?.count ?? 0;
  const passRate = stats.total > 0
    ? (((shortlisted + interviewed + hired) / stats.total) * 100).toFixed(1)
    : '0';
  const interviewRate = shortlisted + interviewed + hired > 0
    ? (((interviewed + hired) / (shortlisted + interviewed + hired)) * 100).toFixed(1)
    : '0';

  if (loading) return <div className="text-center py-12 text-slate-500">Loading...</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Applications', value: stats.total, icon: Users, color: 'blue' },
          { label: 'Open Positions', value: stats.totalPositions, icon: Briefcase, color: 'green' },
          { label: 'Pass Rate', value: `${passRate}%`, icon: FileCheck, color: 'amber' },
          { label: 'Interview Rate', value: `${interviewRate}%`, icon: TrendingUp, color: 'purple' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-lg border border-slate-200 p-5 flex items-center gap-4">
            <div className={`p-2.5 bg-${color}-100 rounded-lg`}>
              <Icon className={`w-6 h-6 text-${color}-600`} />
            </div>
            <div>
              <p className="text-xs text-slate-500">{label}</p>
              <p className="text-2xl font-bold text-slate-800">{value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Status bar chart */}
        <div className="bg-white rounded-lg border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Candidate Status</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.statusCounts}>
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Grade pie chart */}
        <div className="bg-white rounded-lg border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Grade Distribution</h3>
          {stats.gradeCounts.length > 0 ? (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stats.gradeCounts}
                    dataKey="count"
                    nameKey="grade"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={({ grade, count }) => `${grade}: ${count}`}
                  >
                    {stats.gradeCounts.map((_, i) => (
                      <Cell key={i} fill={GRADE_COLORS[i % GRADE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-56 flex items-center justify-center text-slate-400 text-sm">
              No scored candidates yet
            </div>
          )}
        </div>
      </div>

      {/* Per-position counts */}
      {stats.positionCounts.length > 0 && (
        <div className="bg-white rounded-lg border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Applications by Position</h3>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.positionCounts} layout="vertical" margin={{ left: 100 }}>
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="title" width={100} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#22c55e" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
