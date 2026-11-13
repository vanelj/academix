"use server"

import { despacharCorreos } from "@/lib/correos/despachar"
import { revalidatePath } from "next/cache"

import { institucionDelAdmin } from "@/lib/auth/contexto"
import { buscarCrucesDocente } from "@/lib/grupos/cruces"
import { mensajeCruce } from "@/lib/horarios/calendario"
import { programar, type CriterioDuracion } from "@/lib/horarios/programacion"
import { esErrorDeRed } from "@/lib/registro/errores"
import { createClient } from "@/lib/supabase/server"
import {
  ESTADOS_GRUPO,
  TRANSICIONES,
  grupoParaGuardar,
  grupoSchema,
  horaCorta,
  horarioParaGuardar,
  horarioSchema,
  idSchema,
  seSolapan,
  type EstadoGrupo,
} from "@/lib/validations/grupo"

/**
 * Gestión de grupos y horarios de la institución del administrador.
 *
 * - institucion_id sale del perfil en el servidor y filtra cada operación.
 * - RLS ("admin gestiona grupos", "admin gestiona horarios") vuelve a exigir
 *   rol admin activo y la misma institución.
 * - El disparador validar_docente_grupo comprueba en la BD que el docente sea de
 *   la institución, esté activo y tenga el rol docente habilitado. Como salta
 *   siempre que docente_id aparece en el UPDATE, solo se envía si cambia.
 */

export type ResultadoGrupo =
  | { ok: true; id: string; aviso?: string; /** El grupo ya existía con ese id (reintento de una creación). */ existente?: boolean }
  | {
      ok: false
      mensaje: string
      gravedad: "error" | "advertencia"
      campo?: "curso_id" | "codigo" | "vacantes" | "fecha_inicio" | "fecha_fin" | "docente_id" | "hora_inicio" | "hora_fin"
    }

type Fallo = Extract<ResultadoGrupo, { ok: false }>
type Supabase = Awaited<ReturnType<typeof createClient>>

const SIN_PERMISO: Fallo = { ok: false, gravedad: "error", mensaje: "Tu sesión no tiene permiso de administrador. Vuelve a iniciar sesión." }
const NO_ENCONTRADO: Fallo = { ok: false, gravedad: "error", mensaje: "El grupo no existe o no pertenece a tu institución. Recarga la página." }
const DATOS_INVALIDOS: Fallo = { ok: false, gravedad: "error", mensaje: "Revisa los datos del grupo." }

// ---------------------------------------------------------------------------
// Grupos
// ---------------------------------------------------------------------------

/** `idCliente` (opcional): como en crearCurso, un reintento con el mismo id no duplica el grupo. */
export async function crearGrupo(datos: unknown, idCliente?: unknown): Promise<ResultadoGrupo> {
  const institucionId = await institucionDelAdmin("docentes")
  if (!institucionId) return SIN_PERMISO
  const v = grupoSchema.safeParse(datos)
  const idPropio = idCliente === undefined ? { success: true as const, data: undefined } : idSchema.safeParse(idCliente)
  if (!v.success || !idPropio.success) return DATOS_INVALIDOS

  const supabase = await createClient()
  if (idPropio.data) {
    const previo = await grupoDeInstitucion(supabase, institucionId, idPropio.data)
    if (previo === "error") return falloBD({ message: "lectura del grupo" })
    if (previo) return previo.curso_id === v.data.curso_id ? { ok: true, id: idPropio.data, existente: true } : DATOS_INVALIDOS
  }

  const { data: curso } = await supabase
    .from("cursos")
    .select("id, estado")
    .eq("id", v.data.curso_id)
    .eq("institucion_id", institucionId)
    .maybeSingle()
  if (!curso || curso.estado === "desactivado") {
    return { ok: false, gravedad: "error", campo: "curso_id", mensaje: "Selecciona un curso válido (no desactivado)." }
  }

  const { data, error } = await supabase
    .from("grupos")
    .insert({
      ...(idPropio.data ? { id: idPropio.data } : {}),
      institucion_id: institucionId,
      curso_id: v.data.curso_id,
      ...grupoParaGuardar(v.data),
      docente_id: v.data.docente_id === "" ? null : v.data.docente_id,
    })
    .select("id")
  if (error) {
    // Dos intentos simultáneos con el mismo id: el otro ya lo creó.
    if (error.code === "23505" && idPropio.data) {
      const previo = await grupoDeInstitucion(supabase, institucionId, idPropio.data)
      if (previo && previo !== "error" && previo.curso_id === v.data.curso_id) return { ok: true, id: idPropio.data, existente: true }
    }
    return falloBD(error)
  }
  const id = data?.[0]?.id as string | undefined
  if (!id) return SIN_PERMISO

  revalidarGrupos(id)
  return { ok: true, id }
}

