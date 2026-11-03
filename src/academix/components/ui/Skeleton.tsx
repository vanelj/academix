import type { CSSProperties } from 'react';
import { cn } from '../../lib/cn';

/**
 * Bloque de carga con brillo animado.
 * El radio va en `radius` (no con utilidades rounded-*), para no competir
 * con el radio por defecto de academix.css.
 */
export function Skeleton({ className, radius, style }: { className?: string; radius?: number; style?: CSSProperties }) {
  return (
    <div
      aria-hidden
      className={cn('ax-skeleton', className)}
      style={radius !== undefined ? { borderRadius: radius, ...style } : style}
    />
  );
}
