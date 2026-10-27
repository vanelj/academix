import type { Metadata } from "next"

import { AvisoCertificados, MIGRACION_PENDIENTE } from "@/components/admin/certificados/certificado-ui"
import { PagosCertificadoPanel } from "@/components/admin/certificados/pagos-certificado-panel"
import { requerirPanel } from "@/lib/auth/contexto"
import { obtenerPagosCertificado, type PagoCertificado } from "@/lib/certificados/datos"
import { MOTIVO_REVISION_DESHABILITADA, REVISION_PAGOS_HABILITADA } from "@/lib/pagos/config"

import { EncabezadoCertificados } from "../encabezado"

export const metadata: Metadata = {
  title: "Pagos de certificados · Academix",
}

async function leer(institucionId: string): Promise<"error" | "no_disponible" | PagoCertificado[]> {
  try {
    const r = await obtenerPagosCertificado(institucionId)
    return r.disponible ? r.pagos : "no_disponible"
  } catch {
    return "error"
  }
}

export default async function PagosCertificadosPage() {
  const sesion = await requerirPanel("admin")
  const institucionId = sesion.perfil.institucionId
  const r = institucionId ? await leer(institucionId) : null
  return (
    <>
      <EncabezadoCertificados actual="pagos" />
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
