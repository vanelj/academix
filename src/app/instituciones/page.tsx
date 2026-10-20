import { Suspense } from "react"
import type { Metadata } from "next"
import { Building2 } from "lucide-react"

import { BackToHome } from "@/components/public/back-to-home"
import { CatalogoCursosSkeleton, ErrorOferta } from "@/components/public/catalogo-cursos"
import { EstadoVacio } from "@/components/public/estado-vacio"
import { InstitucionCard } from "@/components/public/institucion-card"
import { PublicFooter } from "@/components/public/public-footer"
import { PublicHeader } from "@/components/public/public-header"
import { institucionesDeOferta, obtenerOfertaCursos } from "@/lib/oferta/cursos"

export const metadata: Metadata = {
  title: "Instituciones · Academix",
  description:
    "Conoce las instituciones que ofrecen cursos virtuales en nuestra plataforma.",
}

// Directorio público de instituciones. V4 no expone la tabla instituciones a
// visitantes: los datos salen de la vista pública oferta_cursos.
export default function InstitucionesPage() {
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
              Instituciones
            </h1>
            <p className="mt-3 max-w-2xl text-base text-muted-foreground">
              Conoce las instituciones que ofrecen cursos virtuales en nuestra
              plataforma.
            </p>
          </div>
        </section>

        <section
          aria-label="Instituciones disponibles"
          className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10"
        >
          <Suspense fallback={<CatalogoCursosSkeleton />}>
            <ListaInstituciones />
          </Suspense>
        </section>
      </main>
      <PublicFooter />
    </div>
  )
}

async function ListaInstituciones() {
  const resultado = await obtenerOfertaCursos()

  if (!resultado.ok) return <ErrorOferta />

  const instituciones = institucionesDeOferta(resultado.cursos)

  if (instituciones.length === 0) {
    return (
      <EstadoVacio
        icon={Building2}
        titulo="Aún no hay instituciones disponibles"
        descripcion="Las instituciones de la plataforma aparecerán aquí cuando publiquen sus cursos."
      />
    )
  }

  return (
    <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {instituciones.map((institucion) => (
        <li key={institucion.id}>
          <InstitucionCard institucion={institucion} />
        </li>
      ))}
    </ul>
  )
}
