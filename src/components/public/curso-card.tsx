import Link from "next/link"
import { ArrowRight, Building2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import type { OfertaCurso } from "@/lib/oferta/cursos"
import { cn } from "@/lib/utils"

// La BD guarda solo el número (numeric(10,2)); la moneda se asume en soles.
const formatoPrecio = new Intl.NumberFormat("es-PE", {
  style: "currency",
  currency: "PEN",
})

const etiquetaModalidad: Record<OfertaCurso["modalidad"], string> = {
  virtual: "Virtual",
}

type CursoCardProps = {
  curso: OfertaCurso
  /** Ruta del detalle del curso; mientras no exista, el botón se muestra inactivo. */
  detalleHref?: string
}

export function CursoCard({ curso, detalleHref }: CursoCardProps) {
  return (
    <article className="group flex h-full flex-col rounded-xl bg-card p-5 text-card-foreground ring-1 ring-foreground/10 transition-shadow hover:shadow-md">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{curso.categoria}</Badge>
        <Badge variant="outline" className="text-muted-foreground">
          {etiquetaModalidad[curso.modalidad] ?? curso.modalidad}
        </Badge>
      </div>

      <h3 className="mt-4 text-base leading-snug font-semibold">{curso.nombre}</h3>
      {curso.descripcion && (
        <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
          {curso.descripcion}
        </p>
      )}

      <div className="mt-auto pt-5">
        <div className="flex items-center gap-2.5 border-t border-border pt-4">
          <LogoInstitucion nombre={curso.institucion} logoUrl={curso.logo_url} />
          <p className="min-w-0 flex-1 text-sm leading-tight">
            <span className="block text-xs text-muted-foreground">Ofrecido por</span>
            <Link
              href={`/cursos?institucion=${curso.institucion_id}`}
              className="block truncate font-medium underline-offset-4 hover:text-primary hover:underline"
              title={`Ver cursos de ${curso.institucion}`}
            >
              {curso.institucion}
            </Link>
          </p>
        </div>
        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-lg font-semibold">
            {formatoPrecio.format(Number(curso.precio))}
          </p>
          {detalleHref ? (
            <Link
              href={detalleHref}
              className={cn(buttonVariants({ variant: "outline" }), "gap-1.5")}
            >
              Ver curso
              <ArrowRight className="transition-transform group-hover:translate-x-0.5" aria-hidden />
            </Link>
          ) : (
            // La ruta de detalle aún no existe: botón inactivo en lugar de un enlace roto.
            <button
              type="button"
              disabled
              className={cn(buttonVariants({ variant: "outline" }), "gap-1.5")}
            >
              Ver curso
              <span className="sr-only">(disponible próximamente)</span>
            </button>
          )}
        </div>
      </div>
    </article>
  )
}

function LogoInstitucion({ nombre, logoUrl }: { nombre: string; logoUrl: string | null }) {
  if (logoUrl) {
    return (
      // El logo es una URL externa arbitraria (instituciones.logo_url), no un dominio configurado para next/image.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt=""
        className="size-7 shrink-0 rounded-md bg-muted object-cover"
        loading="lazy"
      />
    )
  }

  return (
    <span
      className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary dark:bg-primary/15"
      title={nombre}
    >
      <Building2 className="size-3.5" aria-hidden />
    </span>
  )
}
