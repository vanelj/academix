import type { Modalidad } from "@/lib/certificados/config"
import { createClient } from "@/lib/supabase/server"

/**
 * Certificados del propio ESTUDIANTE (RPC mis_certificados de certificados_v5:
 * solo filas de auth.uid() con rol estudiante activo). Incluye las matrículas
 * aprobadas aún sin certificado, con la modalidad y el estado del pago.
 */

export type MiCertificado = {
  matriculaId: string
  institucion: string
  curso: string
  grupo: string
  modalidad: Modalidad
  importe: number
  solicitudId: string | null
  solicitudEstado: "pendiente" | "pagada" | "anulada" | null
  pagoEnRevision: boolean
  certificado: { id: string; codigo: string; fecha_emision: string; tienePdf: boolean } | null
}

export async function obtenerMisCertificados(): Promise<{ disponible: false } | { disponible: true; certificados: MiCertificado[] }> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("mis_certificados")
  if (error) {
    if (error.code === "PGRST202") return { disponible: false }
    console.error("[mis-certificados]", error.code, error.message)
    throw new Error("No se pudieron cargar tus certificados.")
  }
  type Fila = {
    matricula_id: string; institucion: string; curso: string; grupo: string; modalidad: Modalidad; importe: number
    solicitud_id: string | null; solicitud_estado: MiCertificado["solicitudEstado"]; pago_pendiente: boolean
    certificado_id: string | null; codigo: string | null; fecha_emision: string | null; tiene_pdf: boolean | null
  }
  return {
    disponible: true,
    certificados: ((data ?? []) as Fila[]).map((f) => ({
      matriculaId: f.matricula_id,
      institucion: f.institucion,
      curso: f.curso,
      grupo: f.grupo,
      modalidad: f.modalidad,
      importe: Number(f.importe),
      solicitudId: f.solicitud_id,
      solicitudEstado: f.solicitud_estado,
      pagoEnRevision: f.pago_pendiente,
      certificado: f.certificado_id && f.codigo && f.fecha_emision ? { id: f.certificado_id, codigo: f.codigo, fecha_emision: f.fecha_emision, tienePdf: !!f.tiene_pdf } : null,
    })),
  }
}
