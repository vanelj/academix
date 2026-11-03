import { Search } from 'lucide-react';
import { cn } from '../../lib/cn';
import type { FilterOption } from '../../types';
import { FieldLabel } from './Tags';

export interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  /** Texto accesible (visualmente oculto). */
  label: string;
  /** lg = píldora 54 px · xl = píldora grande con sombra */
  size?: 'lg' | 'xl';
  className?: string;
  name?: string;
}

/** Campo de búsqueda con lupa. Controlado. */
export function SearchField({ value, onChange, placeholder, label, size = 'lg', className, name = 'q' }: SearchFieldProps) {
  return (
    <label className={cn('relative block', className)}>
      <span className="sr-only">{label}</span>
      <Search
        aria-hidden
        size={size === 'xl' ? 22 : 20}
        strokeWidth={2.2}
        className={cn('pointer-events-none absolute text-ax-muted', size === 'xl' ? 'left-5 top-[19px]' : 'left-5 top-[17px]')}
      />
      <input
        type="search"
        name={name}
        className={cn('ax-field', size === 'xl' ? 'ax-field--xl' : 'ax-field--lg ax-field--pill shadow-ax')}
        style={size === 'lg' ? { paddingLeft: 52 } : undefined}
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
  allLabel?: string;
  allValue?: string;
  /** Variante: rounded (panel lateral) · pill (barra superior) */
  shape?: 'rounded' | 'pill';
  className?: string;
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  allLabel,
  allValue = 'all',
  shape = 'rounded',
  className,
}: SelectFieldProps) {
  return (
    <label className={cn('flex flex-col gap-2', className)}>
      <FieldLabel>{label}</FieldLabel>
      <select
        className={cn('ax-field', shape === 'pill' && 'ax-field--pill ax-field--lg')}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
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
