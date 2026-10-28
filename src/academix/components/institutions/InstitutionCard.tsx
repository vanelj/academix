import { ArrowRight, BookOpen } from 'lucide-react';
import { AnchorLink } from '../../context/AcademixUIProvider';
import { cn } from '../../lib/cn';
import { getInitials, getInstitutionAccent } from '../../lib/visuals';
import type { InstitutionSummary, LinkComponent } from '../../types';
import { buttonClasses } from '../ui/Button';
import { Skeleton } from '../ui/Skeleton';
import { AreaTag, DemoTag, ModalityBadge } from '../ui/Tags';

export interface InstitutionCardProps {
  institution: InstitutionSummary;
  /** URL de la oferta de cursos de esta institución (ya resuelta). */
  coursesHref: string;
  /** Máximo de áreas visibles. */
  maxAreas?: number;
  linkComponent?: LinkComponent;
}

const countLabel = (n: number) => (n === 1 ? '1 curso publicado' : `${n} cursos publicados`);

/** Tarjeta de institución. Recibe todo por props. */
export function InstitutionCard({ institution: i, coursesHref, maxAreas = 4, linkComponent: L = AnchorLink }: InstitutionCardProps) {
  const accent = getInstitutionAccent(i.id, i.accent);
  return (
    <article className="flex flex-col overflow-hidden rounded-[20px] border border-ax-line bg-ax-surface transition-[transform,box-shadow,border-color] duration-[250ms] hover:-translate-y-1 hover:border-ax-blue-text hover:shadow-ax">
      <div aria-hidden className={cn('ax-cover ax-cover--banner h-[88px]', `ax-cover--${accent}`)} />
      <div className="flex flex-1 flex-col gap-3 px-5 pb-5">
        <div className="relative z-[1] -mt-[34px] flex h-[68px] w-[68px] items-center justify-center overflow-hidden rounded-[18px] border border-ax-line bg-ax-surface font-ax-display text-[22px] font-bold text-ax-blue-text shadow-[0_8px_20px_-12px_rgba(11,16,38,0.45)]">
          {i.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={i.logoUrl} alt={`Logotipo de ${i.name}`} className="h-full w-full object-contain p-2" />
          ) : (
            <span aria-hidden>{getInitials(i.name, i.shortName)}</span>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <h2 className="font-ax-display text-xl font-bold leading-[1.08] tracking-[-0.03em] text-balance">{i.name}</h2>
          {i.isDemo ? <DemoTag className="self-start">perfil de demostración</DemoTag> : null}
        </div>
        {i.description ? <p className="text-[14.5px] text-ax-muted text-pretty">{i.description}</p> : null}
        {i.areas.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {i.areas.slice(0, maxAreas).map((a) => (
              <AreaTag key={a}>{a}</AreaTag>
            ))}
            {/* Academix: indica las áreas ocultas para no esconder parte de la oferta real. */}
            {i.areas.length > maxAreas ? (
              <span title={i.areas.slice(maxAreas).join(', ')}>
                <AreaTag>+{i.areas.length - maxAreas}</AreaTag>
                <span className="sr-only"> áreas más: {i.areas.slice(maxAreas).join(', ')}</span>
              </span>
            ) : null}
          </div>
        ) : null}
        <div className="mt-auto flex flex-wrap items-center gap-3.5 border-t border-ax-line pt-3 text-sm text-ax-muted">
          <span className="inline-flex items-center gap-1.5">
            <BookOpen aria-hidden size={16} />
            {countLabel(i.publishedCoursesCount)}
          </span>
          <ModalityBadge />
        </div>
        <L href={coursesHref} aria-label={`Ver cursos de ${i.name}`} className={buttonClasses('ghost', 'sm')}>
          Ver cursos
          <ArrowRight aria-hidden size={16} />
        </L>
      </div>
    </article>
  );
}

export function InstitutionCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-[20px] border border-ax-line bg-ax-surface">
      <Skeleton className="h-[88px]" radius={0} />
      <div className="flex flex-col gap-3 px-5 pb-5">
        <Skeleton className="-mt-[34px] h-[68px] w-[68px]" radius={18} />
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-3/5" />
        <Skeleton className="h-11 w-[130px]" radius={11} />
      </div>
    </div>
  );
}
