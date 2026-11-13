"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { docenteActual, institucionDelAdmin, obtenerContexto } from "@/lib/auth/contexto"
import { instanteDesdeHoraLima } from "@/lib/fechas"
import { modoApertura, nombreArchivoSeguro, TIPOS_MATERIAL } from "@/lib/materiales/reglas"
import { createClient } from "@/lib/supabase/server"
import { BUCKET_ENTREGAS, ENTREGA_MAX_BYTES } from "@/lib/tareas/reglas"

/**
 * Tareas (revision_funcional_v5). TODA escritura pasa por funciones de la BD
 * (guardar_tarea, cambiar_estado_tarea, entregar_tarea, calificar_entrega), que
 * vuelven a comprobar rol, grupo, matrícula, plazos y envíos. Aquí se valida la
 * forma de los datos y se traduce cada error a un mensaje comprensible.
 */

export type ResultadoTarea = { ok: true; id?: string; url?: string; modo?: "vista" | "descarga" } | { ok: false; mensaje: string }

const uuid = z.uuid()
const FUNCION_INEXISTENTE = new Set(["PGRST202", "42883", "42P01", "PGRST205"])
const PENDIENTE: ResultadoTarea = { ok: false, mensaje: "Las tareas se habilitan con la actualización «revision_funcional_v5»." }

function fallo(error: { code?: string; message: string }, contexto: string): ResultadoTarea {
  if (FUNCION_INEXISTENTE.has(error.code ?? "")) return PENDIENTE
  if (error.code === "42501") return { ok: false, mensaje: "No tienes permiso para esta operación." }
  // Mensajes propios de las funciones de la BD (en español, sin datos sensibles).
  if (/plazo|envíos|calificada|matrícula|archivo|carpeta|disponible|evaluación|materiales|borrador|puntaje|corregir|cerrado|cancelado|respuesta/i.test(error.message)) {
    return { ok: false, mensaje: error.message.replace(/^ERROR:\s*/, "") }
  }
  console.error(`[tareas] ${contexto}`, error.code, error.message)
  return { ok: false, mensaje: "No se pudo completar la operación. Inténtalo de nuevo." }
}

/** Docente del grupo o administrador (módulo «docentes»). */
async function puedeGestionar(grupoId: string): Promise<boolean> {
  const supabase = await createClient()
  const docente = await docenteActual()
  if (docente) {
    const { data } = await supabase.from("grupos").select("id").eq("id", grupoId).eq("docente_id", docente.userId).eq("institucion_id", docente.institucionId).maybeSingle()
    return Boolean(data)
  }
  const institucionId = await institucionDelAdmin("docentes")
  if (!institucionId) return false
  const { data } = await supabase.from("grupos").select("id").eq("id", grupoId).eq("institucion_id", institucionId).maybeSingle()
  return Boolean(data)
}

const datosTarea = z
  .object({
    titulo: z.string().trim().min(3, "El título debe tener al menos 3 caracteres.").max(160),
    instrucciones: z.string().trim().max(5000).default(""),
    fechaLimite: z.string().trim(),
    permiteTardias: z.boolean().default(false),
    tardiasHasta: z.string().trim().default(""),
    maxEnvios: z.coerce.number().int().min(1).max(10).default(1),
    puntajeMax: z.coerce.number().positive().max(100).default(20),
    evaluacionId: z.union([uuid, z.literal("")]).default(""),
    materiales: z.array(uuid).max(10).default([]),
    enlace: z.string().trim().max(1000).refine((v) => v === "" || /^https:\/\/\S+$/.test(v), "El enlace debe empezar por https://").default(""),
  })
  .transform((d, ctx) => {
    const limite = instanteDesdeHoraLima(d.fechaLimite)
    if (!limite) ctx.addIssue({ code: "custom", path: ["fechaLimite"], message: "Indica la fecha y hora límite." })
    const hasta = d.permiteTardias && d.tardiasHasta ? instanteDesdeHoraLima(d.tardiasHasta) : null
    if (d.permiteTardias && d.tardiasHasta && (!hasta || (limite && hasta <= limite))) {
      ctx.addIssue({ code: "custom", path: ["tardiasHasta"], message: "La fecha máxima para entregas tardías debe ser posterior a la fecha límite." })
    }
    return { ...d, limite, hasta }
  })

export async function guardarTarea(grupoId: unknown, tareaId: unknown, datos: unknown): Promise<ResultadoTarea> {
  const g = uuid.safeParse(grupoId)
  const t = tareaId === null ? { success: true as const, data: null } : uuid.safeParse(tareaId)
  const v = datosTarea.safeParse(datos)
  if (!g.success || !t.success) return { ok: false, mensaje: "Solicitud no válida." }
  if (!v.success) return { ok: false, mensaje: v.error.issues[0]?.message ?? "Revisa los datos de la tarea." }
  if (!(await puedeGestionar(g.data))) return { ok: false, mensaje: "No tienes permiso para gestionar las tareas de este grupo." }
  const d = v.data
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("guardar_tarea", {
    p_tarea: t.data,
    p_grupo: g.data,
    p_datos: {
      titulo: d.titulo, instrucciones: d.instrucciones, fecha_limite: d.limite, permite_tardias: d.permiteTardias,
      tardias_hasta: d.hasta ?? "", max_envios: d.maxEnvios, puntaje_max: d.puntajeMax, evaluacion_id: d.evaluacionId,
      materiales: d.materiales, enlace: d.enlace,
    },
  })
  if (error) return fallo(error, "guardar")
  revalidar(g.data)
  return { ok: true, id: data as string }
}

