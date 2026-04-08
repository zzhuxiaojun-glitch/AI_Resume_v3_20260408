import { useDraggable } from '@dnd-kit/core';
import type { CandidateListItem, Grade } from '../lib/types';

const GRADE_COLORS: Record<Grade, string> = {
  A: 'bg-green-100 text-green-800',
  B: 'bg-blue-100 text-blue-800',
  C: 'bg-yellow-100 text-yellow-800',
  D: 'bg-orange-100 text-orange-800',
  F: 'bg-red-100 text-red-800',
};

interface Props {
  candidate: CandidateListItem;
  positionTitle?: string;
  onViewDetail: (id: string) => void;
  isDragOverlay?: boolean;
}

export function KanbanCard({ candidate: c, positionTitle, onViewDetail, isDragOverlay }: Props) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: c.id });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`bg-white rounded-lg border border-slate-200 p-3 cursor-grab active:cursor-grabbing transition-shadow ${
        isDragging && !isDragOverlay ? 'opacity-40' : 'hover:shadow-md'
      } ${isDragOverlay ? 'shadow-lg rotate-1' : ''}`}
    >
      <div className="flex justify-between items-start gap-2 mb-1">
        <p className="font-medium text-sm text-slate-800 truncate">{c.name || 'Unknown'}</p>
        {c.grade && (
          <span className={`shrink-0 px-1.5 py-0.5 rounded text-xs font-medium ${GRADE_COLORS[c.grade]}`}>
            {c.grade}
          </span>
        )}
      </div>

      {c.totalScore != null && (
        <div className="text-base font-bold text-blue-600 mb-1">{c.totalScore.toFixed(1)}</div>
      )}

      <div className="text-xs text-slate-500 space-y-0.5">
        {positionTitle && <div className="truncate">{positionTitle}</div>}
        {c.university && <div className="truncate">{c.university}</div>}
        {c.jlptLevel && <div>{c.jlptLevel}</div>}
      </div>

      {c.skills && c.skills.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {c.skills.slice(0, 3).map((s, i) => (
            <span key={i} className="px-1.5 py-0.5 bg-slate-100 text-slate-600 text-xs rounded">{s}</span>
          ))}
          {c.skills.length > 3 && (
            <span className="text-xs text-slate-400">+{c.skills.length - 3}</span>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onViewDetail(c.id); }}
        className="mt-2 w-full text-xs text-blue-600 hover:text-blue-800 text-center py-0.5"
      >
        View →
      </button>
    </div>
  );
}
