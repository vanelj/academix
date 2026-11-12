import type { Metadata } from "next"

import { ErrorCarga, SinGrupos } from "@/components/docente/docente-ui"
import { CalendarioAcademico } from "@/components/horarios/calendario-academico"
import { PageHeader } from "@/components/layout/page-header"
import { Card, CardContent } from "@/components/ui/card"
import { requerirPanel } from "@/lib/auth/contexto"
import { gruposCalendarioDocente } from "@/lib/docente/calendario"
import { obtenerGruposDocente, type GrupoDocente } from "@/lib/docente/datos"
import { ahoraAcademico, crucesSemanales, DIAS_LARGOS } from "@/lib/horarios/calendario"

export const metadata: Metadata = { title: "Mis horarios · Academix" }

// Calendario del docente: solo sus grupos (docente_id + institución), semana, mes o lista.
export default async function DocenteHorariosPage() {
  const sesion = await requerirPanel("docente")
  const encabezado = <PageHeader title="Mis horarios" description="Tus clases por semana o por mes, con el enlace o el aula de cada sesión." />
  if (!sesion.perfil.institucionId) return <>{encabezado}<SinGrupos /></>

  let grupos: GrupoDocente[]
  try {
    grupos = await obtenerGruposDocente(sesion.userId, sesion.perfil.institucionId)
  } catch {
    return <>{encabezado}<ErrorCarga texto="No se pudieron cargar tus horarios. Recarga la página en unos minutos." /></>
  }
  if (grupos.length === 0) return <>{encabezado}<SinGrupos /></>

  const calendario = gruposCalendarioDocente(grupos.filter((g) => g.estado !== "cerrado"), sesion.institucion)
  const sinHorario = calendario.every((g) => g.franjas.length === 0)
  const cruces = crucesSemanales(calendario)

  return (
    <>
      {encabezado}
      {cruces.length > 0 && (
        <p role="status" className="mb-4 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm">
          Cruce de horario entre tus asignaciones:{" "}
          {cruces.map((c) => `${c.a.curso} (${c.a.grupo}) y ${c.b.curso} (${c.b.grupo}) el ${DIAS_LARGOS[c.dia - 1].toLowerCase()}`).join("; ")}.
          Avisa a tu institución.
        </p>
      )}
      {sinHorario ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Tus grupos vigentes aún no tienen horarios registrados. La institución los define en «Grupos y horarios».</CardContent></Card>
      ) : (
        <CalendarioAcademico grupos={calendario} ahoraInicial={ahoraAcademico()} />
      )}
    </>
  )
}
