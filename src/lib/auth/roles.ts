import { roleConfig, type Role } from "@/config/navigation"

/** Roles que la aplicación sabe atender (catálogo public.roles de la BD). */
export const ROLES: readonly Role[] = ["admin", "docente", "estudiante"]

export function esRol(valor: unknown): valor is Role {
  return typeof valor === "string" && (ROLES as readonly string[]).includes(valor)
}

/** Ruta del panel de cada rol (/admin, /docente, /estudiante). */
export function panelDeRol(rol: Role): string {
  return roleConfig[rol].basePath
}
