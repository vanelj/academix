import type { Metadata } from "next"

import { CuotasPanel } from "@/components/admin/pagos/cuotas-panel"
import { PagosTabs } from "@/components/admin/pagos/pago-ui"
import { PageHeader } from "@/components/layout/page-header"
import { Card, CardContent } from "@/components/ui/card"
import { requerirPanel } from "@/lib/auth/contexto"
import { obtenerCuotas, type CuotaAdmin } from "@/lib/pagos/datos"

export const metadata: Metadata = {
  title: "Cuotas · Academix",
}

// Cuotas del módulo "Pagos y mensualidades": solo administrador con rol activo; la institución sale del perfil.
export default async function CuotasPage() {
  const sesion = await requerirPanel("admin")
  const institucionId = sesion.perfil.institucionId

  const encabezado = (
    <>
      <PageHeader title="Pagos y mensualidades" description="Comprobantes presentados por los estudiantes y cuotas de las matrículas de tu institución." />
      <PagosTabs actual="cuotas" />
    </>
  )

  if (!institucionId) {
    return (
      <>
        {encabezado}
        <Aviso>No se encontró la institución asociada a tu cuenta. Si el problema continúa, vuelve a iniciar sesión.</Aviso>
      </>
    )
  }

  let cuotas: CuotaAdmin[]
  try {
    cuotas = await obtenerCuotas(institucionId)
  } catch {
    return (
      <>
        {encabezado}
        <Aviso>No se pudieron cargar las cuotas. Recarga la página en unos minutos.</Aviso>
      </>
    )
  }

  return (
    <>
      {encabezado}
      <CuotasPanel cuotas={cuotas} />
    </>
  )
}

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="py-12 text-center text-sm text-muted-foreground">{children}</CardContent>
    </Card>
  )
}
