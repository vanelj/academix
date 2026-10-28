import type { ReactNode } from 'react';
import { AnchorLink } from '../../context/AcademixUIProvider';
import type { LinkComponent } from '../../types';

export interface PageIntroProps {
  title: string;
  description: string;
  /** Ruta de migas: [{label, href?}] — el último es la página actual. */
  breadcrumb: Array<{ label: string; href?: string }>;
  glow?: 'blue' | 'violet';
  children?: ReactNode;
  linkComponent?: LinkComponent;
}

/** Cabecera de las páginas internas (Cursos, Instituciones) con cuadrícula sutil. */
export function PageIntro({ title, description, breadcrumb, glow = 'blue', children, linkComponent: L = AnchorLink }: PageIntroProps) {
  return (
    <section className="relative overflow-hidden">
      <div className="ax-gridlayer ax-gridlayer--page" aria-hidden />
      <div
        aria-hidden
        className={`ax-glow ${glow === 'violet' ? 'ax-glow--violet-soft' : 'ax-glow--blue'} -top-[30%] right-[-6%] h-[120%] w-[46%]`}
      />
      <div className="relative mx-auto flex max-w-[1240px] flex-col gap-[18px] px-5 pb-10 pt-10">
        <nav aria-label="Ruta" className="flex gap-2 font-ax-mono text-[13px] tracking-[0.02em] text-ax-muted">
          {breadcrumb.map((b, i) => (
            <span key={b.label} className="flex gap-2">
              {i > 0 ? <span aria-hidden>/</span> : null}
              {b.href ? (
                <L href={b.href} className="text-ax-muted no-underline hover:text-ax-ink">
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
        <h1 className="font-ax-display text-[clamp(34px,3.8vw,52px)] font-bold leading-[1.06] tracking-[-0.03em] text-balance">
          {title}
        </h1>
        <p className="max-w-[620px] text-[17.5px] text-ax-muted text-pretty">{description}</p>
        {children}
      </div>
    </section>
  );
}
