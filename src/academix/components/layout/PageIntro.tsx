import type { ReactNode } from 'react';
import { AnchorLink } from '../../context/AcademixUIProvider';
import type { LinkComponent } from '../../types';

export interface PageIntroProps {
  /** Título; puede incluir <Highlight> para la palabra destacada. */
  title: ReactNode;
  description: string;
  /** Migas: [{label, href?}] — el último es la página actual. */
  breadcrumb: Array<{ label: string; href?: string }>;
  /** Contenido debajo del texto (buscador, filtros…). */
  children?: ReactNode;
  /** Columna derecha (fotografía o decoración). En móvil se oculta. */
  aside?: ReactNode;
  /** Formas decorativas absolutas detrás (se ocultan en móvil). */
  decoration?: ReactNode;
  linkComponent?: LinkComponent;
}

/** Cabecera de las páginas internas (Cursos, Instituciones). */
export function PageIntro({ title, description, breadcrumb, children, aside, decoration, linkComponent: L = AnchorLink }: PageIntroProps) {
  return (
    <section className="relative overflow-hidden">
      {decoration ? <div className="max-[900px]:hidden">{decoration}</div> : null}
      <div
        className={
          aside
            ? 'relative mx-auto grid max-w-[1240px] grid-cols-[repeat(auto-fit,minmax(min(460px,100%),1fr))] items-center gap-8 px-5 pb-9 pt-11'
            : 'relative mx-auto max-w-[1240px] px-5 pb-9 pt-11'
        }
      >
        <div className="flex flex-col items-start gap-4">
          <nav aria-label="Ruta" className="flex gap-2 text-sm font-semibold text-ax-muted">
            {breadcrumb.map((b, i) => (
              <span key={b.label} className="flex gap-2">
                {i > 0 ? <span aria-hidden>/</span> : null}
                {b.href ? (
                  <L href={b.href} className="font-semibold text-ax-muted no-underline hover:text-ax-ink">
                    {b.label}
                  </L>
                ) : (
                  <span aria-current="page" className="text-ax-ink">
                    {b.label}
                  </span>
                )}
              </span>
            ))}
          </nav>
          <h1 className="max-w-[760px] font-ax-display text-[clamp(40px,4.6vw,62px)] font-extrabold leading-[1.04] tracking-[-0.03em] text-balance">
            {title}
          </h1>
          <p className="max-w-[600px] text-lg text-ax-muted text-pretty">{description}</p>
          {children ? <div className="mt-1.5 w-full">{children}</div> : null}
        </div>
        {aside ? <div className="max-[620px]:hidden">{aside}</div> : null}
      </div>
    </section>
  );
}
