import type { Metadata } from "next"

import { PagosPanel } from "@/components/admin/pagos/pagos-panel"
import { PagosTabs } from "@/components/admin/pagos/pago-ui"
import { PageHeader } from "@/components/layout/page-header"
import { Card, CardContent } from "@/components/ui/card"
import { requerirPanel } from "@/lib/auth/contexto"
import { obtenerPagos, type PagoAdmin } from "@/lib/pagos/datos"

export const metadata: Metadata = {
  title: "Pagos y mensualidades · Academix",
}

const ESTADOS = ["pendiente", "pagado", "rechazado"] as const

// Módulo "Pagos y mensualidades": solo administrador con rol activo; la institución sale del perfil.
export default async function PagosPage({ searchParams }: PageProps<"/admin/pagos">) {
  const sesion = await requerirPanel("admin")
  const institucionId = sesion.perfil.institucionId
  const { estado } = await searchParams
  const estadoInicial = ESTADOS.find((e) => e === estado) ?? "todos"

  const encabezado = (
    <>
      <PageHeader title="Pagos y mensualidades" description="Comprobantes presentados por los estudiantes y cuotas de las matrículas de tu institución." />
      <PagosTabs actual="pagos" />
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

  let pagos: PagoAdmin[]
  try {
    pagos = await obtenerPagos(institucionId)
  } catch {
    return (
      <>
        {encabezado}
        <Aviso>No se pudieron cargar los pagos. Recarga la página en unos minutos.</Aviso>
      </>
    )
  }

  return (
    <>
      {encabezado}
      <PagosPanel pagos={pagos} estadoInicial={estadoInicial} />
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
