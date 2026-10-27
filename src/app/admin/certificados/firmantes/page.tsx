import type { Metadata } from "next"

import { AvisoCertificados, MIGRACION_PENDIENTE } from "@/components/admin/certificados/certificado-ui"
import { FirmantesPanel } from "@/components/admin/certificados/firmantes-panel"
import { requerirPanel } from "@/lib/auth/contexto"
import { BUCKET_RECURSOS } from "@/lib/certificados/config"
import { obtenerRecursosCertificado, type Firmante } from "@/lib/certificados/datos"
import { createClient } from "@/lib/supabase/server"

import { EncabezadoCertificados } from "../encabezado"

export const metadata: Metadata = {
  title: "Firmantes · Academix",
}

async function leer(institucionId: string): Promise<"error" | "no_disponible" | (Firmante & { firmaUrl: string | null })[]> {
  try {
    const recursos = await obtenerRecursosCertificado(institucionId)
    if (!recursos.disponible) return "no_disponible"
    // Miniaturas de firma con enlaces firmados de 10 min (archivos privados).
    const supabase = await createClient()
    return await Promise.all(
      recursos.firmantes.map(async (f) => {
        if (!f.firma_path) return { ...f, firmaUrl: null }
        const { data } = await supabase.storage.from(BUCKET_RECURSOS).createSignedUrl(f.firma_path, 600)
        return { ...f, firmaUrl: data?.signedUrl ?? null }
      })
    )
  } catch {
    return "error"
  }
}

export default async function FirmantesPage() {
  const sesion = await requerirPanel("admin")
  const institucionId = sesion.perfil.institucionId
  const r = institucionId ? await leer(institucionId) : null
  return (
    <>
      <EncabezadoCertificados actual="firmantes" />
      {r === null || !institucionId ? (
        <AvisoCertificados texto="No se encontró la institución asociada a tu cuenta." />
      ) : r === "no_disponible" ? (
        <AvisoCertificados texto={MIGRACION_PENDIENTE} />
      ) : r === "error" ? (
        <AvisoCertificados texto="No se pudieron cargar los firmantes. Recarga la página en unos minutos." />
      ) : (
        <FirmantesPanel firmantes={r} institucionId={institucionId} />
      )}
    </>
  )
}
