import { BookOpen, ClipboardCheck, Presentation, Users, type LucideIcon } from 'lucide-react';
import { AnchorLink } from '../../context/AcademixUIProvider';
import type { LinkComponent } from '../../types';
import { ButtonLink } from '../ui/Button';

export interface InstitutionalFeature {
  title: string;
  description: string;
  icon: LucideIcon;
  /** Color pastel de fondo (fijo en ambos temas). */
  background: string;
}

export const defaultInstitutionalFeatures: InstitutionalFeature[] = [
  { title: 'Cursos virtuales', description: 'Publica y organiza tu oferta.', icon: BookOpen, background: '#EEE7FF' },
  { title: 'Docentes', description: 'Asigna docentes a cada curso.', icon: Presentation, background: '#FFE2DD' },
  { title: 'Estudiantes', description: 'Consulta quién participa.', icon: Users, background: '#FFF0C7' },
  { title: 'Inscripciones', description: 'Revisa cada solicitud.', icon: ClipboardCheck, background: '#D7F5EC' },
];

export interface InstitutionalSectionProps {
  registerHref: string;
  features?: InstitutionalFeature[];
  linkComponent?: LinkComponent;
}

/** Franja índigo «Para instituciones» con 4 mosaicos pastel. */
export function InstitutionalSection({
  registerHref,
  features = defaultInstitutionalFeatures,
  linkComponent = AnchorLink,
}: InstitutionalSectionProps) {
  return (
    <section aria-labelledby="ax-inst-title" className="px-5 pb-[88px]">
      <div className="relative mx-auto grid max-w-[1240px] grid-cols-[repeat(auto-fit,minmax(min(400px,100%),1fr))] items-center gap-10 overflow-hidden rounded-[40px] bg-ax-band p-[clamp(28px,5vw,64px)]">
        <div aria-hidden className="absolute -right-[60px] -top-[60px] h-[200px] w-[200px] rounded-full border-[28px] border-ax-yellow opacity-90 max-[620px]:hidden" />
        <div className="relative flex flex-col items-start gap-[18px] text-white">
          <span className="text-sm font-bold uppercase tracking-[0.08em] text-ax-yellow">Para instituciones</span>
          <h2
            id="ax-inst-title"
            className="font-ax-display text-[clamp(32px,4vw,52px)] font-extrabold leading-[1.04] tracking-[-0.03em] text-white text-balance"
          >
            Toda tu institución, organizada en un solo lugar
          </h2>
          <p className="max-w-[460px] text-lg text-ax-band-text">
            Administra tus cursos virtuales, docentes, estudiantes e inscripciones desde una plataforma pensada para la educación.
          </p>
          <ButtonLink href={registerHref} variant="yellow" className="mt-1.5" linkComponent={linkComponent}>
            Registrar institución
          </ButtonLink>
        </div>
        <ul className="relative m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(min(200px,100%),1fr))] gap-3.5 p-0 min-[900px]:pb-[18px]">
          {features.map(({ title, description, icon: Icon, background }, i) => (
            <li key={title} className={i % 2 === 1 ? 'min-[900px]:translate-y-[18px]' : undefined}>
              <div
                className="flex h-full flex-col gap-2.5 rounded-[22px] p-[22px] text-ax-indigo transition-transform duration-[250ms] hover:-translate-y-1"
                style={{ background }}
              >
              <span className="flex h-[46px] w-[46px] items-center justify-center rounded-[14px] bg-white/70 text-ax-indigo">
                <Icon aria-hidden size={22} strokeWidth={2} />
              </span>
              <strong className="font-ax-display text-xl">{title}</strong>
              <span className="text-[14.5px] text-[#3F3770]">{description}</span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
