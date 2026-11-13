"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { datosInvitacion, MARCA_ACTIVACION } from "@/lib/auth/activacion"
import { institucionDelAdmin, obtenerContexto } from "@/lib/auth/contexto"
import { opcionesInvitacion } from "@/lib/auth/invitacion"
import { ETIQUETA_MODULO, normalizarModulos } from "@/lib/admin/permisos"
import { esErrorDeRed } from "@/lib/registro/errores"
import { clienteAdministrativo } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

/**
 * Equipo administrativo (mismo perfil Administrador, dos niveles).
 * Capa 1 (servidor): institucionDelAdmin("equipo") exige ser PRINCIPAL activo.
 * Capa 2 (BD, administracion_v5): las RPC gestionar_administrador,
 * cambiar_acceso_administrador y nombrar_principal repiten las reglas
 * (nunca sobre sí mismo, nunca sin principal) y la política restrictiva de
 * usuario_roles impide que un secundario asigne el rol admin.
 * La invitación reutiliza el mismo flujo de activación que los docentes.
 */

export type ResultadoEquipo = { ok: true; aviso?: string } | { ok: false; mensaje: string; campo?: "correo" | "nombres" | "apellidos" }

const SIN_PERMISO = { ok: false as const, mensaje: "Solo el administrador principal puede gestionar el equipo administrativo." }
const PENDIENTE = { ok: false as const, mensaje: "El equipo administrativo aún no está habilitado (falta la actualización «administracion_v5»)." }
const FUNCION_INEXISTENTE = new Set(["PGRST202", "42883"])

const permisos = z.object({ accesoTotal: z.boolean(), modulos: z.array(z.string()).max(10) })
const invitacion = permisos.extend({
  nombres: z.string().trim().min(1, "Escribe los nombres.").max(80),
  apellidos: z.string().trim().min(1, "Escribe los apellidos.").max(80),
  correo: z.string().trim().toLowerCase().max(254).pipe(z.email("Correo no válido.")),
})

async function principal() {
  const institucionId = await institucionDelAdmin("equipo")
  if (!institucionId) return null
  const ctx = await obtenerContexto()
  return ctx.estado === "con_perfil" ? { institucionId, userId: ctx.userId, institucion: ctx.institucion } : null
}

/** Texto del nivel de acceso para el correo de invitación. */
function nivelTexto(accesoTotal: boolean, modulos: unknown): string {
  return accesoTotal ? "Acceso completo (administrador secundario)" : `Administrador secundario · ${normalizarModulos(modulos).map((m) => ETIQUETA_MODULO[m].titulo).join(", ")}`
}

function falloRpc(error: { code?: string; message: string }) {
  if (FUNCION_INEXISTENTE.has(error.code ?? "")) return PENDIENTE
  if (esErrorDeRed(error)) return { ok: false as const, mensaje: "No se pudo conectar con el servidor. Inténtalo de nuevo." }
  console.error("[equipo] rpc", error.code, error.message)
  const m = error.message ?? ""
  if (/propios|propio/i.test(m)) return { ok: false as const, mensaje: "No puedes cambiar tu propio acceso ni tus permisos." }
  if (/sin un administrador principal/i.test(m)) return { ok: false as const, mensaje: "La institución no puede quedarse sin un administrador principal activo." }
  if (/al menos un módulo/i.test(m)) return { ok: false as const, mensaje: "Elige al menos un módulo o el acceso completo." }
  if (/principal ya tiene/i.test(m)) return { ok: false as const, mensaje: "Un administrador principal ya tiene acceso completo." }
  if (error.code === "42501") return SIN_PERMISO
  return { ok: false as const, mensaje: "No se pudo guardar el cambio. Inténtalo de nuevo." }
}

async function aplicarPermisos(perfilId: string, accesoTotal: boolean, modulos: unknown) {
  const supabase = await createClient()
  return supabase.rpc("gestionar_administrador", { p_perfil: perfilId, p_acceso_total: accesoTotal, p_modulos: accesoTotal ? [] : normalizarModulos(modulos) })
}

