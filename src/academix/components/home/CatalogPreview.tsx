'use client';

import { ArrowRight, BookOpen, Search, TriangleAlert } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { AnchorLink, PlainImage } from '../../context/AcademixUIProvider';
import { buildHref } from '../../config/routes';
import { cn } from '../../lib/cn';
import { getCategoryDotColor, getCategoryVisual } from '../../lib/visuals';
import {
  ALL,
  type CourseSummary,
  type FilterOption,
  type ImageComponent,
  type LinkComponent,
  type LoadStatus,
  type PublicRoutes,
} from '../../types';
import { CourseCard, CourseCardSkeleton } from '../courses/CourseCard';
import { courseGridClass } from '../courses/CourseResults';
import { Button, ButtonLink, buttonClasses } from '../ui/Button';
import { Skeleton } from '../ui/Skeleton';
import { StatePanel } from '../ui/StatePanel';
import { DemoTag } from '../ui/Tags';

export interface CatalogPreviewProps {
  /** Cursos destacados (se muestran hasta `limit`). */
  courses: CourseSummary[];
  /** Categorías para los chips. Si se omite, se derivan de `courses`. */
  categories?: FilterOption[];
  status?: LoadStatus;
  routes: PublicRoutes;
  limit?: number;
  /** Etiqueta junto al título (p. ej. «Datos de demostración»). Omitir en producción. */
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

/** Bloque «¿Qué quieres aprender hoy?» + «Cursos para empezar». */
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
    <section aria-labelledby="ax-catalog-title" className="px-5 pb-[88px]">
      <div className="mx-auto flex max-w-[1240px] flex-col gap-7">
        <div className="relative flex flex-col items-center gap-[22px] overflow-hidden rounded-[36px] bg-ax-soft-violet p-[clamp(24px,4vw,48px)] text-center">
          <div aria-hidden className="absolute -bottom-10 -left-10 h-[120px] w-[120px] rounded-full border-[18px] border-ax-yellow opacity-80" />
          <div aria-hidden className="absolute right-7 top-6 h-10 w-10 rotate-[16deg] rounded-xl bg-ax-coral" />
          <h2
            id="ax-catalog-title"
            className="relative font-ax-display text-[clamp(30px,4vw,48px)] font-extrabold leading-[1.04] tracking-[-0.03em] text-balance"
          >
            ¿Qué quieres aprender hoy?
          </h2>
          {/* GET al catálogo: funciona con cualquier enrutador (?q=…) */}
          <form
            role="search"
            action={routes.courses}
            method="get"
            className="relative box-border flex w-full max-w-[720px] gap-2 rounded-full bg-ax-surface p-2 shadow-ax"
          >
            <label className="flex min-w-0 flex-1 items-center gap-2.5 pl-3.5">
              <span className="sr-only">Buscar cursos</span>
              <Search aria-hidden size={20} strokeWidth={2.2} className="shrink-0 text-ax-muted" />
              <input
                type="search"
                name="q"
                placeholder="Busca un curso o una institución"
                autoComplete="off"
                className="h-12 min-w-0 flex-1 border-0 bg-transparent font-ax-body text-base font-medium text-ax-ink outline-none placeholder:text-ax-muted"
              />
            </label>
            <button type="submit" className={buttonClasses('primary', 'md')}>
              Buscar
            </button>
          </form>
          {status === 'loading' ? (
            <div aria-hidden className="ax-chip-row relative flex w-full flex-wrap justify-center gap-2.5">
              {[92, 128, 112, 104, 120].map((w) => (
                <Skeleton key={w} className="h-11 shrink-0" style={{ width: w }} radius={999} />
              ))}
            </div>
          ) : chips.length > 1 ? (
            <div role="group" aria-label="Filtrar por categoría" className="ax-chip-row relative flex w-full flex-wrap justify-center gap-2.5">
              {chips.map((o) => {
                const on = o.value === cat;
                const visual = o.value === ALL ? 'all' : (o.visual ?? getCategoryVisual({ slug: o.value, name: o.label }));
                const dot = o.value === ALL ? (on ? '#FFC93C' : 'var(--ax-ink)') : getCategoryDotColor(visual);
                return (
                  <button
                    key={o.value}
                    type="button"
                    aria-pressed={on}
                    onClick={() => pick(o.value)}
                    className={cn(
                      'inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap rounded-full border-2 px-4 font-ax-body text-[15px] font-semibold transition-[border-color,transform,background-color,color] duration-200 hover:-translate-y-0.5',
                      on ? 'border-ax-ink bg-ax-ink text-ax-bg' : 'border-ax-line bg-ax-surface text-ax-ink hover:border-ax-violet-text',
                    )}
                  >
                    <span aria-hidden className="h-3 w-3 shrink-0 rounded-full" style={{ background: dot }} />
                    {o.label}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="font-ax-display text-[clamp(28px,3vw,38px)] font-extrabold leading-[1.04] tracking-[-0.03em]">
            Cursos para empezar
          </h2>
          {footnote ? <DemoTag>{footnote}</DemoTag> : null}
        </div>

        {status === 'loading' ? (
          <div aria-busy="true" aria-label="Cargando cursos" className={courseGridClass}>
            {Array.from({ length: limit }, (_, i) => (
              <CourseCardSkeleton key={i} />
            ))}
          </div>
        ) : status === 'error' ? (
          <StatePanel
            alert
            tone="coral"
            icon={<TriangleAlert size={32} />}
            title="No se pudo cargar la oferta"
            description="Hubo un problema al consultar los cursos publicados. Inténtalo de nuevo en unos minutos."
            action={onRetry ? <Button size="sm" onClick={onRetry}>Reintentar</Button> : undefined}
          />
        ) : courses.length === 0 ? (
          <StatePanel
            tone="yellow"
            icon={<BookOpen size={32} />}
            title="Aún no hay cursos publicados"
            description="Cuando las instituciones publiquen sus cursos virtuales, aparecerán aquí."
            action={emptyAction}
          />
        ) : visible.length === 0 ? (
          <p className="rounded-3xl bg-ax-surface p-8 text-center text-base text-ax-muted shadow-ax">
            Aún no hay cursos publicados en esta categoría.
          </p>
        ) : (
          <div className={courseGridClass}>
            {visible.map((c) => (
              <CourseCard
                key={c.id}
                course={c}
                variant="compact"
                headingLevel="h3"
                href={buildHref(routes.courseDetail, { slug: c.slug ?? c.id, id: c.id })}
                linkComponent={linkComponent}
                imageComponent={imageComponent}
              />
            ))}
          </div>
        )}

        <div className="flex justify-center">
          <ButtonLink href={routes.courses} variant="soft" linkComponent={linkComponent}>
            Ver catálogo completo
            <ArrowRight aria-hidden size={18} strokeWidth={2.4} />
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}
