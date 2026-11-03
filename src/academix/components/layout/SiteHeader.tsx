'use client';

import { Menu, Moon, Sun, X } from 'lucide-react';
import { useState } from 'react';
import { AnchorLink } from '../../context/AcademixUIProvider';
import { cn } from '../../lib/cn';
import type { LinkComponent, PublicRoutes } from '../../types';
import { buttonClasses } from '../ui/Button';
import { AcademixLogo } from '../ui/Logo';
import { useAcademixTheme } from './PublicShell';

export type PublicSection = 'home' | 'courses' | 'institutions';

export interface SiteHeaderProps {
  routes: PublicRoutes;
  /** Sección activa; se omite en páginas que no son de la navegación principal. */
  active?: PublicSection;
  linkComponent?: LinkComponent;
}

const iconBtn =
  'inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 border-ax-line bg-ax-surface text-ax-ink hover:border-ax-violet-text';

/** Barra superior: logotipo, navegación en píldoras, tema y accesos. */
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
    <header className="sticky top-0 z-50 border-b-2 border-ax-line bg-ax-bg">
      <div className="mx-auto flex h-[76px] max-w-[1240px] items-center gap-7 px-5">
        <L href={routes.home} aria-label="Academix, ir al inicio" className="text-ax-ink no-underline">
          <AcademixLogo />
        </L>

        <nav aria-label="Principal" className="ml-3 flex items-center gap-1 max-[900px]:hidden">
          {items.map((it) => (
            <L
              key={it.key}
              href={it.href}
              aria-current={active === it.key ? 'page' : undefined}
              className={cn(
                'rounded-full px-4 py-2 font-semibold text-ax-ink no-underline transition-colors hover:bg-ax-soft-violet',
                active === it.key && 'bg-ax-soft-yellow',
              )}
            >
              {it.label}
            </L>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2.5">
          <button type="button" className={iconBtn} aria-label={dark ? 'Activar modo claro' : 'Activar modo oscuro'} onClick={toggleTheme}>
            {dark ? <Sun aria-hidden size={20} /> : <Moon aria-hidden size={20} />}
          </button>
          <L href={routes.login} className={buttonClasses('outline', 'sm', 'max-[900px]:hidden')}>
            Iniciar sesión
          </L>
          <L href={routes.registerInstitution} className={buttonClasses('yellow', 'sm', 'max-[900px]:hidden')}>
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
            {open ? <X aria-hidden size={20} strokeWidth={2.2} /> : <Menu aria-hidden size={20} strokeWidth={2.2} />}
          </button>
        </div>
      </div>

      {open ? (
        <nav id="ax-mobile-menu" aria-label="Menú móvil" className="flex flex-col gap-1 border-t-2 border-ax-line px-4 pb-5 pt-2">
          {items.map((it) => (
            <L
              key={it.key}
              href={it.href}
              aria-current={active === it.key ? 'page' : undefined}
              className="flex min-h-12 items-center rounded-[14px] px-3.5 font-semibold text-ax-ink no-underline hover:bg-ax-soft-violet"
            >
              {it.label}
            </L>
          ))}
          <div className="mt-2 flex flex-col gap-2.5">
            <L href={routes.login} className={buttonClasses('outline', 'md')}>
              Iniciar sesión
            </L>
            <L href={routes.registerInstitution} className={buttonClasses('yellow', 'md')}>
              Registrar institución
            </L>
          </div>
        </nav>
      ) : null}
    </header>
  );
}
