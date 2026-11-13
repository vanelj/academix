"use server"

import { revalidatePath } from "next/cache"

import { institucionDelAdmin } from "@/lib/auth/contexto"
import { createClient } from "@/lib/supabase/server"

export type ResultadoHoraAcademica = { ok: true } | { ok: false; mensaje: string }

/** Administrador (módulo «institucion»): define o quita la equivalencia (15 a 120 min). */
export async function guardarMinutosHoraAcademica(valor: unknown): Promise<ResultadoHoraAcademica> {
  const institucionId = await institucionDelAdmin("institucion")
  if (!institucionId) return { ok: false, mensaje: "No tienes permiso para cambiar esta configuración." }
  const minutos = valor === null || valor === "" ? null : Number(valor)
  if (minutos !== null && (!Number.isInteger(minutos) || minutos < 15 || minutos > 120)) {
    return { ok: false, mensaje: "Indica un número entero de minutos entre 15 y 120 (por ejemplo, 45)." }
  }
  const supabase = await createClient()
  const { data, error } = await supabase.from("instituciones").update({ minutos_hora_academica: minutos }).eq("id", institucionId).select("id")
  if (error) {
    if (error.code === "42703" || error.code === "PGRST204") return { ok: false, mensaje: "Esta opción se habilita con la actualización «revision_funcional_v5»." }
    console.error("[institucion] guardar hora académica", error.code, error.message)
    return { ok: false, mensaje: "No se pudo guardar la configuración." }
  }
  if (!data?.length) return { ok: false, mensaje: "No tienes permiso para cambiar esta configuración." }
  revalidatePath("/admin/institucion")
  revalidatePath("/admin/grupos", "layout")
  return { ok: true }
}