export async function editarGrupo(id: unknown, datos: unknown): Promise<ResultadoGrupo> {
  const institucionId = await institucionDelAdmin("docentes")
  if (!institucionId) return SIN_PERMISO
  const idValido = idSchema.safeParse(id)
  const v = grupoSchema.safeParse(datos)
  if (!idValido.success || !v.success) return DATOS_INVALIDOS
  const grupoId = idValido.data

  const supabase = await createClient()
  const actual = await grupoDeInstitucion(supabase, institucionId, grupoId)
  if (actual === "error") return falloBD({ message: "lectura del grupo" })
  if (!actual) return NO_ENCONTRADO

  // No se puede dejar menos vacantes que las ya ocupadas (matrículas + reservas vigentes).
  const ocupadas = actual.vacantes_disponibles == null ? 0 : actual.vacantes - actual.vacantes_disponibles
  if (Number(v.data.vacantes) < ocupadas) {
    return {
      ok: false,
      gravedad: "advertencia",
      campo: "vacantes",
      mensaje: `El grupo ya tiene ${ocupadas} ${ocupadas === 1 ? "vacante ocupada" : "vacantes ocupadas"}: no puedes indicar menos.`,
    }
  }

  const nuevoDocente = v.data.docente_id === "" ? null : v.data.docente_id
  const cambios: Record<string, unknown> = grupoParaGuardar(v.data) // el curso no se cambia tras crear el grupo
  if (nuevoDocente !== actual.docente_id) cambios.docente_id = nuevoDocente

  // Cruce REAL del docente (otro grupo, mismas fechas y horas): se bloquea ANTES
  // de guardar si cambia el docente o el periodo. Editar otros datos de un grupo
  // que ya tuviera un cruce no se bloquea.
  const guardado = grupoParaGuardar(v.data)
  if (nuevoDocente && (nuevoDocente !== actual.docente_id || guardado.fecha_inicio !== actual.fecha_inicio || guardado.fecha_fin !== actual.fecha_fin)) {
    const bloqueo = await bloqueoPorCruce(supabase, institucionId, nuevoDocente, grupoId, { desde: guardado.fecha_inicio, hasta: guardado.fecha_fin }, null)
    if (bloqueo) return { ...bloqueo, campo: nuevoDocente !== actual.docente_id ? "docente_id" : "fecha_inicio" }
  }

  const { data, error } = await supabase
    .from("grupos")
    .update(cambios)
    .eq("id", grupoId)
    .eq("institucion_id", institucionId)
    .select("id")
  if (error) return falloBD(error)
  if (!data?.length) return NO_ENCONTRADO

  let aviso: string | undefined
  if ("docente_id" in cambios) {
    if (!nuevoDocente && actual.estado === "en_curso") {
      aviso = "El grupo quedó sin docente con las clases en curso. Asigna uno lo antes posible."
    } else if (actual.estado === "abierto") {
      aviso = "El grupo sigue recibiendo inscripciones con «Docente por asignar». Asigna uno antes de iniciar las clases."
    }
  }

  revalidarGrupos(grupoId)
  return { ok: true, id: grupoId, aviso }
}

