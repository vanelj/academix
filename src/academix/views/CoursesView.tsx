'use client';

import { useEffect, useMemo, useState } from 'react';
import { CourseFiltersPanel } from '../components/courses/CourseFiltersPanel';
import { CourseResults } from '../components/courses/CourseResults';
import { CoursesToolbar, type ActiveChip } from '../components/courses/CoursesToolbar';
import type { HeroImage } from '../components/home/HomeHero';
import { PageIntro } from '../components/layout/PageIntro';
import { SiteFooter } from '../components/layout/SiteFooter';
import { SiteHeader } from '../components/layout/SiteHeader';
import { SearchField } from '../components/ui/Fields';
import { Highlight, Sparkle } from '../components/ui/Tags';
import { useAcademixUI } from '../context/AcademixUIProvider';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { ALL, type CourseFilters, type CourseSummary, type FilterOption, type LoadStatus } from '../types';

export interface CoursesViewProps {
  /** Cursos ya filtrados por quien obtiene los datos (Supabase o cliente). */
  courses: CourseSummary[];
  status: LoadStatus;
  /** Filtros actuales (controlados). */
  filters: CourseFilters;
  onFiltersChange: (next: CourseFilters) => void;
  /** Opciones de categoría; incluye { value: 'all', label: 'Todas' } si quieres «Todas». */
  categoryOptions: FilterOption[];
  institutionOptions: FilterOption[];
  /** Total de resultados si hay paginación en servidor. Por defecto courses.length. */
  totalCount?: number;
  onRetry?: () => void;
  /** Espera antes de enviar la búsqueda escrita (ms). */
  searchDebounceMs?: number;
  /** Foto del encabezado (se oculta en móvil). `null` para no mostrarla. */
  introImage?: HeroImage | null;
}

