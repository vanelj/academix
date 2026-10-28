'use client';

/**
 * Contenedor raíz de la interfaz pública. Aplica las variables de diseño
 * (solo dentro de él) y expone el tema claro/oscuro a los componentes del kit.
 *
 * Integración Academix: no hay una preferencia de tema propia. El tema es el
 * de toda la plataforma (clase `dark` en <html>, gestionada por src/lib/theme.ts
 * y aplicada antes del primer pintado por el script del layout raíz), así que
 * cambiarlo aquí también cambia los paneles y viceversa.
 */
import { createContext, useCallback, useContext, useSyncExternalStore, type ReactNode } from 'react';
import { applyTheme, getDocumentTheme } from '@/lib/theme';
import { cn } from '../../lib/cn';
import type { ThemeMode } from '../../types';

interface ThemeCtx {
  theme: ThemeMode;
  setTheme: (t: ThemeMode) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeCtx>({ theme: 'light', setTheme: () => {}, toggleTheme: () => {} });

export function useAcademixTheme(): ThemeCtx {
  return useContext(ThemeContext);
}

// Observa la clase de <html>: el tema puede cambiar desde cualquier ThemeToggle.
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  return () => observer.disconnect();
}

export interface PublicShellProps {
  children: ReactNode;
  /** Clases extra (p. ej. las variables de next/font). */
  className?: string;
}

export function PublicShell({ children, className }: PublicShellProps) {
  // En el servidor el tema es desconocido: el CSS (`.dark [data-academix]`) pinta
  // el tema correcto desde el primer momento y aquí se sincroniza al hidratar.
  const theme = useSyncExternalStore<ThemeMode>(subscribe, getDocumentTheme, () => 'light');

  const setTheme = useCallback((t: ThemeMode) => applyTheme(t), []);
  const toggleTheme = useCallback(() => applyTheme(getDocumentTheme() === 'dark' ? 'light' : 'dark'), []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      <div data-academix="" data-theme={theme} className={cn('min-h-screen', className)} suppressHydrationWarning>
        {children}
      </div>
    </ThemeContext.Provider>
  );
}
