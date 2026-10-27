import type { Metadata } from "next"

import { AvisoCertificados, MIGRACION_PENDIENTE } from "@/components/admin/certificados/certificado-ui"
import { EmitidosPanel } from "@/components/admin/certificados/emitidos-panel"
import { requerirPanel } from "@/lib/auth/contexto"
import { obtenerEmitidos, obtenerRecursosCertificado, type CertificadoEmitido } from "@/lib/certificados/datos"

import { EncabezadoCertificados } from "./encabezado"

export const metadata: Metadata = {
  title: "Certificados · Academix",
}

async function leer(institucionId: string): Promise<"error" | "no_disponible" | CertificadoEmitido[]> {
  try {
    const recursos = await obtenerRecursosCertificado(institucionId)
    if (!recursos.disponible) return "no_disponible"
    return await obtenerEmitidos(institucionId)
  } catch {
    return "error"
  }
}

// Certificados emitidos (V5: public.certificados + copia fija de certificados_v5).
export default async function CertificadosPage() {
  const sesion = await requerirPanel("admin")
  const institucionId = sesion.perfil.institucionId
  const r = institucionId ? await leer(institucionId) : null
  return (
    <>
      <EncabezadoCertificados actual="emitidos" />
      {r === null ? (
        <AvisoCertificados texto="No se encontró la institución asociada a tu cuenta." />
      ) : r === "no_disponible" ? (
        <AvisoCertificados texto={MIGRACION_PENDIENTE} />
      ) : r === "error" ? (
        <AvisoCertificados texto="No se pudieron cargar los certificados. Recarga la página en unos minutos." />
      ) : (
        <EmitidosPanel emitidos={r} />
      )}
    </>
  )
}
