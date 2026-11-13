/**
 * Tareas académicas: reglas puras (sin Next.js ni Supabase). La BD
 * (revision_funcional_v5: entregar_tarea, calificar_entrega) aplica las mismas
 * reglas; aquí se usan para mostrar estados y validar antes de enviar.
 *
 * Materiales ≠ tareas: un material es un recurso de estudio; una tarea pide
 * una ENTREGA del estudiante, tiene plazo y puede calificarse.
 *
 * Reglas explícitas:
 *  - Hasta la fecha límite: entrega a tiempo.
 *  - Después: solo si la tarea admite entregas tardías y no pasó su fecha
 *    máxima (si la tiene): la entrega queda marcada como TARDÍA.
 *  - Reenvíos: mientras la entrega no esté calificada y no se agoten los
 *    envíos permitidos (max_envios). Si el docente la DEVUELVE para corregir,
 *    se admite un reenvío adicional.
 *  - Tarea calificable = vinculada a UNA evaluación del grupo. El puntaje de la
 *    tarea se convierte a la escala 0–20 y se registra como la nota de esa
 *    evaluación (no hay un segundo sistema de promedios).
 */

export const BUCKET_ENTREGAS = "entregas-tareas"
export const ENTREGA_MAX_BYTES = 20 * 1024 * 1024
export { ACEPTA_MATERIAL as ACEPTA_ENTREGA } from "@/lib/materiales/reglas"

export type EstadoTarea = "borrador" | "publicada" | "cerrada"

export type Tarea = {
  id: string
  grupo_id: string
  institucion_id: string
  titulo: string
  instrucciones: string | null
  fecha_limite: string
  permite_tardias: boolean
  tardias_hasta: string | null
  max_envios: number
  puntaje_max: number
  evaluacion_id: string | null
  materiales: string[]
  enlace: string | null
  estado: EstadoTarea
  publicada_en: string | null
}

export type Entrega = {
  id: string
  tarea_id: string
  matricula_id: string
  estudiante_id: string
  texto: string | null
  archivo_path: string | null
  archivo_nombre: string | null
  archivo_tipo: string | null
  archivo_bytes: number | null
  envios: number
  entregada_en: string
  tardia: boolean
  estado: "entregada" | "calificada" | "devuelta"
  puntaje: number | null
  comentario: string | null
  calificada_en: string | null
}

export type EstadoAlumno = "pendiente" | "entregada" | "tardia" | "vencida" | "calificada" | "devuelta" | "cerrada"

export const ETIQUETA_ESTADO_ALUMNO: Record<EstadoAlumno, string> = {
  pendiente: "Pendiente",
  entregada: "Entregada",
  tardia: "Entregada con retraso",
  vencida: "Vencida",
  calificada: "Calificada",
  devuelta: "Devuelta para corregir",
  cerrada: "Cerrada",
}

const ms = (iso: string) => new Date(iso).getTime()

/** ¿Se puede entregar AHORA? (y si contaría como tardía). */
export function plazoEntrega(t: Pick<Tarea, "fecha_limite" | "permite_tardias" | "tardias_hasta" | "estado">, ahora: Date = new Date()): { abierto: boolean; tardia: boolean } {
  if (t.estado !== "publicada") return { abierto: false, tardia: false }
  const n = ahora.getTime()
  if (n <= ms(t.fecha_limite)) return { abierto: true, tardia: false }
  if (t.permite_tardias && (!t.tardias_hasta || n <= ms(t.tardias_hasta))) return { abierto: true, tardia: true }
  return { abierto: false, tardia: true }
}

/** Estado de la tarea para el estudiante. */
export function estadoAlumno(t: Tarea, e: Entrega | null, ahora: Date = new Date()): EstadoAlumno {
  if (e?.estado === "calificada") return "calificada"
  if (e?.estado === "devuelta") return "devuelta"
  if (e) return e.tardia ? "tardia" : "entregada"
  if (t.estado === "cerrada") return "cerrada"
  return plazoEntrega(t, ahora).abierto ? "pendiente" : "vencida"
}

/** ¿El estudiante puede enviar (o reenviar) ahora? Con el motivo si no. */
export function puedeEntregar(t: Tarea, e: Entrega | null, ahora: Date = new Date()): { ok: true; tardia: boolean } | { ok: false; motivo: string } {
  const p = plazoEntrega(t, ahora)
  if (t.estado !== "publicada") return { ok: false, motivo: "La tarea ya no recibe entregas." }
  if (!p.abierto) return { ok: false, motivo: "El plazo de entrega venció." }
  if (e?.estado === "calificada") return { ok: false, motivo: "Tu entrega ya fue calificada." }
  if (e && e.estado !== "devuelta" && e.envios >= t.max_envios) return { ok: false, motivo: "Ya usaste todos los envíos permitidos." }
  return { ok: true, tardia: p.tardia }
}

/** Puntaje de la tarea → nota 0–20 de su evaluación (2 decimales). */
export function notaDesdePuntaje(puntaje: number, puntajeMax: number): number {
  if (!(puntajeMax > 0) || !Number.isFinite(puntaje)) return 0
  const n = Math.min(Math.max(puntaje, 0), puntajeMax) / puntajeMax * 20
  return Math.round(n * 100) / 100
}

/** Ruta del archivo de una entrega en el bucket privado. */
export function rutaEntrega(institucionId: string, grupoId: string, tareaId: string, estudianteId: string, archivoId: string, ext: string): string {
  return `${institucionId}/${grupoId}/${tareaId}/${estudianteId}/${archivoId}.${ext}`
}
