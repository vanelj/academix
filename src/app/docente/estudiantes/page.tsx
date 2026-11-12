import type { Metadata } from "next"

import { ListaEstudiantesDocente } from "@/components/docente/lista-estudiantes"
import { ErrorCarga, SinGrupos } from "@/components/docente/docente-ui"
import { PageHeader } from "@/components/layout/page-header"
import { requerirPanel } from "@/lib/auth/contexto"
import { obtenerEstudiantesDocente, type EstudianteDocente } from "@/lib/docente/datos"

export const metadata: Metadata = { title: "Mis estudiantes · Academix" }

export default async function DocenteEstudiantesPage({ searchParams }: PageProps<"/docente/estudiantes">) {
  const sesion = await requerirPanel("docente")
  const { grupo } = await searchParams
  const encabezado = <PageHeader title="Mis estudiantes" description="Estudiantes con matrícula activa en tus grupos y su avance académico." />
  if (!sesion.perfil.institucionId) return <>{encabezado}<SinGrupos /></>

  let estudiantes: EstudianteDocente[]
  try {
    estudiantes = await obtenerEstudiantesDocente(sesion.userId, sesion.perfil.institucionId)
  } catch {
    return <>{encabezado}<ErrorCarga texto="No se pudieron cargar tus estudiantes. Recarga la página en unos minutos." /></>
  }
  return (
    <>
      {encabezado}
      <ListaEstudiantesDocente estudiantes={estudiantes} grupoInicial={typeof grupo === "string" ? grupo : ""} />
    </>
  )
}
