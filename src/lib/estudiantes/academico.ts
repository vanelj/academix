import type { GrupoCalendario, Franja } from "@/lib/horarios/calendario"
import type { MiCurso } from "@/lib/estudiantes/mis-cursos"
import { resumenNotasAlumno, type EvaluacionAlumno, type ResumenNotas } from "@/lib/estudiantes/notas"
import { createClient } from "@/lib/supabase/server"

/**
 * Datos académicos del estudiante (SOLO servidor, con su sesión; una cuenta,
 * varias instituciones). RLS de V5 para el rol estudiante:
 *  - horarios y evaluaciones: solo de grupos con matrícula ACTIVA propia;
 *  - calificaciones: solo de sus propias matrículas (y, con aula_academica_v5,
 *    solo de evaluaciones PUBLICADAS).
 * Solo lectura: el estudiante nunca escribe notas (no hay política que lo permita).
 */

const COLUMNA_INEXISTENTE = "42703"

type FilaHorario = { grupo_id: string; dia_semana: number; hora_inicio: string; hora_fin: string; enlace_clase: string | null; ubicacion?: string | null }

/**
 * Franjas reales de los grupos (con enlace y, si existe la columna, ubicación).
 * Si la lectura falla, devuelve null y se usan los horarios de «Mis cursos» sin enlaces.
 */
export async function franjasDeGrupos(grupoIds: string[]): Promise<Map<string, Franja[]> | null> {
  const mapa = new Map<string, Franja[]>()
  if (grupoIds.length === 0) return mapa
  const supabase = await createClient()
  const consulta = (columnas: string) =>
    supabase.from("horarios").select(columnas).in("grupo_id", grupoIds).order("dia_semana").order("hora_inicio")
      .overrideTypes<FilaHorario[], { merge: false }>()
  let r = await consulta("grupo_id, dia_semana, hora_inicio, hora_fin, enlace_clase, ubicacion")
  if (r.error?.code === COLUMNA_INEXISTENTE) r = await consulta("grupo_id, dia_semana, hora_inicio, hora_fin, enlace_clase")
  if (r.error) {
    console.error("[estudiante] horarios", r.error.code, r.error.message)
    return null
  }
  for (const h of r.data ?? []) {
    const lista = mapa.get(h.grupo_id) ?? []
    lista.push({ dia_semana: h.dia_semana, hora_inicio: h.hora_inicio.slice(0, 5), hora_fin: h.hora_fin.slice(0, 5), enlace: h.enlace_clase, ubicacion: h.ubicacion ?? null })
    mapa.set(h.grupo_id, lista)
  }
  return mapa
}

/** Matrículas activas del estudiante como grupos del calendario (enlaces solo si RLS los entrega). */
export function gruposCalendarioEstudiante(cursos: MiCurso[], franjas: Map<string, Franja[]> | null): GrupoCalendario[] {
  return cursos
    .filter((c) => c.estado === "activa" && c.grupo)
    .map((c) => ({
      clave: c.matriculaId,
      curso: c.curso?.nombre ?? "Curso",
      grupo: c.grupo!.codigo,
      institucion: c.institucion,
      docente: c.docente,
      modalidad: c.modalidad,
      estado: c.grupo!.estado,
      desde: c.grupo!.fechaInicio.slice(0, 10),
      hasta: c.grupo!.fechaFin.slice(0, 10),
      franjas: franjas?.get(c.grupoId) ?? c.horarios.map((h) => ({ dia_semana: Number(h.dia_semana), hora_inicio: h.hora_inicio, hora_fin: h.hora_fin })),
      accesos: [{ etiqueta: "Entrar al curso", href: `/estudiante/cursos/${c.matriculaId}` }],
    }))
}

export type NotaCurso = {
  matriculaId: string
  curso: string
  institucion: string | null
  grupo: string | null
  estadoFinal: MiCurso["estadoFinal"]
  notaAprobatoria: number | null
  /** true con aula_academica_v5: solo se ven evaluaciones publicadas. */
  publicacionActiva: boolean
  resumen: ResumenNotas
}

/** Evaluaciones y notas VISIBLES de las matrículas activas indicadas. */
export async function obtenerMisNotas(cursos: MiCurso[]): Promise<NotaCurso[]> {
  const activas = cursos.filter((c) => c.estado === "activa")
  if (activas.length === 0) return []
  const supabase = await createClient()
  const grupos = [...new Set(activas.map((c) => c.grupoId))]
  type FilaEval = { id: string; grupo_id: string; nombre: string; peso: number; fecha: string | null; publicada_en?: string | null }
  const leerEvals = (columnas: string) =>
    supabase.from("evaluaciones").select(columnas).in("grupo_id", grupos).overrideTypes<FilaEval[], { merge: false }>()
  let evals = await leerEvals("id, grupo_id, nombre, peso, fecha, publicada_en")
  let publicacionActiva = true
  if (evals.error?.code === COLUMNA_INEXISTENTE) {
    publicacionActiva = false
    evals = await leerEvals("id, grupo_id, nombre, peso, fecha")
  }
  const notas = await supabase.from("calificaciones").select("evaluacion_id, matricula_id, nota").in("matricula_id", activas.map((c) => c.matriculaId))
    .overrideTypes<{ evaluacion_id: string; matricula_id: string; nota: number }[], { merge: false }>()
  if (evals.error || notas.error) {
    const e = evals.error ?? notas.error!
    console.error("[estudiante] notas", e.code, e.message)
    throw new Error("No se pudieron cargar tus notas.")
  }
  return activas.map((c) => {
    const evs: EvaluacionAlumno[] = (evals.data ?? [])
      .filter((e) => e.grupo_id === c.grupoId)
      .map((e) => ({ id: e.id, nombre: e.nombre, peso: Number(e.peso), fecha: e.fecha, publicada_en: e.publicada_en ?? null }))
    const propias = (notas.data ?? []).filter((n) => n.matricula_id === c.matriculaId)// RLS solo devuelve al estudiante las notas que puede ver (evaluación publicada
      // o nota publicada al guardarla): todas las filas recibidas son visibles.
      .map((n) => ({ evaluacion_id: n.evaluacion_id, nota: Number(n.nota), visible: true }))
    return {
      matriculaId: c.matriculaId,
      curso: c.curso?.nombre ?? "Curso",
      institucion: c.institucion,
      grupo: c.grupo?.codigo ?? null,
      estadoFinal: c.estadoFinal,
      notaAprobatoria: c.notaAprobatoria,
      publicacionActiva,
      resumen: resumenNotasAlumno(evs, propias, { publicacionActiva, notaAprobatoria: c.notaAprobatoria }),
    }
  })
}
