import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export interface StatePanelProps {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  /** yellow = vacío · violet = sin resultados · coral = error */
  tone?: 'yellow' | 'violet' | 'coral';
  /** Usa role="alert" (errores). */
  alert?: boolean;
}

const tones = {
  yellow: { icon: 'bg-ax-yellow text-ax-indigo', blob: 'bg-ax-soft-yellow -left-[30px] -top-[30px]' },
  violet: { icon: 'bg-ax-violet text-white', blob: 'bg-ax-soft-violet -right-[30px] -top-[30px]' },
  coral: { icon: 'bg-ax-coral text-ax-indigo', blob: 'bg-ax-soft-coral -bottom-[30px] -left-[30px]' },
};

/** Tarjeta para estados vacíos, sin resultados y error. */
export function StatePanel({ icon, title, description, action, tone = 'yellow', alert }: StatePanelProps) {
  const t = tones[tone];
  return (
    <div
      role={alert ? 'alert' : undefined}
      className="relative flex flex-col items-center gap-3.5 overflow-hidden rounded-[28px] bg-ax-surface px-6 py-14 text-center shadow-ax"
    >
      <div aria-hidden className={cn('absolute h-[110px] w-[110px] rounded-full', t.blob)} />
      <span aria-hidden className={cn('relative flex h-[76px] w-[76px] items-center justify-center rounded-full', t.icon)}>
        {icon}
      </span>
      <h2 className="relative font-ax-display text-[26px] font-extrabold leading-[1.06] tracking-[-0.03em] text-balance">{title}</h2>
      {description ? <p className="relative max-w-[440px] text-ax-muted text-pretty">{description}</p> : null}
      {action ? <div className="relative">{action}</div> : null}
    </div>
  );
}
