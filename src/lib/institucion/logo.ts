/**
 * Reglas del logotipo institucional (navegador y servidor).
 * Deben coincidir con el bucket definido en
 * docs/migraciones/storage_logos_instituciones.sql.
 */

export const BUCKET_LOGOS = "logos-instituciones"
export const LOGO_MAX_BYTES = 2 * 1024 * 1024 // 2 MB
export const LOGO_FORMATOS_TEXTO = "PNG, JPG o WebP"
/** Para el atributo accept del selector de archivos (solo orientativo). */
export const LOGO_ACCEPT = "image/png,image/jpeg,image/webp"

export type TipoLogo = { mime: "image/png" | "image/jpeg" | "image/webp"; extension: "png" | "jpg" | "webp" }

/**
 * Tipo real de la imagen según su firma binaria ("magic bytes"), sin confiar en
 * la extensión ni en el MIME que declara el navegador.
 */
export function detectarTipoLogo(bytes: Uint8Array): TipoLogo | null {
  const coincide = (firma: number[], desde = 0) =>
    bytes.length >= desde + firma.length && firma.every((b, i) => bytes[desde + i] === b)

  if (coincide([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { mime: "image/png", extension: "png" }
  }
  if (coincide([0xff, 0xd8, 0xff])) {
    return { mime: "image/jpeg", extension: "jpg" }
  }
  // WebP: "RIFF" + 4 bytes de tamaño + "WEBP"
  if (coincide([0x52, 0x49, 0x46, 0x46]) && coincide([0x57, 0x45, 0x42, 0x50], 8)) {
    return { mime: "image/webp", extension: "webp" }
  }
  return null
}

/** Valida un archivo de logo; devuelve su tipo real o un mensaje de error. */
export async function validarArchivoLogo(
  archivo: Blob
): Promise<{ ok: true; tipo: TipoLogo } | { ok: false; mensaje: string }> {
  if (archivo.size === 0) return { ok: false, mensaje: "El archivo está vacío." }
  if (archivo.size > LOGO_MAX_BYTES) {
    return { ok: false, mensaje: "El logotipo supera el tamaño máximo de 2 MB." }
  }
  const cabecera = new Uint8Array(await archivo.slice(0, 16).arrayBuffer())
  const tipo = detectarTipoLogo(cabecera)
  if (!tipo) {
    return { ok: false, mensaje: `Formato no permitido. Usa una imagen ${LOGO_FORMATOS_TEXTO}.` }
  }
  return { ok: true, tipo }
}

/**
 * Ruta interna del objeto a partir de la URL pública guardada en logo_url, solo
 * si pertenece al bucket de logos y a la carpeta de la institución indicada.
 * Así nunca se intenta borrar un archivo ajeno ni una URL externa.
 */
export function rutaLogoDeInstitucion(
  logoUrl: string | null,
  institucionId: string,
  supabaseUrl: string
): string | null {
  if (!logoUrl) return null
  const prefijo = `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/${BUCKET_LOGOS}/`
  if (!logoUrl.startsWith(prefijo)) return null
  const ruta = decodeURIComponent(logoUrl.slice(prefijo.length).split("?")[0])
  return ruta.startsWith(`${institucionId}/`) && !ruta.includes("..") ? ruta : null
}
