import { LogoAcademix } from '@/components/marca/logo-academix';

/**
 * Isotipo de Academix en la interfaz pública.
 * Integración Academix: reutiliza el logotipo oficial de la plataforma
 * (src/components/marca/logo-academix.tsx), el mismo de login, registro y
 * paneles; no tiene un diseño propio. Mide 36 px, como el original.
 */
export function AcademixMark() {
  return <LogoAcademix />;
}
