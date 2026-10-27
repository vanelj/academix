import type { Metadata } from "next"

import { EvaluacionesPanel } from "@/components/admin/evaluaciones/evaluaciones-panel"
import { PageHeader } from "@/components/layout/page-header"
import { Card, CardContent } from "@/components/ui/card"
import { requerirPanel } from "@/lib/auth/contexto"
import { obtenerResumenEvaluaciones, type ResumenGrupo } from "@/lib/evaluaciones/datos"

export const metadata: Metadata = {
  title: "Evaluaciones · Academix",
}

// Supervisión académica por grupo (RLS: evaluaciones y calificaciones de la institución).
export default async function EvaluacionesPage() {
  const sesion = await requerirPanel("admin")
  const institucionId = sesion.perfil.institucionId
  const encabezado = <PageHeader title="Evaluaciones" description="Criterios, ponderaciones, notas y resultados académicos de los grupos de tu institución." />
  const aviso = (texto: string) => (
    <>
      {encabezado}
      <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">{texto}</CardContent></Card>
    </>
  )
  if (!institucionId) return aviso("No se encontró la institución asociada a tu cuenta.")

  let resumen: ResumenGrupo[]
  try {
    resumen = await obtenerResumenEvaluaciones(institucionId)
  } catch {
    return aviso("No se pudieron cargar las evaluaciones. Recarga la página en unos minutos.")
  }
  return (
    <>
      {encabezado}
      <EvaluacionesPanel resumen={resumen} />
    </>
  )
}
