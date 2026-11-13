import type { Metadata } from "next"

import { AvisoCertificados, MIGRACION_PENDIENTE } from "@/components/admin/certificados/certificado-ui"
import { PagosCertificadoPanel } from "@/components/admin/certificados/pagos-certificado-panel"
import { PagosTabs } from "@/components/admin/pagos/pago-ui"
import { PageHeader } from "@/components/layout/page-header"
import { requerirPanel } from "@/lib/auth/contexto"
import { obtenerPagosCertificado, type PagoCertificado } from "@/lib/certificados/datos"
import { MOTIVO_REVISION_DESHABILITADA, REVISION_PAGOS_HABILITADA } from "@/lib/pagos/config"

export const metadata: Metadata = {
  title: "Pagos de certificados · Academix",
}

/**
 * Cobros adicionales por certificado dentro del módulo Pagos (área «pagos»,
 * protegida por app/admin/pagos/layout.tsx). Es la MISMA bandeja que
 * Certificados → Pagos: mismas tablas (pagos_certificado) y misma acción.
 */
export default async function PagosCertificadosEnPagosPage() {
  const sesion = await requerirPanel("admin")
  const institucionId = sesion.perfil.institucionId
  let r: "error" | "no_disponible" | PagoCertificado[] | null = null
  if (institucionId) {
    try {
      const l = await obtenerPagosCertificado(institucionId)
      r = l.disponible ? l.pagos : "no_disponible"
    } catch {
      r = "error"
    }
  }
  return (
    <>
      <PageHeader
        title="Pagos"
        description="Cobros adicionales por certificado: el estudiante aprobado paga el certificado por separado y sube su comprobante. Al aprobarlo, el certificado queda listo para emitirse."
      />
      <PagosTabs actual="certificados" />
      {r === null ? (
        <AvisoCertificados texto="No se encontró la institución asociada a tu cuenta." />
      ) : r === "no_disponible" ? (
        <AvisoCertificados texto={MIGRACION_PENDIENTE} />
      ) : r === "error" ? (
        <AvisoCertificados texto="No se pudieron cargar los pagos de certificados. Recarga la página en unos minutos." />
      ) : (
        <PagosCertificadoPanel pagos={r} habilitada={REVISION_PAGOS_HABILITADA} motivo={MOTIVO_REVISION_DESHABILITADA} />
      )}
    </>
  )
}
