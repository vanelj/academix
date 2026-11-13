"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { docenteActual } from "@/lib/auth/contexto"
import { claveNota, MAX_CAMBIOS, planificarNotas, type ErrorNota } from "@/lib/docente/notas"
import { leerTodo } from "@/lib/pagos/datos"
import { esErrorDeRed } from "@/lib/registro/errores"
import { createClient } from "@/lib/supabase/server"

/**
 * Registro de notas del docente (tabla public.calificaciones de V5).
 * Defensa en capas:
 *  1. Sesión con rol docente ACTIVO (docenteActual) y grupo propio (docente_id = usuario).
 *  2. Validación de cada celda en el servidor (planificarNotas).
 *  3. RLS «docente gestiona calificaciones» (solo grupos del docente) y el
 *     disparador proteger_calificacion_v5 (no se tocan resultados cerrados).
 * No se usa la clave de servicio: todo va con la sesión del docente.
 */

export type ResultadoNotas =
  | { ok: true; guardadas: number; errores: ErrorNota[]; /** true = se guardó con publicación por nota (revision_funcional_v5). */ publicacionDirecta?: boolean }
  | { ok: false; mensaje: string; errores?: ErrorNota[] }

const entrada = z.object({
  grupoId: z.uuid(),
  cambios: z.array(z.object({ matriculaId: z.uuid(), evaluacionId: z.uuid(), nota: z.string().max(10) })).min(1).max(MAX_CAMBIOS),
})

type ErrorBd = { code?: string; message: string }

function mensajeBd(e: ErrorBd): string {
  if (esErrorDeRed(e)) return "No se pudo conectar con el servidor. Tus cambios siguen en pantalla: inténtalo de nuevo."
  if (/resultado final/i.test(e.message)) return "El resultado final ya está cerrado: la institución debe reabrirlo para cambiar notas."
  // Mensajes propios de guardar_calificaciones (ya están en español y son seguros).
  if (/motivo|entre 0 y 20|no está activa|no pertenece|cancelado/i.test(e.message)) return e.message
  if (e.code === "42501") return "No tienes permiso para registrar notas en este grupo."
  if (e.code === "23514") return "La nota debe estar entre 0 y 20."
  console.error("[docente] notas", e.code, e.message)
  return "No se pudo guardar esta nota. Inténtalo de nuevo."
}

const opcionesGuardado = z.object({ publicar: z.boolean().default(true), motivo: z.string().trim().max(500).default("") }).default({ publicar: true, motivo: "" })

/**
 * Guarda notas. Con revision_funcional_v5 usa guardar_calificaciones:
 *  - `publicar` (por defecto): cada nota guardada queda visible para SU
 *    estudiante al instante; nunca publica borradores de otros estudiantes.
 *  - Corregir o anular una nota que el estudiante ya ve exige `motivo`; el
 *    cambio queda en el historial inmutable (sin borrado físico desde la app).
 * Sin la migración: el flujo anterior (guardar = borrador; se publica por evaluación).
 */
