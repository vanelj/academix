import { Search } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import type { FilterOption } from '../../types';

/** Etiqueta monoespaciada de los filtros. */
export function FieldLabel({ children }: { children: ReactNode }) {
  return <span className="font-ax-mono text-[12.5px] font-medium text-ax-muted">{children}</span>;
}

export interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  /** Texto accesible (visualmente oculto). */
  label: string;
  size?: 'md' | 'lg' | 'xl';
  className?: string;
  name?: string;
}

/** Campo de búsqueda con lupa. Controlado. */
export function SearchField({ value, onChange, placeholder, label, size = 'md', className, name = 'q' }: SearchFieldProps) {
  const h = size === 'xl' ? 'ax-field--xl' : size === 'lg' ? 'ax-field--lg' : '';
  const top = size === 'xl' ? 'top-[18px]' : size === 'lg' ? 'top-[15px]' : 'top-[14px]';
  return (
    <label className={cn('relative block', className)}>
      <span className="sr-only">{label}</span>
      <Search aria-hidden size={20} className={cn('pointer-events-none absolute left-4 text-ax-muted', top)} />
      <input
        type="search"
        name={name}
        className={cn('ax-field', h)}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
      />
    </label>
  );
}

export interface SelectFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: FilterOption[];
  /** Primera opción («Todas…»). Omitir si no aplica. */
  allLabel?: string;
  allValue?: string;
  layout?: 'stack' | 'inline';
  className?: string;
  selectClassName?: string;
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  allLabel,
  allValue = 'all',
  layout = 'stack',
  className,
  selectClassName,
}: SelectFieldProps) {
  return (
    <label className={cn(layout === 'inline' ? 'flex items-center gap-2.5' : 'flex flex-col gap-2', className)}>
      <FieldLabel>{label}</FieldLabel>
      <select className={cn('ax-field', selectClassName)} value={value} onChange={(e) => onChange(e.target.value)}>
        {allLabel ? <option value={allValue}>{allLabel}</option> : null}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
