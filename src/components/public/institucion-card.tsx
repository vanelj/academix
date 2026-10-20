import Link from "next/link"
import { ArrowRight, Building2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import type { InstitucionPublica } from "@/lib/oferta/cursos"
import { cn } from "@/lib/utils"

const MAX_CATEGORIAS = 3

export function InstitucionCard({ institucion }: { institucion: InstitucionPublica }) {
  const extra = institucion.categorias.length - MAX_CATEGORIAS

  return (
    <article className="group flex h-full flex-col rounded-xl bg-card p-5 text-card-foreground ring-1 ring-foreground/10 transition-shadow hover:shadow-md">
      <div className="flex items-center gap-3">
        {institucion.logo_url ? (
          // El logo es una URL externa arbitraria (instituciones.logo_url), no un dominio configurado para next/image.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={institucion.logo_url}
            alt=""
            className="size-12 shrink-0 rounded-lg bg-muted object-cover"
            loading="lazy"
          />
        ) : (
          <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary dark:bg-primary/15">
            <Building2 className="size-5" aria-hidden />
          </span>
        )}
        <div className="min-w-0">
          <h3 className="line-clamp-2 text-base leading-snug font-semibold">
            {institucion.nombre}
          </h3>
          <p className="text-sm text-muted-foreground">
            {institucion.totalCursos === 1
              ? "1 curso publicado"
              : `${institucion.totalCursos} cursos publicados`}
          </p>
        </div>
      </div>

      {institucion.categorias.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Categorías">
          {institucion.categorias.slice(0, MAX_CATEGORIAS).map((categoria) => (
            <li key={categoria}>
              <Badge variant="secondary">{categoria}</Badge>
            </li>
          ))}
          {extra > 0 && (
            <li>
              <Badge variant="outline" className="text-muted-foreground">
                +{extra}
              </Badge>
            </li>
          )}
        </ul>
      )}

      <div className="mt-auto pt-5">
        <Link
          href={`/cursos?institucion=${institucion.id}`}
          className={cn(buttonVariants({ variant: "outline" }), "w-full gap-1.5")}
        >
          Ver cursos
          <ArrowRight className="transition-transform group-hover:translate-x-0.5" aria-hidden />
        </Link>
      </div>
    </article>
  )
}
