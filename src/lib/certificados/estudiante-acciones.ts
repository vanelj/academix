"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { obtenerContexto } from "@/lib/auth/contexto"
import { BUCKET_EMITIDOS, VIGENCIA_ENLACE_CERTIFICADO } from "@/lib/certificados/config"
import { esErrorDeRed } from "@/lib/registro/errores"
import { createClient } from "@/lib/supabase/server"

/**
 * Acciones del ESTUDIANTE sobre sus certificados.
 * - solicitarCertificado: crea (o reutiliza) la solicitud del certificado con
 *   costo adicional (RPC solicitar_certificado). Pedirlo es opcional y no
 *   cambia el resultado académico.
 * - enlaceMiCertificado: enlace firmado de 2 min a SU PDF (RLS + política de
 *   Storage "v5 emitidos: leer propios").
 */

type Resultado = { ok: true; id?: string; url?: string } | { ok: false; mensaje: string; gravedad: "error" | "advertencia" }

async function estudianteActivo() {
  const ctx = await obtenerContexto()
  return ctx.estado === "con_perfil" && ctx.perfil.activo && ctx.rolActivo === "estudiante"
}

const SIN_ROL: Resultado = { ok: false, gravedad: "advertencia", mensaje: "Entra con tu rol de estudiante activo." }

export async function solicitarCertificado(matriculaId: unknown): Promise<Resultado> {
  if (!(await estudianteActivo())) return SIN_ROL
  const id = z.uuid().safeParse(matriculaId)
  if (!id.success) return { ok: false, gravedad: "error", mensaje: "No se pudo completar la operación." }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("solicitar_certificado", { p_matricula: id.data })
  if (error) {
    if (esErrorDeRed(error)) return { ok: false, gravedad: "error", mensaje: "No se pudo conectar con el servidor. Inténtalo de nuevo." }
    console.error("[mis-certificados] solicitar", error.code, error.message)
    if (/ya fue emitido/i.test(error.message)) return { ok: false, gravedad: "advertencia", mensaje: "El certificado ya fue emitido. Recarga la página." }
    if (/no tiene costo adicional/i.test(error.message)) return { ok: false, gravedad: "advertencia", mensaje: "Este certificado no requiere pago." }
    if (/activa y aprobada/i.test(error.message)) return { ok: false, gravedad: "advertencia", mensaje: "El certificado se solicita con el curso aprobado." }
    return { ok: false, gravedad: "error", mensaje: "No se pudo solicitar el certificado. Inténtalo de nuevo en unos minutos." }
  }
  revalidatePath("/estudiante/certificados")
  return { ok: true, id: typeof data === "string" ? data : undefined }
}

export async function enlaceMiCertificado(certificadoId: unknown): Promise<Resultado> {
  if (!(await estudianteActivo())) return SIN_ROL
  const id = z.uuid().safeParse(certificadoId)
  if (!id.success) return { ok: false, gravedad: "error", mensaje: "No se pudo abrir el certificado." }
  const supabase = await createClient()
  // RLS "ver certificados": el estudiante solo ve los de sus matrículas.
  const { data } = await supabase.from("certificados").select("archivo_url").eq("id", id.data).maybeSingle().overrideTypes<{ archivo_url: string | null }, { merge: false }>()
  if (!data) return { ok: false, gravedad: "error", mensaje: "El certificado no existe o no es tuyo." }
  if (!data.archivo_url) return { ok: false, gravedad: "advertencia", mensaje: "La institución aún está generando el PDF. Inténtalo más tarde." }
  const { data: firmado, error } = await supabase.storage.from(BUCKET_EMITIDOS).createSignedUrl(data.archivo_url, VIGENCIA_ENLACE_CERTIFICADO, { download: true })
  if (error || !firmado?.signedUrl) return { ok: false, gravedad: "error", mensaje: "No se pudo abrir el PDF." }
  return { ok: true, url: firmado.signedUrl }
}
