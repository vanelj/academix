'use client';

import { ArrowRight, BookOpen, Search, TriangleAlert } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { AnchorLink, PlainImage } from '../../context/AcademixUIProvider';
import { buildHref } from '../../config/routes';
import { cn } from '../../lib/cn';
import { getCategoryVisual } from '../../lib/visuals';
import { ALL, type CourseSummary, type FilterOption, type ImageComponent, type LinkComponent, type LoadStatus, type PublicRoutes } from '../../types';
import { CourseCard, CourseCardSkeleton } from '../courses/CourseCard';
import { courseGridClass } from '../courses/CourseResults';
import { Button, ButtonLink, buttonClasses } from '../ui/Button';
import { CategoryIcon } from '../ui/CategoryIcon';
import { Skeleton } from '../ui/Skeleton';
import { StatePanel } from '../ui/StatePanel';

export interface CatalogPreviewProps {
  /** Cursos destacados (se muestran hasta `limit`). */
  courses: CourseSummary[];
  /** Categorías para los chips. Si se omite, se derivan de `courses`. */
  categories?: FilterOption[];
  status?: LoadStatus;
  routes: PublicRoutes;
  limit?: number;
  /** Texto de la nota inferior (p. ej. aviso de datos demo). Omitir en producción. */
  footnote?: string;
  /**
   * Modo controlado: si se pasa, los chips llaman a esta función
   * (p. ej. para pedir a Supabase los cursos de esa categoría).
   * Si no, filtra `courses` en el cliente.
   */
  onCategoryChange?: (slug: string) => void;
  selectedCategory?: string;
  /** Reintentar la consulta (estado de error). */
  onRetry?: () => void;
  /** Acción del estado vacío (aún no hay cursos publicados). */
  emptyAction?: ReactNode;
  linkComponent?: LinkComponent;
  imageComponent?: ImageComponent;
}