export async function guardarNotas(grupoId: unknown, cambios: unknown, opciones?: unknown): Promise<ResultadoNotas> {
  const docente = await docenteActual()
  if (!docente) return { ok: false, mensaje: "Tu sesión no tiene el rol Docente activo. Vuelve a iniciar sesión." }
  const v = entrada.safeParse({ grupoId, cambios })
  const o = opcionesGuardado.safeParse(opciones ?? undefined)
  if (!v.success || !o.success) return { ok: false, mensaje: "Los datos enviados no son válidos. Recarga la página e inténtalo de nuevo." }
  const { institucionId, userId } = docente
  const supabase = await createClient()

  // 1. Registro auditado con publicación por nota (si la función existe).
  const rpc = await supabase.rpc("guardar_calificaciones", {
    p_grupo: v.data.grupoId,
    p_notas: v.data.cambios.map((c) => ({ matricula: c.matriculaId, evaluacion: c.evaluacionId, nota: c.nota.trim().replace(",", ".") || null })),
    p_publicar: o.data.publicar,
    p_motivo: o.data.motivo || null,
  })
  if (!rpc.error) {
    const r = (rpc.data ?? {}) as { guardadas?: number; errores?: { matricula: string; evaluacion: string; mensaje: string }[] }
    const guardadas = Number(r.guardadas ?? 0)
    if (guardadas > 0) {
      revalidatePath("/docente", "layout")
      revalidatePath(`/admin/evaluaciones/${v.data.grupoId}`)
      revalidatePath("/estudiante", "layout")
    }
    return {
      ok: true,
      guardadas,
      publicacionDirecta: true,
      errores: (r.errores ?? []).map((e) => ({ matriculaId: e.matricula, evaluacionId: e.evaluacion, mensaje: mensajeBd({ message: e.mensaje }) })),
    }
  }
  if (!["PGRST202", "42883"].includes(rpc.error.code ?? "")) return { ok: false, mensaje: mensajeBd(rpc.error) }

  // 2. Sin la migración: flujo anterior (RLS «docente gestiona calificaciones»).

  const { data: grupo, error: gError } = await supabase
    .from("grupos")
    .select("id, estado")
    .eq("id", v.data.grupoId)
    .eq("docente_id", userId)
    .eq("institucion_id", institucionId)
    .maybeSingle()
    .overrideTypes<{ id: string; estado: string }, { merge: false }>()
  if (gError) return { ok: false, mensaje: mensajeBd(gError) }
  if (!grupo) return { ok: false, mensaje: "El grupo no existe o ya no lo tienes asignado." }
  if (grupo.estado === "cancelado") return { ok: false, mensaje: "El grupo fue cancelado: no admite notas." }

  let evaluaciones: { id: string }[], matriculas: { id: string; estado: string; estado_final: "en_curso" | "aprobado" | "desaprobado" }[], existentes: { id: string; evaluacion_id: string; matricula_id: string; nota: number }[]
  try {
    ;[evaluaciones, matriculas, existentes] = await Promise.all([
      leerTodo<{ id: string }>((d, h) => supabase.from("evaluaciones").select("id").eq("institucion_id", institucionId).eq("grupo_id", grupo.id).order("id").range(d, h)),
      leerTodo<{ id: string; estado: string; estado_final: "en_curso" | "aprobado" | "desaprobado" }>((d, h) => supabase.from("matriculas").select("id, estado, estado_final").eq("institucion_id", institucionId).eq("grupo_id", grupo.id).order("id").range(d, h)),
      leerTodo<{ id: string; evaluacion_id: string; matricula_id: string; nota: number }>((d, h) => supabase.from("calificaciones").select("id, evaluacion_id, matricula_id, nota").eq("institucion_id", institucionId).eq("grupo_id", grupo.id).order("id").range(d, h)),
    ])
  } catch (e) {
    return { ok: false, mensaje: mensajeBd(e as ErrorBd) }
  }

  const plan = planificarNotas(v.data.cambios, {
    evaluaciones: new Set(evaluaciones.map((e) => e.id)),
    matriculas: new Map(matriculas.filter((m) => m.estado === "activa").map((m) => [m.id, m.estado_final])),
    existentes: new Map(existentes.map((n) => [claveNota(n.matricula_id, n.evaluacion_id), { id: n.id, nota: Number(n.nota) }])),
  })
  const errores = [...plan.errores]
  let guardadas = 0

  // Nuevas: un solo INSERT; si falla (p. ej. otra sesión registró la misma nota), se reintenta una por una.
  if (plan.insertar.length) {
    const filas = plan.insertar.map((n) => ({ institucion_id: institucionId, grupo_id: grupo.id, evaluacion_id: n.evaluacionId, matricula_id: n.matriculaId, nota: n.nota }))
    const { error } = await supabase.from("calificaciones").insert(filas)
    if (!error) guardadas += filas.length
    else {
      for (const [i, fila] of filas.entries()) {
        const n = plan.insertar[i]
        const r = await supabase.from("calificaciones").insert(fila)
        if (!r.error) { guardadas++; continue }
        if (r.error.code === "23505") {
          // Ya existía: se actualiza (solo la columna nota, que es la que V5 permite cambiar).
          const u = await supabase.from("calificaciones").update({ nota: n.nota }).eq("institucion_id", institucionId).eq("grupo_id", grupo.id)
            .eq("evaluacion_id", n.evaluacionId).eq("matricula_id", n.matriculaId).select("id")
          if (!u.error && u.data?.length) { guardadas++; continue }
          errores.push({ matriculaId: n.matriculaId, evaluacionId: n.evaluacionId, mensaje: u.error ? mensajeBd(u.error) : "No se pudo guardar esta nota." })
          continue
        }
        errores.push({ matriculaId: n.matriculaId, evaluacionId: n.evaluacionId, mensaje: mensajeBd(r.error) })
      }
    }
  }

  await enTandas(plan.actualizar, 8, async (n) => {
    const r = await supabase.from("calificaciones").update({ nota: n.nota }).eq("id", n.id).eq("institucion_id", institucionId).eq("grupo_id", grupo.id).select("id")
    if (!r.error && r.data?.length) guardadas++
    else errores.push({ matriculaId: n.matriculaId, evaluacionId: n.evaluacionId, mensaje: r.error ? mensajeBd(r.error) : "La nota cambió en otra sesión. Recarga la página." })
  })

  if (plan.borrar.length) {
    const r = await supabase.from("calificaciones").delete().in("id", plan.borrar.map((n) => n.id)).eq("institucion_id", institucionId).eq("grupo_id", grupo.id).select("id")
    if (!r.error) {
      const borradas = new Set((r.data ?? []).map((x) => (x as { id: string }).id))
      guardadas += borradas.size
      for (const n of plan.borrar) if (!borradas.has(n.id)) errores.push({ matriculaId: n.matriculaId, evaluacionId: n.evaluacionId, mensaje: "No se pudo quitar esta nota. Recarga la página." })
    } else {
      for (const n of plan.borrar) errores.push({ matriculaId: n.matriculaId, evaluacionId: n.evaluacionId, mensaje: mensajeBd(r.error) })
    }
  }

  if (guardadas > 0) {
    revalidatePath("/docente", "layout")
    revalidatePath(`/admin/evaluaciones/${grupo.id}`)
    revalidatePath("/estudiante/evaluaciones")
  }
  return { ok: true, guardadas, errores }
}

async function enTandas<T>(items: T[], tamano: number, fn: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += tamano) await Promise.all(items.slice(i, i + tamano).map(fn))
}
