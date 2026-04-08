import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Edit2, Trash2, Save, X, Globe } from 'lucide-react';
import { getPositions, createPosition, updatePosition, deletePosition } from '../lib/api';
import type { Position } from '../lib/types';

const LOCALE_LABELS = { zh: '中文', ja: '日本語' };

function SkillTags({ skills, color }: { skills: string[]; color: string }) {
  if (skills.length === 0) return <span className="text-xs text-slate-400">None</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {skills.slice(0, 6).map((s, i) => (
        <span key={i} className={`px-2 py-0.5 text-xs rounded ${color}`}>{s}</span>
      ))}
      {skills.length > 6 && (
        <span className="text-xs text-slate-400 py-0.5">+{skills.length - 6}</span>
      )}
    </div>
  );
}

const EMPTY_FORM = {
  title: '',
  department: '',
  description: '',
  must: '',
  nice: '',
  reject: '',
  locale: 'zh' as 'zh' | 'ja',
  status: 'open' as 'open' | 'closed' | 'draft',
};

function formToPayload(form: typeof EMPTY_FORM) {
  const parseList = (raw: string) =>
    raw.split('\n').map((s) => s.trim()).filter(Boolean);
  return {
    title: form.title,
    department: form.department || undefined,
    description: form.description || undefined,
    skillConfig: {
      must: parseList(form.must),
      nice: parseList(form.nice),
      reject: parseList(form.reject),
    },
    locale: form.locale,
    status: form.status,
  };
}

function positionToForm(p: Position): typeof EMPTY_FORM {
  return {
    title: p.title,
    department: p.department ?? '',
    description: p.description ?? '',
    must: p.skillConfig.must.join('\n'),
    nice: p.skillConfig.nice.join('\n'),
    reject: p.skillConfig.reject.join('\n'),
    locale: p.locale,
    status: p.status,
  };
}

export function PositionsPage() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const load = useCallback(async () => {
    const data = await getPositions();
    setPositions(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    try {
      if (editingId) {
        await updatePosition(editingId, formToPayload(form));
      } else {
        await createPosition(formToPayload(form));
      }
      setShowForm(false);
      setEditingId(null);
      setForm(EMPTY_FORM);
      await load();
    } catch (err) {
      alert(`Failed to save: ${(err as Error).message}`);
    }
  };

  const handleEdit = (p: Position) => {
    setEditingId(p.id);
    setForm(positionToForm(p));
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this position?')) return;
    try {
      await deletePosition(id);
      setPositions((prev) => prev.filter((p) => p.id !== id));
    } catch {
      alert('Failed to delete position');
    }
  };

  if (loading) return <div className="text-center py-12 text-slate-500">Loading...</div>;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Positions</h1>
        <button
          onClick={() => { setForm(EMPTY_FORM); setEditingId(null); setShowForm(true); }}
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
        >
          <Plus className="w-4 h-4 mr-1.5" />
          New Position
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-lg border border-slate-200 p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-slate-800">
              {editingId ? 'Edit Position' : 'New Position'}
            </h2>
            <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600">
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Title *</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Department</label>
                <input
                  type="text"
                  value={form.department}
                  onChange={(e) => setForm({ ...form, department: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                rows={2}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Must-have skills <span className="text-xs text-slate-400">(one per line)</span>
                </label>
                <textarea
                  value={form.must}
                  onChange={(e) => setForm({ ...form, must: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500"
                  rows={4}
                  placeholder="TypeScript&#10;React&#10;SQL"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Nice-to-have <span className="text-xs text-slate-400">(one per line)</span>
                </label>
                <textarea
                  value={form.nice}
                  onChange={(e) => setForm({ ...form, nice: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500"
                  rows={4}
                  placeholder="Docker&#10;CI/CD"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Reject keywords <span className="text-xs text-slate-400">(one per line)</span>
                </label>
                <textarea
                  value={form.reject}
                  onChange={(e) => setForm({ ...form, reject: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500"
                  rows={4}
                  placeholder="无编程经验"
                />
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">AI Language</label>
                <select
                  value={form.locale}
                  onChange={(e) => setForm({ ...form, locale: e.target.value as 'zh' | 'ja' })}
                  className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
                >
                  <option value="zh">Chinese (中文)</option>
                  <option value="ja">Japanese (日本語)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value as Position['status'] })}
                  className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
                >
                  <option value="open">Open</option>
                  <option value="closed">Closed</option>
                  <option value="draft">Draft</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
              >
                <Save className="w-4 h-4 mr-1.5" />
                {editingId ? 'Update' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="space-y-3">
        {positions.map((p) => (
          <div key={p.id} className="bg-white rounded-lg border border-slate-200 p-5">
            <div className="flex justify-between items-start gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-slate-800">{p.title}</h3>
                  {p.department && (
                    <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                      {p.department}
                    </span>
                  )}
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    p.status === 'open' ? 'bg-green-100 text-green-700' :
                    p.status === 'closed' ? 'bg-slate-100 text-slate-500' :
                    'bg-yellow-100 text-yellow-700'
                  }`}>
                    {p.status}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-slate-400">
                    <Globe className="w-3 h-3" />
                    {LOCALE_LABELS[p.locale]}
                  </span>
                </div>
                {p.description && (
                  <p className="text-sm text-slate-500 mb-3 line-clamp-2">{p.description}</p>
                )}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <p className="text-xs text-slate-400 mb-1">Must-have ({p.skillConfig.must.length})</p>
                    <SkillTags skills={p.skillConfig.must} color="bg-red-50 text-red-700" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 mb-1">Nice-to-have ({p.skillConfig.nice.length})</p>
                    <SkillTags skills={p.skillConfig.nice} color="bg-green-50 text-green-700" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 mb-1">Reject ({p.skillConfig.reject.length})</p>
                    <SkillTags skills={p.skillConfig.reject} color="bg-slate-100 text-slate-600" />
                  </div>
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                <button
                  onClick={() => handleEdit(p)}
                  className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(p.id)}
                  className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
        {positions.length === 0 && (
          <div className="text-center py-16 text-slate-400">
            No positions yet. Create your first position to get started.
          </div>
        )}
      </div>
    </div>
  );
}
