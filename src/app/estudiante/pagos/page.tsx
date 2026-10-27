import type { Metadata } from "next"
import { CheckCircle2 } from "lucide-react"

import { EstadoCuentaVista } from "@/components/estudiante/estado-cuenta"
import { PageHeader } from "@/components/layout/page-header"
import { Card, CardContent } from "@/components/ui/card"
import { requerirPanel } from "@/lib/auth/contexto"
import { obtenerEstadoCuenta, type EstadoCuenta } from "@/lib/pagos/estudiante"

export const metadata: Metadata = {
  title: "Mis pagos y cuotas · Academix",
}

// Estado de cuenta del propio estudiante (RLS: solo sus solicitudes, matrículas, cuotas y pagos).
export default async function MisPagosPage({ searchParams }: PageProps<"/estudiante/pagos">) {
  const sesion = await requerirPanel("estudiante")
  const { enviado } = await searchParams
  const encabezado = <PageHeader title="Mis pagos y cuotas" description="Pagos pendientes, cuotas de tus matrículas y comprobantes enviados a cada institución." />

  let cuenta: EstadoCuenta
  try {
    cuenta = await obtenerEstadoCuenta(sesion.userId)
  } catch {
    return (
      <>
        {encabezado}
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">No se pudo cargar tu estado de cuenta. Recarga la página en unos minutos.</CardContent>
        </Card>
      </>
    )
  }

  return (
    <>
      {encabezado}
      {enviado === "1" && (
        <p role="status" className="mb-4 flex gap-2 rounded-lg border border-success/40 bg-success/5 p-3 text-sm">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
          Comprobante enviado. La institución verificará el ingreso; aquí verás si lo aprueba o lo rechaza.
        </p>
      )}
      <EstadoCuentaVista cuenta={cuenta} />
    </>
  )
}
