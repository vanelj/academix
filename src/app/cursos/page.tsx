import { Suspense } from "react"
import type { Metadata } from "next"

import { parseCourseSearchParams } from "@/academix/lib/filters"
import type { CourseFilters } from "@/academix/types"
import { AcademixPublico } from "@/components/public/academix-publico"
import { aCursoAcademix, aFiltrosCatalogo, opcionesCatalogo, ordenarCursos } from "@/lib/oferta/academix"
import { filtrarCursos, obtenerOfertaCursos } from "@/lib/oferta/cursos"
import { disponibilidadCurso } from "@/lib/oferta/disponibilidad"
import { obtenerGruposOferta } from "@/lib/oferta/grupos"
import { inscripcionesPropias, type InscripcionPropia } from "@/lib/oferta/propios"
import { obtenerContexto } from "@/lib/auth/contexto"

import { CursosCliente } from "./cursos-cliente"

export const metadata: Metadata = {
  title: "Cursos disponibles · Academix",
  description:
    "Explora los cursos virtuales ofrecidos por las instituciones de la plataforma.",
}

// Catálogo público de todas las instituciones (diseño Academix Vibrant): lee solo la
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
  const [resultado, grupos, ctx] = await Promise.all([obtenerOfertaCursos(), obtenerGruposOferta(), obtenerContexto()])
  // Con sesión de estudiante: sus cursos se marcan y van al final (lo nuevo primero).
  const propios = ctx.estado === "con_perfil" && ctx.rolActivo === "estudiante" ? await inscripcionesPropias(ctx.userId) : new Map<string, InscripcionPropia>()

  if (!resultado.ok) {
    return <CursosCliente cursos={[]} estado="error" filtros={filtros} opcionesCategoria={[]} opcionesInstitucion={[]} />
  }

  const filtrosCatalogo = aFiltrosCatalogo(filtros)
  const ordenados = ordenarCursos(filtrarCursos(resultado.cursos, filtrosCatalogo), filtros.sort)
  const visibles = [...ordenados.filter((c) => !propios.has(c.id)), ...ordenados.filter((c) => propios.has(c.id))]
  const sinFiltros = !filtrosCatalogo.q && !filtrosCatalogo.categoria && !filtrosCatalogo.institucion
  const aviso = propios.size > 0 && visibles.length > 0 && visibles.every((c) => propios.has(c.id))
    ? {
        texto: sinFiltros
          ? "Ya te inscribiste en todos los cursos disponibles por ahora. Vuelve pronto: las instituciones publican nuevos cursos y grupos."
          : "Con estos filtros solo aparecen cursos en los que ya te inscribiste. Prueba con otros filtros para descubrir cursos nuevos.",
        enlace: { href: "/estudiante/cursos", texto: "Ir a mis cursos" },
      }
    : null
  const { categoryOptions, institutionOptions } = opcionesCatalogo(resultado.cursos, filtrosCatalogo)

  return (
    <CursosCliente
      cursos={visibles.map((c) => {
        const propio = propios.get(c.id)
        return {
          ...aCursoAcademix(c, grupos ? disponibilidadCurso(grupos.filter((g) => g.curso_id === c.id)) : null),
          enrollment: propio ? { label: propio.etiqueta, href: propio.href, actionLabel: propio.accion } : null,
        }
      })}
      aviso={aviso}
      estado="ready"
      filtros={filtros}
      opcionesCategoria={categoryOptions}
      opcionesInstitucion={institutionOptions}
    />
  )
}
