"use server"

import { revalidatePath } from "next/cache"

import { institucionDelAdmin } from "@/lib/auth/contexto"
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
  | { ok: true; id: string; aviso?: string }
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
const VIGENTES: EstadoGrupo[] = ["programado", "abierto", "en_curso"]

// ---------------------------------------------------------------------------
// Grupos
// ---------------------------------------------------------------------------

export async function crearGrupo(datos: unknown): Promise<ResultadoGrupo> {
  const institucionId = await institucionDelAdmin()
  if (!institucionId) return SIN_PERMISO
  const v = grupoSchema.safeParse(datos)
  if (!v.success) return DATOS_INVALIDOS

  const supabase = await createClient()
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
      institucion_id: institucionId,
      curso_id: v.data.curso_id,
      ...grupoParaGuardar(v.data),
      docente_id: v.data.docente_id === "" ? null : v.data.docente_id,
    })
    .select("id")
  if (error) return falloBD(error)
  const id = data?.[0]?.id as string | undefined
  if (!id) return SIN_PERMISO

  revalidarGrupos(id)
  return { ok: true, id }
}

export async function editarGrupo(id: unknown, datos: unknown): Promise<ResultadoGrupo> {
  const institucionId = await institucionDelAdmin()
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
    if (nuevoDocente) {
      const { data: franjas } = await supabase
        .from("horarios")
        .select("dia_semana, hora_inicio, hora_fin")
        .eq("grupo_id", grupoId)
        .eq("institucion_id", institucionId)
      aviso = await cruceDelDocente(supabase, institucionId, nuevoDocente, { id: grupoId, ...grupoParaGuardar(v.data) }, franjas ?? [])
    } else if (VIGENTES.includes(actual.estado) && actual.estado !== "programado") {
      aviso = "El grupo quedó sin docente estando vigente. Asigna uno antes de que continúen las clases."
    }
  }

  revalidarGrupos(grupoId)
  return { ok: true, id: grupoId, aviso }
}

export async function cambiarEstadoGrupo(id: unknown, estado: unknown): Promise<ResultadoGrupo> {
  const institucionId = await institucionDelAdmin()
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

  if (nuevo === "abierto" || nuevo === "en_curso") {
    const faltan = await faltantes(supabase, institucionId, actual, nuevo)
    if (faltan === "error") return falloBD({ message: "comprobación de requisitos" })
    if (faltan.length) {
      return { ok: false, gravedad: "advertencia", mensaje: `Aún no se puede: ${faltan.join(" ")}` }
    }
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
  return { ok: true, id: grupoId }
}

/** Requisitos para abrir inscripciones o empezar el grupo. */
async function faltantes(
  supabase: Supabase,
  institucionId: string,
  grupo: FilaGrupo,
  nuevo: "abierto" | "en_curso"
): Promise<string[] | "error"> {
  const faltan: string[] = []
  if (!grupo.docente_id) faltan.push("asigna un docente al grupo.")
  else {
    const [rol, perfil] = await Promise.all([
      supabase.from("usuario_roles").select("activo").eq("perfil_id", grupo.docente_id).eq("rol", "docente").eq("institucion_id", institucionId).maybeSingle(),
      supabase.from("perfiles").select("activo").eq("id", grupo.docente_id).eq("institucion_id", institucionId).maybeSingle(),
    ])
    if (rol.error || perfil.error) return "error"
    if (!rol.data?.activo || !perfil.data?.activo) faltan.push("el docente asignado está deshabilitado: asigna otro.")
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
  return faltan
}

/** Solo sin matrículas, solicitudes ni evaluaciones. Sus horarios se borran en cascada. */
export async function eliminarGrupo(id: unknown): Promise<ResultadoGrupo> {
  const institucionId = await institucionDelAdmin()
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

/** Crea (horarioId null) o edita un horario del grupo. */
export async function guardarHorario(grupoId: unknown, horarioId: unknown, datos: unknown): Promise<ResultadoGrupo> {
  const institucionId = await institucionDelAdmin()
  if (!institucionId) return SIN_PERMISO
  const g = idSchema.safeParse(grupoId)
  const h = horarioId === null ? { success: true as const, data: null } : idSchema.safeParse(horarioId)
  const v = horarioSchema.safeParse(datos)
  if (!g.success || !h.success || !v.success) return { ok: false, gravedad: "error", mensaje: "Revisa los datos del horario." }

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
  const choque = (propios ?? []).find(
    (o) =>
      o.id !== h.data &&
      o.dia_semana === fila.dia_semana &&
      seSolapan({ inicio: fila.hora_inicio, fin: fila.hora_fin }, { inicio: horaCorta(o.hora_inicio), fin: horaCorta(o.hora_fin) })
  )
  if (choque) {
    return { ok: false, gravedad: "advertencia", campo: "hora_inicio", mensaje: "Se cruza con otro horario de este mismo grupo." }
  }

  const consulta = h.data
    ? supabase.from("horarios").update(fila).eq("id", h.data).eq("grupo_id", g.data).eq("institucion_id", institucionId).select("id")
    : supabase.from("horarios").insert({ ...fila, grupo_id: g.data, institucion_id: institucionId }).select("id")
  const { data, error } = await consulta
  if (error) return falloBD(error)
  if (!data?.length) return NO_ENCONTRADO

  const aviso = await cruceDelDocente(supabase, institucionId, grupo.docente_id, grupo, [fila])
  revalidarGrupos(g.data)
  return { ok: true, id: data[0].id as string, aviso }
}

export async function eliminarHorario(grupoId: unknown, horarioId: unknown): Promise<ResultadoGrupo> {
  const institucionId = await institucionDelAdmin()
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
  return { ok: true, id: h.data }
}

/**
 * ADVERTENCIA (no lo prohíbe la BD): el docente ya dicta en otro grupo vigente,
 * con fechas que se superponen, en alguna de estas franjas.
 */
async function cruceDelDocente(
  supabase: Supabase,
  institucionId: string,
  docenteId: string | null,
  grupo: { id: string; fecha_inicio: string; fecha_fin: string },
  franjas: { dia_semana: number; hora_inicio: string; hora_fin: string }[]
): Promise<string | undefined> {
  if (!docenteId || franjas.length === 0) return undefined
  const { data: otros } = await supabase
    .from("grupos")
    .select("id, codigo, fecha_inicio, fecha_fin, estado")
    .eq("institucion_id", institucionId)
    .eq("docente_id", docenteId)
    .neq("id", grupo.id)
    .in("estado", VIGENTES)
  const coinciden = (otros ?? []).filter((o) => o.fecha_inicio <= grupo.fecha_fin && grupo.fecha_inicio <= o.fecha_fin)
  if (!coinciden.length) return undefined
  const { data: horarios } = await supabase
    .from("horarios")
    .select("grupo_id, dia_semana, hora_inicio, hora_fin")
    .eq("institucion_id", institucionId)
    .in("grupo_id", coinciden.map((o) => o.id))
  const cruce = (horarios ?? []).find((o) =>
    franjas.some(
      (f) =>
        f.dia_semana === o.dia_semana &&
        seSolapan({ inicio: horaCorta(f.hora_inicio), fin: horaCorta(f.hora_fin) }, { inicio: horaCorta(o.hora_inicio), fin: horaCorta(o.hora_fin) })
    )
  )
  if (!cruce) return undefined
  const otro = coinciden.find((o) => o.id === cruce.grupo_id)
  return `Se detectó un conflicto de horario: el docente ya tiene clase a esa hora en el grupo ${otro?.codigo ?? ""}. Revisa si es correcto.`
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
