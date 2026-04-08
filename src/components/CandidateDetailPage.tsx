import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Save, CheckCircle, AlertCircle, TrendingUp } from 'lucide-react';
import { getCandidate, getPosition, updateCandidate } from '../lib/api';
import type { CandidateDetail, Position, Score, CandidateStatus } from '../lib/types';
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
  A: 'bg-green-100 text-green-800 border-green-300',
  B: 'bg-blue-100 text-blue-800 border-blue-300',
  C: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  D: 'bg-orange-100 text-orange-800 border-orange-300',
  F: 'bg-red-100 text-red-800 border-red-300',
};

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <span className="text-xs text-slate-500">{label}</span>
      <p className="text-sm font-medium text-slate-800">{value ?? '—'}</p>
    </div>
  );
}

function ScorePanel({ score }: { score: Score }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total', value: score.totalScore.toFixed(1), color: 'blue' },
          { label: 'Must-have', value: score.mustScore.toFixed(1), color: 'red' },
          { label: 'Nice-to-have', value: score.niceScore.toFixed(1), color: 'green' },
          { label: 'Education', value: score.educationScore.toFixed(1), color: 'purple' },
        ].map(({ label, value, color }) => (
          <div key={label} className={`text-center p-3 bg-${color}-50 rounded-lg`}>
            <div className={`text-2xl font-bold text-${color}-600`}>{value}</div>
            <div className="text-xs text-slate-500 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {score.rejectPenalty > 0 && (
        <div className="flex items-center text-sm text-orange-700 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
          <AlertCircle className="w-4 h-4 mr-2 shrink-0" />
          Reject penalty: -{score.rejectPenalty.toFixed(1)}
        </div>
      )}

      {score.matchedSkills.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-xs font-medium text-green-700 mb-1.5">
            <CheckCircle className="w-3.5 h-3.5" />
            Matched ({score.matchedSkills.length})
          </div>
          <div className="flex flex-wrap gap-1.5">
            {score.matchedSkills.map((s, i) => (
              <span key={i} className="px-2 py-0.5 bg-green-50 text-green-700 text-xs rounded-full border border-green-200">{s}</span>
            ))}
          </div>
        </div>
      )}

      {score.missingSkills.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-xs font-medium text-red-700 mb-1.5">
            <AlertCircle className="w-3.5 h-3.5" />
            Missing ({score.missingSkills.length})
          </div>
          <div className="flex flex-wrap gap-1.5">
            {score.missingSkills.map((s, i) => (
              <span key={i} className="px-2 py-0.5 bg-red-50 text-red-700 text-xs rounded-full border border-red-200">{s}</span>
            ))}
          </div>
        </div>
      )}

      {score.explanation && (
        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-600 mb-1">
            <TrendingUp className="w-3.5 h-3.5" />
            AI Evaluation
          </div>
          <p className="text-sm text-slate-700 whitespace-pre-line">{score.explanation}</p>
        </div>
      )}
    </div>
  );
}

interface Props {
  candidateId: string;
  onBack: () => void;
  ws: ReturnType<typeof useHRWebSocket>;
}

