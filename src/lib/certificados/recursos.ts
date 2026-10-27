import sharp from "sharp"

import { SITIO_URL } from "@/lib/correos/config"
import { BUCKET_RECURSOS } from "@/lib/certificados/config"
import type { ValoresCertificado } from "@/lib/certificados/diseno"
import { createClient } from "@/lib/supabase/server"

/**
 * Recursos de imagen para el PDF (SOLO servidor).
 *
 * - Logotipo: URL pública del bucket logos-instituciones. Solo se descarga si
 *   el host es el del proyecto Supabase (sin descargas a sitios arbitrarios),
 *   con límite de tiempo y de tamaño.
 * - Fondo y firma: bucket PRIVADO certificados-recursos, con la sesión del
 *   administrador (la política solo permite su carpeta). Nunca se exponen con
 *   enlaces públicos.
 * - Las imágenes se normalizan a PNG con sharp (también convierte WebP).
 */

const MAX_BYTES = 6 * 1024 * 1024

async function normalizarPng(bytes: Uint8Array, maxLado: number): Promise<Uint8Array | null> {
  try {
    const salida = await sharp(bytes, { limitInputPixels: 40_000_000 })
      .rotate()
      .resize({ width: maxLado, height: maxLado, fit: "inside", withoutEnlargement: true })
      .png()
      .toBuffer()
    return new Uint8Array(salida)
  } catch {
    return null
  }
}

export async function cargarLogo(url: string | null | undefined): Promise<Uint8Array | null> {
  if (!url) return null
  try {
    const destino = new URL(url)
    const propio = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")
    if (destino.protocol !== "https:" || destino.host !== propio.host || !destino.pathname.startsWith("/storage/v1/object/public/")) return null
    const r = await fetch(destino, { signal: AbortSignal.timeout(8000), cache: "no-store" })
    if (!r.ok) return null
    const bytes = new Uint8Array(await r.arrayBuffer())
    if (bytes.byteLength > MAX_BYTES) return null
    return normalizarPng(bytes, 900)
  } catch {
    return null
  }
}

async function descargar(ruta: string): Promise<Uint8Array | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.storage.from(BUCKET_RECURSOS).download(ruta)
  if (error || !data || data.size > MAX_BYTES) return null
  return new Uint8Array(await data.arrayBuffer())
}

export async function cargarFirma(ruta: string | null | undefined): Promise<Uint8Array | null> {
  if (!ruta) return null
  const bytes = await descargar(ruta)
  return bytes ? normalizarPng(bytes, 1200) : null
}

export async function cargarFondo(
  ruta: string | null | undefined,
  tipo: string | null | undefined
): Promise<{ bytes: Uint8Array; tipo: "image/png" | "image/jpeg" | "application/pdf" } | null> {
  if (!ruta || !tipo) return null
  const bytes = await descargar(ruta)
  if (!bytes) return null
  if (tipo === "application/pdf") {
    // Firma %PDF: no se procesa un archivo que no lo sea.
    return bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 ? { bytes, tipo } : null
  }
  const png = await normalizarPng(bytes, 3508) // A4 a 300 ppp en el lado mayor
  return png ? { bytes: png, tipo: "image/png" } : null
}

export const urlVerificacion = (codigo: string) => `${SITIO_URL}/verificar/${encodeURIComponent(codigo)}`

const fechaLarga = (v: unknown) => {
  if (typeof v !== "string" || !v) return null
  const solo = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v)
  const d = solo ? new Date(Date.UTC(+solo[1], +solo[2] - 1, +solo[3], 12)) : new Date(v)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString("es-PE", { day: "numeric", month: "long", year: "numeric", timeZone: solo ? "UTC" : "America/Lima" })
}

/** Valores de los marcadores a partir de la copia fija guardada al emitir. */
export function valoresDesdeContenido(datos: Record<string, unknown>): ValoresCertificado {
  const txt = (k: string) => (typeof datos[k] === "string" && (datos[k] as string).trim() ? (datos[k] as string).trim() : null)
  const num = (k: string) => (datos[k] === null || datos[k] === undefined || datos[k] === "" ? null : Number(datos[k]))
  const horas = num("horas")
  const promedio = num("promedio")
  const codigo = txt("codigo")
  return {
    estudiante: txt("estudiante"),
    curso: txt("curso"),
    institucion: txt("institucion"),
    grupo: txt("grupo"),
    horas: horas && Number.isFinite(horas) ? String(horas) : null,
    fecha_inicio: fechaLarga(datos.fecha_inicio),
    fecha_fin: fechaLarga(datos.fecha_fin),
    fecha_emision: fechaLarga(datos.fecha_emision),
    promedio: promedio !== null && Number.isFinite(promedio) ? promedio.toFixed(2) : null,
    firmante: txt("firmante"),
    cargo: txt("cargo"),
    codigo,
    url_verificacion: codigo ? urlVerificacion(codigo).replace(/^https?:\/\//, "") : null,
  }
}
