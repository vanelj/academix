/**
 * Sincronización de las plantillas de Supabase Auth desde el repositorio
 * (SOLO herramientas de desarrollo: scripts/correos.ts; nunca la app ni el navegador).
 *
 * API oficial: Supabase Management API
 *   GET   https://api.supabase.com/v1/projects/{ref}/config/auth
 *   PATCH https://api.supabase.com/v1/projects/{ref}/config/auth   (cambios parciales)
 * con un token de acceso personal (SUPABASE_ACCESS_TOKEN) en .env.herramientas.
 *
 * Seguridad:
 *  - El PATCH solo puede llevar las 8 claves de asunto y contenido de la lista
 *    blanca: nunca SMTP, confirmación obligatoria, URLs ni proveedores.
 *  - Solo se envían las claves que DIFIEREN de lo remoto.
 *  - Nunca se imprime el token; los errores se resumen sin datos sensibles.
 */

import { createHash } from "node:crypto"

import type { PlantillaAuth } from "@/lib/correos/auth"

export const API_GESTION = "https://api.supabase.com/v1"

/** Archivo local → claves de la configuración de Auth (Management API). */
export const CAMPOS_AUTH: Record<string, { asunto: string; contenido: string }> = {
  "invitacion.html": { asunto: "mailer_subjects_invite", contenido: "mailer_templates_invite_content" },
  "recuperacion.html": { asunto: "mailer_subjects_recovery", contenido: "mailer_templates_recovery_content" },
  "confirmacion.html": { asunto: "mailer_subjects_confirmation", contenido: "mailer_templates_confirmation_content" },
  "cambio-correo.html": { asunto: "mailer_subjects_email_change", contenido: "mailer_templates_email_change_content" },
}

export const CLAVES_PERMITIDAS: ReadonlySet<string> = new Set(Object.values(CAMPOS_AUTH).flatMap((c) => [c.asunto, c.contenido]))

/** Configuraciones que el script LEE para informar (nunca las envía). */
export const CLAVES_INFORMATIVAS = ["smtp_host", "smtp_admin_email", "smtp_sender_name", "mailer_autoconfirm", "site_url"] as const

export type Cambio = { archivo: string; panel: string; clave: string; tipo: "asunto" | "contenido"; antes: string; despues: string }

const normalizar = (s: unknown) => (typeof s === "string" ? s.replace(/\r\n/g, "\n").trim() : "")

export const huella = (s: string) => createHash("sha256").update(normalizar(s)).digest("hex").slice(0, 12)

/** Qué hay que actualizar: solo lo que difiere (ignorando finales de línea y espacios extremos). */
export function planSincronizacion(plantillas: PlantillaAuth[], remoto: Record<string, unknown>): Cambio[] {
  const cambios: Cambio[] = []
  for (const p of plantillas) {
    const campos = CAMPOS_AUTH[p.archivo]
    if (!campos) throw new Error(`Plantilla sin correspondencia en Supabase: ${p.archivo}`)
    if (normalizar(remoto[campos.asunto]) !== normalizar(p.asunto)) {
      cambios.push({ archivo: p.archivo, panel: p.panel, clave: campos.asunto, tipo: "asunto", antes: normalizar(remoto[campos.asunto]), despues: p.asunto })
    }
    if (normalizar(remoto[campos.contenido]) !== normalizar(p.html)) {
      cambios.push({ archivo: p.archivo, panel: p.panel, clave: campos.contenido, tipo: "contenido", antes: normalizar(remoto[campos.contenido]), despues: p.html })
    }
  }
  return cambios
}

/** Cuerpo del PATCH: SOLO claves de la lista blanca (si no, error y no se envía nada). */
export function cuerpoParche(cambios: Cambio[]): Record<string, string> {
  const cuerpo: Record<string, string> = {}
  for (const c of cambios) {
    if (!CLAVES_PERMITIDAS.has(c.clave)) throw new Error(`Clave no permitida en la sincronización: ${c.clave}`)
    cuerpo[c.clave] = c.despues
  }
  return cuerpo
}

