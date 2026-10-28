import { BookOpen, TriangleAlert, ZoomOut } from 'lucide-react';
import type { ReactNode } from 'react';
import { AnchorLink, PlainImage } from '../../context/AcademixUIProvider';
import { buildHref } from '../../config/routes';
import type { CourseSummary, ImageComponent, LinkComponent, LoadStatus, PublicRoutes } from '../../types';
import { Button, ButtonLink } from '../ui/Button';
import { StatePanel } from '../ui/StatePanel';
import { CourseCard, CourseCardSkeleton } from './CourseCard';

export const courseGridClass = 'grid gap-[18px] grid-cols-[repeat(auto-fill,minmax(min(260px,100%),1fr))]';

export interface CourseResultsProps {
  status: LoadStatus;
  courses: CourseSummary[];
  /** true si hay filtros activos (decide entre «vacío» y «sin resultados»). */
  hasFilters: boolean;
  routes: PublicRoutes;
  onClearFilters?: () => void;
  onRetry?: () => void;
  skeletonCount?: number;
  errorMessage?: string;
  linkComponent?: LinkComponent;
  imageComponent?: ImageComponent;
}

/** Cuadrícula de cursos con sus cuatro estados: carga, error, vacío y resultados. */
export function CourseResults({
  status,
  courses,
  hasFilters,
  routes,
  onClearFilters,
  onRetry,
  skeletonCount = 6,
  errorMessage = 'No pudimos cargar los cursos. Revisa tu conexión e inténtalo de nuevo.',
  linkComponent = AnchorLink,
  imageComponent = PlainImage,
}: CourseResultsProps): ReactNode {
  if (status === 'loading') {
    return (
      <div aria-busy="true" aria-label="Cargando cursos" className={courseGridClass}>
        {Array.from({ length: skeletonCount }, (_, i) => (
          <CourseCardSkeleton key={i} />
        ))}
      </div>
    );
  }
  if (status === 'error') {
    return (
      <StatePanel
        alert
        tone="error"
        icon={<TriangleAlert size={28} strokeWidth={1.8} />}
        title="No se pudo cargar el catálogo"
        description={errorMessage}
        action={onRetry ? <Button size="sm" onClick={onRetry}>Reintentar</Button> : undefined}
      />
    );
  }
  if (courses.length === 0 && hasFilters) {
    return (
      <StatePanel
        tone="violet"
        icon={<ZoomOut size={28} strokeWidth={1.8} />}
        title="No encontramos cursos con esos filtros"
        description="Prueba con otra palabra o cambia la categoría o la institución."
        action={onClearFilters ? <Button size="sm" onClick={onClearFilters}>Limpiar filtros</Button> : undefined}
      />
    );
  }
  if (courses.length === 0) {
    return (
      <StatePanel
        icon={<BookOpen size={28} strokeWidth={1.8} />}
        title="Aún no hay cursos publicados"
        description="Cuando las instituciones publiquen sus cursos virtuales, aparecerán en este catálogo."
        action={
          <ButtonLink href={routes.institutions} variant="ghost" size="sm" linkComponent={linkComponent}>
            Ver instituciones
          </ButtonLink>
        }
      />
    );
  }
  return (
    <div className={courseGridClass}>
      {courses.map((c) => (
        <CourseCard
          key={c.id}
          course={c}
          href={buildHref(routes.courseDetail, { slug: c.slug ?? c.id, id: c.id })}
          linkComponent={linkComponent}
          imageComponent={imageComponent}
        />
      ))}
    </div>
  );
}
