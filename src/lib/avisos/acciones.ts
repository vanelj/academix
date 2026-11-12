"use server"

import { z } from "zod"

import { obtenerContexto } from "@/lib/auth/contexto"
import type { Aviso } from "@/lib/avisos/formato"
import { createClient } from "@/lib/supabase/server"

/**
 * Centro de notificaciones (tabla public.notificaciones, migración notificaciones_v5).
 * Con la sesión del usuario: la RLS solo devuelve SUS avisos del ROL ACTIVO y
 * solo permite cambiar leida_en. Si la migración no está aplicada, se responde
 * { disponible: false } y la campana no se muestra (nada se rompe).
 */

export type BandejaAvisos = { disponible: true; avisos: Aviso[]; noLeidas: number } | { disponible: false }

const tablaInexistente = (e: { code?: string } | null) => e?.code === "PGRST205" || e?.code === "42P01"
const LIMITE = 30

export async function leerAvisos(): Promise<BandejaAvisos> {
  const ctx = await obtenerContexto()
  if (ctx.estado !== "con_perfil" || !ctx.rolActivo) return { disponible: false }
  const supabase = await createClient()
  const [lista, conteo] = await Promise.all([
    supabase.from("notificaciones").select("id, tipo, titulo, cuerpo, enlace, creada_en, leida_en")
      .eq("destinatario_id", ctx.userId).eq("rol", ctx.rolActivo)
      .order("creada_en", { ascending: false }).limit(LIMITE)
      .overrideTypes<Aviso[], { merge: false }>(),
    supabase.from("notificaciones").select("id", { count: "exact", head: true })
      .eq("destinatario_id", ctx.userId).eq("rol", ctx.rolActivo).is("leida_en", null),
  ])
  const error = lista.error ?? conteo.error
  if (error) {
    if (tablaInexistente(error)) return { disponible: false }
    console.error("[avisos] lectura", error.code, error.message)
    throw new Error("No se pudieron cargar las notificaciones.")
  }
  return { disponible: true, avisos: lista.data ?? [], noLeidas: conteo.count ?? 0 }
}

/** Marca como leídas las indicadas o, sin ids, todas las del rol activo. */
export async function marcarAvisosLeidos(ids?: unknown): Promise<{ ok: boolean }> {
  const ctx = await obtenerContexto()
  if (ctx.estado !== "con_perfil" || !ctx.rolActivo) return { ok: false }
  const v = ids === undefined ? null : z.array(z.uuid()).min(1).max(100).safeParse(ids)
  if (v && !v.success) return { ok: false }
  const supabase = await createClient()
  let consulta = supabase.from("notificaciones").update({ leida_en: new Date().toISOString() })
    .eq("destinatario_id", ctx.userId).eq("rol", ctx.rolActivo).is("leida_en", null)
  if (v) consulta = consulta.in("id", v.data)
  const { error } = await consulta
  if (error) {
    if (!tablaInexistente(error)) console.error("[avisos] marcar", error.code, error.message)
    return { ok: false }
  }
  return { ok: true }
}
