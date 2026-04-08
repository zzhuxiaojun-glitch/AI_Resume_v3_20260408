import { useDroppable } from '@dnd-kit/core';
import { KanbanCard } from './KanbanCard';
import type { CandidateListItem, CandidateStatus } from '../lib/types';

interface Props {
  id: CandidateStatus;
  title: string;
  candidates: CandidateListItem[];
  positionMap: Record<string, string>;
  onViewDetail: (id: string) => void;
}

export function KanbanColumn({ id, title, candidates, positionMap, onViewDetail }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={`shrink-0 w-64 rounded-lg border-2 p-3 min-h-96 transition-colors ${
        isOver ? 'border-blue-400 bg-blue-50/40' : 'border-slate-200 bg-slate-50'
      }`}
    >
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-semibold text-sm text-slate-700">{title}</h3>
        <span className="text-xs text-slate-400 bg-slate-200 px-1.5 py-0.5 rounded-full">
          {candidates.length}
        </span>
      </div>
      <div className="space-y-2">
        {candidates.map((c) => (
          <KanbanCard
            key={c.id}
            candidate={c}
            positionTitle={positionMap[c.positionId]}
            onViewDetail={onViewDetail}
          />
        ))}
      </div>
    </div>
  );
}