/**
 * Asigna, cambia o retira (docenteId = null) el docente responsable de UN grupo.
 * Es la única acción de asignación: la usan la ficha del grupo y la ficha del
 * docente («Asignar grupo»). Solo cambia grupos.docente_id; el disparador
 * validar_docente_grupo vuelve a comprobar en la BD que el docente sea de la
 * institución, esté activo y tenga el rol docente habilitado.
 */
export async function asignarDocente(grupoId: unknown, docenteId: unknown): Promise<ResultadoGrupo> {
  const institucionId = await institucionDelAdmin("docentes")
  if (!institucionId) return SIN_PERMISO
  const g = idSchema.safeParse(grupoId)
  const d = docenteId === null ? { success: true as const, data: null } : idSchema.safeParse(docenteId)
  if (!g.success || !d.success) return DATOS_INVALIDOS

  const supabase = await createClient()
  const actual = await grupoDeInstitucion(supabase, institucionId, g.data)
  if (actual === "error") return falloBD({ message: "lectura del grupo" })
  if (!actual) return NO_ENCONTRADO
  if (actual.estado === "cerrado" || actual.estado === "cancelado") {
    return { ok: false, gravedad: "advertencia", mensaje: "El grupo está cerrado o cancelado: ya no se cambia su docente." }
  }
  if (actual.docente_id === d.data) return { ok: true, id: g.data }

  if (d.data) {
    const [rol, perfil] = await Promise.all([
      supabase.from("usuario_roles").select("activo").eq("perfil_id", d.data).eq("rol", "docente").eq("institucion_id", institucionId).maybeSingle(),
      supabase.from("perfiles").select("activo").eq("id", d.data).eq("institucion_id", institucionId).maybeSingle(),
    ])
    if (rol.error || perfil.error) return falloBD({ message: "comprobación del docente" })
    if (!rol.data?.activo || !perfil.data?.activo) {
      return { ok: false, gravedad: "advertencia", campo: "docente_id", mensaje: "Ese docente no está habilitado en tu institución." }
    }
  }

  if (d.data) {
    const bloqueo = await bloqueoPorCruce(supabase, institucionId, d.data, g.data, { desde: actual.fecha_inicio, hasta: actual.fecha_fin }, null)
    if (bloqueo) return bloqueo
  }

  const { data, error } = await supabase
    .from("grupos")
    .update({ docente_id: d.data })
    .eq("id", g.data)
    .eq("institucion_id", institucionId)
    .select("id")
  if (error) return falloBD(error)
  if (!data?.length) return NO_ENCONTRADO

  let aviso: string | undefined
  if (!d.data && actual.estado === "en_curso") {
    aviso = "El grupo quedó sin docente con las clases en curso. Asigna uno lo antes posible."
  }
  revalidarGrupos(g.data)
  if (actual.docente_id) revalidatePath(`/admin/docentes/${actual.docente_id}`)
  if (d.data) revalidatePath(`/admin/docentes/${d.data}`)
  return { ok: true, id: g.data, aviso }
}

/**
 * Programación automática: con los horarios YA guardados del grupo, la fecha de
 * inicio y UN criterio de duración, el servidor recalcula (no confía en el
 * navegador) y actualiza solo fecha_inicio y fecha_fin. Las sesiones no se
 * guardan: se derivan de horarios + fechas, así que repetir no duplica nada.
 */
