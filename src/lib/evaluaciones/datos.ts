import type { EstadoFinal, EstadoMatricula } from "@/lib/estudiantes/datos"
import { calcular, resultadoSegun, type Calculo } from "@/lib/evaluaciones/calculo"
import { obtenerGrupo, obtenerGrupos, type GrupoDetalle, type GrupoResumen } from "@/lib/grupos/datos"
import { leerTodo } from "@/lib/pagos/datos"
import { createClient } from "@/lib/supabase/server"

/**
 * Lectura de evaluaciones y calificaciones de la institución del administrador
 * (SOLO servidor). RLS de V5: "ver evaluaciones" y "ver calificaciones"
 * permiten al admin activo leer las de su institución; además se filtra por
 * institucion_id. El administrador SUPERVISA: no registra notas (eso será del
 * panel Docente).
 */

type Cliente = Awaited<ReturnType<typeof createClient>>

export type Evaluacion = { id: string; grupo_id: string; nombre: string; descripcion: string | null; peso: number; fecha: string | null }
type FilaNota = { evaluacion_id: string; matricula_id: string; nota: number; observacion: string | null; registrado_en: string }
type FilaMatricula = { id: string; grupo_id: string; estudiante_id: string; estado: EstadoMatricula; estado_final: EstadoFinal }

export type ResumenGrupo = {
  grupo: GrupoResumen
  evaluaciones: Evaluacion[]
  pesoTotal: number
  estudiantes: number
  notasRegistradas: number
  notasEsperadas: number
  resultados: Record<EstadoFinal, number>
}

const num = (v: unknown) => Number(v)
const normalizarEval = (e: Evaluacion): Evaluacion => ({ ...e, peso: num(e.peso) })

/** ¿Está aplicada la migración evaluaciones_admin_v5? (existe historial_resultados) */
async function migracionAplicada(supabase: Cliente) {
  const { error } = await supabase.from("historial_resultados").select("id", { head: true, count: "exact" }).limit(1)
  return !error || (error.code !== "PGRST205" && error.code !== "42P01")
}

export async function obtenerResumenEvaluaciones(institucionId: string): Promise<ResumenGrupo[]> {
  const supabase = await createClient()
  const grupos = await obtenerGrupos(institucionId)
  if (grupos.length === 0) return []
  try {
    const [evaluaciones, matriculas, notas] = await Promise.all([
      leerTodo<Evaluacion>((d, h) => supabase.from("evaluaciones").select("id, grupo_id, nombre, descripcion, peso, fecha").eq("institucion_id", institucionId).order("id").range(d, h)),
      leerTodo<FilaMatricula>((d, h) => supabase.from("matriculas").select("id, grupo_id, estudiante_id, estado, estado_final").eq("institucion_id", institucionId).order("id").range(d, h)),
      leerTodo<{ grupo_id: string; matricula_id: string }>((d, h) => supabase.from("calificaciones").select("grupo_id, matricula_id").eq("institucion_id", institucionId).order("id").range(d, h)),
    ])
    const activas = matriculas.filter((m) => m.estado === "activa")
    const activaIds = new Set(activas.map((m) => m.id))
    return grupos.map((g) => {
      const evs = evaluaciones.filter((e) => e.grupo_id === g.id).map(normalizarEval).sort((a, b) => (a.fecha ?? "9999").localeCompare(b.fecha ?? "9999") || a.nombre.localeCompare(b.nombre))
      const deGrupo = activas.filter((m) => m.grupo_id === g.id)
      const resultados: Record<EstadoFinal, number> = { en_curso: 0, aprobado: 0, desaprobado: 0 }
      for (const m of deGrupo) resultados[m.estado_final]++
      return {
        grupo: g,
        evaluaciones: evs,
        pesoTotal: Math.round(evs.reduce((s, e) => s + e.peso * 100, 0)) / 100,
        estudiantes: deGrupo.length,
        notasRegistradas: notas.filter((n) => n.grupo_id === g.id && activaIds.has(n.matricula_id)).length,
        notasEsperadas: evs.length * deGrupo.length,
        resultados,
      }
    })
  } catch (e) {
    console.error("[evaluaciones] resumen", (e as { code?: string })?.code, (e as Error)?.message)
    throw new Error("No se pudieron cargar las evaluaciones.")
  }
}

