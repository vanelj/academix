import { Monitor } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

/** Etiqueta azul «Virtual». */
export function ModalityBadge({ label = 'Virtual', large = false }: { label?: string; large?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md bg-ax-soft-blue font-semibold text-ax-blue-text',
        large ? 'px-2.5 py-1 text-sm' : 'px-[9px] py-0.5 text-[12.5px]',
      )}
    >
      <Monitor aria-hidden size={large ? 14 : 12} strokeWidth={2.4} />
      {label}
    </span>
  );
}

/** Marca de datos de demostración (borde punteado). */
export function DemoTag({ children = 'demo', className }: { children?: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border border-dashed border-ax-muted px-2 py-px font-ax-mono text-[11.5px] font-semibold text-ax-muted',
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Píldora de área en tarjetas de institución. */
export function AreaTag({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-ax-line px-2.5 py-[3px] text-[13px] font-medium text-ax-ink">
      {children}
    </span>
  );
}

/** Texto monoespaciado pequeño (eyebrows tipo «01 / catálogo»). */
export function MonoLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('font-ax-mono text-[13px] tracking-[0.02em]', className)}>{children}</span>;
}
