import { cn } from '../../lib/cn';
import type { FilterOption } from '../../types';
import { Button } from '../ui/Button';
import { FieldLabel, SelectField } from '../ui/Fields';
import { ModalityBadge } from '../ui/Tags';

export interface CourseFiltersPanelProps {
  categoryOptions: FilterOption[];
  category: string;
  onCategoryChange: (value: string) => void;
  institutionOptions: FilterOption[];
  institution: string;
  onInstitutionChange: (value: string) => void;
  hasFilters: boolean;
  onClear: () => void;
  /** En móvil el panel solo se muestra cuando está abierto. */
  mobileOpen: boolean;
  id?: string;
}

/** Barra lateral de filtros del catálogo. */
export function CourseFiltersPanel({
  categoryOptions,
  category,
  onCategoryChange,
  institutionOptions,
  institution,
  onInstitutionChange,
  hasFilters,
  onClear,
  mobileOpen,
  id = 'ax-course-filters',
}: CourseFiltersPanelProps) {
  return (
    <aside
      id={id}
      aria-label="Filtros"
      className={cn(
        'flex shrink-0 grow-0 basis-[272px] flex-col gap-[18px] self-start',
        'max-[900px]:order-2 max-[900px]:basis-full',
        mobileOpen ? 'max-[900px]:flex' : 'max-[900px]:hidden',
      )}
    >
      <div className="flex flex-col gap-2.5 rounded-[18px] border border-ax-line bg-ax-surface p-[18px]">
        <FieldLabel>categoría</FieldLabel>
        <div role="group" aria-label="Categoría" className="flex flex-col gap-0.5">
          {categoryOptions.map((o) => {
            const on = o.value === category;
            return (
              <button
                key={o.value}
                type="button"
                aria-pressed={on}
                onClick={() => onCategoryChange(o.value)}
                className={cn(
                  'flex min-h-[44px] w-full cursor-pointer items-center justify-between gap-2.5 rounded-[10px] border-0 px-3 text-left text-[15px] transition-colors',
                  on ? 'bg-ax-soft-blue font-semibold text-ax-blue-text' : 'bg-transparent font-medium text-ax-ink hover:bg-ax-surface-2',
                )}
              >
                <span>{o.label}</span>
                {o.count !== undefined ? <span className="font-ax-mono text-xs text-ax-muted">{o.count}</span> : null}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-3.5 rounded-[18px] border border-ax-line bg-ax-surface p-[18px]">
        <SelectField
          label="institución"
          value={institution}
          onChange={onInstitutionChange}
          options={institutionOptions}
          allLabel="Todas las instituciones"
        />
        <div className="flex flex-col gap-2">
          <FieldLabel>modalidad</FieldLabel>
          <div className="flex flex-wrap items-center gap-2.5">
            <ModalityBadge large />
            <span className="text-[13.5px] text-ax-muted">Todos los cursos son virtuales.</span>
          </div>
        </div>
      </div>

      {hasFilters ? (
        <Button variant="ghost" size="sm" onClick={onClear}>
          Limpiar filtros
        </Button>
      ) : null}
    </aside>
  );
}
