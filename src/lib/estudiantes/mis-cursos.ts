import { createClient } from "@/lib/supabase/server"

/**
 * «Mis cursos» del estudiante (SOLO servidor, con su sesión). Una sola cuenta,
 * matrículas de cualquier institución.
 * - Con la migración mis_cursos_v5: RPC mis_cursos() (solo sus matrículas).
 * - Sin ella: sus matrículas (RLS: estudiante_id = auth.uid()) con los nombres
 *   de la oferta pública; un grupo que ya no está en la oferta (en curso o
 *   cerrado) aparece sin nombre y se avisa que el detalle está incompleto.
 */

export type Horario = { dia_semana: number; hora_inicio: string; hora_fin: string }

export type MiCurso = {
  matriculaId: string
  estado: "activa" | "anulada"
  estadoFinal: "en_curso" | "aprobado" | "desaprobado"
  fechaMatricula: string
  institucion: string | null
  curso: { id: string; nombre: string } | null
  grupoId: string
  grupo: { codigo: string; estado: string | null; fechaInicio: string; fechaFin: string } | null
  /** null = «Docente por asignar» (o no disponible sin la migración). */
  docente: string | null
  horarios: Horario[]
  /** cursos.modalidad (virtual | presencial | mixta); null si no se pudo leer. */
  modalidad: string | null
  /** Nota mínima para aprobar; null sin la migración aula_academica_v5. */
  notaAprobatoria: number | null
  portadaUrl: string | null
  descripcion: string | null
}

export type ResultadoMisCursos = { cursos: MiCurso[]; detalleCompleto: boolean }

type FilaRpc = {
  matricula_id: string; estado: MiCurso["estado"]; estado_final: MiCurso["estadoFinal"]; fecha_matricula: string
  institucion: string; curso_id: string; curso: string; grupo_id: string; grupo: string; grupo_estado: string
  fecha_inicio: string; fecha_fin: string; docente: string | null; horarios: Horario[] | null
}

const FUNCION_INEXISTENTE = new Set(["PGRST202", "42883"])

export async function obtenerMisCursos(estudianteId: string): Promise<ResultadoMisCursos> {
  const r = await leerMisCursos(estudianteId)
  return { ...r, cursos: await conDetalle(r.cursos) }
}

const SIN_DETALLE = { modalidad: null, notaAprobatoria: null, portadaUrl: null, descripcion: null }

/**
 * Modalidad, nota aprobatoria y portada de cada curso matriculado.
 * - Con aula_academica_v5: RPC mis_cursos_detalle() (solo sus matrículas).
 * - Sin ella: la oferta pública (si el curso sigue publicado); sin nota aprobatoria.
 * Nunca impide mostrar los cursos: ante un error se muestran sin detalle.
 */
async function conDetalle(cursos: MiCurso[]): Promise<MiCurso[]> {
  if (cursos.length === 0) return cursos
  const supabase = await createClient()
  const rpc = await supabase.rpc("mis_cursos_detalle")
  if (!rpc.error) {
    type Fila = { matricula_id: string; modalidad: string | null; nota_aprobatoria: number | null; portada_url: string | null; descripcion: string | null }
    const porMatricula = new Map(((rpc.data ?? []) as Fila[]).map((f) => [f.matricula_id, f]))
    return cursos.map((c) => {
      const f = porMatricula.get(c.matriculaId)
      return f
        ? { ...c, modalidad: f.modalidad, notaAprobatoria: f.nota_aprobatoria === null ? null : Number(f.nota_aprobatoria), portadaUrl: f.portada_url, descripcion: f.descripcion }
        : c
    })
  }
  if (!FUNCION_INEXISTENTE.has(rpc.error.code ?? "")) console.error("[estudiante] detalle de cursos", rpc.error.code, rpc.error.message)
  const ids = [...new Set(cursos.flatMap((c) => (c.curso ? [c.curso.id] : [])))]
  if (ids.length === 0) return cursos
  const { data, error } = await supabase.from("oferta_cursos").select("id, modalidad, portada_url, descripcion").in("id", ids)
    .overrideTypes<{ id: string; modalidad: string | null; portada_url: string | null; descripcion: string | null }[], { merge: false }>()
  if (error) {
    console.error("[estudiante] oferta de cursos", error.code, error.message)
    return cursos
  }
  const porCurso = new Map((data ?? []).map((f) => [f.id, f]))
  return cursos.map((c) => {
    const f = c.curso ? porCurso.get(c.curso.id) : undefined
    return f ? { ...c, modalidad: f.modalidad, portadaUrl: f.portada_url, descripcion: f.descripcion } : c
  })
}