export async function aplicarProgramacion(grupoId: unknown, datos: unknown): Promise<ResultadoGrupo & { sesiones?: number; horas?: number }> {
  const institucionId = await institucionDelAdmin("docentes")
  if (!institucionId) return SIN_PERMISO
  const g = idSchema.safeParse(grupoId)
  const d = datos as { fechaInicio?: unknown; criterio?: { tipo?: unknown; valor?: unknown } } | null
  const tipo = d?.criterio?.tipo
  const valor = Number(d?.criterio?.valor)
  if (!g.success || typeof d?.fechaInicio !== "string" || (tipo !== "semanas" && tipo !== "sesiones" && tipo !== "horas")) return DATOS_INVALIDOS

  const supabase = await createClient()
  const actual = await grupoDeInstitucion(supabase, institucionId, g.data)
  if (actual === "error") return falloBD({ message: "lectura del grupo" })
  if (!actual) return NO_ENCONTRADO
  if (actual.estado === "cerrado" || actual.estado === "cancelado") {
    return { ok: false, gravedad: "advertencia", mensaje: "El grupo está cerrado o cancelado: su programación ya no se cambia." }
  }
  if (actual.estado === "en_curso" && d.fechaInicio !== actual.fecha_inicio) {
    return { ok: false, gravedad: "advertencia", campo: "fecha_inicio", mensaje: "Las clases ya empezaron: no se puede cambiar la fecha de inicio, solo la duración." }
  }
  const { data: franjas, error } = await supabase.from("horarios").select("dia_semana, hora_inicio, hora_fin").eq("grupo_id", g.data).eq("institucion_id", institucionId)
  if (error) return falloBD(error)
  const r = programar(d.fechaInicio, (franjas ?? []).map((f) => ({ dia_semana: f.dia_semana, hora_inicio: horaCorta(f.hora_inicio), hora_fin: horaCorta(f.hora_fin) })), { tipo, valor } as CriterioDuracion)
  if (!r.ok) return { ok: false, gravedad: "advertencia", mensaje: r.errores.join(" ") }
  if (actual.docente_id) {
    const bloqueo = await bloqueoPorCruce(supabase, institucionId, actual.docente_id, g.data, { desde: r.programacion.fechaInicio, hasta: r.programacion.fechaFin }, null)
    if (bloqueo) return bloqueo
  }

  const { data, error: errorFechas } = await supabase
    .from("grupos")
    .update({ fecha_inicio: r.programacion.fechaInicio, fecha_fin: r.programacion.fechaFin })
    .eq("id", g.data)
    .eq("institucion_id", institucionId)
    .select("id")
  if (errorFechas) return falloBD(errorFechas)
  if (!data?.length) return NO_ENCONTRADO
  revalidarGrupos(g.data)
  return { ok: true, id: g.data, sesiones: r.programacion.totalSesiones, horas: r.programacion.horasReloj }
}

export async function cambiarEstadoGrupo(id: unknown, estado: unknown): Promise<ResultadoGrupo> {
  const institucionId = await institucionDelAdmin("docentes")
  if (!institucionId) return SIN_PERMISO
  const idValido = idSchema.safeParse(id)
  if (!idValido.success || !ESTADOS_GRUPO.includes(estado as EstadoGrupo)) {
    return { ok: false, gravedad: "error", mensaje: "No se pudo completar la operación." }
  }
  const grupoId = idValido.data
  const nuevo = estado as EstadoGrupo

  const supabase = await createClient()
  const actual = await grupoDeInstitucion(supabase, institucionId, grupoId)
  if (actual === "error") return falloBD({ message: "lectura del grupo" })
  if (!actual) return NO_ENCONTRADO
  if (actual.estado === nuevo) return { ok: true, id: grupoId }
  if (!TRANSICIONES[actual.estado].includes(nuevo)) {
    return { ok: false, gravedad: "advertencia", mensaje: "Ese cambio de estado no está permitido para este grupo." }
  }

  let aviso: string | undefined
  if (nuevo === "abierto" || nuevo === "en_curso") {
    const r = await faltantes(supabase, institucionId, actual, nuevo)
    if (r === "error") return falloBD({ message: "comprobación de requisitos" })
    if (r.faltan.length) {
      return { ok: false, gravedad: "advertencia", mensaje: `Aún no se puede: ${r.faltan.join(" ")}` }
    }
    aviso = r.aviso
  }

  const { data, error } = await supabase
    .from("grupos")
    .update({ estado: nuevo })
    .eq("id", grupoId)
    .eq("institucion_id", institucionId)
    .select("id")
  if (error) return falloBD(error)
  if (!data?.length) return NO_ENCONTRADO

  revalidarGrupos(grupoId)
  return { ok: true, id: grupoId, aviso }
}

