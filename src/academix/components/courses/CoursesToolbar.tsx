import { ListFilter, X } from 'lucide-react';
import type { CourseSort } from '../../types';
import { Button } from '../ui/Button';
import { FieldLabel } from '../ui/Fields';

export interface ActiveChip {
  key: string;
  label: string;
  ariaLabel: string;
  onRemove: () => void;
}

export interface CoursesToolbarProps {
  resultText: string;
  sort: CourseSort;
  onSortChange: (s: CourseSort) => void;
  filtersOpen: boolean;
  onToggleFilters: () => void;
  filtersPanelId?: string;
  chips: ActiveChip[];
}

/** Resultados, orden, botón de filtros (móvil) y filtros activos. */
export function CoursesToolbar({
  resultText,
  sort,
  onSortChange,
  filtersOpen,
  onToggleFilters,
  filtersPanelId = 'ax-course-filters',
  chips,
}: CoursesToolbarProps) {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 max-[900px]:order-1 max-[900px]:w-full">
        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            variant="ghost"
            size="sm"
            className="min-[900px]:hidden"
            aria-expanded={filtersOpen}
            aria-controls={filtersPanelId}
            onClick={onToggleFilters}
          >
            <ListFilter aria-hidden size={16} />
            Filtros
          </Button>
          <p aria-live="polite" className="text-[15px] text-ax-muted">
            {resultText}
          </p>
        </div>
        <label className="flex items-center gap-2.5">
          <FieldLabel>ordenar</FieldLabel>
          <select
            className="ax-field ax-field--compact"
            value={sort}
            onChange={(e) => onSortChange(e.target.value as CourseSort)}
          >
            <option value="az">Nombre (A–Z)</option>
            <option value="precio-asc">Precio: menor a mayor</option>
            <option value="precio-desc">Precio: mayor a menor</option>
          </select>
        </label>
      </div>
      {chips.length > 0 ? (
        <div className="flex flex-wrap gap-2 max-[900px]:order-3 max-[900px]:w-full" aria-label="Filtros activos">
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              aria-label={c.ariaLabel}
              onClick={c.onRemove}
              className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full border-0 bg-ax-soft-blue px-3 text-sm font-semibold text-ax-blue-text hover:bg-ax-surface-2"
            >
              {c.label}
              <X aria-hidden size={14} strokeWidth={2.4} />
            </button>
          ))}
        </div>
      ) : null}
    </>
  );
}
