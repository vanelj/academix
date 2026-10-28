"use client"

import { institutionFiltersToSearchParams } from "@/academix/lib/filters"
import type { FilterOption, InstitutionFilters, InstitutionSummary, LoadStatus } from "@/academix/types"
import { InstitutionsView } from "@/academix/views/InstitutionsView"
import { useFiltrosEnUrl } from "@/components/public/usar-filtros-url"

type InstitucionesClienteProps = {
  instituciones: InstitutionSummary[]
  estado: LoadStatus
  filtros: InstitutionFilters
  opcionesArea: FilterOption[]
}

// Filtros en la URL (?q=&area=&orden=cursos), con el mismo historial que el catálogo de cursos.
export function InstitucionesCliente({ instituciones, estado, filtros, opcionesArea }: InstitucionesClienteProps) {
  const url = useFiltrosEnUrl("/instituciones", filtros, institutionFiltersToSearchParams)

  return (
    <InstitutionsView
      institutions={instituciones}
      status={url.pendiente ? "loading" : estado}
      filters={url.filtros}
      onFiltersChange={url.cambiarFiltros}
      areaOptions={opcionesArea}
      onRetry={url.recargar}
    />
  )
}