export function CandidateDetailPage({ candidateId, onBack, ws }: Props) {
  const [candidate, setCandidate] = useState<CandidateDetail | null>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<CandidateStatus>('new');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const c = await getCandidate(candidateId);
      setCandidate(c);
      setNotes(c.notes ?? '');
      setStatus(c.status);
      if (c.positionId) {
        getPosition(c.positionId).then(setPosition).catch(() => null);
      }
    } catch {
      alert('Candidate not found');
      onBack();
    } finally {
      setLoading(false);
    }
  }, [candidateId, onBack]);

  useEffect(() => { load(); }, [load]);

  // If candidate gets re-scored while viewing, refresh
  useEffect(() => {
    return ws.on('candidate:scored', (e) => {
      if (e.candidateId === candidateId) load();
    });
  }, [ws, candidateId, load]);

  const handleSave = async () => {
    if (!candidate) return;
    setSaving(true);
    try {
      await updateCandidate(candidateId, { status, notes });
      setCandidate((prev) => prev ? { ...prev, status, notes } : prev);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      alert('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-center py-12 text-slate-500">Loading...</div>;
  if (!candidate) return null;

  const latestScore = candidate.scores[0] ?? null;

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={onBack}
          className="flex items-center text-sm text-slate-600 hover:text-slate-800"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back
        </button>
        <h1 className="text-2xl font-bold text-slate-800">{candidate.name || 'Unknown'}</h1>
        {latestScore && (
          <span className={`px-3 py-1 rounded-lg border-2 font-bold text-lg ${GRADE_COLORS[latestScore.grade] ?? 'bg-slate-100 text-slate-700 border-slate-300'}`}>
            {latestScore.grade}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-5">
          {/* Basic info */}
          <div className="bg-white rounded-lg border border-slate-200 p-5">
            <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-4">
              Profile
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3">
              <InfoRow label="Email" value={candidate.email} />
              <InfoRow label="Phone" value={candidate.phone} />
              <InfoRow label="Position" value={position?.title} />
              <InfoRow label="University" value={candidate.university} />
              <InfoRow label="University Tier" value={candidate.universityTier} />
              <InfoRow label="Education" value={candidate.education} />
              <InfoRow label="JLPT" value={candidate.jlptLevel} />
              <InfoRow label="Major" value={candidate.major} />
              <InfoRow label="Work Years" value={candidate.workYears != null ? `${candidate.workYears} yrs` : null} />
              <InfoRow label="Age" value={candidate.age} />
              <InfoRow label="Gender" value={candidate.gender} />
              <InfoRow label="Relocation" value={
                candidate.relocationWilling === true ? 'Willing' :
                candidate.relocationWilling === false ? 'Not willing' : null
              } />
            </div>
          </div>

          {/* Skills */}
          {candidate.skills && candidate.skills.length > 0 && (
            <div className="bg-white rounded-lg border border-slate-200 p-5">
              <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-3">Skills</h2>
              <div className="flex flex-wrap gap-1.5">
                {candidate.skills.map((s, i) => (
                  <span key={i} className="px-2 py-0.5 bg-slate-100 text-slate-700 text-sm rounded">{s}</span>
                ))}
              </div>
            </div>
          )}

          {/* Scores */}
          <div className="bg-white rounded-lg border border-slate-200 p-5">
            <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-4">
              AI Score {latestScore && <span className="font-normal text-slate-400 ml-1">({latestScore.totalScore.toFixed(1)} pts)</span>}
            </h2>
            {latestScore ? (
              <ScorePanel score={latestScore} />
            ) : (
              <p className="text-sm text-slate-400">No scoring data available yet.</p>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-5">
          <div className="bg-white rounded-lg border border-slate-200 p-5">
            <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-4">Actions</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as CandidateStatus)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                >
                  {STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  rows={5}
                  placeholder="Add HR notes..."
                />
              </div>

              <button
                onClick={handleSave}
                disabled={saving}
                className="w-full flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 text-sm"
              >
                {saving ? (
                  'Saving...'
                ) : saved ? (
                  <><CheckCircle className="w-4 h-4 mr-1.5" /> Saved</>
                ) : (
                  <><Save className="w-4 h-4 mr-1.5" /> Save</>
                )}
              </button>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-slate-200 p-5">
            <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-3">Meta</h2>
            <div className="space-y-2 text-sm">
              <div>
                <span className="text-xs text-slate-400">Created</span>
                <p className="text-slate-700">{new Date(candidate.createdAt).toLocaleString()}</p>
              </div>
              <div>
                <span className="text-xs text-slate-400">Updated</span>
                <p className="text-slate-700">{new Date(candidate.updatedAt).toLocaleString()}</p>
              </div>
              <div>
                <span className="text-xs text-slate-400">Score records</span>
                <p className="text-slate-700">{candidate.scores.length}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