/**
 * Requisitos para abrir inscripciones o iniciar clases.
 * - Abrir («abierto»): curso publicado, condiciones, horario, fechas y vacantes.
 *   El docente NO se exige: la institución puede recibir solicitudes mientras
 *   lo asigna (los estudiantes ven «Docente por asignar»). Sin docente válido se
 *   devuelve un aviso. La RPC crear_solicitud_inscripcion de V5 tampoco lo exige.
 * - Iniciar clases («en_curso»): además, un docente activo y habilitado.
 */
async function faltantes(
  supabase: Supabase,
  institucionId: string,
  grupo: FilaGrupo,
  nuevo: "abierto" | "en_curso"
): Promise<{ faltan: string[]; aviso?: string } | "error"> {
  const faltan: string[] = []
  let docenteValido = false
  let docenteDeshabilitado = false
  if (grupo.docente_id) {
    const [rol, perfil] = await Promise.all([
      supabase.from("usuario_roles").select("activo").eq("perfil_id", grupo.docente_id).eq("rol", "docente").eq("institucion_id", institucionId).maybeSingle(),
      supabase.from("perfiles").select("activo").eq("id", grupo.docente_id).eq("institucion_id", institucionId).maybeSingle(),
    ])
    if (rol.error || perfil.error) return "error"
    docenteValido = Boolean(rol.data?.activo && perfil.data?.activo)
    docenteDeshabilitado = !docenteValido
  }
  if (nuevo === "en_curso" && !docenteValido) {
    faltan.push(docenteDeshabilitado ? "el docente asignado está deshabilitado: asigna otro antes de iniciar las clases." : "asigna un docente antes de iniciar las clases.")
  }
  if (nuevo === "abierto") {
    const [curso, condiciones, horarios] = await Promise.all([
      supabase.from("cursos").select("estado").eq("id", grupo.curso_id).eq("institucion_id", institucionId).maybeSingle(),
      supabase.from("condiciones_curso").select("curso_id").eq("curso_id", grupo.curso_id).eq("institucion_id", institucionId),
      supabase.from("horarios").select("id", { count: "exact", head: true }).eq("grupo_id", grupo.id).eq("institucion_id", institucionId),
    ])
    if (curso.error || condiciones.error || horarios.error) return "error"
    // La RPC crear_solicitud_inscripcion de V5 exige curso publicado y condiciones.
    if (curso.data?.estado !== "publicado") faltan.push("publica el curso.")
    if (!condiciones.data?.length) faltan.push("configura las condiciones del curso.")
    if (!horarios.count) faltan.push("agrega al menos un horario.")
    if (grupo.fecha_fin < new Date().toISOString().slice(0, 10)) faltan.push("la fecha de fin ya pasó.")
    if (grupo.vacantes_disponibles !== null && grupo.vacantes_disponibles < 1) faltan.push("no quedan vacantes disponibles.")
  }
  const aviso =
    nuevo === "abierto" && !docenteValido
      ? docenteDeshabilitado
        ? "El docente asignado está deshabilitado. Las inscripciones se abren igual; asigna otro docente antes de iniciar las clases."
        : "Las inscripciones se abren con «Docente por asignar». Asigna un docente antes de iniciar las clases."
      : undefined
  return { faltan, aviso }
}

/** Solo sin matrículas, solicitudes ni evaluaciones. Sus horarios se borran en cascada. */
export async function eliminarGrupo(id: unknown): Promise<ResultadoGrupo> {
  const institucionId = await institucionDelAdmin("docentes")
  if (!institucionId) return SIN_PERMISO
  const idValido = idSchema.safeParse(id)
  if (!idValido.success) return { ok: false, gravedad: "error", mensaje: "No se pudo completar la operación." }
  const grupoId = idValido.data

  const supabase = await createClient()
  const cuenta = (tabla: string) =>
    supabase.from(tabla).select("id", { count: "exact", head: true }).eq("grupo_id", grupoId).eq("institucion_id", institucionId)
  const [m, s, e] = await Promise.all([cuenta("matriculas"), cuenta("solicitudes_inscripcion"), cuenta("evaluaciones")])
  const fallo = m.error ?? s.error ?? e.error
  if (fallo) return falloBD(fallo)
  if ((m.count ?? 0) + (s.count ?? 0) + (e.count ?? 0) > 0) return enUso()

  const { data, error } = await supabase
    .from("grupos")
    .delete()
    .eq("id", grupoId)
    .eq("institucion_id", institucionId)
    .select("id")
  if (error) return error.code === "23503" ? enUso() : falloBD(error)
  if (!data?.length) return NO_ENCONTRADO

  revalidarGrupos()
  return { ok: true, id: grupoId }
}

