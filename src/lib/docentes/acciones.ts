"use server"

import { revalidatePath } from "next/cache"

import { institucionDelAdmin } from "@/lib/auth/contexto"
import { esErrorDeRed } from "@/lib/registro/errores"
import { clienteAdministrativo } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import {
  datosDocenteSchema,
  idPerfilSchema,
  nuevoDocenteSchema,
  perfilParaGuardar,
} from "@/lib/validations/docente"

/**
 * Gestión de docentes de la institución del administrador.
 *
 * Autorización en dos capas:
 * 1. institucionDelAdmin(): sesión válida, perfil activo y rol admin ACTIVO; la
 *    institución sale del perfil en el servidor, nunca del navegador.
 * 2. Cada operación ordinaria (editar perfil, asignar o habilitar el rol) usa la
 *    sesión del administrador, así que RLS la vuelve a comprobar en la BD.
 *
 * El cliente administrativo (clave secreta, solo servidor) se usa únicamente
 * para lo que V5 no permite con la sesión: crear la cuenta de Auth, enviar la
 * invitación, crear el perfil inicial (perfiles no tiene política INSERT) y
 * cancelar una invitación nunca aceptada. Siempre tras la capa 1 y con el
 * institucion_id del servidor.
 */

export type ResultadoDocente =
  | { ok: true; id: string; aviso?: string }
  | {
      ok: false
      mensaje: string
      gravedad: "error" | "advertencia"
      campo?: "nombres" | "apellidos" | "dni" | "telefono" | "correo"
    }

type Fallo = Extract<ResultadoDocente, { ok: false }>
type Supabase = Awaited<ReturnType<typeof createClient>>

const SIN_PERMISO: Fallo = {
  ok: false,
  gravedad: "error",
  mensaje: "Tu sesión no tiene permiso de administrador. Vuelve a iniciar sesión.",
}
const SIN_CONFIGURAR: Fallo = {
  ok: false,
  gravedad: "advertencia",
  mensaje:
    "La creación de cuentas aún no está configurada en el servidor (falta la variable SUPABASE_SECRET_KEY). Consulta las instrucciones del módulo.",
}
const NO_ENCONTRADO: Fallo = {
  ok: false,
  gravedad: "error",
  mensaje: "El docente no existe o no pertenece a tu institución. Recarga la página.",
}
const DATOS_INVALIDOS: Fallo = { ok: false, gravedad: "error", mensaje: "Revisa los datos del docente." }
const DNI_DUPLICADO: Fallo = {
  ok: false,
  gravedad: "advertencia",
  campo: "dni",
  mensaje: "Ya existe otra persona de tu institución con ese documento.",
}

// ---------------------------------------------------------------------------
// Registrar docente (cuenta nueva + invitación)
// ---------------------------------------------------------------------------

