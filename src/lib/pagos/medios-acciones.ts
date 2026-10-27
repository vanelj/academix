"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { institucionDelAdmin } from "@/lib/auth/contexto"
import { tablaInexistente } from "@/lib/pagos/medios"
import { esErrorDeRed } from "@/lib/registro/errores"
import { createClient } from "@/lib/supabase/server"
import { medioCobroSchema, medioParaGuardar } from "@/lib/validations/medio-cobro"

/**
 * Medios de cobro de la institución del administrador.
 * - institucion_id sale SIEMPRE del perfil en el servidor y filtra cada UPDATE y DELETE.
 * - RLS ("v5 admin gestiona medios de cobro") vuelve a exigir admin activo de la misma institución.
 * - Eliminar no afecta a pagos históricos: pagos.metodo guarda el texto del método.
 */

export type ResultadoMedio =
  | { ok: true; id: string }
  | { ok: false; mensaje: string; gravedad: "error" | "advertencia"; campos?: Record<string, string> }

type Fallo = Extract<ResultadoMedio, { ok: false }>

const SIN_PERMISO: Fallo = { ok: false, gravedad: "error", mensaje: "Tu sesión no tiene permiso de administrador. Vuelve a iniciar sesión." }
const NO_ENCONTRADO: Fallo = { ok: false, gravedad: "error", mensaje: "El medio de cobro no existe o no pertenece a tu institución. Recarga la página." }
const NO_DISPONIBLE: Fallo = {
  ok: false,
  gravedad: "advertencia",
  mensaje: "La configuración de medios de cobro aún no está habilitada en la base de datos (migración medios_cobro_v5 pendiente).",
}

function validar(datos: unknown): { ok: true; fila: ReturnType<typeof medioParaGuardar> } | Fallo {
  const v = medioCobroSchema.safeParse(datos)
  if (v.success) return { ok: true, fila: medioParaGuardar(v.data) }
  const campos: Record<string, string> = {}
  for (const i of v.error.issues) {
    const k = String(i.path[0] ?? "")
    if (k && !campos[k]) campos[k] = i.message
  }
  return { ok: false, gravedad: "error", mensaje: "Revisa los datos del medio de cobro.", campos }
}

export async function guardarMedioCobro(id: unknown, datos: unknown): Promise<ResultadoMedio> {
  const institucionId = await institucionDelAdmin()
  if (!institucionId) return SIN_PERMISO
  const idValido = id === null ? null : z.uuid().safeParse(id)
  if (idValido && !idValido.success) return NO_ENCONTRADO
  const v = validar(datos)
  if (!v.ok) return v

  const supabase = await createClient()
  const fila = { ...v.fila, actualizado_en: new Date().toISOString() }
  const { data, error } = idValido
    ? await supabase
        .from("medios_cobro_institucion")
        .update(fila)
        .eq("id", idValido.data)
        .eq("institucion_id", institucionId)
        .select("id")
    : await supabase
        .from("medios_cobro_institucion")
        .insert({ ...fila, institucion_id: institucionId })
        .select("id")
  if (error) return fallo(error)
  if (!data?.length) return NO_ENCONTRADO
  revalidar()
  return { ok: true, id: (data[0] as { id: string }).id }
}

export async function cambiarEstadoMedio(id: unknown, activo: unknown): Promise<ResultadoMedio> {
  const institucionId = await institucionDelAdmin()
  if (!institucionId) return SIN_PERMISO
  const v = z.object({ id: z.uuid(), activo: z.boolean() }).safeParse({ id, activo })
  if (!v.success) return NO_ENCONTRADO

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("medios_cobro_institucion")
    .update({ activo: v.data.activo, actualizado_en: new Date().toISOString() })
    .eq("id", v.data.id)
    .eq("institucion_id", institucionId)
    .select("id")
  if (error) return fallo(error)
  if (!data?.length) return NO_ENCONTRADO
  revalidar()
  return { ok: true, id: v.data.id }
}

export async function eliminarMedioCobro(id: unknown): Promise<ResultadoMedio> {
  const institucionId = await institucionDelAdmin()
  if (!institucionId) return SIN_PERMISO
  const v = z.uuid().safeParse(id)
  if (!v.success) return NO_ENCONTRADO

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("medios_cobro_institucion")
    .delete()
    .eq("id", v.data)
    .eq("institucion_id", institucionId)
    .select("id")
  if (error) return fallo(error)
  if (!data?.length) return NO_ENCONTRADO
  revalidar()
  return { ok: true, id: v.data }
}

function revalidar() {
  revalidatePath("/admin/pagos/medios")
  revalidatePath("/estudiante/pagos", "layout")
}

function fallo(error: { code?: string; message: string }): Fallo {
  if (esErrorDeRed(error)) return { ok: false, gravedad: "error", mensaje: "No se pudo conectar con el servidor. Inténtalo de nuevo." }
  if (tablaInexistente(error)) return NO_DISPONIBLE
  console.error("[medios] escritura", error.code, error.message)
  if (error.code === "42501") return SIN_PERMISO
  if (error.code === "23514") return { ok: false, gravedad: "error", mensaje: "Algún dato no tiene el formato esperado. Revisa celular, cuenta y CCI." }
  return { ok: false, gravedad: "error", mensaje: "No se pudo guardar. Inténtalo de nuevo en unos minutos." }
}
