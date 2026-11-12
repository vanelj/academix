"use client"

import { useMemo } from "react"

import { AcademixUIProvider, useAcademixUI } from "@/academix/context/AcademixUIProvider"
import { courseFiltersToSearchParams } from "@/academix/lib/filters"
import type { CourseFilters, CourseSummary, FilterOption, LoadStatus } from "@/academix/types"
import { CoursesView } from "@/academix/views/CoursesView"
import { useFiltrosEnUrl } from "@/components/public/usar-filtros-url"

type CursosClienteProps = {
  cursos: CourseSummary[]
  estado: LoadStatus
  filtros: CourseFilters
  opcionesCategoria: FilterOption[]
  opcionesInstitucion: FilterOption[]
}

// El estado de los filtros vive en la URL (?q=&categoria=&institucion=&orden=):
// cada cambio actualiza la URL y el servidor vuelve a consultar oferta_cursos.
export function CursosCliente({ cursos, estado, filtros, opcionesCategoria, opcionesInstitucion }: CursosClienteProps) {
  const url = useFiltrosEnUrl("/cursos", filtros, courseFiltersToSearchParams)
  // El enlace a cada curso lleva los filtros actuales (?volver=…) para que «Volver a
  // cursos» regrese al mismo listado. Se reutiliza el proveedor: solo cambia esa ruta.
  const ui = useAcademixUI()
  const consulta = courseFiltersToSearchParams(url.filtros).toString()
  const rutas = useMemo(
    () => ({ ...ui.routes, courseDetail: consulta ? `/cursos/:id?volver=${encodeURIComponent(consulta)}` : ui.routes.courseDetail }),
    [ui.routes, consulta]
  )

  return (
    <AcademixUIProvider LinkComponent={ui.Link} ImageComponent={ui.Image} routes={rutas} account={ui.account}>
    <CoursesView
      courses={cursos}
      status={url.pendiente ? "loading" : estado}
      filters={url.filtros}
      onFiltersChange={url.cambiarFiltros}
      categoryOptions={opcionesCategoria}
      institutionOptions={opcionesInstitucion}
      onRetry={url.recargar}
    />
    </AcademixUIProvider>
  )
}
