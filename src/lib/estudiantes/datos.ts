import { createClient } from "@/lib/supabase/server"

/**
 * Estudiantes de la institución del administrador (SOLO servidor, solo lectura).
 *
 * Modelo V5: la cuenta del estudiante es GLOBAL (perfiles.institucion_id NULL).
 * La relación con la institución sale de sus solicitudes de inscripción y
 * matrículas en grupos de la institución; no se duplica ni se modifica nada.
 *
 * Todo con la sesión del administrador (nunca la clave secreta):
 * - Solicitudes y matrículas: RLS "ver solicitudes propias o institucionales"
 *   y "ver matriculas" → solo filas de su institución.
 * - Identificación: RPC estudiantes_de_mi_institucion() (migración
 *   docs/migraciones/admin_ver_estudiantes_v5.sql) → nombres y apellidos de
 *   quienes tienen solicitudes o matrículas en su institución.
 * - Contacto: RPC contacto_estudiante(id) → documento, teléfono y correo SOLO
 *   con relación vigente (solicitud pendiente/reservada o matrícula activa).
 * Ambas RPC calculan la institución y el rol en la BD desde la sesión: no
 * reciben institucion_id y la tabla perfiles conserva su RLS de V5.
 */

export type EstadoMatricula = "activa" | "anulada"
export type EstadoFinal = "en_curso" | "aprobado" | "desaprobado"
export type EstadoSolicitud = "pendiente" | "reservada" | "matriculada" | "rechazada" | "cancelada" | "vencida"

type GrupoRef = { id: string; codigo: string; curso: { id: string; nombre: string } | null }

export type MatriculaEstudiante = {
  id: string
  fecha_matricula: string
  estado: EstadoMatricula
  estado_final: EstadoFinal
  grupo: GrupoRef | null
}

export type SolicitudEstudiante = {
  id: string
  tipo: "reserva" | "matricula"
  estado: EstadoSolicitud
  fecha_solicitud: string
  reserva_vence_en: string | null
  grupo: GrupoRef | null
}

export type EstudianteResumen = {
  id: string
  /** El nombre llegó por estudiantes_de_mi_institucion() (debería ser siempre). */
  datosVisibles: boolean
  nombres: string | null
  apellidos: string | null
  matriculas: MatriculaEstudiante[]
  solicitudes: SolicitudEstudiante[]
}

/** Datos de contacto autorizados (solo con relación vigente). */
export type ContactoEstudiante = {
  nombres: string
  apellidos: string
  dni: string | null
  telefono: string | null
  correo: string | null
}

type FilaIdentificada = { estudiante_id: string; nombres: string; apellidos: string }
type FilaContacto = FilaIdentificada & { dni: string | null; telefono: string | null; correo: string | null }
type FilaMatricula = Omit<MatriculaEstudiante, "grupo"> & { grupo_id: string; estudiante_id: string }
type FilaSolicitud = Omit<SolicitudEstudiante, "grupo"> & { grupo_id: string; estudiante_id: string }

