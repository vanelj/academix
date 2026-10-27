/**
 * Interruptor de la revisión manual de comprobantes (revisar_pago).
 *
 * Se mantiene en false hasta verificar en la base real la definición de
 * revisar_pago, los disparadores de anular_matricula_v5 y las políticas
 * del bucket (docs/diagnostico), y probar con comprobantes de prueba
 * autorizados y sesiones reales.
 * Lo comprueba la acción del servidor, no solo la interfaz: cambiarlo exige
 * modificar el código y desplegar.
 */
export const REVISION_PAGOS_HABILITADA = false

export const MOTIVO_REVISION_DESHABILITADA =
  "La aprobación y el rechazo de comprobantes están deshabilitados temporalmente mientras se verifican las protecciones de la base de datos (estado del grupo, anulación de matrículas y cuotas). Puedes consultar el comprobante y sus datos."

/** Bucket privado de V5 para comprobantes (ruta <estudiante_id>/<archivo>). */
export const BUCKET_COMPROBANTES = "comprobantes-cursos-v5"

/** Vigencia de los enlaces firmados a comprobantes, en segundos. */
export const VIGENCIA_ENLACE_COMPROBANTE = 120

/** Límites del bucket (V5): 5 MB; JPG, PNG o PDF. La extensión sale del tipo, no del nombre del archivo. */
export const TAMANO_MAX_COMPROBANTE = 5 * 1024 * 1024
export const TIPOS_COMPROBANTE = { "image/jpeg": "jpg", "image/png": "png", "application/pdf": "pdf" } as const
export type TipoComprobante = keyof typeof TIPOS_COMPROBANTE

/** Firma (primeros bytes) de cada tipo admitido: evita archivos renombrados. */
export function tipoPorFirma(bytes: Uint8Array): TipoComprobante | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg"
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png"
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return "application/pdf"
  return null
}