// ---------------------------------------------------------------------------
// Horarios
// ---------------------------------------------------------------------------

/**
 * Crea (horarioId null) o edita un horario del grupo.
 * `idCliente` (opcional, solo al crear): id generado por el asistente. Si un
 * intento anterior ya creó ese horario, se actualiza en lugar de duplicarlo.
 */
export async function guardarHorario(grupoId: unknown, horarioId: unknown, datos: unknown, idCliente?: unknown): Promise<ResultadoGrupo> {
  const institucionId = await institucionDelAdmin("docentes")
  if (!institucionId) return SIN_PERMISO
  const g = idSchema.safeParse(grupoId)
  const h = horarioId === null ? { success: true as const, data: null } : idSchema.safeParse(horarioId)
  const propio = idCliente === undefined || horarioId !== null ? { success: true as const, data: undefined } : idSchema.safeParse(idCliente)
  const v = horarioSchema.safeParse(datos)
  if (!g.success || !h.success || !propio.success || !v.success) return { ok: false, gravedad: "error", mensaje: "Revisa los datos del horario." }

  const supabase = await createClient()
  const grupo = await grupoDeInstitucion(supabase, institucionId, g.data)
  if (grupo === "error") return falloBD({ message: "lectura del grupo" })
  if (!grupo) return NO_ENCONTRADO

  const fila = horarioParaGuardar(v.data)

  // Sin solapes dentro del mismo grupo.
  const { data: propios, error: propiosError } = await supabase
    .from("horarios")
    .select("id, dia_semana, hora_inicio, hora_fin")
    .eq("grupo_id", g.data)
    .eq("institucion_id", institucionId)
  if (propiosError) return falloBD(propiosError)
  // Reintento de una creación que sí llegó a guardarse: se actualiza ese mismo horario.
  const horarioDestino = h.data ?? (propio.data && (propios ?? []).some((o) => o.id === propio.data) ? propio.data : null)
  const choque = (propios ?? []).find(
    (o) =>
      o.id !== horarioDestino &&
      o.dia_semana === fila.dia_semana &&
      seSolapan({ inicio: fila.hora_inicio, fin: fila.hora_fin }, { inicio: horaCorta(o.hora_inicio), fin: horaCorta(o.hora_fin) })
  )
  if (choque) {
    return { ok: false, gravedad: "advertencia", campo: "hora_inicio", mensaje: "Se cruza con otro horario de este mismo grupo." }
  }
  if (grupo.docente_id) {
    const bloqueo = await bloqueoPorCruce(supabase, institucionId, grupo.docente_id, g.data, { desde: grupo.fecha_inicio, hasta: grupo.fecha_fin }, [fila])
    if (bloqueo) return { ...bloqueo, campo: "hora_inicio" }
  }

  const consulta = horarioDestino
    ? supabase.from("horarios").update(fila).eq("id", horarioDestino).eq("grupo_id", g.data).eq("institucion_id", institucionId).select("id")
    : supabase.from("horarios").insert({ ...(propio.data ? { id: propio.data } : {}), ...fila, grupo_id: g.data, institucion_id: institucionId }).select("id")
  const { data, error } = await consulta
  if (error) return falloBD(error)
  if (!data?.length) return NO_ENCONTRADO

  revalidarGrupos(g.data)
  despacharCorreos() // aviso de cambio de horario (correos_academicos_v5)
  return { ok: true, id: data[0].id as string }
}

