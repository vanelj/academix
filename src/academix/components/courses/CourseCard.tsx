import { AnchorLink, PlainImage } from '../../context/AcademixUIProvider';
import { getInitials } from '../../lib/visuals';
import type { CourseSummary, ImageComponent, LinkComponent } from '../../types';
import { buttonClasses } from '../ui/Button';
import { Skeleton } from '../ui/Skeleton';
import { DemoTag } from '../ui/Tags';
import { CourseCover } from './CourseCover';

export interface CourseCardProps {
  course: CourseSummary;
  /** URL de la ficha del curso (ya resuelta). */
  href: string;
  /** Variante: catálogo (con descripción) o compacta (Inicio). */
  variant?: 'catalog' | 'compact';
  headingLevel?: 'h2' | 'h3';
  ctaLabel?: string;
  linkComponent?: LinkComponent;
  imageComponent?: ImageComponent;
}

/** Tarjeta de curso. Recibe todo por props. */
export function CourseCard({
  course,
  href,
  variant = 'catalog',
  headingLevel: H = 'h2',
  ctaLabel = 'Ver detalles',
  linkComponent: L = AnchorLink,
  imageComponent = PlainImage,
}: CourseCardProps) {
  const inst = course.institution;
  const compact = variant === 'compact';
  // Academix: precio real en soles. En la variante compacta va junto al botón y en la
  // de catálogo en la fila de la institución, para que nunca quede en una línea suelta.
  const precio = course.priceLabel ? (
    <span className="ml-auto shrink-0 whitespace-nowrap font-ax-display text-[17px] font-extrabold tracking-[-0.02em] text-ax-ink">
      <span className="sr-only">Precio: </span>
      {course.priceLabel}
    </span>
  ) : null;
  return (
    <article className="flex flex-col rounded-3xl bg-ax-surface p-3 shadow-ax transition-transform duration-[250ms] hover:-translate-y-1.5 hover:-rotate-[0.4deg]">
      <CourseCover
        category={course.category}
        coverUrl={course.coverUrl}
        alt={course.title}
        imageComponent={imageComponent}
        height={compact ? 150 : 140}
      />
      <div className="flex flex-1 flex-col gap-2 px-2 pb-2 pt-4">
        <div className="flex flex-wrap items-center gap-2">
          {/* Una sola línea de texto: con categorías largas, «· Virtual» sigue a la categoría en vez de quedar suelto. */}
          <span className="text-[13px] font-bold text-ax-violet-text">
            {course.category.name} <span className="whitespace-nowrap font-normal text-ax-muted">· Virtual</span>
          </span>
          {course.isDemo ? <DemoTag /> : null}
        </div>
        <H className="font-ax-display text-[21px] font-bold leading-[1.1] tracking-[-0.03em] text-balance">{course.title}</H>
        {!compact && course.description ? (
          <p className="line-clamp-2 text-[14.5px] text-ax-muted">{course.description}</p>
        ) : null}
        <div className="mt-auto flex items-center gap-2 pt-1 text-sm text-ax-muted">
          {compact ? null : inst.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={inst.logoUrl} alt="" className="h-7 w-7 shrink-0 rounded-[9px] object-cover" />
          ) : (
            <span
              aria-hidden
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] bg-ax-soft-yellow font-ax-display text-xs font-extrabold text-ax-yellow-text"
            >
              {getInitials(inst.name, inst.shortName)}
            </span>
          )}
          {inst.name}
          {compact ? null : precio}
        </div>
        <div className="mt-2 flex items-center gap-3">
          <L
            href={href}
            aria-label={`${ctaLabel}: ${course.title}`}
            className={buttonClasses('outline', 'sm', compact ? undefined : 'w-full')}
          >
            {ctaLabel}
          </L>
          {compact ? precio : null}
        </div>
      </div>
    </article>
  );
}

/** Esqueleto de carga con la misma silueta que CourseCard. */
export function CourseCardSkeleton() {
  return (
    <div className="rounded-3xl bg-ax-surface p-3 shadow-ax">
      <Skeleton className="h-[140px]" radius={16} />
      <div className="flex flex-col gap-3 px-2 pb-2 pt-4">
        <Skeleton className="h-3.5 w-[45%]" />
        <Skeleton className="h-[22px] w-[85%]" />
        <Skeleton className="h-3.5 w-[70%]" />
        <Skeleton className="h-11 w-[130px]" radius={999} />
      </div>
    </div>
  );
}
