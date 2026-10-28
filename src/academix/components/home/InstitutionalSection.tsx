import { BookOpen, Monitor, SquareCheck, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { AnchorLink } from '../../context/AcademixUIProvider';
import type { LinkComponent } from '../../types';
import { ButtonLink } from '../ui/Button';

export interface InstitutionalSectionProps {
  registerHref: string;
  title?: string;
  description?: string;
  linkComponent?: LinkComponent;
}

interface Feature {
  n: string;
  title: string;
  text: string;
  iconColor: string;
  icon: ReactNode;
  detail: ReactNode;
}

const features: Feature[] = [
  {
    n: '01',
    title: 'Cursos virtuales',
    text: 'Publica, organiza y actualiza tu oferta.',
    iconColor: 'text-ax-periwinkle',
    icon: <BookOpen aria-hidden size={22} />,
    detail: (
      <div aria-hidden className="mt-2 flex gap-1.5">
        <span className="h-[5px] flex-[3] rounded-[3px] bg-ax-blue" />
        <span className="h-[5px] flex-[2] rounded-[3px] bg-white/[0.14]" />
      </div>
    ),
  },
  {
    n: '02',
    title: 'Docentes',
    text: 'Asigna docentes a cada curso.',
    iconColor: 'text-ax-lilac',
    icon: <Monitor aria-hidden size={22} />,
    detail: (
      <div aria-hidden className="mt-2 flex">
        <span className="h-6 w-6 rounded-full border-2 border-ax-night bg-ax-violet" />
        <span className="-ml-2 h-6 w-6 rounded-full border-2 border-ax-night bg-ax-blue" />
        <span className="-ml-2 h-6 w-6 rounded-full border-2 border-ax-night bg-white/20" />
      </div>
    ),
  },
  {
    n: '03',
    title: 'Estudiantes',
    text: 'Consulta quién participa en cada curso.',
    iconColor: 'text-ax-cyan',
    icon: <Users aria-hidden size={22} />,
    detail: (
      <div aria-hidden className="mt-2 flex flex-col gap-[5px]">
        <span className="h-[5px] w-[88%] rounded-[3px] bg-white/[0.16]" />
        <span className="h-[5px] w-[64%] rounded-[3px] bg-white/10" />
      </div>
    ),
  },
  {
    n: '04',
    title: 'Inscripciones',
    text: 'Revisa y responde cada solicitud.',
    iconColor: 'text-ax-lime-soft',
    icon: <SquareCheck aria-hidden size={22} />,
    detail: (
      <div aria-hidden className="mt-2 flex flex-wrap gap-1.5">
        <span className="rounded-md bg-[rgba(184,243,90,0.14)] px-2 py-0.5 font-ax-mono text-[11px] text-[#D4FA97]">aprobada</span>
        <span className="rounded-md bg-[rgba(147,166,255,0.14)] px-2 py-0.5 font-ax-mono text-[11px] text-[#C3CDFF]">pendiente</span>
      </div>
    ),
  },
];

/** Sección oscura «Para instituciones» con las cuatro funcionalidades. */
export function InstitutionalSection({
  registerHref,
  title = 'Tu institución, gestionada desde un panel',
  description = 'Organiza tus cursos virtuales, docentes, estudiantes e inscripciones en una plataforma diseñada para instituciones educativas.',
  linkComponent = AnchorLink,
}: InstitutionalSectionProps) {
  return (
    <section aria-labelledby="ax-inst-title" className="px-4 pb-[88px]">
      <div className="relative mx-auto max-w-[1272px] overflow-hidden rounded-[30px] bg-ax-night px-[clamp(22px,5vw,64px)] py-[clamp(32px,5vw,64px)] text-[#E9ECFA]">
        <div aria-hidden className="ax-band-grid ax-band-grid--fade" />
        <div aria-hidden className="ax-band-glow -top-[45%] left-1/2 h-[80%] w-[70%] -translate-x-1/2" />
        <div className="relative flex flex-col gap-11">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="flex max-w-[620px] flex-col gap-3.5">
              <span className="font-ax-mono text-[13px] tracking-[0.02em] text-ax-periwinkle">02 / para instituciones</span>
              <h2 id="ax-inst-title" className="font-ax-display text-[clamp(30px,3.6vw,48px)] font-bold leading-[1.06] tracking-[-0.03em] text-white text-balance">
                {title}
              </h2>
              <p className="max-w-[560px] text-[17px] text-ax-band-text">{description}</p>
            </div>
            <ButtonLink href={registerHref} linkComponent={linkComponent}>
              Registrar institución
            </ButtonLink>
          </div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))] gap-4">
            {features.map((f) => (
              <div key={f.n} className="ax-dcard relative flex flex-col gap-2.5 rounded-[20px] p-[26px]">
                <div className="flex items-center justify-between">
                  <span className={`ax-dcard-icon flex h-[46px] w-[46px] items-center justify-center rounded-[13px] ${f.iconColor}`}>{f.icon}</span>
                  <span className="font-ax-mono text-[13px] text-ax-band-muted">{f.n}</span>
                </div>
                <h3 className="mt-2 font-ax-display text-xl font-bold leading-[1.06] tracking-[-0.03em] text-white">{f.title}</h3>
                <p className="text-[15px] text-ax-band-text">{f.text}</p>
                {f.detail}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
