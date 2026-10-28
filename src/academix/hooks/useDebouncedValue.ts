'use client';

import { useEffect, useState } from 'react';

/** Devuelve `value` tras `delay` ms sin cambios (para búsquedas). */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}
