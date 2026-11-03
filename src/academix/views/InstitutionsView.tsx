'use client';

import { useEffect, useState } from 'react';
import { InstitutionResults } from '../components/institutions/InstitutionResults';
import { InstitutionsCta } from '../components/institutions/InstitutionsCta';
import { PageIntro } from '../components/layout/PageIntro';
import { SiteFooter } from '../components/layout/SiteFooter';
import { SiteHeader } from '../components/layout/SiteHeader';
import { Button } from '../components/ui/Button';
import { SearchField, SelectField } from '../components/ui/Fields';
import { Highlight } from '../components/ui/Tags';
import { useAcademixUI } from '../context/AcademixUIProvider';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { ALL, type FilterOption, type InstitutionFilters, type InstitutionSort, type InstitutionSummary, type LoadStatus } from '../types';

export interface InstitutionsViewProps {
  institutions: InstitutionSummary[];
  status: LoadStatus;
  filters: InstitutionFilters;
  onFiltersChange: (next: InstitutionFilters) => void;
  areaOptions: FilterOption[];
  totalCount?: number;
  onRetry?: () => void;
  showCta?: boolean;
  searchDebounceMs?: number;
}

const sortOptions: FilterOption[] = [
  { value: 'az', label: 'Nombre (A–Z)' },
  { value: 'courses', label: 'Más cursos publicados' },
];

const decoration = (
  <>
    <div aria-hidden className="absolute right-[6%] top-9 h-[120px] w-[120px] rounded-full border-[20px] border-ax-yellow opacity-90" />
    <div aria-hidden className="absolute right-[18%] top-[120px] h-[46px] w-[46px] rotate-[18deg] rounded-xl bg-ax-coral" />
    <div aria-hidden className="absolute right-[2%] top-[190px] h-7 w-7 rounded-full bg-ax-mint" />
  </>
);

/** Página «Instituciones» completa. Presentación + eventos; no obtiene datos. */
export function InstitutionsView({
  institutions,
  status,
  filters,
  onFiltersChange,
  areaOptions,
  totalCount,
  onRetry,
  showCta = true,
  searchDebounceMs = 300,
}: InstitutionsViewProps) {
  const { Link, routes } = useAcademixUI();
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

  const hasFilters = !!filters.q.trim() || filters.area !== ALL;
  const clear = () => {
    setQ('');
    onFiltersChange({ ...filters, q: '', area: ALL });
  };
  const n = totalCount ?? institutions.length;
  const resultText =
    status === 'loading' ? 'Cargando instituciones…' : status === 'error' ? 'Sin datos' : n === 1 ? '1 institución' : `${n} instituciones`;

  return (
    <>
      <SiteHeader routes={routes} active="institutions" linkComponent={Link} />
      <main>
        <PageIntro
          title={
            <>
              <Highlight color="coral">Instituciones</Highlight> en Academix
            </>
          }
          description="Conoce las instituciones educativas que publican sus cursos virtuales en Academix y consulta su oferta."
          breadcrumb={[{ label: 'Inicio', href: routes.home }, { label: 'Instituciones' }]}
          decoration={decoration}
          linkComponent={Link}
        >
          <div className="flex flex-wrap items-end gap-3">
            <SearchField
              size="lg"
              className="flex-[2_1_320px]"
              label="Buscar institución por nombre"
              placeholder="Buscar institución"
              value={q}
              onChange={setQ}
            />
            <SelectField
              className="flex-[1_1_200px]"
              shape="pill"
              label="Área"
              value={filters.area}
              onChange={(v) => onFiltersChange({ ...filters, area: v })}
              options={areaOptions}
              allLabel="Todas las áreas"
            />
            <SelectField
              className="flex-[1_1_200px]"
              shape="pill"
              label="Ordenar"
              value={filters.sort}
              onChange={(v) => onFiltersChange({ ...filters, sort: v as InstitutionSort })}
              options={sortOptions}
            />
          </div>
        </PageIntro>

        <section className="pb-[72px] pt-3">
          <div className="mx-auto flex max-w-[1240px] flex-col gap-5 px-5">
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <p aria-live="polite" className="text-[15.5px] font-semibold text-ax-muted">
                {resultText}
              </p>
              {hasFilters ? (
                <Button variant="outline" size="sm" onClick={clear}>
                  Limpiar filtros
                </Button>
              ) : null}
            </div>
            <InstitutionResults
              status={status}
              institutions={institutions}
              hasFilters={hasFilters}
              routes={routes}
              onClearFilters={clear}
              onRetry={onRetry}
              linkComponent={Link}
            />
          </div>
        </section>

        {showCta ? <InstitutionsCta href={routes.registerInstitution} linkComponent={Link} /> : null}
      </main>
      <SiteFooter routes={routes} linkComponent={Link} />
    </>
  );
}
