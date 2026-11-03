import { AnchorLink } from '../../context/AcademixUIProvider';
import type { LinkComponent } from '../../types';
import { ButtonLink } from '../ui/Button';

export interface InstitutionsCtaProps {
  href: string;
  title?: string;
  description?: string;
  linkComponent?: LinkComponent;
}

/** Franja índigo final del directorio. */
export function InstitutionsCta({
  href,
  title = '¿Tu institución aún no está en Academix?',
  description = 'Regístrala para gestionar tus cursos virtuales, docentes, estudiantes e inscripciones.',
  linkComponent = AnchorLink,
}: InstitutionsCtaProps) {
  return (
    <section className="px-5 pb-20">
      <div className="relative mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-[22px] overflow-hidden rounded-[36px] bg-ax-band px-[clamp(22px,4vw,56px)] py-[clamp(28px,4vw,48px)]">
        <div aria-hidden className="absolute -bottom-[70px] -right-[50px] h-[180px] w-[180px] rounded-full border-[26px] border-ax-yellow opacity-90" />
        <div aria-hidden className="absolute -top-5 left-[46%] h-[60px] w-[60px] rounded-full bg-ax-coral" />
        <div className="relative flex max-w-[620px] flex-col gap-2.5 text-white">
          <span className="text-sm font-bold uppercase tracking-[0.08em] text-ax-yellow">Para instituciones</span>
          <h2 className="font-ax-display text-[clamp(26px,3vw,38px)] font-extrabold leading-[1.04] tracking-[-0.03em] text-white text-balance">
            {title}
          </h2>
          <p className="text-[17px] text-ax-band-text">{description}</p>
        </div>
        <ButtonLink href={href} variant="yellow" className="relative" linkComponent={linkComponent}>
          Registrar institución
        </ButtonLink>
      </div>
    </section>
  );
}
