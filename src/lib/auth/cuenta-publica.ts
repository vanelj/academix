import type { PublicAccount } from "@/academix/types"
import { roleConfig } from "@/config/navigation"
import type { ContextoAuth } from "@/lib/auth/contexto"
import { panelDeRol } from "@/lib/auth/roles"

const ACCESO_PANEL = {
  estudiante: "Mi panel de estudiante",
  docente: "Mi panel docente",
  admin: "Panel de administración",
} as const

/**
 * Lo que la cabecera pública muestra de la sesión (solo nombre, rol y enlace a su
 * panel; ningún dato privado). null = visitante sin sesión.
 */
export function cuentaPublica(ctx: ContextoAuth): PublicAccount | null {
  if (ctx.estado === "sin_sesion") return null
  if (ctx.estado === "sin_perfil") {
    return { name: ctx.email ?? "Tu cuenta", roleLabel: "Registro pendiente", panelHref: "/completar-registro", panelLabel: "Completar registro" }
  }
  const nombre = `${ctx.perfil.nombres} ${ctx.perfil.apellidos}`.trim() || ctx.email || "Tu cuenta"
  if (!ctx.rolActivo) return { name: nombre, roleLabel: "Sin rol activo", panelHref: "/acceso", panelLabel: "Ir a mi cuenta" }
  return { name: nombre, roleLabel: roleConfig[ctx.rolActivo].label, panelHref: panelDeRol(ctx.rolActivo), panelLabel: ACCESO_PANEL[ctx.rolActivo] }
}
