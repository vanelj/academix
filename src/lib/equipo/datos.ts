import { normalizarModulos, type ModuloAdmin } from "@/lib/admin/permisos"
import { cuentas, type CuentaDocente } from "@/lib/docentes/datos"
import { createClient } from "@/lib/supabase/server"

/**
 * Equipo administrativo de la institución (SOLO servidor, con la sesión del
 * administrador). RLS: «ver roles asignados», «ver perfiles» y «v5 ver equipo
 * administrativo» limitan todo a su institución. El correo y la activación
 * se leen con el cliente administrativo solo para esos ids.
 */

export type MiembroEquipo = {
  id: string
  nombre: string
  principal: boolean
  accesoTotal: boolean
  modulos: ModuloAdmin[]
  /** Acceso institucional (rol admin habilitado y fila activa). */
  activo: boolean
  cuenta: CuentaDocente | null
}

export type LecturaEquipo = { disponible: false } | { disponible: true; miembros: MiembroEquipo[] }

const TABLA_INEXISTENTE = new Set(["42P01", "PGRST205"])

export async function obtenerEquipo(institucionId: string): Promise<LecturaEquipo> {
  const supabase = await createClient()
  const equipo = await supabase
    .from("administradores_institucion")
    .select("perfil_id, principal, acceso_total, modulos, activo")
    .eq("institucion_id", institucionId)
    .overrideTypes<{ perfil_id: string; principal: boolean; acceso_total: boolean; modulos: string[]; activo: boolean }[], { merge: false }>()
  if (equipo.error) {
    if (TABLA_INEXISTENTE.has(equipo.error.code ?? "")) return { disponible: false }
    console.error("[equipo] lectura", equipo.error.code, equipo.error.message)
    throw new Error("No se pudo cargar el equipo administrativo.")
  }
  const filas = equipo.data ?? []
  const ids = filas.map((f) => f.perfil_id)
  if (ids.length === 0) return { disponible: true, miembros: [] }
  const [perfiles, roles, mapa] = await Promise.all([
    supabase.from("perfiles").select("id, nombres, apellidos").eq("institucion_id", institucionId).in("id", ids)
      .overrideTypes<{ id: string; nombres: string; apellidos: string }[], { merge: false }>(),
    supabase.from("usuario_roles").select("perfil_id, activo").eq("institucion_id", institucionId).eq("rol", "admin").in("perfil_id", ids)
      .overrideTypes<{ perfil_id: string; activo: boolean }[], { merge: false }>(),
    cuentas(ids),
  ])
  const nombre = new Map((perfiles.data ?? []).map((p) => [p.id, `${p.nombres} ${p.apellidos}`.trim()]))
  const rolActivo = new Map((roles.data ?? []).map((r) => [r.perfil_id, r.activo]))
  return {
    disponible: true,
    miembros: filas
      .map((f) => ({
        id: f.perfil_id,
        nombre: nombre.get(f.perfil_id) ?? "Administrador",
        principal: f.principal,
        accesoTotal: f.principal || f.acceso_total,
        modulos: normalizarModulos(f.modulos),
        activo: f.activo && rolActivo.get(f.perfil_id) !== false,
        cuenta: mapa.get(f.perfil_id) ?? null,
      }))
      .sort((a, b) => Number(b.principal) - Number(a.principal) || a.nombre.localeCompare(b.nombre, "es")),
  }
}

/** Personas activas de la institución que aún NO son administradoras (para «Añadir miembro»). */
export async function candidatosEquipo(institucionId: string): Promise<{ id: string; nombre: string }[]> {
  const supabase = await createClient()
  const [perfiles, roles] = await Promise.all([
    supabase.from("perfiles").select("id, nombres, apellidos").eq("institucion_id", institucionId).eq("activo", true)
      .overrideTypes<{ id: string; nombres: string; apellidos: string }[], { merge: false }>(),
    supabase.from("usuario_roles").select("perfil_id").eq("institucion_id", institucionId).eq("rol", "admin")
      .overrideTypes<{ perfil_id: string }[], { merge: false }>(),
  ])
  const admins = new Set((roles.data ?? []).map((r) => r.perfil_id))
  return (perfiles.data ?? [])
    .filter((p) => !admins.has(p.id))
    .map((p) => ({ id: p.id, nombre: `${p.nombres} ${p.apellidos}`.trim() }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
}
