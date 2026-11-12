import type { EstadoFinal, EstadoMatricula } from "@/lib/estudiantes/datos"
import { calcular, resultadoSegun, type Calculo } from "@/lib/evaluaciones/calculo"
import { leerTodo } from "@/lib/pagos/datos"
import { createClient } from "@/lib/supabase/server"
import { horaCorta, type EstadoGrupo } from "@/lib/validations/grupo"

/**
 * Panel del docente (SOLO servidor, con la sesión del docente).
 * RLS de V5 decide lo que ve: «ver grupos» (su institución), «ver horarios»,
 * «ver evaluaciones», «ver matriculas» y «ver calificaciones» (solo de los
 * grupos donde es el docente) y «ver perfiles» (solo nombres de estudiantes de
 * sus grupos). Además se filtra explícitamente por docente_id e institución:
 * nunca se muestra un grupo ajeno aunque la RLS lo permitiera.
 * No se leen DNI ni teléfono de los estudiantes: no son necesarios aquí.
 */

type Cliente = Awaited<ReturnType<typeof createClient>>

export type HorarioDocente = { id: string; dia_semana: number; hora_inicio: string; hora_fin: string; enlace_clase: string | null; ubicacion?: string | null }
/** publicada_en: null = borrador (el estudiante no ve sus notas). undefined = publicación no habilitada (sin aula_academica_v5). */
export type EvaluacionDocente = { id: string; nombre: string; descripcion: string | null; peso: number; fecha: string | null; publicada_en?: string | null }

export type GrupoDocente = {
  id: string
  codigo: string
  estado: EstadoGrupo
  fecha_inicio: string
  fecha_fin: string
  curso: { id: string; nombre: string; notaAprobatoria: number; modalidad: string | null } | null
  horarios: HorarioDocente[]
  evaluaciones: EvaluacionDocente[]
  pesoTotal: number
  estudiantes: number
  notasRegistradas: number
  notasEsperadas: number
  resultadosCerrados: number
  /** true con aula_academica_v5: las notas se publican por evaluación. */
  publicacionActiva: boolean
}

type FilaGrupo = { id: string; curso_id: string; codigo: string; estado: EstadoGrupo; fecha_inicio: string; fecha_fin: string }
type FilaMatricula = { id: string; grupo_id: string; estudiante_id: string; estado: EstadoMatricula; estado_final: EstadoFinal }
type FilaNota = { evaluacion_id: string; matricula_id: string; nota: number; observacion: string | null }

const ORDEN_ESTADO: Record<EstadoGrupo, number> = { en_curso: 0, abierto: 1, programado: 2, cerrado: 3, cancelado: 4 }
const nombre = (p: { nombres: string; apellidos: string }) => `${p.nombres} ${p.apellidos}`.trim()
const sinGrupoHorario = (h: HorarioDocente & { grupo_id: string }): HorarioDocente => ({ id: h.id, dia_semana: h.dia_semana, hora_inicio: h.hora_inicio, hora_fin: h.hora_fin, enlace_clase: h.enlace_clase, ubicacion: h.ubicacion ?? null })
const sinGrupoEval = (e: EvaluacionDocente & { grupo_id: string }): EvaluacionDocente => ({ id: e.id, nombre: e.nombre, descripcion: e.descripcion, peso: e.peso, fecha: e.fecha, publicada_en: e.publicada_en })
const COLUMNA_INEXISTENTE = "42703"
const ordenEval = (a: EvaluacionDocente, b: EvaluacionDocente) => (a.fecha ?? "9999").localeCompare(b.fecha ?? "9999") || a.nombre.localeCompare(b.nombre, "es")

