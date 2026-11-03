/**
 * Fuentes de Academix · Vibrant servidas localmente con next/font/local.
 * Licencia: SIL Open Font License 1.1 (ver ./licenses).
 *
 *   import { academixFontVariables } from '@/academix/fonts/academix-fonts';
 *   <PublicShell className={academixFontVariables}>…</PublicShell>
 *
 * Alternativa con Google Fonts: ver docs/INTEGRACION.md §4.
 */
import localFont from 'next/font/local';

export const fontDisplay = localFont({
  src: [
    { path: './bricolage-grotesque-latin-600-normal.woff2', weight: '600', style: 'normal' },
    { path: './bricolage-grotesque-latin-700-normal.woff2', weight: '700', style: 'normal' },
    { path: './bricolage-grotesque-latin-800-normal.woff2', weight: '800', style: 'normal' },
  ],
  variable: '--ax-font-display',
  display: 'swap',
  fallback: ['system-ui', 'sans-serif'],
});

export const fontBody = localFont({
  src: [
    { path: './dm-sans-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: './dm-sans-latin-500-normal.woff2', weight: '500', style: 'normal' },
    { path: './dm-sans-latin-600-normal.woff2', weight: '600', style: 'normal' },
    { path: './dm-sans-latin-700-normal.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--ax-font-body',
  display: 'swap',
  fallback: ['system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
});

/** Clases que definen las variables de fuente. */
export const academixFontVariables = `${fontDisplay.variable} ${fontBody.variable}`;
