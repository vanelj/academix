import { Suspense } from "react"
import type { Metadata } from "next"
import Link from "next/link"
import { GraduationCap, SearchX } from "lucide-react"

import { BackToHome } from "@/components/public/back-to-home"
import {
  CatalogoCursosSkeleton,
  CursosGrid,
  ErrorOferta,
} from "@/components/public/catalogo-cursos"
import { EstadoVacio } from "@/components/public/estado-vacio"
import { FiltrosCursos } from "@/components/public/filtros-cursos"
import { PublicFooter } from "@/components/public/public-footer"
import { PublicHeader } from "@/components/public/public-header"
import { buttonVariants } from "@/components/ui/button"
import {
  filtrarCursos,
  leerFiltros,
  obtenerOfertaCursos,
  opcionesDeOferta,
  type FiltrosCatalogo,
} from "@/lib/oferta/cursos"

export const metadata: Metadata = {
  title: "Cursos disponibles · Academix",
  description:
    "Explora los cursos virtuales ofrecidos por las instituciones de la plataforma.",
}

// Catálogo público de todas las instituciones: lee solo la vista oferta_cursos, sin sesión.
export default async function CursosPage({ searchParams }: PageProps<"/cursos">) {
  const filtros = leerFiltros(await searchParams)

  return (
    <div className="flex min-h-svh flex-1 flex-col bg-background">
      <PublicHeader />
      <main className="flex-1">
        <section className="relative isolate border-b border-border/70">
          <div
            aria-hidden
            className="absolute inset-0 -z-10 bg-linear-to-b from-primary/10 to-transparent dark:from-primary/15"
          />
          <div className="mx-auto w-full max-w-6xl px-4 pt-6 pb-10 sm:px-6 sm:pt-8 sm:pb-12">
            <BackToHome />
            <h1 className="mt-6 text-3xl font-semibold tracking-tight sm:text-4xl">
              Cursos disponibles
            </h1>
            <p className="mt-3 max-w-2xl text-base text-muted-foreground">
              Explora los cursos virtuales ofrecidos por las instituciones de la
              plataforma.
            </p>
          </div>
        </section>

        <section
          aria-label="Catálogo de cursos"
          className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10"
        >
          <Suspense fallback={<CatalogoConFiltrosSkeleton />}>
            <CatalogoConFiltros filtros={filtros} />
          </Suspense>
        </section>
      </main>
      <PublicFooter />
    </div>
  )
}

async function CatalogoConFiltros({ filtros }: { filtros: FiltrosCatalogo }) {
  const resultado = await obtenerOfertaCursos()
  const cursos = resultado.ok ? resultado.cursos : []
  const { instituciones, categorias } = opcionesDeOferta(cursos)
  const visibles = filtrarCursos(cursos, filtros)
  const institucion = instituciones.find((i) => i.id === filtros.institucion)

  return (
    <div className="space-y-6">
      <FiltrosCursos
        filtros={filtros}
        instituciones={instituciones}
        categorias={categorias}
        deshabilitado={cursos.length === 0}
      />

      {!resultado.ok ? (
        <ErrorOferta />
      ) : cursos.length === 0 ? (
        <EstadoVacio
          icon={GraduationCap}
          titulo="Aún no hay cursos disponibles"
          descripcion="Cuando las instituciones publiquen sus cursos, aparecerán en este catálogo."
        />
      ) : visibles.length === 0 ? (
        <EstadoVacio
          icon={SearchX}
          titulo="No encontramos cursos con esos filtros"
          descripcion="Prueba con otra búsqueda o elige otra institución o categoría."
        >
          <Link href="/cursos" className={buttonVariants({ variant: "outline", className: "mt-6" })}>
            Ver todos los cursos
          </Link>
        </EstadoVacio>
      ) : (
        <>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {visibles.length === 1 ? "1 curso" : `${visibles.length} cursos`}
            {institucion && (
              <>
                {" "}de <span className="font-medium text-foreground">{institucion.nombre}</span>
              </>
            )}
          </p>
          <CursosGrid cursos={visibles} />
        </>
      )}
    </div>
  )
}

function CatalogoConFiltrosSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-[4.75rem] animate-pulse rounded-xl bg-muted/70 ring-1 ring-foreground/5 max-md:h-60" />
      <CatalogoCursosSkeleton />
    </div>
  )
}