export async function cambiarEstadoTarea(grupoId: unknown, tareaId: unknown, estado: unknown): Promise<ResultadoTarea> {
  const g = uuid.safeParse(grupoId)
  const t = uuid.safeParse(tareaId)
  if (!g.success || !t.success || !["borrador", "publicada", "cerrada"].includes(String(estado))) return { ok: false, mensaje: "Solicitud no válida." }
  if (!(await puedeGestionar(g.data))) return { ok: false, mensaje: "No tienes permiso para gestionar las tareas de este grupo." }
  const supabase = await createClient()
  const { error } = await supabase.rpc("cambiar_estado_tarea", { p_tarea: t.data, p_estado: String(estado) })
  if (error) return fallo(error, "estado")
  revalidar(g.data)
  return { ok: true }
}

const datosEntrega = z.object({
  texto: z.string().trim().max(5000).default(""),
  archivo: z.object({ ruta: z.string().max(500), nombre: z.string().max(300), tipo: z.string().max(120), bytes: z.number().int().min(1).max(ENTREGA_MAX_BYTES) }).nullable().default(null),
})

/** Estudiante: registra la entrega (el archivo ya lo subió el navegador a SU carpeta del bucket privado). */
export async function entregarTarea(tareaId: unknown, datos: unknown): Promise<ResultadoTarea> {
  const t = uuid.safeParse(tareaId)
  const v = datosEntrega.safeParse(datos)
  if (!t.success || !v.success) return { ok: false, mensaje: "Revisa tu entrega." }
  const ctx = await obtenerContexto()
  if (ctx.estado !== "con_perfil" || ctx.rolActivo !== "estudiante") return { ok: false, mensaje: "Tu sesión no tiene el rol Estudiante activo." }
  const { texto, archivo } = v.data
  if (!texto && !archivo) return { ok: false, mensaje: "Escribe tu respuesta o adjunta un archivo." }
  if (archivo && (!(archivo.tipo in TIPOS_MATERIAL) || archivo.ruta.includes(".."))) return { ok: false, mensaje: "El tipo de archivo no está permitido." }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("entregar_tarea", {
    p_tarea: t.data, p_texto: texto || null, p_archivo_path: archivo?.ruta ?? null,
    p_archivo_nombre: archivo ? nombreArchivoSeguro(archivo.nombre) : null, p_archivo_tipo: archivo?.tipo ?? null, p_archivo_bytes: archivo?.bytes ?? null,
  })
  if (error) return fallo(error, "entregar")
  revalidatePath("/estudiante/cursos", "layout")
  return { ok: true, id: data as string }
}

const datosCalificacion = z.object({
  puntaje: z.union([z.coerce.number().min(0).max(100), z.null()]).default(null),
  comentario: z.string().trim().max(2000).default(""),
  devolver: z.boolean().default(false),
})

/** Docente o administrador: califica o devuelve una entrega (la BD registra la nota de la evaluación vinculada). */
export async function calificarEntrega(grupoId: unknown, entregaId: unknown, datos: unknown): Promise<ResultadoTarea> {
  const g = uuid.safeParse(grupoId)
  const e = uuid.safeParse(entregaId)
  const v = datosCalificacion.safeParse(datos)
  if (!g.success || !e.success) return { ok: false, mensaje: "Solicitud no válida." }
  if (!v.success) return { ok: false, mensaje: "Revisa el puntaje y el comentario." }
  if (!v.data.devolver && v.data.puntaje === null) return { ok: false, mensaje: "Indica el puntaje." }
  if (v.data.devolver && v.data.comentario.length < 5) return { ok: false, mensaje: "Indica qué debe corregir el estudiante." }
  if (!(await puedeGestionar(g.data))) return { ok: false, mensaje: "No tienes permiso para revisar entregas de este grupo." }
  const supabase = await createClient()
  const { error } = await supabase.rpc("calificar_entrega", {
    p_entrega: e.data, p_puntaje: v.data.puntaje, p_comentario: v.data.comentario || null, p_devolver: v.data.devolver,
  })
  if (error) return fallo(error, "calificar")
  revalidar(g.data)
  revalidatePath(`/docente/calificaciones/${g.data}`)
  return { ok: true }
}

/** Archivo de una entrega con URL firmada de 5 minutos (RLS/Storage: el propio estudiante, su docente o el administrador). */
export async function abrirArchivoEntrega(entregaId: unknown): Promise<ResultadoTarea> {
  const e = uuid.safeParse(entregaId)
  if (!e.success) return { ok: false, mensaje: "Entrega no válida." }
  const supabase = await createClient()
  const { data } = await supabase.from("entregas_tarea").select("archivo_path, archivo_nombre, archivo_tipo").eq("id", e.data).maybeSingle()
  if (!data?.archivo_path) return { ok: false, mensaje: "Esta entrega no tiene archivo o ya no tienes acceso a ella." }
  const modo = modoApertura({ tipo: "archivo", archivo_tipo: (data.archivo_tipo as string | null) ?? null })
  const { data: firmada, error } = await supabase.storage.from(BUCKET_ENTREGAS)
    .createSignedUrl(String(data.archivo_path), 300, modo === "descarga" ? { download: String(data.archivo_nombre ?? "entrega") } : undefined)
  if (error || !firmada?.signedUrl) return { ok: false, mensaje: "No se pudo preparar el enlace seguro del archivo." }
  return { ok: true, url: firmada.signedUrl, modo: modo === "descarga" ? "descarga" : "vista" }
}

function revalidar(grupoId: string) {
  revalidatePath(`/docente/grupos/${grupoId}`)
  revalidatePath(`/admin/grupos/${grupoId}`)
  revalidatePath("/estudiante/cursos", "layout")
}