async function cargar(institucionId: string, estudianteId?: string) {
  const supabase = await createClient()
  let qm = supabase
    .from("matriculas")
    .select("id, grupo_id, estudiante_id, fecha_matricula, estado, estado_final")
    .eq("institucion_id", institucionId)
  let qs = supabase
    .from("solicitudes_inscripcion")
    .select("id, grupo_id, estudiante_id, tipo, estado, fecha_solicitud, reserva_vence_en")
    .eq("institucion_id", institucionId)
  if (estudianteId) {
    qm = qm.eq("estudiante_id", estudianteId)
    qs = qs.eq("estudiante_id", estudianteId)
  }
  const [matriculas, solicitudes] = await Promise.all([
    qm.order("fecha_matricula", { ascending: false }).overrideTypes<FilaMatricula[], { merge: false }>(),
    qs.order("fecha_solicitud", { ascending: false }).overrideTypes<FilaSolicitud[], { merge: false }>(),
  ])
  if (matriculas.error || solicitudes.error) {
    const e = matriculas.error ?? solicitudes.error
    console.error("[estudiantes] lectura", e?.code, e?.message)
    throw new Error("No se pudieron cargar los estudiantes.")
  }
  const m = matriculas.data ?? []
  const s = solicitudes.data ?? []

  const ids = [...new Set([...m.map((x) => x.estudiante_id), ...s.map((x) => x.estudiante_id)])]
  const grupoIds = [...new Set([...m.map((x) => x.grupo_id), ...s.map((x) => x.grupo_id)])]

  const [identificados, grupos] = await Promise.all([
    ids.length
      ? supabase.rpc("estudiantes_de_mi_institucion")
      : Promise.resolve({ data: [], error: null }),
    grupoIds.length
      ? supabase.from("grupos").select("id, codigo, curso_id").eq("institucion_id", institucionId).in("id", grupoIds)
          .overrideTypes<{ id: string; codigo: string; curso_id: string }[], { merge: false }>()
      : Promise.resolve({ data: [], error: null }),
  ])
  if (identificados.error) {
    // Sin la identificación no se muestra un listado con nombres vacíos que parezca un error de registro.
    console.error("[estudiantes] estudiantes_de_mi_institucion", identificados.error.code, identificados.error.message)
    throw new Error("No se pudieron cargar los estudiantes.")
  }
  if (grupos.error) console.error("[estudiantes] grupos", grupos.error.code, grupos.error.message)

  const cursoIds = [...new Set((grupos.data ?? []).map((g) => g.curso_id))]
  const { data: cursos } = cursoIds.length
    ? await supabase.from("cursos").select("id, nombre").eq("institucion_id", institucionId).in("id", cursoIds)
        .overrideTypes<{ id: string; nombre: string }[], { merge: false }>()
    : { data: [] as { id: string; nombre: string }[] }

  const porCurso = new Map((cursos ?? []).map((c) => [c.id, c]))
  const porGrupo = new Map<string, GrupoRef>(
    (grupos.data ?? []).map((g) => [g.id, { id: g.id, codigo: g.codigo, curso: porCurso.get(g.curso_id) ?? null }])
  )
  // La RPC devuelve una fila por estudiante relacionado (estudiante_id, nombres, apellidos).
  const filasIdentificadas = (identificados.data ?? []) as FilaIdentificada[]
  const porPerfil = new Map(filasIdentificadas.map((p) => [p.estudiante_id, p]))

  return ids.map((id): EstudianteResumen => {
    const perfil = porPerfil.get(id)
    return {
      id,
      datosVisibles: Boolean(perfil),
      nombres: perfil?.nombres ?? null,
      apellidos: perfil?.apellidos ?? null,
      matriculas: m
        .filter((x) => x.estudiante_id === id)
        .map((x) => ({
          id: x.id,
          fecha_matricula: x.fecha_matricula,
          estado: x.estado,
          estado_final: x.estado_final,
          grupo: porGrupo.get(x.grupo_id) ?? null,
        })),
      solicitudes: s
        .filter((x) => x.estudiante_id === id)
        .map((x) => ({
          id: x.id,
          tipo: x.tipo,
          estado: x.estado,
          fecha_solicitud: x.fecha_solicitud,
          reserva_vence_en: x.reserva_vence_en,
          grupo: porGrupo.get(x.grupo_id) ?? null,
        })),
    }
  })
}

/** Estudiantes con al menos una solicitud o matrícula en la institución (sin duplicar cuentas). */
export async function obtenerEstudiantes(institucionId: string): Promise<EstudianteResumen[]> {
  const lista = await cargar(institucionId)
  return lista.sort((a, b) => {
    // Primero los que tienen nombre visible, ordenados por apellido.
    if (a.datosVisibles !== b.datosVisibles) return a.datosVisibles ? -1 : 1
    return `${a.apellidos ?? ""} ${a.nombres ?? ""}`.localeCompare(`${b.apellidos ?? ""} ${b.nombres ?? ""}`, "es")
  })
}

/** Un estudiante SOLO si tiene relación con la institución; si no, null. */
export async function obtenerEstudiante(institucionId: string, estudianteId: string): Promise<EstudianteResumen | null> {
  const [estudiante] = await cargar(institucionId, estudianteId)
  return estudiante ?? null
}

/**
 * Contacto autorizado del estudiante. null = la RPC no devolvió datos: no hay
 * relación vigente con la institución (solo historial). Lanza error si la
 * consulta falla (red, permisos), para no confundirlo con "sin contacto".
 */
export async function obtenerContacto(estudianteId: string): Promise<ContactoEstudiante | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("contacto_estudiante", { p_estudiante: estudianteId })
  if (error) {
    console.error("[estudiantes] contacto_estudiante", error.code, error.message)
    throw new Error("No se pudo consultar el contacto del estudiante.")
  }
  const fila = ((data ?? []) as FilaContacto[])[0]
  if (!fila) return null
  return { nombres: fila.nombres, apellidos: fila.apellidos, dni: fila.dni, telefono: fila.telefono, correo: fila.correo }
}
