/**
 * Fuentes de Academix servidas localmente con next/font/local
 * (no dependen de Google Fonts en tiempo de compilación).
 * Licencia: SIL Open Font License 1.1 (ver ./licenses).
 *
 * Uso (en un Server Component de layout):
 *   import { academixFontVariables } from '@/academix/fonts/academix-fonts';
 *   <PublicShell className={academixFontVariables}>…</PublicShell>
 *
 * Alternativa con Google: ver docs/INTEGRACION.md (next/font/google).
 */
import localFont from 'next/font/local';

export const fontDisplay = localFont({
  src: [
    { path: './space-grotesk-latin-500-normal.woff2', weight: '500', style: 'normal' },
    { path: './space-grotesk-latin-600-normal.woff2', weight: '600', style: 'normal' },
    { path: './space-grotesk-latin-700-normal.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--ax-font-display',
  display: 'swap',
  fallback: ['system-ui', 'sans-serif'],
});

export const fontBody = localFont({
  src: [
    { path: './ibm-plex-sans-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: './ibm-plex-sans-latin-500-normal.woff2', weight: '500', style: 'normal' },
    { path: './ibm-plex-sans-latin-600-normal.woff2', weight: '600', style: 'normal' },
    { path: './ibm-plex-sans-latin-700-normal.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--ax-font-body',
  display: 'swap',
  fallback: ['system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
});

export const fontMono = localFont({
  src: [{ path: './ibm-plex-mono-latin-500-normal.woff2', weight: '500', style: 'normal' }],
  variable: '--ax-font-mono',
  display: 'swap',
  fallback: ['ui-monospace', 'monospace'],
});

/** Clases que definen las tres variables de fuente. */
export const academixFontVariables = `${fontDisplay.variable} ${fontBody.variable} ${fontMono.variable}`;