/** Invita a una persona NUEVA como administradora secundaria (cuenta sin contraseña hasta activarla). */
export async function invitarAdministrador(datos: unknown): Promise<ResultadoEquipo> {
  const p = await principal()
  if (!p) return SIN_PERMISO
  const v = invitacion.safeParse(datos)
  if (!v.success) {
    const e = v.error.issues[0]
    return { ok: false, mensaje: e?.message ?? "Revisa los datos.", campo: (e?.path[0] as "correo" | "nombres" | "apellidos" | undefined) }
  }
  if (!v.data.accesoTotal && normalizarModulos(v.data.modulos).length === 0) return { ok: false, mensaje: "Elige al menos un módulo o el acceso completo." }
  const admin = clienteAdministrativo()
  if (!admin) return { ok: false, mensaje: "La creación de cuentas aún no está configurada en el servidor (SUPABASE_SECRET_KEY)." }
  const supabase = await createClient()

  // Comprobar antes que la migración esté aplicada: no crear cuentas que luego no se puedan configurar.
  const prueba = await supabase.from("administradores_institucion").select("perfil_id").limit(1)
  if (prueba.error) return prueba.error.code === "42P01" || prueba.error.code === "PGRST205" ? PENDIENTE : falloRpc(prueba.error)

  const { data: creado, error: crearError } = await admin.auth.admin.createUser({
    email: v.data.correo,
    email_confirm: false,
    user_metadata: { nombres: v.data.nombres, apellidos: v.data.apellidos, ...datosInvitacion("admin", p.institucion, nivelTexto(v.data.accesoTotal, v.data.modulos)) },
    app_metadata: { [MARCA_ACTIVACION]: true },
  })
  if (crearError || !creado.user) {
    if (crearError?.code === "email_exists" || crearError?.status === 422) {
      return { ok: false, campo: "correo", mensaje: "Ya existe una cuenta con ese correo. Si es una persona de tu institución, usa «Añadir a un miembro»." }
    }
    console.error("[equipo] crear cuenta", crearError?.code, crearError?.message)
    return { ok: false, mensaje: "No se pudo crear la cuenta. Inténtalo de nuevo." }
  }
  const userId = creado.user.id
  const revertir = async () => {
    const { error } = await admin.auth.admin.deleteUser(userId)
    if (error) console.error("[equipo] revertir cuenta", error.code, error.message)
  }

  const { error: perfilError } = await admin.from("perfiles").insert({ id: userId, institucion_id: p.institucionId, nombres: v.data.nombres, apellidos: v.data.apellidos, rol_activo: null })
  if (perfilError) {
    await revertir()
    console.error("[equipo] perfil", perfilError.code, perfilError.message)
    return { ok: false, mensaje: "No se pudo crear el perfil. Inténtalo de nuevo." }
  }
  // Rol admin con la sesión del principal: la política restrictiva lo exige en la BD.
  const { error: rolError } = await supabase.from("usuario_roles").insert({ perfil_id: userId, institucion_id: p.institucionId, rol: "admin" })
  if (rolError) {
    await revertir()
    return falloRpc(rolError)
  }
  const { error: permisosError } = await aplicarPermisos(userId, v.data.accesoTotal, v.data.modulos)
  if (permisosError) {
    await revertir()
    return falloRpc(permisosError)
  }
  const { error: invitarError } = await admin.auth.admin.inviteUserByEmail(v.data.correo, await opcionesInvitacion())
  revalidatePath("/admin/equipo")
  if (invitarError) {
    console.error("[equipo] invitación", invitarError.code, invitarError.message)
    return { ok: true, aviso: "El administrador se registró, pero no se pudo enviar la invitación. Usa «Reenviar invitación» más tarde." }
  }
  return { ok: true }
}

/** Da el rol administrador (secundario) a una persona que ya pertenece a la institución. */
export async function anadirAdministrador(perfilId: unknown, datos: unknown): Promise<ResultadoEquipo> {
  const p = await principal()
  if (!p) return SIN_PERMISO
  const id = z.uuid().safeParse(perfilId)
  const v = permisos.safeParse(datos)
  if (!id.success || !v.success) return { ok: false, mensaje: "Revisa los datos." }
  if (id.data === p.userId) return { ok: false, mensaje: "Ya eres administrador." }
  if (!v.data.accesoTotal && normalizarModulos(v.data.modulos).length === 0) return { ok: false, mensaje: "Elige al menos un módulo o el acceso completo." }
  const supabase = await createClient()
  const { data: perfil } = await supabase.from("perfiles").select("id, activo").eq("id", id.data).eq("institucion_id", p.institucionId).maybeSingle()
  if (!perfil?.activo) return { ok: false, mensaje: "La persona no pertenece a tu institución o está desactivada." }
  const { error: rolError } = await supabase.from("usuario_roles").insert({ perfil_id: id.data, institucion_id: p.institucionId, rol: "admin" })
  if (rolError && rolError.code !== "23505") return falloRpc(rolError)
  const { error } = await aplicarPermisos(id.data, v.data.accesoTotal, v.data.modulos)
  if (error) return falloRpc(error)
  revalidatePath("/admin/equipo")
  return { ok: true }
}

