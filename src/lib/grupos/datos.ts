import { createClient } from "@/lib/supabase/server"
import { horaCorta, type EstadoGrupo } from "@/lib/validations/grupo"

/**
 * Lectura de grupos y horarios de la institución del administrador (SOLO servidor).
 * El id de la institución sale del perfil autenticado; RLS ("ver grupos",
 * "ver horarios", "ver cursos", "ver perfiles") limita todo a la institución y
 * además se filtra explícitamente por institucion_id.
 * Las vacantes libres salen de la vista grupos_con_vacantes (security_invoker),
 * que usa el mismo cálculo que V5: matrículas activas + reservas vigentes.
 */

export type Horario = {
  id: string
  dia_semana: number
  hora_inicio: string
  hora_fin: string
  enlace_clase: string | null
}

export type GrupoResumen = {
  id: string
  codigo: string
  vacantes: number
  /** null = no se pudo calcular. */
  vacantesDisponibles: number | null
  fecha_inicio: string
  fecha_fin: string
  estado: EstadoGrupo
  created_at: string
  curso: { id: string; nombre: string; estado: string } | null
  docente: { id: string; nombre: string } | null
  horarios: Omit<Horario, "enlace_clase">[]
}

export type GrupoDetalle = GrupoResumen & {
  horarios: Horario[]
  /** Registros que impiden eliminar el grupo. null = no se pudo contar. */
  dependencias: { matriculas: number; solicitudes: number; evaluaciones: number } | null
  cursoConCondiciones: boolean
  /** El docente asignado tiene perfil activo y el rol docente habilitado. */
  docenteHabilitado: boolean
}

export type OpcionCurso = { id: string; nombre: string; estado: string }
export type OpcionDocente = { id: string; nombre: string; habilitado: boolean }

type FilaGrupo = {
  id: string
  curso_id: string
  docente_id: string | null
  codigo: string
  vacantes: number
  vacantes_disponibles: number | null
  fecha_inicio: string
  fecha_fin: string
  estado: EstadoGrupo
  created_at: string
}

const COLUMNAS = "id, curso_id, docente_id, codigo, vacantes, vacantes_disponibles, fecha_inicio, fecha_fin, estado, created_at"

const nombre = (p: { nombres: string; apellidos: string }) => `${p.nombres} ${p.apellidos}`.trim()

export async function obtenerGrupos(institucionId: string): Promise<GrupoResumen[]> {
  const supabase = await createClient()
  const { data: filas, error } = await supabase
    .from("grupos_con_vacantes")
    .select(COLUMNAS)
    .eq("institucion_id", institucionId)
    .order("fecha_inicio", { ascending: false })
    .overrideTypes<FilaGrupo[], { merge: false }>()
  if (error) {
    console.error("[grupos] lectura", error.code, error.message)
    throw new Error("No se pudieron cargar los grupos.")
  }
  const grupos = filas ?? []
  if (grupos.length === 0) return []

  const cursoIds = [...new Set(grupos.map((g) => g.curso_id))]
  const docenteIds = [...new Set(grupos.map((g) => g.docente_id).filter((d): d is string => !!d))]
  const [cursos, docentes, horarios] = await Promise.all([
    supabase.from("cursos").select("id, nombre, estado").eq("institucion_id", institucionId).in("id", cursoIds)
      .overrideTypes<OpcionCurso[], { merge: false }>(),
    docenteIds.length
      ? supabase.from("perfiles").select("id, nombres, apellidos").eq("institucion_id", institucionId).in("id", docenteIds)
          .overrideTypes<{ id: string; nombres: string; apellidos: string }[], { merge: false }>()
      : Promise.resolve({ data: [], error: null }),
    supabase.from("horarios").select("grupo_id, id, dia_semana, hora_inicio, hora_fin").eq("institucion_id", institucionId)
      .in("grupo_id", grupos.map((g) => g.id))
      .order("dia_semana").order("hora_inicio")
      .overrideTypes<(Omit<Horario, "enlace_clase"> & { grupo_id: string })[], { merge: false }>(),
  ])
  for (const [etiqueta, r] of [["cursos", cursos], ["docentes", docentes], ["horarios", horarios]] as const) {
    if (r.error) console.error(`[grupos] ${etiqueta}`, r.error.code, r.error.message)
  }

  const porCurso = new Map((cursos.data ?? []).map((c) => [c.id, c]))
  const porDocente = new Map((docentes.data ?? []).map((d) => [d.id, { id: d.id, nombre: nombre(d) }]))

  return grupos.map((g) => ({
    id: g.id,
    codigo: g.codigo,
    vacantes: g.vacantes,
    vacantesDisponibles: g.vacantes_disponibles,
    fecha_inicio: g.fecha_inicio,
    fecha_fin: g.fecha_fin,
    estado: g.estado,
    created_at: g.created_at,
    curso: porCurso.get(g.curso_id) ?? null,
    docente: g.docente_id ? (porDocente.get(g.docente_id) ?? { id: g.docente_id, nombre: "Docente" }) : null,
    horarios: (horarios.data ?? [])
      .filter((h) => h.grupo_id === g.id)
      .map((h) => ({ id: h.id, dia_semana: h.dia_semana, hora_inicio: horaCorta(h.hora_inicio), hora_fin: horaCorta(h.hora_fin) })),
  }))
}

