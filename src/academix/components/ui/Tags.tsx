import { Monitor } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

/** Píldora violeta «Virtual». */
export function ModalityBadge({ label = 'Virtual', large = false }: { label?: string; large?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full bg-ax-soft-violet font-bold text-ax-violet-text',
        large ? 'px-3 py-[5px] text-sm' : 'px-2.5 py-0.5 text-[12.5px]',
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
        'inline-flex items-center rounded-full border-[1.5px] border-dashed border-ax-muted px-[9px] py-px text-xs font-bold text-ax-muted',
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
    <span className="inline-flex items-center rounded-full bg-ax-surface-2 px-[11px] py-[3px] text-[13px] font-semibold text-ax-ink">
      {children}
    </span>
  );
}

/** Etiqueta pequeña en mayúsculas (filtros). */
export function FieldLabel({ children }: { children: ReactNode }) {
  return <span className="text-[13px] font-bold uppercase tracking-[0.06em] text-ax-muted">{children}</span>;
}

/** Palabra destacada con subrayado amarillo dibujado a mano. */
export function Highlight({ children, color = 'coral' }: { children: ReactNode; color?: 'coral' | 'violet' }) {
  return (
    <span className={cn('relative inline-block', color === 'coral' ? 'text-[var(--ax-coral-display)]' : 'text-ax-violet-text')}>
      {children}
      <svg
        aria-hidden
        viewBox="0 0 220 24"
        preserveAspectRatio="none"
        className="pointer-events-none absolute -bottom-2 left-0 h-[14px] w-full"
      >
        <path d="M4 16c40-12 90-14 212-6" fill="none" stroke="#FFC93C" strokeWidth="7" strokeLinecap="round" />
      </svg>
    </span>
  );
}

/** Estrella decorativa. */
export function Sparkle({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={className}>
      <path fill="currentColor" d="M12 0l2.4 8.2L22 6l-5.6 6L22 18l-7.6-2.2L12 24l-2.4-8.2L2 18l5.6-6L2 6l7.6 2.2z" />
    </svg>
  );
}
