import { Suspense } from "react"
import type { Metadata } from "next"

import { filterInstitutions, institutionAreaOptions, parseInstitutionSearchParams } from "@/academix/lib/filters"
import { ALL, type InstitutionFilters } from "@/academix/types"
import { AcademixPublico } from "@/components/public/academix-publico"
import { aInstitucionAcademix } from "@/lib/oferta/academix"
import { institucionesDeOferta, obtenerOfertaCursos } from "@/lib/oferta/cursos"

import { InstitucionesCliente } from "./instituciones-cliente"

export const metadata: Metadata = {
  title: "Instituciones · Academix",
  description:
    "Conoce las instituciones que ofrecen cursos virtuales en nuestra plataforma.",
}

// Directorio público de instituciones (diseño Academix Vibrant). V4/V5 no expone la
// tabla instituciones a visitantes: los datos salen de la vista pública
// oferta_cursos, así que solo aparecen instituciones activas con cursos publicados.
// Admite ?q= (nombre), ?area= (categoría de sus cursos) y ?orden=cursos.
export default async function InstitucionesPage({ searchParams }: PageProps<"/instituciones">) {
  const filtros = parseInstitutionSearchParams(await searchParams)

  return (
    <AcademixPublico>
      {/* Respaldo inerte: lo escrito en él se perdería al llegar los datos (otra instancia). */}
      <Suspense
        fallback={
          <div inert>
            <InstitucionesCliente instituciones={[]} estado="loading" filtros={filtros} opcionesArea={[]} />
          </div>
        }
      >
        <Directorio filtros={filtros} />
      </Suspense>
    </AcademixPublico>
  )
}

async function Directorio({ filtros }: { filtros: InstitutionFilters }) {
  const resultado = await obtenerOfertaCursos()

  if (!resultado.ok) {
    return <InstitucionesCliente instituciones={[]} estado="error" filtros={filtros} opcionesArea={[]} />
  }

  const instituciones = institucionesDeOferta(resultado.cursos).map(aInstitucionAcademix)
  const opcionesArea = institutionAreaOptions(instituciones)
  // Un área de la URL que ya no está en la oferta se ignora (el selector no podría mostrarla).
  const area = opcionesArea.some((o) => o.value === filtros.area) ? filtros.area : ALL
  const vigentes = { ...filtros, area }

  return (
    <InstitucionesCliente
      instituciones={filterInstitutions(instituciones, vigentes)}
      estado="ready"
      filtros={vigentes}
      opcionesArea={opcionesArea}
    />
  )
}