export async function registrarDocente(datos: unknown): Promise<ResultadoDocente> {
  const institucionId = await institucionDelAdmin()
  if (!institucionId) return SIN_PERMISO

  const validacion = nuevoDocenteSchema.safeParse(datos)
  if (!validacion.success) return DATOS_INVALIDOS
  const { correo, ...resto } = validacion.data
  const perfil = perfilParaGuardar(resto)

  const admin = clienteAdministrativo()
  if (!admin) return SIN_CONFIGURAR

  const supabase = await createClient()
  if (perfil.dni && (await dniEnUso(supabase, institucionId, perfil.dni))) return DNI_DUPLICADO

  // 1. Cuenta de Auth SIN contraseña y SIN confirmar. createUser falla si el correo
  //    ya existe (confirmado o no): nunca se reutiliza ni se duplica una cuenta.
  const { data: creado, error: crearError } = await admin.auth.admin.createUser({
    email: correo,
    email_confirm: false,
    user_metadata: { nombres: perfil.nombres, apellidos: perfil.apellidos },
  })
  if (crearError || !creado.user) {
    if (crearError?.code === "email_exists" || crearError?.status === 422) {
      return {
        ok: false,
        gravedad: "advertencia",
        campo: "correo",
        mensaje:
          "Ya existe una cuenta con ese correo. Si es una persona de tu institución, asígnale el rol docente con «Asignar a un miembro».",
      }
    }
    return falloAuth(crearError)
  }
  const userId = creado.user.id

  // 2. Perfil de la institución (perfiles no tiene política INSERT: se crea en el servidor).
  const { error: perfilError } = await admin
    .from("perfiles")
    .insert({ id: userId, institucion_id: institucionId, ...perfil, rol_activo: null })
  if (perfilError) {
    await revertirCuenta(userId)
    return perfilError.code === "23505" ? DNI_DUPLICADO : falloBD(perfilError)
  }

  // 3. Rol docente con la sesión del administrador: RLS ("admin asigna roles") lo valida.
  const { error: rolError } = await supabase
    .from("usuario_roles")
    .insert({ perfil_id: userId, institucion_id: institucionId, rol: "docente" })
  if (rolError) {
    await revertirCuenta(userId)
    return falloBD(rolError)
  }

  // 4. Invitación: el docente abre el enlace y crea su propia contraseña.
  const { error: invitarError } = await admin.auth.admin.inviteUserByEmail(correo)
  revalidarDocentes(userId)
  if (invitarError) {
    console.error("[docentes] invitación", invitarError.code, invitarError.message)
    return {
      ok: true,
      id: userId,
      aviso: `El docente se registró, pero no se pudo enviar la invitación${invitarError.status === 429 ? " (límite de correos alcanzado)" : ""}. Usa «Reenviar invitación» más tarde.`,
    }
  }
  return { ok: true, id: userId }
}

// ---------------------------------------------------------------------------
// Asignar el rol docente a una persona que ya es de la institución
// ---------------------------------------------------------------------------

export async function asignarRolDocente(perfilId: unknown): Promise<ResultadoDocente> {
  const institucionId = await institucionDelAdmin()
  if (!institucionId) return SIN_PERMISO
  const id = idPerfilSchema.safeParse(perfilId)
  if (!id.success) return DATOS_INVALIDOS

  const supabase = await createClient()
  const { data: perfil, error } = await supabase
    .from("perfiles")
    .select("id, activo")
    .eq("id", id.data)
    .eq("institucion_id", institucionId)
    .maybeSingle()
  if (error) return falloBD(error)
  if (!perfil) return NO_ENCONTRADO
  if (!perfil.activo) {
    return { ok: false, gravedad: "advertencia", mensaje: "La cuenta de esa persona está desactivada." }
  }

  const { data: existente } = await supabase
    .from("usuario_roles")
    .select("activo")
    .eq("perfil_id", id.data)
    .eq("rol", "docente")
    .maybeSingle()
  const consulta = existente
    ? supabase.from("usuario_roles").update({ activo: true }).eq("perfil_id", id.data).eq("rol", "docente").eq("institucion_id", institucionId).select("perfil_id")
    : supabase.from("usuario_roles").insert({ perfil_id: id.data, institucion_id: institucionId, rol: "docente" }).select("perfil_id")
  const { data, error: rolError } = await consulta
  if (rolError) return rolError.code === "23505" ? { ok: true, id: id.data } : falloBD(rolError)
  if (!data?.length) return SIN_PERMISO

  revalidarDocentes(id.data)
  return { ok: true, id: id.data }
}

// ---------------------------------------------------------------------------
// Editar datos del perfil
// ---------------------------------------------------------------------------

export async function editarDocente(perfilId: unknown, datos: unknown): Promise<ResultadoDocente> {
  const institucionId = await institucionDelAdmin()
  if (!institucionId) return SIN_PERMISO
  const id = idPerfilSchema.safeParse(perfilId)
  const validacion = datosDocenteSchema.safeParse(datos)
  if (!id.success || !validacion.success) return DATOS_INVALIDOS

  const supabase = await createClient()
  if (!(await esDocente(supabase, institucionId, id.data))) return NO_ENCONTRADO

  const perfil = perfilParaGuardar(validacion.data)
  if (perfil.dni && (await dniEnUso(supabase, institucionId, perfil.dni, id.data))) return DNI_DUPLICADO

  const { data, error } = await supabase
    .from("perfiles")
    .update(perfil)
    .eq("id", id.data)
    .eq("institucion_id", institucionId)
    .select("id")
  if (error) return error.code === "23505" ? DNI_DUPLICADO : falloBD(error)
  if (!data?.length) return NO_ENCONTRADO

  revalidarDocentes(id.data)
  return { ok: true, id: id.data }
}