export async function obtenerGrupo(institucionId: string, grupoId: string): Promise<GrupoDetalle | null> {
  const supabase = await createClient()
  const { data: g, error } = await supabase
    .from("grupos_con_vacantes")
    .select(COLUMNAS)
    .eq("institucion_id", institucionId)
    .eq("id", grupoId)
    .maybeSingle()
    .overrideTypes<FilaGrupo, { merge: false }>()
  if (error) {
    console.error("[grupos] detalle", error.code, error.message)
    throw new Error("No se pudo cargar el grupo.")
  }
  if (!g) return null

  const cuenta = (tabla: string) =>
    supabase.from(tabla).select("id", { count: "exact", head: true }).eq("institucion_id", institucionId).eq("grupo_id", grupoId)

  const [curso, condiciones, docente, horarios, matriculas, solicitudes, evaluaciones, rolDocente] = await Promise.all([
    supabase.from("cursos").select("id, nombre, estado").eq("institucion_id", institucionId).eq("id", g.curso_id).maybeSingle()
      .overrideTypes<OpcionCurso, { merge: false }>(),
    supabase.from("condiciones_curso").select("curso_id").eq("institucion_id", institucionId).eq("curso_id", g.curso_id),
    g.docente_id
      ? supabase.from("perfiles").select("id, nombres, apellidos, activo").eq("institucion_id", institucionId).eq("id", g.docente_id).maybeSingle()
          .overrideTypes<{ id: string; nombres: string; apellidos: string; activo: boolean }, { merge: false }>()
      : Promise.resolve({ data: null, error: null }),
    supabase.from("horarios").select("id, dia_semana, hora_inicio, hora_fin, enlace_clase").eq("institucion_id", institucionId)
      .eq("grupo_id", grupoId).order("dia_semana").order("hora_inicio")
      .overrideTypes<Horario[], { merge: false }>(),
    cuenta("matriculas"),
    cuenta("solicitudes_inscripcion"),
    cuenta("evaluaciones"),
    g.docente_id
      ? supabase.from("usuario_roles").select("activo").eq("perfil_id", g.docente_id).eq("rol", "docente").eq("institucion_id", institucionId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])
  const fallaConteo = matriculas.error || solicitudes.error || evaluaciones.error
  if (fallaConteo) console.error("[grupos] dependencias", fallaConteo.code, fallaConteo.message)

  return {
    id: g.id,
    codigo: g.codigo,
    vacantes: g.vacantes,
    vacantesDisponibles: g.vacantes_disponibles,
    fecha_inicio: g.fecha_inicio,
    fecha_fin: g.fecha_fin,
    estado: g.estado,
    created_at: g.created_at,
    curso: curso.data ?? null,
    docente: docente.data ? { id: docente.data.id, nombre: nombre(docente.data) } : null,
    docenteHabilitado: Boolean(docente.data?.activo && (rolDocente.data as { activo: boolean } | null)?.activo),
    horarios: (horarios.data ?? []).map((h) => ({ ...h, hora_inicio: horaCorta(h.hora_inicio), hora_fin: horaCorta(h.hora_fin) })),
    dependencias: fallaConteo
      ? null
      : { matriculas: matriculas.count ?? 0, solicitudes: solicitudes.count ?? 0, evaluaciones: evaluaciones.count ?? 0 },
    cursoConCondiciones: (condiciones.data?.length ?? 0) > 0,
  }
}

/** Cursos donde se pueden abrir grupos: los no desactivados de la institución. */
export async function opcionesCursos(institucionId: string): Promise<OpcionCurso[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("cursos")
    .select("id, nombre, estado")
    .eq("institucion_id", institucionId)
    .neq("estado", "desactivado")
    .order("nombre")
    .overrideTypes<OpcionCurso[], { merge: false }>()
  if (error) {
    console.error("[grupos] cursos", error.code, error.message)
    throw new Error("No se pudieron cargar los cursos.")
  }
  return data ?? []
}

/**
 * Docentes asignables: rol docente habilitado y perfil activo. Si el grupo ya
 * tiene un docente que dejó de estarlo, se incluye marcado para no perder la relación.
 */
export async function opcionesDocentes(institucionId: string, docenteActual?: string | null): Promise<OpcionDocente[]> {
  const supabase = await createClient()
  const { data: roles, error } = await supabase
    .from("usuario_roles")
    .select("perfil_id, activo")
    .eq("institucion_id", institucionId)
    .eq("rol", "docente")
    .overrideTypes<{ perfil_id: string; activo: boolean }[], { merge: false }>()
  if (error) {
    console.error("[grupos] docentes", error.code, error.message)
    throw new Error("No se pudieron cargar los docentes.")
  }
  const ids = (roles ?? []).map((r) => r.perfil_id)
  if (docenteActual && !ids.includes(docenteActual)) ids.push(docenteActual)
  if (ids.length === 0) return []

  const { data: perfiles } = await supabase
    .from("perfiles")
    .select("id, nombres, apellidos, activo")
    .eq("institucion_id", institucionId)
    .in("id", ids)
    .overrideTypes<{ id: string; nombres: string; apellidos: string; activo: boolean }[], { merge: false }>()

  const rolActivo = new Map((roles ?? []).map((r) => [r.perfil_id, r.activo]))
  return (perfiles ?? [])
    .map((p) => ({ id: p.id, nombre: nombre(p), habilitado: p.activo && rolActivo.get(p.id) === true }))
    .filter((d) => d.habilitado || d.id === docenteActual)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
}