export async function eliminarHorario(grupoId: unknown, horarioId: unknown): Promise<ResultadoGrupo> {
  const institucionId = await institucionDelAdmin("docentes")
  if (!institucionId) return SIN_PERMISO
  const g = idSchema.safeParse(grupoId)
  const h = idSchema.safeParse(horarioId)
  if (!g.success || !h.success) return { ok: false, gravedad: "error", mensaje: "No se pudo completar la operación." }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("horarios")
    .delete()
    .eq("id", h.data)
    .eq("grupo_id", g.data)
    .eq("institucion_id", institucionId)
    .select("id")
  if (error) return falloBD(error)
  if (!data?.length) return { ok: false, gravedad: "error", mensaje: "El horario ya no existe. Recarga la página." }

  revalidarGrupos(g.data)
  despacharCorreos()
  return { ok: true, id: h.data }
}

/**
 * Un docente no puede dictar dos clases a la vez: si la programación propuesta
 * coincide en FECHAS REALES, día y horas con otro grupo vigente del docente, la
 * operación se rechaza con una explicación (curso, grupo, día, horas, periodo).
 * `franjas` = horarios propuestos; null = los ya guardados del grupo.
 */
async function bloqueoPorCruce(
  supabase: Supabase,
  institucionId: string,
  docenteId: string,
  grupoId: string,
  periodo: { desde: string; hasta: string },
  franjas: { dia_semana: number; hora_inicio: string; hora_fin: string }[] | null
): Promise<Fallo | null> {
  let propias = franjas
  if (!propias) {
    const { data, error } = await supabase.from("horarios").select("dia_semana, hora_inicio, hora_fin").eq("grupo_id", grupoId).eq("institucion_id", institucionId)
    if (error) return falloBD(error)
    propias = data ?? []
  }
  const cruces = await buscarCrucesDocente(supabase, institucionId, docenteId, { ...periodo, franjas: propias }, grupoId)
  if (cruces === "error") return { ok: false, gravedad: "error", mensaje: "No se pudo comprobar el horario del docente. Inténtalo de nuevo." }
  if (cruces.length === 0) return null
  const lista = cruces.slice(0, 3).map(mensajeCruce).join(" ")
  return { ok: false, gravedad: "advertencia", mensaje: `${lista} Cambia el horario o elige otro docente.` }
}

const RE_FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/
const RE_HORA = /^\d{2}:\d{2}/

type FranjaEntrada = { dia_semana: number; hora_inicio: string; hora_fin: string }
const esFranja = (f: unknown): f is FranjaEntrada =>
  typeof f === "object" &&
  f !== null &&
  Number.isInteger((f as FranjaEntrada).dia_semana) &&
  (f as FranjaEntrada).dia_semana >= 1 &&
  (f as FranjaEntrada).dia_semana <= 7 &&
  RE_HORA.test(String((f as FranjaEntrada).hora_inicio)) &&
  RE_HORA.test(String((f as FranjaEntrada).hora_fin))

/**
 * Consulta en vivo (formularios de grupo, horarios y asignación): ¿la
 * programación propuesta cruza con otra clase del docente? No guarda nada.
 */