/** Grupos del docente con sus horarios (incluido el enlace: es su clase), evaluaciones y avance de notas. */
export async function obtenerGruposDocente(userId: string, institucionId: string): Promise<GrupoDocente[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("grupos")
    .select("id, curso_id, codigo, estado, fecha_inicio, fecha_fin")
    .eq("docente_id", userId)
    .eq("institucion_id", institucionId)
    .overrideTypes<FilaGrupo[], { merge: false }>()
  if (error) {
    console.error("[docente] grupos", error.code, error.message)
    throw new Error("No se pudieron cargar tus grupos.")
  }
  const grupos = data ?? []
  if (grupos.length === 0) return []
  const ids = grupos.map((g) => g.id)
  const { cursos, horarios, evaluaciones, matriculas, notas, publicacionActiva } = await leerDetalle(supabase, institucionId, ids, [...new Set(grupos.map((g) => g.curso_id))])

  return grupos
    .map((g): GrupoDocente => {
      const evs = evaluaciones.filter((e) => e.grupo_id === g.id).sort(ordenEval)
      const activas = matriculas.filter((m) => m.grupo_id === g.id && m.estado === "activa")
      const activaIds = new Set(activas.map((m) => m.id))
      const evIds = new Set(evs.map((e) => e.id))
      return {
        id: g.id,
        codigo: g.codigo,
        estado: g.estado,
        fecha_inicio: g.fecha_inicio,
        fecha_fin: g.fecha_fin,
        curso: cursos.get(g.curso_id) ?? null,
        horarios: horarios.filter((h) => h.grupo_id === g.id).map(sinGrupoHorario),
        evaluaciones: evs.map(sinGrupoEval),
        pesoTotal: Math.round(evs.reduce((s, e) => s + e.peso * 100, 0)) / 100,
        estudiantes: activas.length,
        notasRegistradas: notas.filter((n) => activaIds.has(n.matricula_id) && evIds.has(n.evaluacion_id)).length,
        notasEsperadas: activas.length * evs.length,
        resultadosCerrados: activas.filter((m) => m.estado_final !== "en_curso").length,
        publicacionActiva,
      }
    })
    .sort((a, b) => ORDEN_ESTADO[a.estado] - ORDEN_ESTADO[b.estado] || b.fecha_inicio.localeCompare(a.fecha_inicio))
}

/** Consulta con columnas nuevas; si la migración aún no las creó (42703), repite sin ellas. */
async function conRespaldo<T extends { error: { code?: string } | null }>(nueva: () => PromiseLike<T>, anterior: () => PromiseLike<T>): Promise<{ r: T; nueva: boolean }> {
  const r = await nueva()
  if (r.error?.code === COLUMNA_INEXISTENTE) return { r: await anterior(), nueva: false }
  return { r, nueva: true }
}

async function leerDetalle(supabase: Cliente, institucionId: string, grupoIds: string[], cursoIds: string[]) {
  const horariosDe = (cols: string) => () =>
    supabase.from("horarios").select(cols).eq("institucion_id", institucionId).in("grupo_id", grupoIds)
      .order("dia_semana").order("hora_inicio")
      .overrideTypes<(HorarioDocente & { grupo_id: string })[], { merge: false }>()
  const evaluacionesDe = (cols: string) => () =>
    supabase.from("evaluaciones").select(cols).eq("institucion_id", institucionId).in("grupo_id", grupoIds)
      .overrideTypes<(EvaluacionDocente & { grupo_id: string })[], { merge: false }>()
  const [cursos, { r: horarios }, { r: evaluaciones, nueva: publicacionActiva }, matriculas, notas] = await Promise.all([
    supabase.from("cursos").select("id, nombre, nota_aprobatoria, modalidad").eq("institucion_id", institucionId).in("id", cursoIds)
      .overrideTypes<{ id: string; nombre: string; nota_aprobatoria: number; modalidad: string | null }[], { merge: false }>(),
    conRespaldo(horariosDe("id, grupo_id, dia_semana, hora_inicio, hora_fin, enlace_clase, ubicacion"), horariosDe("id, grupo_id, dia_semana, hora_inicio, hora_fin, enlace_clase")),
    conRespaldo(evaluacionesDe("id, grupo_id, nombre, descripcion, peso, fecha, publicada_en"), evaluacionesDe("id, grupo_id, nombre, descripcion, peso, fecha")),
    leerTodo<FilaMatricula>((d, h) => supabase.from("matriculas").select("id, grupo_id, estudiante_id, estado, estado_final").eq("institucion_id", institucionId).in("grupo_id", grupoIds).order("id").range(d, h)),
    leerTodo<FilaNota & { grupo_id: string }>((d, h) => supabase.from("calificaciones").select("grupo_id, evaluacion_id, matricula_id, nota, observacion").eq("institucion_id", institucionId).in("grupo_id", grupoIds).order("id").range(d, h)),
  ])
  for (const [etiqueta, r] of [["cursos", cursos], ["horarios", horarios], ["evaluaciones", evaluaciones]] as const) {
    if (r.error) {
      console.error(`[docente] ${etiqueta}`, r.error.code, r.error.message)
      throw new Error("No se pudo cargar la información de tus grupos.")
    }
  }
  return {
    cursos: new Map((cursos.data ?? []).map((c) => [c.id, { id: c.id, nombre: c.nombre, notaAprobatoria: Number(c.nota_aprobatoria), modalidad: c.modalidad ?? null }])),
    horarios: (horarios.data ?? []).map((h) => ({ ...h, hora_inicio: horaCorta(h.hora_inicio), hora_fin: horaCorta(h.hora_fin) })),
    evaluaciones: (evaluaciones.data ?? []).map((e) => ({ ...e, peso: Number(e.peso), publicada_en: publicacionActiva ? (e.publicada_en ?? null) : undefined })),
    publicacionActiva,
    matriculas,
    notas: notas.map((n) => ({ ...n, nota: Number(n.nota) })),
  }
}

