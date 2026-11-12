"use server"

import { revalidatePath } from "next/cache"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { destinoSegunContexto, obtenerContexto } from "@/lib/auth/contexto"
import { activacionPendiente, MARCA_ACTIVACION, sesionDeInvitacion } from "@/lib/auth/activacion"
import { ponerMarcaContrasena, usuarioEnActivacion } from "@/lib/auth/enlaces"
import {
  clasificarErrorAuth,
  MENSAJES_AUTH,
  registrarErrorAuth,
} from "@/lib/auth/errores-auth"
import { COOKIE_RECUPERACION } from "@/lib/auth/recuperacion"
import { retornoSeguro } from "@/lib/auth/retorno"
import { esRol, panelDeRol } from "@/lib/auth/roles"
import { mensajeErrorRegistro } from "@/lib/registro/errores"
import {
  CLAVE_REGISTRO_PENDIENTE,
  datosRegistroSchema,
  parametrosRegistrarInstitucion,
} from "@/lib/registro/pendiente"
import { clienteAdministrativo } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { restablecerSchema } from "@/lib/validations/contrasena"

/**
 * Acciones de servidor de autenticación. Cada una vuelve a comprobar la sesión
 * en el servidor (no depende de proxy.ts ni de datos del navegador) y la BD
 * vuelve a validar los permisos en sus RPC.
 */

export type ResultadoDestino =
  | { ok: true; destino: string }
  | { ok: false; mensaje: string }

/**
 * Se llama justo después de signInWithPassword. Decide el destino según el perfil
 * y los roles reales. Si la cuenta tiene un solo rol y no es el activo, lo activa
 * con seleccionar_rol() para que RLS aplique el rol correcto.
 * `retorno` (opcional): curso del catálogo al que volver. Solo se usa si el
 * destino es el panel de estudiante y es una ruta interna válida del catálogo.
 */
export async function destinoTrasLogin(retorno?: unknown): Promise<ResultadoDestino> {
  const r = await destinoBase()
  const volver = retornoSeguro(retorno)
  return r.ok && volver && r.destino === panelDeRol("estudiante") ? { ok: true, destino: volver } : r
}

async function destinoBase(): Promise<ResultadoDestino> {
  const ctx = await obtenerContexto()

  if (ctx.estado === "sin_sesion") {
    return { ok: false, mensaje: "No se pudo iniciar la sesión. Inténtalo de nuevo." }
  }

  if (ctx.estado === "con_perfil" && !ctx.perfil.activo) {
    // Una cuenta desactivada no debe conservar la sesión.
    const supabase = await createClient()
    await supabase.auth.signOut()
    return {
      ok: false,
      mensaje: "Tu cuenta está desactivada. Comunícate con tu institución.",
    }
  }

  if (ctx.estado === "con_perfil" && ctx.roles.length === 1 && ctx.rolActivo !== ctx.roles[0]) {
    const rol = ctx.roles[0]
    const supabase = await createClient()
    const { error } = await supabase.rpc("seleccionar_rol", { p_rol: rol })
    if (error) {
      console.error("[auth] seleccionar_rol", error.code, error.message)
      return { ok: true, destino: "/seleccionar-rol" }
    }
    return { ok: true, destino: panelDeRol(rol) }
  }

  return { ok: true, destino: destinoSegunContexto(ctx) }
}

export type EstadoAccion = { mensaje: string } | null

