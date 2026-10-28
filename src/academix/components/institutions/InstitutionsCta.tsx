import { AnchorLink } from '../../context/AcademixUIProvider';
import type { LinkComponent } from '../../types';
import { ButtonLink } from '../ui/Button';

export interface InstitutionsCtaProps {
  href: string;
  title?: string;
  description?: string;
  linkComponent?: LinkComponent;
}

/** Franja oscura final del directorio. */
export function InstitutionsCta({
  href,
  title = '¿Tu institución aún no está en Academix?',
  description = 'Regístrala para gestionar tus cursos virtuales, docentes, estudiantes e inscripciones.',
  linkComponent = AnchorLink,
}: InstitutionsCtaProps) {
  return (
    <section className="px-4 pb-20">
      <div className="relative mx-auto flex max-w-[1272px] flex-wrap items-center justify-between gap-5 overflow-hidden rounded-[26px] bg-ax-night px-[clamp(22px,4vw,52px)] py-[clamp(28px,4vw,44px)] text-[#E9ECFA]">
        <div aria-hidden className="ax-band-grid" />
        <div aria-hidden className="ax-band-glow -top-[80%] right-[-10%] h-[220%] w-1/2" style={{ background: 'radial-gradient(closest-side, rgba(58,91,255,.38), transparent)' }} />
        <div className="relative flex max-w-[620px] flex-col gap-2">
          <span className="font-ax-mono text-[13px] tracking-[0.02em] text-ax-periwinkle">para instituciones</span>
          <h2 className="font-ax-display text-[clamp(24px,2.6vw,34px)] font-bold leading-[1.08] tracking-[-0.03em] text-white text-balance">
            {title}
          </h2>
          <p className="text-ax-band-text">{description}</p>
        </div>
        <ButtonLink href={href} linkComponent={linkComponent} className="relative">
          Registrar institución
        </ButtonLink>
      </div>
    </section>
  );
}