export async function actualizarPermisos(perfilId: unknown, datos: unknown): Promise<ResultadoEquipo> {
  const p = await principal()
  if (!p) return SIN_PERMISO
  const id = z.uuid().safeParse(perfilId)
  const v = permisos.safeParse(datos)
  if (!id.success || !v.success) return { ok: false, mensaje: "Revisa los datos." }
  if (id.data === p.userId) return { ok: false, mensaje: "No puedes cambiar tus propios permisos." }
  const { error } = await aplicarPermisos(id.data, v.data.accesoTotal, v.data.modulos)
  if (error) return falloRpc(error)
  revalidatePath("/admin/equipo")
  return { ok: true }
}

export async function cambiarAccesoAdministrador(perfilId: unknown, activo: unknown): Promise<ResultadoEquipo> {
  const p = await principal()
  if (!p) return SIN_PERMISO
  const id = z.uuid().safeParse(perfilId)
  if (!id.success || typeof activo !== "boolean") return { ok: false, mensaje: "Solicitud no válida." }
  if (id.data === p.userId) return { ok: false, mensaje: "No puedes cambiar tu propio acceso." }
  const supabase = await createClient()
  const { error } = await supabase.rpc("cambiar_acceso_administrador", { p_perfil: id.data, p_activo: activo })
  if (error) return falloRpc(error)
  revalidatePath("/admin/equipo")
  return { ok: true }
}

export async function cambiarNivelAdministrador(perfilId: unknown, principalNuevo: unknown): Promise<ResultadoEquipo> {
  const p = await principal()
  if (!p) return SIN_PERMISO
  const id = z.uuid().safeParse(perfilId)
  if (!id.success || typeof principalNuevo !== "boolean") return { ok: false, mensaje: "Solicitud no válida." }
  if (id.data === p.userId) return { ok: false, mensaje: "No puedes cambiar tu propio nivel." }
  const supabase = await createClient()
  const { error } = await supabase.rpc("nombrar_principal", { p_perfil: id.data, p_principal: principalNuevo })
  if (error) return falloRpc(error)
  revalidatePath("/admin/equipo")
  return { ok: true }
}

/** Reenvía la invitación a un administrador que aún no activó su cuenta. */
export async function reenviarInvitacionAdministrador(perfilId: unknown): Promise<ResultadoEquipo> {
  const p = await principal()
  if (!p) return SIN_PERMISO
  const id = z.uuid().safeParse(perfilId)
  if (!id.success) return { ok: false, mensaje: "Solicitud no válida." }
  const admin = clienteAdministrativo()
  if (!admin) return { ok: false, mensaje: "La gestión de cuentas no está configurada en el servidor." }
  const supabase = await createClient()
  const { data: fila } = await supabase.from("administradores_institucion").select("perfil_id, principal, acceso_total, modulos").eq("perfil_id", id.data).eq("institucion_id", p.institucionId).maybeSingle()
  if (!fila) return { ok: false, mensaje: "La persona no es administradora de tu institución." }
  const { data, error } = await admin.auth.admin.getUserById(id.data)
  if (error || !data.user?.email) return { ok: false, mensaje: "No se pudo consultar la cuenta." }
  if (data.user.email_confirmed_at) {
    return { ok: false, mensaje: data.user.app_metadata?.[MARCA_ACTIVACION] === true
      ? "Ya abrió su invitación pero no creó su contraseña: que use «¿Olvidaste tu contraseña?» con su correo."
      : "Esta cuenta ya está activada." }
  }
  // El correo muestra la institución y el nivel ACTUALES, leídos del servidor.
  const nivel = fila.principal ? "Administrador principal (acceso completo)" : nivelTexto(Boolean(fila.acceso_total), fila.modulos)
  const { error: metaError } = await admin.auth.admin.updateUserById(id.data, {
    user_metadata: { ...(data.user.user_metadata ?? {}), ...datosInvitacion("admin", p.institucion, nivel) },
  })
  if (metaError) console.error("[equipo] datos de invitación", metaError.code, metaError.message)
  const { error: invitarError } = await admin.auth.admin.inviteUserByEmail(data.user.email, await opcionesInvitacion())
  if (invitarError) {
    console.error("[equipo] reenviar", invitarError.code, invitarError.message)
    return { ok: false, mensaje: invitarError.status === 429 ? "Se alcanzó el límite de correos. Inténtalo más tarde." : "No se pudo reenviar la invitación." }
  }
  return { ok: true }
}
