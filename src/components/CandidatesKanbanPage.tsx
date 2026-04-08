import { useState, useEffect, useCallback } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { getCandidates, getPositions, updateCandidate } from '../lib/api';
import type { CandidateListItem, CandidateStatus, Position } from '../lib/types';
import { KanbanColumn } from './KanbanColumn';
import { KanbanCard } from './KanbanCard';
import type { useHRWebSocket } from '../hooks/useWebSocket';

const STATUS_COLUMNS: { id: CandidateStatus; title: string }[] = [
  { id: 'new', title: 'New' },
  { id: 'screening', title: 'Screening' },
  { id: 'shortlisted', title: 'Shortlisted' },
  { id: 'interviewed', title: 'Interviewed' },
  { id: 'hired', title: 'Hired' },
  { id: 'rejected', title: 'Rejected' },
];

interface Props {
  onViewDetail: (id: string) => void;
  ws: ReturnType<typeof useHRWebSocket>;
}

export function CandidatesKanbanPage({ onViewDetail, ws }: Props) {
  const [candidates, setCandidates] = useState<CandidateListItem[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [positionFilter, setPositionFilter] = useState('');

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const load = useCallback(async () => {
    const [cands, pos] = await Promise.all([getCandidates(), getPositions()]);
    setCandidates(cands);
    setPositions(pos);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    return ws.on('candidate:new', () => { getCandidates().then(setCandidates); });
  }, [ws]);

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

  const positionMap = Object.fromEntries(positions.map((p) => [p.id, p.title]));
  const filtered = positionFilter
    ? candidates.filter((c) => c.positionId === positionFilter)
    : candidates;

  const byStatus = (status: CandidateStatus) =>
    filtered.filter((c) => (c.status || 'new') === status);

  const handleDragStart = (event: DragStartEvent) => setActiveId(String(event.active.id));

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;
    const newStatus = over.id as CandidateStatus;
    if (!STATUS_COLUMNS.some((col) => col.id === newStatus)) return;
    const candidateId = String(active.id);
    const candidate = candidates.find((c) => c.id === candidateId);
    if (!candidate || candidate.status === newStatus) return;

    try {
      await updateCandidate(candidateId, { status: newStatus });
      setCandidates((prev) =>
        prev.map((c) => (c.id === candidateId ? { ...c, status: newStatus } : c))
      );
    } catch {
      alert('Failed to update status');
    }
  };

  const activeCandidate = activeId ? candidates.find((c) => c.id === activeId) : null;

  if (loading) return <div className="text-center py-12 text-slate-500">Loading...</div>;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Kanban</h1>
        <select
          value={positionFilter}
          onChange={(e) => setPositionFilter(e.target.value)}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
        >
          <option value="">All Positions</option>
          {positions.map((p) => (
            <option key={p.id} value={p.id}>{p.title}</option>
          ))}
        </select>
      </div>

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-4">
          {STATUS_COLUMNS.map((col) => (
            <KanbanColumn
              key={col.id}
              id={col.id}
              title={col.title}
              candidates={byStatus(col.id)}
              positionMap={positionMap}
              onViewDetail={onViewDetail}
            />
          ))}
        </div>

        <DragOverlay>
          {activeCandidate ? (
            <KanbanCard
              candidate={activeCandidate}
              positionTitle={positionMap[activeCandidate.positionId]}
              onViewDetail={onViewDetail}
              isDragOverlay
            />
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
