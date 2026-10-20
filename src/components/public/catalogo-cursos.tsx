import { CloudOff, GraduationCap } from "lucide-react"

import { CursoCard } from "@/components/public/curso-card"
import { EstadoVacio } from "@/components/public/estado-vacio"
import { obtenerOfertaCursos, type OfertaCurso } from "@/lib/oferta/cursos"

type CatalogoCursosProps = {
  /** Máximo de cursos a mostrar; sin valor muestra todos los publicados. */
  limite?: number
  /** Texto del estado vacío (0 cursos publicados). */
  descripcionVacio: string
  /** Acción opcional bajo el estado vacío. */
  accionVacio?: React.ReactNode
}

// Cuadrícula de cursos de la vista pública oferta_cursos, con estados vacío y de error.
export async function CatalogoCursos({
  limite,
  descripcionVacio,
  accionVacio,
}: CatalogoCursosProps) {
  const resultado = await obtenerOfertaCursos(limite)

  if (!resultado.ok) return <ErrorOferta />

  if (resultado.cursos.length === 0) {
    return (
      <EstadoVacio
        icon={GraduationCap}
        titulo="Aún no hay cursos disponibles"
        descripcion={descripcionVacio}
      >
        {accionVacio}
      </EstadoVacio>
    )
  }

  return <CursosGrid cursos={resultado.cursos} />
}

export function CursosGrid({ cursos }: { cursos: OfertaCurso[] }) {
  return (
    <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {cursos.map((curso) => (
        <li key={curso.id}>
          <CursoCard curso={curso} />
        </li>
      ))}
    </ul>
  )
}

export function ErrorOferta() {
  return (
    <EstadoVacio
      icon={CloudOff}
      titulo="No pudimos cargar la oferta"
      descripcion="Hubo un problema al consultar la información. Vuelve a intentarlo en unos minutos."
    />
  )
}

export function CatalogoCursosSkeleton() {
  return (
    <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-label="Cargando">
      {Array.from({ length: 3 }, (_, i) => (
        <li key={i} className="h-64 animate-pulse rounded-xl bg-muted/70 ring-1 ring-foreground/5" />
      ))}
    </ul>
  )
}
