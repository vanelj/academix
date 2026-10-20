import Link from "next/link"
import { ArrowUpRight, CheckCircle2, Circle } from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { roleConfig, type Role } from "@/config/navigation"
import { cn } from "@/lib/utils"

/**
 * Piezas visuales compartidas por los paneles de administrador, docente y
 * estudiante. Mismo sistema visual para los tres roles: solo cambia el contenido.
 */

// --- Encabezado de bienvenida -----------------------------------------------

export function BienvenidaPanel({
  saludo,
  descripcion,
  contexto,
  acciones,
}: {
  saludo: string
  descripcion: string
  /** Rol activo e institución (si corresponde), mostrados como etiquetas. */
  contexto: string[]
  acciones?: React.ReactNode
}) {
  return (
    <section className="relative mb-6 overflow-hidden rounded-2xl bg-card p-5 shadow-[0_18px_48px_-36px_color-mix(in_oklch,var(--primary),transparent_20%)] ring-1 ring-primary/10 sm:p-6">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,color-mix(in_oklch,var(--chart-2),transparent_76%),transparent_55%),linear-gradient(135deg,color-mix(in_oklch,var(--primary),transparent_96%),transparent_58%,color-mix(in_oklch,var(--chart-4),transparent_90%))] dark:opacity-70"
      />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {contexto.map((etiqueta) => (
              <Badge key={etiqueta} variant="secondary" className="max-w-full truncate">
                {etiqueta}
              </Badge>
            ))}
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">{saludo}</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{descripcion}</p>
        </div>
        {acciones && <div className="flex shrink-0 flex-wrap gap-2">{acciones}</div>}
      </div>
    </section>
  )
}

// --- Indicadores --------------------------------------------------------------

export type IndicadorProps = {
  icono: LucideIcon
  titulo: string
  /** Conteo real; null si no se pudo consultar (se muestra "—"). */
  valor: number | null
  descripcion: string
}

export function Indicadores({ items }: { items: IndicadorProps[] }) {
  return (
    <ul className="mb-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map(({ icono: Icono, titulo, valor, descripcion }) => (
        <li key={titulo} className="rounded-2xl bg-card/85 p-4 shadow-[0_12px_36px_-30px_color-mix(in_oklch,var(--primary),transparent_15%)] ring-1 ring-primary/10 backdrop-blur-sm">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm text-muted-foreground">{titulo}</p>
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary dark:bg-primary/15">
              <Icono className="size-4" aria-hidden />
            </span>
          </div>
          <p className="mt-2 text-3xl font-semibold tabular-nums">
            {valor === null ? (
              <span className="text-muted-foreground" title="No se pudo consultar">
                —
              </span>
            ) : (
              valor.toLocaleString("es-PE")
            )}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {valor === null ? "Dato no disponible en este momento." : descripcion}
          </p>
        </li>
      ))}
    </ul>
  )
}

// --- Primeros pasos (calculados con datos reales) -----------------------------

export type Paso = { titulo: string; descripcion: string; hecho: boolean | null }

export function PrimerosPasos({ titulo, pasos }: { titulo: string; pasos: Paso[] }) {
  const hechos = pasos.filter((p) => p.hecho).length

  return (
    <section aria-labelledby="primeros-pasos" className="mb-8 rounded-2xl bg-card p-5 shadow-[0_14px_40px_-34px_color-mix(in_oklch,var(--primary),transparent_20%)] ring-1 ring-border">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 id="primeros-pasos" className="font-semibold">
          {titulo}
        </h3>
        <span className="text-xs text-muted-foreground">
          {hechos} de {pasos.length} completados
        </span>
      </div>
      <ol className="grid gap-3 md:grid-cols-2">
        {pasos.map((paso) => (
          <li key={paso.titulo} className="flex gap-3">
            {paso.hecho ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
            ) : (
              <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            )}
            <div>
              <p className={cn("text-sm font-medium", paso.hecho && "text-muted-foreground line-through")}>
                {paso.titulo}
                <span className="sr-only">{paso.hecho ? " (completado)" : " (pendiente)"}</span>
              </p>
              <p className="text-xs text-muted-foreground">{paso.descripcion}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}

// --- Módulos del panel ----------------------------------------------------------

/**
 * Módulos del menú del rol agrupados como en la barra lateral. Los módulos
 * internos aún no desarrollados se marcan "Pendiente"; los implementados y los
 * enlaces a páginas públicas que ya funcionan (p. ej. Explorar cursos), "Disponible".
 */
export function ModulosPanel({ rol }: { rol: Role }) {
  const { basePath, sections } = roleConfig[rol]

  return (
    <div className="space-y-6">
      {sections
        .map((seccion) => ({
          ...seccion,
          items: seccion.items.filter((item) => item.href !== basePath),
        }))
        .filter((seccion) => seccion.items.length > 0)
        .map((seccion) => (
          <section key={seccion.title} aria-label={seccion.title}>
            <h3 className="mb-3 text-xs font-medium tracking-wider text-muted-foreground uppercase">
              {seccion.title}
            </h3>
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {seccion.items.map((item) => {
                const Icono = item.icon
                const disponible = item.disponible || !item.href.startsWith(`${basePath}/`)
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="group flex h-full items-start gap-3 rounded-2xl bg-card p-4 shadow-[0_10px_30px_-26px_color-mix(in_oklch,var(--primary),transparent_10%)] ring-1 ring-border transition-all outline-none hover:-translate-y-0.5 hover:shadow-[0_16px_36px_-24px_color-mix(in_oklch,var(--primary),transparent_5%)] focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary dark:bg-primary/15">
                        <Icono className="size-4.5" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">{item.title}</span>
                          {disponible ? (
                            <Badge variant="success">Disponible</Badge>
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground">
                              Pendiente
                            </Badge>
                          )}
                        </span>
                        {item.description && (
                          <span className="mt-1 block text-xs text-muted-foreground">
                            {item.description}
                          </span>
                        )}
                      </span>
                      <ArrowUpRight
                        className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                        aria-hidden
                      />
                    </Link>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
    </div>
  )
}
