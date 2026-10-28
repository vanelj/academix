import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export interface StatePanelProps {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  tone?: 'blue' | 'violet' | 'error';
  /** Usa role="alert" (errores). */
  alert?: boolean;
}

/** Panel punteado para estados vacíos, sin resultados y error. */
export function StatePanel({ icon, title, description, action, tone = 'blue', alert }: StatePanelProps) {
  return (
    <div
      role={alert ? 'alert' : undefined}
      className="flex flex-col items-center gap-3.5 rounded-[18px] border border-dashed border-ax-line bg-ax-surface px-6 py-16 text-center"
    >
      <span
        aria-hidden
        className={cn(
          'flex h-[60px] w-[60px] items-center justify-center rounded-2xl',
          tone === 'blue' && 'bg-ax-soft-blue text-ax-blue-text',
          tone === 'violet' && 'bg-ax-soft-violet text-ax-violet-text',
          tone === 'error' && 'bg-[#FDE8EC] text-[#B4233C]',
        )}
      >
        {icon}
      </span>
      <h2 className="font-ax-display text-[22px] font-bold leading-[1.08] tracking-[-0.03em] text-balance">{title}</h2>
      {description ? <p className="max-w-[440px] text-ax-muted text-pretty">{description}</p> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