export type FilaEstudianteGrupo = {
  matriculaId: string
  estudianteId: string
  nombre: string | null
  estado: EstadoMatricula
  estadoFinal: EstadoFinal
  notas: Record<string, { nota: number; observacion: string | null; registrado_en: string }>
  calculo: Calculo
  resultadoPropuesto: "aprobado" | "desaprobado" | null
  tieneCertificado: boolean
  ultimoRegistro: { resultado: string; promedio: number | null; registrado_en: string; motivo: string | null } | null
}

export type EvaluacionesGrupo = {
  grupo: GrupoDetalle
  notaAprobatoria: number
  evaluaciones: Evaluacion[]
  estudiantes: FilaEstudianteGrupo[]
  /** La migración evaluaciones_admin_v5 está aplicada (gestión y cierre disponibles). */
  gestionDisponible: boolean
  /** El grupo admite cambios en sus evaluaciones (no cerrado ni cancelado). */
  grupoEditable: boolean
  /** El grupo admite registrar resultados finales (en curso o cerrado). */
  admiteResultados: boolean
}

export async function obtenerEvaluacionesGrupo(institucionId: string, grupoId: string): Promise<EvaluacionesGrupo | null> {
  const grupo = await obtenerGrupo(institucionId, grupoId)
  if (!grupo) return null
  const supabase = await createClient()

  const [curso, evals, mats, nombres, gestion] = await Promise.all([
    grupo.curso
      ? supabase.from("cursos").select("nota_aprobatoria").eq("institucion_id", institucionId).eq("id", grupo.curso.id).maybeSingle().overrideTypes<{ nota_aprobatoria: number }, { merge: false }>()
      : Promise.resolve({ data: null, error: null }),
    supabase.from("evaluaciones").select("id, grupo_id, nombre, descripcion, peso, fecha").eq("institucion_id", institucionId).eq("grupo_id", grupoId)
      .order("fecha", { ascending: true, nullsFirst: false }).order("nombre").overrideTypes<Evaluacion[], { merge: false }>(),
    supabase.from("matriculas").select("id, grupo_id, estudiante_id, estado, estado_final").eq("institucion_id", institucionId).eq("grupo_id", grupoId)
      .overrideTypes<FilaMatricula[], { merge: false }>(),
    supabase.rpc("estudiantes_de_mi_institucion"),
    migracionAplicada(supabase),
  ])
  if (evals.error || mats.error) {
    console.error("[evaluaciones] grupo", evals.error?.code ?? mats.error?.code, evals.error?.message ?? mats.error?.message)
    throw new Error("No se pudieron cargar las evaluaciones del grupo.")
  }
  const matriculas = mats.data ?? []
  const ids = matriculas.map((m) => m.id)
  const [notas, certificados, historial] = await Promise.all([
    leerTodo<FilaNota>((d, h) => supabase.from("calificaciones").select("evaluacion_id, matricula_id, nota, observacion, registrado_en").eq("institucion_id", institucionId).eq("grupo_id", grupoId).order("id").range(d, h)).catch(() => [] as FilaNota[]),
    ids.length ? supabase.from("certificados").select("matricula_id").eq("institucion_id", institucionId).in("matricula_id", ids) : Promise.resolve({ data: [], error: null }),
    gestion && ids.length
      ? supabase.from("historial_resultados").select("matricula_id, resultado, promedio, registrado_en, motivo").eq("institucion_id", institucionId).in("matricula_id", ids).order("registrado_en", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ])

  const evaluaciones = (evals.data ?? []).map(normalizarEval)
  const notaAprobatoria = num(curso.data?.nota_aprobatoria ?? 11)
  const porNombre = new Map(((nombres.data ?? []) as { estudiante_id: string; nombres: string; apellidos: string }[]).map((n) => [n.estudiante_id, `${n.nombres} ${n.apellidos}`.trim()]))
  const conCertificado = new Set(((certificados.data ?? []) as { matricula_id: string }[]).map((c) => c.matricula_id))
  const ultimo = new Map<string, FilaEstudianteGrupo["ultimoRegistro"]>()
  for (const h of (historial.data ?? []) as { matricula_id: string; resultado: string; promedio: number | null; registrado_en: string; motivo: string | null }[]) {
    if (!ultimo.has(h.matricula_id)) ultimo.set(h.matricula_id, { resultado: h.resultado, promedio: h.promedio === null ? null : num(h.promedio), registrado_en: h.registrado_en, motivo: h.motivo })
  }

  const estudiantes = matriculas
    .map((m): FilaEstudianteGrupo => {
      const propias = notas.filter((n) => n.matricula_id === m.id).map((n) => ({ ...n, nota: num(n.nota) }))
      const calculo = calcular(evaluaciones, propias)
      return {
        matriculaId: m.id,
        estudianteId: m.estudiante_id,
        nombre: porNombre.get(m.estudiante_id) ?? null,
        estado: m.estado,
        estadoFinal: m.estado_final,
        notas: Object.fromEntries(propias.map((n) => [n.evaluacion_id, { nota: n.nota, observacion: n.observacion, registrado_en: n.registrado_en }])),
        calculo,
        resultadoPropuesto: resultadoSegun(calculo.promedio, notaAprobatoria),
        tieneCertificado: conCertificado.has(m.id),
        ultimoRegistro: ultimo.get(m.id) ?? null,
      }
    })
    .sort((a, b) => Number(a.estado !== "activa") - Number(b.estado !== "activa") || (a.nombre ?? "").localeCompare(b.nombre ?? "", "es"))

  return {
    grupo,
    notaAprobatoria,
    evaluaciones,
    estudiantes,
    gestionDisponible: gestion,
    grupoEditable: grupo.estado !== "cerrado" && grupo.estado !== "cancelado",
    admiteResultados: grupo.estado === "en_curso" || grupo.estado === "cerrado",
  }
}

export type ResultadoAcademico = {
  grupoId: string
  notaAprobatoria: number
  evaluaciones: (Evaluacion & { nota: number | null })[]
  calculo: Calculo
}

/** Resumen académico de una matrícula (para su ficha). null si no se pudo leer. */
export async function obtenerResultadoAcademico(institucionId: string, matriculaId: string, grupoId: string, cursoId: string | null): Promise<ResultadoAcademico | null> {
  const supabase = await createClient()
  const [evals, notas, curso] = await Promise.all([
    supabase.from("evaluaciones").select("id, grupo_id, nombre, descripcion, peso, fecha").eq("institucion_id", institucionId).eq("grupo_id", grupoId).order("fecha", { nullsFirst: false }).overrideTypes<Evaluacion[], { merge: false }>(),
    supabase.from("calificaciones").select("evaluacion_id, nota").eq("institucion_id", institucionId).eq("matricula_id", matriculaId).overrideTypes<{ evaluacion_id: string; nota: number }[], { merge: false }>(),
    cursoId ? supabase.from("cursos").select("nota_aprobatoria").eq("institucion_id", institucionId).eq("id", cursoId).maybeSingle().overrideTypes<{ nota_aprobatoria: number }, { merge: false }>() : Promise.resolve({ data: null, error: null }),
  ])
  if (evals.error || notas.error) return null
  const lista = (evals.data ?? []).map(normalizarEval)
  const notasN = (notas.data ?? []).map((n) => ({ evaluacion_id: n.evaluacion_id, nota: num(n.nota) }))
  const porEval = new Map(notasN.map((n) => [n.evaluacion_id, n.nota]))
  return {
    grupoId,
    notaAprobatoria: num(curso.data?.nota_aprobatoria ?? 11),
    evaluaciones: lista.map((e) => ({ ...e, nota: porEval.get(e.id) ?? null })),
    calculo: calcular(lista, notasN),
  }
}
