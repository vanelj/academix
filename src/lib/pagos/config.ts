/**
 * Interruptor de la revisión manual de comprobantes (revisar_pago).
 *
 * ACTIVADO el 06-11-2026 a pedido de la institución, para la compra de cursos
 * (pago completo con comprobante verificado por la institución, sin pasarela).
 * Antes de usarlo con pagos reales:
 *   1. Aplicar docs/migraciones/solicitudes_estado_grupo_v5.sql (impide aprobar
 *      un pago en un grupo cancelado o cerrado: revisar_pago no lo comprueba).
 *   2. Probar con cuentas de prueba (docs/diagnostico/pruebas_pagos_v5.sql y el
 *      flujo completo desde la app).
 * Lo comprueba la acción del servidor, no solo la interfaz: cambiarlo exige
 * modificar el código y desplegar.
 */
export const REVISION_PAGOS_HABILITADA = true

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