/** Página «Cursos disponibles» completa. Presentación + eventos; no obtiene datos. */
export function CoursesView({
  courses,
  status,
  filters,
  onFiltersChange,
  categoryOptions,
  institutionOptions,
  totalCount,
  onRetry,
  searchDebounceMs = 300,
  introImage = { src: '/academix/estudiantes-biblioteca.jpg', alt: 'Estudiante trabajando con su laptop en una biblioteca' },
}: CoursesViewProps) {
  const { Link, Image: Img, routes } = useAcademixUI();
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Búsqueda: estado local inmediato + envío con espera.
  const [q, setQ] = useState(filters.q);
  const debouncedQ = useDebouncedValue(q, searchDebounceMs);
  // Si la búsqueda cambia desde fuera (URL, «Limpiar»), se ajusta durante el render.
  const [prevFilterQ, setPrevFilterQ] = useState(filters.q);
  if (prevFilterQ !== filters.q) {
    setPrevFilterQ(filters.q);
    setQ(filters.q);
  }
  useEffect(() => {
    if (debouncedQ !== filters.q) onFiltersChange({ ...filters, q: debouncedQ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQ]);

  const update = (patch: Partial<CourseFilters>) => onFiltersChange({ ...filters, ...patch });
  const clear = () => {
    setQ('');
    onFiltersChange({ ...filters, q: '', category: ALL, institution: ALL });
  };

  const chips = useMemo<ActiveChip[]>(() => {
    const out: ActiveChip[] = [];
    if (filters.q.trim())
      out.push({ key: 'q', label: `«${filters.q.trim()}»`, ariaLabel: 'Quitar búsqueda', onRemove: () => { setQ(''); update({ q: '' }); } });
    if (filters.category !== ALL) {
      const l = categoryOptions.find((o) => o.value === filters.category)?.label ?? (status === 'ready' ? 'Categoría no disponible' : '…'); // id de la URL que ya no está en la oferta
      out.push({ key: 'cat', label: l, ariaLabel: `Quitar filtro de categoría ${l}`, onRemove: () => update({ category: ALL }) });
    }
    if (filters.institution !== ALL) {
      const l = institutionOptions.find((o) => o.value === filters.institution)?.label ?? (status === 'ready' ? 'Institución no disponible' : '…');
      out.push({ key: 'inst', label: l, ariaLabel: 'Quitar filtro de institución', onRemove: () => update({ institution: ALL }) });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, categoryOptions, institutionOptions, status]);

  const n = totalCount ?? courses.length;
  const resultText =
    status === 'loading' ? 'Cargando cursos…' : status === 'error' ? 'Sin datos' : n === 1 ? '1 curso encontrado' : `${n} cursos encontrados`;

  const aside = introImage ? (
    <div className="relative ml-auto h-[280px] w-full max-w-[460px]">
      <div aria-hidden className="absolute right-[8%] top-[4%] h-[92%] w-[46%] rotate-[5deg] rounded-[999px_999px_28px_28px] bg-ax-yellow" />
      <div className="absolute right-[10%] top-[6%] h-[88%] w-[42%] overflow-hidden rounded-[999px_999px_26px_26px]">
        <Img src={introImage.src} alt={introImage.alt} fill priority sizes="200px" className="h-full w-full object-cover object-[76%_40%]" />
      </div>
      <div aria-hidden className="absolute left-[8%] top-[18%] h-[90px] w-[90px] rounded-full bg-ax-coral" />
      <div aria-hidden className="absolute bottom-[8%] left-[22%] h-[60px] w-[60px] -rotate-[14deg] rounded-2xl bg-ax-mint" />
      <Sparkle className="absolute bottom-[4%] right-0 w-11 text-ax-violet" />
    </div>
  ) : undefined;

  return (
    <>
      <SiteHeader routes={routes} active="courses" linkComponent={Link} />
      <main>
        <PageIntro
          title={
            <>
              Cursos <Highlight color="violet">disponibles</Highlight>
            </>
          }
          description="Explora los cursos virtuales que publican las instituciones registradas en Academix."
          breadcrumb={[{ label: 'Inicio', href: routes.home }, { label: 'Cursos' }]}
          aside={aside}
          linkComponent={Link}
        >
          <div role="search" className="max-w-[620px]">
            <SearchField size="xl" label="Buscar por nombre del curso o institución" placeholder="Busca por curso o institución" value={q} onChange={setQ} />
          </div>
        </PageIntro>

        <section className="pb-[88px] pt-3">
          {/* En móvil (≤900 px) la columna se disuelve (contents) y `order` coloca el panel de
              filtros DEBAJO del botón «Filtros» que lo abre, no encima. */}
          <div className="mx-auto flex max-w-[1240px] flex-wrap gap-7 px-5 max-[900px]:gap-[18px]">
            <CourseFiltersPanel
              categoryOptions={categoryOptions}
              category={filters.category}
              onCategoryChange={(v) => {
                update({ category: v });
                setFiltersOpen(false);
              }}
              institutionOptions={institutionOptions}
              institution={filters.institution}
              onInstitutionChange={(v) => update({ institution: v })}
              hasFilters={chips.length > 0}
              onClear={clear}
              mobileOpen={filtersOpen}
            />
            <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-[18px] max-[900px]:contents">
              <CoursesToolbar
                resultText={resultText}
                sort={filters.sort}
                onSortChange={(s) => update({ sort: s })}
                filtersOpen={filtersOpen}
                onToggleFilters={() => setFiltersOpen((v) => !v)}
                chips={chips}
              />
              <div className="min-w-0 max-[900px]:order-4 max-[900px]:w-full">
                <CourseResults
                  status={status}
                  courses={courses}
                  hasFilters={chips.length > 0}
                  routes={routes}
                  onClearFilters={clear}
                  onRetry={onRetry}
                  linkComponent={Link}
                  imageComponent={Img}
                />
              </div>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter routes={routes} linkComponent={Link} />
    </>
  );
}