/** Sección «Explora la oferta» de Inicio: buscador, chips de categoría y cursos. */
export function CatalogPreview({
  courses,
  categories,
  status = 'ready',
  routes,
  limit = 4,
  footnote,
  onCategoryChange,
  selectedCategory,
  onRetry,
  emptyAction,
  linkComponent = AnchorLink,
  imageComponent = PlainImage,
}: CatalogPreviewProps) {
  const [localCat, setLocalCat] = useState<string>(ALL);
  const cat = selectedCategory ?? localCat;

  const chips = useMemo<FilterOption[]>(() => {
    if (categories) return [{ value: ALL, label: 'Todas' }, ...categories.filter((c) => c.value !== ALL)];
    const seen = new Map<string, FilterOption>();
    courses.forEach((c) =>
      seen.set(c.category.slug, { value: c.category.slug, label: c.category.name, visual: getCategoryVisual(c.category) }),
    );
    return [{ value: ALL, label: 'Todas' }, ...seen.values()];
  }, [categories, courses]);

  const visible = useMemo(
    () => (onCategoryChange ? courses : courses.filter((c) => cat === ALL || c.category.slug === cat)).slice(0, limit),
    [courses, cat, limit, onCategoryChange],
  );

  const pick = (v: string) => (onCategoryChange ? onCategoryChange(v) : setLocalCat(v));

  return (
    <section aria-labelledby="ax-catalog-title" className="pb-[88px] pt-6">
      <div className="mx-auto flex max-w-[1240px] flex-col gap-6 px-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-2">
            <span className="font-ax-mono text-[13px] tracking-[0.02em] text-ax-blue-text">01 / catálogo</span>
            <h2 id="ax-catalog-title" className="font-ax-display text-[clamp(30px,3.2vw,42px)] font-bold leading-[1.06] tracking-[-0.03em]">
              Explora la oferta
            </h2>
          </div>
          {/* GET al catálogo: funciona con cualquier enrutador (?q=…) */}
          <form
            role="search"
            action={routes.courses}
            method="get"
            className="flex flex-[0_1_520px] items-center gap-2.5 rounded-[14px] border border-ax-line bg-ax-surface py-1.5 pl-4 pr-1.5"
          >
            <Search aria-hidden size={18} className="shrink-0 text-ax-muted" />
            <label className="min-w-0 flex-1">
              <span className="sr-only">Buscar cursos</span>
              <input
                type="search"
                name="q"
                placeholder="Buscar cursos"
                className="h-11 w-full border-0 bg-transparent font-ax-body text-[15.5px] font-medium text-ax-ink outline-none placeholder:text-ax-muted"
              />
            </label>
            <button type="submit" className={buttonClasses('primary', 'sm')}>
              Buscar
            </button>
          </form>
        </div>

        {status === 'loading' ? (
          <div aria-hidden className="ax-chip-row flex flex-wrap gap-2.5">
            {[96, 132, 118, 104].map((w) => (
              <Skeleton key={w} className="h-11 shrink-0" style={{ width: w }} radius={999} />
            ))}
          </div>
        ) : chips.length > 1 ? (
          <div className="ax-chip-row flex flex-wrap gap-2.5" role="group" aria-label="Filtrar por categoría">
            {chips.map((k) => {
              const on = k.value === cat;
              return (
                <button
                  key={k.value}
                  type="button"
                  aria-pressed={on}
                  onClick={() => pick(k.value)}
                  className={cn(
                    'inline-flex min-h-[44px] shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap rounded-full border pl-2.5 pr-4 font-ax-display text-[14.5px] font-semibold transition-colors',
                    on ? 'border-ax-ink bg-ax-ink text-ax-bg' : 'border-ax-line bg-ax-surface text-ax-ink hover:border-ax-blue-text',
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      'flex h-7 w-7 items-center justify-center rounded-full',
                      on ? 'bg-white/15 text-inherit' : 'bg-ax-soft-blue text-ax-blue-text',
                    )}
                  >
                    <CategoryIcon visual={k.value === ALL ? 'all' : (k.visual ?? getCategoryVisual({ slug: k.value, name: k.label }))} size={15} />
                  </span>
                  {k.label}
                </button>
              );
            })}
          </div>
        ) : null}

        {status === 'loading' ? (
          <div aria-busy="true" aria-label="Cargando cursos" className={courseGridClass}>
            {Array.from({ length: limit }, (_, i) => (
              <CourseCardSkeleton key={i} />
            ))}
          </div>
        ) : status === 'error' ? (
          <StatePanel
            alert
            tone="error"
            icon={<TriangleAlert size={28} strokeWidth={1.8} />}
            title="No se pudo cargar la oferta"
            description="Hubo un problema al consultar los cursos publicados. Inténtalo de nuevo en unos minutos."
            action={onRetry ? <Button size="sm" onClick={onRetry}>Reintentar</Button> : undefined}
          />
        ) : courses.length === 0 ? (
          <StatePanel
            icon={<BookOpen size={28} strokeWidth={1.8} />}
            title="Aún no hay cursos publicados"
            description="Cuando las instituciones publiquen sus cursos virtuales, aparecerán aquí."
            action={emptyAction}
          />
        ) : visible.length > 0 ? (
          <div className={courseGridClass}>
            {visible.map((c) => (
              <CourseCard
                key={c.id}
                course={c}
                href={buildHref(routes.courseDetail, { slug: c.slug ?? c.id, id: c.id })}
                showDescription={false}
                headingLevel="h3"
                linkComponent={linkComponent}
                imageComponent={imageComponent}
              />
            ))}
          </div>
        ) : (
          <p className="rounded-[18px] border border-dashed border-ax-line bg-ax-surface px-6 py-10 text-center text-ax-muted">
            Aún no hay cursos publicados en esta categoría.
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          {footnote ? <p className="font-ax-mono text-[13px] tracking-[0.02em] text-ax-muted">{footnote}</p> : <span />}
          <ButtonLink href={routes.courses} variant="ghost" size="sm" linkComponent={linkComponent}>
            Ver catálogo completo
            <ArrowRight aria-hidden size={16} />
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}
