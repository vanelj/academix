import type { Metadata } from "next"
import Link from "next/link"
import { Compass } from "lucide-react"

import { MisCursosLista } from "@/components/estudiante/mis-cursos-lista"
import { PageHeader } from "@/components/layout/page-header"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { requerirPanel } from "@/lib/auth/contexto"
import { franjasDeGrupos } from "@/lib/estudiantes/academico"
import { obtenerMisCursos, type ResultadoMisCursos } from "@/lib/estudiantes/mis-cursos"
import { tarjetasMisCursos } from "@/lib/estudiantes/tarjetas"
import { ahoraAcademico } from "@/lib/horarios/calendario"

export const metadata: Metadata = {
  title: "Mis cursos · Academix",
}

// Cursos con matrícula del propio estudiante, de cualquier institución (una sola cuenta).
// Solo aparecen matrículas confirmadas: una solicitud o una reserva no es una matrícula.
export default async function MisCursosPage() {
  const sesion = await requerirPanel("estudiante")
  const encabezado = (
    <PageHeader
      title="Mis cursos"
      description="Todos tus cursos con matrícula confirmada, de cualquier institución. Entra a cada curso para ver tus clases, materiales y notas."
      actions={
        <Link href="/estudiante/explorar" className={buttonVariants({ variant: "outline" })}>
          <Compass aria-hidden />
          Explorar cursos
        </Link>
      }
    />
  )

  let resultado: ResultadoMisCursos
  try {
    resultado = await obtenerMisCursos(sesion.userId)
  } catch {
    return (
      <>
        {encabezado}
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">No se pudieron cargar tus cursos. Recarga la página en unos minutos.</CardContent>
        </Card>
      </>
    )
  }

  if (resultado.cursos.length === 0) {
    return (
      <>
        {encabezado}
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center text-sm text-muted-foreground">
            <p>Aún no tienes matrículas confirmadas.</p>
            <p className="max-w-md">
              Si enviaste una solicitud, su avance está en <Link href="/estudiante/solicitudes" className="underline">Mis solicitudes</Link>:
              la matrícula se confirma cuando la institución la aprueba y, si corresponde, verifica tu pago.
            </p>
            <Link href="/estudiante/explorar" className={buttonVariants()}>Explorar cursos</Link>
          </CardContent>
        </Card>
      </>
    )
  }

  const ahora = ahoraAcademico()
  const activas = resultado.cursos.filter((c) => c.estado === "activa")
  const franjas = await franjasDeGrupos([...new Set(activas.map((c) => c.grupoId))])
  const tarjetas = tarjetasMisCursos(resultado.cursos, franjas, ahora)

  return (
    <>
      {encabezado}
      {!resultado.detalleCompleto && (
        <p role="status" className="mb-4 rounded-xl border border-dashed p-3 text-sm text-muted-foreground">
          Algunas matrículas se muestran sin el nombre del curso porque su grupo ya no está en la oferta pública.
          El detalle completo estará disponible cuando se aplique la actualización «mis_cursos_v5».
        </p>
      )}
      <MisCursosLista tarjetas={tarjetas} hoy={ahora.fecha} />
    </>
  )
}