export async function revisarCruceDocente(datos: unknown): Promise<{ ok: true; cruces: string[] } | { ok: false; mensaje: string }> {
  const institucionId = await institucionDelAdmin("docentes")
  if (!institucionId) return { ok: false, mensaje: SIN_PERMISO.mensaje }
  const d = datos as { grupoId?: unknown; docenteId?: unknown; fechaInicio?: unknown; fechaFin?: unknown; franjas?: unknown } | null
  const docente = idSchema.safeParse(d?.docenteId)
  const grupo = d?.grupoId == null ? { success: true as const, data: null } : idSchema.safeParse(d.grupoId)
  if (!docente.success || !grupo.success || typeof d?.fechaInicio !== "string" || typeof d?.fechaFin !== "string" || !RE_FECHA_ISO.test(d.fechaInicio) || !RE_FECHA_ISO.test(d.fechaFin)) {
    return { ok: true, cruces: [] }
  }
  const supabase = await createClient()
  let franjas: FranjaEntrada[] = []
  if (Array.isArray(d.franjas)) franjas = d.franjas.slice(0, 30).filter(esFranja)
  else if (grupo.data) {
    const { data } = await supabase.from("horarios").select("dia_semana, hora_inicio, hora_fin").eq("grupo_id", grupo.data).eq("institucion_id", institucionId)
    franjas = data ?? []
  }
  const cruces = await buscarCrucesDocente(supabase, institucionId, docente.data, { desde: d.fechaInicio, hasta: d.fechaFin, franjas }, grupo.data)
  if (cruces === "error") return { ok: false, mensaje: "No se pudo comprobar el horario del docente." }
  return { ok: true, cruces: cruces.slice(0, 5).map(mensajeCruce) }
}

// ---------------------------------------------------------------------------
// Auxiliares
// ---------------------------------------------------------------------------

type FilaGrupo = {
  id: string
  curso_id: string
  docente_id: string | null
  vacantes: number
  vacantes_disponibles: number | null
  fecha_inicio: string
  fecha_fin: string
  estado: EstadoGrupo
}

async function grupoDeInstitucion(supabase: Supabase, institucionId: string, grupoId: string) {
  const { data, error } = await supabase
    .from("grupos_con_vacantes")
    .select("id, curso_id, docente_id, vacantes, vacantes_disponibles, fecha_inicio, fecha_fin, estado")
    .eq("id", grupoId)
    .eq("institucion_id", institucionId)
    .maybeSingle()
    .overrideTypes<FilaGrupo, { merge: false }>()
  if (error) {
    console.error("[grupos] grupo", error.code, error.message)
    return "error" as const
  }
  return data
}

function enUso(): Fallo {
  return {
    ok: false,
    gravedad: "advertencia",
    mensaje: "No puedes eliminar este grupo porque tiene matrículas, solicitudes o evaluaciones. Cancélalo o ciérralo en su lugar.",
  }
}

function falloBD(error: { code?: string; message: string }): Fallo {
  if (/ubicacion/i.test(error.message) && (error.code === "PGRST204" || error.code === "42703")) {
    return { ok: false, gravedad: "advertencia", mensaje: "El aula o sede aún no se puede guardar (falta la actualización «aula_academica_v5»)." }
  }
  if (esErrorDeRed(error)) return { ok: false, gravedad: "error", mensaje: "No se pudo conectar con el servidor. Inténtalo de nuevo." }
  console.error("[grupos] BD", error.code, error.message)
  if (/docente/i.test(error.message)) {
    // Disparador validar_docente_grupo.
    return { ok: false, gravedad: "advertencia", campo: "docente_id", mensaje: "El docente no está activo, no tiene el rol docente habilitado o es de otra institución." }
  }
  switch (error.code) {
    case "23505":
      return { ok: false, gravedad: "advertencia", campo: "codigo", mensaje: "Ya existe un grupo con ese código en este curso." }
    case "23514":
      return { ok: false, gravedad: "error", mensaje: "Algún dato no cumple las reglas: revisa las fechas, las horas y las vacantes." }
    case "23503":
      return { ok: false, gravedad: "error", mensaje: "El curso o el docente seleccionado no son válidos para tu institución." }
    case "42501":
      return { ok: false, gravedad: "error", mensaje: "No tienes permiso para gestionar los grupos de esta institución." }
    default:
      return { ok: false, gravedad: "error", mensaje: "No se pudo guardar. Inténtalo de nuevo en unos minutos." }
  }
}

function revalidarGrupos(grupoId?: string) {
  revalidatePath("/admin/grupos")
  if (grupoId) revalidatePath(`/admin/grupos/${grupoId}`)
  revalidatePath("/admin/cursos", "layout") // conteo de grupos en cursos
  revalidatePath("/admin/docentes", "layout") // grupos asignados
  revalidatePath("/cursos") // oferta_grupos en el catálogo
}