// ---------------------------------------------------------------------------
// Habilitar / deshabilitar el rol docente
// ---------------------------------------------------------------------------

/**
 * Cambia usuario_roles.activo del rol docente (no borra nada). Deshabilitado,
 * la persona no puede trabajar como docente; sus grupos conservan la asignación.
 */
export async function cambiarEstadoDocente(perfilId: unknown, activo: unknown): Promise<ResultadoDocente> {
  const institucionId = await institucionDelAdmin()
  if (!institucionId) return SIN_PERMISO
  const id = idPerfilSchema.safeParse(perfilId)
  if (!id.success || typeof activo !== "boolean") return DATOS_INVALIDOS

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("usuario_roles")
    .update({ activo })
    .eq("perfil_id", id.data)
    .eq("rol", "docente")
    .eq("institucion_id", institucionId)
    .select("perfil_id")
  if (error) return falloBD(error)
  if (!data?.length) return NO_ENCONTRADO

  revalidarDocentes(id.data)
  return { ok: true, id: id.data }
}

// ---------------------------------------------------------------------------
// Invitaciones
// ---------------------------------------------------------------------------

export async function reenviarInvitacion(perfilId: unknown): Promise<ResultadoDocente> {
  const institucionId = await institucionDelAdmin()
  if (!institucionId) return SIN_PERMISO
  const id = idPerfilSchema.safeParse(perfilId)
  if (!id.success) return DATOS_INVALIDOS
  const admin = clienteAdministrativo()
  if (!admin) return SIN_CONFIGURAR

  const supabase = await createClient()
  if (!(await esDocente(supabase, institucionId, id.data))) return NO_ENCONTRADO

  const { data, error } = await admin.auth.admin.getUserById(id.data)
  if (error || !data.user?.email) return falloAuth(error)
  if (data.user.email_confirmed_at) {
    return { ok: false, gravedad: "advertencia", mensaje: "Este docente ya activó su cuenta. Si olvidó su contraseña, puede recuperarla desde el inicio de sesión." }
  }

  const { error: invitarError } = await admin.auth.admin.inviteUserByEmail(data.user.email)
  if (invitarError) return falloAuth(invitarError)
  revalidarDocentes(id.data)
  return { ok: true, id: id.data }
}

/**
 * Elimina una cuenta invitada que NUNCA se activó, solo si la persona no tiene
 * otros roles ni grupos asignados (p. ej. correo mal escrito). Borrar la cuenta
 * de Auth elimina en cascada su perfil y su rol; no afecta a datos académicos.
 */
export async function cancelarInvitacion(perfilId: unknown): Promise<ResultadoDocente> {
  const institucionId = await institucionDelAdmin()
  if (!institucionId) return SIN_PERMISO
  const id = idPerfilSchema.safeParse(perfilId)
  if (!id.success) return DATOS_INVALIDOS
  const admin = clienteAdministrativo()
  if (!admin) return SIN_CONFIGURAR

  const supabase = await createClient()
  const [roles, grupos] = await Promise.all([
    supabase.from("usuario_roles").select("rol").eq("perfil_id", id.data).eq("institucion_id", institucionId),
    supabase.from("grupos").select("id", { count: "exact", head: true }).eq("docente_id", id.data).eq("institucion_id", institucionId),
  ])
  if (roles.error) return falloBD(roles.error)
  if (grupos.error) return falloBD(grupos.error)
  const lista = (roles.data ?? []).map((r) => r.rol as string)
  if (!lista.includes("docente")) return NO_ENCONTRADO
  if (lista.length > 1 || (grupos.count ?? 0) > 0) {
    return {
      ok: false,
      gravedad: "advertencia",
      mensaje: "No se puede cancelar: la persona tiene otros roles o grupos asignados. Deshabilita el rol docente en su lugar.",
    }
  }

  const { data, error } = await admin.auth.admin.getUserById(id.data)
  if (error || !data.user) return falloAuth(error)
  if (data.user.email_confirmed_at || data.user.last_sign_in_at) {
    return { ok: false, gravedad: "advertencia", mensaje: "El docente ya activó su cuenta; no se puede cancelar la invitación. Deshabilita el rol docente si ya no debe acceder." }
  }

  const { error: borrarError } = await admin.auth.admin.deleteUser(id.data)
  if (borrarError) return falloAuth(borrarError)
  revalidarDocentes()
  return { ok: true, id: id.data }
}

