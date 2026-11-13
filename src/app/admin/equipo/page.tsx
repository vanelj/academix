import type { Metadata } from "next"

import { EquipoPanel } from "@/components/admin/equipo/equipo-panel"
import { PageHeader } from "@/components/layout/page-header"
import { Card, CardContent } from "@/components/ui/card"
import { requerirArea, requerirPanel } from "@/lib/auth/contexto"
import { candidatosEquipo, obtenerEquipo, type LecturaEquipo } from "@/lib/equipo/datos"
import { cuentasConfiguradas } from "@/lib/supabase/admin"

export const metadata: Metadata = { title: "Equipo administrativo · Academix" }

// Solo el administrador principal (área «equipo»); lo exige también su layout.
export default async function EquipoPage() {
  await requerirArea("equipo")
  const sesion = await requerirPanel("admin")
  const institucionId = sesion.perfil.institucionId
  const encabezado = (
    <PageHeader title="Equipo administrativo" description="Personas que administran tu institución y los módulos a los que accede cada una. Todas usan el mismo panel." />
  )
  if (!institucionId) return <>{encabezado}<Aviso>No se encontró tu institución.</Aviso></>

  let equipo: LecturaEquipo
  let candidatos: { id: string; nombre: string }[] = []
  try {
    ;[equipo, candidatos] = await Promise.all([obtenerEquipo(institucionId), candidatosEquipo(institucionId)])
  } catch {
    return <>{encabezado}<Aviso>No se pudo cargar el equipo. Recarga la página en unos minutos.</Aviso></>
  }
  if (!equipo.disponible) {
    return (
      <>
        {encabezado}
        <Aviso>
          El equipo administrativo se habilitará al aplicar la actualización «administracion_v5». Mientras tanto, todos los
          administradores de la institución conservan el acceso completo.
        </Aviso>
      </>
    )
  }
  return (
    <>
      {encabezado}
      <EquipoPanel miembros={equipo.miembros} candidatos={candidatos} yo={sesion.userId} cuentasConfiguradas={cuentasConfiguradas()} />
    </>
  )
}

function Aviso({ children }: { children: React.ReactNode }) {
  return <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">{children}</CardContent></Card>
}
