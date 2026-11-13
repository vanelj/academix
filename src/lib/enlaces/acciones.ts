"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { docenteActual, institucionDelAdmin } from "@/lib/auth/contexto"
import { enlaceHttps } from "@/lib/horarios/calendario"
import { createClient } from "@/lib/supabase/server"

/**
 * Enlaces de clase virtual (Meet, Zoom, Teams u otro https).
 * - Administrador (módulo «docentes»): uno para todos los horarios del grupo
 *   o por horario (formulario de horario), con su sesión y la RLS «admin gestiona horarios».
 * - Docente del grupo: solo si la institución lo autoriza; pasa por la RPC
 *   actualizar_enlace_clase (administracion_v5), que vuelve a comprobarlo.
 * Nunca se publica en el catálogo (oferta_horarios no tiene el enlace).
 */

export type ResultadoEnlace = { ok: true; actualizados?: number } | { ok: false; mensaje: string }

const uuid = z.uuid()
const FUNCION_INEXISTENTE = new Set(["PGRST202", "42883"])

function validarEnlace(enlace: unknown): { ok: true; valor: string | null } | { ok: false } {
  if (enlace === null || (typeof enlace === "string" && enlace.trim() === "")) return { ok: true, valor: null }
  if (typeof enlace !== "string" || enlace.length > 500) return { ok: false }
  const v = enlaceHttps(enlace)
  return v ? { ok: true, valor: v } : { ok: false }
}

const NO_HTTPS = { ok: false as const, mensaje: "El enlace debe empezar por https:// (Google Meet, Zoom, Microsoft Teams u otra plataforma)." }

/** Administrador: mismo enlace para todos los horarios del grupo (null = retirar). */
export async function aplicarEnlaceGrupo(grupoId: unknown, enlace: unknown): Promise<ResultadoEnlace> {
  const institucionId = await institucionDelAdmin("docentes")
  if (!institucionId) return { ok: false, mensaje: "No tienes permiso para gestionar los grupos." }
  const g = uuid.safeParse(grupoId)
  const e = validarEnlace(enlace)
  if (!g.success) return { ok: false, mensaje: "Grupo no válido." }
  if (!e.ok) return NO_HTTPS
  const supabase = await createClient()
  const { data: grupo } = await supabase.from("grupos").select("id, estado").eq("id", g.data).eq("institucion_id", institucionId).maybeSingle()
  if (!grupo) return { ok: false, mensaje: "El grupo no existe o no pertenece a tu institución." }
  if (grupo.estado === "cerrado" || grupo.estado === "cancelado") return { ok: false, mensaje: "El grupo está cerrado o cancelado." }
  const { data, error } = await supabase.from("horarios").update({ enlace_clase: e.valor }).eq("grupo_id", g.data).eq("institucion_id", institucionId).select("id")
  if (error) {
    console.error("[enlaces] grupo", error.code, error.message)
    return { ok: false, mensaje: "No se pudo guardar el enlace. Inténtalo de nuevo." }
  }
  revalidar(g.data)
  return { ok: true, actualizados: data?.length ?? 0 }
}

/** Docente del grupo (si la institución lo autoriza): un horario o todos (horarioId null). */
export async function actualizarEnlaceDocente(grupoId: unknown, horarioId: unknown, enlace: unknown): Promise<ResultadoEnlace> {
  const docente = await docenteActual()
  if (!docente) return { ok: false, mensaje: "Tu sesión no tiene el rol docente activo." }
  const g = uuid.safeParse(grupoId)
  const h = horarioId === null ? { success: true as const, data: null } : uuid.safeParse(horarioId)
  const e = validarEnlace(enlace)
  if (!g.success || !h.success) return { ok: false, mensaje: "Solicitud no válida." }
  if (!e.ok) return NO_HTTPS
  const supabase = await createClient()
  const { data: grupo } = await supabase.from("grupos").select("id").eq("id", g.data).eq("docente_id", docente.userId).eq("institucion_id", docente.institucionId).maybeSingle()
  if (!grupo) return { ok: false, mensaje: "Este grupo no está asignado a ti." }
  const { data, error } = await supabase.rpc("actualizar_enlace_clase", { p_grupo: g.data, p_horario: h.data, p_enlace: e.valor })
  if (error) {
    if (FUNCION_INEXISTENTE.has(error.code ?? "")) return { ok: false, mensaje: "Aún no está habilitado que los docentes gestionen enlaces (falta «administracion_v5»)." }
    if (error.code === "42501") return { ok: false, mensaje: "Tu institución no autorizó a los docentes a gestionar los enlaces. Pídelo al administrador." }
    console.error("[enlaces] docente", error.code, error.message)
    return { ok: false, mensaje: /cerrado|cancelado/i.test(error.message) ? "El grupo está cerrado o cancelado." : "No se pudo guardar el enlace." }
  }
  revalidar(g.data)
  return { ok: true, actualizados: Number(data ?? 0) }
}

/** Administrador (módulo «docentes»): autoriza o no a los docentes a gestionar sus enlaces. */
export async function cambiarEnlacesDocentes(permitir: unknown): Promise<ResultadoEnlace> {
  const institucionId = await institucionDelAdmin("docentes")
  if (!institucionId) return { ok: false, mensaje: "No tienes permiso para cambiar esta configuración." }
  if (typeof permitir !== "boolean") return { ok: false, mensaje: "Solicitud no válida." }
  const supabase = await createClient()
  const { data, error } = await supabase.from("instituciones").update({ docentes_gestionan_enlaces: permitir }).eq("id", institucionId).select("id")
  if (error) {
    if (error.code === "42703" || error.code === "PGRST204") return { ok: false, mensaje: "Esta opción se habilita con la actualización «administracion_v5»." }
    console.error("[enlaces] configuración", error.code, error.message)
    return { ok: false, mensaje: "No se pudo guardar la configuración." }
  }
  if (!data?.length) return { ok: false, mensaje: "No tienes permiso para cambiar esta configuración." }
  revalidatePath("/admin/docentes")
  revalidatePath("/docente/grupos", "layout")
  return { ok: true }
}

function revalidar(grupoId: string) {
  revalidatePath(`/admin/grupos/${grupoId}`)
  revalidatePath("/admin/calendario")
  revalidatePath(`/docente/grupos/${grupoId}`)
  revalidatePath("/docente/horarios")
  revalidatePath("/estudiante/cursos", "layout")
  revalidatePath("/estudiante/horarios")
}
