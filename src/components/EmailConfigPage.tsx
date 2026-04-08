import React, { useState, useEffect } from 'react';
import { supabase, Position, EmailConfig } from '../lib/supabase';
import { Mail, Save, Loader, Download } from 'lucide-react';

export function EmailConfigPage() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [configs, setConfigs] = useState<EmailConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [formData, setFormData] = useState({
    position_id: '',
    server: 'imap.gmail.com',
    port: 993,
    email: '',
    password: '',
    folder: 'INBOX',
    search_keywords: '',
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const { data: positionsData, error: positionsError } = await supabase
        .from('positions')
        .select('*')
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (positionsError) throw positionsError;
      setPositions(positionsData || []);

      if (positionsData && positionsData.length > 0 && !formData.position_id) {
        setFormData((prev) => ({ ...prev, position_id: positionsData[0].id }));
      }

      const { data: configsData, error: configsError } = await supabase
        .from('email_configs')
        .select('*')
        .order('created_at', { ascending: false });

      if (configsError) throw configsError;
      setConfigs(configsData || []);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const { error } = await supabase.from('email_configs').insert({
        ...formData,
        is_active: true,
      });

      if (error) throw error;

      alert('Email configuration saved successfully');
      loadData();
      setFormData({
        position_id: positions[0]?.id || '',
        server: 'imap.gmail.com',
        port: 993,
        email: '',
        password: '',
        folder: 'INBOX',
        search_keywords: '',
      });
    } catch (error) {
      console.error('Error saving config:', error);
      alert('Failed to save configuration');
    }
  };

  const handleSyncEmails = async (configId: string) => {
    setSyncing(true);

    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/import-emails`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ config_id: configId }),
      });

      if (!response.ok) {
        throw new Error('Email import failed');
      }

      const result = await response.json();
      alert(`Imported ${result.count || 0} resumes successfully`);
    } catch (error) {
      console.error('Error syncing emails:', error);
      alert('Failed to sync emails');
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return <div className="text-center py-12">Loading...</div>;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-6">Email Import Configuration</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">Add Email Configuration</h2>

          <form onSubmit={handleSaveConfig} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Position *
              </label>
              <select
                value={formData.position_id}
                onChange={(e) => setFormData({ ...formData, position_id: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              >
                <option value="">Select a position...</option>
                {positions.map((pos) => (
                  <option key={pos.id} value={pos.id}>
                    {pos.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  IMAP Server *
                </label>
                <input
                  type="text"
                  value={formData.server}
                  onChange={(e) => setFormData({ ...formData, server: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="imap.gmail.com"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Port *
                </label>
                <input
                  type="number"
                  value={formData.port}
                  onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Email Address *
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="hr@company.com"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Password *
              </label>
              <input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="••••••••"
                required
              />
              <p className="text-xs text-slate-500 mt-1">
                For Gmail, use an App Password instead of your regular password
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Folder
              </label>
              <input
                type="text"
                value={formData.folder}
                onChange={(e) => setFormData({ ...formData, folder: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="INBOX"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Search Keywords
              </label>
              <input
                type="text"
                value={formData.search_keywords}
                onChange={(e) => setFormData({ ...formData, search_keywords: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="resume, cv, application"
              />
              <p className="text-xs text-slate-500 mt-1">
                Optional: Filter emails by subject keywords (comma-separated)
              </p>
            </div>

            <button
              type="submit"
              className="w-full flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Save className="w-4 h-4 mr-2" />
              Save Configuration
            </button>
          </form>

          <div className="mt-6 p-4 bg-blue-50 rounded-lg">
            <h4 className="text-sm font-medium text-blue-800 mb-2">Setup Instructions</h4>
            <ol className="text-xs text-blue-700 space-y-1 list-decimal list-inside">
              <li>For Gmail: Enable IMAP in Settings → Forwarding and POP/IMAP</li>
              <li>Create an App Password in your Google Account settings</li>
              <li>Use the App Password instead of your regular password</li>
              <li>For other email providers, use their IMAP server address and port</li>
            </ol>
          </div>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-slate-800 mb-4">Saved Configurations</h2>

          <div className="space-y-4">
            {configs.map((config) => {
              const position = positions.find((p) => p.id === config.position_id);
              return (
                <div key={config.id} className="bg-white rounded-lg shadow-md p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center">
                      <div className="bg-blue-100 p-2 rounded-lg mr-3">
                        <Mail className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-slate-800">{config.email}</h3>
                        <p className="text-sm text-slate-600">{position?.title || 'Unknown Position'}</p>
                      </div>
                    </div>
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${
                        config.is_active
                          ? 'bg-green-100 text-green-700'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {config.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm mb-4">
                    <div>
                      <span className="text-slate-500">Server:</span>
                      <p className="font-medium text-slate-800">
                        {config.server}:{config.port}
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-500">Folder:</span>
                      <p className="font-medium text-slate-800">{config.folder}</p>
                    </div>
                    {config.last_sync_at && (
                      <div className="col-span-2">
                        <span className="text-slate-500">Last Sync:</span>
                        <p className="font-medium text-slate-800">
                          {new Date(config.last_sync_at).toLocaleString()}
                        </p>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => handleSyncEmails(config.id)}
                    disabled={syncing}
                    className="w-full flex items-center justify-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {syncing ? (
                      <>
                        <Loader className="w-4 h-4 mr-2 animate-spin" />
                        Syncing...
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4 mr-2" />
                        Import Latest Resumes
                      </>
                    )}
                  </button>
                </div>
              );
            })}

            {configs.length === 0 && (
              <div className="text-center py-12 text-slate-500">
                No email configurations yet. Add one to get started.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
