import type { Role } from "@/config/navigation"
import { clienteAdministrativo } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

/**
 * Lectura de docentes de la institución del administrador (SOLO servidor).
 *
 * Los datos académicos se leen con la sesión del administrador: RLS ("ver
 * perfiles", "ver roles asignados", "ver grupos", "ver cursos") limita todo a su
 * institución, y además se filtra explícitamente por institucion_id.
 * El correo y el estado de activación están en Supabase Auth: se consultan con
 * el cliente administrativo SOLO para los ids ya autorizados por esas consultas.
 */

const VIGENTES = ["programado", "abierto", "en_curso"]

export type CuentaDocente = {
  correo: string | null
  /** El docente abrió la invitación y creó su contraseña. */
  activada: boolean
  invitadoEn: string | null
  ultimoAcceso: string | null
}

export type DocenteResumen = {
  id: string
  nombres: string
  apellidos: string
  dni: string | null
  telefono: string | null
  /** perfiles.activo (afecta a todos los roles de la persona). */
  perfilActivo: boolean
  /** usuario_roles.activo del rol docente. */
  rolActivo: boolean
  asignadoEn: string
  /** Otros roles de la misma persona en la institución. */
  otrosRoles: Role[]
  grupos: number | null
  gruposVigentes: number | null
  /** null = no se pudo consultar (p. ej. falta la clave secreta). */
  cuenta: CuentaDocente | null
}

export type GrupoDocente = {
  id: string
  codigo: string
  estado: string
  fecha_inicio: string
  fecha_fin: string
  curso: { id: string; nombre: string } | null
}

export type DocenteDetalle = DocenteResumen & { gruposAsignados: GrupoDocente[] }

export type MiembroInstitucion = { id: string; nombres: string; apellidos: string; roles: Role[] }

type FilaRol = { perfil_id: string; rol: Role; activo: boolean; asignado_en: string }
type FilaPerfil = {
  id: string
  nombres: string
  apellidos: string
  dni: string | null
  telefono: string | null
  activo: boolean
}

async function cuentas(ids: string[]): Promise<Map<string, CuentaDocente>> {
  const mapa = new Map<string, CuentaDocente>()
  const admin = clienteAdministrativo()
  if (!admin || ids.length === 0) return mapa
  const resultados = await Promise.all(ids.map((id) => admin.auth.admin.getUserById(id)))
  resultados.forEach(({ data, error }, i) => {
    if (error || !data.user) {
      if (error) console.error("[docentes] cuenta", error.code, error.message)
      return
    }
    const u = data.user
    mapa.set(ids[i], {
      correo: u.email ?? null,
      activada: Boolean(u.email_confirmed_at),
      invitadoEn: u.invited_at ?? null,
      ultimoAcceso: u.last_sign_in_at ?? null,
    })
  })
  return mapa
}

export async function obtenerDocentes(institucionId: string): Promise<DocenteResumen[]> {
  const supabase = await createClient()
  const { data: roles, error: rolesError } = await supabase
    .from("usuario_roles")
    .select("perfil_id, rol, activo, asignado_en")
    .eq("institucion_id", institucionId)
    .overrideTypes<FilaRol[], { merge: false }>()
  if (rolesError) {
    console.error("[docentes] roles", rolesError.code, rolesError.message)
    throw new Error("No se pudieron cargar los docentes.")
  }

  const docentes = (roles ?? []).filter((r) => r.rol === "docente")
  const ids = docentes.map((r) => r.perfil_id)
  if (ids.length === 0) return []

  const [perfiles, grupos, mapaCuentas] = await Promise.all([
    supabase
      .from("perfiles")
      .select("id, nombres, apellidos, dni, telefono, activo")
      .eq("institucion_id", institucionId)
      .in("id", ids)
      .overrideTypes<FilaPerfil[], { merge: false }>(),
    supabase
      .from("grupos")
      .select("docente_id, estado")
      .eq("institucion_id", institucionId)
      .in("docente_id", ids)
      .overrideTypes<{ docente_id: string; estado: string }[], { merge: false }>(),
    cuentas(ids),
  ])
  if (perfiles.error) {
    console.error("[docentes] perfiles", perfiles.error.code, perfiles.error.message)
    throw new Error("No se pudieron cargar los docentes.")
  }
  if (grupos.error) console.error("[docentes] grupos", grupos.error.code, grupos.error.message)

  const porPerfil = new Map((perfiles.data ?? []).map((p) => [p.id, p]))
  const admin = clienteAdministrativo()

  return docentes
    .map((rol): DocenteResumen | null => {
      const perfil = porPerfil.get(rol.perfil_id)
      if (!perfil) return null
      const suyos = (grupos.data ?? []).filter((g) => g.docente_id === perfil.id)
      return {
        ...perfil,
        perfilActivo: perfil.activo,
        rolActivo: rol.activo,
        asignadoEn: rol.asignado_en,
        otrosRoles: (roles ?? []).filter((r) => r.perfil_id === perfil.id && r.rol !== "docente").map((r) => r.rol),
        grupos: grupos.error ? null : suyos.length,
        gruposVigentes: grupos.error ? null : suyos.filter((g) => VIGENTES.includes(g.estado)).length,
        cuenta: admin ? (mapaCuentas.get(perfil.id) ?? null) : null,
      }
    })
    .filter((d): d is DocenteResumen => d !== null)
    .sort((a, b) => `${a.apellidos} ${a.nombres}`.localeCompare(`${b.apellidos} ${b.nombres}`, "es"))
}

