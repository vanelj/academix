import type { Metadata } from "next"

import { CalendarioAdmin, type GrupoCalendarioAdmin } from "@/components/admin/calendario-admin"
import { PageHeader } from "@/components/layout/page-header"
import { Card, CardContent } from "@/components/ui/card"
import { requerirArea, requerirPanel } from "@/lib/auth/contexto"
import { obtenerGrupos, type GrupoResumen } from "@/lib/grupos/datos"
import { ahoraAcademico } from "@/lib/horarios/calendario"

export const metadata: Metadata = { title: "Calendario académico · Academix" }

/**
 * Malla académica de TODA la institución (área «docentes»). Los grupos salen
 * de obtenerGrupos: RLS + filtro explícito por institución; nunca otras.
 */
export default async function CalendarioAdminPage() {
  await requerirArea("docentes")
  const sesion = await requerirPanel("admin")
  const institucionId = sesion.perfil.institucionId
  const encabezado = <PageHeader title="Calendario académico" description="Todos los grupos de tu institución en una malla semanal. Pulsa una clase para ver el grupo o configurar su enlace." />
  if (!institucionId) return <>{encabezado}<Aviso texto="No se encontró tu institución." /></>

  let grupos: GrupoResumen[]
  try {
    grupos = await obtenerGrupos(institucionId)
  } catch {
    return <>{encabezado}<Aviso texto="No se pudo cargar el calendario. Recarga la página en unos minutos." /></>
  }
  const calendario: GrupoCalendarioAdmin[] = grupos
    .filter((g) => g.estado !== "cancelado")
    .map((g) => ({
      clave: g.id,
      cursoId: g.curso?.id ?? g.id,
      docenteId: g.docente?.id ?? null,
      curso: g.curso?.nombre ?? "Curso",
      grupo: g.codigo,
      docente: g.docente?.nombre ?? null,
      estado: g.estado,
      desde: g.fecha_inicio.slice(0, 10),
      hasta: g.fecha_fin.slice(0, 10),
      franjas: g.horarios.map((h) => ({ dia_semana: h.dia_semana, hora_inicio: h.hora_inicio, hora_fin: h.hora_fin })),
      accesos: [
        { etiqueta: "Abrir grupo", href: `/admin/grupos/${g.id}` },
        { etiqueta: "Configurar enlace virtual", href: `/admin/grupos/${g.id}#horarios` },
      ],
    }))

  return (
    <>
      {encabezado}
      {calendario.every((g) => g.franjas.length === 0) ? (
        <Aviso texto="Aún no hay grupos con horarios. Defínelos en «Grupos y horarios»." />
      ) : (
        <CalendarioAdmin grupos={calendario} ahoraInicial={ahoraAcademico()} />
      )}
    </>
  )
}

function Aviso({ texto }: { texto: string }) {
  return <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">{texto}</CardContent></Card>
}
