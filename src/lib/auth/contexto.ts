import { cache } from "react"
import { redirect } from "next/navigation"

import type { ShellUser } from "@/config/demo-user"
import type { Role } from "@/config/navigation"
import { esRol, panelDeRol } from "@/lib/auth/roles"
import { createClient } from "@/lib/supabase/server"

/**
 * Contexto de autenticación y autorización (SOLO servidor).
 *
 * - La identidad se valida con supabase.auth.getClaims() (firma del JWT), nunca
 *   con datos enviados por el navegador.
 * - Perfil, roles e institución se leen con la sesión del usuario, así que las
 *   políticas RLS de la V5 deciden qué puede ver: su propio perfil, sus propios
 *   roles y la institución de su perfil.
 * - El rol activo es el de perfiles.rol_activo, el mismo que usa la BD
 *   (privado.mi_rol_activo) para aplicar los permisos.
 */

export type PerfilSesion = {
  id: string
  nombres: string
  apellidos: string
  dni: string | null
  telefono: string | null
  institucionId: string | null
  rolActivo: string | null
  activo: boolean
}

export type ContextoAuth =
  | { estado: "sin_sesion" }
  | { estado: "sin_perfil"; userId: string; email: string | null }
  | {
      estado: "con_perfil"
      userId: string
      email: string | null
      perfil: PerfilSesion
      /** Roles asignados y habilitados (usuario_roles.activo). */
      roles: Role[]
      /** Rol activo solo si sigue asignado y habilitado; si no, null. */
      rolActivo: Role | null
      institucion: string | null
      /** instituciones.logo_url de la propia institución (puede ser null). */
      institucionLogo: string | null
    }

export const obtenerContexto = cache(async (): Promise<ContextoAuth> => {
  const supabase = await createClient()
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims()
  const claims = claimsData?.claims

  if (claimsError || !claims?.sub) return { estado: "sin_sesion" }

  const userId = claims.sub
  const email = typeof claims.email === "string" ? claims.email : null

  const { data: perfil, error: perfilError } = await supabase
    .from("perfiles")
    .select("id, nombres, apellidos, dni, telefono, institucion_id, rol_activo, activo")
    .eq("id", userId)
    .maybeSingle()

  if (perfilError) {
    console.error("[auth] error al leer el perfil", perfilError.code, perfilError.message)
    throw new Error("No se pudo comprobar el perfil de la cuenta.")
  }

  if (!perfil) return { estado: "sin_perfil", userId, email }

  const { data: filasRoles, error: rolesError } = await supabase
    .from("usuario_roles")
    .select("rol")
    .eq("perfil_id", userId)
    .eq("activo", true)

  if (rolesError) {
    console.error("[auth] error al leer los roles", rolesError.code, rolesError.message)
    throw new Error("No se pudieron comprobar los roles de la cuenta.")
  }

  const roles = (filasRoles ?? []).map((fila) => fila.rol).filter(esRol)
  const rolActivo = esRol(perfil.rol_activo) && roles.includes(perfil.rol_activo)
    ? perfil.rol_activo
    : null

  // La política "ver mi institucion" solo devuelve la institución del perfil activo.
  let institucion: string | null = null
  let institucionLogo: string | null = null
  if (perfil.institucion_id && perfil.activo) {
    const { data } = await supabase
      .from("instituciones")
      .select("nombre, logo_url")
      .eq("id", perfil.institucion_id)
      .maybeSingle()
    institucion = data?.nombre ?? null
    institucionLogo = data?.logo_url ?? null
  }

  return {
    estado: "con_perfil",
    userId,
    email,
    perfil: {
      id: perfil.id,
      nombres: perfil.nombres,
      apellidos: perfil.apellidos,
      dni: perfil.dni,
      telefono: perfil.telefono,
      institucionId: perfil.institucion_id,
      rolActivo: perfil.rol_activo,
      activo: perfil.activo,
    },
    roles: perfil.activo ? roles : [],
    rolActivo: perfil.activo ? rolActivo : null,
    institucion,
    institucionLogo,
  }
})

/**
 * Destino después de iniciar sesión, sin modificar datos.
 * Nunca usa parámetros de la URL: no hay redirecciones abiertas.
 */
export function destinoSegunContexto(ctx: ContextoAuth): string {
  switch (ctx.estado) {
    case "sin_sesion":
      return "/login"
    case "sin_perfil":
      return "/completar-registro"
    case "con_perfil":
      if (!ctx.perfil.activo || ctx.roles.length === 0) return "/cuenta"
      if (ctx.roles.length === 1 && ctx.rolActivo === ctx.roles[0]) {
        return panelDeRol(ctx.rolActivo)
      }
      return "/seleccionar-rol"
  }
}

export type SesionPanel = Extract<ContextoAuth, { estado: "con_perfil" }> & {
  rolActivo: Role
}

/**
 * Protege un panel en el servidor: exige sesión, perfil activo, el rol asignado
 * y que ese rol sea el activo en la BD (si no, RLS aplicaría otro rol).
 */
export async function requerirPanel(rol: Role): Promise<SesionPanel> {
  const ctx = await obtenerContexto()

  if (ctx.estado === "sin_sesion") redirect("/login")
  if (ctx.estado === "sin_perfil") redirect("/completar-registro")
  if (!ctx.perfil.activo || ctx.roles.length === 0) redirect("/cuenta")
  if (!ctx.roles.includes(rol) || ctx.rolActivo !== rol) redirect("/seleccionar-rol")

  return { ...ctx, rolActivo: rol }
}

/**
 * Para acciones de servidor del administrador: id de su institución, o null.
 * Se obtiene del perfil en el servidor (nunca del navegador) y exige perfil
 * activo y rol admin activo. RLS vuelve a comprobarlo en la BD.
 */
export async function institucionDelAdmin(): Promise<string | null> {
  const ctx = await obtenerContexto()
  if (
    ctx.estado !== "con_perfil" ||
    !ctx.perfil.activo ||
    ctx.rolActivo !== "admin" ||
    !ctx.perfil.institucionId
  ) {
    return null
  }
  return ctx.perfil.institucionId
}

export function nombreCompleto(perfil: PerfilSesion) {
  return `${perfil.nombres} ${perfil.apellidos}`.trim()
}

/** Datos que muestra el panel (sidebar y encabezado) para la sesión real. */
export function usuarioDelPanel(sesion: SesionPanel): ShellUser {
  return {
    name: nombreCompleto(sesion.perfil),
    email: sesion.email ?? "",
    role: sesion.rolActivo,
    // El estudiante (V5) puede matricularse en varias instituciones: no se le
    // asocia una sola. Admin y docente trabajan en la institución de su perfil.
    institution:
      sesion.rolActivo === "estudiante"
        ? "Cuenta de estudiante"
        : (sesion.institucion ?? "Institución no disponible"),
    institutionLogo: sesion.rolActivo === "estudiante" ? null : sesion.institucionLogo,
    roles: sesion.roles,
  }
}
