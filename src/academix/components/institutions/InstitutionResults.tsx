import { Building2, TriangleAlert, ZoomOut } from 'lucide-react';
import type { ReactNode } from 'react';
import { AnchorLink } from '../../context/AcademixUIProvider';
import { buildHref } from '../../config/routes';
import type { InstitutionSummary, LinkComponent, LoadStatus, PublicRoutes } from '../../types';
import { Button, ButtonLink } from '../ui/Button';
import { StatePanel } from '../ui/StatePanel';
import { InstitutionCard, InstitutionCardSkeleton } from './InstitutionCard';

export const institutionGridClass = 'grid gap-[22px] grid-cols-[repeat(auto-fill,minmax(min(280px,100%),1fr))]';

export interface InstitutionResultsProps {
  status: LoadStatus;
  institutions: InstitutionSummary[];
  hasFilters: boolean;
  routes: PublicRoutes;
  onClearFilters?: () => void;
  onRetry?: () => void;
  skeletonCount?: number;
  errorMessage?: string;
  linkComponent?: LinkComponent;
}

/** Directorio con sus estados: carga, error, vacío, sin resultados y resultados. */
export function InstitutionResults({
  status,
  institutions,
  hasFilters,
  routes,
  onClearFilters,
  onRetry,
  skeletonCount = 4,
  errorMessage = 'No pudimos cargar las instituciones. Revisa tu conexión e inténtalo de nuevo.',
  linkComponent = AnchorLink,
}: InstitutionResultsProps): ReactNode {
  if (status === 'loading') {
    return (
      <div aria-busy="true" aria-label="Cargando instituciones" className={institutionGridClass}>
        {Array.from({ length: skeletonCount }, (_, i) => (
          <InstitutionCardSkeleton key={i} />
        ))}
      </div>
    );
  }
  if (status === 'error') {
    return (
      <StatePanel
        alert
        tone="coral"
        icon={<TriangleAlert size={32} />}
        title="No se pudo cargar el directorio"
        description={errorMessage}
        action={onRetry ? <Button size="sm" onClick={onRetry}>Reintentar</Button> : undefined}
      />
    );
  }
  if (institutions.length === 0 && hasFilters) {
    return (
      <StatePanel
        tone="violet"
        icon={<ZoomOut size={32} />}
        title="Ninguna institución coincide con tu búsqueda"
        action={onClearFilters ? <Button size="sm" onClick={onClearFilters}>Limpiar filtros</Button> : undefined}
      />
    );
  }
  if (institutions.length === 0) {
    return (
      <StatePanel
        tone="yellow"
        icon={<Building2 size={32} />}
        // Academix: el directorio solo lista instituciones con cursos publicados (oferta_cursos),
        // así que «registradas» no sería exacto.
        title="Aún no hay instituciones con cursos publicados"
        description="Las instituciones aparecerán aquí cuando publiquen sus cursos virtuales en Academix."
        action={
          <ButtonLink href={routes.registerInstitution} variant="yellow" size="sm" linkComponent={linkComponent}>
            Registrar institución
          </ButtonLink>
        }
      />
    );
  }
  return (
    <div className={institutionGridClass}>
      {institutions.map((i) => (
        <InstitutionCard
          key={i.id}
          institution={i}
          coursesHref={buildHref(routes.institutionCourses, { id: i.id, slug: i.slug ?? i.id })}
          linkComponent={linkComponent}
        />
      ))}
    </div>
  );
}
