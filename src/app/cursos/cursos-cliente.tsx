"use client"

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

  return (
    <CoursesView
      courses={cursos}
      status={url.pendiente ? "loading" : estado}
      filters={url.filtros}
      onFiltersChange={url.cambiarFiltros}
      categoryOptions={opcionesCategoria}
      institutionOptions={opcionesInstitucion}
      onRetry={url.recargar}
    />
  )
}