/** Nombres de estudiantes de los grupos del docente (RLS: solo los suyos; sin DNI ni teléfono). */
async function nombresEstudiantes(supabase: Cliente, ids: string[]) {
  const unicos = [...new Set(ids)]
  const mapa = new Map<string, string>()
  for (let i = 0; i < unicos.length; i += 100) {
    const { data, error } = await supabase.from("perfiles").select("id, nombres, apellidos").in("id", unicos.slice(i, i + 100))
      .overrideTypes<{ id: string; nombres: string; apellidos: string }[], { merge: false }>()
    if (error) console.error("[docente] nombres", error.code, error.message)
    for (const p of data ?? []) mapa.set(p.id, nombre(p))
  }
  return mapa
}

// ---------------------------------------------------------------------------
// Registro de notas de un grupo

export type FilaRegistro = {
  matriculaId: string
  estudianteId: string
  nombre: string
  estadoFinal: EstadoFinal
  notas: Record<string, { nota: number; observacion: string | null }>
  calculo: Calculo
  resultadoPropuesto: "aprobado" | "desaprobado" | null
}

export type RegistroGrupo = {
  grupo: GrupoDocente
  filas: FilaRegistro[]
  /** El docente puede registrar o cambiar notas (grupo no cancelado y con evaluaciones). */
  editable: boolean
  motivoNoEditable: string | null
}

