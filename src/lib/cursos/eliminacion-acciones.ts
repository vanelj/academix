"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { institucionDelAdmin } from "@/lib/auth/contexto"
import { archivosLimpiables, confirmacionDobleValida, normalizarDiagnostico, type Diagnostico } from "@/lib/cursos/eliminacion"
import { eliminarCurso } from "@/lib/cursos/acciones"
import { BUCKET_PORTADAS, rutaPortadaDeCurso } from "@/lib/cursos/portada"
import { eliminarGrupo } from "@/lib/grupos/acciones"
import { BUCKET_MATERIALES } from "@/lib/materiales/reglas"
import { clienteAdministrativo } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

/**
 * Eliminación segura (servidor). Capa 1: permiso del módulo («cursos» para
 * cursos, «docentes» para grupos) y pertenencia a la institución. Capa 2: las
 * funciones transaccionales de eliminacion_segura_v5 revalidan TODO bajo
 * bloqueo y borran en una sola transacción. Mientras la migración no esté
 * aplicada se conserva el comportamiento anterior (solo cursos sin grupos ni
 * plan de cuotas y grupos sin registros) y se informa.
 *
 * Los archivos de Storage se limpian DESPUÉS de confirmar el borrado (no es
 * parte de la transacción): solo rutas devueltas por la BD y validadas aquí.
 */

const uuid = z.uuid()
const FUNCION_INEXISTENTE = new Set(["PGRST202", "42883"])
type Cliente = Awaited<ReturnType<typeof createClient>>

export type DiagnosticoEliminacion =
  | {
      ok: true
      diagnostico: Diagnostico
      nombre: string
      estado: string
      /** Grupo con historial, para enlazar Matrículas o Solicitudes ya filtradas. */
      grupoConHistorial: { matriculas: string | null; solicitudes: string | null }
      /** Sin eliminacion_segura_v5: diagnóstico calculado por la app y borrado limitado. */
      migracionPendiente: boolean
    }
  | { ok: false; mensaje: string }

export type ResultadoEliminacion = { ok: true; aviso?: string } | { ok: false; mensaje: string; gravedad: "error" | "advertencia" }

// ---------------------------------------------------------------------------
// Diagnóstico de respaldo (sin la migración): conteos con la sesión del admin.

async function cuenta(supabase: Cliente, tabla: string, columna: string, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0
  const { count, error } = await supabase.from(tabla).select("id", { count: "exact", head: true }).in(columna, ids)
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return 0
    throw new Error(`[eliminacion] ${tabla}: ${error.message}`)
  }
  return count ?? 0
}

async function diagnosticoApp(supabase: Cliente, grupoIds: string[], cursoId: string | null, portada: boolean): Promise<Diagnostico> {
  const [mats, sols, evals] = await Promise.all([
    grupoIds.length ? supabase.from("matriculas").select("id, estado").in("grupo_id", grupoIds) : Promise.resolve({ data: [], error: null }),
    grupoIds.length ? supabase.from("solicitudes_inscripcion").select("id").in("grupo_id", grupoIds) : Promise.resolve({ data: [], error: null }),
    grupoIds.length ? supabase.from("evaluaciones").select("id").in("grupo_id", grupoIds) : Promise.resolve({ data: [], error: null }),
  ])
  const err = mats.error ?? sols.error ?? evals.error
  if (err) throw new Error(err.message)
  const matIds = (mats.data ?? []).map((m) => m.id as string)
  const solIds = (sols.data ?? []).map((s) => s.id as string)
  const evalIds = (evals.data ?? []).map((e) => e.id as string)
  const [horarios, materiales, plan, condiciones, certificacion, cuotas, pagosM, pagosS, califE, califM, certificados, resultados] = await Promise.all([
    cuenta(supabase, "horarios", "grupo_id", grupoIds),
    cuenta(supabase, "materiales_curso", "grupo_id", grupoIds),
    cursoId ? supabase.from("plan_cuotas").select("id", { count: "exact", head: true }).eq("curso_id", cursoId).then((r) => r.count ?? 0) : Promise.resolve(0),
    cursoId ? supabase.from("condiciones_curso").select("curso_id", { count: "exact", head: true }).eq("curso_id", cursoId).then((r) => r.count ?? 0) : Promise.resolve(0),
    cursoId ? supabase.from("certificacion_curso").select("curso_id", { count: "exact", head: true }).eq("curso_id", cursoId).then((r) => r.count ?? 0) : Promise.resolve(0),
    cuenta(supabase, "cuotas", "matricula_id", matIds),
    cuenta(supabase, "pagos", "matricula_id", matIds),
    cuenta(supabase, "pagos", "solicitud_id", solIds),
    cuenta(supabase, "calificaciones", "evaluacion_id", evalIds),
    cuenta(supabase, "calificaciones", "matricula_id", matIds),
    cuenta(supabase, "certificados", "matricula_id", matIds),
    cuenta(supabase, "historial_resultados", "matricula_id", matIds),
  ])
  return normalizarDiagnostico({
    grupos: grupoIds.length, horarios, evaluaciones: evalIds.length, materiales,
    plan_cuotas: plan, condiciones, certificacion, portada: portada ? 1 : 0,
    matriculas: matIds.length, matriculas_anuladas: (mats.data ?? []).filter((m) => m.estado === "anulada").length,
    solicitudes: solIds.length, pagos: pagosM + pagosS, cuotas, calificaciones: Math.max(califE, califM), resultados, certificados, inesperadas: [],
  })
}

