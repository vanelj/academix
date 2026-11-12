import Link from "next/link"

import { cn } from "@/lib/utils"

export type Pestana = { valor: string; etiqueta: string; href: string; contador?: number }

/**
 * Pestañas como enlaces (?seccion=…): la sección queda en la URL, así que al
 * volver atrás o recargar se conserva el contexto. En móvil se desplazan en
 * horizontal dentro de su propia franja (sin desbordar la página).
 */
export function Pestanas({ pestanas, activa, etiqueta }: { pestanas: Pestana[]; activa: string; etiqueta: string }) {
  return (
    <nav aria-label={etiqueta} className="-mx-1 mb-6 overflow-x-auto px-1">
      <ul className="flex min-w-max gap-1 border-b">
        {pestanas.map((p) => (
          <li key={p.valor}>
            <Link
              href={p.href}
              scroll={false}
              aria-current={p.valor === activa ? "page" : undefined}
              className={cn(
                "-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring",
                p.valor === activa ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {p.etiqueta}
              {p.contador !== undefined && <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums">{p.contador}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}

/** Sección válida de la URL o la primera. */
export function seccionValida<T extends string>(valor: unknown, validas: readonly T[]): T {
  return typeof valor === "string" && (validas as readonly string[]).includes(valor) ? (valor as T) : validas[0]
}