export async function obtenerRegistroGrupo(userId: string, institucionId: string, grupoId: string): Promise<RegistroGrupo | null> {
  const supabase = await createClient()
  const { data: g, error } = await supabase
    .from("grupos")
    .select("id, curso_id, codigo, estado, fecha_inicio, fecha_fin")
    .eq("id", grupoId)
    .eq("docente_id", userId)
    .eq("institucion_id", institucionId)
    .maybeSingle()
    .overrideTypes<FilaGrupo, { merge: false }>()
  if (error) {
    console.error("[docente] registro grupo", error.code, error.message)
    throw new Error("No se pudo cargar el grupo.")
  }
  if (!g) return null

  const { cursos, horarios, evaluaciones, matriculas, notas, publicacionActiva } = await leerDetalle(supabase, institucionId, [g.id], [g.curso_id])
  const evs = evaluaciones.sort(ordenEval)
  const activas = matriculas.filter((m) => m.estado === "activa")
  const nombres = await nombresEstudiantes(supabase, activas.map((m) => m.estudiante_id))
  const curso = cursos.get(g.curso_id) ?? null
  const notaAprobatoria = curso?.notaAprobatoria ?? 11

  const filas = activas
    .map((m): FilaRegistro => {
      const propias = notas.filter((n) => n.matricula_id === m.id)
      const calculo = calcular(evs, propias)
      return {
        matriculaId: m.id,
        estudianteId: m.estudiante_id,
        nombre: nombres.get(m.estudiante_id) ?? "Estudiante",
        estadoFinal: m.estado_final,
        notas: Object.fromEntries(propias.map((n) => [n.evaluacion_id, { nota: n.nota, observacion: n.observacion }])),
        calculo,
        resultadoPropuesto: resultadoSegun(calculo.promedio, notaAprobatoria),
      }
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))

  const evIds = new Set(evs.map((e) => e.id))
  const activaIds = new Set(activas.map((m) => m.id))
  const grupo: GrupoDocente = {
    id: g.id,
    codigo: g.codigo,
    estado: g.estado,
    fecha_inicio: g.fecha_inicio,
    fecha_fin: g.fecha_fin,
    curso,
    horarios: horarios.map(sinGrupoHorario),
    evaluaciones: evs.map(sinGrupoEval),
    pesoTotal: Math.round(evs.reduce((s, e) => s + e.peso * 100, 0)) / 100,
    estudiantes: activas.length,
    notasRegistradas: notas.filter((n) => activaIds.has(n.matricula_id) && evIds.has(n.evaluacion_id)).length,
    notasEsperadas: activas.length * evs.length,
    resultadosCerrados: activas.filter((m) => m.estado_final !== "en_curso").length,
    publicacionActiva,
  }
  const motivoNoEditable =
    g.estado === "cancelado" ? "El grupo fue cancelado: no admite notas."
      : evs.length === 0 ? "La institución aún no configuró las evaluaciones de este grupo."
        : null
  return { grupo, filas, editable: motivoNoEditable === null, motivoNoEditable }
}

// ---------------------------------------------------------------------------
// Mis estudiantes

export type EstudianteDocente = {
  estudianteId: string
  nombre: string
  cursos: { grupoId: string; grupo: string; cursoId: string; curso: string; estadoGrupo: EstadoGrupo; estadoFinal: EstadoFinal; calculo: Calculo }[]
}

export async function obtenerEstudiantesDocente(userId: string, institucionId: string): Promise<EstudianteDocente[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("grupos")
    .select("id, curso_id, codigo, estado, fecha_inicio, fecha_fin")
    .eq("docente_id", userId)
    .eq("institucion_id", institucionId)
    .neq("estado", "cancelado")
    .overrideTypes<FilaGrupo[], { merge: false }>()
  if (error) {
    console.error("[docente] estudiantes", error.code, error.message)
    throw new Error("No se pudieron cargar tus estudiantes.")
  }
  const grupos = data ?? []
  if (grupos.length === 0) return []
  const { cursos, evaluaciones, matriculas, notas } = await leerDetalle(supabase, institucionId, grupos.map((g) => g.id), [...new Set(grupos.map((g) => g.curso_id))])
  const activas = matriculas.filter((m) => m.estado === "activa")
  const nombres = await nombresEstudiantes(supabase, activas.map((m) => m.estudiante_id))
  const porGrupo = new Map(grupos.map((g) => [g.id, g]))

  const porEstudiante = new Map<string, EstudianteDocente>()
  for (const m of activas) {
    const g = porGrupo.get(m.grupo_id)
    if (!g) continue
    const e = porEstudiante.get(m.estudiante_id) ?? { estudianteId: m.estudiante_id, nombre: nombres.get(m.estudiante_id) ?? "Estudiante", cursos: [] }
    const evs = evaluaciones.filter((x) => x.grupo_id === g.id)
    e.cursos.push({
      grupoId: g.id,
      grupo: g.codigo,
      cursoId: g.curso_id,
      curso: cursos.get(g.curso_id)?.nombre ?? "Curso",
      estadoGrupo: g.estado,
      estadoFinal: m.estado_final,
      calculo: calcular(evs, notas.filter((n) => n.matricula_id === m.id)),
    })
    porEstudiante.set(m.estudiante_id, e)
  }
  return [...porEstudiante.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
}
