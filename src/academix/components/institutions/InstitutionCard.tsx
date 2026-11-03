import { ArrowRight, BookOpen } from 'lucide-react';
import { AnchorLink } from '../../context/AcademixUIProvider';
import { cn } from '../../lib/cn';
import { getInitials, getInstitutionAccent } from '../../lib/visuals';
import type { InstitutionAccent, InstitutionSummary, LinkComponent } from '../../types';
import { buttonClasses } from '../ui/Button';
import { Skeleton } from '../ui/Skeleton';
import { AreaTag, DemoTag } from '../ui/Tags';

export interface InstitutionCardProps {
  institution: InstitutionSummary;
  /** URL a los cursos de esta institución (ya resuelta). */
  coursesHref: string;
  /** Máximo de áreas visibles. */
  maxAreas?: number;
  linkComponent?: LinkComponent;
}

/** Colores del mini logotipo (fijos en ambos temas). */
const logoTones: Record<InstitutionAccent, string> = {
  a: 'bg-[#EEE7FF] text-[#5A2EE0]',
  b: 'bg-[#FFE2DD] text-[#B23A2E]',
  c: 'bg-[#D7F5EC] text-[#0F6446]',
  d: 'bg-[#FFF0C7] text-[#7A5000]',
};

/** Tarjeta de institución con franja pastel y logotipo superpuesto. */
export function InstitutionCard({ institution: i, coursesHref, maxAreas = 4, linkComponent: L = AnchorLink }: InstitutionCardProps) {
  const accent = getInstitutionAccent(i.id, i.accent);
  const n = i.publishedCoursesCount;
  return (
    <article className="flex flex-col rounded-[26px] bg-ax-surface p-3 shadow-ax transition-transform duration-[250ms] hover:-translate-y-1.5 hover:-rotate-[0.4deg]">
      <div aria-hidden className={cn('ax-cover rounded-[18px]', `ax-cover--${accent}`)} style={{ height: 96 }} />
      {i.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={i.logoUrl}
          alt=""
          className="relative z-[1] -mt-10 ml-3.5 h-[72px] w-[72px] rounded-[22px] border-4 border-ax-surface bg-ax-surface object-cover shadow-[0_10px_22px_-12px_rgba(27,20,70,.5)]"
        />
      ) : (
        <div
          aria-hidden
          className={cn(
            'relative z-[1] -mt-10 ml-3.5 flex h-[72px] w-[72px] items-center justify-center rounded-[22px] border-4 border-ax-surface font-ax-display text-[26px] font-extrabold shadow-[0_10px_22px_-12px_rgba(27,20,70,.5)]',
            logoTones[accent],
          )}
        >
          {getInitials(i.name, i.shortName)}
        </div>
      )}
      <div className="flex flex-1 flex-col gap-2.5 px-2 pb-2 pt-3">
        <div className="flex flex-col gap-1.5">
          <h2 className="font-ax-display text-[22px] font-extrabold leading-[1.1] tracking-[-0.03em] text-balance">{i.name}</h2>
          {i.isDemo ? <DemoTag className="self-start">perfil de demostración</DemoTag> : null}
        </div>
        {i.description ? <p className="text-[15px] text-ax-muted">{i.description}</p> : null}
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
        <div className="mt-auto flex flex-wrap items-center gap-3 border-t-2 border-dashed border-ax-line pt-2.5 text-sm font-semibold text-ax-muted">
          <span className="inline-flex items-center gap-1.5">
            <BookOpen aria-hidden size={16} strokeWidth={2} />
            {n === 1 ? '1 curso publicado' : `${n} cursos publicados`}
          </span>
          <span className="inline-flex items-center rounded-full bg-ax-soft-violet px-2.5 py-0.5 text-[12.5px] font-bold text-ax-violet-text">
            Virtual
          </span>
        </div>
        <L href={coursesHref} aria-label={`Ver cursos de ${i.name}`} className={buttonClasses('primary', 'sm', 'mt-1')}>
          Ver cursos
          <ArrowRight aria-hidden size={16} strokeWidth={2.4} />
        </L>
      </div>
    </article>
  );
}

/** Esqueleto de carga con la misma silueta que InstitutionCard. */
export function InstitutionCardSkeleton() {
  return (
    <div className="rounded-[26px] bg-ax-surface p-3 shadow-ax">
      <Skeleton className="h-24" radius={18} />
      <div className="flex flex-col gap-3 px-2 pb-2">
        <Skeleton className="-mt-10 ml-1.5 h-[72px] w-[72px]" radius={22} />
        <Skeleton className="h-[22px] w-3/4" />
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-3/5" />
        <Skeleton className="h-11 w-full" radius={999} />
      </div>
    </div>
  );
}
