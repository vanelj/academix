import { Suspense } from "react"
import type { Metadata } from "next"

import { parseCourseSearchParams } from "@/academix/lib/filters"
import type { CourseFilters } from "@/academix/types"
import { AcademixPublico } from "@/components/public/academix-publico"
import { aCursoAcademix, aFiltrosCatalogo, opcionesCatalogo, ordenarCursos } from "@/lib/oferta/academix"
import { filtrarCursos, obtenerOfertaCursos } from "@/lib/oferta/cursos"

import { CursosCliente } from "./cursos-cliente"

export const metadata: Metadata = {
  title: "Cursos disponibles · Academix",
  description:
    "Explora los cursos virtuales ofrecidos por las instituciones de la plataforma.",
}

// Catálogo público de todas las instituciones (diseño Creative Tech): lee solo la
// vista oferta_cursos, sin sesión. Admite ?q=&categoria=&institucion=&orden=.
export default async function CursosPage({ searchParams }: PageProps<"/cursos">) {
  const filtros = parseCourseSearchParams(await searchParams)

  return (
    <AcademixPublico>
      {/* El respaldo es inerte: es otra instancia de la vista y lo que se escribiera en
          él se perdería al llegar los datos. */}
      <Suspense
        fallback={
          <div inert>
            <CursosCliente cursos={[]} estado="loading" filtros={filtros} opcionesCategoria={[]} opcionesInstitucion={[]} />
          </div>
        }
      >
        <Catalogo filtros={filtros} />
      </Suspense>
    </AcademixPublico>
  )
}

// La búsqueda es la del catálogo existente (nombre, descripción, categoría e
// institución, sin distinguir tildes); el orden y los conteos se calculan aquí.
async function Catalogo({ filtros }: { filtros: CourseFilters }) {
  const resultado = await obtenerOfertaCursos()

  if (!resultado.ok) {
    return <CursosCliente cursos={[]} estado="error" filtros={filtros} opcionesCategoria={[]} opcionesInstitucion={[]} />
  }

  const filtrosCatalogo = aFiltrosCatalogo(filtros)
  const visibles = ordenarCursos(filtrarCursos(resultado.cursos, filtrosCatalogo), filtros.sort)
  const { categoryOptions, institutionOptions } = opcionesCatalogo(resultado.cursos, filtrosCatalogo)

  return (
    <CursosCliente
      cursos={visibles.map(aCursoAcademix)}
      estado="ready"
      filtros={filtros}
      opcionesCategoria={categoryOptions}
      opcionesInstitucion={institutionOptions}
    />
  )
}