async function gruposConHistorial(supabase: Cliente, grupoIds: string[]) {
  if (grupoIds.length === 0) return { matriculas: null, solicitudes: null }
  const [m, s] = await Promise.all([
    supabase.from("matriculas").select("grupo_id").in("grupo_id", grupoIds).limit(1).maybeSingle(),
    supabase.from("solicitudes_inscripcion").select("grupo_id").in("grupo_id", grupoIds).limit(1).maybeSingle(),
  ])
  return { matriculas: (m.data?.grupo_id as string | undefined) ?? null, solicitudes: (s.data?.grupo_id as string | undefined) ?? null }
}

// ---------------------------------------------------------------------------
// Cursos

export async function diagnosticarEliminacionCurso(cursoId: unknown): Promise<DiagnosticoEliminacion> {
  const institucionId = await institucionDelAdmin("cursos")
  if (!institucionId) return { ok: false, mensaje: "No tienes permiso para gestionar los cursos." }
  const id = uuid.safeParse(cursoId)
  if (!id.success) return { ok: false, mensaje: "Curso no válido." }
  const supabase = await createClient()
  const { data: curso } = await supabase.from("cursos").select("id, nombre, estado, portada_url").eq("id", id.data).eq("institucion_id", institucionId).maybeSingle()
  if (!curso) return { ok: false, mensaje: "El curso no existe o no pertenece a tu institución." }
  const { data: grupos } = await supabase.from("grupos").select("id").eq("curso_id", id.data).eq("institucion_id", institucionId)
  const grupoIds = (grupos ?? []).map((g) => g.id as string)
  try {
    const rpc = await supabase.rpc("diagnostico_eliminar_curso", { p_curso: id.data })
    let diagnostico: Diagnostico
    let migracionPendiente = false
    if (rpc.error) {
      if (!FUNCION_INEXISTENTE.has(rpc.error.code ?? "")) {
        console.error("[eliminacion] diagnóstico curso", rpc.error.code, rpc.error.message)
        return { ok: false, mensaje: "No se pudo revisar el curso. Inténtalo de nuevo." }
      }
      migracionPendiente = true
      diagnostico = await diagnosticoApp(supabase, grupoIds, id.data, Boolean(curso.portada_url))
    } else diagnostico = normalizarDiagnostico(rpc.data)
    return {
      ok: true, diagnostico, nombre: curso.nombre as string, estado: curso.estado as string, migracionPendiente,
      grupoConHistorial: diagnostico.eliminable ? { matriculas: null, solicitudes: null } : await gruposConHistorial(supabase, grupoIds),
    }
  } catch (e) {
    console.error("[eliminacion] diagnóstico", e instanceof Error ? e.message : e)
    return { ok: false, mensaje: "No se pudo revisar el curso. Inténtalo de nuevo." }
  }
}

