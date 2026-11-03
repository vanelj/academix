import { LogoAcademix } from '@/components/marca/logo-academix';

/**
 * Isotipo de Academix en la interfaz pública.
 * Integración Academix: reutiliza el logotipo oficial de la plataforma
 * (src/components/marca/logo-academix.tsx), el mismo de login, registro, paneles
 * y favicon. El símbolo propio del kit Vibrant no se usa; solo se adopta su
 * tamaño (42 px por defecto).
 */
export function AcademixMark({ size = 42 }: { size?: number }) {
  return (
    <span aria-hidden className="inline-flex shrink-0" style={{ width: size, height: size }}>
      <LogoAcademix className="size-full" />
    </span>
  );
}

/** Logotipo completo: isotipo oficial + nombre comercial «Academix». */
export function AcademixLogo({ size = 42 }: { size?: number }) {
  return (
    <span className="flex items-center gap-2.5">
      <AcademixMark size={size} />
      <span className="font-ax-display text-[23px] font-extrabold tracking-[-0.03em]">Academix</span>
    </span>
  );
}
