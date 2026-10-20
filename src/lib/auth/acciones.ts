"use server"

import { revalidatePath } from "next/cache"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { destinoSegunContexto, obtenerContexto } from "@/lib/auth/contexto"
import { usuarioEnRecuperacion } from "@/lib/auth/enlaces"
import {
  clasificarErrorAuth,
  MENSAJES_AUTH,
  registrarErrorAuth,
} from "@/lib/auth/errores-auth"
import { COOKIE_RECUPERACION } from "@/lib/auth/recuperacion"
import { esRol, panelDeRol } from "@/lib/auth/roles"
import { mensajeErrorRegistro } from "@/lib/registro/errores"
import {
  CLAVE_REGISTRO_PENDIENTE,
  datosRegistroSchema,
  parametrosRegistrarInstitucion,
} from "@/lib/registro/pendiente"
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
 */
export async function destinoTrasLogin(): Promise<ResultadoDestino> {
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
 * válida (enlace verificado en /auth/restablecer). Al terminar cierra la sesión
 * para que la persona vuelva a entrar con la contraseña nueva.
 */
export async function actualizarContrasena(datos: unknown): Promise<ResultadoContrasena> {
  if (!(await usuarioEnRecuperacion())) {
    return { ok: false, mensaje: MENSAJES_AUTH.sesionVencida, vencido: true }
  }

  const validacion = restablecerSchema.safeParse(datos)
  if (!validacion.success) {
    return { ok: false, mensaje: "Revisa los datos del formulario." }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ password: validacion.data.password })

  if (error) {
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