export async function eliminarCursoDefinitivo(cursoId: unknown, confirmacion: unknown): Promise<ResultadoEliminacion> {
  const institucionId = await institucionDelAdmin("cursos")
  if (!institucionId) return { ok: false, gravedad: "error", mensaje: "No tienes permiso para gestionar los cursos." }
  const id = uuid.safeParse(cursoId)
  if (!id.success) return { ok: false, gravedad: "error", mensaje: "Solicitud no válida." }
  if (!confirmacionDobleValida(confirmacion)) return { ok: false, gravedad: "advertencia", mensaje: "Confirma la eliminación en las dos ventanas." }
  const supabase = await createClient()
  const { data: curso } = await supabase.from("cursos").select("id, nombre, portada_url").eq("id", id.data).eq("institucion_id", institucionId).maybeSingle()
  if (!curso) return { ok: false, gravedad: "error", mensaje: "El curso no existe o no pertenece a tu institución." }

  // La función de la BD (eliminacion_segura_v5) recibe el nombre ACTUAL leído
  // aquí con la sesión del administrador: si el curso cambió entre la lectura y
  // el borrado, no coincide y no se borra nada. Permisos, institución e
  // historial los vuelve a comprobar la propia función, con bloqueo de fila.
  const { data, error } = await supabase.rpc("eliminar_curso", { p_curso: id.data, p_confirmacion: curso.nombre as string })
  if (error) {
    if (FUNCION_INEXISTENTE.has(error.code ?? "")) {
      // Sin la migración: solo el borrado anterior (curso sin grupos ni plan), que comprueba sus propias reglas.
      const r = await eliminarCurso(id.data)
      return r.ok ? { ok: true } : { ok: false, gravedad: r.gravedad, mensaje: `${r.mensaje} El borrado de cursos con grupos vacíos se habilita con la actualización «eliminacion_segura_v5».` }
    }
    return falloEliminacion(error, "curso")
  }
  const r = (data ?? {}) as { archivos?: unknown; grupos_ids?: unknown; portada_url?: string | null }
  const aviso = await limpiarArchivos(institucionId, r.archivos, r.grupos_ids, {
    url: (r.portada_url ?? curso.portada_url) as string | null, cursoId: id.data,
  })
  revalidatePath("/admin/cursos", "layout")
  revalidatePath("/admin/grupos", "layout")
  revalidatePath("/cursos")
  return { ok: true, aviso }
}

// ---------------------------------------------------------------------------
// Grupos

export async function diagnosticarEliminacionGrupo(grupoId: unknown): Promise<DiagnosticoEliminacion> {
  const institucionId = await institucionDelAdmin("docentes")
  if (!institucionId) return { ok: false, mensaje: "No tienes permiso para gestionar los grupos." }
  const id = uuid.safeParse(grupoId)
  if (!id.success) return { ok: false, mensaje: "Grupo no válido." }
  const supabase = await createClient()
  const { data: grupo } = await supabase.from("grupos").select("id, codigo, estado").eq("id", id.data).eq("institucion_id", institucionId).maybeSingle()
  if (!grupo) return { ok: false, mensaje: "El grupo no existe o no pertenece a tu institución." }
  try {
    const rpc = await supabase.rpc("diagnostico_eliminar_grupo", { p_grupo: id.data })
    let diagnostico: Diagnostico
    let migracionPendiente = false
    if (rpc.error) {
      if (!FUNCION_INEXISTENTE.has(rpc.error.code ?? "")) {
        console.error("[eliminacion] diagnóstico grupo", rpc.error.code, rpc.error.message)
        return { ok: false, mensaje: "No se pudo revisar el grupo. Inténtalo de nuevo." }
      }
      migracionPendiente = true
      diagnostico = await diagnosticoApp(supabase, [id.data], null, false)
    } else diagnostico = normalizarDiagnostico(rpc.data)
    return {
      ok: true, diagnostico, nombre: grupo.codigo as string, estado: grupo.estado as string, migracionPendiente,
      grupoConHistorial: { matriculas: diagnostico.matriculas ? id.data : null, solicitudes: diagnostico.solicitudes ? id.data : null },
    }
  } catch (e) {
    console.error("[eliminacion] diagnóstico grupo", e instanceof Error ? e.message : e)
    return { ok: false, mensaje: "No se pudo revisar el grupo. Inténtalo de nuevo." }
  }
}

