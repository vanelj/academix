'use client';

import { Menu, Moon, Sun, X } from 'lucide-react';
import { useState } from 'react';
import { AnchorLink } from '../../context/AcademixUIProvider';
import { cn } from '../../lib/cn';
import type { LinkComponent, PublicRoutes } from '../../types';
import { buttonClasses } from '../ui/Button';
import { AcademixMark } from '../ui/Logo';
import { useAcademixTheme } from './PublicShell';

export type PublicSection = 'home' | 'courses' | 'institutions';

export interface SiteHeaderProps {
  routes: PublicRoutes;
  active: PublicSection;
  linkComponent?: LinkComponent;
}

const iconBtn =
  'inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-[11px] border border-ax-line bg-ax-surface text-ax-ink hover:border-ax-blue-text';

/** Barra superior flotante con navegación, tema y accesos. */
export function SiteHeader({ routes, active, linkComponent: L = AnchorLink }: SiteHeaderProps) {
  const [open, setOpen] = useState(false);
  const { theme, toggleTheme } = useAcademixTheme();
  const dark = theme === 'dark';

  const items: Array<{ key: PublicSection; label: string; href: string }> = [
    { key: 'home', label: 'Inicio', href: routes.home },
    { key: 'courses', label: 'Cursos', href: routes.courses },
    { key: 'institutions', label: 'Instituciones', href: routes.institutions },
  ];

  return (
    <div className="sticky top-0 z-50 px-4 pt-3">
      <header className="mx-auto max-w-[1240px] rounded-2xl border border-ax-line bg-ax-surface shadow-ax-header">
        <div className="flex h-16 items-center gap-6 pl-4 pr-2.5">
          <L href={routes.home} aria-label="Academix, ir al inicio" className="flex items-center gap-2.5 text-ax-ink no-underline">
            <AcademixMark />
            <span className="font-ax-display text-xl font-bold tracking-[-0.03em]">Academix</span>
          </L>

          <nav aria-label="Principal" className="flex items-center gap-0.5 max-[900px]:hidden">
            {items.map((it) => (
              <L
                key={it.key}
                href={it.href}
                aria-current={active === it.key ? 'page' : undefined}
                className={cn(
                  'rounded-[10px] px-3.5 py-[9px] font-ax-display text-[15px] font-semibold no-underline transition-colors hover:bg-ax-surface-2 hover:text-ax-ink',
                  active === it.key ? 'bg-ax-surface-2 text-ax-ink' : 'text-ax-muted',
                )}
              >
                {it.label}
              </L>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              className={iconBtn}
              aria-label={dark ? 'Activar modo claro' : 'Activar modo oscuro'}
              onClick={toggleTheme}
            >
              {dark ? <Sun aria-hidden size={18} /> : <Moon aria-hidden size={18} />}
            </button>
            <L href={routes.login} className={buttonClasses('ghost', 'sm', 'max-[900px]:hidden')}>
              Iniciar sesión
            </L>
            <L href={routes.registerInstitution} className={buttonClasses('primary', 'sm', 'max-[900px]:hidden')}>
              Registrar institución
            </L>
            <button
              type="button"
              className={cn(iconBtn, 'min-[900px]:hidden')}
              aria-label="Abrir o cerrar menú"
              aria-expanded={open}
              aria-controls="ax-mobile-menu"
              onClick={() => setOpen((v) => !v)}
            >
              {open ? <X aria-hidden size={18} /> : <Menu aria-hidden size={18} />}
            </button>
          </div>
        </div>

        {open ? (
          <nav id="ax-mobile-menu" aria-label="Menú móvil" className="flex flex-col gap-0.5 border-t border-ax-line px-2.5 pb-3.5 pt-2">
            {items.map((it) => (
              <L
                key={it.key}
                href={it.href}
                aria-current={active === it.key ? 'page' : undefined}
                className="flex min-h-12 items-center rounded-[10px] px-3 font-semibold text-ax-ink no-underline hover:bg-ax-surface-2"
              >
                {it.label}
              </L>
            ))}
            <div className="mt-2 flex flex-col gap-2">
              <L href={routes.login} className={buttonClasses('ghost', 'md')}>
                Iniciar sesión
              </L>
              <L href={routes.registerInstitution} className={buttonClasses('primary', 'md')}>
                Registrar institución
              </L>
            </div>
          </nav>
        ) : null}
      </header>
    </div>
  );
}
