import { cn } from '../../lib/cn';
import { getCategoryDotColor, getCategoryVisual } from '../../lib/visuals';
import { ALL, type FilterOption } from '../../types';
import { Button } from '../ui/Button';
import { SelectField } from '../ui/Fields';
import { FieldLabel, ModalityBadge } from '../ui/Tags';

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

const panel = 'rounded-3xl bg-ax-surface p-5 shadow-ax';

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
        'flex shrink-0 grow-0 basis-[280px] flex-col gap-[18px] self-start',
        'max-[900px]:order-2 max-[900px]:basis-full',
        mobileOpen ? 'max-[900px]:flex' : 'max-[900px]:hidden',
      )}
    >
      <div className={cn(panel, 'flex flex-col gap-2.5')}>
        <FieldLabel>Categoría</FieldLabel>
        <div role="group" aria-label="Categoría" className="flex flex-col gap-0.5">
          {categoryOptions.map((o) => {
            const on = o.value === category;
            const visual = o.value === ALL ? 'all' : (o.visual ?? getCategoryVisual({ slug: o.value, name: o.label }));
            return (
              <button
                key={o.value}
                type="button"
                aria-pressed={on}
                onClick={() => onCategoryChange(o.value)}
                className={cn(
                  'flex min-h-[44px] w-full cursor-pointer items-center gap-2.5 rounded-[14px] border-0 px-3 text-left text-[15px] text-ax-ink transition-colors',
                  on ? 'bg-ax-soft-yellow font-bold' : 'bg-transparent font-medium hover:bg-ax-surface-2',
                )}
              >
                <span aria-hidden className="h-3 w-3 shrink-0 rounded-full" style={{ background: getCategoryDotColor(visual) }} />
                <span>{o.label}</span>
                {o.count !== undefined ? (
                  <span className="ml-auto min-w-6 rounded-full bg-ax-surface-2 px-2 py-px text-center text-[12.5px] font-bold text-ax-muted">
                    {o.count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <div className={cn(panel, 'flex flex-col gap-4')}>
        <SelectField
          label="Institución"
          value={institution}
          onChange={onInstitutionChange}
          options={institutionOptions}
          allLabel="Todas las instituciones"
        />
        <div className="flex flex-col gap-2">
          <FieldLabel>Modalidad</FieldLabel>
          <div className="flex flex-wrap items-center gap-2.5">
            <ModalityBadge large />
            <span className="text-[13.5px] text-ax-muted">Todos los cursos son virtuales.</span>
          </div>
        </div>
      </div>

      {hasFilters ? (
        <Button variant="outline" size="sm" onClick={onClear}>
          Limpiar filtros
        </Button>
      ) : null}
    </aside>
  );
}
