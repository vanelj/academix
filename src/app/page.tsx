import { Suspense } from "react"
import type { Metadata } from "next"

import { AcademixPublico } from "@/components/public/academix-publico"
import {
  AxCabecera,
  AxPie,
  InicioCatalogo,
  InicioHero,
  InicioInstitucional,
} from "@/components/public/academix-secciones"
import { aCursoAcademix, opcionesCatalogo } from "@/lib/oferta/academix"
import { obtenerOfertaCursos } from "@/lib/oferta/cursos"

export const metadata: Metadata = {
  title: "Academix · Plataforma de Oferta y Gestión de Cursos Virtuales",
  description: "Plataforma de Oferta y Gestión de Cursos Virtuales",
}

// Página principal pública (diseño Creative Tech): no requiere sesión ni usa el
// layout privado de /admin. Solo la sección con datos espera a Supabase.
export default function HomePage() {
  return (
    <AcademixPublico>
      <AxCabecera activa="home" />
      <main>
        <InicioHero />
        {/* Respaldo inerte: lo escrito en su buscador se perdería al llegar los datos. */}
        <Suspense
          fallback={
            <div inert>
              <InicioCatalogo cursos={[]} estado="loading" />
            </div>
          }
        >
          <CatalogoInicio />
        </Suspense>
        <InicioInstitucional />
      </main>
      <AxPie />
    </AcademixPublico>
  )
}

// Cursos reales de la vista pública oferta_cursos (A–Z). Se envían todos para que
// los chips de categoría filtren sobre la oferta completa; la vista muestra 4.
// Con un catálogo grande conviene enviar menos (ver docs/integracion-creative-tech.md).
async function CatalogoInicio() {
  const resultado = await obtenerOfertaCursos()
  if (resultado.ok) {
    // Chips de categoría en orden alfabético, igual que el panel de Cursos.
    const { categoryOptions } = opcionesCatalogo(resultado.cursos, { q: "", categoria: "", institucion: "" })
    return <InicioCatalogo cursos={resultado.cursos.map(aCursoAcademix)} categorias={categoryOptions} estado="ready" />
  }
  return (
    <InicioCatalogo cursos={[]} estado="error" />
  )
}
