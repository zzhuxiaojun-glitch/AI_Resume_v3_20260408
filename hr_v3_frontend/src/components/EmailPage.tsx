import { useState, useEffect, useCallback } from 'react';
import { Mail, RefreshCw, Loader, CheckCircle } from 'lucide-react';
import { getPositions, pollInbox, getEmailStats } from '../lib/api';
import type { Position, EmailStats } from '../lib/types';
import type { useHRWebSocket } from '../hooks/useWebSocket';

interface Props {
  ws: ReturnType<typeof useHRWebSocket>;
}

export function EmailPage({ ws }: Props) {
  const [positions, setPositions] = useState<Position[]>([]);
  const [selectedPosition, setSelectedPosition] = useState('');
  const [stats, setStats] = useState<EmailStats | null>(null);
  const [polling, setPolling] = useState(false);
  const [lastResult, setLastResult] = useState<{ count: number } | null>(null);
  const [loading, setLoading] = useState(true);

  const loadStats = useCallback(async () => {
    const s = await getEmailStats();
    setStats(s);
  }, []);

  useEffect(() => {
    Promise.all([getPositions(), getEmailStats()]).then(([pos, s]) => {
      const open = pos.filter((p) => p.status === 'open');
      setPositions(open);
      if (open.length > 0) setSelectedPosition(open[0].id);
      setStats(s);
      setLoading(false);
    });
  }, []);

  // Refresh stats after inbox summary
  useEffect(() => {
    return ws.on('inbox:summary', () => { loadStats(); });
  }, [ws, loadStats]);

  const handlePoll = async () => {
    if (!selectedPosition) return;
    setPolling(true);
    setLastResult(null);
    try {
      const result = await pollInbox(selectedPosition);
      setLastResult({ count: result.count });
      // Stats will update when WS inbox:summary arrives
    } catch (err) {
      alert(`Poll failed: ${(err as Error).message}`);
    } finally {
      setPolling(false);
    }
  };

  if (loading) return <div className="text-center py-12 text-slate-500">Loading...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-6">Email Import</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Poll trigger */}
        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Mail className="w-5 h-5 text-blue-600" />
            <h2 className="text-base font-semibold text-slate-800">Trigger Inbox Poll</h2>
          </div>
          <p className="text-sm text-slate-500 mb-4">
            Fetch unread resume emails from the configured IMAP inbox, auto-parse and score them.
            Real-time updates will appear via WebSocket.
          </p>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Associate to position
              </label>
              <select
                value={selectedPosition}
                onChange={(e) => setSelectedPosition(e.target.value)}
                disabled={polling}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select position...</option>
                {positions.map((p) => (
                  <option key={p.id} value={p.id}>{p.title}</option>
                ))}
              </select>
            </div>

            <button
              onClick={handlePoll}
              disabled={!selectedPosition || polling}
              className="w-full flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors text-sm"
            >
              {polling ? (
                <><Loader className="w-4 h-4 mr-2 animate-spin" /> Polling inbox...</>
              ) : (
                <><RefreshCw className="w-4 h-4 mr-2" /> Poll inbox</>
              )}
            </button>

            {lastResult && (
              <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2 border border-green-200">
                <CheckCircle className="w-4 h-4 shrink-0" />
                Poll complete — {lastResult.count} new candidate{lastResult.count !== 1 ? 's' : ''} queued for scoring.
              </div>
            )}
          </div>
        </div>

        {/* Stats */}
        {stats && (
          <div className="bg-white rounded-lg border border-slate-200 p-6">
            <h2 className="text-base font-semibold text-slate-800 mb-4">Processing Statistics</h2>
            <div className="space-y-4">
              <div>
                <p className="text-xs text-slate-500 mb-2">Emails processed ({stats.emails.total} total)</p>
                <div className="grid grid-cols-3 gap-2">
                  {Object.entries(stats.emails.byClassification).map(([key, val]) => (
                    <div key={key} className="text-center p-2 bg-slate-50 rounded-lg">
                      <p className="text-lg font-bold text-slate-700">{val as number}</p>
                      <p className="text-xs text-slate-400 capitalize">{key.replace('_', ' ')}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs text-slate-500 mb-2">Candidates</p>
                <div className="grid grid-cols-3 gap-2">
                  <div className="text-center p-2 bg-blue-50 rounded-lg">
                    <p className="text-lg font-bold text-blue-700">{stats.candidates.total}</p>
                    <p className="text-xs text-slate-400">Total</p>
                  </div>
                  <div className="text-center p-2 bg-green-50 rounded-lg">
                    <p className="text-lg font-bold text-green-700">{stats.candidates.withScore}</p>
                    <p className="text-xs text-slate-400">Scored</p>
                  </div>
                  <div className="text-center p-2 bg-slate-50 rounded-lg">
                    <p className="text-lg font-bold text-slate-700">{stats.candidates.withoutScore}</p>
                    <p className="text-xs text-slate-400">Pending</p>
                  </div>
                </div>
              </div>

              {stats.emails.byStatus && (
                <div>
                  <p className="text-xs text-slate-500 mb-2">Email status breakdown</p>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(stats.emails.byStatus).map(([key, val]) => (
                      <div key={key} className="flex justify-between text-sm px-2 py-1 bg-slate-50 rounded">
                        <span className="text-slate-500 capitalize">{key}</span>
                        <span className="font-medium text-slate-700">{val as number}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
