/**
 * Reglas del QR de Yape/Plin (navegador y servidor).
 * Deben coincidir con el bucket de docs/migraciones/qr_medios_cobro_v5.sql.
 */

export const BUCKET_QR = "qr-medios-cobro"
export const QR_MAX_BYTES = 2 * 1024 * 1024
export const QR_ACCEPT = "image/jpeg,image/png,image/webp"

/**
 * Ruta interna del objeto a partir de la URL pública guardada en qr_url, solo
 * si pertenece al bucket, a la institución y al medio indicados (nunca se
 * intenta borrar un archivo ajeno ni una URL externa).
 */
export function rutaQrDeMedio(qrUrl: string | null, institucionId: string, medioId: string, supabaseUrl: string): string | null {
  if (!qrUrl) return null
  const prefijo = `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/${BUCKET_QR}/`
  if (!qrUrl.startsWith(prefijo)) return null
  let ruta: string
  try {
    ruta = decodeURIComponent(qrUrl.slice(prefijo.length).split("?")[0])
  } catch {
    return null
  }
  return ruta.startsWith(`${institucionId}/${medioId}/`) && !ruta.includes("..") ? ruta : null
}

/** Solo se muestran imágenes servidas por https (la URL viene de la BD, pero se valida igual). */
export function urlQrSegura(qrUrl: string | null | undefined): string | null {
  if (!qrUrl) return null
  try {
    const u = new URL(qrUrl)
    return u.protocol === "https:" && u.pathname.includes(`/storage/v1/object/public/${BUCKET_QR}/`) ? u.toString() : null
  } catch {
    return null
  }
}
