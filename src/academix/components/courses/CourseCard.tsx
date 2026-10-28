import { AnchorLink, PlainImage } from '../../context/AcademixUIProvider';
import { getInitials } from '../../lib/visuals';
import type { CourseSummary, ImageComponent, LinkComponent } from '../../types';
import { buttonClasses } from '../ui/Button';
import { Skeleton } from '../ui/Skeleton';
import { DemoTag, ModalityBadge } from '../ui/Tags';
import { CourseCover } from './CourseCover';

export interface CourseCardProps {
  course: CourseSummary;
  /** URL de la ficha del curso (ya resuelta). */
  href: string;
  /** Muestra la descripción (catálogo). En Inicio se oculta. */
  showDescription?: boolean;
  /** Nivel del título (h2 en el catálogo, h3 en Inicio). */
  headingLevel?: 'h2' | 'h3';
  ctaLabel?: string;
  linkComponent?: LinkComponent;
  imageComponent?: ImageComponent;
}

/** Tarjeta de curso. Recibe todo por props. */
export function CourseCard({
  course,
  href,
  showDescription = true,
  headingLevel: H = 'h2',
  ctaLabel = 'Ver detalles',
  linkComponent: L = AnchorLink,
  imageComponent = PlainImage,
}: CourseCardProps) {
  const inst = course.institution;
  return (
    <article className="flex flex-col overflow-hidden rounded-[18px] border border-ax-line bg-ax-surface transition-[transform,box-shadow,border-color] duration-[250ms] hover:-translate-y-1 hover:border-ax-blue-text hover:shadow-ax">
      <CourseCover category={course.category} coverUrl={course.coverUrl} alt={course.title} imageComponent={imageComponent} />
      <div className="flex flex-1 flex-col gap-2.5 px-4 pb-[18px] pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <ModalityBadge />
          {course.isDemo ? <DemoTag /> : null}
          {course.priceLabel ? (
            <span className="ml-auto font-ax-display text-[15.5px] font-bold tracking-[-0.02em] text-ax-ink">
              <span className="sr-only">Precio: </span>
              {course.priceLabel}
            </span>
          ) : null}
        </div>
        <H className="font-ax-display text-[18.5px] font-bold leading-[1.2] tracking-[-0.03em] text-balance">{course.title}</H>
        {showDescription && course.description ? (
          <p className="line-clamp-2 text-[14.5px] text-ax-muted">{course.description}</p>
        ) : null}
        <div className="mt-auto flex items-center gap-2 text-sm text-ax-muted">
          {inst.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={inst.logoUrl} alt="" className="h-[26px] w-[26px] shrink-0 rounded-[7px] border border-ax-line object-cover" />
          ) : (
            <span
              aria-hidden
              className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[7px] border border-ax-line bg-ax-surface-2 font-ax-display text-[11px] font-bold text-ax-ink"
            >
              {getInitials(inst.name, inst.shortName)}
            </span>
          )}
          {inst.name}
        </div>
        <L href={href} className={buttonClasses('ghost', 'sm', 'mt-1 w-full')} aria-label={`${ctaLabel}: ${course.title}`}>
          {ctaLabel}
        </L>
      </div>
    </article>
  );
}

/** Esqueleto de carga con la misma silueta que CourseCard. */
export function CourseCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-[18px] border border-ax-line bg-ax-surface">
      <Skeleton className="h-[140px]" radius={0} />
      <div className="flex flex-col gap-3 p-4">
        <Skeleton className="h-3.5 w-2/5" />
        <Skeleton className="h-5 w-[85%]" />
        <Skeleton className="h-3.5 w-[70%]" />
        <Skeleton className="h-11 w-full" radius={11} />
      </div>
    </div>
  );
}
