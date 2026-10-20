"use server"

import { revalidatePath } from "next/cache"

import { destinoSegunContexto, obtenerContexto } from "@/lib/auth/contexto"
import { panelDeRol } from "@/lib/auth/roles"
import { esErrorDeRed } from "@/lib/registro/errores"
import { createClient } from "@/lib/supabase/server"
import { estudianteSchema } from "@/lib/validations/estudiante"

/**
 * Incorporación de una cuenta autenticada SIN perfil (p. ej. primer acceso con
 * Google) como ESTUDIANTE, con la RPC V5 registrar_estudiante().
 *
 * La RPC decide en la BD: exige sesión real (no anónima), que la cuenta no tenga
 * perfil y crea solo el rol estudiante global. Nunca concede admin ni docente.
 */
export type ResultadoIncorporacion =
  | { ok: true; destino: string }
  | { ok: false; mensaje: string; campo?: "dni" }

export async function registrarEstudiante(datos: unknown): Promise<ResultadoIncorporacion> {
  const ctx = await obtenerContexto()
  if (ctx.estado === "sin_sesion") return { ok: true, destino: "/login" }
  // Ya tiene perfil (otra pestaña, doble envío): se sigue al destino normal.
  if (ctx.estado === "con_perfil") return { ok: true, destino: destinoSegunContexto(ctx) }

  const validacion = estudianteSchema.safeParse(datos)
  if (!validacion.success) return { ok: false, mensaje: "Revisa los datos del formulario." }
  const v = validacion.data

  const supabase = await createClient()
  const { error } = await supabase.rpc("registrar_estudiante", {
    p_nombres: v.nombres.replace(/\s+/g, " "),
    p_apellidos: v.apellidos.replace(/\s+/g, " "),
    p_dni: v.dni === "" ? null : v.dni.toUpperCase(),
    p_telefono: v.telefono === "" ? null : v.telefono,
  })

  if (error) {
    if (esErrorDeRed(error)) return { ok: false, mensaje: "No se pudo conectar con el servidor. Inténtalo de nuevo." }
    console.error("[incorporacion] registrar_estudiante", error.code, error.message)
    if (/ya tiene un perfil/i.test(error.message)) {
      return { ok: true, destino: "/acceso" }
    }
    if (/sesión|verificada/i.test(error.message)) {
      return { ok: false, mensaje: "Tu sesión no es válida. Cierra sesión y vuelve a ingresar." }
    }
    if (error.code === "23505") {
      return { ok: false, campo: "dni", mensaje: "Ese documento ya está registrado en otra cuenta." }
    }
    return { ok: false, mensaje: "No se pudo crear tu cuenta de estudiante. Inténtalo de nuevo en unos minutos." }
  }

  revalidatePath("/", "layout")
  return { ok: true, destino: panelDeRol("estudiante") }
}