export async function eliminarGrupoDefinitivo(grupoId: unknown, confirmacion: unknown): Promise<ResultadoEliminacion> {
  const institucionId = await institucionDelAdmin("docentes")
  if (!institucionId) return { ok: false, gravedad: "error", mensaje: "No tienes permiso para gestionar los grupos." }
  const id = uuid.safeParse(grupoId)
  if (!id.success) return { ok: false, gravedad: "error", mensaje: "Solicitud no válida." }
  if (!confirmacionDobleValida(confirmacion)) return { ok: false, gravedad: "advertencia", mensaje: "Confirma la eliminación en las dos ventanas." }
  const supabase = await createClient()
  const { data: grupo } = await supabase.from("grupos").select("id, codigo").eq("id", id.data).eq("institucion_id", institucionId).maybeSingle()
  if (!grupo) return { ok: false, gravedad: "error", mensaje: "El grupo no existe o no pertenece a tu institución." }

  const { data, error } = await supabase.rpc("eliminar_grupo", { p_grupo: id.data, p_confirmacion: grupo.codigo as string })
  if (error) {
    if (FUNCION_INEXISTENTE.has(error.code ?? "")) {
      const r = await eliminarGrupo(id.data)
      return r.ok ? { ok: true } : { ok: false, gravedad: r.gravedad, mensaje: `${r.mensaje} Eliminar grupos con evaluaciones sin notas se habilita con «eliminacion_segura_v5».` }
    }
    return falloEliminacion(error, "grupo")
  }
  const r = (data ?? {}) as { archivos?: unknown; grupos_ids?: unknown }
  const aviso = await limpiarArchivos(institucionId, r.archivos, r.grupos_ids, null)
  revalidatePath("/admin/grupos", "layout")
  revalidatePath("/admin/cursos", "layout")
  revalidatePath("/admin/calendario")
  revalidatePath("/cursos")
  return { ok: true, aviso }
}

// ---------------------------------------------------------------------------

function falloEliminacion(error: { code?: string; message: string }, objeto: "curso" | "grupo"): ResultadoEliminacion {
  console.error(`[eliminacion] ${objeto}`, error.code, error.message)
  const m = error.message ?? ""
  if (/historial/i.test(m)) {
    return { ok: false, gravedad: "advertencia", mensaje: objeto === "curso" ? "El curso ya tiene historial (alguien se inscribió mientras confirmabas). Archívalo en su lugar." : "El grupo ya tiene historial. Cancélalo o ciérralo en su lugar." }
  }
  if (/confirmación/i.test(m)) return { ok: false, gravedad: "advertencia", mensaje: `El ${objeto} cambió mientras confirmabas. No se borró nada: vuelve a intentarlo.` }
  if (error.code === "42501") return { ok: false, gravedad: "error", mensaje: "No tienes permiso para esta operación." }
  if (error.code === "23503") return { ok: false, gravedad: "advertencia", mensaje: "Hay registros relacionados no previstos: no se eliminó nada. Archiva el curso o revisa sus datos." }
  return { ok: false, gravedad: "error", mensaje: "No se pudo eliminar. No se borró nada; inténtalo de nuevo." }
}

/**
 * Limpia los archivos del bucket DESPUÉS de un borrado confirmado. Solo rutas de
 * la institución y de los grupos eliminados (materiales) y la portada del propio
 * curso. Un fallo se registra y se avisa, pero el borrado de datos ya es firme.
 */
async function limpiarArchivos(institucionId: string, archivos: unknown, gruposIds: unknown, portada: { url: string | null; cursoId: string } | null): Promise<string | undefined> {
  const materiales = archivosLimpiables(archivos, institucionId, gruposIds)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
  const rutaPortada = portada ? rutaPortadaDeCurso(portada.url, institucionId, portada.cursoId, supabaseUrl) : null
  if (materiales.length === 0 && !rutaPortada) return undefined
  // Tras borrar el grupo, las políticas del bucket de materiales ya no reconocen
  // la carpeta: se usa el cliente del servidor SOLO con rutas validadas arriba.
  const cliente = clienteAdministrativo() ?? (await createClient())
  let fallos = 0
  if (materiales.length) {
    const { error } = await cliente.storage.from(BUCKET_MATERIALES).remove(materiales)
    if (error) { fallos += materiales.length; console.error("[eliminacion] limpieza de materiales", error.message) }
  }
  if (rutaPortada) {
    const { error } = await cliente.storage.from(BUCKET_PORTADAS).remove([rutaPortada])
    if (error) { fallos++; console.error("[eliminacion] limpieza de portada", error.message) }
  }
  return fallos ? "Se eliminaron los datos, pero algunos archivos no se pudieron borrar del almacenamiento (quedan sin uso y no son visibles)." : undefined
}
