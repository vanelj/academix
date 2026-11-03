import { detectarTipoLogo, type TipoLogo } from "@/lib/institucion/logo"

/**
 * Reglas de la portada del curso (navegador y servidor).
 * Deben coincidir con el bucket de docs/migraciones/portadas_cursos_v5.sql.
 */

export const BUCKET_PORTADAS = "portadas-cursos"
/** Tamaño máximo del archivo que se sube (el bucket rechaza más de 3 MB). */
export const PORTADA_MAX_BYTES = 3 * 1024 * 1024
/** Tamaño máximo de la imagen original elegida (se recorta y recomprime antes de subir). */
export const PORTADA_ORIGINAL_MAX_BYTES = 10 * 1024 * 1024
export const PORTADA_FORMATOS_TEXTO = "JPG, PNG o WebP"
export const PORTADA_ACCEPT = "image/jpeg,image/png,image/webp"
/** Proporción de las tarjetas del catálogo y de la ficha (16:9). */
export const PORTADA_ANCHO = 1600
export const PORTADA_ALTO = 900
/** Lado menor mínimo recomendado para que la portada no se vea pixelada. */
export const PORTADA_MIN_LADO = 600

/** Tipo real del archivo por su firma binaria (mismos formatos que los logotipos). */
export const detectarTipoPortada = (bytes: Uint8Array): TipoLogo | null => detectarTipoLogo(bytes)

export async function validarArchivoPortada(
  archivo: Blob,
  maxBytes = PORTADA_MAX_BYTES
): Promise<{ ok: true; tipo: TipoLogo } | { ok: false; mensaje: string }> {
  if (archivo.size === 0) return { ok: false, mensaje: "El archivo está vacío." }
  if (archivo.size > maxBytes) {
    return { ok: false, mensaje: `La imagen supera el tamaño máximo de ${Math.round(maxBytes / 1024 / 1024)} MB.` }
  }
  const tipo = detectarTipoPortada(new Uint8Array(await archivo.slice(0, 16).arrayBuffer()))
  if (!tipo) return { ok: false, mensaje: `Formato no permitido. Usa una imagen ${PORTADA_FORMATOS_TEXTO}.` }
  return { ok: true, tipo }
}

/**
 * Ruta interna del objeto a partir de la URL pública guardada en portada_url,
 * solo si pertenece al bucket de portadas, a la institución y al curso indicados.
 * Así nunca se intenta borrar un archivo ajeno ni una URL externa.
 */
export function rutaPortadaDeCurso(
  portadaUrl: string | null,
  institucionId: string,
  cursoId: string,
  supabaseUrl: string
): string | null {
  if (!portadaUrl) return null
  const prefijo = `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/${BUCKET_PORTADAS}/`
  if (!portadaUrl.startsWith(prefijo)) return null
  let ruta: string
  try {
    ruta = decodeURIComponent(portadaUrl.slice(prefijo.length).split("?")[0])
  } catch {
    return null
  }
  return ruta.startsWith(`${institucionId}/${cursoId}/`) && !ruta.includes("..") ? ruta : null
}
