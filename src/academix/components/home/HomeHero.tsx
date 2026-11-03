import { ArrowRight, Building2, Check, GraduationCap, Monitor, Presentation, Star } from 'lucide-react';
import { AnchorLink, PlainImage } from '../../context/AcademixUIProvider';
import type { ImageComponent, LinkComponent } from '../../types';
import { ButtonLink } from '../ui/Button';
import { Highlight, Sparkle } from '../ui/Tags';

export interface HeroImage {
  src: string;
  alt: string;
}

export interface HomeHeroProps {
  /** Foto grande dentro del arco amarillo. */
  archImage: HeroImage;
  /** Foto pequeña circular (abajo a la izquierda). */
  circleImage: HeroImage;
  coursesHref: string;
  registerHref: string;
  linkComponent?: LinkComponent;
  imageComponent?: ImageComponent;
}

/** Portada de Inicio: mensaje, acciones y composición de fotos con formas. */
export function HomeHero({
  archImage,
  circleImage,
  coursesHref,
  registerHref,
  linkComponent = AnchorLink,
  imageComponent: Img = PlainImage,
}: HomeHeroProps) {
  return (
    <section className="relative">
      <div className="mx-auto grid max-w-[1240px] grid-cols-[repeat(auto-fit,minmax(min(480px,100%),1fr))] items-center gap-10 px-5 pb-[72px] pt-14">
        <div className="flex flex-col items-start gap-6">
          <span className="ax-anim-in inline-flex -rotate-2 items-center gap-2 rounded-full bg-ax-yellow px-4 py-2 text-sm font-bold text-ax-indigo">
            <Star aria-hidden size={16} fill="currentColor" strokeWidth={0} />
            Plataforma de Oferta y Gestión de Cursos Virtuales
          </span>
          <h1 className="ax-anim-in ax-delay-1 font-ax-display text-[clamp(44px,6vw,80px)] font-extrabold leading-[1.04] tracking-[-0.03em] text-balance">
            Tu próximo curso empieza <Highlight color="coral">aquí</Highlight>
          </h1>
          <p className="ax-anim-in ax-delay-1 max-w-[520px] text-[19px] text-ax-muted text-pretty">
            Academix conecta a estudiantes con los cursos virtuales de distintas instituciones, y ayuda a cada institución a
            gestionar sus cursos, docentes, estudiantes e inscripciones.
          </p>
          <div className="ax-anim-in ax-delay-2 flex flex-wrap gap-3">
            <ButtonLink href={coursesHref} variant="primary" linkComponent={linkComponent}>
              Explorar cursos
              <ArrowRight aria-hidden size={18} strokeWidth={2.4} />
            </ButtonLink>
            <ButtonLink href={registerHref} variant="outline" linkComponent={linkComponent}>
              Registrar institución
            </ButtonLink>
          </div>
          <div className="ax-anim-in ax-delay-2 mt-1.5 flex items-center gap-3.5">
            <div aria-hidden className="flex">
              {[
                { Icon: Building2, bg: '#6C3BF5', fg: '#FFFFFF' },
                { Icon: Presentation, bg: '#FF6B5B', fg: '#1B1446' },
                { Icon: GraduationCap, bg: '#2EC4A0', fg: '#1B1446' },
              ].map(({ Icon, bg, fg }, i) => (
                <span
                  key={i}
                  className="flex h-10 w-10 items-center justify-center rounded-full border-[3px] border-ax-bg"
                  style={{ background: bg, color: fg, marginLeft: i ? -10 : 0 }}
                >
                  <Icon size={18} strokeWidth={2} />
                </span>
              ))}
            </div>
            <span className="text-[15px] font-semibold text-ax-muted">Para instituciones, docentes y estudiantes</span>
          </div>
        </div>

        {/* Composición visual */}
        <div className="ax-anim-in ax-delay-1 relative mx-auto aspect-[1/1.02] w-full max-w-[560px]">
          <div aria-hidden className="absolute right-0 top-0 aspect-square w-[24%] rounded-[100%_0_0_0] bg-ax-coral" />
          <div aria-hidden className="absolute left-[4%] top-[46%] aspect-square w-[9%] rounded-full bg-ax-mint" />
          <div
            aria-hidden
            className="absolute left-[20%] top-[2%] h-[90%] w-[60%] -rotate-[4deg] rounded-[999px_999px_36px_36px] bg-ax-yellow"
          />
          <div className="absolute left-[22%] top-[5%] h-[84%] w-[56%] overflow-hidden rounded-[999px_999px_32px_32px]">
            <Img
              src={archImage.src}
              alt={archImage.alt}
              fill
              priority
              sizes="(max-width: 900px) 60vw, 320px"
              className="h-full w-full object-cover object-[66%_50%]"
            />
          </div>
          <div className="absolute bottom-[2%] left-0 aspect-square w-[34%] overflow-hidden rounded-full border-[6px] border-ax-bg">
            <Img
              src={circleImage.src}
              alt={circleImage.alt}
              fill
              sizes="(max-width: 900px) 35vw, 200px"
              className="h-full w-full object-cover object-[74%_40%]"
            />
          </div>
          <Sparkle className="absolute left-[8%] top-[8%] w-[12%] text-ax-violet" />
          <div className="ax-bob absolute right-0 top-[30%] flex items-center gap-2.5 rounded-2xl bg-ax-surface py-2.5 pl-2.5 pr-3.5 text-sm font-bold leading-tight shadow-ax max-[520px]:hidden">
            <span className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] bg-ax-soft-violet text-ax-violet-text">
              <Monitor aria-hidden size={18} strokeWidth={2} />
            </span>
            100 % virtual
          </div>
          <div className="ax-bob-late absolute bottom-[6%] right-[6%] flex items-center gap-2.5 rounded-2xl bg-ax-surface py-2.5 pl-2.5 pr-3.5 text-sm font-bold leading-tight shadow-ax">
            <span className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] bg-ax-soft-mint text-ax-mint-text">
              <Check aria-hidden size={18} strokeWidth={2.4} />
            </span>
            Inscripción en línea
          </div>
        </div>
      </div>
    </section>
  );
}