/** Activa uno de los roles asignados y lleva a su panel. */
export async function elegirRol(_previo: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  const rol = formData.get("rol")
  const ctx = await obtenerContexto()

  if (ctx.estado === "sin_sesion") redirect("/login")
  if (ctx.estado !== "con_perfil" || !ctx.perfil.activo) redirect("/cuenta")

  // Primera barrera en la app; la segunda (definitiva) es seleccionar_rol() en la BD.
  if (!esRol(rol) || !ctx.roles.includes(rol)) {
    return { mensaje: "No tienes asignado ese rol." }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc("seleccionar_rol", { p_rol: rol })
  if (error) {
    console.error("[auth] seleccionar_rol", error.code, error.message)
    return { mensaje: "No se pudo activar el rol. Inténtalo de nuevo." }
  }

  revalidatePath("/", "layout")
  redirect(panelDeRol(rol))
}

/** Completa el registro institucional pendiente con la RPC registrar_institucion(). */
export async function completarRegistro(datos: unknown): Promise<ResultadoDestino> {
  const ctx = await obtenerContexto()
  if (ctx.estado === "sin_sesion") return { ok: true, destino: "/login" }
  if (ctx.estado === "con_perfil") return { ok: true, destino: destinoSegunContexto(ctx) }

  const validacion = datosRegistroSchema.safeParse(datos)
  if (!validacion.success) {
    return { ok: false, mensaje: "Revisa los datos del formulario." }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc(
    "registrar_institucion",
    parametrosRegistrarInstitucion(validacion.data)
  )

  if (error) {
    return { ok: false, mensaje: mensajeErrorRegistro(error) }
  }

  // Ya existe el perfil: el registro pendiente deja de ser necesario.
  const { error: limpiarError } = await supabase.auth.updateUser({
    data: { [CLAVE_REGISTRO_PENDIENTE]: null },
  })
  if (limpiarError) console.error("[registro] no se pudo limpiar el pendiente", limpiarError.code)

  revalidatePath("/", "layout")
  return { ok: true, destino: panelDeRol("admin") }
}

export async function cerrarSesion(): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.auth.signOut()
  if (error) console.error("[auth] signOut", error.code, error.message)
  revalidatePath("/", "layout")
  redirect("/login")
}


export type ResultadoContrasena = { ok: true } | { ok: false; mensaje: string; vencido?: boolean }

/**
 * Cambia la contraseña con updateUser(). Solo con una sesión de recuperación
 * válida (enlace verificado en /auth/restablecer o /auth/activar) o con la
 * activación pendiente. Si la cuenta tenía la marca activacion_pendiente, se
 * quita (solo de ESTA cuenta, con la clave secreta en el servidor). Al terminar
 * cierra la sesión para que la persona entre con la contraseña nueva.
 */
export async function actualizarContrasena(datos: unknown): Promise<ResultadoContrasena> {
  const userId = await usuarioEnActivacion()
  if (!userId) {
    return { ok: false, mensaje: MENSAJES_AUTH.sesionVencida, vencido: true }
  }

  const validacion = restablecerSchema.safeParse(datos)
  if (!validacion.success) {
    return { ok: false, mensaje: "Revisa los datos del formulario." }
  }

  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const pendiente = activacionPendiente(claimsData?.claims)
  const admin = pendiente ? clienteAdministrativo() : null
  if (pendiente) {
    // Primero se quita la marca: si falla, nada cambió y se puede reintentar.
    if (!admin) return { ok: false, mensaje: MENSAJES_AUTH.servicio }
    const { error: marcaError } = await admin.auth.admin.updateUserById(userId, {
      app_metadata: { [MARCA_ACTIVACION]: null },
    })
    if (marcaError) {
      registrarErrorAuth("quitar-marca-activacion", marcaError)
      return { ok: false, mensaje: MENSAJES_AUTH.servicio }
    }
  }

  const { error } = await supabase.auth.updateUser({ password: validacion.data.password })

  if (error) {
    if (admin) {
      // La contraseña no se guardó: la cuenta sigue pendiente de activar.
      const { error: restaurarError } = await admin.auth.admin.updateUserById(userId, {
        app_metadata: { [MARCA_ACTIVACION]: true },
      })
      if (restaurarError) registrarErrorAuth("restaurar-marca-activacion", restaurarError)
    }
    registrarErrorAuth("actualizar-contrasena", error)
    switch (clasificarErrorAuth(error)) {
      case "contrasena_debil":
        return { ok: false, mensaje: MENSAJES_AUTH.contrasenaDebil }
      case "misma_contrasena":
        return { ok: false, mensaje: MENSAJES_AUTH.mismaContrasena }
      case "sesion_vencida":
        return { ok: false, mensaje: MENSAJES_AUTH.sesionVencida, vencido: true }
      case "limite":
        return { ok: false, mensaje: MENSAJES_AUTH.limite }
      case "servicio":
        return { ok: false, mensaje: MENSAJES_AUTH.servicio }
      default:
        return { ok: false, mensaje: MENSAJES_AUTH.generico }
    }
  }

  const almacen = await cookies()
  almacen.delete(COOKIE_RECUPERACION)
  const { error: salirError } = await supabase.auth.signOut()
  if (salirError) registrarErrorAuth("salir-tras-restablecer", salirError)

  revalidatePath("/", "layout")
  return { ok: true }
}

/**
 * Invitación con la plantilla predeterminada de Supabase (flujo implícito): el
 * navegador ya guardó la sesión del fragmento #access_token. Aquí el servidor
 * valida esa sesión (firma del JWT) y solo pone la marca para crear contraseña
 * si la sesión salió de un enlace de invitación reciente o la cuenta tiene la
 * activación pendiente. No concede roles ni cambia datos.
 */
export async function confirmarSesionInvitacion(): Promise<{ ok: boolean }> {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getClaims()
  const claims = data?.claims
  if (error || !claims?.sub) return { ok: false }
  if (!sesionDeInvitacion(claims) && !activacionPendiente(claims)) return { ok: false }
  await ponerMarcaContrasena(claims.sub)
  return { ok: true }
}