// ---------------------------------------------------------------------------
// Auxiliares
// ---------------------------------------------------------------------------

async function esDocente(supabase: Supabase, institucionId: string, perfilId: string) {
  const { data } = await supabase
    .from("usuario_roles")
    .select("perfil_id")
    .eq("perfil_id", perfilId)
    .eq("rol", "docente")
    .eq("institucion_id", institucionId)
  return (data?.length ?? 0) > 0
}

async function dniEnUso(supabase: Supabase, institucionId: string, dni: string, excluir?: string) {
  const { data } = await supabase
    .from("perfiles")
    .select("id")
    .eq("institucion_id", institucionId)
    .eq("dni", dni)
  return (data ?? []).some((p) => p.id !== excluir)
}

async function revertirCuenta(userId: string) {
  // Borrar la cuenta de Auth elimina en cascada el perfil y sus roles recién creados.
  const { error } = await clienteAdministrativo()!.auth.admin.deleteUser(userId)
  if (error) console.error("[docentes] revertir cuenta", error.code, error.message)
}

function falloAuth(error: { code?: string; status?: number; message: string } | null): Fallo {
  if (error && esErrorDeRed(error)) {
    return { ok: false, gravedad: "error", mensaje: "No se pudo conectar con el servidor. Inténtalo de nuevo." }
  }
  if (error) console.error("[docentes] auth", error.code, error.status, error.message)
  if (error?.status === 429 || error?.code === "over_email_send_rate_limit") {
    return { ok: false, gravedad: "advertencia", mensaje: "Se alcanzó el límite de correos de Supabase. Inténtalo más tarde." }
  }
  if (error?.status === 401 || error?.status === 403) {
    return { ok: false, gravedad: "error", mensaje: "La clave del servidor no es válida o no tiene permisos para gestionar cuentas." }
  }
  return { ok: false, gravedad: "error", mensaje: "No se pudo completar la operación con la cuenta del docente. Inténtalo de nuevo." }
}

function falloBD(error: { code?: string; message: string }): Fallo {
  if (esErrorDeRed(error)) {
    return { ok: false, gravedad: "error", mensaje: "No se pudo conectar con el servidor. Inténtalo de nuevo." }
  }
  console.error("[docentes] BD", error.code, error.message)
  switch (error.code) {
    case "23505":
      return { ok: false, gravedad: "advertencia", mensaje: "Ya existe un registro con esos datos." }
    case "23514":
      return { ok: false, gravedad: "error", mensaje: "Algún dato no cumple las reglas: nombres y apellidos no pueden quedar vacíos." }
    case "42501":
      return { ok: false, gravedad: "error", mensaje: "No tienes permiso para gestionar los docentes de esta institución." }
    default:
      return { ok: false, gravedad: "error", mensaje: "No se pudo guardar. Inténtalo de nuevo en unos minutos." }
  }
}

function revalidarDocentes(perfilId?: string) {
  revalidatePath("/admin/docentes")
  if (perfilId) revalidatePath(`/admin/docentes/${perfilId}`)
  revalidatePath("/admin") // resumen: docentes activos
}