async function leerMisCursos(estudianteId: string): Promise<ResultadoMisCursos> {
  const supabase = await createClient()
  const rpc = await supabase.rpc("mis_cursos")
  if (!rpc.error) {
    return {
      detalleCompleto: true,
      cursos: ((rpc.data ?? []) as FilaRpc[]).map((f) => ({
        matriculaId: f.matricula_id,
        estado: f.estado,
        estadoFinal: f.estado_final,
        fechaMatricula: f.fecha_matricula,
        institucion: f.institucion,
        curso: { id: f.curso_id, nombre: f.curso },
        grupoId: f.grupo_id,
        grupo: { codigo: f.grupo, estado: f.grupo_estado, fechaInicio: f.fecha_inicio, fechaFin: f.fecha_fin },
        docente: f.docente,
        horarios: f.horarios ?? [],
        ...SIN_DETALLE,
      })),
    }
  }
  if (!FUNCION_INEXISTENTE.has(rpc.error.code ?? "")) {
    console.error("[estudiante] mis cursos", rpc.error.code, rpc.error.message)
    throw new Error("No se pudieron cargar tus cursos.")
  }

  // Sin la migración: matrículas propias + nombres de la oferta pública.
  const { data: filas, error } = await supabase
    .from("matriculas")
    .select("id, grupo_id, estado, estado_final, fecha_matricula")
    .eq("estudiante_id", estudianteId)
    .order("fecha_matricula", { ascending: false })
    .overrideTypes<{ id: string; grupo_id: string; estado: MiCurso["estado"]; estado_final: MiCurso["estadoFinal"]; fecha_matricula: string }[], { merge: false }>()
  if (error) {
    console.error("[estudiante] matrículas", error.code, error.message)
    throw new Error("No se pudieron cargar tus cursos.")
  }
  if (!filas?.length) return { cursos: [], detalleCompleto: true }

  const grupoIds = [...new Set(filas.map((f) => f.grupo_id))]
  const [grupos, horarios] = await Promise.all([
    supabase.from("oferta_grupos").select("id, curso_id, codigo, estado, fecha_inicio, fecha_fin, docente").in("id", grupoIds)
      .overrideTypes<{ id: string; curso_id: string; codigo: string; estado: string; fecha_inicio: string; fecha_fin: string; docente: string | null }[], { merge: false }>(),
    supabase.from("oferta_horarios").select("grupo_id, dia_semana, hora_inicio, hora_fin").in("grupo_id", grupoIds).order("dia_semana").order("hora_inicio")
      .overrideTypes<{ grupo_id: string; dia_semana: number; hora_inicio: string; hora_fin: string }[], { merge: false }>(),
  ])
  const cursoIds = [...new Set((grupos.data ?? []).map((g) => g.curso_id))]
  const { data: cursos } = cursoIds.length
    ? await supabase.from("oferta_cursos").select("id, nombre, institucion").in("id", cursoIds)
        .overrideTypes<{ id: string; nombre: string; institucion: string }[], { merge: false }>()
    : { data: [] as { id: string; nombre: string; institucion: string }[] }

  const porGrupo = new Map((grupos.data ?? []).map((g) => [g.id, g]))
  const porCurso = new Map((cursos ?? []).map((c) => [c.id, c]))
  const lista: MiCurso[] = filas.map((f) => {
    const g = porGrupo.get(f.grupo_id)
    const c = g ? porCurso.get(g.curso_id) : undefined
    return {
      matriculaId: f.id,
      estado: f.estado,
      estadoFinal: f.estado_final,
      fechaMatricula: f.fecha_matricula,
      institucion: c?.institucion ?? null,
      curso: c ? { id: c.id, nombre: c.nombre } : null,
      grupoId: f.grupo_id,
      grupo: g ? { codigo: g.codigo, estado: g.estado, fechaInicio: g.fecha_inicio, fechaFin: g.fecha_fin } : null,
      docente: g?.docente?.trim() || null,
      horarios: (horarios.data ?? []).filter((h) => h.grupo_id === f.grupo_id).map((h) => ({ dia_semana: h.dia_semana, hora_inicio: h.hora_inicio.slice(0, 5), hora_fin: h.hora_fin.slice(0, 5) })),
      ...SIN_DETALLE,
    }
  })
  return { cursos: lista, detalleCompleto: lista.every((c) => c.curso !== null) }
}
