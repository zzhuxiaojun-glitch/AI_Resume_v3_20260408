import React, { useState, useEffect, useCallback } from 'react';
import { Upload, FileText, Loader, CheckCircle, XCircle } from 'lucide-react';
import { getPositions, uploadResume } from '../lib/api';
import type { Position } from '../lib/types';
import type { useHRWebSocket } from '../hooks/useWebSocket';

type FileStatus = 'pending' | 'uploading' | 'success' | 'error';

interface FileItem {
  file: File;
  status: FileStatus;
  error?: string;
  result?: { grade: string; totalScore: number };
}

interface Props {
  ws: ReturnType<typeof useHRWebSocket>;
}

export function UploadPage({ ws: _ }: Props) {
  const [positions, setPositions] = useState<Position[]>([]);
  const [selectedPosition, setSelectedPosition] = useState('');
  const [items, setItems] = useState<FileItem[]>([]);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    const pos = await getPositions();
    const open = pos.filter((p) => p.status === 'open');
    setPositions(open);
    if (open.length > 0) setSelectedPosition(open[0].id);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const newFiles = Array.from(e.target.files).map((file): FileItem => ({
      file,
      status: 'pending',
    }));
    setItems((prev) => [...prev, ...newFiles]);
    e.target.value = '';
  };

  const removeFile = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const update = (index: number, patch: Partial<FileItem>) => {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  const handleUpload = async () => {
    if (!selectedPosition || items.length === 0) return;
    setUploading(true);

    for (let i = 0; i < items.length; i++) {
      if (items[i].status === 'success') continue;
      update(i, { status: 'uploading' });
      try {
        const result = await uploadResume(items[i].file, selectedPosition);
        update(i, {
          status: 'success',
          result: {
            grade: result.score.grade,
            totalScore: result.score.totalScore,
          },
        });
      } catch (err) {
        update(i, { status: 'error', error: (err as Error).message });
      }
    }

    setUploading(false);
  };

  const pendingCount = items.filter((i) => i.status === 'pending').length;

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-6">Upload Resumes</h1>

      <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-6">
        {/* Position selector */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Position *</label>
          <select
            value={selectedPosition}
            onChange={(e) => setSelectedPosition(e.target.value)}
            disabled={uploading}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Choose a position...</option>
            {positions.map((p) => (
              <option key={p.id} value={p.id}>{p.title}</option>
            ))}
          </select>
        </div>

        {/* Drop zone */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Resume files (PDF, DOCX)
          </label>
          <label
            htmlFor="file-upload"
            className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-lg p-10 text-center cursor-pointer hover:border-blue-400 transition-colors"
          >
            <Upload className="w-10 h-10 text-slate-400 mb-2" />
            <span className="text-sm text-slate-600">Click to select or drag &amp; drop</span>
            <span className="text-xs text-slate-400 mt-1">PDF, DOCX · max 10 MB each</span>
            <input
              id="file-upload"
              type="file"
              multiple
              accept=".pdf,.docx,.doc"
              onChange={handleFileSelect}
              disabled={uploading}
              className="hidden"
            />
          </label>
        </div>

        {/* File list */}
        {items.length > 0 && (
          <div className="space-y-2">
            {items.map((item, i) => (
              <div key={i} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                {item.status === 'pending' && <FileText className="w-5 h-5 text-slate-400 shrink-0" />}
                {item.status === 'uploading' && <Loader className="w-5 h-5 text-blue-500 animate-spin shrink-0" />}
                {item.status === 'success' && <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />}
                {item.status === 'error' && <XCircle className="w-5 h-5 text-red-600 shrink-0" />}

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-700 truncate">{item.file.name}</p>
                  <p className="text-xs text-slate-400">
                    {item.status === 'pending' && `${(item.file.size / 1024).toFixed(1)} KB`}
                    {item.status === 'uploading' && 'Uploading & scoring...'}
                    {item.status === 'success' && item.result && (
                      `Done — Grade ${item.result.grade} · ${item.result.totalScore.toFixed(1)} pts`
                    )}
                    {item.status === 'error' && `Error: ${item.error}`}
                  </p>
                </div>

                {item.status === 'pending' && !uploading && (
                  <button onClick={() => removeFile(i)} className="text-slate-400 hover:text-red-500">
                    <XCircle className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end">
          <button
            onClick={handleUpload}
            disabled={!selectedPosition || pendingCount === 0 || uploading}
            className="flex items-center px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            {uploading ? (
              <>
                <Loader className="w-4 h-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                Upload &amp; Score ({pendingCount})
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
