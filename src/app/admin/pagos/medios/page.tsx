import type { Metadata } from "next"
import { Info } from "lucide-react"

import { MediosPanel } from "@/components/admin/pagos/medios-panel"
import { PagosTabs } from "@/components/admin/pagos/pago-ui"
import { PageHeader } from "@/components/layout/page-header"
import { Card, CardContent } from "@/components/ui/card"
import { requerirPanel } from "@/lib/auth/contexto"
import { obtenerMediosCobro, type LecturaMedios } from "@/lib/pagos/medios"

export const metadata: Metadata = {
  title: "Medios de cobro · Academix",
}

// Yape, Plin y cuentas de la institución. El dinero va directo a la institución.
export default async function MediosCobroPage() {
  const sesion = await requerirPanel("admin")
  const institucionId = sesion.perfil.institucionId

  const encabezado = (
    <>
      <PageHeader title="Pagos y mensualidades" description="Comprobantes presentados por los estudiantes y cuotas de las matrículas de tu institución." />
      <PagosTabs actual="medios" />
    </>
  )
  const aviso = (texto: string) => (
    <>
      {encabezado}
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">{texto}</CardContent>
      </Card>
    </>
  )
  if (!institucionId) return aviso("No se encontró la institución asociada a tu cuenta.")

  let lectura: LecturaMedios
  try {
    lectura = await obtenerMediosCobro(institucionId)
  } catch {
    return aviso("No se pudieron cargar los medios de cobro. Recarga la página en unos minutos.")
  }
  if (!lectura.disponible) {
    return aviso(
      "La configuración de medios de cobro aún no está habilitada en la base de datos (migración medios_cobro_v5 pendiente). Mientras tanto, los estudiantes ven el texto de «Pagos y comprobantes» de tus políticas."
    )
  }

  return (
    <>
      {encabezado}
      <p className="mb-4 flex gap-2 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        Academix no recibe ni retiene dinero: el estudiante paga directamente a estas cuentas y sube su comprobante. Antes de aprobar,
        confirma el ingreso en tu banco o aplicación.
      </p>
      <MediosPanel medios={lectura.medios} />
    </>
  )
}