/** Referencia del proyecto: SUPABASE_PROJECT_REF o el subdominio de NEXT_PUBLIC_SUPABASE_URL. */
export function referenciaProyecto(entorno: Record<string, string | undefined>): string | null {
  const directa = entorno.SUPABASE_PROJECT_REF?.trim()
  if (directa) return /^[a-z0-9]{20}$/.test(directa) ? directa : null
  try {
    const host = new URL(entorno.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname
    const m = /^([a-z0-9]{20})\.supabase\.co$/.exec(host)
    return m ? m[1] : null
  } catch {
    return null
  }
}

export type ErrorGestion = { tipo: "autenticacion" | "permisos" | "no_encontrado" | "limite" | "red" | "servidor" | "respuesta"; mensaje: string }

function clasificar(status: number): ErrorGestion {
  if (status === 401) return { tipo: "autenticacion", mensaje: "El token de Supabase no es válido o venció (SUPABASE_ACCESS_TOKEN)." }
  if (status === 403) return { tipo: "permisos", mensaje: "El token no tiene permiso para la configuración de Auth de este proyecto." }
  if (status === 404) return { tipo: "no_encontrado", mensaje: "No se encontró el proyecto (revisa SUPABASE_PROJECT_REF)." }
  if (status === 429) return { tipo: "limite", mensaje: "Límite de peticiones de la Management API. Inténtalo en un minuto." }
  return { tipo: "servidor", mensaje: `La Management API respondió ${status}.` }
}

type Fetch = typeof fetch

async function pedir(f: Fetch, url: string, token: string, init: RequestInit = {}): Promise<{ ok: true; datos: Record<string, unknown> } | { ok: false; error: ErrorGestion }> {
  let r: Response
  try {
    r = await f(url, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) }, signal: AbortSignal.timeout(20_000) })
  } catch {
    return { ok: false, error: { tipo: "red", mensaje: "No se pudo conectar con api.supabase.com." } }
  }
  if (!r.ok) return { ok: false, error: clasificar(r.status) }
  try {
    const datos = (await r.json()) as unknown
    return datos && typeof datos === "object" ? { ok: true, datos: datos as Record<string, unknown> } : { ok: false, error: { tipo: "respuesta", mensaje: "Respuesta inesperada de la Management API." } }
  } catch {
    return { ok: false, error: { tipo: "respuesta", mensaje: "Respuesta inesperada de la Management API." } }
  }
}

export function leerConfigAuth(ref: string, token: string, f: Fetch = fetch) {
  return pedir(f, `${API_GESTION}/projects/${ref}/config/auth`, token)
}

export function actualizarConfigAuth(ref: string, token: string, cuerpo: Record<string, string>, f: Fetch = fetch) {
  for (const k of Object.keys(cuerpo)) if (!CLAVES_PERMITIDAS.has(k)) throw new Error(`Clave no permitida: ${k}`)
  return pedir(f, `${API_GESTION}/projects/${ref}/config/auth`, token, { method: "PATCH", body: JSON.stringify(cuerpo) })
}

/** Solo las claves gestionadas (para el respaldo local previo a aplicar). */
export function copiaGestionada(remoto: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries([...CLAVES_PERMITIDAS].map((k) => [k, remoto[k] ?? null]))
}

/** Resumen seguro de configuraciones que se conservan (sin valores sensibles). */
export function resumenConservado(remoto: Record<string, unknown>): string[] {
  return [
    `SMTP personalizado: ${remoto.smtp_host ? `sí (${String(remoto.smtp_host)})` : "no configurado"}`,
    `Remitente SMTP: ${remoto.smtp_admin_email ? String(remoto.smtp_admin_email) : "—"}${remoto.smtp_sender_name ? ` · ${String(remoto.smtp_sender_name)}` : ""}`,
    `Confirmación obligatoria de correo: ${remoto.mailer_autoconfirm === true ? "desactivada" : remoto.mailer_autoconfirm === false ? "ACTIVADA" : "—"} (no se modifica)`,
  ]
}
