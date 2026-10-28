import { ArrowRight, BookOpen, Monitor, SquareCheck, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { AnchorLink, PlainImage } from '../../context/AcademixUIProvider';
import type { ImageComponent, LinkComponent } from '../../types';
import { ButtonLink } from '../ui/Button';

export interface HomeHeroProps {
  /** Fotografía principal (ruta pública, p. ej. /academix/hero-estudiantes-biblioteca.jpg). */
  image: { src: string; alt: string };
  coursesHref: string;
  registerHref: string;
  /** Título en tres líneas; la segunda va en azul. */
  titleLines?: [string, string, string];
  description?: string;
  eyebrow?: string;
  linkComponent?: LinkComponent;
  imageComponent?: ImageComponent;
}

function PanelRow({ icon, label, tone }: { icon: ReactNode; label: string; tone: 'blue' | 'violet' }) {
  return (
    <div className="flex items-center gap-3 rounded-[11px] px-2.5 py-[9px] text-sm font-medium">
      <span
        className={
          tone === 'blue'
            ? 'flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] bg-ax-soft-blue text-ax-blue-text'
            : 'flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] bg-ax-soft-violet text-ax-violet-text'
        }
      >
        {icon}
      </span>
      {label}
    </div>
  );
}

/** Portada en dos columnas: titular + fotografía con panel «Mi institución». */
export function HomeHero({
  image,
  coursesHref,
  registerHref,
  titleLines = ['Cursos virtuales.', 'Gestión simple.', 'Un solo lugar.'],
  description = 'Academix permite a las instituciones administrar sus cursos virtuales, docentes, estudiantes e inscripciones, y a los estudiantes descubrir la oferta de todas ellas.',
  eyebrow = 'Plataforma de Oferta y Gestión de Cursos Virtuales',
  linkComponent = AnchorLink,
  imageComponent: Img = PlainImage,
}: HomeHeroProps) {
  return (
    <section className="relative overflow-hidden">
      <div className="ax-gridlayer" aria-hidden />
      <div aria-hidden className="ax-glow ax-glow--violet -top-[6%] right-[-8%] h-[90%] w-[56%]" />
      <div className="relative mx-auto grid max-w-[1240px] grid-cols-[repeat(auto-fit,minmax(min(460px,100%),1fr))] items-center gap-12 px-5 pb-16 pt-14">
        {/* Texto */}
        <div className="flex flex-col items-start gap-[22px]">
          <span className="ax-anim-in inline-flex items-center gap-2.5 rounded-lg border border-ax-line bg-ax-surface px-3 py-1.5 font-ax-mono text-[13px] tracking-[0.02em] text-ax-muted">
            <span aria-hidden className="ax-pulse h-2 w-2 rounded-full bg-ax-blue" />
            {eyebrow}
          </span>
          <h1 className="ax-anim-in ax-delay-1 font-ax-display text-[clamp(40px,4.7vw,66px)] font-bold leading-[1.06] tracking-[-0.03em]">
            {titleLines[0]}
            <br />
            <span className="text-ax-blue-text">{titleLines[1]}</span>
            <br />
            {titleLines[2]}
          </h1>
          <p className="ax-anim-in ax-delay-1 max-w-[500px] text-lg text-ax-muted text-pretty">{description}</p>
          <div className="ax-anim-in ax-delay-2 mt-1 flex flex-wrap gap-3">
            <ButtonLink href={coursesHref} linkComponent={linkComponent}>
              Explorar cursos
              <ArrowRight aria-hidden size={18} strokeWidth={2.2} />
            </ButtonLink>
            <ButtonLink href={registerHref} variant="ghost" linkComponent={linkComponent}>
              Registrar institución
            </ButtonLink>
          </div>
        </div>

        {/* Composición visual */}
        <div className="ax-anim-in ax-delay-1 relative mx-auto aspect-[1/0.9] w-full max-w-[540px]">
          <svg
            aria-hidden
            viewBox="0 0 200 200"
            className="absolute left-[-2%] top-[4%] w-[26%] text-ax-blue-text opacity-40"
          >
            <path d="M10 40h60v40h50v60h70" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="10" cy="40" r="4" fill="currentColor" />
            <circle cx="120" cy="80" r="4" fill="currentColor" />
            <circle cx="190" cy="140" r="4" fill="currentColor" />
          </svg>

          <div className="ax-hero-photo absolute right-0 top-0 h-[84%] w-[80%] overflow-hidden">
            <Img
              src={image.src}
              alt={image.alt}
              fill
              priority
              sizes="(max-width: 900px) 80vw, 432px"
              className="block h-full w-full object-cover object-[72%_40%]"
            />
            <div aria-hidden className="ax-hero-photo-tint absolute inset-0" />
          </div>

          <div aria-hidden className="absolute right-[3%] top-[2%] aspect-square w-[11%] rotate-12 rounded-[9px] border-2 border-ax-lime" />

          {/* Ilustración del panel institucional: no muestra datos reales. */}
          <div aria-hidden className="ax-drift absolute bottom-0 left-0 flex w-[54%] min-w-[210px] flex-col gap-0.5 rounded-[18px] border border-ax-line bg-ax-surface p-3 shadow-ax">
            {/* «vista previa» se mantiene también en móvil: marca la ilustración como no real. */}
            <div className="flex items-center justify-between gap-2 px-1.5 pb-2 pt-0.5">
              <span className="whitespace-nowrap font-ax-display text-[15px] font-bold">Mi institución</span>
              <span className="whitespace-nowrap font-ax-mono text-[11px] text-ax-muted">vista previa</span>
            </div>
            <PanelRow tone="blue" label="Cursos virtuales" icon={<BookOpen aria-hidden size={16} />} />
            <PanelRow tone="violet" label="Docentes" icon={<Monitor aria-hidden size={16} />} />
            <PanelRow tone="blue" label="Estudiantes" icon={<Users aria-hidden size={16} />} />
            <PanelRow tone="violet" label="Inscripciones" icon={<SquareCheck aria-hidden size={16} />} />
          </div>

        </div>
      </div>
    </section>
  );
}