export async function obtenerDocente(institucionId: string, perfilId: string): Promise<DocenteDetalle | null> {
  const lista = await obtenerDocentes(institucionId)
  const docente = lista.find((d) => d.id === perfilId)
  if (!docente) return null

  const supabase = await createClient()
  const { data: grupos, error } = await supabase
    .from("grupos")
    .select("id, codigo, estado, fecha_inicio, fecha_fin, curso_id")
    .eq("institucion_id", institucionId)
    .eq("docente_id", perfilId)
    .order("fecha_inicio", { ascending: false })
    .overrideTypes<(Omit<GrupoDocente, "curso"> & { curso_id: string })[], { merge: false }>()
  if (error) console.error("[docentes] grupos del docente", error.code, error.message)

  const cursoIds = [...new Set((grupos ?? []).map((g) => g.curso_id))]
  const { data: cursos } = cursoIds.length
    ? await supabase
        .from("cursos")
        .select("id, nombre")
        .eq("institucion_id", institucionId)
        .in("id", cursoIds)
        .overrideTypes<{ id: string; nombre: string }[], { merge: false }>()
    : { data: [] as { id: string; nombre: string }[] }
  const porCurso = new Map((cursos ?? []).map((c) => [c.id, c]))

  return {
    ...docente,
    gruposAsignados: (grupos ?? []).map(({ curso_id, ...g }) => ({ ...g, curso: porCurso.get(curso_id) ?? null })),
  }
}

/** Personas activas de la institución que aún NO tienen el rol docente. */
export async function miembrosSinRolDocente(institucionId: string): Promise<MiembroInstitucion[]> {
  const supabase = await createClient()
  const [perfiles, roles] = await Promise.all([
    supabase
      .from("perfiles")
      .select("id, nombres, apellidos, activo")
      .eq("institucion_id", institucionId)
      .eq("activo", true)
      .overrideTypes<(Pick<FilaPerfil, "id" | "nombres" | "apellidos" | "activo">)[], { merge: false }>(),
    supabase
      .from("usuario_roles")
      .select("perfil_id, rol, activo, asignado_en")
      .eq("institucion_id", institucionId)
      .overrideTypes<FilaRol[], { merge: false }>(),
  ])
  if (perfiles.error || roles.error) {
    console.error("[docentes] miembros", perfiles.error?.message ?? roles.error?.message)
    return []
  }
  return (perfiles.data ?? [])
    .map((p) => ({
      id: p.id,
      nombres: p.nombres,
      apellidos: p.apellidos,
      roles: (roles.data ?? []).filter((r) => r.perfil_id === p.id).map((r) => r.rol),
    }))
    .filter((m) => !m.roles.includes("docente"))
    .sort((a, b) => `${a.apellidos} ${a.nombres}`.localeCompare(`${b.apellidos} ${b.nombres}`, "es"))
}
