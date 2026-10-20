import type { Role } from "@/config/navigation"

export type ShellUser = {
  name: string
  email: string
  role: Role
  institution: string
  /** Logo de la institución (instituciones.logo_url), si existe. */
  institutionLogo?: string | null
  /** Roles asignados a la cuenta; con más de uno se ofrece "Cambiar rol". */
  roles?: Role[]
}

/**
 * Datos TEMPORALES de demostración para visualizar la plantilla.
 * Se reemplazarán por el usuario autenticado cuando exista el login.
 */
export const demoUsers: Record<Role, ShellUser> = {
  admin: {
    name: "Usuario Demo",
    email: "admin.demo@institucion.edu",
    role: "admin",
    institution: "Institución de demostración",
  },
  docente: {
    name: "Docente Demo",
    email: "docente.demo@institucion.edu",
    role: "docente",
    institution: "Institución de demostración",
  },
  estudiante: {
    name: "Estudiante Demo",
    email: "estudiante.demo@institucion.edu",
    role: "estudiante",
    institution: "Institución de demostración",
  },
}
